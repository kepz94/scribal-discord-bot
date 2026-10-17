// Layout A "Card" builders for Scribal Bot for Discord v1 (SBD-4): SRD §6 "Reply layout" + approved mockup v4.
//   author  volume; sermon: "Sermons of the Prophet Joseph Smith · Kirtland Era 1:1"
//   title   stored reference ("Alma 32:21–23"); sermon: its date label ("Nov., 1831" / "Sermon 8")
//   body    one paragraph per verse, a blank line between (decision 2026-10-16);
//           "**N** text" when the card shows more than one verse, the text alone when it shows one
//   footer  only when needed: "<Book ch> · page n of N" when a chapter or range pages;
//           sermon "Source: <citation>", plus " · page n of N" when it pages (decision 2026-10-16)
import { loadBook, loadIndex, type BookKey, type IndexBook } from './library.ts';
import { escapeMarkdown } from './markdown.ts';
import { formatRef, type Ref, type RefError } from './reference.ts';

export const CARD_COLOR = 0x8b5cf6; // Scribal violet
export const PARAGRAPH_GAP = '\n\n';
export const WEBSTER_AUTHOR = "Webster's 1828 Dictionary";

export type Embed = { author: { name: string }; title: string; description: string; footer?: { text: string }; color: number };

// Position of a card's page when one chapter, range or definition pages across messages (1-based).
export type PagePosition = { n: number; of: number };

let books: Map<BookKey, IndexBook> | undefined;
function bookOf(key: BookKey): IndexBook {
  books ??= new Map(loadIndex().map((b) => [b.key, b]));
  const book = books.get(key);
  if (!book) throw new Error(`Unknown book key: ${key}`);
  return book;
}

export const verseParagraph = (v: number, text: string, numbered: boolean): string =>
  numbered ? `**${v}** ${escapeMarkdown(text)}` : escapeMarkdown(text);

// One card for verses span.from..span.to of one chapter.
export function scriptureCard(span: Ref, page?: PagePosition): Embed {
  const book = bookOf(span.key);
  const chapter = loadBook(span.key).chapters[span.ch - 1];
  if (!chapter || span.from < 1 || span.to > chapter.verses.length || span.to < span.from) {
    throw new Error(`No verses ${formatRef(span, 'list')}`);
  }
  const numbered = span.to > span.from;
  const description = chapter.verses
    .slice(span.from - 1, span.to)
    .map((v) => verseParagraph(v.v, v.t, numbered))
    .join(PARAGRAPH_GAP);
  const sermon = book.sermons?.[span.ch - 1];
  const position = page ? `page ${page.n} of ${page.of}` : undefined;
  const embed: Embed = {
    author: { name: sermon ? `${book.volume} · ${formatRef(span, 'title')}` : book.volume },
    title: sermon ? sermon.label : formatRef(span, 'title'),
    description,
    color: CARD_COLOR,
  };
  const footer = sermon
    ? [`Source: ${sermon.citation}`, position].filter((s) => s !== undefined).join(' · ')
    : position && `${book.display} ${span.ch} · ${position}`;
  if (footer) embed.footer = { text: footer };
  return embed;
}

// A Webster entry as display paragraphs grouped by sense, following Scribal's own split
// (kepz94/scribaltest2@ad95be0 scribaltest1-main/src/webster.ts parseSenses): paragraphs are separated by blank
// lines; a paragraph opening "N. " starts a sense; any other paragraph belongs to the sense above it, or to the
// header before sense 1. A sense number is shown bold ("**1.** Belief; …").
export function websterUnits(entry: string): string[][] {
  const header: string[] = [];
  const senses: string[][] = [];
  for (const raw of entry.split(/\n\s*\n/)) {
    const para = raw.trim();
    if (para === '') continue;
    const m = /^(\d+)\.\s/.exec(para);
    if (m) senses.push([`**${m[1]}.**${escapeMarkdown(para.slice(m[1].length + 1))}`]);
    else if (senses.length > 0) senses[senses.length - 1].push(escapeMarkdown(para));
    else header.push(escapeMarkdown(para));
  }
  return header.length > 0 ? [header, ...senses] : senses;
}

export function defineCard(word: string, description: string, page?: PagePosition): Embed {
  const embed: Embed = { author: { name: WEBSTER_AUTHOR }, title: word, description, color: CARD_COLOR };
  if (page) embed.footer = { text: `page ${page.n} of ${page.of}` };
  return embed;
}

// The ephemeral error line for a reference error, with the name in bold as in mockup v4 ("No book called
// **Doctrine and Covenants**.", "**Alma** has 63 chapters.") and the user's typed text escaped. The patterns
// match the fixed messages src/reference.ts writes; anything else is shown escaped as it is.
export function errorText(e: RefError): string {
  let m: RegExpExecArray | null;
  switch (e.kind) {
    case 'unknownBook':
      if ((m = /^No book called (.*)\.$/s.exec(e.message))) return `No book called **${escapeMarkdown(m[1])}**.`;
      break;
    case 'chapterOutOfRange':
    case 'verseOutOfRange':
      if ((m = /^(.*) has (\d+ (?:chapter|verse)s?)\.$/s.exec(e.message))) return `**${escapeMarkdown(m[1])}** has ${m[2]}.`;
      break;
    case 'malformed':
      if ((m = /^Couldn't read “(.*)” as a reference\. (.*)$/s.exec(e.message))) {
        return `Couldn't read “${escapeMarkdown(m[1])}” as a reference. ${m[2]}`;
      }
      break;
  }
  return escapeMarkdown(e.message);
}
