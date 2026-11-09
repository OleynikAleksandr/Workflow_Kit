// Public interface of the provider-kimi module (#provider-kimi). The backend registers the
// provider returned by createProvider (DEFAULT_PROVIDERS in cli); nothing outside this module
// knows about Kimi Code.
import type { Provider, ProviderContext, ProviderFactory } from '#provider-registry';
import { createKimiProvider } from './provider.ts';

export { LOGIN_NOTE, MODEL_NOTE, ON_DEMAND_NOTE, PROVIDER_ID, PROVIDER_TITLE, RESTART_ACTION, UNTESTED_OS_NOTE, createKimiProvider, createKimiRuntime, probeServer } from './provider.ts';
export type { KimiDeps, KimiProbe, KimiRuntime } from './provider.ts';
export { KIMI_APP_NAME, KIMI_LINK_PREFIX, KIMI_SCHEME_KEYS, KIMI_SCHEME_MIME, kimiAppFound, kimiProjectLink, parseKimiProjectLink, resumeNote } from './app-link.ts';
export type { KimiAppCheck } from './app-link.ts';
export { REMOTE_BUSY_NOTE, REMOTE_CACHE_MS, REMOTE_OFF_ACTION, REMOTE_ON_ACTION, createKimiRemote } from './remote.ts';
export type { KimiRemote, KimiRemoteOptions } from './remote.ts';
export { KIMI_CODES, KIMI_TIMEOUT_MS, KimiError, createKimiClient, describeKimiError } from './client.ts';
export type { KimiClient, KimiClientOptions, KimiErrorKind, KimiRequestOptions } from './client.ts';
export { HOOK_SCOPE_NOTE, REMOVE_HOOK_ACTION, createKimiHooks } from './hooks.ts';
export type { KimiHookDeps, KimiHooks, KimiHooksOptions } from './hooks.ts';
export { hookFingerprint, planHookFile } from './hook-file.ts';
export type { FoundHook, HookFilePlan } from './hook-file.ts';
export { KEPT_BACKUPS, UNREADABLE_LOCK_MS, changeConfig, readConfig } from './hook-writer.ts';
export type { ConfigChange, ConfigChangeDeps, ConfigText } from './hook-writer.ts';
export { defaultLiveness, holderAlive, liveSessionLocks, lockTime } from './locks.ts';
export type { Liveness } from './locks.ts';
export { TomlScanError, scanToml, tomlValue } from './toml-scan.ts';
export type { TomlEntry, TomlSection } from './toml-scan.ts';
export { KIMI_HOME_ENV, envValue, envWithout, inFolder, kimiHome, kimiPaths, pathApi, sameFolder } from './paths.ts';
export type { KimiPaths } from './paths.ts';
export { MIN_KIMI_VERSION, OLD_VERSION_NOTE, compareVersions, findKimiProgram, parseVersion, testedVersion } from './program.ts';
export type { ProgramState } from './program.ts';
export { LOCK_SWITCH, SERVER_OWNER, createKimiServer, freeLocalPort, readInstances } from './server.ts';
export type { KimiServer, KimiServerDeps } from './server.ts';
export { ANSWER_PAGE_LIMIT, FOREIGN_RETRY_MS, createKimiMessages, deliveryNote } from './messages.ts';
export type { KimiMessageDeps, KimiMessages } from './messages.ts';
export { ARCHIVED_NOTE, GONE_NOTE, LIST_CACHE_MS, LIST_PAGE_LIMIT, PARTIAL_NOTE, SERVER_DOWN, WAITING_NOTE, createKimiSessionList, createSessionNotes, enumerateSessions, sessionLinks, unavailableNote } from './session-list.ts';
export type { Enumeration, KimiSessionList, SessionNotes } from './session-list.ts';
export { DELETE_KEEP_MS, SESSION_ID, createKimiStore } from './session-store.ts';
export type { DeleteIntent, KimiRecord, KimiStore } from './session-store.ts';
export { ARCHIVE_STALE_NOTE, FOREIGN_RENAME_NOTE, createKimiSessions } from './sessions.ts';
export type { KimiSessionDeps, KimiSessions } from './sessions.ts';
export { parseAuth, parseBatch, parseConfig, parseConfigHooks, parseInstance, parseMessages, parseMeta, parsePrompt, parseRemote, parseSession, parseSessionPage, parseTrusted, parseWorkspace, parseWorkspaces } from './shapes.ts';
export { REMOTE_URL } from './shapes.ts';
export type { KimiBatchResult, KimiInstance, KimiListedSession, KimiMessage, KimiMeta, KimiRemoteState, KimiSession, KimiWorkspace } from './shapes.ts';
export { createKimiWorkspaces, folderTrusted, pickWorkspace, workspaceKey } from './workspace.ts';
export type { KimiWorkspaces } from './workspace.ts';

/** Creates the Kimi provider with the real server and HTTP transport. */
export const createProvider: ProviderFactory = (context: ProviderContext): Provider => createKimiProvider(context);
