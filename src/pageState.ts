// Button state codec for Scribal Bot for Discord v1 (SBD-5): PageState <-> component custom_id.
// One letter for the kind, then ":"-separated fields; the one free-text field (book key, word, query) is always
// last, so it may itself contain ":".
//   c:<page>:<ch>:<key>                  chapter
//   r:<page>:<ch>:<from>:<to>:<key>      range (one reference that pages)
//   l:<page>                             list — the list itself is the message's reading list (decision 19)
//   d:<page>:<word>                      define
//   s:<page>:<vol|->:<query>             search (M2); "-" = all volumes
// Numbers are canonical non-negative integers ("0", "12"; never "01", "+1", "1.5"). page and vol start at 0;
// ch, from and to at 1, with from ≤ to. encode returns null for an id over LIMITS.customId or a state decode would
// reject, so encode(s) !== null always means decode(encode(s)) deep-equals s.
import { LIMITS } from './limits.ts';
import type { BookKey } from './library.ts';
import type { Ref } from './reference.ts';

export type PageState =
  | { t: 'chapter'; key: BookKey; ch: number; page: number }
  | { t: 'range'; ref: Ref; page: number }
  | { t: 'list'; page: number }
  | { t: 'define'; w: string; page: number }
  | { t: 'search'; q: string; vol?: number; page: number };

const ALL_VOLUMES = '-';

const isCount = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;
const isOrdinal = (n: number): boolean => Number.isSafeInteger(n) && n >= 1;

// A canonical non-negative integer field, or null.
function num(field: string | undefined): number | null {
  if (field === undefined || !/^(0|[1-9]\d*)$/.test(field)) return null;
  const n = Number(field);
  return Number.isSafeInteger(n) ? n : null;
}

function valid(s: PageState): boolean {
  if (!isCount(s.page)) return false;
  switch (s.t) {
    case 'chapter':
      return isOrdinal(s.ch) && s.key !== '';
    case 'range':
      return isOrdinal(s.ref.ch) && isOrdinal(s.ref.from) && isOrdinal(s.ref.to) && s.ref.from <= s.ref.to && s.ref.key !== '';
    case 'list':
      return true;
    case 'define':
      return s.w !== '';
    case 'search':
      return s.q !== '' && (s.vol === undefined || isCount(s.vol));
  }
}

function format(s: PageState): string {
  switch (s.t) {
    case 'chapter':
      return `c:${s.page}:${s.ch}:${s.key}`;
    case 'range':
      return `r:${s.page}:${s.ref.ch}:${s.ref.from}:${s.ref.to}:${s.ref.key}`;
    case 'list':
      return `l:${s.page}`;
    case 'define':
      return `d:${s.page}:${s.w}`;
    case 'search':
      return `s:${s.page}:${s.vol ?? ALL_VOLUMES}:${s.q}`;
  }
}

export function encode(s: PageState): string | null {
  if (!valid(s)) return null;
  const id = format(s);
  return id.length <= LIMITS.customId ? id : null;
}

// Split off `count` leading fields; the remainder (which may contain ":") is the last element.
function fields(rest: string, count: number): string[] | null {
  const out: string[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    const next = rest.indexOf(':', at);
    if (next < 0) return null;
    out.push(rest.slice(at, next));
    at = next + 1;
  }
  out.push(rest.slice(at));
  return out;
}

export function decode(id: string): PageState | null {
  if (id.length > LIMITS.customId || id.length < 3 || id[1] !== ':') return null;
  const rest = id.slice(2);
  let s: PageState | null = null;
  switch (id[0]) {
    case 'c': {
      const f = fields(rest, 2);
      const page = num(f?.[0]), ch = num(f?.[1]);
      if (f && page !== null && ch !== null) s = { t: 'chapter', key: f[2], ch, page };
      break;
    }
    case 'r': {
      const f = fields(rest, 4);
      const page = num(f?.[0]), ch = num(f?.[1]), from = num(f?.[2]), to = num(f?.[3]);
      if (f && page !== null && ch !== null && from !== null && to !== null) s = { t: 'range', ref: { key: f[4], ch, from, to }, page };
      break;
    }
    case 'l': {
      const page = num(rest);
      if (page !== null) s = { t: 'list', page };
      break;
    }
    case 'd': {
      const f = fields(rest, 1);
      const page = num(f?.[0]);
      if (f && page !== null) s = { t: 'define', w: f[1], page };
      break;
    }
    case 's': {
      const f = fields(rest, 2);
      const page = num(f?.[0]);
      const vol = f?.[1] === ALL_VOLUMES ? undefined : num(f?.[1]);
      if (f && page !== null && vol !== null) s = vol === undefined ? { t: 'search', q: f[2], page } : { t: 'search', q: f[2], vol, page };
      break;
    }
  }
  return s && valid(s) ? s : null;
}
