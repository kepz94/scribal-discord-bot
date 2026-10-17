// SBD-9 (v1 M2): search with Scribal's own matcher (phrase mode, whole words) — the Oct 14 2026 counts, volume
// filter, canonical order, and snippets that always show the first match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSearchCorpus } from '../src/library.ts';
import { highlighter, search, snippet } from '../src/search.ts';

const firstMatch = (t: string, terms: string[]): string => {
  const re = highlighter(terms);
  assert.ok(re);
  const m = new RegExp(re.source, 'i').exec(t);
  assert.ok(m, t.slice(0, 40));
  return m[0];
};

test('faith & works → 52 hits, split by volume as in the real matcher run of Oct 14 2026', () => {
  const r = search('faith & works');
  assert.ok(r);
  assert.equal(r.total, 52);
  assert.equal(r.hits.length, 52);
  assert.deepEqual(r.perVolume, {
    'New Testament': 15,
    'Book of Mormon': 9,
    'Doctrine and Covenants': 4,
    'NT JST': 17,
    'Sermons of the Prophet Joseph Smith': 7,
  });
});

test('volume "Book of Mormon" → 9, all from that volume', () => {
  const r = search('faith & works', 'Book of Mormon');
  assert.ok(r);
  assert.equal(r.total, 9);
  assert.deepEqual(r.perVolume, { 'Book of Mormon': 9 });
  assert.ok(r.hits.every((h) => h.volume === 'Book of Mormon'));
});

test('zzzqqq → 0 hits (a result, not null)', () => {
  assert.deepEqual(search('zzzqqq'), { total: 0, perVolume: {}, hits: [], terms: ['\\bzzzqqq\\b'] });
});

test('blank or unparseable queries → null', () => {
  for (const q of ['', '   ', '&', '*', ' & ']) assert.equal(search(q), null, JSON.stringify(q));
});

test('hits come in canonical order', () => {
  const r = search('faith & works');
  assert.ok(r);
  assert.equal(r.hits.length, 52);
  const position = new Map(loadSearchCorpus().map((row, i) => [row.ref, i]));
  const at = r.hits.map((h) => position.get(h.ref) ?? -1);
  assert.ok(at.every((p, i) => p >= 0 && (i === 0 || p > at[i - 1])));
});

test('phrase mode and whole words are the defaults ("love" never matches "beloved")', () => {
  const r = search('my beloved son');
  assert.ok(r);
  assert.ok(r.hits.length > 0);
  assert.ok(r.hits.every((h) => /\bmy\s+beloved\s+son\b/i.test(h.t)));
  const love = search('love');
  assert.ok(love);
  assert.ok(love.hits.length > 0);
  assert.ok(love.hits.every((h) => /\blove\b/i.test(h.t)));
});

test('the terms are the matcher\'s highlight sources', () => {
  assert.deepEqual(search('faith & works')?.terms, ['\\bfaith\\b', '\\bworks\\b']);
});

test('a short text is its own snippet', () => {
  assert.equal(snippet('Faith without works is dead.', ['\\bfaith\\b']), 'Faith without works is dead.');
});

test('every faith & works snippet is ≤ max + 2 characters and contains its first match', () => {
  const r = search('faith & works');
  assert.ok(r);
  assert.equal(r.hits.length, 52);
  for (const h of r.hits) {
    const s = snippet(h.t, r.terms);
    assert.ok(s.length <= 222, `${h.ref}: ${s.length}`);
    assert.ok(s.includes(firstMatch(h.t, r.terms)), h.ref);
  }
});

test('a long text: ellipses only where text was cut; a late match pulls the window to the end', () => {
  const text = 'a '.repeat(200) + 'faith is here.';
  const s = snippet(text, ['\\bfaith\\b'], 50);
  assert.ok(s.startsWith('…'));
  assert.ok(s.endsWith('faith is here.'));
  assert.ok(s.length <= 52);
  const early = snippet('faith ' + 'b '.repeat(200), ['\\bfaith\\b'], 50);
  assert.ok(early.startsWith('faith'));
  assert.ok(early.endsWith('…'));
});

test('a bad highlight source gives no highlighter (as in Scribal) and the snippet still works', () => {
  assert.equal(highlighter(['(']), null);
  assert.equal(snippet('x'.repeat(300), ['('], 20).length <= 22, true);
});
