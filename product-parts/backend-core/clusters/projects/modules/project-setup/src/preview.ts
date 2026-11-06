// Preview of the project wizard (spec section 7): read-only. It tells what the one consent will
// do to the folder and the provider configs, and returns a token whose fingerprint must still
// match when the user presses "Создать и открыть в ChatGPT / Claude".
import { createHash } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { KitRunner } from '#kit-runner';
import { checkStructure } from '#kit-structure';
import type { Project, ProjectRegistry } from '#project-registry';
import { checkProjectName, resolveInsideHome } from '#project-registry';
import type { CommandRunner } from '#process-supervisor';
import type { ProviderRegistry, TrustChoice } from '#provider-registry';

export type SetupProvider = 'codex' | 'claude';
export const SETUP_PROVIDERS: readonly SetupProvider[] = ['codex', 'claude'];

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

export interface SetupAction {
  id: 'structure' | 'kit' | 'git' | 'trust-claude' | 'trust-codex' | 'hooks-codex';
  title: string;
  detail: string;
}

/** A provider button of the wizard. */
export interface ProviderButton {
  available: boolean;
  reason: string | null;
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
  providers: Record<SetupProvider, ProviderButton>;
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
  const choices: TrustChoice[] = [];
  const providers = {} as Record<SetupProvider, ProviderButton>;
  const trusted: Record<string, boolean | null> = {};
  for (const id of SETUP_PROVIDERS) {
    const provider = deps.providers.get(id);
    if (!provider) {
      providers[id] = { available: false, reason: 'Провайдер не подключён' };
      continue;
    }
    const caps = await provider.capabilities().catch(() => ({}) as Record<string, { available: boolean; reason?: string }>);
    const create = caps['createSession'];
    providers[id] = { available: create?.available === true, reason: create?.available ? null : (create?.reason ?? 'Создание сессий недоступно') };
    try {
      const trust = await provider.previewTrust(draft);
      trusted[id] = trust.trusted && trust.writes.length === 0;
      for (const choice of trust.choices ?? []) choices.push({ ...choice, id: `${id}:${choice.id}` });
    } catch (error) {
      trusted[id] = null;
      if (exists) notes.push(`${provider.title}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const actions: SetupAction[] = [
    { id: 'structure', title: 'Структура Kit в папке', detail: 'AGENTS.md, CLAUDE.md, хуки начала сессии, конца хода и нового сообщения, шаблоны product-parts' },
    {
      id: 'kit',
      title: 'Процесс Kit 2.2.2',
      detail: kitAction === 'install' ? 'установка: план, задачи, проверки' : kitAction === 'update' ? `обновление с ${kitVersion ?? 'старой версии'}` : 'уже установлен',
    },
    { id: 'git', title: 'Локальная история проекта (git)', detail: repository ? 'уже есть' : 'будет создана' },
    { id: 'trust-claude', title: 'Доверие папке в Claude', detail: trusted['claude'] ? 'уже есть' : 'копия ~/.claude.json до записи' },
    { id: 'trust-codex', title: 'Доверие папке в ChatGPT (Codex)', detail: trusted['codex'] ? 'уже есть' : 'копия ~/.codex/config.toml до записи' },
    { id: 'hooks-codex', title: 'Хуки Kit для ChatGPT одобрены по хешу', detail: 'чтобы Kit видел ходы сессий' },
  ];
  const blocked = identity
    ? null
    : { code: 'GIT_IDENTITY_REQUIRED', message: 'Git не знает ваше имя и почту: без них Kit не сделает ни одного коммита. Выполните в терминале:', commands: [...IDENTITY_COMMANDS] };

  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ input, folder, exists, repository, identity, kitState, kitVersion, kitAction, structure: structure?.fragments.map((f) => [f.id, f.status]) ?? null, choices: choices.map((c) => [c.id, c.options.map((o) => o.id)]), trusted }))
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
    notes,
    fingerprint,
  };
}
