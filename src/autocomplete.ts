// Autocomplete for Scribal Bot for Discord v1 M2 (SBD-11): suggestions for the /verse and /chapter `reference`
// option, built from index.json only (never a book file). Layout: mockup v4 "Typing a reference" with Kepu's
// decisions of 2026-10-17. Deterministic map (Architecture), on the text after the last comma, normalized and with
// the JSM/JSH aliases applied exactly as the resolver applies them:
//   empty                         → the first 25 books, bare names ("Genesis")
//   starts with a sermon-era key  → that era's sermons "Era N · date · first words"; the number prefix-matches
//                                   until ":" is typed, then it is exact
//   prefix of a book key, or a whole key followed by a digit
//                                 → those books in canonical order, "Alma 32:21 · Book of Mormon · 63 chapters"
//   anything else                 → []
// The value is the reference alone ("Alma 32:21"). In a /verse list the earlier part (up to the last comma) is kept
// in both the name and the value. Names over LIMITS.choiceName are cut to fit with "…"; a value over
// LIMITS.choiceValue is not offered; at most LIMITS.autocompleteChoices are returned.
import { loadIndex, type IndexBook } from './library.ts';
import { LIMITS } from './limits.ts';

export type Choice = { name: string; value: string };
export type AutocompleteInteraction = {
  type: number;
  data?: { name?: unknown; options?: { name: string; type?: number; value?: unknown; focused?: boolean }[] };
};

// The resolver's aliases (src/reference.ts, SRD §5 decision 5).
const ALIASES: Record<string, string> = { jsm: 'Joseph Smith—Matthew', jsh: 'Joseph Smith—History' };
const normalize = (s: string): string => s.toLowerCase().replace(/\s+/g, '');
const fitName = (s: string): string => (s.length > LIMITS.choiceName ? `${s.slice(0, LIMITS.choiceName - 1)}…` : s);
const chapters = (b: IndexBook): string => `${b.chapters.length} chapter${b.chapters.length === 1 ? '' : 's'}`;

function sermonChoices(era: IndexBook, rest: string): Choice[] {
  const [, digits, after] = /^(\d*)(.*)$/.exec(rest) as RegExpExecArray;
  return (era.sermons ?? []).flatMap((s, i) => {
    const n = String(i + 1);
    const hit = after === '' ? n.startsWith(digits) : n === digits;
    const value = `${era.display} ${n}${after}`;
    return hit ? [{ name: `${value} · ${s.label} · ${s.first}`, value }] : [];
  });
}

function bookChoices(books: IndexBook[], q: string): Choice[] {
  return books.flatMap((b) => {
    const whole = q.startsWith(b.key) && /\d/.test(q.charAt(b.key.length));
    if (!whole && !b.key.startsWith(q)) return [];
    const value = whole ? `${b.display} ${q.slice(b.key.length)}` : b.display;
    return [{ name: `${value} · ${b.volume} · ${chapters(b)}`, value }];
  });
}

export function suggest(input: string): Choice[] {
  const comma = input.lastIndexOf(',');
  const earlier = comma < 0 ? '' : `${input.slice(0, comma + 1)} `;
  let q = normalize(input.slice(comma + 1));
  const alias = Object.keys(ALIASES).find((a) => q.startsWith(a) && (q.length === a.length || /\d/.test(q[a.length])));
  if (alias) q = normalize(ALIASES[alias]) + q.slice(alias.length);

  const books = loadIndex();
  const era = books.find((b) => b.sermons && q.startsWith(b.key));
  const found =
    q === '' ? books.map((b) => ({ name: b.display, value: b.display })) : era ? sermonChoices(era, q.slice(era.key.length)) : bookChoices(books, q);
  return found
    .map((c) => ({ name: fitName(earlier + c.name), value: earlier + c.value }))
    .filter((c) => c.value.length <= LIMITS.choiceValue)
    .slice(0, LIMITS.autocompleteChoices);
}

// Type 4 (APPLICATION_COMMAND_AUTOCOMPLETE) → type 8 (APPLICATION_COMMAND_AUTOCOMPLETE_RESULT). Only the focused
// `reference` option of /verse or /chapter gets suggestions; anything else gets none.
export function autocomplete(interaction: AutocompleteInteraction): { type: 8; data: { choices: Choice[] } } {
  const focused = interaction.data?.options?.find((o) => o.focused === true);
  const command = interaction.data?.name;
  const wanted = (command === 'verse' || command === 'chapter') && focused?.name === 'reference' && typeof focused.value === 'string';
  return { type: 8, data: { choices: wanted ? suggest(focused.value as string) : [] } };
}
