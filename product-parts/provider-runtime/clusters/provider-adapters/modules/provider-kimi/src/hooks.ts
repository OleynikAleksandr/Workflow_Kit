// The Kit hook of Kimi Code (spec M8 section 2.3): five [[hooks]] blocks in the user-wide
// config.toml. hooks() reads the file and shows what an approval would write; approveHooks()
// writes exactly the shown change; the remove action takes the Kit blocks out again. A Kimi
// server takes its hooks only when it starts (spec M9 section 1): the server of Kit is restarted
// once no session has a live lock, and the Kimi Code app started before the hook is asked to be
// restarted by the user.
import { stat } from 'node:fs/promises';
import { readJsonFile, writeJsonAtomic } from '#data-store';
import { cleanEnv } from '#process-supervisor';
import { ProviderError, providerSessionsFile } from '#provider-registry';
import type { HookEntry, HookState, ProviderAction, ProviderContext } from '#provider-registry';
import { defaultHookHost, kimiHookBlocks } from '#kit-structure';
import type { HookHost, KimiHookBlock } from '#kit-structure';
import type { KimiClient } from './client.ts';
import { hookFingerprint, planHookFile } from './hook-file.ts';
import type { HookFilePlan } from './hook-file.ts';
import { changeConfig, readConfig } from './hook-writer.ts';
import type { ConfigChangeDeps } from './hook-writer.ts';
import { defaultLiveness, liveSessionLocks } from './locks.ts';
import type { Liveness } from './locks.ts';
import type { KimiPaths } from './paths.ts';
import type { KimiServer } from './server.ts';

/** Action of the provider: removes the Kit blocks from config.toml. */
export const REMOVE_HOOK_ACTION = 'remove-kimi-hook';
export const HOOK_SCOPE_NOTE = 'хук общий для всех проектов; действует после перезапуска приложения Kimi Code и открытых в терминале kimi';
/** Note of the status, the hook step and the sessions: the app runs without the Kit hook. */
export const APP_RESTART_NOTE = 'Перезапустите приложение Kimi Code: хук Kit заработает в его сессиях только после перезапуска; до этого автопилот и ревью в них не работают';
/** Record of the time Kit last changed its blocks in config.toml: sessions/kimi-hook.json. */
export const HOOK_RECORD = 'kimi-hook';
const REMOVE_CONFIRM = 'Блоки хука Kit будут убраны из config.toml Kimi. Автопилот и ревью плана перестанут узнавать о конце хода сессий Kimi во всех проектах.';
const DOCTOR_TIMEOUT_MS = 30_000;

/** Replacements for tests. */
export interface KimiHookDeps {
  hookHost?: HookHost;
  liveness?: Liveness;
  beforeRename?: () => Promise<void>;
}

/** Inputs of the hook part of the provider. */
export interface KimiHooksOptions extends KimiHookDeps {
  context: ProviderContext;
  paths: KimiPaths;
  server: KimiServer;
  /** Starts the server of Kit (after a restart for new hooks). */
  ensureServer(): Promise<KimiClient>;
  /** Path of the checked `kimi` program; throws a ProviderError when there is none. */
  programPath(): Promise<string>;
}

/** The hook part of the provider. */
export interface KimiHooks {
  hooks(): Promise<HookState>;
  approveHooks(expected: { command: string; hash: string }): Promise<HookState>;
  /** The remove action for the provider menu; `blocked` is why the program cannot be used (null: it can). */
  action(blocked?: string | null): Promise<ProviderAction>;
  remove(): Promise<void>;
  /** Restarts the server of Kit when it runs with other Kit hooks than the file has; a log line or null. */
  syncServer(): Promise<string | null>;
  /** Fingerprint of the Kit blocks in config.toml ('' without them); null when the file cannot be read as Kimi does. */
  kitKey(): Promise<string | null>;
  /** True when a server of the Kimi Code app (or of the user) started before the Kit hook was written. */
  appRestart(): Promise<boolean>;
}

