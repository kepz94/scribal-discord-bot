// SBD-8 (v1): command and button handlers against the Architecture's deterministic map — every M1 acceptance case,
// pressing the very buttons a reply carries, and every stale-button path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWebster } from '../src/library.ts';
import { handle, type Interaction, type InteractionResponse } from '../src/handlers.ts';

const STALE = "That page isn't available any more. Run the command again.";
const MOCKUP_12 = 'd&c 4:2, moroni 10:4, jsh 1:17, ' + Array.from({ length: 9 }, (_, i) => `alma 32:${18 + i}`).join(', ');

const command = (name: string, value?: string, option = name === 'define' ? 'word' : 'reference'): Interaction => ({
  type: 2,
  data: { name, options: value === undefined ? [] : [{ name: option, type: 3, value }] },
});
const run = (name: string, value?: string): InteractionResponse => handle(command(name, value));
const titles = (r: InteractionResponse): string[] => (r.data.embeds ?? []).map((e) => e.title);
const buttons = (r: InteractionResponse) => r.data.components?.[0]?.components ?? [];
const press = (r: InteractionResponse, label: RegExp): InteractionResponse => {
  const b = buttons(r).find((x) => label.test(x.label));
  assert.ok(b, `no button ${label}`);
  assert.equal(b.disabled, false, `${b.label} is disabled`);
  return handle({ type: 3, data: { custom_id: b.custom_id, component_type: 2 }, message: { content: r.data.content ?? '' } });
};
const isPublic = (r: InteractionResponse): void => {
  assert.equal(r.type, 4);
  assert.equal(r.data.flags, undefined);
};
const isEphemeral = (r: InteractionResponse, text: string): void => {
  assert.equal(r.type, 4);
  assert.equal(r.data.flags, 64);
  assert.equal(r.data.content, text);
};

// Acceptance 1–9 (the live versions are Kepu's M1 sitting)
test('1: /verse alma 32:21 → one public card, no buttons', () => {
  const r = run('verse', 'alma 32:21');
  isPublic(r);
  assert.deepEqual(titles(r), ['Alma 32:21']);
  assert.equal(r.data.components, undefined);
});

test('2: /verse d&c 4:2, moroni 10:4, jsh 1:17 → 3 cards in order, no buttons', () => {
  const r = run('verse', 'd&c 4:2, moroni 10:4, jsh 1:17');
  isPublic(r);
  assert.deepEqual(titles(r), ['D&C 4:2', 'Moroni 10:4', 'Joseph Smith—History 1:17']);
  assert.equal(r.data.components, undefined);
  assert.equal(r.data.content, undefined);
});

test('3: the 12-reference list → reading list on every page; Next walks all 12 in order; Prev returns (v1.1)', () => {
  const first = run('verse', MOCKUP_12);
  isPublic(first);
  const count = Number(/^\*\*Reading list\*\* · 12 references · page 1 of (\d+)\n/.exec(first.data.content ?? '')?.[1]);
  assert.ok(count >= 2);
  assert.ok(titles(first).length < 10, 'the page size, not the 10-card cap, decides the split');
  const seen = [...titles(first)];
  let r = first;
  for (let page = 2; page <= count; page++) {
    const prev = r;
    r = press(r, /Next/);
    assert.equal(r.type, 7);
    assert.match(r.data.content ?? '', new RegExp(`^\\*\\*Reading list\\*\\* · 12 references · page ${page} of ${count}\\n`));
    seen.push(...titles(r));
    const back = press(r, /Prev/);
    assert.deepEqual(titles(back), titles(prev));
  }
  assert.equal(buttons(r)[1].disabled, true);
  assert.deepEqual(seen, ['D&C 4:2', 'Moroni 10:4', 'Joseph Smith—History 1:17', ...Array.from({ length: 9 }, (_, i) => `Alma 32:${18 + i}`)]);
});

test('4: /verse alma 32:1-43 pages like /chapter and never leaves Alma 32', () => {
  let r = run('verse', 'alma 32:1-43');
  isPublic(r);
  const seen = [...titles(r)];
  while (buttons(r)[1] && !buttons(r)[1].disabled) {
    r = press(r, /Next/);
    assert.equal(r.type, 7);
    seen.push(...titles(r));
  }
  assert.ok(seen.length >= 2);
  for (const t of seen) assert.match(t, /^Alma 32:\d+(–\d+)?$/);
  assert.match(r.data.embeds?.[0].footer?.text ?? '', /^Alma 32 · page (\d+) of \1$/);
});

test('5: /chapter 1 nephi 3 → pages with Prev/Next and never leaves 1 Nephi 3', () => {
  let r = run('chapter', '1 nephi 3');
  isPublic(r);
  assert.equal(buttons(r)[0].disabled, true);
  const seen = [...titles(r)];
  while (!buttons(r)[1].disabled) {
    r = press(r, /Next/);
    seen.push(...titles(r));
  }
  for (const t of seen) assert.match(t, /^1 Nephi 3:\d+(–\d+)?$/);
  assert.match(seen.at(-1) ?? '', /–31$|:31$/);
});

