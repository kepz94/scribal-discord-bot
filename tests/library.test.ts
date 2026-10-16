// SBD-2 (v1): the library snapshot split into data/gen — counts, book keys and sermon fields, read back through src/library.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { LIMITS } from '../src/limits.ts';
import { loadBook, loadIndex, loadSearchCorpus, loadWebster, type IndexBook } from '../src/library.ts';

const SERMONS_VOLUME = 'Sermons of the Prophet Joseph Smith';
const WEBSTER_DIR = new URL('../data/gen/webster/', import.meta.url);

const book = (key: string): IndexBook => {
  const found = loadIndex().find((b) => b.key === key);
  assert.ok(found, `no book with key ${key}`);
  return found;
};
const sum = (ns: number[]): number => ns.reduce((a, n) => a + n, 0);

test('index has 156 books', () => {
  assert.equal(loadIndex().length, 156);
});

test('index verse counts total 74,735', () => {
  assert.equal(sum(loadIndex().map((b) => sum(b.chapters))), 74_735);
});

test('every book file has the chapters and verse counts its index entry lists', () => {
  for (const b of loadIndex()) {
    const chapters = loadBook(b.key).chapters;
    assert.deepEqual(chapters.map((c) => c.n), b.chapters.map((_, i) => i + 1), b.key);
    assert.deepEqual(chapters.map((c) => c.verses.length), b.chapters, b.key);
  }
});

test('D&C key and display come from its stored reference, not its title', () => {
  const dc = loadIndex().filter((b) => b.volume === 'Doctrine and Covenants');
  assert.equal(dc.length, 1);
  assert.equal(dc[0].key, 'd&c');
  assert.equal(dc[0].display, 'D&C');
});

test('book keys are the stored reference prefix, lowercased, whitespace removed', () => {
  assert.equal(book('1nephi').display, '1 Nephi');
  assert.equal(book('josephsmith—history').display, 'Joseph Smith—History');
  assert.equal(book('jstmatthew').display, 'JST Matthew');
  assert.equal(book('kirtlandera').display, 'Kirtland Era');
  for (const b of loadIndex()) assert.equal(b.key, b.display.toLowerCase().replace(/\s+/g, ''), b.display);
});

test('book keys are unique', () => {
  assert.equal(new Set(loadIndex().map((b) => b.key)).size, 156);
});

test('kirtlandera has 49 chapters', () => {
  assert.equal(book('kirtlandera').chapters.length, 49);
});

test('first Kirtland Era sermon: label "Nov., 1831", citation "DHC 1:235-236"', () => {
  const first = book('kirtlandera').sermons?.[0];
  assert.equal(first?.label, 'Nov., 1831');
  assert.equal(first?.citation, 'DHC 1:235-236');
});

test('exactly 18 of 157 sermons are labelled "Sermon N", and which ones', () => {
  const sermons = loadIndex().flatMap((b) => (b.sermons ?? []).map((s, i) => ({ ref: `${b.display} ${i + 1}`, label: s.label })));
  assert.equal(sermons.length, 157);
  const fallback = sermons.filter((s) => /^Sermon \d+$/.test(s.label));
  assert.deepEqual(
    fallback.map((s) => s.ref),
    [
      'Kirtland Era 8', 'Kirtland Era 11', 'Kirtland Era 13', 'Kirtland Era 14', 'Kirtland Era 15', 'Kirtland Era 16',
      'Kirtland Era 17', 'Kirtland Era 22', 'Kirtland Era 24', 'Kirtland Era 30', 'Missouri Era 5', 'Missouri Era 7',
      'Nauvoo Era 10', 'Nauvoo Era 30', 'Nauvoo Era 33', 'Nauvoo Era 46', 'Nauvoo Era 53', 'Nauvoo Era 100',
    ],
  );
  for (const s of fallback) assert.equal(s.label, `Sermon ${s.ref.split(' ').at(-1)}`, s.ref);
});

test('a sermon title with no em dash is used whole as the citation', () => {
  assert.equal(book('kirtlandera').sermons?.[7]?.citation, 'DHC 1:316');
  assert.equal(book('nauvooera').sermons?.[99]?.citation, 'June 16, 1844');
});

test('sermon "first" is the first verse cut to LIMITS.choiceName', () => {
  for (const b of loadIndex().filter((x) => x.sermons)) {
    const chapters = loadBook(b.key).chapters;
    b.sermons?.forEach((s, i) => {
      assert.equal(s.first, chapters[i].verses[0].t.slice(0, LIMITS.choiceName), `${b.display} ${i + 1}`);
    });
  }
  assert.equal(book('kirtlandera').sermons?.[0]?.first.length, LIMITS.choiceName);
});

test('only the sermons volume carries sermons, one per chapter', () => {
  for (const b of loadIndex()) {
    if (b.volume === SERMONS_VOLUME) assert.equal(b.sermons?.length, b.chapters.length, b.key);
    else assert.equal(b.sermons, undefined, b.key);
  }
});

test('webster has 8,368 entries across 27 files (a–z + other)', () => {
  const files = readdirSync(WEBSTER_DIR).sort();
  assert.deepEqual(files, [...'abcdefghijklmnopqrstuvwxyz'].map((c) => `${c}.json`).concat('other.json').sort());
  const total = sum(files.map((f) => Object.keys(JSON.parse(readFileSync(new URL(f, WEBSTER_DIR), 'utf8'))).length));
  assert.equal(total, 8_368);
});

test('loadWebster("faith") starts with FAITH', () => {
  assert.ok(loadWebster('faith')?.startsWith('FAITH'));
});

test('loadWebster returns undefined for a key with no entry, including Object prototype names', () => {
  for (const word of ['zzzz', 'constructor', '__proto__', 'toString', '', 'Faith']) {
    assert.equal(loadWebster(word), undefined, JSON.stringify(word));
  }
});

test('search corpus has 74,735 rows', () => {
  assert.equal(loadSearchCorpus().length, 74_735);
});

test('search corpus volume filter returns exactly that volume', () => {
  const rows = loadSearchCorpus('Book of Mormon');
  assert.ok(rows.every((r) => r.volume === 'Book of Mormon'));
  assert.equal(rows.length, sum(loadIndex().filter((b) => b.volume === 'Book of Mormon').flatMap((b) => b.chapters)));
  assert.equal(rows[0].ref, '1 Nephi 1:1');
});

test('loadBook rejects a key that is not in the index', () => {
  assert.throws(() => loadBook('../index'), /Unknown book key/);
});

test('loadSearchCorpus rejects an unknown volume', () => {
  assert.throws(() => loadSearchCorpus('Apocrypha'), /Unknown volume/);
});
