import { createJsonlTail, limitsFile, readSnapshot, snapshotFile } from '#provider-registry';
import type { ContextUsage, ParameterItem, ProviderContext, SessionParameters } from '#provider-registry';
type Dict = Record<string, unknown>;
const obj = (v: unknown): Dict => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Dict : {};
const str = (v: unknown): string | null => typeof v === 'string' && v ? v : null;
const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const EFFORT: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra', max: 'Max', ultra: 'Ultracode' };
const MODE: Record<string, string> = { auto: 'Auto', plan: 'Plan', acceptEdits: 'Accept edits', default: 'Manual', bypassPermissions: 'Bypass', dontAsk: "Don't ask", manual: 'Manual' };
export const CLAUDE_PARAMETER_FONT = '"Anthropic Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
export function claudeModelLabel(id: string): string {
  const m = /^claude-([a-z]+)-(\d+(?:-\d+)*)$/.exec(id);
  return m ? `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]!.replaceAll('-', '.')}` : id;
}
/** Claude counts /context against the auto-compact window (M28 3.1); the model window stays as a second figure. */
export function contextUsage(window: Dict, percent: number | null): ContextUsage {
  const used = num(window['total_input_tokens']); const model = num(window['context_window_size']);
  const threshold = num(window['auto_compact_window']);
  if (threshold && used !== null && (model === null || threshold < model))
    return { usedTokens: used, windowTokens: threshold, usedPercent: Math.min(100, Math.round(100 * used / threshold)), ...(model ? { modelWindowTokens: model } : {}) };
  return { usedTokens: used, windowTokens: model, usedPercent: percent === null ? null : Math.min(100, percent) };
}
/** Transcripts are named by the hook; this reader never searches another project's directory. */
export function createClaudeParameterReader(context: ProviderContext, read: (file: string) => Promise<unknown> = readSnapshot) {
  const tail = createJsonlTail<{ mode: string; assistant: { model: string | null; effort: string | null } }>({
    mode(record) { const r = obj(record); return r['type'] === 'permission-mode' ? str(r['permissionMode']) ?? undefined : undefined; },
    assistant(record) { const r = obj(record); return r['type'] === 'assistant' && r['isSidechain'] !== true ? { model: str(obj(r['message'])['model']), effort: str(r['effort']) } : undefined; },
  });
  return {
    clear() { tail.clear(); },
    async read(sessionId: string, transcript: string | null): Promise<SessionParameters> {
      const safeRead = async (file: string) => obj(await read(file).catch(() => null));
      const [snapshot, account, values] = await Promise.all([
        safeRead(snapshotFile(context.dirs, 'claude', sessionId, context.platform)),
        safeRead(limitsFile(context.dirs, 'claude', context.platform)),
        transcript ? tail.read(transcript).catch(() => ({} as { mode?: string; assistant?: { model: string | null; effort: string | null } })) : Promise.resolve({} as { mode?: string; assistant?: { model: string | null; effort: string | null } }),
      ]);
      const snapshotModel = obj(snapshot['model']);
      const id = str(snapshotModel['id']) ?? values.assistant?.model;
      const model = str(snapshotModel['display_name']) ?? (id ? claudeModelLabel(id) : null);
      const effort = str(obj(snapshot['effort'])['level']) ?? values.assistant?.effort;
      const items: ParameterItem[] = [];
      if (model) items.push({ id: 'model', value: id ?? model, label: model, title: `Модель: ${model}`, tone: 'primary', inRow: true });
      if (effort) items.push({ id: 'effort', value: effort, label: EFFORT[effort] ?? effort, title: `Усилие: ${EFFORT[effort] ?? effort}`, tone: 'muted', inRow: true });
      if (values.mode) items.push({ id: 'mode', value: values.mode, label: MODE[values.mode] ?? values.mode, title: `Режим: ${MODE[values.mode] ?? values.mode}`, tone: 'primary', inRow: true });
      const window = obj(snapshot['context_window']); const percent = num(window['used_percentage']);
      const limits = ['five_hour', 'seven_day'].flatMap(id => {
        const limit = obj(obj(account['rate_limits'])[id]); const used = num(limit['used_percentage']);
        const reset = limit['resets_at']; const date = typeof reset === 'number' ? new Date(reset * 1000) : typeof reset === 'string' ? new Date(reset) : null;
        const at = date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
        if (used === null || (at && date!.getTime() <= context.now().getTime())) return [];
        return [{ id, label: id === 'five_hour' ? '5 ч' : '7 д', usedPercent: Math.min(100, used), resetsAt: at }];
      });
      return { items, context: Object.keys(window).length ? contextUsage(window, percent) : null,
        limits, style: { font: CLAUDE_PARAMETER_FONT, ring: 'last', accent: '#4c8dff' }, editable: false, at: typeof snapshot['at'] === 'string' ? snapshot['at'] : '' };
    },
  };
}
