// Command and button handlers for Scribal Bot for Discord v1 (SBD-8): the Architecture's deterministic map.
//   /verse    resolveList → versePages → public page 1 (state "range" for one reference, "list" for several);
//             a reference error → its errorText; a list too long for one message → refused, nothing posts
//   /chapter  resolveChapter → chapterPages → public page 1 (state "chapter")
//   /define   word trimmed and lowercased → loadWebster → definePages (state "define"), or the no-entry text
//   /help     the commands card, public (v1.1, SBD-12)
//   /search   search(query, volume) → searchPages (state "search", vol = volume index); nothing to search for →
//             "Type at least one word to search for."; no hits → "No verses match “q”." (SBD-10)
//   button    decode custom_id → rebuild that page → edit the message in place; a "list" page re-reads the reading
//             list from the message itself (decision 19). A button that no longer leads anywhere gets STALE.
// Errors go only to the person who ran the command or pressed the button (decision 7). Anything unexpected throws,
// and api/interactions.ts answers "Something went wrong" and logs it.
import { escapeMarkdown } from './markdown.ts';
import { HELP_CARD } from './help.ts';
import { errorText, searchPage } from './cards.ts';
import { loadIndex, loadVolumes, loadWebster } from './library.ts';
import { search } from './search.ts';
import { chapterPages, definePages, versePages, type Page } from './paginate.ts';
import { decode, type PageState } from './pageState.ts';
import { readReadingList } from './readingList.ts';
import { resolveChapter, resolveList, type Ref } from './reference.ts';
import { ephemeral, reply, update, type MessageData } from './respond.ts';

export type Interaction = {
  type: number;
  data?: {
    name?: string;
    options?: { name: string; type?: number; value?: unknown }[];
    custom_id?: string;
    component_type?: number;
  };
  message?: { content?: string };
};
export type InteractionResponse = { type: 4 | 7; data: MessageData };

const APPLICATION_COMMAND = 2;
const MESSAGE_COMPONENT = 3;

export const TOO_LONG = 'That list is too long for one message. Split it into two commands.';
export const STALE = "That page isn't available any more. Run the command again.";
export const NOT_BUILT = 'Not built yet.';
export const NOTHING_TO_SEARCH = 'Type at least one word to search for.';
const noMatches = (query: string): string => `No verses match “${escapeMarkdown(query)}”.`;
const noEntry = (word: string): string => `No entry for “${escapeMarkdown(word)}” in Webster's 1828.`;

export function handle(interaction: Interaction): InteractionResponse {
  if (interaction.type === APPLICATION_COMMAND) return command(interaction);
  if (interaction.type === MESSAGE_COMPONENT) return component(interaction);
  return ephemeral(NOT_BUILT);
}

function optionText(interaction: Interaction, name: string): string {
  const value = interaction.data?.options?.find((o) => o.name === name)?.value;
  return typeof value === 'string' ? value : '';
}

function command(interaction: Interaction): InteractionResponse {
  switch (interaction.data?.name) {
    case 'verse': {
      const resolved = resolveList(optionText(interaction, 'reference'));
      if (!resolved.ok) return ephemeral(errorText(resolved.error));
      const paged = versePages(resolved.refs);
      if (!paged.ok) return ephemeral(TOO_LONG);
      const state: PageState = resolved.refs.length === 1 ? { t: 'range', ref: resolved.refs[0], page: 0 } : { t: 'list', page: 0 };
      return reply(paged.pages[0], { state });
    }
    case 'chapter': {
      const resolved = resolveChapter(optionText(interaction, 'reference'));
      if (!resolved.ok) return ephemeral(errorText(resolved.error));
      return reply(chapterPages(resolved.key, resolved.ch)[0], { state: { t: 'chapter', key: resolved.key, ch: resolved.ch, page: 0 } });
    }
    case 'define': {
      const typed = optionText(interaction, 'word').trim();
      const word = typed.toLowerCase();
      const entry = loadWebster(word);
      if (entry === undefined) return ephemeral(noEntry(typed));
      return reply(definePages(word, entry)[0], { state: { t: 'define', w: word, page: 0 } });
    }
    case 'help':
      return reply({ embeds: [HELP_CARD], index: 0, count: 1 });
    case 'search': {
      const query = optionText(interaction, 'query').trim();
      const volume = optionText(interaction, 'volume') || undefined;
      const result = search(query, volume);
      if (result === null) return ephemeral(NOTHING_TO_SEARCH);
      if (result.total === 0) return ephemeral(noMatches(query));
      const vol = volume === undefined ? undefined : loadVolumes().indexOf(volume);
      const state: PageState = vol === undefined ? { t: 'search', q: query, page: 0 } : { t: 'search', q: query, vol, page: 0 };
      return reply(searchPage(result, query, volume, 0) as Page, { state });
    }
    default:
      return ephemeral(NOT_BUILT);
  }
}

// The page a decoded button state points to, or null when it no longer exists. A search builds only that page
// (SBD-10); every other kind builds its page list.
function pageFor(state: PageState, messageContent: string): Page | null {
  if (state.t !== 'search') return pagesFor(state, messageContent)?.[state.page] ?? null;
  const volume = state.vol === undefined ? undefined : loadVolumes()[state.vol];
  if (state.vol !== undefined && volume === undefined) return null;
  const result = search(state.q, volume);
  return result ? searchPage(result, state.q, volume, state.page) : null;
}

// The pages a decoded button state points into, or null when they no longer exist.
function pagesFor(state: Exclude<PageState, { t: 'search' }>, messageContent: string): Page[] | null {
  switch (state.t) {
    case 'chapter': {
      const book = loadIndex().find((b) => b.key === state.key);
      if (!book || state.ch > book.chapters.length) return null;
      return chapterPages(state.key, state.ch);
    }
    case 'range':
      return inIndex(state.ref) ? pagesOf([state.ref]) : null;
    case 'list': {
      const list = readReadingList(messageContent);
      if (list === null) return null;
      const resolved = resolveList(list);
      return resolved.ok ? pagesOf(resolved.refs) : null;
    }
    case 'define': {
      const entry = loadWebster(state.w);
      return entry === undefined ? null : definePages(state.w, entry);
    }
  }
}

function inIndex(ref: Ref): boolean {
  const book = loadIndex().find((b) => b.key === ref.key);
  const verses = book?.chapters[ref.ch - 1];
  return verses !== undefined && ref.from >= 1 && ref.to <= verses && ref.from <= ref.to;
}

function pagesOf(refs: Ref[]): Page[] | null {
  const paged = versePages(refs);
  return paged.ok ? paged.pages : null;
}

function component(interaction: Interaction): InteractionResponse {
  const state = decode(interaction.data?.custom_id ?? '');
  if (state === null) return ephemeral(STALE);
  const page = pageFor(state, interaction.message?.content ?? '');
  return page ? update(page, { state }) : ephemeral(STALE);
}
