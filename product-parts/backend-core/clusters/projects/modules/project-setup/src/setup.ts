// The project wizard (spec section 7): preview tokens and the apply operation. After the one
// consent the steps run without questions: project → git → structure → Kit → trust Claude →
// trust Codex and Kit hooks → first session with the first message → link. "Отменить подготовку"
// stops before the next step; what is done stays and is shown.
import { randomBytes } from 'node:crypto';
import type { Operations } from '#data-store';
import type { KitRunner, WorkflowState } from '#kit-runner';
import { installStructure } from '#kit-structure';
import type { Project } from '#project-registry';
import type { SessionInfo } from '#provider-registry';
import { PREVIEW_TTL_MS, SETUP_PROVIDERS, SetupError, buildPreview } from './preview.ts';
import type { PreviewDeps, PreviewInput, SetupPreview, SetupProvider } from './preview.ts';

export type StepId = 'project' | 'git' | 'structure' | 'kit' | 'trust-claude' | 'trust-codex' | 'session';
export type StepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export interface SetupStep {
  id: StepId;
  title: string;
  status: StepStatus;
  note: string | null;
}

/** One run of the wizard, shown in the "setup" section. */
export interface SetupRun {
  operationId: string;
  name: string;
  path: string;
  provider: SetupProvider;
  projectId: string | null;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  steps: SetupStep[];
  cancelRequested: boolean;
  session: SessionInfo | null;
  /** Links of the session; the panel opens the one of the device where the button was pressed. */
  links: { desktop?: string; mobile?: string; web?: string };
  error: { code: string; message: string; hint?: string } | null;
  startedAt: string;
}

export interface SetupDeps extends PreviewDeps {
  operations: Operations;
  workflow: WorkflowState;
  kit: KitRunner;
  log?: (line: string) => void;
  /** Waits between hook-state reads of Codex (tests shorten it). */
  hooksPollMs?: number;
}

export interface ApplyInput {
  token: string;
  provider: SetupProvider;
  choices?: Record<string, string>;
}

export interface ProjectSetup {
  preview(input: PreviewInput): Promise<SetupPreview>;
  apply(input: ApplyInput): Promise<{ operationId: string }>;
  cancel(operationId: string): SetupRun;
  get(operationId: string): SetupRun | undefined;
  section(): { runs: SetupRun[] };
}

const STEP_TITLES: Readonly<Record<StepId, string>> = {
  project: 'Папка проекта',
  git: 'Локальная история (git)',
  structure: 'Структура Kit',
  kit: 'Процесс Kit 2.2.2',
  'trust-claude': 'Доверие Claude',
  'trust-codex': 'Доверие ChatGPT и хуки Kit',
  session: 'Первая сессия',
};

/** The first message to the agent instead of the provider's service turn (spec 7.5). */
export function firstMessage(projectName: string): string {
  return (
    `Проект «${projectName}» создан панелью Workflow Kit. Прочитай AGENTS.md и выполни ` +
    '`scripts/workflow recover --format text`, затем коротко поздоровайся и спроси, какую задачу будем решать.'
  );
}

class Cancelled extends Error {
  readonly code = 'cancelled';
  readonly hint = 'Сделанные шаги сохранены; мастер можно запустить снова.';
  constructor() {
    super('Подготовка остановлена');
  }
}

