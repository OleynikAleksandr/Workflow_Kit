// The project wizard (spec section 7): preview tokens and the apply operation. After the one
// consent the steps run without questions: project → git → structure → Kit → trust (and Kit
// hooks) of every registered provider → first session with the first message → link. "Отменить
// подготовку" stops before the next step; what is done stays and is shown.
import { randomBytes } from 'node:crypto';
import type { Operations } from '#data-store';
import { KIT_VERSION } from '#kit-bundle';
import type { KitRunner, WorkflowState } from '#kit-runner';
import { installStructure } from '#kit-structure';
import type { Project } from '#project-registry';
import { providerLabel } from '#provider-registry';
import type { Provider, SessionInfo } from '#provider-registry';
import { PREVIEW_TTL_MS, SetupError, buildPreview } from './preview.ts';
import type { HookPreview, PreviewDeps, PreviewInput, SetupPreview, SetupProvider } from './preview.ts';

/** `project`, `git`, `structure`, `kit`, `trust-<provider>` per registered provider, `session`. */
export type StepId = string;
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
  /** Short name of the chosen provider, for the texts of the panel. */
  providerLabel: string;
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
  /** Waits between hook-state reads of a provider that shows the hash later (tests shorten it). */
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

const HOOKS_APPROVED = 'хуки Kit одобрены';

/** Steps of a run: the fixed ones around one trust step per registered provider. */
function stepList(providers: readonly Provider[]): SetupStep[] {
  const titled: [StepId, string][] = [
    ['project', 'Папка проекта'],
    ['git', 'Локальная история (git)'],
    ['structure', 'Структура Kit'],
    ['kit', `Процесс Kit ${KIT_VERSION}`],
    ...providers.map((p): [StepId, string] => [`trust-${p.id}`, `Доверие ${providerLabel(p)}${p.approveHooks ? ' и хуки Kit' : ''}`]),
    ['session', 'Первая сессия'],
  ];
  return titled.map(([id, title]) => ({ id, title, status: 'pending', note: null }));
}

/** Part of the first message that marks the service turn (no session topic in it). */
export const SERVICE_MESSAGE_MARK = 'создан панелью Workflow Kit';

/** The first message to the agent instead of the provider's service turn (spec 7.5). */
export function firstMessage(projectName: string): string {
  return (
    `Проект «${projectName}» ${SERVICE_MESSAGE_MARK}. Прочитай AGENTS.md и выполни ` +
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

  // The hook is approved with the command and hash the user saw. A provider that learns the hash
  // only after trust (Codex and the hook written by the structure step) had nothing to show: its
  // hook is read until the hash appears.
  async function approveKitHook(run: SetupRun, project: Project, provider: Provider, shown: HookPreview | undefined): Promise<string> {
    // Nothing to approve: the preview showed why Kit cannot write this hook and the text for a manual edit.
    if (shown && !shown.hash) return `хук Kit для ${shown.label} не записан: добавьте его вручную`;
    if (shown) {
      try {
        await provider.approveHooks!(project, { command: shown.command, hash: shown.hash });
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        if (code !== 'hash-changed' && code !== 'hooks-changed') throw error;
        throw new SetupError('hooks-changed', `Хук Kit для ${shown.label} изменился после предпросмотра`, 409, 'Проверьте предпросмотр ещё раз.');
      }
      return HOOKS_APPROVED;
    }
    for (let attempt = 0; attempt < 15; attempt += 1) {
      if (run.cancelRequested) throw new Cancelled();
      const state = await provider.hooks(project);
      const kit = state.kitHook;
      if (kit && kit.status === 'approved') return HOOKS_APPROVED;
      // A hook that is written into a file is approved only as shown; this one was not in the preview.
      if (state.writes !== undefined) return `хук Kit для ${providerLabel(provider)} не записан: его не было в предпросмотре — откройте проект мастером ещё раз`;
      if (kit && kit.hash) {
        await provider.approveHooks!(project, { command: kit.command, hash: kit.hash });
        return HOOKS_APPROVED;
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    return `хуки Kit не одобрены: ${providerLabel(provider)} не показал их — одобрите в «Настройках»`;
  }

  async function trustProvider(run: SetupRun, project: Project, provider: Provider, choices: Record<string, string>, preview: SetupPreview): Promise<{ note?: string | null; skipped?: boolean }> {
    const id = provider.id;
    const trust = await provider.previewTrust(project);
    let note: string | null = null;
    if (!trust.trusted || trust.writes.length > 0) {
      const own: Record<string, string> = {};
      for (const [key, value] of Object.entries(choices)) if (key.startsWith(`${id}:`)) own[key.slice(id.length + 1)] = value;
      const state = await provider.grantTrust(project, trust.token, own);
      note = state.backup ? `копия до записи: ${state.backup}` : null;
    } else {
      note = 'уже было';
    }
    if (!provider.approveHooks) return { note };
    const hooks = await approveKitHook(run, project, provider, preview.hooks.find((hook) => hook.provider === id));
    return { note: [note, hooks].filter(Boolean).join('; ') };
  }

  // Trust of the chosen provider is required; the other providers' trust is best effort: when one is
  // unavailable or fails, its step is skipped with a note and can be repeated in «Настройки».
  async function trustStep(
    run: SetupRun,
    project: Project,
    provider: Provider,
    choices: Record<string, string>,
    preview: SetupPreview,
  ): Promise<{ note?: string | null; skipped?: boolean }> {
    if (provider.id === run.provider) return trustProvider(run, project, provider, choices, preview);
    const later = 'можно дать позже в «Настройках»';
    const button = preview.providers.find((entry) => entry.id === provider.id);
    if (!button?.available) return { skipped: true, note: `${button?.reason ?? 'провайдер недоступен'} — ${later}` };
    try {
      return await trustProvider(run, project, provider, choices, preview);
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
      if (preview.kit.action === 'open') return { skipped: true, note: `Kit ${KIT_VERSION} уже установлен` };
      const outcome = await deps.kit.install(root, { update: preview.kit.action === 'update', name: project.name });
      if (!outcome.ok) throw new SetupError(outcome.code, outcome.message, 409, outcome.nextAction ?? undefined);
      void deps.workflow.refresh(project.id);
      return { note: `Kit ${outcome.result.version}` };
    });
    for (const provider of deps.providers.list()) await step(run, `trust-${provider.id}`, () => trustStep(run, project, provider, choices, preview));
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
      const chosen = typeof input.provider === 'string' ? deps.providers.get(input.provider) : undefined;
      if (!chosen) throw new SetupError('bad-provider', 'Неизвестный провайдер', 400);
      const fresh = await buildPreview(saved.input, deps);
      if (fresh.fingerprint !== saved.fingerprint) throw new SetupError('preview-stale', 'Папка или настройки изменились после предпросмотра', 409, 'Проверьте предпросмотр ещё раз.');
      if (fresh.blocked) throw new SetupError(fresh.blocked.code, fresh.blocked.message, 409, fresh.blocked.commands.join('\n'));
      const button = fresh.providers.find((entry) => entry.id === chosen.id);
      if (!button?.available) throw new SetupError('provider-unavailable', button?.reason ?? 'Провайдер недоступен', 409);
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
        scope: { project: null, provider: chosen.id },
        run: async (handle) => {
          run = {
            operationId: handle.id,
            name: preview.name,
            path: preview.path,
            provider: chosen.id,
            providerLabel: providerLabel(chosen),
            projectId: null,
            status: 'running',
            steps: stepList(deps.providers.list()),
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
