// A configurable provider for the route tests: records calls, can block on a gate and fail on demand.
import { ProviderError, createTokenStore } from '../src/index.ts';
import type { Project, Provider, ProviderAction, SessionInfo } from '../src/index.ts';

export interface FakeProvider extends Provider {
  calls: string[];
  /** Choices passed to grantTrust, in call order. */
  choices: Array<Record<string, string>>;
  /** Resolve to let blocked actions continue. */
  release(): void;
  block(): void;
  sessions: SessionInfo[];
  /** Project ids passed to forgetProjects, in call order. */
  kept: string[][];
  failHooks: boolean;
  slow: boolean;
}

export function createFakeProvider(id = 'fake', options: { withOptional?: boolean } = {}): FakeProvider {
  const tokens = createTokenStore();
  let gate: Promise<void> = Promise.resolve();
  let open = (): void => undefined;
  const wait = (): Promise<void> => gate;
  const actions: ProviderAction[] = [
    { id: 'daemon-start', title: 'Запустить демон', scope: 'provider', enabled: true },
    { id: 'daemon-stop', title: 'Остановить демон', scope: 'provider', enabled: false, reason: 'демон не запущен' },
  ];
  const projectActions: ProviderAction[] = [{ id: 'env-start', title: 'Окружение', scope: 'project', enabled: true }];
  const provider: FakeProvider = {
    id,
    title: id === 'fake' ? 'Fake' : id,
    calls: [],
    choices: [],
    sessions: [],
    kept: [],
    failHooks: false,
    slow: false,
    release: () => open(),
    block() {
      gate = new Promise((resolve) => (open = resolve));
    },
    capabilities: async () => ({ trust: { available: true }, environment: { available: false, reason: 'нет expect' } }),
    status: async () => ({ implemented: true, state: 'ready', label: 'готов', installed: true, version: '1.0.0', path: '/bin/fake', checkedAt: null }),
    async refresh() {
      provider.calls.push('refresh');
      return provider.status();
    },
    async previewTrust(project: Project) {
      const issued = tokens.issue(`${id}:${project.id}`, 'fp-1');
      return { provider: id, trusted: false, writes: [{ file: '~/.fake.json', key: project.path, description: 'доверие' }], autorun: [], ...issued };
    },
    async grantTrust(project: Project, token: string, choices?: Record<string, string>) {
      provider.calls.push(`grantTrust:${project.name}`);
      provider.choices.push(choices ?? { omitted: 'yes' });
      await wait();
      if (tokens.consume(`${id}:${project.id}`, token) !== 'fp-1') {
        throw new ProviderError('invalid-token', 'Предпросмотр устарел', { hint: 'Откройте предпросмотр снова' });
      }
      return { trusted: true, backup: '/backups/x' };
    },
    trust: async () => ({ trusted: false }),
    async hooks() {
      if (provider.failHooks) throw new ProviderError('broken', 'hooks.json повреждён', { hint: 'исправьте файл' });
      return { kitHook: null, hooks: [], complete: false };
    },
    async listSessions() {
      if (provider.slow) await new Promise((resolve) => setTimeout(resolve, 200));
      return provider.sessions;
    },
    async createSession(project: Project, opts: { title: string }) {
      provider.calls.push(`createSession:${opts.title}`);
      await wait();
      const session: SessionInfo = {
        provider: id,
        localId: `s${provider.sessions.length + 1}`,
        title: opts.title,
        createdAt: new Date().toISOString(),
        origin: 'panel',
        state: 'running',
        links: { web: 'https://example.test/s' },
        cwd: project.path,
      };
      provider.sessions.push(session);
      return session;
    },
    actions: async (project: Project | null) => (project ? projectActions : actions),
    async runAction(actionId: string, project: Project | null) {
      provider.calls.push(`runAction:${actionId}:${project?.name ?? '-'}`);
      return provider.status();
    },
  };
  if (options.withOptional !== false) {
    provider.approveHooks = async (_project, expected) => {
      provider.calls.push(`approveHooks:${expected.hash}`);
      const entry = { command: expected.command, hash: expected.hash, kit: true, status: 'approved' as const };
      return { kitHook: entry, hooks: [entry], complete: true };
    };
    provider.resumeSession = async (_project, sid) => {
      provider.calls.push(`resume:${sid}`);
      const found = provider.sessions.find((s) => s.localId === sid);
      if (!found) throw new ProviderError('not-found', `нет сессии ${sid}`, { status: 404 });
      found.state = 'running';
      return found;
    };
    provider.stopSession = async (_project, sid) => {
      provider.calls.push(`stop:${sid}`);
      const found = provider.sessions.find((s) => s.localId === sid);
      if (found) found.state = 'stopped';
    };
    provider.removeBlockers = async () => ['работает окружение'];
    provider.forgetProjects = async (keep) => {
      provider.kept.push([...keep]);
      if (id === 'broken') throw new Error('records are unreadable');
      return 2;
    };
    provider.resumeInterrupted = async (project) => {
      if (id === 'broken') throw new Error('records are unreadable');
      return [`${project.id}-s1`];
    };
    provider.archiveSessions = async (_project, sid) => {
      provider.calls.push(`archive:${sid ?? '*'}`);
      if (id === 'broken') throw new Error('records are unreadable');
      return [sid ?? 's1'];
    };
    provider.deleteSessions = async (project) => {
      if (id === 'broken') throw new Error('no daemon');
      return [`${project.id}-t1`];
    };
    provider.retryDeletes = async () => {
      if (id === 'broken') throw new Error('no daemon');
      return id === 'keeper' ? ['t9'] : [];
    };
    provider.autostart = async () => {
      if (id === 'broken') throw new Error('daemon did not start');
      return id === 'keeper' ? 'daemon started' : null;
    };
    provider.restoreSessions = async (_project, sid) => {
      provider.calls.push(`restore:${sid ?? '*'}`);
      return [sid ?? 's1'];
    };
  }
  return provider;
}
