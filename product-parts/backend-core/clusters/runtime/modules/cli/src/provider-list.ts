// The providers of the service, in panel order (wizard buttons, project screen). This is the only
// list of the backend that names them: the service registers them from here, and
// `wfk hook --client <id>` (a process without the running registry) checks its client against it.
import { createProvider as createClaudeProvider } from '#provider-claude';
import { createProvider as createCodexProvider } from '#provider-codex';
import { createProvider as createKimiProvider } from '#provider-kimi';
import type { ProviderFactory } from '#provider-registry';

/** A provider of the service: its id (equal to the id of the provider the factory builds) and the factory. */
export interface ProviderEntry {
  id: string;
  create: ProviderFactory;
}

export const PROVIDER_ENTRIES: readonly ProviderEntry[] = [
  { id: 'codex', create: createCodexProvider },
  { id: 'claude', create: createClaudeProvider },
  { id: 'kimi', create: createKimiProvider },
];

/** Providers registered by default, in panel order. */
export const DEFAULT_PROVIDERS: readonly ProviderFactory[] = PROVIDER_ENTRIES.map((entry) => entry.create);

/** Ids of the default providers: the clients `wfk hook` accepts. */
export const PROVIDER_IDS: readonly string[] = PROVIDER_ENTRIES.map((entry) => entry.id);

/**
 * Where an agent leaves the id of its session for the commands it runs (`wfk session …`): the
 * first variable that is set names the calling session.
 */
export const SESSION_ENV: readonly { client: string; variable: string }[] = [
  { client: 'codex', variable: 'CODEX_THREAD_ID' },
  { client: 'claude', variable: 'CLAUDE_CODE_SESSION_ID' },
];
