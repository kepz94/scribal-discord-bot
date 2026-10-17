// SBD-4 (v1): Layout A cards — markdown escaping, card fields per mockup v4, error texts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBook } from '../src/library.ts';
import { escapeMarkdown } from '../src/markdown.ts';
import { CARD_COLOR, errorText } from '../src/cards.ts';
import { versePages } from '../src/paginate.ts';
import { resolveChapter, resolveList, type Ref, type RefError } from '../src/reference.ts';

const refs = (input: string): Ref[] => {
  const r = resolveList(input);
  assert.ok(r.ok, input);
  return r.refs;
};
const onlyPage = (input: string) => {
  const r = versePages(refs(input));
  assert.ok(r.ok, input);
  assert.equal(r.pages.length, 1, input);
  return r.pages[0];
};
const verse = (key: string, ch: number, v: number): string => loadBook(key).chapters[ch - 1].verses[v - 1].t;
const refError = (input: string): RefError => {
  const r = resolveList(input);
  assert.ok(!r.ok, input);
  return r.error;
};

test('escapeMarkdown escapes * _ ~ \\ | > and backticks', () => {
  assert.equal(escapeMarkdown('a*b_c~d\\e|f>g`h'), 'a\\*b\\_c\\~d\\\\e\\|f\\>g\\`h');
});

test('escapeMarkdown leaves ordinary scripture punctuation alone', () => {
  assert.equal(escapeMarkdown('D&C — Solomon\'s Song; “yea,” (and) [Heb.] 3:5-7.'), 'D&C — Solomon\'s Song; “yea,” (and) [Heb.] 3:5-7.');
});

test('Alma 32:21 → one card: volume author, stored reference title, text only, violet edge, no footer', () => {
  const page = onlyPage('Alma 32:21');
  assert.equal(page.content, undefined);
  assert.deepEqual(page.embeds, [
    { author: { name: 'Book of Mormon' }, title: 'Alma 32:21', description: verse('alma', 32, 21), color: 0x8b5cf6 },
  ]);
  assert.equal(CARD_COLOR, 0x8b5cf6);
});

test('Alma 32:21-23 → title with en dash, one bold-numbered paragraph per verse, a line break between (v1.1)', () => {
  const [card] = onlyPage('Alma 32:21-23').embeds;
  assert.equal(card.title, 'Alma 32:21–23');
  assert.equal(
    card.description,
    [21, 22, 23].map((v) => `**${v}** ${verse('alma', 32, v)}`).join('\n'),
  );
});

test('Kirtland Era 1:1 → sermon card: author names the sermon, title is the date, footer is the source', () => {
  const [card] = onlyPage('Kirtland Era 1:1').embeds;
  assert.equal(card.author?.name, 'Sermons of the Prophet Joseph Smith · Kirtland Era 1:1');
  assert.equal(card.title, 'Nov., 1831');
  assert.deepEqual(card.footer, { text: 'Source: DHC 1:235-236' });
  assert.equal(card.description, verse('kirtlandera', 1, 1));
});

test('an undated sermon is titled "Sermon N" and keeps its bare citation', () => {
  const [card] = onlyPage('Kirtland Era 8:1').embeds;
  assert.equal(card.title, 'Sermon 8');
  assert.deepEqual(card.footer, { text: 'Source: DHC 1:316' });
});

test('markdown characters in scripture are escaped (Nauvoo Era 1:17 "* *")', () => {
  const [card] = onlyPage('Nauvoo Era 1:17').embeds;
  assert.ok(verse('nauvooera', 1, 17).includes('* *'));
  assert.equal(card.description, escapeMarkdown(verse('nauvooera', 1, 17)));
  assert.ok(card.description.includes('\\* \\*'));
});

test('a short list → one page, one card per reference in typed order, no content', () => {
  const page = onlyPage('d&c 4:2, moroni 10:4, jsh 1:17');
  assert.equal(page.content, undefined);
  assert.deepEqual(page.embeds.map((e) => [e.author?.name, e.title]), [
    ['Doctrine and Covenants', 'D&C 4:2'],
    ['Book of Mormon', 'Moroni 10:4'],
    ['Pearl of Great Price', 'Joseph Smith—History 1:17'],
  ]);
  assert.equal(page.embeds[2].description, verse('josephsmith—history', 1, 17));
  assert.ok(page.embeds.every((e) => e.footer === undefined));
});

