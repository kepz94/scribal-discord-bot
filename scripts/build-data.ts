// Build step for Scribal Bot for Discord v1 (SBD-2): split the committed library snapshot into data/gen.
// `npm run build` deletes data/gen and writes it again in full:
//   index.json              IndexBook[] in canonical order
//   books/<key>.json        BookFile per book
//   webster/<a-z|other>.json  entries by first letter of the key (all 27 files, empty ones included)
//   search/<volume-index>.json  SearchRow[] per volume, index = position in scriptures.json
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITS } from '../src/limits.ts';
import { GEN_DIR, websterPartition, type BookFile, type BookKey, type IndexBook, type SearchRow } from '../src/library.ts';
import { isSermonsVolume, sermonLabel } from '../src/vendor/sermons.ts';

interface SourceVerse { reference: string; text: string; verse: number }
interface SourceChapter { chapter: number; reference: string; title?: string; verses: SourceVerse[] }
interface SourceBook { book: string; chapters: SourceChapter[] }
interface SourceVolume { volume: string; books: SourceBook[] }

const SOURCE_DIR = fileURLToPath(new URL('../data/source/', import.meta.url));
const WEBSTER_PARTS = [...'abcdefghijklmnopqrstuvwxyz', 'other'];

// The stored chapter reference minus its chapter number ("D&C 4" -> "D&C"). Never the book title.
function displayOf(chapter: SourceChapter): string {
  const m = /^(.*\S)\s+(\d+)$/.exec(chapter.reference);
  if (!m || Number(m[2]) !== chapter.chapter) {
    throw new Error(`Chapter reference "${chapter.reference}" does not end in its chapter number ${chapter.chapter}`);
  }
  return m[1];
}

// SRD §5 normalization: lowercase, every whitespace character removed.
const toBookKey = (display: string): BookKey => display.toLowerCase().replace(/\s+/g, '');

// The part of a sermon title after the em dash ("Nov., 1831 — DHC 1:235-236" -> "DHC 1:235-236").
// A title with no em dash is the citation whole (decision 2026-10-16: 17 bare citations and Nauvoo Era 100's bare date).
function sermonCitation(title: string | undefined): string {
  if (!title) return '';
  const i = title.indexOf('—');
  return (i < 0 ? title : title.slice(i + 1)).trim();
}

const readSource = <T>(name: string): T => JSON.parse(readFileSync(join(SOURCE_DIR, name), 'utf8')) as T;
const writeGen = (value: unknown, ...parts: string[]): void => writeFileSync(join(GEN_DIR, ...parts), JSON.stringify(value));

const scriptures = readSource<{ volumes: SourceVolume[] }>('scriptures.json');
const webster = readSource<Record<string, string>>('webster1828.json');

rmSync(GEN_DIR, { recursive: true, force: true });
for (const dir of ['books', 'webster', 'search']) mkdirSync(join(GEN_DIR, dir), { recursive: true });

const index: IndexBook[] = [];
const keys = new Set<BookKey>();
let verseCount = 0;

scriptures.volumes.forEach((vol, volumeIndex) => {
  const rows: SearchRow[] = [];
  for (const book of vol.books) {
    const display = displayOf(book.chapters[0]);
    book.chapters.forEach((ch, i) => {
      if (ch.chapter !== i + 1) throw new Error(`${book.book}: chapter ${ch.chapter} at position ${i + 1}`);
      if (displayOf(ch) !== display) throw new Error(`${book.book}: "${ch.reference}" does not start with "${display}"`);
      ch.verses.forEach((v, j) => {
        if (v.verse !== j + 1) throw new Error(`${ch.reference}: verse ${v.verse} at position ${j + 1}`);
      });
    });

    const key = toBookKey(display);
    if (keys.has(key)) throw new Error(`Duplicate book key "${key}" (${display})`);
    if (/[/\\]/.test(key)) throw new Error(`Book key "${key}" cannot be a file name`);
    keys.add(key);

    const entry: IndexBook = { key, display, volume: vol.volume, chapters: book.chapters.map((c) => c.verses.length) };
    if (isSermonsVolume(vol.volume)) {
      entry.sermons = book.chapters.map((c) => ({
        label: sermonLabel(c.title, c.chapter),
        citation: sermonCitation(c.title),
        first: c.verses[0].text.slice(0, LIMITS.choiceName),
      }));
    }
    index.push(entry);

    const file: BookFile = {
      chapters: book.chapters.map((c) => ({
        n: c.chapter,
        ...(c.title === undefined ? {} : { title: c.title }),
        verses: c.verses.map((v) => ({ v: v.verse, t: v.text })),
      })),
    };
    writeGen(file, 'books', `${key}.json`);

    for (const c of book.chapters) {
      for (const v of c.verses) rows.push({ ref: v.reference, volume: vol.volume, t: v.text });
    }
    verseCount += book.chapters.reduce((n, c) => n + c.verses.length, 0);
  }
  writeGen(rows, 'search', `${volumeIndex}.json`);
});

writeGen(index, 'index.json');

const websterFiles = new Map<string, Record<string, string>>(WEBSTER_PARTS.map((p) => [p, {}]));
for (const [word, text] of Object.entries(webster)) {
  const part = websterFiles.get(websterPartition(word));
  if (!part) throw new Error(`No Webster file for "${word}"`);
  part[word] = text;
}
for (const [p, entries] of websterFiles) writeGen(entries, 'webster', `${p}.json`);

console.log(
  `build-data: ${scriptures.volumes.length} volumes, ${index.length} books, ${verseCount} verses, ` +
    `${Object.keys(webster).length} Webster entries -> ${GEN_DIR}`,
);
