// SBD-7 (v1): command registration — the M1 command set against Discord's documented rules, and the PUT request
// and printed lines against a fake fetch (no token, no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMMANDS, register } from '../scripts/register-commands.ts';

const ENV = { DISCORD_APPLICATION_ID: '111122223333', DISCORD_GUILD_ID: '444455556666', DISCORD_BOT_TOKEN: 'tok.en.SECRET' };
// Discord: "CHAT_INPUT command names and command option names must match ^[-_ʼ\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$"
// and use the lowercase variant of any letter; descriptions are 1-100 characters.
const NAME = /^[-_ʼ\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;

type Call = { url: string; init: RequestInit };
function fakeFetch(status: number, body: unknown, calls: Call[]): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}
const echo = (init: RequestInit): { name: string }[] => JSON.parse(String(init.body)) as { name: string }[];

test('the set is /verse, /chapter, /define (one required string option each) and /help (none, v1.1)', () => {
  assert.deepEqual(
    COMMANDS.map((c) => [c.type, c.name, c.options.map((o) => [o.type, o.name, o.required])]),
    [
      [1, 'verse', [[3, 'reference', true]]],
      [1, 'chapter', [[3, 'reference', true]]],
      [1, 'define', [[3, 'word', true]]],
      [1, 'help', []],
    ],
  );
});

test('/define word has max_length 40; no option has autocomplete yet (SBD-11)', () => {
  assert.equal(COMMANDS[2].options[0].max_length, 40);
  for (const c of COMMANDS) for (const o of c.options) assert.equal('autocomplete' in o, false, `${c.name} ${o.name}`);
});

test('names and descriptions follow Discord\'s rules', () => {
  for (const c of COMMANDS) {
    for (const item of [c, ...c.options]) {
      assert.match(item.name, NAME, item.name);
      assert.equal(item.name, item.name.toLowerCase(), item.name);
      assert.ok(item.description.length >= 1 && item.description.length <= 100, item.description);
    }
  }
});

test('the descriptions are the approved wording', () => {
  assert.deepEqual(COMMANDS.map((c) => [c.description, c.options[0]?.description]), [
    ['Look up verses: one, a range, or several separated by commas', 'e.g. Alma 32:21, Alma 32:21-23, or D&C 4:2, Moroni 10:4'],
    ['Read a whole chapter', 'e.g. 1 Nephi 3 or Kirtland Era 20'],
    ["Look up a word in Webster's 1828 dictionary", 'One word, e.g. faith'],
    ['Show all commands and how to use them', undefined],
  ]);
});

test('register PUTs the whole set to the guild endpoint with the bot token and Discord\'s User-Agent', async () => {
  const calls: Call[] = [];
  const result = await register(ENV, fakeFetch(200, COMMANDS.map((c) => ({ ...c, id: '9', application_id: ENV.DISCORD_APPLICATION_ID, guild_id: ENV.DISCORD_GUILD_ID })), calls));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://discord.com/api/v10/applications/111122223333/guilds/444455556666/commands');
  assert.equal(calls[0].init.method, 'PUT');
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get('authorization'), 'Bot tok.en.SECRET');
  assert.equal(headers.get('content-type'), 'application/json');
  assert.match(headers.get('user-agent') ?? '', /^DiscordBot \(https:\/\/github\.com\/kepz94\/scribal-discord-bot, 1\.0\.0\)$/);
  assert.deepEqual(echo(calls[0].init), JSON.parse(JSON.stringify(COMMANDS)));
  assert.equal(result.ok, true);
  assert.deepEqual(result.lines, ['Discord answered 200', 'Registered: /verse, /chapter, /define, /help']);
});

test('printed lines never carry the token or an ID', async () => {
  for (const [status, body] of [
    [200, COMMANDS.map((c) => ({ ...c, application_id: ENV.DISCORD_APPLICATION_ID, guild_id: ENV.DISCORD_GUILD_ID }))],
    [401, { message: '401: Unauthorized', code: 0 }],
    [400, { message: 'Invalid Form Body', code: 50035, errors: { '0': { name: { _errors: [{ code: 'X', message: 'bad' }] } } } }],
  ] as [number, unknown][]) {
    const { lines } = await register(ENV, fakeFetch(status, body, []));
    const text = lines.join('\n');
    for (const secret of Object.values(ENV)) assert.ok(!text.includes(secret), `${status}: ${secret}`);
  }
});

test('an error answer fails with Discord\'s message and code', async () => {
  const result = await register(ENV, fakeFetch(401, { message: '401: Unauthorized', code: 0 }, []));
  assert.equal(result.ok, false);
  assert.deepEqual(result.lines, ['Discord answered 401', 'Error: 401: Unauthorized (code 0)']);
});

test('a 200 whose command names differ from the set fails', async () => {
  const result = await register(ENV, fakeFetch(200, [{ name: 'verse' }], []));
  assert.equal(result.ok, false);
  assert.equal(result.lines.at(-1), 'Registered: /verse — expected /verse, /chapter, /define, /help');
});

test('a missing secret fails before any request, naming the variable only', async () => {
  const calls: Call[] = [];
  const result = await register({ ...ENV, DISCORD_BOT_TOKEN: '' }, fakeFetch(200, [], calls));
  assert.equal(calls.length, 0);
  assert.deepEqual(result, { ok: false, lines: ['Missing DISCORD_BOT_TOKEN'] });
});

test('the workflow runs only by hand, on Node 24, with the three secrets', () => {
  const yml = readFileSync(new URL('../.github/workflows/register.yml', import.meta.url), 'utf8');
  assert.match(yml, /^on:\n {2}workflow_dispatch:\s*$/m);
  assert.doesNotMatch(yml, /^\s+(push|pull_request|schedule):/m);
  assert.match(yml, /node-version: '24'/);
  assert.match(yml, /run: node scripts\/register-commands\.ts/);
  for (const name of ['DISCORD_APPLICATION_ID', 'DISCORD_GUILD_ID', 'DISCORD_BOT_TOKEN']) {
    assert.match(yml, new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`));
  }
});
