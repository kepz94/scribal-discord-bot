// SBD-11 (v1 M2): suggest() for /verse and /chapter references, and the type 4 → type 8 autocomplete response.
// Layout: mockup v4 "Typing a reference" with Kepu's 2026-10-17 decisions (book suggestions as in the mockup; a
// comma list shows the whole list in the name and keeps the earlier part in the value).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autocomplete, suggest } from '../src/autocomplete.ts';
import { filesRead, loadIndex } from '../src/library.ts';
import { LIMITS } from '../src/limits.ts';
import { resolveChapter, resolveList } from '../src/reference.ts';

const values = (input: string): string[] => suggest(input).map((c) => c.value);

test('kirtland era → its first 25 sermons: "Era N · date · first words", cut to the name limit', () => {
  const s = suggest('kirtland era');
  assert.equal(s.length, 25);
  assert.deepEqual(s.map((c) => c.value), Array.from({ length: 25 }, (_, i) => `Kirtland Era ${i + 1}`));
  assert.ok(s[0].name.startsWith('Kirtland Era 1 · Nov., 1831 · My time was occupied'), s[0].name);
  assert.ok(s[0].name.endsWith('…'));
  assert.equal(s[0].name.length, LIMITS.choiceName);
  assert.equal(s[9].name, 'Kirtland Era 10 · April 13, 1833 · Kirtland, April 13, 1833');
  for (const c of s) assert.ok(c.name.length <= LIMITS.choiceName, c.name);
});

test('a sermon number narrows by prefix; once ":" is typed it is exact and the tail stays in the value', () => {
  assert.deepEqual(values('kirtland era 1'), ['Kirtland Era 1', ...Array.from({ length: 10 }, (_, i) => `Kirtland Era ${10 + i}`)]);
  assert.deepEqual(values('nauvoo era 10'), ['Nauvoo Era 10', 'Nauvoo Era 100']);
  const one = suggest('Kirtland Era 1:3');
  assert.deepEqual(one.map((c) => c.value), ['Kirtland Era 1:3']);
  assert.ok(one[0].name.startsWith('Kirtland Era 1:3 · Nov., 1831 · My time'), one[0].name);
  assert.deepEqual(values('kirtlandera50'), []);
  assert.deepEqual(values('kirtland era x'), []);
});

test('jsh / jsm → the full names; the alias works before a chapter too', () => {
  assert.deepEqual(suggest('jsh'), [{ name: 'Joseph Smith—History · Pearl of Great Price · 1 chapter', value: 'Joseph Smith—History' }]);
  assert.deepEqual(values('JSM'), ['Joseph Smith—Matthew']);
  assert.deepEqual(values('jsh 1:17'), ['Joseph Smith—History 1:17']);
});

test('jst m → the JST books starting with M, canonical order', () => {
  assert.deepEqual(suggest('jst m'), [
    { name: 'JST Micah · OT JST · 7 chapters', value: 'JST Micah' },
    { name: 'JST Malachi · OT JST · 4 chapters', value: 'JST Malachi' },
    { name: 'JST Matthew · NT JST · 28 chapters', value: 'JST Matthew' },
    { name: 'JST Mark · NT JST · 16 chapters', value: 'JST Mark' },
  ]);
});

test('nothing typed → the first 25 books, bare names', () => {
  const s = suggest('');
  assert.equal(s.length, 25);
  assert.deepEqual(s, loadIndex().slice(0, 25).map((b) => ({ name: b.display, value: b.display })));
  assert.equal(s[0].value, 'Genesis');
  assert.equal(s[24].value, 'Lamentations');
  assert.deepEqual(suggest('   '), s);
});

test('no match → []; a typed tail after a whole book must start with a digit', () => {
  assert.deepEqual(suggest('zzz'), []);
  assert.deepEqual(suggest('johnathan'), []);
  assert.deepEqual(values('john'), ['John']);
});

test('a whole book plus chapter/verse keeps what was typed after it, under the stored name', () => {
  assert.deepEqual(suggest('alma32:21'), [{ name: 'Alma 32:21 · Book of Mormon · 63 chapters', value: 'Alma 32:21' }]);
  assert.deepEqual(values('1 nephi 3:7'), ['1 Nephi 3:7']);
  assert.deepEqual(values('d&'), ['D&C']);
  assert.equal(suggest('d&')[0].name, 'D&C · Doctrine and Covenants · 138 chapters');
  assert.deepEqual(values('Doctrine and'), []);
});

