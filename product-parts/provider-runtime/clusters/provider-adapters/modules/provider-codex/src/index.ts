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
export { BLOCK_BEGIN, BLOCK_END, CONNECTIONS_LINK, REMOTE_LOGIN_LINK, SHARED_ALIAS, SHARED_HOST_ID } from './shared-files.ts';
export { createSharedAccess } from './shared-access.ts';
export type { SharedAccessDeps } from './shared-access.ts';
export { SHARED_APP_OWNER_REASON, appOwnerNote, createSharedMode, isSecondAppServer, sharedThreadLinks } from './shared-mode.ts';
export type { SharedMode } from './shared-mode.ts';
export { WAKE_TEXT, threadStatus, wakeThread } from './thread-ops.ts';
export { CHAT_TIMEOUT_MS, DIRECT_STATUSES, chatPage, createChatParts, threadMessages } from './chat.ts';
export { HISTORY_CACHE_BYTES, HISTORY_CACHE_THREADS, HISTORY_GAP_REASON, HISTORY_GAP_RECHECK_MS, HISTORY_PAGE_SIZE, HISTORY_POLL_BYTES, HISTORY_POLL_MS, HISTORY_POLL_PAGES, HISTORY_UNSUPPORTED_REASON, createHistoryReader } from './history-reader.ts';
export type { HistoryDeps, HistoryReader } from './history-reader.ts';
export type { ChatDeps, ChatParts } from './chat.ts';
export { HARNESS_CODEX_HOOK_COMMAND, KIT_HOOK_COMMAND, KIT_HOOK_COMMANDS, isExactKitCommand, isKitApprovable } from './hooks.ts';
export { HELD_NOTE, RELEASE_POLL_MS, RELEASE_WAIT_MS, FIRST_TURN_WAIT_MS, RELEASING_NOTE, SERVICE_TURN_WAIT_MS, UNSUBSCRIBE_TIMEOUT_MS, serviceTurnText, threadLinks } from './sessions.ts';
export type { CodexRecord } from './sessions.ts';

/** Creates the Codex provider with the real transports (stdio app-server, daemon socket). */
export const createProvider: ProviderFactory = (context: ProviderContext): Provider => createCodexProvider(context);

export { createParameterParts, PARAMETER_FONT, FULL_ACCESS_CONFIRM, UPDATE_UNSUPPORTED } from './parameters.ts';
