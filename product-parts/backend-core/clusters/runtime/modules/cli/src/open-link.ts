// POST /api/open-link { url }: the service opens a chat link in its app on this Mac (spec
// M3-autostart section 7). A panel cannot always open an app link by itself: without a click of
// the user the window or the browser may drop it. Only from this computer (loopback), macOS only,
// and only the chat links the providers give (codex://threads/<id>).
import { HttpError, classifyAddress } from '#http-server';
import type { Router } from '#http-server';
import type { CommandRunner } from '#process-supervisor';

/** Chat links the service opens. */
export const OPENABLE_LINK = /^codex:\/\/threads\/[A-Za-z0-9_-]{1,128}$/;

export function registerOpenLinkRoute(options: {
  router: Router;
  runCommand: CommandRunner;
  platform: NodeJS.Platform;
  log?: (line: string) => void;
}): void {
  options.router.post('/api/open-link', async ({ body, req }) => {
    if (classifyAddress(req.socket.remoteAddress) !== 'loopback') {
      throw new HttpError(403, 'loopback-only', 'Ссылку открывает только панель на этом компьютере');
    }
    if (options.platform !== 'darwin') throw new HttpError(501, 'not-supported', 'Открытие ссылок службой — только на macOS');
    const url = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['url'] : undefined;
    if (typeof url !== 'string' || !OPENABLE_LINK.test(url)) throw new HttpError(400, 'bad-link', 'Ожидается ссылка чата codex://threads/<id>');
    const result = await options.runCommand('open', [url], { timeoutMs: 10_000 });
    if (result.startError || result.code !== 0) {
      const reason = result.startError ?? (result.stderr.trim().slice(0, 200) || `код ${result.code}`);
      options.log?.(`open-link: ${url} was not opened: ${reason}`);
      throw new HttpError(502, 'open-failed', `Ссылка не открылась: ${reason}`);
    }
    return { opened: true };
  });
}
