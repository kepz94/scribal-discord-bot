// Reading-list line for Scribal Bot for Discord v1 (SBD-4, decision 19).
// A multi-reference /verse reply that pages keeps its whole list in the message content, on every page:
//   **Reading list** · N references · page n of N
//   D&C 4:2 · Moroni 10:4 · Alma 32:21-23
// A button press re-reads it from the message, so ranges are written with a hyphen (re-resolvable).
import { formatRef, type Ref } from './reference.ts';

const HEAD = /^\*\*Reading list\*\* · (\d+) references? · page (\d+) of (\d+)$/;
const SEPARATOR = ' · ';

// page is 0-based (Page.index); the line shows it 1-based.
export function writeReadingList(refs: Ref[], page: number, count: number): string {
  const n = refs.length;
  const head = `**Reading list** · ${n} reference${n === 1 ? '' : 's'} · page ${page + 1} of ${count}`;
  return `${head}\n${refs.map((r) => formatRef(r, 'list')).join(SEPARATOR)}`;
}

// The list as "ref, ref, …" for resolveList, or null when the content is not exactly a reading list:
// two lines, the header shape above, page within 1..N, and as many references as the header counts.
export function readReadingList(content: string): string | null {
  const lines = content.split('\n');
  if (lines.length !== 2 || lines[1] === '') return null;
  const m = HEAD.exec(lines[0]);
  if (!m) return null;
  const page = Number(m[2]);
  if (page < 1 || page > Number(m[3])) return null;
  const items = lines[1].split(SEPARATOR);
  return items.length === Number(m[1]) ? items.join(', ') : null;
}
