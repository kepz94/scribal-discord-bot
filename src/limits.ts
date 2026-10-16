// Discord limits for Scribal Bot for Discord v1 (SBD-1). Every Discord limit used in code comes from here.
//
// Each value was read on 2026-10-16 from Discord's developer docs, published at https://docs.discord.com/developers.
// The build environment cannot reach docs.discord.com, so the text was read from the docs' source repository,
// github.com/discord/discord-api-docs @ f7416a2cf165455f72a31f5ea4e671a4f047f2f7 (committed 2026-10-16),
// which is the content that site publishes. The URL above each constant is the published page and anchor.
//
// Character limits are Discord's "characters"; embed limits are measured inclusively, after Discord trims
// leading and trailing whitespace.

export const LIMITS = {
  // 256 characters — embed `title`.
  // https://docs.discord.com/developers/resources/message#embed-object-embed-limits · read 2026-10-16
  embedTitle: 256,

  // 4096 characters — embed `description`.
  // https://docs.discord.com/developers/resources/message#embed-object-embed-limits · read 2026-10-16
  embedDescription: 4096,

  // 2048 characters — embed `footer.text`.
  // https://docs.discord.com/developers/resources/message#embed-object-embed-limits · read 2026-10-16
  embedFooter: 2048,

  // 10 embeds per message ("Supports up to 10 embeds" in an interaction response message).
  // https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-response-object-messages · read 2026-10-16
  embedsPerMessage: 10,

  // 6000 characters — combined title + description + field.name + field.value + footer.text + author.name
  // across all embeds on one message.
  // https://docs.discord.com/developers/resources/message#embed-object-embed-limits · read 2026-10-16
  embedTotalPerMessage: 6000,

  // 2000 characters — message `content`.
  // https://docs.discord.com/developers/resources/message#create-message-json/form-params · read 2026-10-16
  messageContent: 2000,

  // 100 characters — component `custom_id` (1–100).
  // https://docs.discord.com/developers/components/reference#anatomy-of-a-component-custom-id · read 2026-10-16
  customId: 100,

  // 25 choices — autocomplete response ("max of 25 choices").
  // https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-response-object-autocomplete · read 2026-10-16
  autocompleteChoices: 25,

  // 100 characters — choice `name` (1–100).
  // https://docs.discord.com/developers/interactions/application-commands#application-command-object-application-command-option-choice-structure · read 2026-10-16
  choiceName: 100,

  // 100 characters — choice `value` when a string ("up to 100 characters if string").
  // https://docs.discord.com/developers/interactions/application-commands#application-command-object-application-command-option-choice-structure · read 2026-10-16
  choiceValue: 100,

  // 3000 ms — "you must send an initial response within 3 seconds of receiving the event"; the token is invalidated after.
  // https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-callback · read 2026-10-16
  initialResponseMs: 3000,
} as const;
