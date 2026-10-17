// SBD-6 (v1): Ed25519 request signature check against a generated key pair.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verify } from '../src/verify.ts';

const pair = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { privateKey, publicHex: publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex') };
};
const { privateKey, publicHex } = pair();
const BODY = '{"type":1,"id":"123","application_id":"456"}';
const TS = '1792200000';
const SIG = sign(null, Buffer.from(TS + BODY), privateKey).toString('hex');
const flipHex = (hex: string, at: number): string => hex.slice(0, at) + (hex[at] === '0' ? '1' : '0') + hex.slice(at + 1);

test('a valid signature verifies', () => assert.equal(verify(BODY, SIG, TS, publicHex), true));
test('uppercase hex verifies', () => assert.equal(verify(BODY, SIG.toUpperCase(), TS, publicHex.toUpperCase()), true));
test('one changed body byte fails', () => assert.equal(verify(BODY.replace('123', '124'), SIG, TS, publicHex), false));
test('one flipped signature byte fails', () => assert.equal(verify(BODY, flipHex(SIG, 10), TS, publicHex), false));
test('a different timestamp fails', () => assert.equal(verify(BODY, SIG, '1792200001', publicHex), false));
test('the wrong public key fails', () => assert.equal(verify(BODY, SIG, TS, pair().publicHex), false));
test('malformed hex fails without throwing', () => {
  for (const [sig, key] of [
    ['zz' + SIG.slice(2), publicHex],
    [SIG.slice(1), publicHex],
    [SIG, publicHex.slice(2)],
    [SIG, 'g'.repeat(64)],
    ['', publicHex],
    [SIG, ''],
  ]) {
    assert.equal(verify(BODY, sig, TS, key), false, `${sig.slice(0, 8)} / ${key.slice(0, 8)}`);
  }
});
