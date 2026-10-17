// SBD-4 (v1), SBD-12 (v1.1): paging under LIMITS and the 1,500-character page — whole verses, page footers, reading
// list, tooLong, and whole-library sweeps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIMITS } from '../src/limits.ts';
import { loadBook, loadIndex, loadWebster } from '../src/library.ts';
import { escapeMarkdown } from '../src/markdown.ts';
import { PAGE_TEXT, chapterPages, definePages, versePages, type Page } from '../src/paginate.ts';
import { websterUnits } from '../src/cards.ts';
import { writeReadingList } from '../src/readingList.ts';
import { resolveList, type Ref } from '../src/reference.ts';

const refs = (input: string): Ref[] => {
  const r = resolveList(input);
  assert.ok(r.ok, input);
  return r.refs;
};
const pagesOf = (input: string): Page[] => {
  const r = versePages(refs(input));
  assert.ok(r.ok, input);
  return r.pages;
};
const embedChars = (e: Page['embeds'][number]): number =>
  (e.author?.name.length ?? 0) + e.title.length + e.description.length + (e.footer?.text.length ?? 0);

function assertUnderLimits(pages: Page[], label: string): void {
  pages.forEach((p, i) => {
    assert.equal(p.index, i, label);
    assert.equal(p.count, pages.length, label);
    assert.ok(p.embeds.length >= 1 && p.embeds.length <= LIMITS.embedsPerMessage, `${label} p${i} embeds`);
    assert.ok(p.embeds.reduce((n, e) => n + embedChars(e), 0) <= LIMITS.embedTotalPerMessage, `${label} p${i} total`);
    assert.ok((p.content ?? '').length <= LIMITS.messageContent, `${label} p${i} content`);
    for (const e of p.embeds) {
      assert.ok(e.title.length <= LIMITS.embedTitle, `${label} p${i} title`);
      assert.ok(e.description.length <= LIMITS.embedDescription, `${label} p${i} description ${e.description.length}`);
      assert.ok((e.footer?.text.length ?? 0) <= LIMITS.embedFooter, `${label} p${i} footer`);
    }
    // v1.1 page size: card text per page ≤ PAGE_TEXT, except a page holding one verse or paragraph that is longer
    // on its own (never split).
    const text = p.embeds.reduce((n, e) => n + e.description.length, 0);
    if (text > PAGE_TEXT) {
      assert.equal(p.embeds.length, 1, `${label} p${i} ${text} chars over PAGE_TEXT in several cards`);
      assert.ok(!p.embeds[0].description.includes('\n'), `${label} p${i} ${text} chars over PAGE_TEXT in several paragraphs`);
    }
  });
}
const paragraphs = (pages: Page[]): string[] => pages.flatMap((p) => p.embeds.flatMap((e) => e.description.split('\n')));
// Every verse appears once, whole and in order; a card showing one verse has its text alone, otherwise "**N** text".
function assertVersesWhole(pages: Page[], verses: { v: number; t: string }[], label: string): void {
  let next = 0;
  for (const card of pages.flatMap((p) => p.embeds)) {
    const paras = card.description.split('\n');
    if (paras.length === 1) assert.equal(paras[0], escapeMarkdown(verses[next].t), `${label} v${next + 1}`);
    else paras.forEach((para, i) => assert.equal(para, `**${verses[next + i].v}** ${escapeMarkdown(verses[next + i].t)}`, label));
    next += paras.length;
  }
  assert.equal(next, verses.length, label);
}
const MOCKUP_12 = 'd&c 4:2, moroni 10:4, jsh 1:17, ' + Array.from({ length: 9 }, (_, i) => `alma 32:${18 + i}`).join(', ');

test('Alma 32:21 → 1 page, count 1, no content', () => {
  const pages = pagesOf('Alma 32:21');
  assert.equal(pages.length, 1);
  assert.equal(pages[0].count, 1);
  assert.equal(pages[0].content, undefined);
  assert.equal(pages[0].embeds[0].title, 'Alma 32:21');
});

