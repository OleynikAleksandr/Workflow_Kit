// Public interface of the provider-claude module (#provider-claude). The backend registers the
// provider returned by createProvider; T006 replaces this stub without changes outside the module.
import { createStubProvider } from '#provider-registry';
import type { Provider, ProviderContext, ProviderFactory } from '#provider-registry';

/** Registry id of the provider (also the hook journal client). */
export const PROVIDER_ID = 'claude';

/** Creates the Claude provider. Stub: status "не реализовано", sessions from the hook journal only. */
export const createProvider: ProviderFactory = (_context: ProviderContext): Provider =>
  createStubProvider({ id: PROVIDER_ID, title: 'Claude', task: 'T006' });
