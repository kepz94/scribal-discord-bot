// Paging for Scribal Bot for Discord v1 (SBD-4): SRD §6 "Paging", decisions 10–12 and 19.
// A page never splits a verse or a dictionary paragraph, and stays under every LIMITS value:
//   card text ≤ embedDescription · cards per message ≤ embedsPerMessage · card text per message ≤ embedTotalPerMessage
//   · content ≤ messageContent. Page.index is 0-based; buttons are shown iff count > 1.
import { LIMITS } from './limits.ts';
import { loadBook, type BookKey } from './library.ts';
import { PARAGRAPH_GAP, defineCard, scriptureCard, verseParagraph, websterUnits, type Embed } from './cards.ts';
import { writeReadingList } from './readingList.ts';
import { formatRef, type Ref } from './reference.ts';

export type Page = { content?: string; embeds: Embed[]; index: number; count: number };

const embedChars = (e: Embed): number =>
  e.author.name.length + e.title.length + e.description.length + (e.footer?.text.length ?? 0);

// Greedy packing of paragraphs into groups whose joined text fits `limit`. A paragraph longer than `limit` throws.
function packParagraphs(groups: string[][], paragraphs: string[], limit: number): void {
  for (const para of paragraphs) {
    if (para.length > limit) throw new Error(`A paragraph of ${para.length} characters cannot fit one card`);
    const cur = groups.at(-1);
    if (cur && cur.join(PARAGRAPH_GAP).length + PARAGRAPH_GAP.length + para.length <= limit) cur.push(para);
    else groups.push([para]);
  }
}

// The fewest consecutive parts of one chapter span whose card text fits LIMITS.embedDescription. Lengths are
// measured with verse numbers on; a one-verse part drops its number and only gets shorter.
function splitSpan(ref: Ref): Ref[] {
  const chapter = loadBook(ref.key).chapters[ref.ch - 1];
  if (!chapter) throw new Error(`No chapter ${formatRef({ ...ref, from: 1, to: 1 }, 'list')}`);
  const groups: string[][] = [];
  const numbers: number[][] = [];
  for (let v = ref.from; v <= ref.to; v++) {
    const before = groups.length;
    packParagraphs(groups, [verseParagraph(v, chapter.verses[v - 1].t, true)], LIMITS.embedDescription);
    if (groups.length > before) numbers.push([]);
    numbers[numbers.length - 1].push(v);
  }
  return numbers.map((vs) => ({ key: ref.key, ch: ref.ch, from: vs[0], to: vs[vs.length - 1] }));
}

// Greedy packing of cards into messages under LIMITS.embedsPerMessage and LIMITS.embedTotalPerMessage.
function packCards(cards: Embed[]): Embed[][] {
  const pages: Embed[][] = [];
  let used = 0;
  for (const card of cards) {
    const cur = pages.at(-1);
    const len = embedChars(card);
    if (cur && cur.length < LIMITS.embedsPerMessage && used + len <= LIMITS.embedTotalPerMessage) {
      cur.push(card);
      used += len;
    } else {
      pages.push([card]);
      used = len;
    }
  }
  return pages;
}

// One chapter or one range on one card per page; the footer gives the position when it pages.
function spanPages(ref: Ref): Page[] {
  const parts = splitSpan(ref);
  const count = parts.length;
  return parts.map((part, i) => ({
    embeds: [scriptureCard(part, count > 1 ? { n: i + 1, of: count } : undefined)],
    index: i,
    count,
  }));
}

// /verse. One reference: like a chapter (decision 11). Several: one card per reference in typed order, a long range
// continuing in consecutive cards (decision 2026-10-16), all in ONE message; when that takes more than one page
// every page carries the reading list (decision 19). A list whose reading list cannot fit the message content is
// refused before any page is built.
export function versePages(refs: Ref[]): { ok: true; pages: Page[] } | { ok: false; tooLong: true } {
  if (refs.length === 0) throw new Error('versePages needs at least one reference');
  if (refs.length === 1) return { ok: true, pages: spanPages(refs[0]) };

  // More references than cards per message always page, and "page 1 of 2" is the shortest possible header.
  if (refs.length > LIMITS.embedsPerMessage && writeReadingList(refs, 0, 2).length > LIMITS.messageContent) {
    return { ok: false, tooLong: true };
  }
  const groups = packCards(refs.flatMap((r) => splitSpan(r).map((part) => scriptureCard(part))));
  const count = groups.length;
  if (count === 1) return { ok: true, pages: [{ embeds: groups[0], index: 0, count }] };
  // The last page carries the longest header ("page N of N").
  if (writeReadingList(refs, count - 1, count).length > LIMITS.messageContent) return { ok: false, tooLong: true };
  return { ok: true, pages: groups.map((embeds, i) => ({ content: writeReadingList(refs, i, count), embeds, index: i, count })) };
}

// /chapter: the whole chapter, one card per page.
export function chapterPages(key: BookKey, ch: number): Page[] {
  const chapter = loadBook(key).chapters[ch - 1];
  if (!chapter) throw new Error(`No chapter ${ch} in ${key}`);
  return spanPages({ key, ch, from: 1, to: chapter.verses.length });
}

// /define: one card per page. A sense (or the header) that fits a page is never split; one longer than a page is
// packed paragraph by paragraph from the current page on, so it breaks across pages only between paragraphs.
export function definePages(word: string, entry: string): Page[] {
  const limit = LIMITS.embedDescription;
  const groups: string[][] = [];
  for (const unit of websterUnits(entry)) {
    const cur = groups.at(-1);
    const unitText = unit.join(PARAGRAPH_GAP);
    if (unitText.length > limit) packParagraphs(groups, unit, limit);
    else if (cur && cur.join(PARAGRAPH_GAP).length + PARAGRAPH_GAP.length + unitText.length <= limit) cur.push(...unit);
    else groups.push([...unit]);
  }
  if (groups.length === 0) throw new Error(`Empty dictionary entry for ${word}`);
  const count = groups.length;
  return groups.map((paras, i) => ({
    embeds: [defineCard(word, paras.join(PARAGRAPH_GAP), count > 1 ? { n: i + 1, of: count } : undefined)],
    index: i,
    count,
  }));
}
