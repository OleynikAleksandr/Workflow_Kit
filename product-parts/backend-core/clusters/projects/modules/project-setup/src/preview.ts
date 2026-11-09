// Preview of the project wizard (spec section 7): read-only. It tells what the one consent will
// do to the folder and the provider configs, and returns a token whose fingerprint must still
// match when the user presses "Создать и открыть в <провайдер>". Providers, their trust and hook
// actions come from the registry, in its order.
import { createHash } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { KitRunner } from '#kit-runner';
import { checkStructure } from '#kit-structure';
import type { Project, ProjectRegistry } from '#project-registry';
import { checkProjectName, resolveInsideHome } from '#project-registry';
import type { CommandRunner } from '#process-supervisor';
import { providerLabel, providerMark } from '#provider-registry';
import type { HookEntry, ProviderRegistry, TrustChoice, TrustWrite } from '#provider-registry';

/** Id of a registered provider. */
export type SetupProvider = string;

/** Files Kit 2.2.2 writes on install (verified with `install --host harness`). */
export const KIT_INSTALL_FILES: readonly string[] = [
  '.harness/workflow/runtime/workflow.mjs',
  'scripts/workflow',
  'scripts/workflow.cmd',
  'scripts/workflow.ps1',
  '.harness/workflow/hooks/pre-commit',
  '.harness/workflow/hooks/commit-msg',
  '.harness/workflow/hooks/post-commit',
  '.harness/workflow/hooks/pre-push',
  'AGENTS.md',
  'CLAUDE.md',
  '.codex/hooks.json',
  '.claude/settings.json',
  '.gitignore',
  '.gitattributes',
  'docs/architecture/OVERVIEW.md',
  '.harness/workflow/config.json',
  '.harness/workflow/manifest.json',
];

export type PreviewInput = { mode: 'create'; name: string } | { mode: 'open'; path: string };

export type KitAction = 'install' | 'update' | 'open';

/** `structure`, `kit`, `git`, then `trust-<provider>` and `hooks-<provider>` per registered provider. */
export interface SetupAction {
  id: string;
  title: string;
  detail: string;
}

/** A provider button of the wizard. */
export interface ProviderButton {
  id: SetupProvider;
  /** Short name and letter of the button ("ChatGPT", "G"). */
  label: string;
  mark: string;
  available: boolean;
  reason: string | null;
}

/** A Kit hook that apply approves with exactly this command and hash; `writes` is what gets written. */
export interface HookPreview {
  provider: SetupProvider;
  label: string;
  status: HookEntry['status'];
  command: string;
  hash: string;
  writes: TrustWrite[];
  note: string | null;
}

export interface SetupPreview {
  token: string;
  expiresAt: string;
  mode: PreviewInput['mode'];
  name: string;
  path: string;
  exists: boolean;
  git: { repository: boolean; identity: { name: string; email: string } | null };
  kit: { action: KitAction; state: string | null; version: string | null };
  actions: SetupAction[];
  changes: { count: number; files: string[] };
  /** Decisions the user must make before the buttons work (external CLAUDE.md imports). */
  choices: TrustChoice[];
  /** Why nothing can be applied (no git identity); null when the buttons work. */
  blocked: { code: string; message: string; commands: string[] } | null;
  /** Buttons in the registry order. */
  providers: ProviderButton[];
  /** Kit hooks that are not approved yet: with the hash the approval is bound to, or with an empty hash and a note when Kit cannot write the hook. */
  hooks: HookPreview[];
  notes: string[];
}

/** A refused wizard request. */
export class SetupError extends Error {
  readonly code: string;
  readonly status: number;
  readonly hint: string | undefined;
  constructor(code: string, message: string, status = 409, hint?: string) {
    super(message);
    this.name = 'SetupError';
    this.code = code;
    this.status = status;
    this.hint = hint;
  }
}

export interface PreviewDeps {
  projects: ProjectRegistry;
  providers: ProviderRegistry;
  kit: KitRunner;
  runCommand: CommandRunner;
  env: Readonly<Record<string, string | undefined>>;
  homedir: string;
  platform: NodeJS.Platform;
  now: () => Date;
}

export const PREVIEW_TTL_MS = 15 * 60_000;
export const IDENTITY_COMMANDS: readonly string[] = [
  'git config --global user.name "Имя Фамилия"',
  'git config --global user.email "you@example.com"',
];

