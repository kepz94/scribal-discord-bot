// SBD-3 (v1): reference resolver — SRD §5 rules, every error text, round-trips, and index bounds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadIndex, loadSearchCorpus } from '../src/library.ts';
import { formatRef, resolveChapter, resolveList, type Ref, type RefError } from '../src/reference.ts';

const JSM = 'josephsmith—matthew';
const JSH = 'josephsmith—history';
const ref = (key: string, ch: number, from: number, to = from): Ref => ({ key, ch, from, to });

const one = (input: string): Ref => {
  const r = resolveList(input);
  assert.ok(r.ok, `${input} → ${r.ok ? '' : r.error.message}`);
  assert.equal(r.refs.length, 1, input);
  return r.refs[0];
};
const fail = (input: string): RefError => {
  const r = resolveList(input);
  assert.ok(!r.ok, `${input} resolved but should fail`);
  return r.error;
};
const failChapter = (input: string): RefError => {
  const r = resolveChapter(input);
  assert.ok(!r.ok, `${input} resolved but should fail`);
  return r.error;
};
const malformedText = (input: string): string => `Couldn't read “${input}” as a reference. Try Alma 32:21 or Alma 32:21-23.`;
const assertMalformed = (e: RefError, input: string): void => {
  assert.equal(e.kind, 'malformed');
  assert.equal(e.input, input);
  assert.equal(e.message, malformedText(input));
};

// SRD §5 "Resolves"
test('resolves jstmatthew3:13', () => assert.deepEqual(one('jstmatthew3:13'), ref('jstmatthew', 3, 13)));
test('resolves 1nephi 3:7', () => assert.deepEqual(one('1nephi 3:7'), ref('1nephi', 3, 7)));
test('resolves JST  Matthew 3 : 13', () => assert.deepEqual(one('JST  Matthew 3 : 13'), ref('jstmatthew', 3, 13)));
test('resolves jsm 1:1 through the JSM alias', () => assert.deepEqual(one('jsm 1:1'), ref(JSM, 1, 1)));
test('resolves JSH1:17 through the JSH alias', () => assert.deepEqual(one('JSH1:17'), ref(JSH, 1, 17)));
test('resolves Joseph Smith—History 1:17', () => assert.deepEqual(one('Joseph Smith—History 1:17'), ref(JSH, 1, 17)));
test('resolves D&C 4:2', () => assert.deepEqual(one('D&C 4:2'), ref('d&c', 4, 2)));
test('resolves a range within one chapter', () => assert.deepEqual(one('Alma 32:21-23'), ref('alma', 32, 21, 23)));
test('resolves a range written with an en dash', () => assert.deepEqual(one('Alma 32:21–23'), ref('alma', 32, 21, 23)));

