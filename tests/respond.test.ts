// SBD-6 (v1): interaction-response JSON — public and ephemeral replies, in-place updates, Prev/Next buttons iff count > 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode, type PageState } from '../src/pageState.ts';
import { ephemeral, reply, update } from '../src/respond.ts';
import type { Page } from '../src/paginate.ts';

const NO_MENTIONS = { parse: [] };
const card = { author: { name: 'Book of Mormon' }, title: 'Alma 32:21', description: 'text', color: 0x8b5cf6 };
const single: Page = { embeds: [card], index: 0, count: 1 };
const paged = (index: number, count = 3, content?: string): Page => ({ embeds: [card], index, count, ...(content ? { content } : {}) });
const CHAPTER: PageState = { t: 'chapter', key: '1nephi', ch: 3, page: 0 };
const row = (prev: { id: string; off: boolean }, next: { id: string; off: boolean; label?: string }) => [{
  type: 1,
  components: [
    { type: 2, style: 2, label: '◀ Prev', custom_id: prev.id, disabled: prev.off },
    { type: 2, style: 2, label: next.label ?? 'Next ▶', custom_id: next.id, disabled: next.off },
  ],
}];
const id = (s: PageState, page: number): string => encode({ ...s, page }) ?? '';

test('ephemeral(text) → type 4, ephemeral flag 64, no mentions', () => {
  assert.deepEqual(ephemeral('Not built yet.'), { type: 4, data: { content: 'Not built yet.', flags: 64, allowed_mentions: NO_MENTIONS } });
});

test('reply of a single page → public message, embeds only, no buttons', () => {
  assert.deepEqual(reply(single), { type: 4, data: { embeds: [card], allowed_mentions: NO_MENTIONS } });
});

test('reply with ephemeral → flag 64', () => {
  assert.equal(reply(single, { ephemeral: true }).data.flags, 64);
});

test('reply of page 1 of 3 → Prev disabled, Next to page 2', () => {
  assert.deepEqual(reply(paged(0), { state: CHAPTER }).data.components, row({ id: id(CHAPTER, 0), off: true }, { id: id(CHAPTER, 1), off: false }));
});

test('a middle page → both buttons enabled, pointing at the neighbours', () => {
  assert.deepEqual(update(paged(1), { state: CHAPTER }).data.components, row({ id: id(CHAPTER, 0), off: false }, { id: id(CHAPTER, 2), off: false }));
});

test('the last page → Next disabled; the two ids stay different', () => {
  assert.deepEqual(update(paged(2), { state: CHAPTER }).data.components, row({ id: id(CHAPTER, 1), off: false }, { id: id(CHAPTER, 2), off: true }));
});

test('search pages say "More ▶"', () => {
  const s: PageState = { t: 'search', q: 'faith', page: 0 };
  assert.equal(reply(paged(0), { state: s }).data.components?.[0].components[1].label, 'More ▶');
});

test('reply keeps a page\'s content (reading list)', () => {
  assert.equal(reply(paged(0, 2, '**Reading list** · 2 references · page 1 of 2\nA · B'), { state: { t: 'list', page: 0 } }).data.content, '**Reading list** · 2 references · page 1 of 2\nA · B');
});

test('update → type 7 and always states content and components, so nothing stale survives the edit', () => {
  assert.deepEqual(update(single), { type: 7, data: { content: '', embeds: [card], components: [], allowed_mentions: NO_MENTIONS } });
});

test('a page with count > 1 but no state throws instead of dropping its buttons', () => {
  assert.throws(() => reply(paged(0)), /needs its PageState/);
  assert.throws(() => update(paged(1)), /needs its PageState/);
});
