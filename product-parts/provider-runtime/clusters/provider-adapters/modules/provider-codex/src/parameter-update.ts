import { createKeyedMutex } from '#data-store';
import { ProviderError } from '#provider-registry';
import type { ParameterChange, SessionParameters } from '#provider-registry';
import type { CodexRuntime } from './runtime.ts';
import type { SharedMode } from './shared-mode.ts';
import type { createParameterParts } from './parameters.ts';
import { FULL_ACCESS_CONFIRM, UPDATE_UNSUPPORTED } from './parameters.ts';
import { obj, str, list } from './parameter-values.ts';
import type { Dict } from './parameter-values.ts';
import { RpcError } from './rpc.ts';

const invalid = (field: string, value: unknown): never => { throw new ProviderError('parameter-invalid', `Недопустимый параметр ${field}: ${String(value)}`, { status: 400 }); };
function unavailable(message: string, hint = 'Проверьте подключение демона Codex'): never {
  throw new ProviderError('parameters-unavailable', message, { status: 503, hint });
}
/** All entry points serialize by thread. The HTTP route also locks for its before/after journal. */
export function createParameterUpdater(rt: CodexRuntime, parts: ReturnType<typeof createParameterParts>, shared: SharedMode) {
  const queue = createKeyedMutex();
  return (id: string, change: ParameterChange): Promise<SessionParameters> => queue.run(id, async () => {
    try {
      await shared.refresh();
      return await parts.connect(async (session, experimental) => {
        if (!experimental) unavailable(UPDATE_UNSUPPORTED, 'Обновите Codex');
        const state = await parts.readState(session, id, experimental);
        if (state.parameters.reason) unavailable(state.parameters.reason, state.parameters.reason === UPDATE_UNSUPPORTED ? 'Обновите Codex' : 'Проверьте общий доступ к чатам ChatGPT');
        const notes: string[] = [];
        const request: Dict = { threadId: id };
        const targetId = change.model ?? str(state.thread['model']);
        const target = state.models.find(m => (m['model'] ?? m['id']) === targetId && m['hidden'] !== true);
        const oldEffort = str(state.thread['reasoningEffort']);
        let effort = change.effort ?? oldEffort;
        const oldSpeed = state.parameters.items.find(i => i.id === 'speed')?.value;
        const targetSpeed = change.speed ?? oldSpeed;
        const needsModel = change.model !== undefined || change.effort !== undefined || change.speed !== undefined || change.mode !== undefined;
        if (needsModel && !state.catalogs['model']) unavailable('Список моделей сейчас недоступен');
        if (needsModel && !target) invalid('model', targetId);
        if (change.model !== undefined) request['model'] = change.model;
        const efforts = list(target?.['supportedReasoningEfforts']).map(e => e['reasoningEffort']);
        if (change.effort !== undefined && !efforts.includes(change.effort)) invalid('effort', change.effort);
        if (change.effort !== undefined) request['effort'] = change.effort;
        else if (change.model !== undefined && effort && !efforts.includes(effort)) {
          effort = str(target?.['defaultReasoningEffort']);
          if (!effort || !efforts.includes(effort)) unavailable('Модель не сообщает поддерживаемое усилие по умолчанию');
          request['effort'] = effort; notes.push(`Усилие заменено на ${effort}: новая модель не поддерживает прежнее`);
        }
        const speeds = ['standard', ...list(target?.['serviceTiers']).map(t => t['id'])];
        if (change.speed !== undefined && !speeds.includes(change.speed)) invalid('speed', change.speed);
        if (change.speed !== undefined) request['serviceTier'] = change.speed === 'standard' ? null : change.speed;
        else if (change.model !== undefined && targetSpeed && !speeds.includes(targetSpeed)) {
          request['serviceTier'] = null; notes.push('Скорость сброшена в стандартную: новая модель не поддерживает прежнюю');
        }
        if (change.mode !== undefined) {
          if (!state.catalogs['mode']) unavailable('Список режимов сейчас недоступен');
          if (!state.modes.some(m => m['mode'] === change.mode)) invalid('mode', change.mode);
          request['collaborationMode'] = { mode: change.mode, settings: { model: targetId, reasoning_effort: effort, developer_instructions: null } };
        }
        if (change.permissions !== undefined) {
          if (!state.catalogs['permissions']) unavailable('Список разрешений сейчас недоступен');
          if (!state.profiles.some(p => p['id'] === change.permissions && p['allowed'] === true)) invalid('permissions', change.permissions);
          if (change.permissions === ':danger-full-access' && change.confirmed !== true) throw new ProviderError('confirmation-required', FULL_ACCESS_CONFIRM, { status: 409, details: { confirm: FULL_ACCESS_CONFIRM } });
          request['permissions'] = change.permissions;
        }
        if (Object.keys(request).length === 1) invalid('change', 'empty');
        let cursor: string | null = null; let loaded = false;
        do {
          const page = obj(await session.request('thread/loaded/list', cursor ? { cursor } : {}));
          if (Array.isArray(page['data']) && page['data'].includes(id)) loaded = true;
          cursor = str(page['nextCursor']);
        } while (!loaded && cursor);
        let resumed = false;
        try {
          if (!loaded) { await session.request('thread/resume', { threadId: id }); resumed = true; }
          try { await session.request('thread/settings/update', request); }
          catch (error) {
            if (error instanceof RpcError && (error.code === -32601 || /requires experimentalApi|method.*not.*(found|available)|unknown method/i.test(error.message))) {
              parts.markUnsupported(); unavailable(UPDATE_UNSUPPORTED, 'Обновите Codex');
            }
            throw error;
          }
          if (state.file) parts.clearFile(state.file);
          const result = (await parts.readState(session, id, experimental)).parameters;
          if (obj(state.thread['status'])['type'] === 'active') notes.push('Применится со следующего хода');
          return { ...result, ...((notes.length || result.notes?.length) ? { notes: [...(result.notes ?? []), ...notes] } : {}) };
        } finally {
          if (resumed) await session.request('thread/unsubscribe', { threadId: id }).catch(error => rt.context.log(`codex: parameter unsubscribe failed: ${(error as Error).message}`));
        }
      });
    } catch (error) { throw parts.unavailable(error); }
  });
}
