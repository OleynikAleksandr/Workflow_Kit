// Screen patterns of the Windows pty host, the same as session.exp, environment.exp and
// dialogs.tcl use on macOS and Linux (spec M5 section 4.1). Matching runs on the screen text
// without escape sequences (ConPTY redraws differently from a Unix pty).
import { stripAnsi } from '../pty.ts';

/** Up to 16 characters between the words of a phrase (Claude prints cursor moves instead of spaces). */
const G = '[\\s\\S]{0,16}';
const IMPORTS = `CLAUDE\\.md${G}file${G}imports|allow${G}external${G}imports`;
const TRUST = `trust${G}this${G}folder|trust${G}the${G}files${G}in|Quick${G}safety${G}check`;

/** Claude's first run: the theme picker and the login method (spec M15 section 2.1). */
const ONBOARDING = `Syntax${G}theme|Choose${G}the${G}text${G}style|Select${G}login${G}method`;
/** A feature offer: "Try the new …?" or "Would you like to try …?" with a "Not now" option. */
const OFFER = `Try${G}the${G}new|Would${G}you${G}like${G}to${G}try`;
// The digit stands right before its text: a wider gap would take the number of the option above.
const NOT_NOW = new RegExp(`(\\d)\\.[ \\t]{0,4}Not${G}now`, 'i');
/** The option under the cursor: "❯ 1." (or "> 1." / "› 1."). */
const CURSOR = /[❯›>]\s{0,4}(\d)\./;

export const SESSION_URL = /claude\.ai\/code\/(session_[A-Za-z0-9]+)/;
export const NOT_TRUSTED = /Workspace not trusted/;
export const ENVIRONMENT_ID = /environment=([A-Za-z0-9_-]+)/;
// The theme picker prints no "Enter to confirm" footer, so the first run is part of the pattern.
export const DIALOG = new RegExp(`(?:${IMPORTS}|${TRUST}|${ONBOARDING}|Enter${G}to${G}confirm|Esc${G}to${G}cancel)`);

/** Kinds of the dialogs the hosts tell apart; "promo" is a feature offer Kit declines. */
export type ScreenDialog = 'trust' | 'imports' | 'onboarding' | 'promo' | 'unknown';

/** The kind of a dialog by its exact phrases, case-insensitive (dialog_kind of dialogs.tcl). */
export function dialogKind(text: string): ScreenDialog {
  const plain = stripAnsi(text);
  if (new RegExp(IMPORTS, 'i').test(plain)) return 'imports';
  if (new RegExp(TRUST, 'i').test(plain)) return 'trust';
  if (new RegExp(ONBOARDING, 'i').test(plain)) return 'onboarding';
  if (new RegExp(OFFER, 'i').test(plain) && NOT_NOW.test(plain)) return 'promo';
  return 'unknown';
}

/** Arrow key presses for the host: down and up (the same in expect's send). */
export const KEY_DOWN = '\u001b[B';
export const KEY_UP = '\u001b[A';

/**
 * How to answer "Not now" to a feature offer: its option number and the arrow presses from the
 * option under the cursor (option 1 when no cursor is seen); Enter follows the arrows.
 */
export function notNowKeys(text: string): { option: number; arrows: string[] } | null {
  const plain = stripAnsi(text);
  const target = NOT_NOW.exec(plain);
  if (!target) return null;
  const option = Number(target[1]);
  const cursor = Number(CURSOR.exec(plain)?.[1] ?? '1');
  const arrows = option >= cursor ? Array<string>(option - cursor).fill(KEY_DOWN) : Array<string>(cursor - option).fill(KEY_UP);
  return { option, arrows };
}

/** The question of a feature offer, to tell a repeated offer from a new one. */
export function offerQuestion(text: string): string {
  const plain = stripAnsi(text);
  const match = new RegExp(`(?:${OFFER})[^?]{0,120}\\?`, 'i').exec(plain);
  return (match?.[0] ?? '').replace(/\s+/g, '').toLowerCase();
}

/** Screen text for matching: raw output without escape sequences. */
export function screenText(raw: string): string {
  return stripAnsi(raw);
}

/** The wake prompt typed into an idle session (session.exp). */
export const WAKE_TEXT = 'Workflow Kit: новое сообщение из панели.';
