// Search for Scribal Bot for Discord v1 M2 (SBD-9), using Scribal's own matcher verbatim (src/vendor/searchMatch.ts)
// with Scribal's defaults: mode "phrase", whole words (Architecture global constraint). As in Scribal's search
// screen, each verse's lowercased text is tested and hits come in canonical order; highlighting joins the matcher's
// term sources into one case-insensitive pattern.
import { buildSearchMatcher } from './vendor/searchMatch.ts';
import { loadSearchCorpus, type SearchRow } from './library.ts';

export type SearchResult = { total: number; perVolume: Record<string, number>; hits: SearchRow[]; terms: string[] };

// null when the query has nothing to search for (blank, or only "&" / "*").
export function search(query: string, volume?: string): SearchResult | null {
  const matcher = buildSearchMatcher(query, 'phrase', true);
  if (!matcher) return null;
  const hits = loadSearchCorpus(volume).filter((row) => matcher.test(row.t.toLowerCase()));
  const perVolume: Record<string, number> = {};
  for (const h of hits) perVolume[h.volume] = (perVolume[h.volume] ?? 0) + 1;
  return { total: hits.length, perVolume, hits, terms: matcher.terms };
}

// Scribal's highlight pattern: "(term|term…)", global, case-insensitive; null when the sources do not compile.
export function highlighter(terms: string[]): RegExp | null {
  if (terms.length === 0) return null;
  try {
    return new RegExp(`(${terms.join('|')})`, 'gi');
  } catch {
    return null;
  }
}

// Context before the first match that a snippet keeps (as in mockup v4), at most a third of the window so the match
// always fits inside it.
const LEAD = 70;

// At most `max` characters of `t` around its first match, with "…" only on a side that was cut (so ≤ max + 2).
// The window opens min(LEAD, max / 3) characters before the match, moved back when that would run past the end.
export function snippet(t: string, terms: string[], max = 220): string {
  if (t.length <= max) return t;
  const re = highlighter(terms);
  const at = re ? t.search(new RegExp(re.source, 'i')) : -1;
  const lead = Math.min(LEAD, Math.floor(max / 3));
  const start = Math.max(0, Math.min((at < 0 ? 0 : at) - lead, t.length - max));
  const end = start + max;
  return `${start > 0 ? '…' : ''}${t.slice(start, end).trim()}${end < t.length ? '…' : ''}`;
}
