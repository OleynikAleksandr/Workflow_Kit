// The whole chain for the scenario tests (spec M8 section 7): the real service (#cli) with the
// real Kimi provider on the fake Kimi server, a real Kit in a temporary git repository, a stub
// ChatGPT provider as the reviewer, and the hooks called as the CLI gets them from the apps.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApp, main } from '#cli';
import type { App } from '#cli';
import { createStubProvider } from '#provider-registry';
import type { Provider, SessionInfo } from '#provider-registry';
import { withSessions } from './fake-sessions.ts';
import type { FakeSession, SessionSetup } from './fake-sessions.ts';

/** A prompt the service sent to a Kimi session. */
export interface SentPrompt {
  sessionId: string;
  text: string;
  /** prompt_id of the request. */
  id: string;
}

export interface Scenario {
  setup: SessionSetup;
  app: App;
  /** Folder of the project: a git repository with the Kit installed. */
  root: string;
  projectId: string;
  /** Sessions the service asked the reviewer provider (ChatGPT) to create. */
  reviewerSessions: Array<{ id: string; title: string; firstMessage?: string }>;
  /** Runs a Kit command in the project; fails the test when the Kit refuses. */
  kit(...args: string[]): Promise<void>;
  /** Writes a JSON input file of a Kit command outside the project; resolves to its path. */
  input(name: string, data: unknown): Promise<string>;
  /** Calls a hook as the app of the client does; resolves to what the CLI printed. */
  hook(client: 'kimi' | 'codex', event: string, stdin: Record<string, unknown>): Promise<string>;
  /** A new Kimi session of the project in a workspace of its own. */
  session(title: string): FakeSession;
  /**
   * A turn of a Kimi session: the lock, the prompt hook, the work of the agent, its answer, the
   * Stop hook while the lock still lives, then the release of the lock.
   */
  turn(session: FakeSession, text: string, answer: string, work?: () => Promise<void>): Promise<void>;
  /** A Stop hook in the middle of a turn, as a subagent of Kimi sends it. */
  subagentStop(session: FakeSession): Promise<void>;
  /** The prompts sent so far. */
  sent(): SentPrompt[];
  /** Waits until the service sent `count` prompts; resolves to the last of them. */
  prompts(count: number): Promise<SentPrompt>;
  /** Waits for a condition; the service asks the session lock once a second. */
  until(check: () => boolean, what: string): Promise<void>;
  /** GET of the service API as the panel sends it. */
  api(route: string): Promise<{ status: number; body: Record<string, unknown> }>;
}

/** The plan every scenario proposes: one task, as a Kimi session would write it. */
export const PLAN = {
  id: 'demo',
  objective: 'Демо',
  acceptance: ['Есть файл'],
  approval: 'User: implement now',
  spec: 'docs/spec.md',
  tasks: [{ id: 'T001', title: 'Файл', commitMessage: 'feat: add file', acceptance: ['a'], files: ['src/a.txt'] }],
};

/** A registered ChatGPT whose sessions are created in memory: the reviewer of a Kimi plan. */
function reviewerProvider(created: Scenario['reviewerSessions']): Provider {
  const sessions: SessionInfo[] = [];
  return {
    ...createStubProvider({ id: 'codex', title: 'ChatGPT', task: 'T' }),
    capabilities: async () => ({ createSession: { available: true } }),
    async createSession(_project, opts) {
      const id = `thread-${created.length + 1}`;
      created.push({ id, title: opts.title, ...(opts.firstMessage ? { firstMessage: opts.firstMessage } : {}) });
      const info: SessionInfo = { provider: 'codex', localId: id, title: opts.title, createdAt: new Date().toISOString(), origin: 'panel', state: 'running', links: {} };
      sessions.push(info);
      return info;
    },
    listSessions: async () => sessions,
  };
}

