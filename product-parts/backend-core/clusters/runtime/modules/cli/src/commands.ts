import os from 'node:os';
import path from 'node:path';
import { runServiceCommand } from '#service-installer';
import type { ServiceCommand, ServiceDeps } from '#service-installer';
import type { App, AppOptions } from './app.ts';
import { runStatusline } from './statusline.ts';
import { readProcessStdin, runHook } from './hook.ts';
import type { PostJson, RequestJson } from './hook-service.ts';
import { runSessionCommand } from './session-command.ts';
import { runDecisionCommand } from './decision-command.ts';
import { runProjectCommand } from './project-command.ts';
import { linkLauncher } from './link.ts';
import { withLauncherDir } from './service-path.ts';
import { readPackageVersion } from './system-info.ts';

/** Output streams and process hooks of the CLI; injected for tests. */
export interface CliDeps {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** Options for createApp (serve); env, platform and homedir also serve link and hook. */
  app?: AppOptions;
  /** Working directory for hook (default: process.cwd()). */
  cwd?: string;
  /** Reads the hook input (default: process stdin with a timeout). */
  readStdin?: (timeoutMs: number) => Promise<string>;
  /** Posts hook input to the service (wfk hook stop|prompt); tests pass a fake. */
  postJson?: PostJson;
  /** Provider ids `wfk hook` accepts as --client (default: the service's providers). */
  hookClients?: readonly string[];
  /** Posts to the service and reads the answer (wfk session title); tests pass a fake. */
  requestJson?: RequestJson;
  /** Resolves when the service should stop (default: SIGINT or SIGTERM). */
  waitForShutdown?: (app: App) => Promise<void>;
  /** Effects of the service installer (runner, health probe, spawner); tests pass fakes. */
  service?: ServiceDeps;
  /** Loads the server module for serve (default: import('./app.ts')); tests simulate a missing dependency. */
  loadApp?: () => Promise<{ createApp: typeof import('./app.ts').createApp }>;
}

// Lazy loading of the server (app.ts): it pulls runtime dependencies (ws through
// #speech-service), so a copy without them must still run install, doctor, hook and session.
type CreateApp = (options?: AppOptions) => Promise<App>;
export type LoadedApp = { ok: true; createApp: CreateApp } | { ok: false; message: string };

/** The bare package name of a module-not-found error, or null for any other error. */
export function missingPackage(error: unknown): string | null {
  const err = error as NodeJS.ErrnoException;
  if (err?.code !== 'ERR_MODULE_NOT_FOUND') return null;
  const match = /Cannot find package '([^']+)'/u.exec(String(err.message));
  return match?.[1] ?? null;
}

/** Imports app.ts; a missing package becomes a message instead of a crash. */
export async function loadCreateApp(load: () => Promise<{ createApp: CreateApp }> = () => import('./app.ts')): Promise<LoadedApp> {
  try {
    return { ok: true, createApp: (await load()).createApp };
  } catch (error) {
    const name = missingPackage(error);
    if (!name) throw error;
    return { ok: false, message: `зависимость ${name} не найдена: переустановите Workflow Kit (npm ci в клоне, затем node bin/wfk.mjs install)` };
  }
}

/** createApp of the server, loaded on first use. */
export async function createApp(options?: AppOptions): Promise<App> {
  return (await import('./app.ts')).createApp(options);
}

/** Top-level commands of wfk, in help order. */
export const COMMANDS: readonly string[] = ['serve', 'open', 'install', 'uninstall', 'service', 'doctor', 'link', 'hook', 'session', 'decision', 'project', 'statusline'];

/** Exit code for usage errors (unknown command or subcommand). */
export const EXIT_USAGE = 64;
/** Exit code for commands that are not implemented yet. */
export const EXIT_NOT_IMPLEMENTED = 2;

