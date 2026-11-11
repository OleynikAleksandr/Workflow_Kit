// Public interface of the provider-codex module (#provider-codex). The backend registers the
// provider returned by createProvider (DEFAULT_PROVIDERS in cli); nothing outside this module
// knows about Codex.
import type { Provider, ProviderContext, ProviderFactory } from '#provider-registry';
import { createCodexProvider } from './provider.ts';

export { APP_OWNER_REASON, CONNECTING_REASON, DAEMON_START_ACTION, STALE_LOGIN_REASON, LOGIN_HINT, PROVIDER_ID, PROVIDER_TITLE, createCodexProvider, parseRemoteControlStart } from './provider.ts';
export type { CodexDeps, DaemonOpener, DaemonState, ProgramState } from './runtime.ts';
export type { AppServerOpener, AppServerSpec } from './stdio.ts';
export type { RpcTransport } from './rpc.ts';
export { HANDOVER_REASON, HANDOVER_WAIT_MS, appServerPids, isChatgptAppServer } from './handover.ts';
export { BLOCK_BEGIN, BLOCK_END, CONNECTIONS_LINK, REMOTE_LOGIN_LINK, SHARED_ALIAS, SHARED_HOST_ID, createSharedAccess } from './shared-access.ts';
export type { SharedAccessDeps } from './shared-access.ts';
export { KIT_HOOK_COMMAND, KIT_HOOK_COMMANDS, isExactKitCommand } from './hooks.ts';
export { HELD_NOTE, RELEASE_POLL_MS, RELEASE_WAIT_MS, FIRST_TURN_WAIT_MS, RELEASING_NOTE, SERVICE_TURN_WAIT_MS, UNSUBSCRIBE_TIMEOUT_MS, serviceTurnText, threadLinks } from './sessions.ts';
export type { CodexRecord } from './sessions.ts';

/** Creates the Codex provider with the real transports (stdio app-server, daemon socket). */
export const createProvider: ProviderFactory = (context: ProviderContext): Provider => createCodexProvider(context);
