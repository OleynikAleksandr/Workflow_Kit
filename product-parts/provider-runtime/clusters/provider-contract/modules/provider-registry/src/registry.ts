// Registry of providers by string id and the "providers" section of /api/state. Every read goes
// through the contract with a time limit; a failing read becomes an error entry, not a failed poll.
import { ProviderError } from './contract.ts';
import type {
  Capabilities,
  Project,
  ProjectProviderState,
  Provider,
  ProviderAction,
  ProviderErrorInfo,
  ProviderId,
  ProviderStatus,
} from './contract.ts';

/** Longest time one read of a provider may take inside GET /api/state. */
export const STATE_READ_TIMEOUT_MS = 3000;

/** Provider-wide part of the "providers" section. */
export interface ProviderSummary {
  id: ProviderId;
  title: string;
  status: ProviderStatus | null;
  capabilities: Capabilities;
  /** Provider-scope actions (actions(null)). */
  actions: ProviderAction[];
  errors: Record<string, ProviderErrorInfo>;
}

/** The "providers" section of /api/state. */
export interface ProvidersSection {
  providers: ProviderSummary[];
  /** projectId → providerId → state. */
  projects: Record<string, Record<ProviderId, ProjectProviderState>>;
}

/** Providers by id, in registration order. */
export interface ProviderRegistry {
  register(provider: Provider): void;
  get(id: string): Provider | undefined;
  list(): Provider[];
  ids(): ProviderId[];
  summary(provider: Provider): Promise<ProviderSummary>;
  projectState(provider: Provider, project: Project): Promise<ProjectProviderState>;
  section(projects: readonly Project[]): Promise<ProvidersSection>;
  /** Why a project cannot be removed: running sessions and provider blockers (environments). */
  removeBlockers(project: Project): Promise<string[]>;
  /** Drops the records of projects not in keep in every provider; failures stay per provider. */
  forgetProjects(keep: ReadonlySet<string>): Promise<{ dropped: number; errors: Record<string, string> }>;
}

const PROVIDER_ID = /^[a-z][a-z0-9-]{0,31}$/;

/** Converts anything thrown by a provider into the uniform { code, message, hint? } shape. */
export function errorInfo(error: unknown): ProviderErrorInfo {
  if (error instanceof ProviderError) {
    return error.hint === undefined ? { code: error.code, message: error.message } : { code: error.code, message: error.message, hint: error.hint };
  }
  const code = (error as { code?: unknown } | undefined)?.code;
  return {
    code: typeof code === 'string' ? code : 'internal',
    message: error instanceof Error ? error.message : String(error),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProviderError('timeout', `${what}: нет ответа за ${ms} мс`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Creates an empty registry; readTimeoutMs limits each read of the state section. */
export function createProviderRegistry(options: { readTimeoutMs?: number } = {}): ProviderRegistry {
  const providers = new Map<ProviderId, Provider>();
  const limit = options.readTimeoutMs ?? STATE_READ_TIMEOUT_MS;

  async function read<T>(errors: Record<string, ProviderErrorInfo>, name: string, provider: Provider, fallback: T, run: () => Promise<T>): Promise<T> {
    try {
      return await withTimeout(Promise.resolve().then(run), limit, `${provider.title}.${name}`);
    } catch (error) {
      errors[name] = errorInfo(error);
      return fallback;
    }
  }

  const registry: ProviderRegistry = {
    register(provider) {
      if (!PROVIDER_ID.test(provider.id)) throw new Error(`Invalid provider id: ${provider.id}`);
      if (providers.has(provider.id)) throw new Error(`Provider already registered: ${provider.id}`);
      providers.set(provider.id, provider);
    },
    get: (id) => providers.get(id),
    list: () => [...providers.values()],
    ids: () => [...providers.keys()],
    async summary(provider) {
      const errors: Record<string, ProviderErrorInfo> = {};
      const [status, capabilities, actions] = await Promise.all([
        read(errors, 'status', provider, null, () => provider.status()),
        read(errors, 'capabilities', provider, {}, () => provider.capabilities()),
        read(errors, 'actions', provider, [], () => provider.actions(null)),
      ]);
      return { id: provider.id, title: provider.title, status, capabilities, actions, errors };
    },
    async projectState(provider, project) {
      const errors: Record<string, ProviderErrorInfo> = {};
      const [trust, hooks, sessions, actions] = await Promise.all([
        read(errors, 'trust', provider, null, () => provider.trust(project)),
        read(errors, 'hooks', provider, null, () => provider.hooks(project)),
        read(errors, 'sessions', provider, [], () => provider.listSessions(project)),
        read(errors, 'actions', provider, [], () => provider.actions(project)),
      ]);
      return { provider: provider.id, trust, hooks, sessions, actions, errors };
    },
    async section(projects) {
      const list = registry.list();
      const summaries = await Promise.all(list.map((p) => registry.summary(p)));
      const entries = await Promise.all(
        projects.map(async (project) => {
          const states = await Promise.all(list.map(async (p) => [p.id, await registry.projectState(p, project)] as const));
          return [project.id, Object.fromEntries(states)] as const;
        }),
      );
      return { providers: summaries, projects: Object.fromEntries(entries) };
    },
    async removeBlockers(project) {
      const reasons: string[] = [];
      for (const provider of registry.list()) {
        const sessions = await provider.listSessions(project).catch(() => []);
        for (const session of sessions.filter((s) => s.state === 'running')) {
          reasons.push(`${provider.title}: работает сессия «${session.title}»`);
        }
        if (provider.removeBlockers) reasons.push(...(await provider.removeBlockers(project)).map((r) => `${provider.title}: ${r}`));
      }
      return reasons;
    },
    async forgetProjects(keep) {
      let dropped = 0;
      const errors: Record<string, string> = {};
      for (const provider of registry.list()) {
        if (!provider.forgetProjects) continue;
        try {
          dropped += await provider.forgetProjects(keep);
        } catch (error) {
          errors[provider.id] = error instanceof Error ? error.message : String(error);
        }
      }
      return { dropped, errors };
    },
  };
  return registry;
}