export async function withScenario(run: (scenario: Scenario) => Promise<void>): Promise<void> {
  await withSessions(async (setup) => {
    const { machine, api } = setup;
    const root = setup.project.path;
    const gitconfig = path.join(machine.home, '.gitconfig');
    await writeFile(gitconfig, '[user]\n\tname = Kit Tester\n\temail = kit.tester@wfk-tests.org\n[init]\n\tdefaultBranch = main\n');
    const dataDir = path.join(machine.root, 'service');
    const env = { PATH: process.env['PATH'], HOME: machine.home, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1', WFK_DATA_DIR: dataDir, WFK_PORT: '0' };
    const git = (...args: string[]): void => void execFileSync('git', args, { cwd: root, env: env as NodeJS.ProcessEnv });
    const reviewerSessions: Scenario['reviewerSessions'] = [];
    const app = await createApp({ env, homedir: machine.home, getInterfaces: () => ({}), providers: [() => reviewerProvider(reviewerSessions), () => setup.provider] });
    const bound = await app.start();
    const base = `http://127.0.0.1:${bound.port}`;
    try {
      const kit = async (...args: string[]): Promise<void> => {
        const outcome = await app.kit.run(root, args);
        assert.ok(outcome.ok, `${args.join(' ')}: ${JSON.stringify(outcome)}`);
      };
      await mkdir(path.join(root, 'docs'), { recursive: true });
      git('init', '-q');
      await writeFile(path.join(root, 'README.md'), '# Demo\n');
      git('add', 'README.md');
      git('commit', '-q', '-m', 'init');
      assert.ok((await app.kit.install(root)).ok, 'the Kit is installed');
      await writeFile(path.join(root, 'docs', 'spec.md'), '# Spec\n');
      await kit('docs:commit', '--files', 'docs/spec.md');
      const { project } = await app.projects.open(root);

      const until: Scenario['until'] = async (check, what) => {
        for (let i = 0; i < 2000 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
        assert.ok(check(), what);
      };
      const hook: Scenario['hook'] = async (client, event, stdin) => {
        let out = '';
        const code = await main(['hook', event, '--client', client], {
          stdout: (text) => (out += text),
          stderr: () => undefined,
          app: { env: { WFK_DATA_DIR: dataDir, WFK_PORT: String(bound.port) }, homedir: machine.home },
          readStdin: async () => JSON.stringify({ cwd: root, ...stdin }),
          hookClients: ['codex', 'kimi'],
        });
        assert.equal(code, 0, `hook ${event} of ${client}`);
        return out;
      };
      const sent = (): SentPrompt[] =>
        api.prompts.map(({ sessionId, body }) => ({
          sessionId,
          text: (body['content'] as Array<{ text: string }>)[0]!.text,
          id: String(body['prompt_id']),
        }));
      const stop = (session: FakeSession): Promise<string> => hook('kimi', 'turn-end', { hook_event_name: 'Stop', session_id: session.id });

      await run({
        setup,
        app,
        root,
        projectId: project.id,
        reviewerSessions,
        kit,
        async input(name, data) {
          const file = path.join(machine.root, name);
          await writeFile(file, JSON.stringify(data));
          return file;
        },
        hook,
        session: (title) => api.add({ workspace: setup.workspace(root), cwd: root, title }),
        async turn(session, text, answer, work) {
          await api.lock(session.id);
          api.message(session, 'user', text, 'user');
          assert.equal(await hook('kimi', 'prompt', { hook_event_name: 'UserPromptSubmit', session_id: session.id, prompt: [{ type: 'text', text }] }), '');
          await work?.();
          api.message(session, 'assistant', answer);
          assert.equal(await stop(session), '');
          await rm(path.join(machine.paths.locks, `${session.id}.lock`), { force: true });
        },
        async subagentStop(session) {
          assert.equal(await stop(session), '');
        },
        sent,
        async prompts(count) {
          await until(() => api.prompts.length >= count, `the service sent prompt ${count}`);
          assert.equal(api.prompts.length, count, 'no prompt beyond the expected one');
          return sent()[count - 1]!;
        },
        until,
        async api(route) {
          const response = await fetch(`${base}${route}`, { headers: { Origin: base } });
          return { status: response.status, body: (await response.json()) as Record<string, unknown> };
        },
      });
    } finally {
      await app.stop();
    }
  });
}
