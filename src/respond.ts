// Interaction-response JSON for Scribal Bot for Discord v1 (SBD-6).
//   reply   type 4 (CHANNEL_MESSAGE_WITH_SOURCE): a new message, public unless ephemeral (SRD §6 decision 7)
//   update  type 7 (UPDATE_MESSAGE): a button press edits the message in place
// Buttons appear iff page.count > 1 (SBD-4): "◀ Prev" and "Next ▶" ("More ▶" for search), gray, disabled at the
// ends. Their custom_ids encode the page's PageState at the neighbouring page index, so a page with count > 1
// needs its state. No reply ever pings anyone (allowed_mentions parses nothing).
import { encode, type PageState } from './pageState.ts';
import type { Embed } from './cards.ts';
import type { Page } from './paginate.ts';

const EPHEMERAL = 1 << 6;
const NO_MENTIONS = { parse: [] as string[] };

type Button = { type: 2; style: 2; label: string; custom_id: string; disabled: boolean };
type ActionRow = { type: 1; components: Button[] };
export type MessageData = {
  content?: string;
  embeds?: Embed[];
  components?: ActionRow[];
  flags?: number;
  allowed_mentions: { parse: string[] };
};

function buttons(page: Page, state: PageState | undefined): ActionRow[] {
  if (page.count <= 1) return [];
  if (!state) throw new Error(`Page ${page.index + 1} of ${page.count} needs its PageState to build buttons`);
  const id = (index: number): string => {
    const custom = encode({ ...state, page: index });
    if (custom === null) throw new Error(`No custom_id for ${state.t} page ${index}`);
    return custom;
  };
  // At either end the disabled button points at the nearest real page, so the two ids always differ.
  const prev = Math.max(page.index - 1, 0);
  const next = Math.min(page.index + 1, page.count - 1);
  return [{
    type: 1,
    components: [
      { type: 2, style: 2, label: '◀ Prev', custom_id: id(prev), disabled: page.index === 0 },
      { type: 2, style: 2, label: state.t === 'search' ? 'More ▶' : 'Next ▶', custom_id: id(next), disabled: page.index === page.count - 1 },
    ],
  }];
}

export function reply(page: Page, opts: { ephemeral?: boolean; state?: PageState } = {}): { type: 4; data: MessageData } {
  const data: MessageData = { embeds: page.embeds, allowed_mentions: NO_MENTIONS };
  if (page.content !== undefined) data.content = page.content;
  const rows = buttons(page, opts.state);
  if (rows.length > 0) data.components = rows;
  if (opts.ephemeral) data.flags = EPHEMERAL;
  return { type: 4, data };
}

// The edit states content and components explicitly ("" / []), so nothing from the previous page survives.
export function update(page: Page, opts: { state?: PageState } = {}): { type: 7; data: MessageData } {
  return {
    type: 7,
    data: { content: page.content ?? '', embeds: page.embeds, components: buttons(page, opts.state), allowed_mentions: NO_MENTIONS },
  };
}

export function ephemeral(text: string): { type: 4; data: MessageData } {
  return { type: 4, data: { content: text, flags: EPHEMERAL, allowed_mentions: NO_MENTIONS } };
}
