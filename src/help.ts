// The /help card for Scribal Bot for Discord v1.1 (SBD-12). Wording approved by Kepu on 2026-10-17; shown publicly.
// tests/help.test.ts checks that every example below really resolves, so the card cannot advertise input the bot
// rejects. Update it with the commands when M2 adds /search and autocomplete.
import { CARD_COLOR, type Embed } from './cards.ts';

export const HELP_EXAMPLES = {
  verse: ['alma 32:21', 'alma 32:21-23', 'd&c 4:2, moroni 10:4, jsh 1:17', 'kirtland era 1:1', '1nephi3:7'],
  chapter: ['1 nephi 3'],
  define: ['faith'],
  aliases: ['JSM', 'JSH'],
  books: ['D&C', "Solomon's Song"],
};

const [one, range, several, sermon, squashed] = HELP_EXAMPLES.verse;

export const HELP_CARD: Embed = {
  title: 'Scribal Bot — commands',
  description: [
    '**/verse** `reference` — look up verses',
    `• One verse: \`${one}\``,
    `• A range in one chapter: \`${range}\``,
    `• Several, from any books, separated by commas: \`${several}\``,
    `• Sermons by number: \`${sermon}\``,
    '',
    `**/chapter** \`reference\` — read a whole chapter: \`${HELP_EXAMPLES.chapter[0]}\``,
    '',
    `**/define** \`word\` — Webster's 1828 dictionary: \`${HELP_EXAMPLES.define[0]}\``,
    '',
    '**Tips**',
    `• Capitals and spaces don't matter: \`${squashed}\` works.`,
    `• \`${HELP_EXAMPLES.aliases[0]}\` and \`${HELP_EXAMPLES.aliases[1]}\` are short for Joseph Smith—Matthew and Joseph Smith—History.`,
    `• Book names follow Scribal's titles: \`${HELP_EXAMPLES.books[0]}\` (not "Doctrine and Covenants"), \`${HELP_EXAMPLES.books[1]}\`.`,
    '• Long replies have ◀ Prev / Next ▶ buttons.',
  ].join('\n'),
  color: CARD_COLOR,
};
