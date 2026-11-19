import { ProviderError } from '#provider-registry';
import type { ParameterChange, ParameterFailure, ParameterId, ParameterItem, Project, SessionParameters } from '#provider-registry';
import type { ClaudeRuntime } from './runtime.ts';
import { findSession } from './sessions.ts';
import { nativeParameterState } from './native-parameters.ts';
import { cachedCatalog, dropWanted, mergeWanted, pruneWanted, saveCatalog } from './native-wanted.ts';
import { createClaudeParameterReader } from './parameters.ts';
import { FAST_REASON } from './pty/parameter-protocol.ts';
import { hostBuild } from './pty/host-build.ts';
import type { NativeCatalog, NativeModelOption, NativeParameterState, NativeWanted, WantedField } from './pty/parameter-protocol.ts';
const EFFORT: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra', max: 'Max' };
export const CLAUDE_MODES = [
  { value: 'auto', label: 'Auto', description: 'Claude handles permission decisions' },
  { value: 'default', label: 'Manual', description: 'Always ask before making changes' },
  { value: 'acceptEdits', label: 'Accept edits', description: 'Automatically accept all file edits' },
  { value: 'plan', label: 'Plan', description: 'Create a plan before making changes' },
];
/** The catalog is read once on a free, empty Claude input and then cached (M28 T014, M29). */
export const CATALOG_PENDING = 'Список моделей Claude появится, когда Claude будет свободен';
export const EFFORTS_PENDING = 'Варианты усилия появятся, когда Claude будет свободен';
/** M30: the /model menu shows no effort row for this model (for example Haiku 4.5). */
export const NO_EFFORTS = 'У этой модели нет выбора усилия';
/** M29 3.3: a session without a live host that reads the wanted file stays read-only. */
export const HOST_REQUIRED = 'Управление доступно для сессий, запущенных панелью Workflow Kit 0.13.3 или новее';
/** M47: the host of this session runs an older build than the installed one (host-build.ts). */
export const HOST_OUTDATED = 'Сессия запущена до обновления Workflow Kit: управление моделью и уровнем в ней устарело. Остановите сессию и возобновите её в панели';
/** How long a failed choice stays in `failures` (M29 3.3). */
export const FAILURE_MS = 60_000;
/** Where a pending choice stands: Claude free, answering or holding a draft. */
export function pendingNote(state: NativeParameterState): string {
  if (state.status === 'idle' || state.status === 'control') return state.inputEmpty || state.status === 'control' ? 'применяется' : 'применится, когда поле ввода Claude опустеет';
  if (state.status === 'busy') return 'применится, когда Claude закончит ответ';
  return 'применится, когда Claude освободится';
}
export interface NativeExtras { catalog?: NativeCatalog | null; wanted?: NativeWanted | null; failures?: ParameterFailure[]; /** M47: the label of the installed host build. */ build?: string | null }
export function nativeClaudeParameters(base: SessionParameters, state: NativeParameterState | null, extras: NativeExtras = {}): SessionParameters {
  if (!state || state.wantedFile !== true) return { ...base, presentation: { layout: 'claude-controls' }, editable: false,
    reason: !state ? 'Управление этой сессией недоступно: нет свежего состояния нового host Claude' : HOST_REQUIRED,
    ...(base.items.some(i => i.id === 'effort' && i.value === 'ultra') ? { notes: ['Ultracode: базовый effort неизвестен в старом снимке'] } : {}) };
  // M47: a host of another build keeps its own (older) menu parsing: its controls are not offered.
  if (extras.build && state.hostBuild !== extras.build) return { ...base, presentation: { layout: 'claude-controls' }, editable: false, reason: HOST_OUTDATED };
  // M29: menus come from the host or the cached catalog of the same CLI version; a turn does not
  // lock them — the choice waits in the wanted file until Claude is free.
  const catalog = extras.catalog?.cliVersion === state.cliVersion ? extras.catalog : null;
  const models: NativeModelOption[] = state.models.length ? state.models : (catalog?.models ?? []).map(({ key, label, group }) => ({ key, label, group }));
  const known = state.model ? catalog?.efforts[state.model.label] : undefined;
  const efforts = state.efforts.length ? state.efforts : known?.values ?? [];
  const recommended = state.efforts.length ? state.effortRecommended : known?.recommended ?? null;
  const ultraAvailable = state.efforts.length ? state.ultracodeAvailable === true : known?.ultracode === true;
  const noEfforts = !state.efforts.length && known?.values.length === 0;
  const reason = !models.length ? CATALOG_PENDING : noEfforts ? NO_EFFORTS : !efforts.length ? EFFORTS_PENDING : undefined;
  const note = pendingNote(state);
  const items: ParameterItem[] = [];
  const add = (id: ParameterId, value: string | null, label: string, inRow: boolean, tone: ParameterItem['tone'] = 'primary'): ParameterItem => {
    const item: ParameterItem = { id, value, label, title: `${id}: ${label}`, inRow, tone }; items.push(item); return item;
  };
  const model = add('model', state.model?.id ?? null, state.model?.label ?? 'Модель неизвестна', true);
  const order = ['Opus', 'Fable', 'Sonnet', 'Haiku'];
  const ordered = [...models].sort((a, b) => {
    if (a.group !== b.group) return a.group === 'primary' ? -1 : 1;
    if (a.group !== 'primary') return 0;
    const rank = (label: string): number => { const index = order.indexOf(label.split(' ')[0]!); return index < 0 ? order.length : index; };
    return rank(a.label) - rank(b.label);
  });
  model.options = ordered.map(m => ({ value: m.key, label: m.label, group: m.group, selected: m.label === state.model?.label }));
  const effort = add('effort', state.effort, state.effort ? EFFORT[state.effort] ?? state.effort : 'Усилие неизвестно', true, 'muted');
  effort.options = efforts.map(value => ({ value, label: EFFORT[value] ?? value, selected: value === state.effort, ...(recommended === value ? { recommended: true } : {}) }));
  const ultra = add('ultracode', state.ultracode === null ? null : state.ultracode ? 'on' : 'off', 'Ultracode', state.ultracode === true, 'muted');
  ultra.options = ['on', 'off'].map(value => ({ value, label: value === 'on' ? 'On' : 'Off', selected: ultra.value === value,
    ...(!ultraAvailable ? { disabled: true, reason: 'Ultracode недоступен в native меню этой модели' } : {}) }));
  const mode = add('mode', state.mode, CLAUDE_MODES.find(m => m.value === state.mode)?.label ?? state.mode ?? 'Режим неизвестен', false);
  mode.options = CLAUDE_MODES.map(option => ({ ...option, selected: state.mode === option.value }));
  const speed = add('speed', state.fast === null ? null : state.fast ? 'fast' : 'standard', state.fast === null ? 'Скорость неизвестна' : state.fast ? 'Fast' : 'Standard', state.fast === true);
  speed.options = ['standard', 'fast'].map(value => ({ value, label: value === 'fast' ? 'Fast' : 'Standard', disabled: true, reason: FAST_REASON }));
  for (const item of items) {
    const value = extras.wanted?.changes[item.id as WantedField];
    if (value !== undefined) item.pending = { value, label: item.options?.find(o => o.value === value)?.label ?? value, note };
  }
  return { ...base, items, presentation: { layout: 'claude-controls' }, editable: true, ...(reason ? { reason } : {}),
    ...(extras.failures?.length ? { failures: extras.failures } : {}), at: new Date(state.at).toISOString() };
}
export function createClaudeControls(rt: ClaudeRuntime, reader = createClaudeParameterReader(rt.context)) {
  const failures = new Map<string, ParameterFailure[]>();
  const failuresOf = (debug: string): ParameterFailure[] => {
    const now = rt.context.now().getTime();
    const list = (failures.get(debug) ?? []).filter(f => now - Date.parse(f.at) < FAILURE_MS);
    if (list.length) failures.set(debug, list); else failures.delete(debug);
    return list;
  };
  async function read(project: Project, sid: string): Promise<SessionParameters> {
    const found = await findSession(rt, project, sid);
    const [base, state] = await Promise.all([reader.read(found.hook?.hook.sessionId ?? found.record?.localId ?? sid, found.hook?.hook.transcriptPath ?? null, found.hook?.hook.cwd ?? found.record?.projectPath ?? project.path), nativeParameterState(rt, project, sid)]);
    const debug = found.record?.debugFile;
    if (!state || !debug || state.wantedFile !== true) return nativeClaudeParameters(base, state);
    const build = hostBuild();
    if (build && state.hostBuild !== build) return nativeClaudeParameters(base, state, { build });
    const { wanted, settled } = await pruneWanted(debug, state);
    const at = rt.context.now().toISOString();
    for (const s of settled) if (s.status === 'failed') failures.set(debug, [...(failures.get(debug) ?? []).filter(f => f.field !== s.field), { field: s.field, value: s.value, reason: s.reason ?? 'Claude не принял изменение', at }]);
    if (state.models.length) await saveCatalog(rt, debug).catch(() => undefined);
    const catalog = state.models.length && state.efforts.length ? null : await cachedCatalog(rt);
    return nativeClaudeParameters(base, state, { catalog, wanted, failures: failuresOf(debug), build });
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
    if (!before.editable) throw new ProviderError('parameters-unavailable', before.reason ?? HOST_REQUIRED, { status: 503 });
    const item = before.items.find(i => i.id === field);
    const option = item?.options?.find(o => o.value === value);
    if (!item || !option) return invalid();
    if (option.disabled) throw new ProviderError('parameters-unavailable', option.reason ?? 'Вариант недоступен', { status: 503 });
    if (option.confirm && change.confirmed !== true) throw new ProviderError('confirmation-required', option.confirm, { status: 409, details: { confirm: option.confirm } });
    const { record } = await findSession(rt, project, sid);
    const state = await nativeParameterState(rt, project, sid);
    if (!record?.debugFile || !state) throw new ProviderError('parameters-unavailable', HOST_REQUIRED, { status: 503 });
    // The confirmed value again cancels a waiting choice of this field; otherwise the choice waits
    // in the wanted file and the host applies it when Claude is free. Nothing waits here.
    if (option.selected === true || value === item.value) await dropWanted(record.debugFile, field as WantedField);
    else await mergeWanted(record.debugFile, state, field as WantedField, value);
    return read(project, sid);
  } };
}