test('1 Nephi 3 → 5 pages of ≤ 1,500 characters, verses whole and in order, verse-span titles, page footers', () => {
  const pages = chapterPages('1nephi', 3);
  assert.equal(pages.length, 5);
  assertUnderLimits(pages, '1 Nephi 3');
  assertVersesWhole(pages, loadBook('1nephi').chapters[2].verses, '1 Nephi 3');
  let next = 1;
  pages.forEach((p, i) => {
    const [card] = p.embeds;
    const shown = card.description.split('\n').length;
    assert.equal(card.title, shown === 1 ? `1 Nephi 3:${next}` : `1 Nephi 3:${next}–${next + shown - 1}`);
    assert.deepEqual(card.footer, { text: `1 Nephi 3 · page ${i + 1} of ${pages.length}` });
    assert.equal(card.author?.name, 'Book of Mormon');
    assert.equal(p.content, undefined);
    next += shown;
  });
});

test('a one-page chapter has no footer and a verse-span title', () => {
  const pages = chapterPages('psalms', 117);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].embeds[0].title, 'Psalms 117:1–2');
  assert.equal(pages[0].embeds[0].footer, undefined);
});

test('Kirtland Era 13:3 (3,509 characters) → 1 page', () => {
  const pages = pagesOf('Kirtland Era 13:3');
  assert.equal(pages.length, 1);
  assertUnderLimits(pages, 'Kirtland Era 13:3');
});

test('a paged sermon chapter: date title, author names the page span, footer "Source: … · page n of N"', () => {
  const pages = chapterPages('kirtlandera', 20);
  assert.ok(pages.length >= 2);
  assertUnderLimits(pages, 'Kirtland Era 20');
  pages.forEach((p, i) => {
    const [card] = p.embeds;
    assert.equal(card.title, 'January 22, 1834');
    assert.match(card.author?.name ?? '', /^Sermons of the Prophet Joseph Smith · Kirtland Era 20:\d+(–\d+)?$/);
    assert.deepEqual(card.footer, { text: `Source: DHC 2:4-24 · page ${i + 1} of ${pages.length}` });
  });
});

test('a long single range pages like a chapter, footer "Alma 32 · page n of N", no content', () => {
  const pages = pagesOf('alma 32:1-43');
  assert.ok(pages.length >= 2);
  assertUnderLimits(pages, 'Alma 32:1-43');
  pages.forEach((p, i) => {
    assert.equal(p.content, undefined);
    assert.deepEqual(p.embeds[0].footer, { text: `Alma 32 · page ${i + 1} of ${pages.length}` });
  });
  assert.equal(paragraphs(pages).length, 43);
});

test('the 12-reference mockup list → one message, every card in order, reading list on every page (v1.1 page size)', () => {
  const list = refs(MOCKUP_12);
  assert.equal(list.length, 12);
  const pages = pagesOf(MOCKUP_12);
  // The page size, not the 10-card cap, decides the split (v1 was 10 + 2).
  assert.ok(pages[0].embeds.length < LIMITS.embedsPerMessage);
  assertUnderLimits(pages, 'mockup list');
  pages.forEach((p, i) => assert.equal(p.content, writeReadingList(list, i, pages.length)));
  assert.deepEqual(pages.flatMap((p) => p.embeds.map((e) => e.title)), [
    'D&C 4:2', 'Moroni 10:4', 'Joseph Smith—History 1:17',
    ...Array.from({ length: 9 }, (_, i) => `Alma 32:${18 + i}`),
  ]);
});

test('list pages are packed full: the next page\'s first card would not have fit', () => {
  const pages = pagesOf(MOCKUP_12);
  for (let i = 0; i + 1 < pages.length; i++) {
    const text = pages[i].embeds.reduce((n, e) => n + e.description.length, 0);
    const full = pages[i].embeds.length === LIMITS.embedsPerMessage;
    assert.ok(full || text + pages[i + 1].embeds[0].description.length > PAGE_TEXT, `page ${i + 1} had room`);
  }
});

test('a long range inside a list continues in consecutive cards; nothing is dropped', () => {
  const pages = pagesOf('alma 32:1-43, moroni 10:4');
  assertUnderLimits(pages, 'alma 32:1-43, moroni 10:4');
  const titles = pages.flatMap((p) => p.embeds.map((e) => e.title));
  assert.ok(titles.length >= 3);
  assert.equal(titles.at(-1), 'Moroni 10:4');
  const spans = titles.slice(0, -1).map((t) => /^Alma 32:(\d+)(?:–(\d+))?$/.exec(t));
  let next = 1;
  for (const m of spans) {
    assert.ok(m);
    assert.equal(Number(m[1]), next);
    next = Number(m[2] ?? m[1]) + 1;
  }
  assert.equal(next, 44);
  if (pages.length > 1) pages.forEach((p, i) => assert.equal(p.content, writeReadingList(refs('alma 32:1-43, moroni 10:4'), i, pages.length)));
});

