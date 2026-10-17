// Command registration for Scribal Bot for Discord v1 (SBD-7), run by .github/workflows/register.yml
// ("Register commands", started by hand). Bulk Overwrite Guild Application Commands replaces the guild's whole
// command set, so running it again is idempotent.
//   https://docs.discord.com/developers/interactions/application-commands#bulk-overwrite-guild-application-commands
//   · read 2026-10-17 (API v10; User-Agent format per https://docs.discord.com/developers/reference#user-agent)
// Reads DISCORD_APPLICATION_ID, DISCORD_GUILD_ID and DISCORD_BOT_TOKEN from the environment and prints only
// Discord's status, the registered command names, or Discord's error message and code: never an ID or the token.
import { fileURLToPath } from 'node:url';

const API = 'https://discord.com/api/v10';
const USER_AGENT = 'DiscordBot (https://github.com/kepz94/scribal-discord-bot, 1.0.0)';
const CHAT_INPUT = 1;
const STRING = 3;
const ENV_NAMES = ['DISCORD_APPLICATION_ID', 'DISCORD_GUILD_ID', 'DISCORD_BOT_TOKEN'] as const;

type Option = { type: number; name: string; description: string; required: boolean; max_length?: number };
type Command = { type: number; name: string; description: string; options: Option[] };

// The M1 set. Autocomplete flags arrive in SBD-11 and /search in SBD-10. Descriptions approved 2026-10-17.
export const COMMANDS: Command[] = [
  {
    type: CHAT_INPUT,
    name: 'verse',
    description: 'Look up verses: one, a range, or several separated by commas',
    options: [{ type: STRING, name: 'reference', description: 'e.g. Alma 32:21, Alma 32:21-23, or D&C 4:2, Moroni 10:4', required: true }],
  },
  {
    type: CHAT_INPUT,
    name: 'chapter',
    description: 'Read a whole chapter',
    options: [{ type: STRING, name: 'reference', description: 'e.g. 1 Nephi 3 or Kirtland Era 20', required: true }],
  },
  {
    type: CHAT_INPUT,
    name: 'define',
    description: "Look up a word in Webster's 1828 dictionary",
    options: [{ type: STRING, name: 'word', description: 'One word, e.g. faith', required: true, max_length: 40 }],
  },
];

const slashList = (names: string[]): string => names.map((n) => `/${n}`).join(', ');

export async function register(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; lines: string[] }> {
  const missing = ENV_NAMES.filter((name) => !env[name]);
  if (missing.length > 0) return { ok: false, lines: [`Missing ${missing.join(', ')}`] };

  const res = await fetchImpl(`${API}/applications/${env.DISCORD_APPLICATION_ID}/guilds/${env.DISCORD_GUILD_ID}/commands`, {
    method: 'PUT',
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify(COMMANDS),
  });
  const lines = [`Discord answered ${res.status}`];
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    lines.push(`Error: the answer was not JSON (${text.length} characters)`);
    return { ok: false, lines };
  }

  if (res.ok && Array.isArray(body)) {
    const got = body.map((c: { name?: unknown }) => String(c.name));
    const want = COMMANDS.map((c) => c.name);
    const same = got.length === want.length && want.every((n) => got.includes(n));
    lines.push(same ? `Registered: ${slashList(got)}` : `Registered: ${slashList(got)} — expected ${slashList(want)}`);
    return { ok: same, lines };
  }
  const err = body as { message?: unknown; code?: unknown; errors?: unknown };
  lines.push(`Error: ${String(err?.message)} (code ${String(err?.code)})`);
  if (err?.errors !== undefined) lines.push(`Details: ${JSON.stringify(err.errors)}`);
  return { ok: false, lines };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await register(process.env);
  for (const line of result.lines) console.log(line);
  process.exitCode = result.ok ? 0 : 1;
}
