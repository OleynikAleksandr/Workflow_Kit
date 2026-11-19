// M46: a simulated Claude 2.1.328 terminal for the parameter host tests. Its /model menu follows the
// frames recorded from the live CLI on 19.11.2026 (test/m46-menu.test.ts): the header «Your pick is
// the default for new sessions», «↑/↓ N more» scroll markers, «Effort not supported for …» and the
// footer «s to use this session only · Enter to save · Esc to cancel».
import type { NativeMetadata } from '../src/pty/parameter-protocol.ts';

const NAMES = ['', 'Default (recommended)', 'Opus 5.5', 'Fable 5.2', 'Sonnet 5.5', 'Haiku 5.5', 'Fable 5.1', 'Haiku 4.5', 'Sonnet 5', 'Opus 5', 'Fable 5', 'Opus 4.8', 'Opus 4.7', 'Opus 4.6', 'Sonnet 4.6'];
const NO_EFFORT = new Set(['Haiku 4.5']);
const LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
const VIEW = 11;
type Item = number | 'more';
const label = (level: string) => (level === 'xhigh' ? 'xHigh' : level[0]!.toUpperCase() + level.slice(1));

export class Claude2128 {
  menu = false; draft = ''; expanded = false; selection: Item = 2; top = 0; row = 'xhigh';
  current = 'Opus 5.5'; effort = 'xhigh'; acks: string[] = []; enterOnModel = 0;
  readonly meta: NativeMetadata; private readonly now: () => number;
  constructor(meta: NativeMetadata, now: () => number) { this.meta = meta; this.now = now; }
  private items(): Item[] { return [1, 2, 3, 4, 5, 'more', ...(this.expanded ? [6, 7, 8, 9, 10, 11, 12, 13, 14] : [])]; }
  screen(): string {
    if (!this.menu) {
      const bar = '─'.repeat(60);
      return [...this.acks.slice(-6), `${bar}`, `❯ ${this.draft}`, bar, `  ${this.current} | effort:${this.effort}`, '  ⏵⏵ auto mode on (shift+tab to cycle)'].join('\r\n');
    }
    const items = this.items(); const at = items.indexOf(this.selection);
    if (at < this.top) this.top = at; if (at >= this.top + VIEW) this.top = at - VIEW + 1;
    const shown = items.slice(this.top, this.top + VIEW); const below = items.length - this.top - shown.length;
    const lines = ['  Select model', '  Your pick is the default for new sessions. For other models, use --model.'];
    if (this.top > 0) lines.push(`    ↑ ${this.top} more`);
    for (const item of shown) {
      const mark = item === this.selection ? '❯' : ' ';
      if (item === 'more') lines.push(`  ${mark} ${this.expanded ? '▾' : '▸'}   More models`);
      else lines.push(`  ${mark} ${item}.${item < 10 ? '  ' : ' '}${NAMES[item]}${NAMES[item] === this.current ? ' ✔' : ''}   Description`);
    }
    if (below > 0) lines.push(`    ↓ ${below} more`);
    if (this.selection === 'more') lines.push(`  Enter to ${this.expanded ? 'collapse' : 'expand'} · Esc to cancel`);
    else {
      const name = NAMES[this.selection]!;
      lines.push(NO_EFFORT.has(name) ? `  ○ Effort not supported for ${name}` : `  ◉ ${label(this.row)} effort${this.row === 'medium' ? ' (default)' : ''} ←/→ to adjust`);
      lines.push('  s to use this session only · Enter to save · Esc to cancel');
    }
    return lines.join('\r\n');
  }
  /** One write of the host: a text or the bytes of one key (NATIVE_KEYS). */
  input(raw: string): void {
    // The ConPTY host pastes text in bracketed-paste markers.
    const bytes = raw.startsWith('\x1b[200~') && raw.endsWith('\x1b[201~') ? raw.slice(6, -6) : raw;
    if (!this.menu) {
      if (bytes === '\r') { if (this.draft === '/model') { this.menu = true; this.expanded = false; this.top = 0; this.selection = NAMES.indexOf(this.current); this.row = this.effort; this.acks.push('❯ /model'); } this.draft = ''; }
      else if (bytes === '\x15') this.draft = '';
      else if (!bytes.startsWith('\x1b')) this.draft += bytes;
      return;
    }
    const items = this.items(); const at = items.indexOf(this.selection);
    if (bytes === '\x1b[A') this.selection = items[Math.max(0, at - 1)]!;
    else if (bytes === '\x1b[B') this.selection = items[Math.min(items.length - 1, at + 1)]!;
    else if (bytes === '\x1b[C' || bytes === '\x1b[D') {
      if (typeof this.selection === 'number' && !NO_EFFORT.has(NAMES[this.selection]!)) this.row = LEVELS[Math.max(0, Math.min(4, LEVELS.indexOf(this.row) + (bytes === '\x1b[C' ? 1 : -1)))]!;
    } else if (bytes === '\r') {
      if (this.selection === 'more') this.expanded = !this.expanded; else this.enterOnModel++;
    } else if (bytes === 's' && typeof this.selection === 'number') {
      const name = NAMES[this.selection]!; const changed = this.row !== this.effort;
      this.current = name; this.effort = this.row;
      this.acks.push(`  ⎿  Set model to ${name} for this session only${changed ? ` with ${this.row} effort` : ''}`);
      this.meta.model = { id: `claude-${name.toLowerCase().replace(/[ .]/g, '-')}`, label: name }; this.meta.effort = this.effort; this.meta.at = this.now();
      this.menu = false;
    } else if (bytes === '\x1b') { this.acks.push(`  ⎿  Kept model as ${this.current}`); this.menu = false; }
  }
}
