import { HttpError } from '#http-server';
import type { EventLog, KeyedMutex } from '#data-store';
import type { ChatRouteParts } from './chat-routes.ts';
import { ProviderError } from './contract.ts';
import { PARAMETER_IDS } from './parameters.ts';
import type { ParameterChange } from './parameters.ts';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function changeOf(body: unknown): ParameterChange {
  const invalid = (): never => { throw new HttpError(400, 'parameter-invalid', 'Ожидается change с известными параметрами (строки до 128 знаков)'); };
  if (!object(body) || Object.keys(body).some(k => k !== 'change') || !object(body['change'])) return invalid();
  const change = body['change'];
  if (!PARAMETER_IDS.some(k => Object.hasOwn(change, k))) return invalid();
  for (const [k, v] of Object.entries(change)) {
    if (k === 'confirmed') { if (typeof v !== 'boolean') return invalid(); }
    else if (!PARAMETER_IDS.includes(k as typeof PARAMETER_IDS[number]) || typeof v !== 'string' || !v.trim() || v.length > 128) return invalid();
  }
  return change as ParameterChange;
}

/** Resolves ownership before either method, queues mutations by canonical local session id. */
export function registerParameterRoutes(parts: ChatRouteParts & { mutex: KeyedMutex; events?: EventLog }): void {
  const { router, mutex, events } = parts;
  const route = '/api/projects/:id/providers/:p/sessions/:sid/parameters';
  for (const method of ['get', 'post'] as const) router[method](route, async ctx => {
    try {
      const provider = parts.providerOf(ctx);
      const project = await parts.projectOf(ctx);
      const sid = parts.sessionIdOf(ctx);
      const sessions = await provider.listSessions(project);
      const session = sessions.find(s => s.localId === sid) ?? sessions.find(s => s.remoteId === sid);
      if (!session) throw new HttpError(404, 'unknown-session', 'Сессия не найдена');
      if (method === 'get') return provider.readParameters
        ? { supported: true, parameters: await provider.readParameters(project, session.localId) }
        : { supported: false };
      const change = changeOf(ctx.body);
      const update = provider.updateParameters?.bind(provider);
      if (!update) throw new HttpError(404, 'parameters-unsupported', 'Изменение параметров не поддерживается');
      return await mutex.run(`parameters:${provider.id}:${session.localId}`, async () => {
        const before = await provider.readParameters?.(project, session.localId);
        const parameters = await update(project, session.localId, change);
        for (const item of parameters.items) {
          const old = before?.items.find(i => i.id === item.id)?.value ?? null;
          if (old !== item.value) await events?.append('provider.parameters.changed', {
            provider: provider.id, project: project.id, session: session.localId,
            parameter: item.id, old, new: item.value,
          });
        }
        return { parameters };
      });
    } catch (error) {
      if (error instanceof ProviderError && ['parameter-invalid', 'confirmation-required', 'parameters-unavailable'].includes(error.code)) {
        const status = error.code === 'parameter-invalid' ? 400 : error.code === 'confirmation-required' ? 409 : 503;
        throw new HttpError(status, error.code, error.message, { ...error.details, ...(error.hint ? { hint: error.hint } : {}) });
      }
      throw parts.toHttpError(error);
    }
  });
}