const USAGE = `Использование: wfk <команда>

Команды:
  serve                         запустить бэкенд и панель
  open [--url-only]             открыть панель (запустит службу при необходимости);
                                --url-only — только запустить службу и вывести адрес
  install | uninstall           установить или снять службу и автозапуск
  service start|stop|restart|status
                                управление службой (restart — stop, затем start)
  doctor [--installed]          проверка установки
  link [--force]                запускатель ~/.local/bin/wfk на текущий клон (разработка)
  hook session-start|stop|prompt|turn-end|question --client <провайдер>
                                хуки агентов: начало сессии, конец хода, новое сообщение,
                                конец хода без удержания
  session title "<тема>"        имя сессии от агента (один раз, в идущем ходе)
  session plan "<что делаем>"   вопрос пользователю: спецификация и план (с ревью или без)
  decision <вид> [--task <ID>] [--option <способ>]
                                решение пользователя из чата: Kit сам берёт слова пользователя
  project publish               опубликовать проект папки в upstream git (только при закрытом scope)
  statusline --client <id>       снимок параметров и строка состояния пользователя
  --version                     версия
`;

/** SIGINT, SIGTERM or POST /api/system/shutdown (the graceful stop on Windows). */
function defaultShutdown(app: App): Promise<void> {
  return new Promise((resolve) => {
    const stop = (): void => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      resolve();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    void app.shutdownRequested.then(stop);
  });
}

