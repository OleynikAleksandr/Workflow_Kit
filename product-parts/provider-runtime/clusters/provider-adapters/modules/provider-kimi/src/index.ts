// Public interface of the provider-kimi module (#provider-kimi). The backend registers the
// provider returned by createProvider (DEFAULT_PROVIDERS in cli); nothing outside this module
// knows about Kimi Code.
import type { Provider, ProviderContext, ProviderFactory } from '#provider-registry';
import { createKimiProvider } from './provider.ts';

export { LOGIN_NOTE, MODEL_NOTE, ON_DEMAND_NOTE, PROVIDER_ID, PROVIDER_TITLE, RESTART_ACTION, UNTESTED_OS_NOTE, createKimiProvider, createKimiRuntime, probeServer } from './provider.ts';
export type { KimiDeps, KimiProbe, KimiRuntime } from './provider.ts';
export { KIMI_CODES, KIMI_TIMEOUT_MS, KimiError, createKimiClient, describeKimiError } from './client.ts';
export type { KimiClient, KimiClientOptions, KimiErrorKind, KimiRequestOptions } from './client.ts';
export { KIMI_HOME_ENV, envValue, envWithout, kimiHome, kimiPaths, pathApi, sameFolder } from './paths.ts';
export type { KimiPaths } from './paths.ts';
export { MIN_KIMI_VERSION, OLD_VERSION_NOTE, compareVersions, findKimiProgram, parseVersion, testedVersion } from './program.ts';
export type { ProgramState } from './program.ts';
export { LOCK_SWITCH, SERVER_OWNER, createKimiServer, freeLocalPort, readInstances } from './server.ts';
export type { KimiServer, KimiServerDeps } from './server.ts';
export { parseAuth, parseConfig, parseInstance, parseMeta, parseTrusted, parseWorkspace, parseWorkspaces } from './shapes.ts';
export type { KimiInstance, KimiMeta, KimiWorkspace } from './shapes.ts';
export { createKimiWorkspaces, folderTrusted, pickWorkspace, workspaceKey } from './workspace.ts';
export type { KimiWorkspaces } from './workspace.ts';

/** Creates the Kimi provider with the real server and HTTP transport. */
export const createProvider: ProviderFactory = (context: ProviderContext): Provider => createKimiProvider(context);
