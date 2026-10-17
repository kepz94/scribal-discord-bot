// Command and button handlers for Scribal Bot for Discord v1 (SBD-8): the Architecture's deterministic map.
//   /verse    resolveList → versePages → public page 1 (state "range" for one reference, "list" for several);
//             a reference error → its errorText; a list too long for one message → refused, nothing posts
//   /chapter  resolveChapter → chapterPages → public page 1 (state "chapter")
//   /define   word trimmed and lowercased → loadWebster → definePages (state "define"), or the no-entry text
//   /help     the commands card, public (v1.1, SBD-12)
//   button    decode custom_id → rebuild that page → edit the message in place; a "list" page re-reads the reading
//             list from the message itself (decision 19). A button that no longer leads anywhere gets STALE.
// Errors go only to the person who ran the command or pressed the button (decision 7). Anything unexpected throws,
// and api/interactions.ts answers "Something went wrong" and logs it.
import { escapeMarkdown } from './markdown.ts';
import { HELP_CARD } from './help.ts';
import { errorText } from './cards.ts';
import { loadIndex, loadWebster } from './library.ts';
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
    default:
      return ephemeral(NOT_BUILT);
  }
}

// The pages a decoded button state points into, or null when they no longer exist.
function pagesFor(state: PageState, messageContent: string): Page[] | null {
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
    case 'search':
      return null; // /search arrives in M2 (SBD-10)
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
  const page = pagesFor(state, interaction.message?.content ?? '')?.[state.page];
  return page ? update(page, { state }) : ephemeral(STALE);
}
