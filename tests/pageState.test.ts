// SBD-5 (v1): button custom_id codec — every kind round-trips, nothing exceeds LIMITS.customId, bad ids decode to null.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS } from '../src/limits.ts';
import { decode, encode, type PageState } from '../src/pageState.ts';

const FIXTURES: PageState[] = [
  { t: 'chapter', key: '1nephi', ch: 3, page: 1 },
  { t: 'chapter', key: 'josephsmith—history', ch: 1, page: 0 },
  { t: 'chapter', key: 'd&c', ch: 138, page: 2 },
  { t: 'range', ref: { key: 'alma', ch: 32, from: 1, to: 43 }, page: 1 },
  { t: 'list', page: 0 },
  { t: 'list', page: 11 },
  { t: 'define', w: 'faith', page: 0 },
  { t: 'define', w: "an'", page: 3 },
  { t: 'search', q: 'faith & works', page: 0 },
  { t: 'search', q: 'faith & works', vol: 2, page: 4 },
  { t: 'search', q: '"in the beginning" | alma:32 · ~*_`>', vol: 0, page: 9 },
];

const roundTrip = (s: PageState): void => {
  const id = encode(s);
  assert.ok(id !== null, JSON.stringify(s));
  assert.deepEqual(decode(id), s);
};

test('chapter round-trips', () => roundTrip(FIXTURES[0]));
test('chapter with an em dash key round-trips', () => roundTrip(FIXTURES[1]));
test('range round-trips', () => roundTrip(FIXTURES[3]));
test('list carries only the page and round-trips', () => {
  roundTrip(FIXTURES[5]);
  assert.deepEqual(Object.keys(decode(encode(FIXTURES[5]) ?? '') ?? {}).sort(), ['page', 't']);
});
test('define round-trips', () => roundTrip(FIXTURES[6]));
test('search without a volume round-trips (no vol key)', () => roundTrip(FIXTURES[8]));
test('search with a volume round-trips', () => roundTrip(FIXTURES[9]));
test('search text with separators and markdown characters round-trips', () => roundTrip(FIXTURES[10]));

test('decode(encode(s)) deep-equals s for every fixture', () => {
  for (const s of FIXTURES) roundTrip(s);
});

test('every encoded fixture is within LIMITS.customId', () => {
  for (const s of FIXTURES) {
    const id = encode(s);
    assert.ok(id, JSON.stringify(s));
    assert.ok(id.length <= LIMITS.customId, JSON.stringify(s));
  }
});

test('a search query of 80 characters encodes', () => {
  const s: PageState = { t: 'search', q: 'x'.repeat(80), vol: 7, page: 999 };
  const id = encode(s);
  assert.ok(id !== null && id.length <= LIMITS.customId);
  assert.deepEqual(decode(id), s);
});

test('a define word of 40 characters encodes', () => {
  const s: PageState = { t: 'define', w: 'w'.repeat(40), page: 999 };
  const id = encode(s);
  assert.ok(id !== null && id.length <= LIMITS.customId);
  assert.deepEqual(decode(id), s);
});

test('a state over LIMITS.customId encodes to null', () => {
  assert.equal(encode({ t: 'search', q: 'x'.repeat(LIMITS.customId), page: 0 }), null);
});

test('an invalid state encodes to null', () => {
  for (const s of [
    { t: 'list', page: -1 },
    { t: 'list', page: 1.5 },
    { t: 'chapter', key: 'alma', ch: 0, page: 0 },
    { t: 'chapter', key: '', ch: 1, page: 0 },
    { t: 'range', ref: { key: 'alma', ch: 32, from: 23, to: 21 }, page: 0 },
    { t: 'define', w: '', page: 0 },
    { t: 'search', q: 'faith', vol: -1, page: 0 },
  ] as PageState[]) {
    assert.equal(encode(s), null, JSON.stringify(s));
  }
});

test('malformed ids decode to null', () => {
  for (const id of [
    '', 'c', 'c:0', 'c:0:1', 'c:0:1:', 'c:x:1:alma', 'c:01:1:alma', 'c:0:0:alma', 'c:-1:1:alma', 'c:0:1.5:alma',
    'r:0:32:23:21:alma', 'r:0:32:1:alma', 'l:', 'l:-1', 'l:0:extra', 'l:9007199254740993', 'd:0:', 'd:0',
    's:0::faith', 's:0:x:faith', 's:0:-:', 's:0:1',
  ]) {
    assert.equal(decode(id), null, JSON.stringify(id));
  }
});

test('unknown kinds decode to null', () => {
  for (const id of ['x:0', 'C:0:1:alma', 'list:0', ':0', 'cc:0:1:alma']) assert.equal(decode(id), null, id);
});

// Posted messages keep their buttons, so the id format is a contract: changing it breaks every older message.
test('the wire format is pinned for every kind', () => {
  const pinned: [PageState, string][] = [
    [{ t: 'chapter', key: '1nephi', ch: 3, page: 1 }, 'c:1:3:1nephi'],
    [{ t: 'range', ref: { key: 'alma', ch: 32, from: 1, to: 43 }, page: 1 }, 'r:1:32:1:43:alma'],
    [{ t: 'list', page: 11 }, 'l:11'],
    [{ t: 'define', w: 'faith', page: 0 }, 'd:0:faith'],
    [{ t: 'search', q: 'faith & works', page: 0 }, 's:0:-:faith & works'],
    [{ t: 'search', q: 'a:b', vol: 2, page: 4 }, 's:4:2:a:b'],
  ];
  for (const [s, id] of pinned) {
    assert.equal(encode(s), id);
    assert.deepEqual(decode(id), s);
  }
});
