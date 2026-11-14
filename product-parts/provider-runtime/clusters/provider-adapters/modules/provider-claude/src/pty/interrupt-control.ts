// Host-owned interruption state. Commands are checked again against the current terminal frame.
import { TerminalScreen } from '#pty-host';
import { DIALOG, dialogKind } from './screen.ts';

export type ScreenState = 'working' | 'idle' | 'dialog' | 'unknown';
export interface HostSnapshot { version: 1; epoch: string; state: ScreenState; at: number }
export interface HostRequest { id: string; epoch: string; expires: number }
export interface HostResult { id: string; status: 'interrupted' | 'already-idle' | 'unavailable' | 'stale' | 'timeout'; reason?: string }
export const STATE_SUFFIX = '.interrupt-state';
export const REQUEST_SUFFIX = '.interrupt';
export const RESULT_SUFFIX = '.interrupt-result';
export const DIALOG_REASON = 'Claude ждёт решения в своём диалоге';
/** M24 marker and the Claude 2.1.325 notice (M28): the transcript keeps `[Request interrupted by user…]`. */
const MARKER = /\[Request interrupted by user[^\]\n]{0,40}\]|Interrupted · What should Claude do instead\?/g;

/** Claude 2.1.325 working line: a spinner glyph, a gerund with an ellipsis, optional details (M28). */
export const WORKING_LINE = /^\s*[·✢✳✶✻✽✺*]\s+[^\s…]+…(?:\s|$)/m;
/** Screen lines without the empty rows below Claude's footer (a short session does not fill the screen). */
export function screenLines(text: string): string[] {
  const lines = text.split('\n'); while (lines.length && !lines.at(-1)!.trim()) lines.pop();
  return lines;
}
/** The input prompt between Claude's two horizontal rules; a dim suggestion may follow ❯. */
export function promptRow(lines: readonly string[]): number {
  for (let i = lines.length - 2; i >= 1 && i >= lines.length - 12; i--)
    if (/^\s*❯/.test(lines[i]!) && /^─{8}/.test(lines[i - 1]!.trim()) && /^─{8}/.test(lines[i + 1]!.trim())) return i;
  return -1;
}
/** Interruption markers in the frame; the rows just above the input count as a new one (M28 T010). */
export function frameMarkers(screen: TerminalScreen): { count: number; recent: boolean } {
  const lines = screenLines(screen.text()); const prompt = promptRow(lines);
  const near = (prompt >= 0 ? lines.slice(Math.max(0, prompt - 10), prompt) : lines.slice(-12)).join('\n');
  return { count: [...lines.join('\n').matchAll(MARKER)].length, recent: new RegExp(MARKER.source).test(near) };
}
export function screenState(screen: TerminalScreen): ScreenState {
  if (!screen.valid) return 'unknown';
  const text = screen.text();
  // Permission dialogs may use a footer different from startup dialogs.
  if (DIALOG.test(text) || dialogKind(text) !== 'unknown' || /Do you want to (?:proceed|allow)|Allow .*\?|Yes, (?:allow|and don.t ask)|Esc to (?:cancel|deny)|permission (?:required|request)/i.test(text)) return 'dialog';
  const lines = screenLines(text); const prompt = promptRow(lines);
  // Only the area just above the input: an old finished line in the history is not work.
  const above = (prompt >= 0 ? lines.slice(Math.max(0, prompt - 8), prompt - 1) : lines.slice(-12)).join('\n');
  if (/esc to interrupt/i.test(text) || WORKING_LINE.test(above)) return 'working';
  if (prompt >= 0 || /(?:^|\n)\s*[❯>]\s*(?:\n|$)/.test(text)) return 'idle';
  return 'unknown';
}

/**
 * Whether a host step handles Stop although the parameter engine is busy (M28 T012): a Stop request or
 * an Esc waiting for its proof goes first, unless a transaction still cleans up (its Esc or clear in
 * this step) or a user's file takes its 2 s yield.
 */
export function stopFirst(stopping: boolean, transacting: boolean, cleanup: boolean, userFile: boolean): boolean {
  return stopping && !transacting && !cleanup && !userFile;
}

export class InterruptControl {
  readonly screen = new TerminalScreen();
  private epoch = 0;
  private previous: ScreenState = 'unknown';
  private pending: { request: HostRequest; visibleMarkers: number; recent: boolean } | null = null;
  private instance: string;
  /** The hook turn (<debug>.turn) is running: an unrecognized frame still takes the single Esc. */
  turnWorking = false;
  private now: () => number;
  private write: (text: string) => boolean;
  constructor(instance: string, now: () => number, write: (text: string) => boolean) { this.instance = instance; this.now = now; this.write = write; }
  feed(text: string): void {
    this.screen.feed(text);
    this.snapshot();
  }
  snapshot(): HostSnapshot {
    const state = screenState(this.screen);
    if (state === 'working' && this.previous !== 'working' && !this.pending) this.epoch += 1;
    this.previous = state;
    return { version: 1, epoch: `${this.instance}:${this.epoch}`, state, at: this.now() };
  }
  request(request: HostRequest): HostResult | null {
    const current = this.snapshot();
    if (!/^[a-f0-9-]{36}$/.test(request.id) || !Number.isFinite(request.expires) || request.expires <= this.now()) return { id: request.id, status: 'timeout' };
    // The cli checked the turn by its turnRef; a newer screen epoch is stale only outside a hook turn.
    if (request.epoch !== current.epoch && !this.turnWorking) return { id: request.id, status: 'stale' };
    if (this.pending) return { id: request.id, status: 'unavailable', reason: 'Остановка уже выполняется' };
    if (current.state === 'idle') return { id: request.id, status: 'already-idle' };
    // One Esc: work, a permission dialog (a denial, M28 T001) or an unknown frame of a running turn.
    if (current.state === 'unknown' && !this.turnWorking) return { id: request.id, status: 'unavailable', reason: 'Текущий экран Claude не распознан' };
    const frame = frameMarkers(this.screen);
    this.pending = { request, visibleMarkers: frame.count, recent: frame.recent };
    if (!this.write('\x1b')) { this.pending = null; return { id: request.id, status: 'unavailable', reason: 'Терминал не принял команду' }; }
    return null;
  }
  /** An Esc was sent and waits for its proof: every host step must poll it (M28 T012). */
  get stopping(): boolean { return this.pending !== null; }
  cancel(): HostResult | null {
    const pending = this.pending; this.pending = null;
    return pending ? { id: pending.request.id, status: 'unavailable', reason: 'Экран Claude изменился перед отправкой команды' } : null;
  }
  /**
   * The frame is the only proof (M28 T010): Claude 2.1.325 splits the notice by control codes in the
   * raw stream, and a redraw repeats old text there. A proof is a marker the frame did not have at the
   * press: more markers, or one just above the input where the turn's work was.
   */
  private confirmed(pending: { visibleMarkers: number; recent: boolean }): boolean {
    const frame = frameMarkers(this.screen);
    return frame.count > pending.visibleMarkers || (!pending.recent && frame.recent);
  }
  poll(): HostResult | null {
    const pending = this.pending;
    if (!pending) return null;
    const current = this.snapshot();
    let result: HostResult | null = null;
    if (this.now() >= pending.request.expires) result = { id: pending.request.id, status: 'timeout' };
    else if (current.state === 'idle' && this.confirmed(pending)) result = { id: pending.request.id, status: 'interrupted' };
    if (result) this.pending = null;
    return result;
  }
}
