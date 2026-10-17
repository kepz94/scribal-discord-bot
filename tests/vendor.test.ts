// Vendored files (Architecture: Do-not-touch) stay byte-identical to their source at kepz94/scribaltest2@ad95be0.
// Each body (everything after the 5-line provenance header) must hash to the source file's git blob id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const blobId = (body: Buffer): string => createHash('sha1').update(`blob ${body.length}\0`).update(body).digest('hex');
const body = (file: string): Buffer => {
  const all = readFileSync(new URL(`../src/vendor/${file}`, import.meta.url));
  let at = 0;
  for (let line = 0; line < 5; line++) at = all.indexOf(0x0a, at) + 1;
  return all.subarray(at);
};

test('src/vendor/sermons.ts is byte-identical to scribaltest1-main/src/sermons.ts', () => {
  assert.equal(blobId(body('sermons.ts')), 'b9a9ad7e63e8c2c060351ad3eeac2db89aebc0bc');
});

test('src/vendor/searchMatch.ts is byte-identical to scribaltest1-main/src/searchMatch.ts', () => {
  assert.equal(blobId(body('searchMatch.ts')), 'e2c0a9d28931595c91f65e14dd84d2258f0be777');
});
