// Discord markdown escaping for Scribal Bot for Discord v1 (SBD-4).
// Scripture, dictionary text and typed input are shown as written: each character Discord reads as formatting
// (* _ ~ \ | > and the backtick) gets a backslash. Nothing else is touched.
const SPECIAL = /[*_~\\|>`]/g;

export const escapeMarkdown = (s: string): string => s.replace(SPECIAL, '\\$&');
