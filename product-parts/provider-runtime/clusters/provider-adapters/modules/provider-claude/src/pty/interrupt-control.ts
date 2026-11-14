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
const MARKER = /\[Request interrupted by user\]/g;

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

export class InterruptControl {
  readonly screen = new TerminalScreen();
  private epoch = 0;
  private previous: ScreenState = 'unknown';
  private markers = 0;
  private tail = '';
  private pending: { request: HostRequest; markers: number; visibleMarkers: number } | null = null;
  private instance: string;
  private now: () => number;
  private write: (text: string) => boolean;
  constructor(instance: string, now: () => number, write: (text: string) => boolean) { this.instance = instance; this.now = now; this.write = write; }
  feed(text: string): void {
    this.screen.feed(text);
    const raw = this.tail + text;
    const matches = [...raw.matchAll(MARKER)];
    this.markers += matches.length;
    // Only the unfinished suffix is retained, so an old complete marker is never counted twice.
    this.tail = raw.slice(matches.at(-1) ? matches.at(-1)!.index! + matches.at(-1)![0].length : 0).slice(-33);
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
    if (request.epoch !== current.epoch) return { id: request.id, status: 'stale' };
    if (this.pending) return { id: request.id, status: 'unavailable', reason: 'Остановка уже выполняется' };
    if (current.state === 'idle' && this.epoch > 0) return { id: request.id, status: 'already-idle' };
    if (current.state !== 'working') return { id: request.id, status: 'unavailable', reason: current.state === 'dialog' ? DIALOG_REASON : 'Текущий экран Claude не распознан' };
    this.pending = { request, markers: this.markers, visibleMarkers: [...this.screen.text().matchAll(MARKER)].length };
    if (!this.write('\x1b')) { this.pending = null; return { id: request.id, status: 'unavailable', reason: 'Терминал не принял команду' }; }
    return null;
  }
  cancel(): HostResult | null {
    const pending = this.pending; this.pending = null;
    return pending ? { id: pending.request.id, status: 'unavailable', reason: 'Экран Claude изменился перед отправкой команды' } : null;
  }
  poll(): HostResult | null {
    const pending = this.pending;
    if (!pending) return null;
    const current = this.snapshot();
    let result: HostResult | null = null;
    if (this.now() >= pending.request.expires) result = { id: pending.request.id, status: 'timeout' };
    else if (current.state === 'dialog') result = { id: pending.request.id, status: 'unavailable', reason: DIALOG_REASON };
    else if (current.state === 'idle' && this.markers > pending.markers && [...this.screen.text().matchAll(MARKER)].length > pending.visibleMarkers) result = { id: pending.request.id, status: 'interrupted' };
    if (result) this.pending = null;
    return result;
  }
}
