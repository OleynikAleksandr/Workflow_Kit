// HTTP routes of providers (spec section 10) and the "providers" section of /api/state. Routes know
// providers only through the contract. Long actions are operations (D10) run under the provider
// mutex and then the project mutex; their outcome is written to events.jsonl.
import { stat } from 'node:fs/promises';
import type { EventLog, KeyedMutex, Operation, Operations, StartedOperation } from '#data-store';
import { HttpError, jsonResult } from '#http-server';
import type { JsonResult, RouteContext, Router, StateRegistry } from '#http-server';
import { accessHint } from '#project-registry';
import type { ProjectRegistry } from '#project-registry';
import { ProviderError } from './contract.ts';
import type { Project, Provider, ProviderStatus, SessionInfo, TrustChoices } from './contract.ts';
import { registerSharedAccessRoutes } from './shared-access-routes.ts';
import { registerParameterRoutes } from './parameter-routes.ts';
import { registerChatRoutes } from './chat-routes.ts';
import { clearHookSessionsCache } from './hook-sessions.ts';
import type { ProviderRegistry } from './registry.ts';
import { errorInfo } from './registry.ts';

/** Dependencies of the provider routes. */
export interface ProviderRoutesOptions {
  router: Router;
  state: StateRegistry;
  registry: ProviderRegistry;
  projects: ProjectRegistry;
  operations: Operations;
  mutex: KeyedMutex;
  events?: EventLog;
  platform: NodeJS.Platform;
  now?: () => Date;
  /** Extra work of POST /api/refresh, e.g. reconciling process records. */
  onRefresh?: () => Promise<void>;
}

/** Handle returned by registerProviderRoutes. */
export interface ProviderRoutes {
  /** Starts the refresh operation (also used at service start, D11). */
  refresh(): StartedOperation;
}

/** Event written after a successful operation of each kind; failures are "provider.operation.failed". */
export const OPERATION_EVENTS: Readonly<Record<string, string>> = {
  'provider.trust': 'provider.trust.granted',
  'provider.hooks.approve': 'provider.hooks.approved',
  'provider.session.create': 'provider.session.created',
  'provider.session.resume': 'provider.session.resumed',
  'provider.session.stop': 'provider.session.stopped',
  'provider.action': 'provider.action.completed',
  'provider.shared-access.apply': 'provider.shared-access.applied',
  'provider.shared-access.remove': 'provider.shared-access.removed',
  'providers.refresh': 'providers.refreshed',
};

const SESSION_ID = /^[A-Za-z0-9._:-]{1,200}$/;
const MAX_TEXT = 4096;

/** Default title of a new session: "<project> · YYYY-MM-DD HH:MM" in local time. */
export function defaultSessionTitle(project: { name: string }, now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return `${project.name} · ${stamp}`;
}

function bodyObject(body: unknown): Record<string, unknown> {
  if (body === undefined || body === null) return {};
  if (typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid-body', 'Ожидается JSON-объект');
  return body as Record<string, unknown>;
}

function requiredText(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim() === '' || value.length > MAX_TEXT) {
    throw new HttpError(400, 'invalid-body', `Поле ${field} должно быть непустой строкой`);
  }
  return value;
}

const CHOICE_ID = /^[A-Za-z0-9._:-]{1,64}$/;
const MAX_CHOICES = 16;

/** Answers to the trust choices: an optional { <choice id>: <option id> } object of short ids. */
function trustChoices(body: Record<string, unknown>): TrustChoices {
  const value = body['choices'];
  if (value === undefined || value === null) return {};
  const invalid = new HttpError(400, 'invalid-body', 'Поле choices должно быть объектом { <id выбора>: <id ответа> }');
  if (typeof value !== 'object' || Array.isArray(value)) throw invalid;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_CHOICES) throw invalid;
  const choices: TrustChoices = {};
  for (const [id, answer] of entries) {
    if (!CHOICE_ID.test(id) || typeof answer !== 'string' || !CHOICE_ID.test(answer)) throw invalid;
    choices[id] = answer;
  }
  return choices;
}

function toHttpError(error: unknown): unknown {
  if (error instanceof ProviderError) {
    return new HttpError(error.status, error.code, error.message, { ...error.details, ...(error.hint === undefined ? {} : { hint: error.hint }) });
  }
  return error;
}

function projectInfo(project: Project | null): Record<string, unknown> {
  return project ? { project: project.id, projectName: project.name, projectPath: project.path } : { project: null };
}

function eventSummary(result: unknown): Record<string, unknown> {
  if (typeof result !== 'object' || result === null) return {};
  const session = result as Partial<SessionInfo>;
  if (typeof session.localId === 'string') return { session: session.localId, remoteId: session.remoteId ?? null, title: session.title ?? null };
  const trust = result as { trusted?: unknown; backup?: unknown };
  if (typeof trust.trusted === 'boolean') return { trusted: trust.trusted, backup: trust.backup ?? null };
  return {};
}