// SRD §5 "Does not resolve" + error texts
test('Doctrine and Covenants 4:2 → unknownBook "No book called Doctrine and Covenants."', () => {
  const e = fail('Doctrine and Covenants 4:2');
  assert.equal(e.kind, 'unknownBook');
  assert.equal(e.message, 'No book called Doctrine and Covenants.');
});
test('Joseph Smith-History 1:17 (hyphen) → unknownBook', () => {
  const e = fail('Joseph Smith-History 1:17');
  assert.equal(e.kind, 'unknownBook');
  assert.equal(e.message, 'No book called Joseph Smith-History.');
});
test('a book name with no digits → unknownBook', () => assert.equal(fail('Psalm').kind, 'unknownBook'));
test('Kirtland Era 1:34 → verseOutOfRange "Kirtland Era 1 has 1 verse."', () => {
  const e = fail('Kirtland Era 1:34');
  assert.equal(e.kind, 'verseOutOfRange');
  assert.equal(e.message, 'Kirtland Era 1 has 1 verse.');
});
test('Alma 70:1 → chapterOutOfRange "Alma has 63 chapters."', () => {
  const e = fail('Alma 70:1');
  assert.equal(e.kind, 'chapterOutOfRange');
  assert.equal(e.message, 'Alma has 63 chapters.');
});
test('a one-chapter book says "1 chapter."', () => assert.equal(fail('Obadiah 2:1').message, 'Obadiah has 1 chapter.'));
test('verse 0 → verseOutOfRange', () => assert.equal(fail('alma 32:0').message, 'Alma 32 has 43 verses.'));
test('alma 32:23-21 → reversedRange naming the swapped range', () => {
  const e = fail('alma 32:23-21');
  assert.equal(e.kind, 'reversedRange');
  assert.equal(e.message, 'Put the lower verse first: Alma 32:21-23.');
});
test('a reversed range past the last verse → verseOutOfRange, not reversedRange', () => {
  assert.equal(fail('alma 32:50-45').kind, 'verseOutOfRange');
});
test('alma 32:43-33:2 → crossChapter (decision 16)', () => {
  const e = fail('alma 32:43-33:2');
  assert.equal(e.kind, 'crossChapter');
  assert.equal(e.message, 'A range stays within one chapter. Use two references or /chapter.');
});
test('a cross-chapter range with an en dash → crossChapter', () => assert.equal(fail('alma 32:43–33:2').kind, 'crossChapter'));
test('a range that repeats its own chapter → malformed', () => assertMalformed(fail('alma 32:43-32:45'), 'alma 32:43-32:45'));
test('alma 32 → noVerse (decision 17)', () => {
  const e = fail('alma 32');
  assert.equal(e.kind, 'noVerse');
  assert.equal(e.message, 'Add a verse number, or use /chapter.');
});
test('a chapter past the end with no verse → noVerse', () => assert.equal(fail('alma 70').kind, 'noVerse'));
test('empty input → malformed', () => assertMalformed(fail(''), ''));
test('a book with no chapter → malformed', () => assertMalformed(fail('alma'), 'alma'));
test('an alias with no chapter → malformed', () => assertMalformed(fail('jsh'), 'jsh'));
test('numbers with no book → malformed', () => assertMalformed(fail('3:16'), '3:16'));
test('malformed echoes the input', () => {
  const e = fail('alma 32:21b');
  assert.equal(e.kind, 'malformed');
  assert.equal(e.input, 'alma 32:21b');
  assert.equal(e.message, malformedText('alma 32:21b'));
});
test('an em dash is not a range separator', () => assertMalformed(fail('alma 32:21—23'), 'alma 32:21—23'));

// Lists
test('d&c 4:2, moroni 10:4, jsh 1:17 → 3 refs in typed order', () => {
  const r = resolveList('d&c 4:2, moroni 10:4, jsh 1:17');
  assert.ok(r.ok);
  assert.deepEqual(r.refs, [ref('d&c', 4, 2), ref('moroni', 10, 4), ref(JSH, 1, 17)]);
});
test('duplicates are kept', () => {
  const r = resolveList('alma 32:21, alma 32:21');
  assert.ok(r.ok);
  assert.equal(r.refs.length, 2);
});
test('empty parts are ignored', () => {
  const r = resolveList('alma 32:21,, moroni 10:4,');
  assert.ok(r.ok);
  assert.deepEqual(r.refs, [ref('alma', 32, 21), ref('moroni', 10, 4)]);
});
test('a list of only empty parts → malformed', () => assertMalformed(fail(' , '), ','));
test('the first failing part is reported', () => {
  const e = fail('alma 32:21, foo 1:1, alma 70:1');
  assert.equal(e.kind, 'unknownBook');
  assert.equal(e.input, 'foo 1:1');
  assert.equal(e.message, 'No book called foo.');
});

// resolveChapter
test('resolveChapter alma 32', () => assert.deepEqual(resolveChapter('alma 32'), { ok: true, key: 'alma', ch: 32 }));
test('resolveChapter jsh 1', () => assert.deepEqual(resolveChapter('jsh 1'), { ok: true, key: JSH, ch: 1 }));
test('resolveChapter alma 70 → chapterOutOfRange', () => assert.equal(failChapter('alma 70').message, 'Alma has 63 chapters.'));
test('resolveChapter with a verse → malformed', () => assertMalformed(failChapter('alma 32:21'), 'alma 32:21'));
test('resolveChapter with no chapter → malformed', () => assertMalformed(failChapter('alma'), 'alma'));
test('resolveChapter unknown book', () => assert.equal(failChapter('Doctrine and Covenants 4').message, 'No book called Doctrine and Covenants.'));
test('resolveChapter empty → malformed', () => assertMalformed(failChapter(''), ''));