test('errorText unknownBook bolds the typed name', () => {
  assert.equal(errorText(refError('Doctrine and Covenants 4:2')), 'No book called **Doctrine and Covenants**.');
});
test('errorText unknownBook escapes markdown in the typed name', () => {
  assert.equal(errorText(refError('alma *32*')), 'No book called **alma \\*32\\***.');
});
test('errorText chapterOutOfRange bolds the book', () => {
  assert.equal(errorText(refError('Alma 70:1')), '**Alma** has 63 chapters.');
});
test('errorText verseOutOfRange bolds the book and chapter', () => {
  assert.equal(errorText(refError('Kirtland Era 1:34')), '**Kirtland Era 1** has 1 verse.');
});
test('errorText malformed escapes the echoed input', () => {
  assert.equal(errorText(refError('alma 32:2_1')), 'Couldn\'t read “alma 32:2\\_1” as a reference. Try Alma 32:21 or Alma 32:21-23.');
});
test('errorText reversedRange, crossChapter and noVerse pass through unchanged', () => {
  for (const input of ['alma 32:23-21', 'alma 32:43-33:2', 'alma 32']) {
    const e = refError(input);
    assert.equal(errorText(e), e.message, input);
  }
});
test('errorText works for resolveChapter errors too', () => {
  const r = resolveChapter('Alma 70');
  assert.ok(!r.ok);
  assert.equal(errorText(r.error), '**Alma** has 63 chapters.');
});

// /search cards (SBD-10, mockup v4 /search)
import { search } from '../src/search.ts';
import { searchPage, searchPages } from '../src/cards.ts';

const searched = (q: string, volume?: string) => {
  const r = search(q, volume);
  assert.ok(r && r.total > 0, q);
  return { result: r, pages: searchPages(r, q, volume) };
};

test('searchPages: 5 results per page, count title, author, footer with per-volume counts', () => {
  const { pages } = searched('faith & works');
  assert.equal(pages.length, 11);
  const [card] = pages[0].embeds;
  assert.equal(card.title, '52 verses match “faith & works”');
  assert.equal(card.author?.name, 'Search · whole words · all volumes');
  assert.equal(card.footer?.text, 'Results 1–5 of 52 · New Testament 15 · Book of Mormon 9 · Doctrine and Covenants 4 · NT JST 17 · Sermons 7');
  assert.equal(pages[10].embeds[0].footer?.text, 'Results 51–52 of 52 · New Testament 15 · Book of Mormon 9 · Doctrine and Covenants 4 · NT JST 17 · Sermons 7');
  assert.equal(card.color, 0x8b5cf6);
  pages.forEach((p, i) => {
    assert.equal(p.index, i);
    assert.equal(p.count, 11);
    assert.ok(p.embeds[0].description.length <= 4096);
  });
});

test('each hit is its reference in bold, then the snippet with every match in bold', () => {
  const { result, pages } = searched('faith & works');
  const lines = pages[0].embeds[0].description.split('\n');
  assert.equal(lines.length, 10);
  result.hits.slice(0, 5).forEach((h, i) => {
    assert.equal(lines[i * 2], `**${h.ref}**`);
    assert.match(lines[i * 2 + 1], /\*\*faith\*\*/i);
    assert.match(lines[i * 2 + 1], /\*\*works\*\*/i);
  });
});

test('a volume search names the volume and counts only it', () => {
  const { pages } = searched('faith & works', 'Book of Mormon');
  assert.equal(pages[0].embeds[0].author?.name, 'Search · whole words · Book of Mormon');
  assert.equal(pages[1].embeds[0].footer?.text, 'Results 6–9 of 9 · Book of Mormon 9');
});

test('one hit: singular title and footer; markdown in the verse is escaped', () => {
  const { pages } = searched('impunity');
  assert.equal(pages.length, 1);
  const [card] = pages[0].embeds;
  assert.equal(card.title, '1 verse matches “impunity”');
  assert.equal(card.footer?.text, 'Result 1 of 1 · Sermons 1');
  assert.ok(card.description.includes('\\* \\* \\*'));
  assert.ok(card.description.includes('**impunity**'));
});

test('searchPage builds the one page searchPages has at that index, and null past either end', () => {
  const { result, pages } = searched('faith & works');
  pages.forEach((p, i) => assert.deepEqual(searchPage(result, 'faith & works', undefined, i), p));
  for (const i of [-1, 11, 1.5, Number.NaN]) assert.equal(searchPage(result, 'faith & works', undefined, i), null);
});
