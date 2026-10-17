// SBD-6 (v1): the interactions endpoint — 401 on a bad signature, PONG, placeholder reply, caught exceptions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { POST } from '../api/interactions.ts';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUBLIC_HEX = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
const TS = '1792200000';

const request = (body: string, signed = true): Request =>
  new Request('https://example.test/api/interactions', {
    method: 'POST',
    headers: signed
      ? { 'x-signature-ed25519': sign(null, Buffer.from(TS + body), privateKey).toString('hex'), 'x-signature-timestamp': TS }
      : {},
    body,
  });

async function withKey<T>(key: string | undefined, run: () => Promise<T>): Promise<T> {
  const before = process.env.DISCORD_PUBLIC_KEY;
  if (key === undefined) delete process.env.DISCORD_PUBLIC_KEY;
  else process.env.DISCORD_PUBLIC_KEY = key;
  try {
    return await run();
  } finally {
    if (before === undefined) delete process.env.DISCORD_PUBLIC_KEY;
    else process.env.DISCORD_PUBLIC_KEY = before;
  }
}
async function quietly<T>(run: () => Promise<T>): Promise<{ result: T; logged: unknown[][] }> {
  const logged: unknown[][] = [];
  const { error, log } = console;
  console.error = (...args: unknown[]) => void logged.push(args);
  console.log = () => {};
  try {
    return { result: await run(), logged };
  } finally {
    console.error = error;
    console.log = log;
  }
}

test('an unsigned POST → 401 with an empty body', async () => {
  const { result: res } = await quietly(() => withKey(PUBLIC_HEX, () => POST(request('{"type":1}', false))));
  assert.equal(res.status, 401);
  assert.equal(await res.text(), '');
});

test('a POST signed with another key → 401', async () => {
  const other = generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  const { result: res } = await quietly(() => withKey(other, () => POST(request('{"type":1}'))));
  assert.equal(res.status, 401);
});

test('a signed PING → 200 {"type":1}', async () => {
  const { result: res } = await quietly(() => withKey(PUBLIC_HEX, () => POST(request('{"type":1,"id":"1"}'))));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/json');
  assert.deepEqual(await res.json(), { type: 1 });
});

test('an interaction type the bot does not handle (modal submit) → ephemeral "Not built yet."', async () => {
  const { result: res } = await quietly(() => withKey(PUBLIC_HEX, () => POST(request('{"type":5,"data":{"custom_id":"m"}}'))));
  assert.deepEqual(await res.json(), { type: 4, data: { content: 'Not built yet.', flags: 64, allowed_mentions: { parse: [] } } });
});

test('a signed /verse goes through the handlers to a public card (SBD-8)', async () => {
  const body = JSON.stringify({ type: 2, data: { name: 'verse', options: [{ name: 'reference', type: 3, value: 'alma 32:21' }] } });
  const { result: res } = await quietly(() => withKey(PUBLIC_HEX, () => POST(request(body))));
  const json = await res.json();
  assert.equal(json.type, 4);
  assert.equal(json.data.embeds[0].title, 'Alma 32:21');
  assert.equal(json.data.flags, undefined);
});

test('a signed button press edits the message in place (SBD-8)', async () => {
  const body = JSON.stringify({ type: 3, data: { custom_id: 'c:1:3:1nephi', component_type: 2 }, message: { content: '' } });
  const { result: res } = await quietly(() => withKey(PUBLIC_HEX, () => POST(request(body))));
  const json = await res.json();
  assert.equal(json.type, 7);
  assert.match(json.data.embeds[0].footer.text, /^1 Nephi 3 · page 2 of \d+$/);
});

test('an exception → ephemeral "Something went wrong. Try again." and console.error', async () => {
  const { result: res, logged } = await quietly(() => withKey(PUBLIC_HEX, () => POST(request('{not json'))));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.content, 'Something went wrong. Try again.');
  assert.equal(logged.length, 1);
});

test('a missing DISCORD_PUBLIC_KEY → 401 and a console.error naming it', async () => {
  const { result: res, logged } = await quietly(() => withKey(undefined, () => POST(request('{"type":1}'))));
  assert.equal(res.status, 401);
  assert.ok(logged.some((args) => String(args[0]).includes('DISCORD_PUBLIC_KEY')));
});

test('a signed autocomplete (type 4) → type 8 with the reference suggestions (SBD-11)', async () => {
  const body = JSON.stringify({ type: 4, data: { name: 'verse', options: [{ name: 'reference', type: 3, value: 'jsh', focused: true }] } });
  const { result: res } = await quietly(() => withKey(PUBLIC_HEX, () => POST(request(body))));
  assert.deepEqual(await res.json(), { type: 8, data: { choices: [{ name: 'Joseph Smith—History · Pearl of Great Price · 1 chapter', value: 'Joseph Smith—History' }] } });
});