const firstLines = (text: string): string => text.trim().split(/\r?\n/).slice(0, 6).join(' ').slice(0, 400);

export function createKimiHooks(options: KimiHooksOptions): KimiHooks {
  const { context, paths, server } = options;
  const live = options.liveness ?? defaultLiveness();

  const blocks = (): { ok: true; blocks: KimiHookBlock[] } | { ok: false; reason: string } =>
    kimiHookBlocks(options.hookHost ?? defaultHookHost(context.env, context.homedir, context.platform));

  const refuse = (reason: string): ProviderError => new ProviderError('hooks-unknown', `Workflow Kit не меняет config.toml Kimi: ${reason}`, { status: 409, hint: 'Добавьте хук вручную и нажмите «Перепроверить».' });

  const read = async (wanted: readonly KimiHookBlock[]): Promise<{ text: string; plan: HookFilePlan }> => {
    const config = await readConfig(paths.config);
    const plan = planHookFile(config.text, wanted);
    return { text: config.text, plan: config.utf8 ? plan : { ...plan, status: 'unknown', reason: 'config.toml не в UTF-8', target: null, cleaned: null, found: [] } };
  };

  const doctor = async (): Promise<string | null> => {
    const program = await options.programPath();
    const result = await context.runCommand(program, ['doctor', 'config'], { cwd: context.homedir, env: cleanEnv(context.env, { platform: context.platform }), timeoutMs: DOCTOR_TIMEOUT_MS });
    if (result.startError) return `kimi doctor config не запустился: ${result.startError}`;
    if (result.timedOut) return 'kimi doctor config не ответил вовремя';
    return result.code === 0 ? null : firstLines(`${result.stdout}\n${result.stderr}`) || `kimi doctor config: код ${result.code}`;
  };

  const change = (): ConfigChangeDeps => ({ file: paths.config, platform: context.platform, live, now: context.now, doctor, ...(options.beforeRename ? { beforeRename: options.beforeRename } : {}) });

  const hooks = async (): Promise<HookState> => {
    const entry = (command: string, hash: string, status: HookEntry['status']): HookEntry => ({ command, hash, kit: true, status });
    const wanted = blocks();
    if (!wanted.ok) return { kitHook: entry('', '', 'unknown'), hooks: [], complete: null, note: `хук Kit для Kimi не может быть записан: ${wanted.reason}`, writes: [] };
    const { text, plan } = await read(wanted.blocks);
    if (plan.status === 'unknown' || plan.target === null) {
      const kitHook = entry(plan.section, '', 'unknown');
      return { kitHook, hooks: [kitHook], complete: null, note: `Workflow Kit не меняет ${paths.config}: ${plan.reason}. Добавьте показанный текст в файл вручную; ${HOOK_SCOPE_NOTE}`, writes: [] };
    }
    const kitHook = entry(plan.section, hookFingerprint(text, plan.target), plan.status);
    const writes = plan.status === 'approved' ? [] : [{ file: paths.config, value: plan.section, description: plan.status === 'modified' ? 'блоки хука Kit заменяются свежими в конце файла' : 'блоки хука Kit добавляются в конец файла' }];
    const note = plan.status === 'approved' && (await appRestart()) ? `${APP_RESTART_NOTE}; ${HOOK_SCOPE_NOTE}` : HOOK_SCOPE_NOTE;
    return { kitHook, hooks: [kitHook], complete: plan.status === 'approved', note, writes };
  };

  // The Kit blocks as Kimi would load them: event and command, in a stable order.
  const kitKey = async (): Promise<string | null> => {
    const wanted = blocks();
    const { plan } = await read(wanted.ok ? wanted.blocks : []);
    if (plan.status === 'unknown') return null;
    return plan.found.map((item) => `${item.event}\n${item.command}`).sort().join('\n\n');
  };

  // When Kit last changed its blocks; a file with Kit blocks and no record (an earlier version of
  // Kit wrote them) counts from its modification time, which is then kept.
  const record = providerSessionsFile(context.dirs, HOOK_RECORD);
  const remember = (changedAt: number): Promise<void> => writeJsonAtomic(record, { version: 1, changedAt });
  const changedAt = async (key: string | null): Promise<number | null> => {
    const data = await readJsonFile(record).catch(() => undefined);
    const known = typeof data === 'object' && data !== null ? (data as Record<string, unknown>)['changedAt'] : undefined;
    if (typeof known === 'number' && Number.isFinite(known)) return known;
    if (!key) return null;
    const modified = (await stat(paths.config).catch(() => null))?.mtimeMs ?? null;
    if (modified !== null) await remember(modified).catch(() => undefined);
    return modified;
  };

  const appRestart = async (): Promise<boolean> => {
    const key = await kitKey().catch(() => null);
    if (!key) return false;
    const since = await changedAt(key);
    if (since === null) return false;
    return (await server.foreign()).some((item) => item.startedAt !== null && item.startedAt < since);
  };

  const syncServer = async (): Promise<string | null> => {
    // While the app serves Kimi the server of Kit is retired, not restarted.
    if ((await server.app()) || !(await server.own())) return null;
    const key = await kitKey();
    if (key === null) return null;
    const startedWith = server.startedWith();
    // A server adopted after a restart of the service: by the time of its start.
    const since = startedWith === undefined ? await changedAt(key) : null;
    const stale = startedWith !== undefined ? startedWith !== key : since !== null && (server.startedAt() ?? 0) < since;
    if (!stale) return null;
    // A turn that runs now would be cut; the next upkeep tries again.
    if ((await liveSessionLocks(paths.locks, live)).length > 0) return null;
    await server.stop();
    await options.ensureServer();
    return 'server restarted: the Kit hooks in config.toml changed';
  };

  const afterChange = async (changed: boolean): Promise<void> => {
    if (changed) await remember(Date.now()).catch(() => undefined);
    const line = await syncServer().catch((error: unknown) => `server not restarted for the new hooks: ${error instanceof Error ? error.message : String(error)}`);
    if (line) context.log(`[kimi] ${line}`);
  };

  return {
    hooks,
    syncServer,
    kitKey,
    appRestart,
    async approveHooks(expected) {
      const wanted = blocks();
      if (!wanted.ok) throw refuse(wanted.reason);
      await options.programPath();
      let changed = false;
      await changeConfig(change(), (current) => {
        const plan = planHookFile(current, wanted.blocks);
        if (plan.status === 'unknown' || plan.target === null) throw refuse(plan.reason ?? 'файл не разбирается');
        if (plan.status === 'approved') return current;
        changed = true;
        if (plan.section !== expected.command || hookFingerprint(current, plan.target) !== expected.hash) {
          throw new ProviderError('hooks-changed', 'config.toml Kimi изменился после предпросмотра', { status: 409, hint: 'Проверьте предпросмотр ещё раз.' });
        }
        return plan.target;
      });
      await afterChange(changed);
      return hooks();
    },
    async action(blocked) {
      // Found by their command: a host that cannot write the hook can still remove it.
      const wanted = blocks();
      const { plan } = await read(wanted.ok ? wanted.blocks : []);
      const present = plan.found.length > 0;
      const reason = plan.status === 'unknown' ? 'Workflow Kit не меняет этот config.toml' : !present ? 'хука Kit в config.toml Kimi нет' : (blocked ?? null);
      return { id: REMOVE_HOOK_ACTION, title: 'Убрать хук Kit из Kimi', scope: 'provider', enabled: reason === null, ...(reason === null ? { confirm: REMOVE_CONFIRM } : { reason }) };
    },
    async remove() {
      const wanted = blocks();
      await options.programPath();
      let changed = false;
      await changeConfig(change(), (current) => {
        const plan = planHookFile(current, wanted.ok ? wanted.blocks : []);
        if (plan.cleaned === null) throw refuse(plan.reason ?? 'файл не разбирается');
        changed = plan.cleaned !== current;
        return plan.cleaned;
      });
      await afterChange(changed);
    },
  };
}