test('6: /verse kirtland era 1:1 → title Nov., 1831, footer Source: DHC 1:235-236', () => {
  const r = run('verse', 'kirtland era 1:1');
  assert.deepEqual(titles(r), ['Nov., 1831']);
  assert.equal(r.data.embeds?.[0].footer?.text, 'Source: DHC 1:235-236');
});

test('7: /verse kirtland era 1:34 → only the sender sees the error', () => {
  isEphemeral(run('verse', 'kirtland era 1:34'), '**Kirtland Era 1** has 1 verse.');
});

test('8: crossChapter and noVerse give their exact texts, only to the sender', () => {
  isEphemeral(run('verse', 'alma 32:43-33:2'), 'A range stays within one chapter. Use two references or /chapter.');
  isEphemeral(run('verse', 'alma 32'), 'Add a verse number, or use /chapter.');
});

test('9: /define faith → Webster entry; /define zzz → the no-entry text', () => {
  const r = run('define', 'faith');
  isPublic(r);
  assert.equal(r.data.embeds?.[0].author?.name, "Webster's 1828 Dictionary");
  assert.equal(r.data.embeds?.[0].title, 'faith');
  isEphemeral(run('define', 'zzz'), 'No entry for “zzz” in Webster\'s 1828.');
});

// The rest of the deterministic map
test('/define lowercases and trims the word', () => {
  assert.equal(run('define', '  Faith ').data.embeds?.[0].title, 'faith');
});

test('/define escapes markdown in the echoed word', () => {
  isEphemeral(run('define', 'zz*z'), 'No entry for “zz\\*z” in Webster\'s 1828.');
});

test('/define of a long entry pages and its buttons turn the page', () => {
  const entry = loadWebster('hand');
  assert.ok(entry);
  const first = run('define', 'hand');
  assert.ok(buttons(first).length === 2);
  const next = press(first, /Next/);
  assert.equal(next.type, 7);
  assert.equal(next.data.embeds?.[0].footer?.text, `page 2 of ${/of (\d+)$/.exec(first.data.embeds?.[0].footer?.text ?? '')?.[1]}`);
});

test('/chapter errors are ephemeral with errorText', () => {
  isEphemeral(run('chapter', 'alma 70'), '**Alma** has 63 chapters.');
  isEphemeral(run('chapter', 'Doctrine and Covenants 4'), 'No book called **Doctrine and Covenants**.');
});

test('a list too long for one message is refused before posting', () => {
  const input = Array.from({ length: 200 }, (_, i) => `alma 32:${(i % 43) + 1}`).join(', ');
  isEphemeral(run('verse', input), 'That list is too long for one message. Split it into two commands.');
});

test('a missing option reads as empty input → malformed', () => {
  assert.equal(run('verse').data.flags, 64);
  assert.match(run('verse').data.content ?? '', /^Couldn't read “” as a reference\./);
});

test('/help → one public card "Scribal Bot — commands", no buttons (v1.1)', () => {
  const r = run('help');
  isPublic(r);
  assert.deepEqual(titles(r), ['Scribal Bot — commands']);
  assert.equal(r.data.components, undefined);
  assert.equal(r.data.embeds?.[0].author, undefined);
});

test('an unknown command → "Not built yet." (M2 commands arrive later)', () => {
  isEphemeral(run('search', 'faith'), 'Not built yet.');
});

// Stale or unreadable buttons
const pressId = (custom_id: string, content = ''): InteractionResponse =>
  handle({ type: 3, data: { custom_id, component_type: 2 }, message: { content } });

test('a malformed custom_id → the stale-page text', () => isEphemeral(pressId('garbage'), STALE));
test('a chapter page past the end → stale', () => isEphemeral(pressId('c:9:3:1nephi'), STALE));
test('a chapter of an unknown book → stale', () => isEphemeral(pressId('c:0:1:nosuchbook'), STALE));
test('a chapter number past the book → stale', () => isEphemeral(pressId('c:0:99:1nephi'), STALE));
test('a range outside its chapter → stale', () => isEphemeral(pressId('r:0:32:1:99:alma'), STALE));
test('a list press on a message with no reading list → stale', () => isEphemeral(pressId('l:1', 'hello'), STALE));
test('a list whose reading list no longer resolves → stale', () => {
  isEphemeral(pressId('l:1', '**Reading list** · 2 references · page 1 of 2\nAlma 32:21 · Nosuchbook 1:1'), STALE);
});
test('a list page past the end → stale', () => {
  const first = run('verse', MOCKUP_12);
  isEphemeral(pressId('l:5', first.data.content), STALE);
});
test('a define word with no entry → stale', () => isEphemeral(pressId('d:1:zzz'), STALE));
test('a search button (M2) → stale for now', () => isEphemeral(pressId('s:1:-:faith'), STALE));
test('a component with no custom_id → stale', () => isEphemeral(handle({ type: 3, data: {} }), STALE));
