// Routes of the shared access to a provider's chats (spec M12 section 2.2): state, recheck,
// preview, write and removal (operations), opening of the settings pages.
import { HttpError } from '#http-server';
import type { JsonResult, RouteContext, Router } from '#http-server';
import type { Project, Provider } from './contract.ts';
import type { SharedAccess, SharedAccessTarget } from './shared-access.ts';

const SHARED_TARGETS: ReadonlySet<string> = new Set<SharedAccessTarget>(['remote-login', 'connections']);

/** Helpers of routes.ts the shared access routes reuse. */
export interface SharedAccessRouteParts {
  router: Router;
  providerOf(ctx: RouteContext): Provider;
  startOperation(spec: { kind: string; title: string; provider: Provider; project: Project | null; run: () => Promise<unknown> }): JsonResult;
  toHttpError(error: unknown): unknown;
  bodyObject(body: unknown): Record<string, unknown>;
  requiredText(body: Record<string, unknown>, field: string): string;
}

/** Registers /api/providers/:p/shared-access and its sub-routes. */
export function registerSharedAccessRoutes(parts: SharedAccessRouteParts): void {
  const { router, providerOf, startOperation, toHttpError, bodyObject, requiredText } = parts;

  function sharedAccessOf(provider: Provider): SharedAccess {
    const shared = provider.sharedAccess;
    if (!shared) throw new HttpError(409, 'not-supported', `${provider.title}: общий доступ к чатам не поддерживается`);
    return shared;
  }

  async function answer<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw toHttpError(error);
    }
  }

  router.get('/api/providers/:p/shared-access', async (ctx) => {
    const shared = sharedAccessOf(providerOf(ctx));
    return answer(() => shared.state(false));
  });

  router.post('/api/providers/:p/shared-access/recheck', async (ctx) => {
    const shared = sharedAccessOf(providerOf(ctx));
    return answer(() => shared.state(true));
  });

  router.get('/api/providers/:p/shared-access/preview', async (ctx) => {
    const shared = sharedAccessOf(providerOf(ctx));
    return answer(() => shared.preview());
  });

  router.post('/api/providers/:p/shared-access/apply', async (ctx) => {
    const token = requiredText(bodyObject(ctx.body), 'token');
    const provider = providerOf(ctx);
    const shared = sharedAccessOf(provider);
    return startOperation({
      kind: 'provider.shared-access.apply',
      title: `${provider.title}: настройка общего доступа к чатам`,
      provider,
      project: null,
      run: () => shared.apply(token),
    });
  });

  router.post('/api/providers/:p/shared-access/remove', async (ctx) => {
    const provider = providerOf(ctx);
    const shared = sharedAccessOf(provider);
    return startOperation({
      kind: 'provider.shared-access.remove',
      title: `${provider.title}: удаление настройки общего доступа`,
      provider,
      project: null,
      run: () => shared.remove(),
    });
  });

  router.post('/api/providers/:p/shared-access/open', async (ctx) => {
    const target = bodyObject(ctx.body)['target'];
    if (typeof target !== 'string' || !SHARED_TARGETS.has(target)) {
      throw new HttpError(400, 'invalid-body', 'Поле target должно быть remote-login или connections');
    }
    const shared = sharedAccessOf(providerOf(ctx));
    await answer(() => shared.open(target as SharedAccessTarget));
    return { opened: target };
  });
}
