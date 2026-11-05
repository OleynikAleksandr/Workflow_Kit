// A provider that is registered but not implemented yet: status "не реализовано", every capability
// unavailable, no actions; sessions come from the hook journal only, so they are visible early.
import { ProviderError } from './contract.ts';
import type { Capabilities, Project, Provider, ProviderStatus } from './contract.ts';
import { hookSessionInfo, readHookSessions } from './hook-sessions.ts';

/** Label of a stub provider. */
export const NOT_IMPLEMENTED_LABEL = 'не реализовано';

/** Capability names a stub reports as unavailable. */
export const STUB_CAPABILITIES: readonly string[] = ['trust', 'hooks', 'sessions', 'createSession', 'resumeSession', 'stopSession'];

/** What the stub needs to know. */
export interface StubProviderOptions {
  id: string;
  title: string;
  /** Task that brings the implementation, e.g. "T006". */
  task: string;
  /** Hook journal client of this provider (default: id). */
  client?: string;
}

/** Creates a stub provider. */
export function createStubProvider(options: StubProviderOptions): Provider {
  const reason = `${NOT_IMPLEMENTED_LABEL} (задача ${options.task})`;
  const status: ProviderStatus = {
    implemented: false,
    state: 'not-implemented',
    label: NOT_IMPLEMENTED_LABEL,
    installed: null,
    version: null,
    path: null,
    note: `провайдер ${options.title} появится в задаче ${options.task}`,
    checkedAt: null,
  };
  const notImplemented = (): never => {
    throw new ProviderError('not-implemented', `${options.title}: ${reason}`, {
      status: 501,
      hint: `Действие станет доступно после задачи ${options.task}.`,
    });
  };
  return {
    id: options.id,
    title: options.title,
    capabilities: async (): Promise<Capabilities> =>
      Object.fromEntries(STUB_CAPABILITIES.map((name) => [name, { available: false, reason }])),
    status: async () => ({ ...status }),
    previewTrust: async () => notImplemented(),
    grantTrust: async () => notImplemented(),
    trust: async () => ({ trusted: null, note: reason }),
    hooks: async () => ({ kitHook: null, hooks: [], complete: null, note: reason }),
    async listSessions(project: Project) {
      const sessions = await readHookSessions(project, options.client ?? options.id);
      return sessions.map((s) => hookSessionInfo(options.id, s, { note: `ссылки нет: провайдер ${NOT_IMPLEMENTED_LABEL}` }));
    },
    createSession: async () => notImplemented(),
    actions: async () => [],
    runAction: async () => notImplemented(),
  };
}
