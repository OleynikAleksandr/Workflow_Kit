import type { TerminalScreen } from '#pty-host';
import { WORKING_LINE, promptRow, screenLines, screenState } from './interrupt-control.ts';
import { EFFORTS, nativeModelKey } from './parameter-protocol.ts';
import type { NativeModelOption } from './parameter-protocol.ts';

export interface ModelRow extends NativeModelOption { index: number; selected: boolean }
export interface ParameterFrame {
  kind: 'idle' | 'busy' | 'dialog' | 'unknown' | 'model' | 'effort' | 'fast';
  input: string | null; placeholder: boolean; mode: string | null; ultracode: boolean | null; baseEffort: string | null;
  rows: ModelRow[]; selected: number | 'more' | null; more: 'closed' | 'open' | null;
  hiddenModels: number; efforts: string[]; previewEffort: string | null; ultraAvailable: boolean;
  text: string;
}
export function parameterFrame(screen: TerminalScreen): ParameterFrame {
  const text = screen.text(); const lines = screenLines(text); const tail = lines.slice(-12).join('\n');
  const frame: ParameterFrame = { kind: 'unknown', input: null, placeholder: false, mode: null, ultracode: null, baseEffort: null,
    rows: [], selected: null, more: null, hiddenModels: 0, efforts: [], previewEffort: null, ultraAvailable: false, text };
  if (!screen.valid) return frame;
  const mode = /(?:⏵⏵|⏸)\s*(auto|manual|accept edits|plan|bypass permissions)\s+(?:mode\s+)?on/i.exec(tail);
  frame.mode = mode ? ({ manual: 'default', 'accept edits': 'acceptEdits', 'bypass permissions': 'bypassPermissions' }[mode[1]!.toLowerCase()] ?? mode[1]!.toLowerCase()) : null;
  const row = promptRow(lines); const root: [number, string] | undefined = row >= 0 && row >= lines.length - 10 ? [row, lines[row]!] : undefined;
  if (root) {
    frame.input = root[1].replace(/^\s*❯\s?/, '').trim();
    // A placeholder (`Try "…"`) or Claude's dim suggestion after a turn: the cursor stays before it.
    frame.placeholder = frame.input !== '' && screen.cursor().row === root[0] && screen.cursor().col <= 3;
    frame.baseEffort = /\b(low|medium|high|xhigh|max)\b.*\/effort\s*$/i.exec(lines[root[0] - 2] ?? '')?.[1]?.toLowerCase() ?? null;
  }
  if (/esc to interrupt/i.test(tail) || WORKING_LINE.test(lines.slice(Math.max(0, (root?.[0] ?? lines.length) - 8), root ? root[0] - 1 : undefined).join('\n'))) { frame.kind = 'busy'; return frame; }
  // The live settings menu replaces the input and ends with its own documented footer.
  if (!root && /Select model/.test(text) && /Enter to (?:set as default|expand|collapse).*Esc to cancel/.test(tail)) {
    frame.kind = 'model'; let more = false;
    for (const line of lines) {
      if (/More models/.test(line)) { frame.more = /▾/.test(line) ? 'open' : 'closed'; more = true; if (/❯/.test(line)) frame.selected = 'more'; }
      const row = /^\s*([❯↓]?)\s*(\d+)\.\s+(.+?)(?=\s{2,}|\s*✔|$)/.exec(line);
      if (row) {
        const label = row[3]!.trim(); const index = Number(row[2]);
        if (row[1] === '❯') frame.selected = index;
        if (!/^Default\b/.test(label)) frame.rows.push({ key: nativeModelKey(label), label, index, selected: row[1] === '❯', group: more ? 'more' : 'primary' });
      }
    }
    frame.hiddenModels = Number(/…\s*\+(\d+) models?/.exec(text)?.[1] ?? 0);
    return frame;
  }
  if (!root && /^\s*Effort\s*$/m.test(text) && /s for this session only.*Esc to cancel/.test(tail)) {
    frame.kind = 'effort';
    const levels = lines.findIndex(line => /^\s*low(?:\s|$)/.test(line));
    if (levels >= 0) {
      const row = lines[levels]!;
      const options = [...row.matchAll(/\b(low|medium|high|xhigh|max)\b/g)];
      frame.efforts = options.map(m => m[1]!).filter(v => (EFFORTS as readonly string[]).includes(v));
      const caret = lines[levels - 1]?.indexOf('▲') ?? -1;
      if (caret >= 0) frame.previewEffort = options.sort((a, b) => Math.abs(a.index! + (a[1]!.length - 1) / 2 - caret) - Math.abs(b.index! + (b[1]!.length - 1) / 2 - caret))[0]?.[1] ?? null;
    }
    frame.ultraAvailable = /Tab to toggle/.test(text);
    const ultra = /Ultracode\s+(on|off)/.exec(text);
    frame.ultracode = ultra ? ultra[1] === 'on' : null;
    return frame;
  }
  if (!root && /Fast mode/.test(text) && /Esc to cancel/.test(tail)) { frame.kind = 'fast'; return frame; }
  const state = screenState(screen);
  frame.kind = state === 'working' ? 'busy' : state;
  // A draft (text with the cursor after it) is not an empty idle prompt.
  if (frame.kind === 'idle' && root && frame.input && !frame.placeholder) frame.kind = 'unknown';
  if (root && frame.mode && (frame.input === '' || frame.placeholder)) frame.kind = 'idle';
  if (root && frame.mode) frame.ultracode = /(?:^|[ ·])ultracode(?:\s*─|\s*·|\s*$)/im.test(tail);
  return frame;
}
