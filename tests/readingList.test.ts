// SBD-4 (v1): the reading-list line (decision 19) — exact text, and it re-resolves to identical refs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadIndex } from '../src/library.ts';
import { readReadingList, writeReadingList } from '../src/readingList.ts';
import { resolveList, type Ref } from '../src/reference.ts';

const refs = (input: string): Ref[] => {
  const r = resolveList(input);
  assert.ok(r.ok, input);
  return r.refs;
};
const MOCKUP_12 = 'd&c 4:2, moroni 10:4, jsh 1:17, ' + Array.from({ length: 9 }, (_, i) => `alma 32:${18 + i}`).join(', ');

test('writeReadingList: bold label, count, page n of N, then every reference joined by " · "', () => {
  assert.equal(
    writeReadingList(refs('d&c 4:2, moroni 10:4, jsh 1:17'), 0, 2),
    '**Reading list** · 3 references · page 1 of 2\nD&C 4:2 · Moroni 10:4 · Joseph Smith—History 1:17',
  );
});

test('writeReadingList writes ranges with a hyphen so they re-resolve', () => {
  assert.equal(writeReadingList(refs('alma 32:21–23, moroni 10:4'), 1, 2), '**Reading list** · 2 references · page 2 of 2\nAlma 32:21-23 · Moroni 10:4');
});

test('readReadingList returns the comma-joined list', () => {
  assert.equal(readReadingList(writeReadingList(refs('d&c 4:2, jsh 1:17'), 0, 3)), 'D&C 4:2, Joseph Smith—History 1:17');
});

test('round-trip: the reading list re-resolves to identical refs (mockup list, ranges, sermons, duplicates)', () => {
  for (const input of [MOCKUP_12, 'alma 32:21-23, alma 32:21-23, kirtland era 1:1, jsm 1:4-6, new york & pennsylvania era 1:1']) {
    const original = refs(input);
    const list = readReadingList(writeReadingList(original, 1, 2));
    assert.ok(list !== null, input);
    assert.deepEqual(refs(list), original, input);
  }
});

test('readReadingList returns null for anything that is not a reading list', () => {
  const good = writeReadingList(refs('d&c 4:2, jsh 1:17'), 0, 2);
  const [head, list] = good.split('\n');
  for (const content of [
    '',
    'hello',
    head,
    `${head}\n`,
    `${head}\n${list}\nextra`,
    head.replace('2 references', '3 references') + `\n${list}`,
    head.replace('page 1 of 2', 'page 3 of 2') + `\n${list}`,
    head.replace('**Reading list**', 'Reading list') + `\n${list}`,
  ]) {
    assert.equal(readReadingList(content), null, JSON.stringify(content));
  }
});

test('no book name contains a character the reading list or markdown relies on', () => {
  for (const b of loadIndex()) assert.ok(!/[,\n·*_~\\|>`]/.test(b.display), b.display);
});
