// POST /api/open-link { url }: the service opens a chat link in its app on this computer (spec
// M3-autostart section 7; Windows: spec M5 section 7). A panel cannot always open an app link by
// itself: without a click of the user the window or the browser may drop it. Only from this
// computer (loopback) and only the links the providers give: the chat links
// codex://threads/<id> and claude://claude.ai/code/session_<id> (macOS and Windows) and the
// project link of Kimi Code, kimi-code://open?root=<folder of a registered project> (spec M8
// section 2.6; also Linux, through xdg-open).
// POST /api/system/shutdown: the graceful stop of the service on request from this computer
// (Windows has no SIGTERM; the installer stops the service this way before it kills it).
import { HttpError, classifyAddress } from '#http-server';
import type { Router } from '#http-server';
import type { CommandRunner } from '#process-supervisor';
import { KIMI_LINK_PREFIX, kimiAppFound, kimiProjectLink, parseKimiProjectLink, sameFolder } from '#provider-kimi';

/** Chat links the service opens. */
export const OPENABLE_LINK = /^(?:codex:\/\/threads\/[A-Za-z0-9_-]{1,128}|claude:\/\/claude\.ai\/code\/session_[A-Za-z0-9]{1,128})$/;

/** Package name of the ChatGPT/Codex desktop app on Windows. */
export const CODEX_APPX = 'OpenAI.Codex';

/**
 * PowerShell that starts the Codex app from its AppX package with the link (the protocol
 * association of codex:// is unreliable on Windows, openai/codex#25822); exit 3 without the package.
 */
export function codexAppxScript(url: string): string {
  return [
    `$p = Get-AppxPackage -Name '${CODEX_APPX}' | Select-Object -First 1`,
    'if (-not $p) { exit 3 }',
    '$id = ((Get-AppxPackageManifest $p).Package.Applications.Application | Select-Object -First 1).Id',
    `Start-Process -FilePath ("shell:AppsFolder\\" + $p.PackageFamilyName + "!" + $id) -ArgumentList '${url}'`,
  ].join('; ');
}

/** The commands that open a link on a platform, tried in order (null: not supported here). */
export function openCommands(platform: NodeJS.Platform, url: string, env: Readonly<Record<string, string | undefined>>): Array<{ command: string; args: string[] }> | null {
  if (platform === 'darwin') return [{ command: 'open', args: [url] }];
  // Linux: only the project link of Kimi Code; the chat apps of ChatGPT and Claude have no Linux build.
  if (platform !== 'win32') return url.startsWith(KIMI_LINK_PREFIX) ? [{ command: 'xdg-open', args: [url] }] : null;
  const system32 = `${env['SystemRoot'] || env['SYSTEMROOT'] || 'C:\\Windows'}\\System32`;
  const rundll = { command: `${system32}\\rundll32.exe`, args: ['url.dll,FileProtocolHandler', url] };
  if (!url.startsWith('codex://')) return [rundll];
  const powershell = `${system32}\\WindowsPowerShell\\v1.0\\powershell.exe`;
  return [{ command: powershell, args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', codexAppxScript(url)] }, rundll];
}

function loopbackOnly(remote: string | undefined, message: string): void {
  if (classifyAddress(remote) !== 'loopback') throw new HttpError(403, 'loopback-only', message);
}

export function registerOpenLinkRoute(options: {
  router: Router;
  runCommand: CommandRunner;
  platform: NodeJS.Platform;
  env?: Readonly<Record<string, string | undefined>>;
  log?: (line: string) => void;
  /** Registered projects: a Kimi link is opened only for the folder of one of them. */
  projects: { list(): Promise<Array<{ path: string }>> };
  homedir: string;
  /** Whether the Kimi Code app is installed (default: kimiAppFound; tests replace it). */
  kimiApp?: () => Promise<boolean>;
}): { shutdownRequested: Promise<void> } {
  let requestShutdown: () => void = () => undefined;
  const shutdownRequested = new Promise<void>((resolve) => (requestShutdown = resolve));
  const { platform } = options;
  const env = options.env ?? process.env;
  const kimiApp = options.kimiApp ?? (() => kimiAppFound({ platform, env, homedir: options.homedir, runCommand: options.runCommand }));
  // The link is built again from the registered folder: nothing of the request reaches the program as it came.
  const kimiLink = async (url: string): Promise<string> => {
    const parsed = parseKimiProjectLink(url);
    const project = parsed ? (await options.projects.list()).find((item) => sameFolder(item.path, parsed.root, platform)) : undefined;
    if (!parsed || !project) throw new HttpError(400, 'bad-link', 'Ссылка Kimi Code открывается только для папки зарегистрированного проекта: kimi-code://open?root=<папка>');
    if (!(await kimiApp())) throw new HttpError(501, 'no-handler', 'Приложение Kimi Code не найдено: сессию продолжает команда `kimi -S <id>` в терминале проекта');
    return kimiProjectLink(project.path, parsed.fresh);
  };
  options.router.post('/api/open-link', async ({ body, req }) => {
    loopbackOnly(req.socket.remoteAddress, 'Ссылку открывает только панель на этом компьютере');
    const asked = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['url'] : undefined;
    const kimi = typeof asked === 'string' && asked.startsWith('kimi-code:');
    const url = kimi ? await kimiLink(asked) : asked;
    const commands = openCommands(platform, typeof url === 'string' ? url : '', env);
    if (!commands) throw new HttpError(501, 'not-supported', 'Ссылки чатов ChatGPT и Claude служба открывает только на macOS и Windows');
    if (typeof url !== 'string' || (!kimi && !OPENABLE_LINK.test(url))) throw new HttpError(400, 'bad-link', 'Ожидается ссылка чата codex://threads/<id> или claude://claude.ai/code/session_<id> либо ссылка проекта kimi-code://open?root=<папка>');
    let reason = '';
    for (const { command, args } of commands) {
      const result = await options.runCommand(command, args, { timeoutMs: 15_000 });
      if (!result.startError && result.code === 0) return { opened: true };
      reason = result.startError ?? (result.stderr.trim().slice(0, 200) || `код ${result.code}`);
      options.log?.(`open-link: ${url} was not opened by ${command}: ${reason}`);
    }
    throw new HttpError(502, 'open-failed', `Ссылка не открылась: ${reason}`);
  });
  options.router.post('/api/system/shutdown', async ({ req }) => {
    loopbackOnly(req.socket.remoteAddress, 'Службу останавливает только этот компьютер');
    // The answer goes out first; wfk serve then stops as on SIGTERM.
    setTimeout(requestShutdown, 50);
    options.log?.('shutdown requested over the API');
    return { stopping: true };
  });
  return { shutdownRequested };
}