test('more than 25 matches → the first 25 in canonical order', () => {
  const s = suggest('j');
  assert.equal(s.length, LIMITS.autocompleteChoices);
  const expected = loadIndex().filter((b) => b.key.startsWith('j')).slice(0, 25).map((b) => b.display);
  assert.deepEqual(s.map((c) => c.value), expected);
  assert.equal(expected[0], 'Joshua');
});

test('/verse lists: suggestions follow the last comma; the name shows the whole list, the value keeps it', () => {
  assert.deepEqual(suggest('d&c 4:2, mor'), [
    { name: 'd&c 4:2, Mormon · Book of Mormon · 9 chapters', value: 'd&c 4:2, Mormon' },
    { name: 'd&c 4:2, Moroni · Book of Mormon · 10 chapters', value: 'd&c 4:2, Moroni' },
  ]);
  assert.deepEqual(values('d&c 4:2,jsh 1:17'), ['d&c 4:2, Joseph Smith—History 1:17']);
  assert.deepEqual(values('d&c 4:2, '), loadIndex().slice(0, 25).map((b) => `d&c 4:2, ${b.display}`));
});

test('a value over the choice-value limit is not offered; a name over the name limit is cut with "…"', () => {
  const seven = `${'alma 32:21, '.repeat(7)}mor`;
  const s = suggest(seven);
  assert.deepEqual(s.map((c) => c.value), [`${'alma 32:21, '.repeat(7)}Mormon`, `${'alma 32:21, '.repeat(7)}Moroni`]);
  for (const c of s) {
    assert.equal(c.name.length, LIMITS.choiceName);
    assert.ok(c.name.endsWith('…'));
    assert.ok(c.value.length <= LIMITS.choiceValue);
  }
  assert.deepEqual(suggest(`${'alma 32:21, '.repeat(8)}mor`), []);
});

test('offered values for whole references resolve with the reference rules', () => {
  for (const v of ['alma32:21', 'jsh 1:17', '1 nephi 3:7', 'd&c 4:2, moroni 10:4', 'kirtland era 1:1']) {
    const s = suggest(v);
    assert.equal(s.length, 1, v);
    assert.ok(resolveList(s[0].value).ok, s[0].value);
  }
  assert.ok(resolveChapter(suggest('kirtland era 20')[0].value).ok);
  assert.ok(resolveChapter(suggest('1nephi3')[0].value).ok);
});

test('every name and value stays within Discord\'s limits', () => {
  for (const input of ['', 'a', 'j', 'jst', 'kirtland era', 'nauvoo era', 'new york', 'missouri era 1', 'd&c 4:2, jst ', 'x, y, z, alma']) {
    const s = suggest(input);
    assert.ok(s.length <= LIMITS.autocompleteChoices, input);
    for (const c of s) {
      assert.ok(c.name.length >= 1 && c.name.length <= LIMITS.choiceName, c.name);
      assert.ok(c.value.length >= 1 && c.value.length <= LIMITS.choiceValue, c.value);
    }
  }
});

test('autocomplete: the focused reference of /verse or /chapter → type 8 with suggest() choices', () => {
  const focused = (name: string, option: string, value: string) => ({ type: 4, data: { name, options: [{ name: option, type: 3, value, focused: true }] } });
  assert.deepEqual(autocomplete(focused('verse', 'reference', 'jsh')), { type: 8, data: { choices: suggest('jsh') } });
  assert.deepEqual(autocomplete(focused('chapter', 'reference', 'kirtland era')), { type: 8, data: { choices: suggest('kirtland era') } });
  assert.equal(autocomplete(focused('chapter', 'reference', 'kirtland era')).data.choices.length, 25);
  assert.deepEqual(autocomplete(focused('search', 'query', 'faith')), { type: 8, data: { choices: [] } });
  assert.deepEqual(autocomplete(focused('compare', 'reference', 'jsh')), { type: 8, data: { choices: [] } });
  assert.deepEqual(autocomplete({ type: 4, data: { name: 'verse', options: [{ name: 'reference', type: 3, value: 'jsh' }] } }), { type: 8, data: { choices: [] } });
  assert.deepEqual(autocomplete({ type: 4 }), { type: 8, data: { choices: [] } });
});

// Last: everything above ran in this process (node --test runs each file in its own process).
test('autocomplete never loads a book file: only index.json was read', () => {
  for (const input of ['', 'alma32:21', 'kirtland era', 'jsh', 'jst m', 'd&c 4:2, mor', 'zzz', 'nauvoo era 1']) suggest(input);
  assert.deepEqual(filesRead(), ['index.json']);
});
