import { NOT_IMPLEMENTED, runServiceCommand } from '#service-installer';
import type { ServiceCommand } from '#service-installer';
import { createApp } from './app.ts';
import type { App, AppOptions } from './app.ts';
import { readPackageVersion } from './system-info.ts';

/** Output streams and process hooks of the CLI; injected for tests. */
export interface CliDeps {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** Options for createApp (serve). */
  app?: AppOptions;
  /** Resolves when the service should stop (default: SIGINT or SIGTERM). */
  waitForShutdown?: (app: App) => Promise<void>;
}

/** Top-level commands of wfk, in help order. */
export const COMMANDS: readonly string[] = ['serve', 'open', 'install', 'uninstall', 'service', 'doctor', 'link', 'hook'];

/** Exit code for usage errors (unknown command or subcommand). */
export const EXIT_USAGE = 64;
/** Exit code for commands that are not implemented yet. */
export const EXIT_NOT_IMPLEMENTED = 2;

const USAGE = `Использование: wfk <команда>

Команды:
  serve                         запустить бэкенд и панель
  open                          открыть панель (запустит службу при необходимости)
  install | uninstall           установить или снять службу и автозапуск
  service start|stop|status     управление службой
  doctor [--installed]          проверка установки
  link                          запускатель wfk на текущий клон (разработка)
  hook session-start --client   приём хука SessionStart
  --version                     версия
`;

/** Which task brings each command that is not implemented yet. */
const PLANNED: Readonly<Record<string, string>> = {
  open: 'T008',
  doctor: 'T008',
  link: 'T003',
  hook: 'T003',
};

function defaultShutdown(): Promise<void> {
  return new Promise((resolve) => {
    const stop = (): void => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      resolve();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
}

async function serve(deps: CliDeps): Promise<number> {
  let app: App;
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
  if (sub !== 'start' && sub !== 'stop' && sub !== 'status') {
    deps.stderr('Использование: wfk service start|stop|status\n');
    return EXIT_USAGE;
  }
  return printServiceResult(sub, deps);
}

async function printServiceResult(command: ServiceCommand, deps: CliDeps): Promise<number> {
  const result = await runServiceCommand(command);
  (result.ok ? deps.stdout : deps.stderr)(`${result.message}\n`);
  return result.exitCode;
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
    case 'open':
    case 'doctor':
    case 'link':
    case 'hook':
      full.stderr(`wfk ${command}: ${NOT_IMPLEMENTED} (задача ${PLANNED[command]})\n`);
      return command === 'hook' ? 0 : EXIT_NOT_IMPLEMENTED;
    default:
      full.stderr(`wfk: неизвестная команда «${command}»\n\n${USAGE}`);
      return EXIT_USAGE;
  }
}