export function createProjectSetup(deps: SetupDeps): ProjectSetup {
  const log = deps.log ?? (() => undefined);
  const previews = new Map<string, { input: PreviewInput; preview: SetupPreview; fingerprint: string; expires: number }>();
  const runs = new Map<string, SetupRun>();
  const pollMs = deps.hooksPollMs ?? 1000;

  async function git(cwd: string, args: string[]): Promise<void> {
    const result = await deps.runCommand('git', args, { cwd, env: deps.env, timeoutMs: 60_000 });
    if (result.code !== 0) throw new SetupError('git-failed', `git ${args[0]}: ${(result.stderr || result.stdout).trim().slice(0, 300)}`);
  }

  async function step<T>(run: SetupRun, id: StepId, action: () => Promise<{ note?: string | null; skipped?: boolean; value?: T }>): Promise<T | undefined> {
    if (run.cancelRequested) throw new Cancelled();
    const entry = run.steps.find((s) => s.id === id)!;
    entry.status = 'running';
    try {
      const outcome = await action();
      entry.status = outcome.skipped ? 'skipped' : 'done';
      entry.note = outcome.note ?? null;
      return outcome.value;
    } catch (error) {
      entry.status = 'failed';
      entry.note = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async function trustProvider(run: SetupRun, project: Project, id: SetupProvider, choices: Record<string, string>): Promise<{ note?: string | null; skipped?: boolean }> {
    const provider = deps.providers.get(id);
    if (!provider) return { skipped: true, note: 'провайдер не подключён' };
    const preview = await provider.previewTrust(project);
    let note: string | null = null;
    if (!preview.trusted || preview.writes.length > 0) {
      const own: Record<string, string> = {};
      for (const [key, value] of Object.entries(choices)) if (key.startsWith(`${id}:`)) own[key.slice(id.length + 1)] = value;
      const state = await provider.grantTrust(project, preview.token, own);
      note = state.backup ? `копия до записи: ${state.backup}` : null;
    } else {
      note = 'уже было';
    }
    if (id === 'codex' && provider.approveHooks) {
      // hooks/list is read in the background; wait until the Kit hook shows its hash.
      for (let attempt = 0; attempt < 15; attempt += 1) {
        if (run.cancelRequested) throw new Cancelled();
        const hooks = await provider.hooks(project);
        const kit = hooks.kitHook;
        if (kit && kit.status === 'approved') return { note: [note, 'хуки Kit одобрены'].filter(Boolean).join('; ') };
        if (kit && kit.hash) {
          await provider.approveHooks(project, { command: kit.command, hash: kit.hash });
          return { note: [note, 'хуки Kit одобрены'].filter(Boolean).join('; ') };
        }
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
      return { note: [note, 'хуки Kit не одобрены: Codex не показал их — одобрите в «Настройках»'].filter(Boolean).join('; ') };
    }
    return { note };
  }

  // Trust of the chosen provider is required; the other provider's trust is best effort: when it is
  // unavailable or fails, the step is skipped with a note and can be repeated in «Настройки».
  async function trustStep(
    run: SetupRun,
    project: Project,
    id: SetupProvider,
    choices: Record<string, string>,
    preview: SetupPreview,
  ): Promise<{ note?: string | null; skipped?: boolean }> {
    if (id === run.provider) return trustProvider(run, project, id, choices);
    const later = 'можно дать позже в «Настройках»';
    if (!preview.providers[id].available) return { skipped: true, note: `${preview.providers[id].reason ?? 'провайдер недоступен'} — ${later}` };
    try {
      return await trustProvider(run, project, id, choices);
    } catch (error) {
      if (error instanceof Cancelled) throw error;
      const message = (error instanceof Error ? error.message : String(error)).split('\n')[0]!.slice(0, 160);
      return { skipped: true, note: `не получилось: ${message} — ${later}` };
    }
  }

  async function execute(run: SetupRun, input: PreviewInput, preview: SetupPreview, choices: Record<string, string>): Promise<SetupRun> {
    const project = (await step<Project>(run, 'project', async () => {
      const value = input.mode === 'create' ? await deps.projects.create(preview.name) : (await deps.projects.open(preview.path)).project;
      return { value, note: value.path };
    }))!;
    run.projectId = project.id;
    const root = project.path;
    let committedStructure = false;
    await step(run, 'git', async () => {
      if (preview.git.repository) return { skipped: true, note: 'уже есть' };
      await git(root, ['init', '-q']);
      return { note: 'git init' };
    });
    await step(run, 'structure', async () => {
      const result = await installStructure(root);
      const written = result.report.fragments.map((f) => f.path).filter((file, index, all) => all.indexOf(file) === index);
      if (result.written.length === 0) return { skipped: true, note: 'уже установлена' };
      if (preview.kit.action === 'install') {
        // Before Kit manages the repository a plain commit is allowed; only Kit structure files go in.
        const files = [...written, '.workflow-kit/manifest.json'];
        await git(root, ['add', '--', ...files]);
        const staged = await deps.runCommand('git', ['diff', '--cached', '--quiet', '--', ...files], { cwd: root, env: deps.env, timeoutMs: 30_000 });
        if (staged.code !== 0) await git(root, ['commit', '-q', '-m', 'chore: add Workflow Kit structure', '--', ...files]);
        committedStructure = true;
      }
      return { note: committedStructure ? 'записана и закоммичена' : 'записана; изменения закоммитьте в задаче Kit' };
    });
    await step(run, 'kit', async () => {
      if (preview.kit.action === 'open') return { skipped: true, note: 'Kit 2.2.2 уже установлен' };
      const outcome = await deps.kit.install(root, { update: preview.kit.action === 'update', name: project.name });
      if (!outcome.ok) throw new SetupError(outcome.code, outcome.message, 409, outcome.nextAction ?? undefined);
      void deps.workflow.refresh(project.id);
      return { note: `Kit ${outcome.result.version}` };
    });
    await step(run, 'trust-claude', () => trustStep(run, project, 'claude', choices, preview));
    await step(run, 'trust-codex', () => trustStep(run, project, 'codex', choices, preview));
    const session = await step<SessionInfo>(run, 'session', async () => {
      const provider = deps.providers.get(run.provider)!;
      const value = await provider.createSession(project, { title: project.name, firstMessage: firstMessage(project.name) });
      return { value, note: value.note ?? null };
    });
    run.session = session ?? null;
    run.links = { ...(session?.links ?? {}) };
    await deps.workflow.sync().catch(() => undefined);
    return run;
  }

  return {
    async preview(input) {
      const built = await buildPreview(input, deps);
      const { fingerprint, ...rest } = built;
      const token = randomBytes(12).toString('hex');
      const expires = deps.now().getTime() + PREVIEW_TTL_MS;
      const preview: SetupPreview = { ...rest, token, expiresAt: new Date(expires).toISOString() };
      previews.set(token, { input, preview, fingerprint, expires });
      return preview;
    },

    async apply(input) {
      const saved = previews.get(input.token);
      if (!saved || saved.expires < deps.now().getTime()) throw new SetupError('preview-expired', 'Предпросмотр устарел', 409, 'Откройте предпросмотр заново.');
      if (!SETUP_PROVIDERS.includes(input.provider)) throw new SetupError('bad-provider', 'Неизвестный провайдер', 400);
      const fresh = await buildPreview(saved.input, deps);
      if (fresh.fingerprint !== saved.fingerprint) throw new SetupError('preview-stale', 'Папка или настройки изменились после предпросмотра', 409, 'Проверьте предпросмотр ещё раз.');
      if (fresh.blocked) throw new SetupError(fresh.blocked.code, fresh.blocked.message, 409, fresh.blocked.commands.join('\n'));
      if (!fresh.providers[input.provider].available) throw new SetupError('provider-unavailable', fresh.providers[input.provider].reason ?? 'Провайдер недоступен', 409);
      const choices = input.choices ?? {};
      for (const choice of fresh.choices) {
        if (choice.required && !choice.options.some((o) => o.id === choices[choice.id])) {
          throw new SetupError('choice-required', `Нужен ответ: ${choice.title}`, 400);
        }
      }
      previews.delete(input.token);
      const preview: SetupPreview = { ...saved.preview, ...fresh, token: input.token, expiresAt: saved.preview.expiresAt };
      let run: SetupRun | undefined;
      const started = deps.operations.start({
        key: `setup:${preview.path}`,
        kind: 'project.setup',
        title: `Подготовка проекта «${preview.name}»`,
        scope: { project: null, provider: input.provider },
        run: async (handle) => {
          run = {
            operationId: handle.id,
            name: preview.name,
            path: preview.path,
            provider: input.provider,
            projectId: null,
            status: 'running',
            steps: (Object.keys(STEP_TITLES) as StepId[]).map((id) => ({ id, title: STEP_TITLES[id], status: 'pending', note: null })),
            cancelRequested: false,
            session: null,
            links: {},
            error: null,
            startedAt: deps.now().toISOString(),
          };
          runs.set(handle.id, run);
          const progress = setInterval(() => handle.progress(run!.steps.find((s) => s.status === 'running')?.title ?? null), 250);
          progress.unref?.();
          try {
            await execute(run, saved.input, preview, choices);
            run.status = 'succeeded';
            return { projectId: run.projectId, links: run.links, session: run.session };
          } catch (error) {
            const source = error as { code?: unknown; hint?: unknown };
            run.status = error instanceof Cancelled ? 'cancelled' : 'failed';
            run.error = {
              code: typeof source.code === 'string' ? source.code : 'internal',
              message: error instanceof Error ? error.message : String(error),
              ...(typeof source.hint === 'string' ? { hint: source.hint } : {}),
            };
            log(`setup: ${preview.path}: ${run.error.code} ${run.error.message}`);
            throw error;
          } finally {
            clearInterval(progress);
          }
        },
      });
      if (started.existing) throw new SetupError('busy', 'Подготовка этой папки уже идёт', 409);
      return { operationId: started.operation.id };
    },

    cancel(operationId) {
      const run = runs.get(operationId);
      if (!run) throw new SetupError('not-found', 'Подготовка не найдена', 404);
      run.cancelRequested = true;
      return { ...run };
    },
    get: (operationId) => {
      const run = runs.get(operationId);
      return run ? { ...run, steps: run.steps.map((s) => ({ ...s })) } : undefined;
    },
    section: () => ({ runs: [...runs.values()].map((run) => ({ ...run, steps: run.steps.map((s) => ({ ...s })) })) }),
  };
}