/** Registers the provider routes and the "providers" state section. */
export function registerProviderRoutes(options: ProviderRoutesOptions): ProviderRoutes {
  const { router, state, registry, projects, operations, mutex, events, platform } = options;
  const now = options.now ?? (() => new Date());

  function providerOf(ctx: RouteContext): Provider {
    const id = ctx.params['p'] ?? '';
    const provider = registry.get(id);
    if (!provider) throw new HttpError(404, 'unknown-provider', `Неизвестный провайдер: ${id}`);
    return provider;
  }

  async function projectOf(ctx: RouteContext): Promise<Project> {
    const id = ctx.params['id'] ?? '';
    const project = await projects.get(id);
    if (!project) throw new HttpError(404, 'not-found', `Проект не найден: ${id}`);
    try {
      if ((await stat(project.path)).isDirectory()) return project;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EACCES' || code === 'EPERM') {
        throw new HttpError(403, 'access-denied', `Нет доступа к папке проекта: ${project.path}`, { hint: accessHint(platform) });
      }
    }
    throw new HttpError(409, 'project-missing', `Папка проекта не найдена: ${project.path}`);
  }

  function sessionIdOf(ctx: RouteContext): string {
    const sid = ctx.params['sid'] ?? '';
    if (!SESSION_ID.test(sid)) throw new HttpError(400, 'invalid-session', 'Недопустимый id сессии');
    return sid;
  }

  function locked<T>(provider: Provider, project: Project | null, handle: { progress(note: string | null): void }, run: () => Promise<T>): Promise<T> {
    const keys = [`provider:${provider.id}`, ...(project ? [`project:${project.id}`] : [])];
    if (keys.some((key) => mutex.busy(key))) handle.progress('ожидание очереди');
    const go = (): Promise<T> => {
      handle.progress(null);
      return run();
    };
    return mutex.run(keys[0]!, () => (keys[1] ? mutex.run(keys[1], go) : go()));
  }

  function journal(operation: Operation, project: Project | null): Promise<unknown> | undefined {
    const base = { operationId: operation.id, kind: operation.kind, provider: operation.scope['provider'] ?? null, ...projectInfo(project) };
    if (operation.status === 'succeeded') {
      return events?.append(OPERATION_EVENTS[operation.kind] ?? operation.kind, { ...base, ...operation.scope, ...eventSummary(operation.result) });
    }
    return events?.append('provider.operation.failed', { ...base, ...operation.scope, error: operation.error ?? null });
  }

  /** Starts a long provider action as an operation and answers 202 { operationId, operation, existing }. */
  function startOperation(spec: {
    kind: string;
    title: string;
    provider: Provider;
    project: Project | null;
    scope?: Record<string, string | null>;
    keyParts?: string[];
    run: () => Promise<unknown>;
  }): JsonResult {
    const key = [spec.kind, spec.provider.id, spec.project?.id ?? '-', ...(spec.keyParts ?? [])].join(':');
    const started = operations.start({
      key,
      kind: spec.kind,
      title: spec.title,
      scope: { provider: spec.provider.id, project: spec.project?.id ?? null, ...spec.scope },
      run: (handle) => locked(spec.provider, spec.project, handle, spec.run),
      onFinish: (operation) => journal(operation, spec.project),
    });
    return jsonResult(202, { operationId: started.operation.id, operation: started.operation, existing: started.existing });
  }

  function requireMethod<K extends keyof Provider>(provider: Provider, method: K): NonNullable<Provider[K]> {
    const fn = provider[method];
    if (typeof fn !== 'function') {
      throw new HttpError(409, 'not-supported', `${provider.title}: действие не поддерживается`);
    }
    return fn as NonNullable<Provider[K]>;
  }

  async function checkAction(provider: Provider, project: Project | null, actionId: string): Promise<void> {
    const list = await provider.actions(project).catch((error: unknown) => Promise.reject(toHttpError(error)));
    const action = list.find((a) => a.id === actionId && a.scope === (project ? 'project' : 'provider'));
    if (!action) throw new HttpError(404, 'unknown-action', `${provider.title}: нет действия ${actionId}`);
    if (!action.enabled) {
      throw new HttpError(409, 'action-disabled', `${provider.title}: «${action.title}» сейчас недоступно`, action.reason ? { hint: action.reason } : undefined);
    }
  }

  router.get('/api/providers', async () => ({
    providers: await Promise.all(registry.list().map((p) => registry.summary(p))),
  }));

  router.get('/api/projects/:id/providers/:p', async (ctx) => {
    const provider = providerOf(ctx);
    const project = await projectOf(ctx);
    return registry.projectState(provider, project);
  });

  router.get('/api/projects/:id/providers/:p/trust/preview', async (ctx) => {
    const provider = providerOf(ctx);
    const project = await projectOf(ctx);
    try {
      return await provider.previewTrust(project);
    } catch (error) {
      throw toHttpError(error);
    }
  });

  router.post('/api/projects/:id/providers/:p/trust', async (ctx) => {
    const body = bodyObject(ctx.body);
    const token = requiredText(body, 'token');
    const choices = trustChoices(body);
    const provider = providerOf(ctx);
    const project = await projectOf(ctx);
    return startOperation({
      kind: 'provider.trust',
      title: `${provider.title}: доверие к папке`,
      provider,
      project,
      run: () => provider.grantTrust(project, token, choices),
    });
  });

  router.post('/api/projects/:id/providers/:p/hooks/approve', async (ctx) => {
    const body = bodyObject(ctx.body);
    const expected = { command: requiredText(body, 'command'), hash: requiredText(body, 'hash') };
    const provider = providerOf(ctx);
    const project = await projectOf(ctx);
    const approve = requireMethod(provider, 'approveHooks').bind(provider);
    return startOperation({
      kind: 'provider.hooks.approve',
      title: `${provider.title}: одобрение хука`,
      provider,
      project,
      scope: { hash: expected.hash },
      run: () => approve(project, expected),
    });
  });

  router.post('/api/projects/:id/providers/:p/sessions', async (ctx) => {
    const body = bodyObject(ctx.body);
    const given = body['title'];
    if (given !== undefined && (typeof given !== 'string' || given.length > 200)) {
      throw new HttpError(400, 'invalid-body', 'Поле title должно быть строкой до 200 символов');
    }
    const provider = providerOf(ctx);
    const project = await projectOf(ctx);
    const title = typeof given === 'string' && given.trim() !== '' ? given.trim() : defaultSessionTitle(project, now());
    return startOperation({
      kind: 'provider.session.create',
      title: `${provider.title}: новая сессия`,
      provider,
      project,
      run: () => provider.createSession(project, { title }),
    });
  });

  for (const [verb, method, kind, label] of [
    ['resume', 'resumeSession', 'provider.session.resume', 'возобновление сессии'],
    ['stop', 'stopSession', 'provider.session.stop', 'остановка сессии'],
  ] as const) {
    router.post(`/api/projects/:id/providers/:p/sessions/:sid/${verb}`, async (ctx) => {
      const sid = sessionIdOf(ctx);
      const provider = providerOf(ctx);
      const project = await projectOf(ctx);
      const fn = requireMethod(provider, method).bind(provider) as (project: Project, sessionId: string) => Promise<unknown>;
      return startOperation({
        kind,
        title: `${provider.title}: ${label}`,
        provider,
        project,
        scope: { session: sid },
        keyParts: [sid],
        run: async () => (await fn(project, sid)) ?? { session: sid },
      });
    });
  }

  router.post('/api/providers/:p/actions/:a', async (ctx) => {
    const provider = providerOf(ctx);
    const actionId = ctx.params['a'] ?? '';
    await checkAction(provider, null, actionId);
    return startOperation({
      kind: 'provider.action',
      title: `${provider.title}: ${actionId}`,
      provider,
      project: null,
      scope: { action: actionId },
      keyParts: [actionId],
      run: () => provider.runAction(actionId, null),
    });
  });

  router.post('/api/projects/:id/providers/:p/actions/:a', async (ctx) => {
    const provider = providerOf(ctx);
    const project = await projectOf(ctx);
    const actionId = ctx.params['a'] ?? '';
    await checkAction(provider, project, actionId);
    return startOperation({
      kind: 'provider.action',
      title: `${provider.title}: ${actionId}`,
      provider,
      project,
      scope: { action: actionId },
      keyParts: [actionId],
      run: () => provider.runAction(actionId, project),
    });
  });

  registerSharedAccessRoutes({ router, providerOf, startOperation, toHttpError, bodyObject, requiredText });
  registerChatRoutes({ router, providerOf, projectOf, sessionIdOf, toHttpError });
  registerParameterRoutes({ router, providerOf, projectOf, sessionIdOf, toHttpError, mutex, ...(events ? { events } : {}) });

  function refresh(): StartedOperation {
    return operations.start({
      key: 'providers.refresh',
      kind: 'providers.refresh',
      title: 'Обновить состояние провайдеров',
      run: async () => {
        clearHookSessionsCache();
        await options.onRefresh?.();
        const results: Record<string, ProviderStatus | { error: ReturnType<typeof errorInfo> } | null> = {};
        for (const provider of registry.list()) {
          if (!provider.refresh) {
            results[provider.id] = null;
            continue;
          }
          const run = provider.refresh.bind(provider);
          results[provider.id] = await mutex.run(`provider:${provider.id}`, run).catch((error: unknown) => ({ error: errorInfo(error) }));
        }
        return results;
      },
      onFinish: (operation) =>
        events?.append(operation.status === 'succeeded' ? 'providers.refreshed' : 'provider.operation.failed', {
          operationId: operation.id,
          kind: operation.kind,
          ...(operation.error ? { error: operation.error } : {}),
        }),
    });
  }

  router.post('/api/refresh', () => {
    const started = refresh();
    return jsonResult(202, { operationId: started.operation.id, operation: started.operation, existing: started.existing });
  });

  state.add('providers', async () => registry.section(await projects.list()));
  return { refresh };
}