// formatRef
test('formatRef JSH → Joseph Smith—History 1:17', () => assert.equal(formatRef(ref(JSH, 1, 17), 'title'), 'Joseph Smith—History 1:17'));
test('formatRef title range uses an en dash', () => assert.equal(formatRef(ref('alma', 32, 21, 23), 'title'), 'Alma 32:21–23'));
test('formatRef list range uses a hyphen', () => assert.equal(formatRef(ref('alma', 32, 21, 23), 'list'), 'Alma 32:21-23'));
test('formatRef of a single verse shows no range', () => assert.equal(formatRef(ref('alma', 32, 21), 'list'), 'Alma 32:21'));

const FIXTURES = [
  'jstmatthew3:13', '1nephi 3:7', 'JST  Matthew 3 : 13', 'jsm 1:1', 'JSH1:17', 'Joseph Smith—History 1:17', 'D&C 4:2',
  'Alma 32:21-23', 'Alma 32:21–23', 'moroni 10:4', 'Kirtland Era 1:1',
];
test('round-trip: resolveList(formatRef(r, "list")) returns r for every fixture', () => {
  for (const input of FIXTURES) {
    const r = one(input);
    assert.deepEqual(one(formatRef(r, 'list')), r, input);
  }
});

// Whole-library checks
test('every stored verse reference resolves to itself and formats back to the stored string', () => {
  const index = new Map(loadIndex().map((b) => [b.display, b.key]));
  for (const row of loadSearchCorpus()) {
    const m = /^(.*) (\d+):(\d+)$/.exec(row.ref);
    assert.ok(m, row.ref);
    const expected = ref(index.get(m[1]) ?? '', Number(m[2]), Number(m[3]));
    assert.deepEqual(one(row.ref), expected, row.ref);
    assert.equal(formatRef(expected, 'list'), row.ref);
  }
});

test('normalized keys are unique: 74,735 stored + 130 alias keys = 74,865', () => {
  const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, '');
  const keys = new Set(loadSearchCorpus().map((r) => norm(r.ref)));
  assert.equal(keys.size, 74_735);
  let aliasKeys = 0;
  for (const [alias, key] of [['jsm', JSM], ['jsh', JSH]] as const) {
    const book = loadIndex().find((b) => b.key === key);
    assert.ok(book, key);
    book.chapters.forEach((count, i) => {
      for (let v = 1; v <= count; v++) {
        keys.add(`${alias}${i + 1}:${v}`);
        aliasKeys++;
      }
    });
  }
  assert.equal(aliasKeys, 130);
  assert.equal(keys.size, 74_865);
});

test('the resolver never returns a ref outside the index (every book and chapter edge)', () => {
  for (const b of loadIndex()) {
    const last = b.chapters.length;
    assert.equal(fail(`${b.display} ${last + 1}:1`).kind, 'chapterOutOfRange', b.display);
    assert.equal(fail(`${b.display} 0:1`).kind, 'chapterOutOfRange', b.display);
    assert.equal(failChapter(`${b.display} ${last + 1}`).kind, 'chapterOutOfRange', b.display);
    b.chapters.forEach((count, i) => {
      assert.equal(fail(`${b.display} ${i + 1}:${count + 1}`).kind, 'verseOutOfRange', `${b.display} ${i + 1}`);
      assert.equal(fail(`${b.display} ${i + 1}:1-${count + 1}`).kind, 'verseOutOfRange', `${b.display} ${i + 1}`);
      assert.deepEqual(one(`${b.display} ${i + 1}:1-${count}`), ref(b.key, i + 1, 1, count));
    });
  }
});
