import { ProviderError, createJsonlTail } from '#provider-registry';
import type { ParameterId, ParameterItem, ParameterOption, SessionParameters, SharedAccess } from '#provider-registry';
import type { CodexRuntime } from './runtime.ts';
import type { RpcSession } from './rpc.ts';
import { RpcError } from './rpc.ts';
import { obj, str, finite, list, valueLabel, permissionId, LABELS } from './parameter-values.ts';
import type { Dict } from './parameter-values.ts';

export const PARAMETER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif';
export const FULL_ACCESS_CONFIRM = 'Агент получит полный доступ к диску и сети этого компьютера. Продолжить?';
export const UPDATE_UNSUPPORTED = 'Эта версия Codex не поддерживает изменение параметров';
interface FileValues { settings: { value: Dict; fromTurn: boolean }; tokens: Dict }
export interface ParameterState {
  thread: Dict; file: string | null; settings: Dict; fromTurn: boolean;
  models: Dict[]; modes: Dict[]; profiles: Dict[]; catalogs: Record<string, boolean>;
  experimental: boolean; parameters: SessionParameters;
}

/** All calls in a read share one connection. No daemon probe, load or external program. */
export function createParameterParts(rt: CodexRuntime, shared: Pick<SharedAccess, 'cached'>) {
  const tail = createJsonlTail<FileValues>({
    settings(record) {
      const r = obj(record); const p = obj(r['payload']);
      if (r['type'] === 'turn_context') return { value: p, fromTurn: true };
      if (r['type'] === 'event_msg' && p['type'] === 'thread_settings_applied' && p['thread_settings']) return { value: obj(p['thread_settings']), fromTurn: false };
      return undefined;
    },
    tokens(record) { const r = obj(record); const p = obj(r['payload']); return r['type'] === 'event_msg' && p['type'] === 'token_count' && p['info'] ? obj(p['info']) : undefined; },
  });
  const caches = new Map<string, { at: number; value: Dict | null }>();
  let unsupported = false;
  async function cached(session: RpcSession, method: string, ttl: number, force = false): Promise<Dict | null> {
    const now = rt.context.now().getTime(); const old = caches.get(method);
    if (!force && old && now - old.at < ttl) return old.value;
    const value = await session.request(method, {}).then(obj).catch(() => null);
    caches.set(method, { at: now, value }); return value;
  }
  async function connect<T>(fn: (session: RpcSession, experimental: boolean) => Promise<T>): Promise<T> {
    try { return await rt.withDaemon(s => fn(s, true), undefined, true); }
    catch (error) {
      if (error instanceof RpcError && error.method === 'initialize') return rt.withDaemon(s => fn(s, false));
      throw error;
    }
  }
  function unavailable(error: unknown): ProviderError {
    return error instanceof ProviderError ? error : new ProviderError('parameters-unavailable', `Не удалось прочитать параметры ChatGPT: ${(error as Error).message}`, { status: 503, hint: 'Проверьте подключение демона Codex' });
  }
  async function readState(session: RpcSession, id: string, experimental: boolean): Promise<ParameterState> {
    const answer = obj(await session.request('thread/read', { threadId: id, includeTurns: false }));
    const thread = obj(answer['thread']); const file = str(thread['path']);
    const values = file ? await tail.read(file).catch(() => ({} as Partial<FileValues>)) : {};
    const settings = values.settings?.value ?? {}; const fromTurn = values.settings?.fromTurn ?? false;
    const [modelData, modeData, profileData, rateData] = await Promise.all([
      cached(session, 'model/list', 600000), cached(session, 'collaborationMode/list', 600000),
      cached(session, 'permissionProfile/list', 600000), cached(session, 'account/rateLimits/read', 60000),
    ]);
    let models = list(modelData?.['data']);
    const model = str(thread['model']); const effort = str(thread['reasoningEffort']);
    const knownModel = models.find(m => m['model'] === model || m['id'] === model);
    if (modelData && model && (!knownModel || (effort && !list(knownModel['supportedReasoningEfforts']).some(e => e['reasoningEffort'] === effort)))) {
      models = list((await cached(session, 'model/list', 600000, true))?.['data']);
    }
    const modes = list(modeData?.['data']); const profiles = list(profileData?.['data']);
    const catalogs = { model: !!modelData, effort: !!modelData, speed: !!modelData, mode: !!modeData, permissions: !!profileData };
    const activeModel = models.find(m => m['model'] === model || m['id'] === model);
    const current: Partial<Record<ParameterId, string | null>> = {};
    if (model) current.model = model;
    if (effort) current.effort = effort;
    if (values.settings) {
      if (Object.hasOwn(settings, 'service_tier')) current.speed = str(settings['service_tier']) ?? 'standard';
      const mode = str(obj(settings['collaboration_mode'])['mode']); if (mode) current.mode = mode;
      if (settings['permission_profile'] || settings['sandbox_policy']) current.permissions = permissionId(settings, fromTurn, rt.context.platform);
    }
    const status = shared.cached();
    const reason = unsupported ? UPDATE_UNSUPPORTED : !experimental ? UPDATE_UNSUPPORTED : (!file || !values.settings) ? 'Параметры можно менять после первого сообщения'
      : !status ? 'Состояние общего доступа проверяется' : !['active', 'unsupported'].includes(status.state)
        ? 'Включите общий доступ к чатам ChatGPT: без него приложение держит чат у себя' : null;
    const options: Partial<Record<ParameterId, ParameterOption[]>> = {
      model: models.filter(m => m['hidden'] !== true && str(m['model'] ?? m['id'])).map(m => { const value = String(m['model'] ?? m['id']); return { value, label: valueLabel('model', value, models) }; }),
      effort: list(activeModel?.['supportedReasoningEfforts']).flatMap(e => { const value = str(e['reasoningEffort']); return value ? [{ value, label: valueLabel('effort', value, models) }] : []; }),
      speed: activeModel ? [{ value: 'standard', label: 'Стандартная' }, ...list(activeModel['serviceTiers']).flatMap(t => { const value = str(t['id']); return value ? [{ value, label: valueLabel('speed', value, models) }] : []; })] : [],
      mode: modes.flatMap(m => { const value = str(m['mode']); return value ? [{ value, label: valueLabel('mode', value, models) }] : []; }),
      permissions: profiles.flatMap(p => { const value = str(p['id']); return value ? [{ value, label: valueLabel('permissions', value, models), disabled: p['allowed'] !== true, ...(p['allowed'] !== true ? { reason: 'Запрещено политикой провайдера' } : {}), ...(value === ':danger-full-access' ? { confirm: FULL_ACCESS_CONFIRM } : {}) }] : []; }),
    };
    const items: ParameterItem[] = [];
    for (const id of ['speed', 'model', 'effort', 'permissions', 'mode'] as const) {
      if (!Object.hasOwn(current, id)) continue;
      const value = current[id] ?? null;
      const label = value === null ? 'Особые разрешения' : valueLabel(id, value, models);
      const available = !reason && catalogs[id] && options[id]?.length;
      items.push({ id, value, label, tone: id === 'effort' ? 'muted' : 'primary', title: `${LABELS[id]}: ${label}`,
        inRow: id === 'speed' ? value === 'priority' : id === 'mode' ? value === 'plan' : true,
        ...(id === 'speed' && value === 'priority' ? { icon: 'zap' as const } : {}),
        ...(available ? { options: options[id] } : { reason: reason ?? `Список «${LABELS[id]}» сейчас недоступен` }),
      });
    }
    const info = values.tokens;
    const used = finite(obj(info?.['last_token_usage'])['total_tokens']); const window = finite(info?.['model_context_window']);
    const limits = ['primary', 'secondary'].flatMap(id => {
      const w = obj(obj(rateData?.['rateLimits'])[id]); const percent = finite(w['usedPercent']); const minutes = finite(w['windowDurationMins']);
      if (percent === null || minutes === null) return [];
      const reset = finite(w['resetsAt']); const date = reset === null ? null : new Date(reset * 1000);
      return [{ id, label: minutes < 60 ? `${minutes} мин` : minutes < 1440 ? `${minutes / 60} ч` : `${minutes / 1440} д`, usedPercent: Math.min(100, percent), resetsAt: date && Number.isFinite(date.getTime()) ? date.toISOString() : null }];
    });
    const approval = str(settings['approval_policy']);
    const parameters: SessionParameters = { items, context: info ? { usedTokens: used, windowTokens: window, usedPercent: used !== null && window ? Math.min(100, 100 * used / window) : null } : null,
      limits, style: { font: PARAMETER_FONT, ring: 'first' }, editable: items.some(i => !!i.options?.length), ...(reason ? { reason } : {}), ...(approval ? { notes: [`Одобрения: ${approval}`] } : {}), at: rt.context.now().toISOString() };
    return { thread, file, settings, fromTurn, models, modes, profiles, catalogs, experimental, parameters };
  }
  return {
    connect, readState, unavailable,
    clearCache() { caches.clear(); tail.clear(); unsupported = false; },
    clearFile(file: string) { tail.clear(file); },
    markUnsupported() { unsupported = true; },
    async readParameters(id: string): Promise<SessionParameters> {
      try { return await connect(async (s, experimental) => (await readState(s, id, experimental)).parameters); }
      catch (error) { throw unavailable(error); }
    },
  };
}
