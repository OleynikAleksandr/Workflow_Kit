import { ProviderError } from '#provider-registry';
import type { ParameterChange, ParameterId, ParameterItem, Project, SessionParameters } from '#provider-registry';
import type { ClaudeRuntime } from './runtime.ts';
import { findSession } from './sessions.ts';
import { applyNativeParameter, nativeParameterState } from './native-parameters.ts';
import { createClaudeParameterReader } from './parameters.ts';
import type { NativeField, NativeParameterState } from './pty/parameter-protocol.ts';
const EFFORT: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra', max: 'Max' };
export const CLAUDE_MODES = [
  { value: 'auto', label: 'Auto', description: 'Claude handles permission decisions' },
  { value: 'default', label: 'Manual', description: 'Always ask before making changes' },
  { value: 'acceptEdits', label: 'Accept edits', description: 'Automatically accept all file edits' },
  { value: 'plan', label: 'Plan', description: 'Create a plan before making changes' },
];
export function nativeClaudeParameters(base: SessionParameters, state: NativeParameterState | null): SessionParameters {
  if (!state) return { ...base, presentation: { layout: 'claude-controls' }, editable: false,
    reason: 'Управление этой сессией недоступно: нет свежего состояния нового host Claude',
    ...(base.items.some(i => i.id === 'effort' && i.value === 'ultra') ? { notes: ['Ultracode: базовый effort неизвестен в старом снимке'] } : {}) };
  const ready = state.status === 'idle' && state.inputEmpty && state.models.length > 0 && state.efforts.length > 0;
  const reason = ready ? undefined : state.status === 'control' ? 'Нативный ввод Claude занят'
    : state.status === 'busy' ? 'Claude ещё отвечает' : state.status === 'dialog' ? 'Claude ждёт решения в своём приложении'
    : state.reason ?? 'Нативный каталог Claude ещё не получен';
  const items: ParameterItem[] = [];
  const add = (id: ParameterId, value: string | null, label: string, inRow: boolean, tone: ParameterItem['tone'] = 'primary'): ParameterItem => {
    const item: ParameterItem = { id, value, label, title: `${id}: ${label}`, inRow, tone }; items.push(item); return item;
  };
  const model = add('model', state.model?.id ?? null, state.model?.label ?? 'Модель неизвестна', true);
  const order = ['Opus', 'Fable', 'Sonnet', 'Haiku'];
  const ordered = [...state.models].sort((a, b) => {
    if (a.group !== b.group) return a.group === 'primary' ? -1 : 1;
    if (a.group !== 'primary') return 0;
    const rank = (label: string): number => { const index = order.indexOf(label.split(' ')[0]!); return index < 0 ? order.length : index; };
    return rank(a.label) - rank(b.label);
  });
  model.options = ordered.map(m => ({ value: m.key, label: m.label, group: m.group, selected: m.label === state.model?.label, ...(!ready ? { disabled: true, reason } : {}) }));
  const effort = add('effort', state.effort, state.effort ? EFFORT[state.effort] ?? state.effort : 'Усилие неизвестно', true, 'muted');
  effort.options = state.efforts.map(value => ({ value, label: EFFORT[value] ?? value, selected: value === state.effort, ...(state.effortRecommended === value ? { recommended: true } : {}), ...(!ready ? { disabled: true, reason } : {}) }));
  // Recommended is native model policy; absent evidence is not guessed from a screenshot.
  const ultra = add('ultracode', state.ultracode === null ? null : state.ultracode ? 'on' : 'off', 'Ultracode', state.ultracode === true, 'muted');
  ultra.options = ['on', 'off'].map(value => ({ value, label: value === 'on' ? 'On' : 'Off', selected: ultra.value === value,
    ...(!ready || !state.ultracodeAvailable ? { disabled: true, reason: reason ?? 'Ultracode недоступен в native меню этой модели' } : {}) }));
  const mode = add('mode', state.mode, CLAUDE_MODES.find(m => m.value === state.mode)?.label ?? state.mode ?? 'Режим неизвестен', false);
  mode.options = CLAUDE_MODES.map(option => ({ ...option, selected: state.mode === option.value, ...(!ready ? { disabled: true, reason } : {}) }));
  const speed = add('speed', state.fast === null ? null : state.fast ? 'fast' : 'standard', state.fast === null ? 'Скорость неизвестна' : state.fast ? 'Fast' : 'Standard', state.fast === true);
  speed.options = ['standard', 'fast'].map(value => ({ value, label: value === 'fast' ? 'Fast' : 'Standard', disabled: true,
    reason: state.fastReason ?? 'Session-local управление скоростью не подтверждено' }));
  return { ...base, items, presentation: { layout: 'claude-controls' }, editable: ready, ...(reason ? { reason } : {}), at: new Date(state.at).toISOString() };
}
export function createClaudeControls(rt: ClaudeRuntime, reader = createClaudeParameterReader(rt.context)) {
  async function read(project: Project, sid: string): Promise<SessionParameters> {
    const found = await findSession(rt, project, sid);
    const [base, state] = await Promise.all([reader.read(found.hook?.hook.sessionId ?? found.record?.localId ?? sid, found.hook?.hook.transcriptPath ?? null), nativeParameterState(rt, project, sid)]);
    return nativeClaudeParameters(base, state);
  }
  return { read, async update(project: Project, sid: string, change: ParameterChange): Promise<SessionParameters> {
    const invalid = (): never => { throw new ProviderError('parameter-invalid', 'Claude принимает одно изменение model/effort/speed/mode/ultracode за запрос', { status: 400 }); };
    if (!change || typeof change !== 'object' || Array.isArray(change)) return invalid();
    const fields = Object.keys(change).filter(k => k !== 'confirmed');
    if (fields.length !== 1 || !['model', 'effort', 'speed', 'mode', 'ultracode'].includes(fields[0]!)
      || (change.confirmed !== undefined && typeof change.confirmed !== 'boolean')) return invalid();
    const field = fields[0] as ParameterId; const value = change[field as keyof ParameterChange];
    if (typeof value !== 'string' || !value || value.length > 128) return invalid();
    const before = await read(project, sid);
    if (!before.editable) {
      const current = await nativeParameterState(rt, project, sid);
      const unavailable = !current || current.status === 'unknown' || current.status === 'idle';
      throw new ProviderError(unavailable ? 'parameters-unavailable' : 'parameters-busy', before.reason ?? 'Нативный ввод Claude занят', { status: unavailable ? 503 : 409 });
    }
    const option = before.items.find(i => i.id === field)?.options?.find(o => o.value === value);
    if (!option) return invalid();
    if (option.disabled) throw new ProviderError('parameters-unavailable', option.reason ?? 'Вариант недоступен', { status: 503 });
    if (option.selected === true || (option.selected === undefined && value === before.items.find(i => i.id === field)?.value)) return before;
    if (option.confirm && change.confirmed !== true) throw new ProviderError('confirmation-required', option.confirm, { status: 409, details: { confirm: option.confirm } });
    try { await applyNativeParameter(rt, project, sid, field as Exclude<NativeField, 'catalog'>, value); }
    catch (error) {
      if (!(error instanceof ProviderError)) throw error;
      const code = error.code === 'native-timeout' ? 'parameters-timeout' : error.code === 'native-stale' ? 'parameters-stale'
        : ['native-busy', 'native-cancelled'].includes(error.code) ? 'parameters-busy' : 'parameters-unavailable';
      throw new ProviderError(code, error.message, { status: code === 'parameters-timeout' ? 504 : code === 'parameters-unavailable' ? 503 : 409 });
    }
    return read(project, sid);
  } };
}
