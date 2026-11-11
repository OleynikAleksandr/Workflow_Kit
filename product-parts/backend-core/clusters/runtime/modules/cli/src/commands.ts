import os from 'node:os';
import path from 'node:path';
import { runServiceCommand } from '#service-installer';
import type { ServiceCommand, ServiceDeps } from '#service-installer';
import { createApp } from './app.ts';
import type { App, AppOptions } from './app.ts';
import { readProcessStdin, runHook } from './hook.ts';
import type { PostJson, RequestJson } from './hook-service.ts';
import { runSessionCommand } from './session-command.ts';
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
}

/** Top-level commands of wfk, in help order. */
export const COMMANDS: readonly string[] = ['serve', 'open', 'install', 'uninstall', 'service', 'doctor', 'link', 'hook', 'session', 'project'];

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
  hook session-start|stop|prompt|turn-end --client <провайдер>
                                хуки агентов: начало сессии, конец хода, новое сообщение,
                                конец хода без удержания
  session title "<тема>"        имя сессии от агента (один раз, в идущем ходе)
  session plan "<что делаем>"   вопрос пользователю: спецификация и план (с ревью или без)
  project publish               опубликовать проект папки в upstream git (только при закрытом scope)
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
  try {
    app = await createApp({ log: (line) => deps.stderr(`${line}\n`), ...deps.app });
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
    case 'hook':
      return runHook(rest, {
        stdout: full.stdout,
        stderr: full.stderr,
        homedir: full.app?.homedir,
        platform: full.app?.platform,
        post: full.postJson,
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