/** realpath of a folder; for a missing one, realpath of its nearest existing parent plus the rest. */
export async function realFolder(folder: string): Promise<string> {
  let current = path.resolve(folder);
  const rest: string[] = [];
  for (;;) {
    try {
      return path.join(await realpath(current), ...rest);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(folder);
      rest.unshift(path.basename(current));
      current = parent;
    }
  }
}

async function isDirectory(folder: string): Promise<boolean> {
  return stat(folder).then(
    (info) => info.isDirectory(),
    () => false,
  );
}

async function gitValue(deps: PreviewDeps, cwd: string, args: string[]): Promise<string | null> {
  const result = await deps.runCommand('git', args, { cwd, env: deps.env, timeoutMs: 10_000 });
  return result.code === 0 ? result.stdout.trim() || null : null;
}

/** A path under the home folder as ~/…; others as they are. */
function shortPath(file: string, homedir: string): string {
  if (!path.isAbsolute(file)) return file;
  const rest = path.relative(homedir, file);
  return rest && !rest.startsWith('..') && !path.isAbsolute(rest) ? `~/${rest.split(path.sep).join('/')}` : file;
}

const filesOf = (writes: TrustWrite[], homedir: string): string => [...new Set(writes.map((write) => shortPath(write.file, homedir)))].join(', ');
const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A project object for provider previews of a folder that is not registered yet. */
export function draftProject(name: string, folder: string, now: Date): Project {
  return { id: 'setup-preview', name, path: folder, source: 'opened', createdAt: now.toISOString() };
}

/** Target folder and name of a preview input. */
export async function resolveTarget(input: PreviewInput, deps: PreviewDeps): Promise<{ name: string; folder: string }> {
  const scope = { homedir: deps.homedir, platform: deps.platform };
  if (input.mode === 'create') {
    const check = checkProjectName(input.name);
    if (!check.ok) throw new SetupError('invalid-name', check.reason, 400);
    // The registry keeps real paths; the preview shows the same one.
    const root = await realFolder(deps.projects.root);
    const folder = path.join(root, check.name);
    if (await isDirectory(folder)) {
      throw new SetupError('exists', `Папка «${check.name}» уже есть в папке проектов`, 409, 'Откройте её через «Открыть папку проекта».');
    }
    return { name: check.name, folder };
  }
  const folder = await resolveInsideHome(input.path, scope);
  if (!(await isDirectory(folder))) throw new SetupError('not-a-folder', `Это не папка: ${folder}`, 400);
  return { name: path.basename(folder).normalize('NFC'), folder };
}