test('a 200-reference list → tooLong', () => {
  const input = Array.from({ length: 200 }, (_, i) => `alma 32:${(i % 43) + 1}`).join(', ');
  assert.deepEqual(versePages(refs(input)), { ok: false, tooLong: true });
});

test('count > 1 is the only paging signal: single-page results have count 1 and no content', () => {
  for (const input of ['Alma 32:21', 'Alma 32:21-23', 'd&c 4:2, moroni 10:4, jsh 1:17', 'Kirtland Era 13:3']) {
    const pages = pagesOf(input);
    assert.equal(pages.length, 1, input);
    assert.equal(pages[0].count, 1, input);
    assert.equal(pages[0].content, undefined, input);
  }
  for (const input of [MOCKUP_12, 'alma 32:1-43']) assert.ok(pagesOf(input).every((p, _, all) => p.count === all.length && all.length > 1), input);
});

test('every chapter in the library pages under every limit with every verse whole and in order', () => {
  for (const b of loadIndex()) {
    loadBook(b.key).chapters.forEach((c) => {
      const pages = chapterPages(b.key, c.n);
      const label = `${b.display} ${c.n}`;
      assertUnderLimits(pages, label);
      assertVersesWhole(pages, c.verses, label);
    });
  }
});

test('/define faith → Webster card: header paragraph, then numbered senses in bold', () => {
  const entry = loadWebster('faith');
  assert.ok(entry);
  const pages = definePages('faith', entry);
  assertUnderLimits(pages, 'faith');
  const [card] = pages[0].embeds;
  assert.equal(card.author?.name, "Webster's 1828 Dictionary");
  assert.equal(card.title, 'faith');
  const paras = paragraphs(pages);
  assert.ok(paras[0].startsWith('FAITH, noun [Latin fides'));
  assert.ok(paras[1].startsWith('**1.** Belief; the assent of the mind'));
  pages.forEach((p, i) => assert.deepEqual(p.embeds[0].footer, pages.length > 1 ? { text: `page ${i + 1} of ${pages.length}` } : undefined));
});

test('/define hand → a sense longer than a page continues on the next page at a paragraph break', () => {
  const entry = loadWebster('hand');
  assert.ok(entry);
  const pages = definePages('hand', entry);
  assert.ok(pages.length >= 2);
  assertUnderLimits(pages, 'hand');
});

test('every Webster entry pages under every limit with its paragraphs whole and in order', () => {
  const webster = JSON.parse(readFileSync(new URL('../data/source/webster1828.json', import.meta.url), 'utf8')) as Record<string, string>;
  for (const [word, entry] of Object.entries(webster)) {
    const pages = definePages(word, entry);
    assertUnderLimits(pages, word);
    const plain = paragraphs(pages).map((p) => p.replace(/^\*\*(\d+)\.\*\*/, '$1.'));
    const expected = entry.split(/\n\s*\n/).filter((p) => p.trim()).map((p) => escapeMarkdown(p.trim()));
    assert.deepEqual(plain, expected, word);
    if (pages.length === 1) assert.equal(pages[0].embeds[0].footer, undefined, word);
  }
});

test('a dictionary sense (or header) that fits one page is never split across pages', () => {
  const webster = JSON.parse(readFileSync(new URL('../data/source/webster1828.json', import.meta.url), 'utf8')) as Record<string, string>;
  let checked = 0;
  for (const [word, entry] of Object.entries(webster)) {
    const pages = definePages(word, entry);
    for (const unit of websterUnits(entry)) {
      const text = unit.join('\n');
      if (text.length > PAGE_TEXT) continue;
      assert.ok(pages.some((p) => p.embeds[0].description.includes(text)), `${word}: ${text.slice(0, 40)}`);
      checked++;
    }
  }
  assert.ok(checked > 8_368);
});