async function serve(deps: CliDeps): Promise<number> {
  let app: App;
  const added = withLauncherDir(deps.app?.env ?? process.env, deps.app?.platform ?? process.platform, deps.app?.homedir ?? os.homedir());
  if (added) deps.stderr(`wfk serve: каталог wfk добавлен в PATH службы: ${added}\n`);
  // The server code (and its runtime dependencies such as ws) loads only for serve, so every
  // other command keeps working in a copy whose dependencies are missing.
  const loaded = await loadCreateApp(deps.loadApp);
  if (!loaded.ok) {
    deps.stderr(`wfk serve: ${loaded.message}\n`);
    return 1;
  }
  try {
    app = await loaded.createApp({ log: (line) => deps.stderr(`${line}\n`), ...deps.app });
  } catch (error) {
    deps.stderr(`wfk serve: не удалось подготовить данные: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  try {
    const bound = await app.start();
    deps.stdout(`Workflow Kit ${app.version} слушает порт ${bound.port} (${bound.host})\n`);
    deps.stdout(`Каталог данных: ${app.dirs.configDir}\n`);
    for (const url of bound.urls) deps.stdout(`Панель: ${url}\n`);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const reason = code === 'EADDRINUSE' ? `порт ${app.config.port} занят` : String(error);
    deps.stderr(`wfk serve: не удалось запустить сервер: ${reason}\n`);
    return 1;
  }
  await (deps.waitForShutdown ?? defaultShutdown)(app);
  await app.stop();
  deps.stdout('Workflow Kit остановлен\n');
  return 0;
}

async function service(args: string[], deps: CliDeps): Promise<number> {
  const sub = args[0];
  if (sub === 'restart') {
    // M17 2.1: stop, then start; a stop that found no service does not prevent the start.
    await printServiceResult('stop', deps);
    return printServiceResult('start', deps);
  }
  if (sub !== 'start' && sub !== 'stop' && sub !== 'status') {
    deps.stderr('Использование: wfk service start|stop|restart|status\n');
    return EXIT_USAGE;
  }
  return printServiceResult(sub, deps);
}

async function printServiceResult(command: ServiceCommand, deps: CliDeps, args: readonly string[] = []): Promise<number> {
  const context: ServiceDeps = {
    env: deps.app?.env ?? process.env,
    platform: deps.app?.platform ?? process.platform,
    homedir: deps.app?.homedir ?? os.homedir(),
    ...deps.service,
  };
  const result = await runServiceCommand(command, context, args);
  (result.ok ? deps.stdout : deps.stderr)(`${result.message}\n`);
  return result.exitCode;
}

async function link(args: string[], deps: CliDeps): Promise<number> {
  const unknown = args.filter((arg) => arg !== '--force');
  if (unknown.length > 0) {
    deps.stderr('Использование: wfk link [--force]\n');
    return EXIT_USAGE;
  }
  const env = deps.app?.env ?? process.env;
  try {
    const result = await linkLauncher({
      homedir: deps.app?.homedir ?? os.homedir(),
      platform: deps.app?.platform ?? process.platform,
      pathEnv: env['PATH'] ?? env['Path'],
      ...(env['LOCALAPPDATA'] ? { localAppData: env['LOCALAPPDATA'] } : {}),
      force: args.includes('--force'),
    });
    deps.stdout(`Запускатель ${result.launcher} ${result.replaced ? 'обновлён' : 'создан'}: ${result.node} ${result.entry}\n`);
    if (!result.inPath) {
      deps.stdout(`Каталог ${path.dirname(result.launcher)} не в PATH: хуки работают и без этого, для терминала добавьте его в PATH\n`);
    }
    return 0;
  } catch (error) {
    deps.stderr(`wfk link: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

/**
 * Runs the wfk command line and returns the process exit code. "hook" always exits
 * with 0 so a broken backend never disturbs a Claude or Codex session (spec section 7).
 */
export async function main(argv: readonly string[], deps?: Partial<CliDeps>): Promise<number> {
  const full: CliDeps = {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    ...deps,
  };
  const [command, ...rest] = argv;
  switch (command) {
    case undefined:
      full.stderr(USAGE);
      return EXIT_USAGE;
    case 'help':
    case '--help':
    case '-h':
      full.stdout(USAGE);
      return 0;
    case '--version':
    case '-v':
      full.stdout(`${await readPackageVersion()}\n`);
      return 0;
    case 'serve':
      return serve(full);
    case 'install':
    case 'uninstall':
      return printServiceResult(command, full);
    case 'service':
      return service(rest, full);
    case 'link':
      return link(rest, full);
    case 'statusline':
      try { return await runStatusline(rest, { platform: full.app?.platform, env: full.app?.env, homedir: full.app?.homedir, cwd: full.cwd, ...(full.readStdin ? { input: Buffer.from(await full.readStdin(2000)) } : {}), ...(deps?.stdout ? { write: bytes => full.stdout(bytes.toString('utf8')) } : {}) }); } catch { return 0; }
    case 'hook':
      return runHook(rest, {
        stdout: full.stdout,
        stderr: full.stderr,
        homedir: full.app?.homedir,
        platform: full.app?.platform,
        post: full.postJson,
        ...(full.requestJson ? { request: full.requestJson } : {}),
        clients: full.hookClients,
        env: full.app?.env ?? process.env,
        cwd: full.cwd ?? process.cwd(),
        readStdin: full.readStdin ?? readProcessStdin,
      });
    case 'project':
      return runProjectCommand(rest, {
        stdout: full.stdout,
        stderr: full.stderr,
        env: full.app?.env ?? process.env,
        cwd: full.cwd ?? process.cwd(),
        homedir: full.app?.homedir,
        platform: full.app?.platform,
        request: full.requestJson,
      });
    case 'session':
      return runSessionCommand(rest, {
        stdout: full.stdout,
        stderr: full.stderr,
        env: full.app?.env ?? process.env,
        cwd: full.cwd ?? process.cwd(),
        homedir: full.app?.homedir,
        platform: full.app?.platform,
        request: full.requestJson,
      });
    case 'decision':
      return runDecisionCommand(rest, {
        stdout: full.stdout,
        stderr: full.stderr,
        env: full.app?.env ?? process.env,
        cwd: full.cwd ?? process.cwd(),
        homedir: full.app?.homedir,
        platform: full.app?.platform,
        request: full.requestJson,
      });
    case 'open':
      if (rest.some((arg) => arg !== '--url-only')) {
        full.stderr('Использование: wfk open [--url-only]\n');
        return EXIT_USAGE;
      }
      return printServiceResult(command, full, rest);
    case 'doctor':
      if (rest.some((arg) => arg !== '--installed')) {
        full.stderr('Использование: wfk doctor [--installed]\n');
        return EXIT_USAGE;
      }
      return printServiceResult(command, full, rest);
    default:
      full.stderr(`wfk: неизвестная команда «${command}»\n\n${USAGE}`);
      return EXIT_USAGE;
  }
}
