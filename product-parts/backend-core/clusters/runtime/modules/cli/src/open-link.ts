// POST /api/open-link { url }: the service opens a chat link in its app on this computer (spec
// M3-autostart section 7; Windows: spec M5 section 7). A panel cannot always open an app link by
// itself: without a click of the user the window or the browser may drop it. Only from this
// computer (loopback), macOS and Windows, and only the chat links the providers give
// (codex://threads/<id>, claude://claude.ai/code/session_<id>).
// POST /api/system/shutdown: the graceful stop of the service on request from this computer
// (Windows has no SIGTERM; the installer stops the service this way before it kills it).
import { HttpError, classifyAddress } from '#http-server';
import type { Router } from '#http-server';
import type { CommandRunner } from '#process-supervisor';

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
  if (platform !== 'win32') return null;
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
}): { shutdownRequested: Promise<void> } {
  let requestShutdown: () => void = () => undefined;
  const shutdownRequested = new Promise<void>((resolve) => (requestShutdown = resolve));
  options.router.post('/api/open-link', async ({ body, req }) => {
    loopbackOnly(req.socket.remoteAddress, 'Ссылку открывает только панель на этом компьютере');
    const url = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['url'] : undefined;
    const commands = openCommands(options.platform, typeof url === 'string' ? url : '', options.env ?? process.env);
    if (!commands) throw new HttpError(501, 'not-supported', 'Открытие ссылок службой — только на macOS и Windows');
    if (typeof url !== 'string' || !OPENABLE_LINK.test(url)) throw new HttpError(400, 'bad-link', 'Ожидается ссылка чата codex://threads/<id> или claude://claude.ai/code/session_<id>');
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
