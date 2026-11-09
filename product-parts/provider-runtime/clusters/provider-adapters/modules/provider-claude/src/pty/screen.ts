// Screen patterns of the Windows pty host, the same as session.exp, environment.exp and
// dialogs.tcl use on macOS and Linux (spec M5 section 4.1). Matching runs on the screen text
// without escape sequences (ConPTY redraws differently from a Unix pty).
import { stripAnsi } from '../pty.ts';

/** Up to 16 characters between the words of a phrase (Claude prints cursor moves instead of spaces). */
const G = '[\\s\\S]{0,16}';
const IMPORTS = `CLAUDE\\.md${G}file${G}imports|allow${G}external${G}imports`;
const TRUST = `trust${G}this${G}folder|trust${G}the${G}files${G}in|Quick${G}safety${G}check`;

export const SESSION_URL = /claude\.ai\/code\/(session_[A-Za-z0-9]+)/;
export const NOT_TRUSTED = /Workspace not trusted/;
export const ENVIRONMENT_ID = /environment=([A-Za-z0-9_-]+)/;
export const DIALOG = new RegExp(`(?:${IMPORTS}|${TRUST}|Enter${G}to${G}confirm|Esc${G}to${G}cancel)`);

/** trust, imports or unknown — by the exact phrases, case-insensitive (dialog_kind of dialogs.tcl). */
export function dialogKind(text: string): 'trust' | 'imports' | 'unknown' {
  const plain = stripAnsi(text);
  if (new RegExp(IMPORTS, 'i').test(plain)) return 'imports';
  if (new RegExp(TRUST, 'i').test(plain)) return 'trust';
  return 'unknown';
}

/** Screen text for matching: raw output without escape sequences. */
export function screenText(raw: string): string {
  return stripAnsi(raw);
}

/** The wake prompt typed into an idle session (session.exp). */
export const WAKE_TEXT = 'Workflow Kit: новое сообщение из панели.';