/** Builds the preview; reads only. */
export async function buildPreview(input: PreviewInput, deps: PreviewDeps): Promise<Omit<SetupPreview, 'token' | 'expiresAt'> & { fingerprint: string }> {
  const { name, folder } = await resolveTarget(input, deps);
  const exists = await isDirectory(folder);
  const notes: string[] = [];
  const cwd = exists ? folder : deps.homedir;
  const repository = exists ? (await gitValue(deps, folder, ['rev-parse', '--is-inside-work-tree'])) === 'true' : false;
  const userName = await gitValue(deps, cwd, ['config', 'user.name']);
  const userEmail = await gitValue(deps, cwd, ['config', 'user.email']);
  const identity = userName && userEmail ? { name: userName, email: userEmail } : null;

  let kitState: string | null = null;
  let kitVersion: string | null = null;
  let kitAction: KitAction = 'install';
  if (exists) {
    const inspect = await deps.kit.inspect(folder);
    if (inspect.ok) {
      kitState = inspect.result.state;
      kitVersion = inspect.result.version;
      if (inspect.result.state === 'KIT_OK') kitAction = inspect.result.version === '2.2.2' ? 'open' : 'update';
    } else {
      notes.push(`Kit: ${inspect.message}`);
    }
  }

  const structure = exists ? await checkStructure(folder) : null;
  const structureFiles = structure
    ? structure.fragments.filter((f) => f.status === 'missing' || f.status === 'outdated').map((f) => f.path)
    : ['AGENTS.md', 'CLAUDE.md', '.claude/settings.json', '.codex/hooks.json', '.gitignore', 'product-parts/README.md', '.workflow-kit/templates/'];
  if (structure && structure.status === 'modified') notes.push('Часть файлов структуры изменена вручную: Kit их не перезапишет.');
  const files = [...new Set([...structureFiles, ...(structure && structure.installedVersion !== null ? [] : ['.workflow-kit/manifest.json']), ...(kitAction === 'install' ? KIT_INSTALL_FILES : [])])].sort();

  const draft = draftProject(name, folder, deps.now());
  const actions: SetupAction[] = [
    { id: 'structure', title: 'Структура Kit в папке', detail: 'AGENTS.md, CLAUDE.md, хуки начала сессии, конца хода и нового сообщения, шаблоны product-parts' },
    {
      id: 'kit',
      title: 'Процесс Kit 2.2.2',
      detail: kitAction === 'install' ? 'установка: план, задачи, проверки' : kitAction === 'update' ? `обновление с ${kitVersion ?? 'старой версии'}` : 'уже установлен',
    },
    { id: 'git', title: 'Локальная история проекта (git)', detail: repository ? 'уже есть' : 'будет создана' },
  ];
  const choices: TrustChoice[] = [];
  const providers: ProviderButton[] = [];
  const hooks: HookPreview[] = [];
  // [provider, trusted, hook status, hook hash]: part of the fingerprint.
  const providerState: [string, boolean | null, string | null, string | null][] = [];
  for (const provider of deps.providers.list()) {
    const id = provider.id;
    const label = providerLabel(provider);
    const caps = await provider.capabilities().catch(() => ({}) as Record<string, { available: boolean; reason?: string }>);
    const create = caps['createSession'];
    providers.push({ id, label, mark: providerMark(provider), available: create?.available === true, reason: create?.available ? null : (create?.reason ?? 'Создание сессий недоступно') });
    let trusted: boolean | null = null;
    let trustDetail = 'запишет провайдер';
    try {
      const trust = await provider.previewTrust(draft);
      trusted = trust.trusted && trust.writes.length === 0;
      if (trusted) trustDetail = 'уже есть';
      else if (trust.writes.length > 0) trustDetail = `копия ${filesOf(trust.writes, deps.homedir)} до записи`;
      for (const choice of trust.choices ?? []) choices.push({ ...choice, id: `${id}:${choice.id}` });
    } catch (error) {
      if (exists) notes.push(`${provider.title}: ${errorText(error)}`);
    }
    actions.push({ id: `trust-${id}`, title: `Доверие папке в ${label}`, detail: trustDetail });
    let kitHook: HookEntry | null = null;
    if (provider.approveHooks) {
      let detail = 'одобрение по хешу, чтобы Kit видел ходы сессий';
      try {
        const state = await provider.hooks(draft);
        kitHook = state.kitHook;
        if (kitHook?.status === 'approved') detail = 'уже одобрены';
        else if (kitHook && kitHook.hash) {
          const writes = state.writes ?? [];
          hooks.push({ provider: id, label, status: kitHook.status, command: kitHook.command, hash: kitHook.hash, writes, note: state.note ?? null });
          if (writes.length > 0) detail = `запись в ${filesOf(writes, deps.homedir)} — текст показан ниже`;
        } else if (kitHook?.status === 'unknown' && state.writes !== undefined) {
          // A provider that writes the hook into a file cannot do it here: the reason is shown, with the text to add by hand.
          hooks.push({ provider: id, label, status: 'unknown', command: kitHook.command, hash: '', writes: [], note: state.note ?? null });
          detail = 'Workflow Kit не запишет их сам — причина показана ниже';
        }
      } catch (error) {
        if (exists) notes.push(`${provider.title}, хуки: ${errorText(error)}`);
      }
      actions.push({ id: `hooks-${id}`, title: `Хуки Kit для ${label}`, detail });
    }
    providerState.push([id, trusted, kitHook?.status ?? null, kitHook?.hash || null]);
  }
  const blocked = identity
    ? null
    : { code: 'GIT_IDENTITY_REQUIRED', message: 'Git не знает ваше имя и почту: без них Kit не сделает ни одного коммита. Выполните в терминале:', commands: [...IDENTITY_COMMANDS] };

  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ input, folder, exists, repository, identity, kitState, kitVersion, kitAction, structure: structure?.fragments.map((f) => [f.id, f.status]) ?? null, choices: choices.map((c) => [c.id, c.options.map((o) => o.id)]), providers: providerState }))
    .digest('hex')
    .slice(0, 24);
  return {
    mode: input.mode,
    name,
    path: folder,
    exists,
    git: { repository, identity },
    kit: { action: kitAction, state: kitState, version: kitVersion },
    actions,
    changes: { count: files.length, files },
    choices,
    blocked,
    providers,
    hooks,
    notes,
    fingerprint,
  };
}
