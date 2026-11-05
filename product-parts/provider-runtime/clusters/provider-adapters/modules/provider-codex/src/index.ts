// Public interface of the provider-codex module (#provider-codex). The backend registers the
// provider returned by createProvider; T007 replaces this stub without changes outside the module.
import { createStubProvider } from '#provider-registry';
import type { Provider, ProviderContext, ProviderFactory } from '#provider-registry';

/** Registry id of the provider (also the hook journal client). */
export const PROVIDER_ID = 'codex';

/** Creates the Codex provider. Stub: status "не реализовано", sessions from the hook journal only. */
export const createProvider: ProviderFactory = (_context: ProviderContext): Provider =>
  createStubProvider({ id: PROVIDER_ID, title: 'Codex', task: 'T007' });
