// Library loaders for Scribal Bot for Discord v1 (SBD-2).
// Read the files scripts/build-data.ts writes to data/gen; each file is parsed once per process and kept.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Normalized stored reference prefix minus the chapter number ("D&C 4" -> "d&c"), never the book title.
export type BookKey = string;

export interface SermonEntry {
  label: string; // sermonLabel(): the date, or "Sermon N" when the title has none
  citation: string; // title after the em dash; the whole title when there is no em dash
  first: string; // first verse, cut to LIMITS.choiceName characters
}

export interface IndexBook {
  key: BookKey;
  display: string; // stored reference prefix as written ("D&C", "Joseph Smith—History")
  volume: string;
  chapters: number[]; // verse counts; chapters[i] is chapter i + 1
  sermons?: SermonEntry[]; // sermons volume only; sermons[i] is chapter i + 1
}

export interface BookChapter {
  n: number;
  title?: string;
  verses: { v: number; t: string }[];
}

export interface BookFile {
  chapters: BookChapter[];
}

export interface SearchRow {
  ref: string;
  volume: string;
  t: string;
}

export const GEN_DIR = fileURLToPath(new URL('../data/gen/', import.meta.url));

// Webster entries are split into one file per first letter a–z; any other first character goes to "other".
export const websterPartition = (key: string): string => (/^[a-z]/.test(key) ? key[0] : 'other');

const readJson = <T>(...parts: string[]): T => JSON.parse(readFileSync(join(GEN_DIR, ...parts), 'utf8')) as T;

let index: IndexBook[] | undefined;
const books = new Map<BookKey, BookFile>();
const websterParts = new Map<string, Record<string, string>>();
const searchParts = new Map<number, SearchRow[]>();

// Every book in canonical order.
export function loadIndex(): IndexBook[] {
  index ??= readJson<IndexBook[]>('index.json');
  return index;
}

// One book's chapters and verses. A key not in the index throws, so no other path is ever read.
export function loadBook(key: BookKey): BookFile {
  let book = books.get(key);
  if (!book) {
    if (!loadIndex().some((b) => b.key === key)) throw new Error(`Unknown book key: ${key}`);
    book = readJson<BookFile>('books', `${key}.json`);
    books.set(key, book);
  }
  return book;
}

// The 1828 entry stored under exactly this dictionary key (keys are lowercase headwords), or undefined.
export function loadWebster(word: string): string | undefined {
  const part = websterPartition(word);
  let entries = websterParts.get(part);
  if (!entries) {
    entries = readJson<Record<string, string>>('webster', `${part}.json`);
    websterParts.set(part, entries);
  }
  return Object.hasOwn(entries, word) ? entries[word] : undefined;
}

// The volume names in canonical order (position = search file index).
export function loadVolumes(): string[] {
  return [...new Set(loadIndex().map((b) => b.volume))];
}

// Search rows for one volume (by name), or for every volume in canonical order. An unknown volume throws.
export function loadSearchCorpus(volume?: string): SearchRow[] {
  const volumes = loadVolumes();
  if (volume === undefined) return volumes.flatMap((_, i) => searchPart(i));
  const i = volumes.indexOf(volume);
  if (i < 0) throw new Error(`Unknown volume: ${volume}`);
  return searchPart(i);
}

function searchPart(i: number): SearchRow[] {
  let rows = searchParts.get(i);
  if (!rows) {
    rows = readJson<SearchRow[]>('search', `${i}.json`);
    searchParts.set(i, rows);
  }
  return rows;
}
