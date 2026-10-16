// Reference resolver for Scribal Bot for Discord v1 (SBD-3). Rules: SRD §5 exactly — the stored reference
// plus the JSM/JSH aliases, lowercase, all whitespace removed, exact match. No other abbreviation, no fuzzy match.
//
// Checks run in this order and the first failure is returned:
//   1. nothing typed                                  → malformed
//   2. book: no stored book name                      → unknownBook (malformed if no name was typed at all)
//            a book name with no chapter              → malformed
//   3. text after the book is not ch / ch:v / ch:v-v   → malformed (range separator: hyphen or en dash)
//   4. ch:v-ch2:v2                                    → crossChapter if ch2 ≠ ch, malformed if ch2 = ch
//      ch with no verse (resolveList)                 → noVerse
//      ch:v given to resolveChapter                   → malformed
//   5. chapter outside 1..N                           → chapterOutOfRange
//   6. from or to outside 1..verses                   → verseOutOfRange
//   7. to < from                                      → reversedRange (the swapped range is then always valid)
import { loadIndex, type BookKey, type IndexBook } from './library.ts';

export type Ref = { key: BookKey; ch: number; from: number; to: number };

export type RefError = {
  kind: 'malformed' | 'unknownBook' | 'chapterOutOfRange' | 'verseOutOfRange' | 'reversedRange' | 'crossChapter' | 'noVerse';
  input: string;
  message: string;
};

type Fail = { ok: false; error: RefError };

// The only abbreviations (SRD §5, decision 5), matched on normalized input.
const ALIASES: Record<string, string> = { jsm: 'Joseph Smith—Matthew', jsh: 'Joseph Smith—History' };

// ch, optional :v, optional range end (-v or -ch:v) with a hyphen or en dash (decision 2026-10-16).
const REST = /^(\d+)(?::(\d+)(?:[-–](?:(\d+):)?(\d+))?)?$/;
// The typed chapter/verse tail, removed from the input to name an unknown book as typed.
const TYPED_TAIL = /\s*\d[\d\s:\-–]*$/;

const normalize = (s: string): string => s.toLowerCase().replace(/\s+/g, '');

let books: Map<BookKey, IndexBook> | undefined;
let keysLongestFirst: BookKey[] = [];
function bookMap(): Map<BookKey, IndexBook> {
  if (!books) {
    books = new Map(loadIndex().map((b) => [b.key, b]));
    keysLongestFirst = [...books.keys()].sort((a, b) => b.length - a.length);
  }
  return books;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

function failure(kind: RefError['kind'], input: string, message: string): Fail {
  return { ok: false, error: { kind, input, message } };
}
const malformed = (input: string): Fail =>
  failure('malformed', input, `Couldn't read “${input}” as a reference. Try Alma 32:21 or Alma 32:21-23.`);

// Steps 1–3: find the book and split the chapter/verse text into numbers.
function parse(input: string):
  | { ok: true; book: IndexBook; ch: number; from?: number; ch2?: number; to?: number }
  | Fail {
  let n = normalize(input);
  if (n === '') return malformed(input);

  const alias = Object.keys(ALIASES).find((a) => n.startsWith(a) && (n.length === a.length || /\d/.test(n[a.length])));
  if (alias) n = normalize(ALIASES[alias]) + n.slice(alias.length);

  const map = bookMap();
  const key = keysLongestFirst.find((k) => n.startsWith(k) && /\d/.test(n.charAt(k.length)));
  if (!key) {
    if (map.has(n)) return malformed(input);
    const typedBook = input.replace(TYPED_TAIL, '').trim();
    return typedBook === '' ? malformed(input) : failure('unknownBook', input, `No book called ${typedBook}.`);
  }

  const m = REST.exec(n.slice(key.length));
  if (!m) return malformed(input);
  const num = (s: string | undefined): number | undefined => (s === undefined ? undefined : Number(s));
  return { ok: true, book: map.get(key) as IndexBook, ch: Number(m[1]), from: num(m[2]), ch2: num(m[3]), to: num(m[4]) };
}

function resolveOne(input: string): { ok: true; ref: Ref } | Fail {
  const p = parse(input);
  if (!p.ok) return p;
  const { book, ch } = p;

  if (p.ch2 !== undefined && p.ch2 !== ch) {
    return failure('crossChapter', input, 'A range stays within one chapter. Use two references or /chapter.');
  }
  if (p.ch2 !== undefined) return malformed(input);
  if (p.from === undefined) return failure('noVerse', input, 'Add a verse number, or use /chapter.');

  if (ch < 1 || ch > book.chapters.length) {
    return failure('chapterOutOfRange', input, `${book.display} has ${plural(book.chapters.length, 'chapter')}.`);
  }
  const from = p.from;
  const to = p.to ?? from;
  const verses = book.chapters[ch - 1];
  if (from < 1 || from > verses || to < 1 || to > verses) {
    return failure('verseOutOfRange', input, `${book.display} ${ch} has ${plural(verses, 'verse')}.`);
  }
  if (to < from) {
    const swapped = formatRef({ key: book.key, ch, from: to, to: from }, 'list');
    return failure('reversedRange', input, `Put the lower verse first: ${swapped}.`);
  }
  return { ok: true, ref: { key: book.key, ch, from, to } };
}

// Comma-separated references for /verse: typed order kept, duplicates kept, empty parts ignored
// (decision 2026-10-16). The first failing part is returned; a list with no parts is malformed.
export function resolveList(input: string): { ok: true; refs: Ref[] } | { ok: false; error: RefError } {
  const parts = input.split(',').map((s) => s.trim()).filter((s) => s !== '');
  if (parts.length === 0) return malformed(input.trim());
  const refs: Ref[] = [];
  for (const part of parts) {
    const r = resolveOne(part);
    if (!r.ok) return r;
    refs.push(r.ref);
  }
  return { ok: true, refs };
}

// One chapter for /chapter. A verse is not accepted here (decision 2026-10-16).
export function resolveChapter(input: string): { ok: true; key: BookKey; ch: number } | { ok: false; error: RefError } {
  const typed = input.trim();
  const p = parse(typed);
  if (!p.ok) return p;
  if (p.from !== undefined) return malformed(typed);
  if (p.ch < 1 || p.ch > p.book.chapters.length) {
    return failure('chapterOutOfRange', typed, `${p.book.display} has ${plural(p.book.chapters.length, 'chapter')}.`);
  }
  return { ok: true, key: p.book.key, ch: p.ch };
}

// Stored display name + ch:v. Ranges: en dash for a card title, hyphen for a reading list (re-resolvable).
export function formatRef(r: Ref, style: 'title' | 'list'): string {
  const book = bookMap().get(r.key);
  if (!book) throw new Error(`Unknown book key: ${r.key}`);
  const base = `${book.display} ${r.ch}:${r.from}`;
  return r.to === r.from ? base : `${base}${style === 'title' ? '–' : '-'}${r.to}`;
}
