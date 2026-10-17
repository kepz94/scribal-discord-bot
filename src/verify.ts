// Ed25519 request signature check for Scribal Bot for Discord v1 (SBD-6), node:crypto only.
// Discord signs `timestamp + raw body` with the application's key and sends the signature and timestamp as
// headers; the public key (Discord portal → General Information) is 32 raw bytes in hex.
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

// DER prefix of an Ed25519 SubjectPublicKeyInfo (RFC 8410): SEQUENCE { SEQUENCE { OID 1.3.101.112 }, BIT STRING }.
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

// Exactly `bytes` bytes of hex. Buffer.from(hex) silently drops bad characters, so shape is checked first.
const isHex = (s: string, bytes: number): boolean => s.length === bytes * 2 && /^[0-9a-f]+$/i.test(s);

// True only for a well-formed signature that verifies. Every other outcome, including a key node:crypto
// rejects, is false: the caller answers 401.
export function verify(rawBody: string, signatureHex: string, timestamp: string, publicKeyHex: string): boolean {
  if (!isHex(signatureHex, 64) || !isHex(publicKeyHex, 32)) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(publicKeyHex, 'hex')]), format: 'der', type: 'spki' });
    return cryptoVerify(null, Buffer.from(timestamp + rawBody, 'utf8'), key, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}
