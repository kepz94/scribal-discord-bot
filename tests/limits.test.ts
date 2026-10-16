// SBD-1 (v1): every Discord limit the bot relies on is present in LIMITS and is a positive integer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS } from '../src/limits.ts';

// The SBD-1 "Produces" contract. Checking presence by name keeps an empty LIMITS from passing vacuously.
const REQUIRED_KEYS = [
  'embedDescription',
  'embedTitle',
  'embedFooter',
  'embedsPerMessage',
  'embedTotalPerMessage',
  'messageContent',
  'customId',
  'autocompleteChoices',
  'choiceName',
  'choiceValue',
  'initialResponseMs',
] as const;

for (const key of REQUIRED_KEYS) {
  test(`LIMITS.${key} is present`, () => {
    assert.ok(Object.hasOwn(LIMITS, key), `LIMITS is missing ${key}`);
  });
}

test('every LIMITS value is a positive integer', () => {
  for (const [key, value] of Object.entries(LIMITS)) {
    assert.ok(typeof value === 'number' && Number.isInteger(value) && value > 0, `LIMITS.${key} = ${String(value)}`);
  }
});
