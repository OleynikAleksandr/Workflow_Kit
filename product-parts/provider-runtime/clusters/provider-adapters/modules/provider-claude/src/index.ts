// Public interface of the provider-claude module (#provider-claude). The backend registers the
// provider returned by createProvider; nothing outside the module knows its internals.
import type { Provider, ProviderContext, ProviderFactory } from '#provider-registry';
import { createClaudeProvider } from './provider.ts';

export { PROVIDER_ID } from './runtime.ts';
export type { ClaudeProviderOptions } from './runtime.ts';
export { createClaudeProvider } from './provider.ts';
export { normalizeRemoteId, sessionLinks } from './links.ts';
export { MIN_CLAUDE_VERSION } from './programs.ts';
export { PTY_SCRIPTS } from './pty.ts';
export type { PtyScripts } from './pty.ts';
export { ENVIRONMENT_START, ENVIRONMENT_STOP } from './environment.ts';

/** Creates the Claude provider with the production settings. */
export const createProvider: ProviderFactory = (context: ProviderContext): Provider => createClaudeProvider(context);
