// Interactions endpoint for Scribal Bot for Discord v1 (SBD-6, handlers SBD-8): Vercel Node runtime, Web handler.
// The raw body is read once with request.text() (SBD-1) and its Ed25519 signature checked before anything is
// parsed. Deterministic map (Architecture):
//   signature missing / invalid      → 401, empty body
//   PING (type 1)                    → {"type":1}
//   command (2) / button (3)         → src/handlers.ts (SBD-8)
//   anything else                    → ephemeral "Not built yet."
//   exception                        → ephemeral "Something went wrong. Try again." + console.error(type, name)
// Reads only DISCORD_PUBLIC_KEY from the environment.
import { verify } from '../src/verify.ts';
import { ephemeral } from '../src/respond.ts';
import { handle, type Interaction } from '../src/handlers.ts';

const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const publicKey = process.env.DISCORD_PUBLIC_KEY ?? '';
  if (publicKey === '') console.error('DISCORD_PUBLIC_KEY is not set: every request is refused with 401');
  const signature = request.headers.get('x-signature-ed25519') ?? '';
  const timestamp = request.headers.get('x-signature-timestamp') ?? '';
  if (!verify(raw, signature, timestamp, publicKey)) return new Response(null, { status: 401 });

  let type: unknown;
  let name: unknown;
  try {
    const interaction = JSON.parse(raw) as Interaction & { data?: { name?: unknown; custom_id?: unknown } };
    type = interaction.type;
    name = interaction.data?.name ?? (typeof interaction.data?.custom_id === 'string' ? `button ${interaction.data.custom_id.charAt(0)}` : undefined);
    console.log('interaction', { type, name });
    if (type === 1) return json({ type: 1 });
    return json(handle(interaction));
  } catch (err) {
    console.error('interaction failed', { type, name }, err);
    return json(ephemeral('Something went wrong. Try again.'));
  }
}
