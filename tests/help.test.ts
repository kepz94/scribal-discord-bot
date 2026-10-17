// SBD-12 (v1.1): the /help card — approved wording, and every example it shows really works, so the card can never
// advertise input the bot rejects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadIndex, loadWebster } from '../src/library.ts';
import { HELP_CARD, HELP_EXAMPLES } from '../src/help.ts';
import { resolveChapter, resolveList } from '../src/reference.ts';

test('the card is titled "Scribal Bot — commands", violet, with no author line', () => {
  assert.equal(HELP_CARD.title, 'Scribal Bot — commands');
  assert.equal(HELP_CARD.color, 0x8b5cf6);
  assert.equal(HELP_CARD.author, undefined);
});

test('the card text is the approved wording', () => {
  assert.equal(
    HELP_CARD.description,
    [
      '**/verse** `reference` — look up verses',
      '• One verse: `alma 32:21`',
      '• A range in one chapter: `alma 32:21-23`',
      '• Several, from any books, separated by commas: `d&c 4:2, moroni 10:4, jsh 1:17`',
      '• Sermons by number: `kirtland era 1:1`',
      '',
      '**/chapter** `reference` — read a whole chapter: `1 nephi 3`',
      '',
      "**/define** `word` — Webster's 1828 dictionary: `faith`",
      '',
      '**Tips**',
      "• Capitals and spaces don't matter: `1nephi3:7` works.",
      '• `JSM` and `JSH` are short for Joseph Smith—Matthew and Joseph Smith—History.',
      '• Book names follow Scribal\'s titles: `D&C` (not "Doctrine and Covenants"), `Solomon\'s Song`.',
      '• Long replies have ◀ Prev / Next ▶ buttons.',
    ].join('\n'),
  );
});

test('every example shown in backticks is one of HELP_EXAMPLES', () => {
  const shown = [...(HELP_CARD.description.matchAll(/`([^`]+)`/g))].map((m) => m[1]).filter((s) => s !== 'reference' && s !== 'word');
  const listed = [...HELP_EXAMPLES.verse, ...HELP_EXAMPLES.chapter, ...HELP_EXAMPLES.define, ...HELP_EXAMPLES.aliases, ...HELP_EXAMPLES.books];
  assert.deepEqual([...shown].sort(), [...listed].sort());
});

test('every /verse example resolves', () => {
  for (const input of HELP_EXAMPLES.verse) assert.ok(resolveList(input).ok, input);
});
test('every /chapter example resolves', () => {
  for (const input of HELP_EXAMPLES.chapter) assert.ok(resolveChapter(input).ok, input);
});
test('every /define example has an entry', () => {
  for (const word of HELP_EXAMPLES.define) assert.ok(loadWebster(word), word);
});
test('JSM and JSH work as described', () => {
  for (const alias of HELP_EXAMPLES.aliases) assert.ok(resolveList(`${alias} 1:1`).ok, alias);
});
test('the book names it mentions are stored names, and "Doctrine and Covenants" really is not', () => {
  const names = new Set(loadIndex().map((b) => b.display));
  for (const name of HELP_EXAMPLES.books) assert.ok(names.has(name), name);
  assert.equal(resolveList('Doctrine and Covenants 4:2').ok, false);
});
