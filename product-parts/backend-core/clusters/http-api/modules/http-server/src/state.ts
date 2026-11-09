import type { Router } from './router.ts';

/** Produces one section of GET /api/state; must only read (D11), never run external programs. */
export type StateSectionProvider = () => unknown;

/** Registry of /api/state sections; modules add their sections at startup. */
export interface StateRegistry {
  add(name: string, provider: StateSectionProvider): void;
  names(): string[];
  /** Collects every section; a failing provider yields { error } instead of failing the whole state. */
  collect(): Promise<Record<string, unknown>>;
}

/** Creates an empty state registry. */
export function createStateRegistry(): StateRegistry {
  const sections = new Map<string, StateSectionProvider>();
  return {
    add(name, provider) {
      if (sections.has(name)) throw new Error(`State section already registered: ${name}`);
      sections.set(name, provider);
    },
    names: () => [...sections.keys()],
    async collect() {
      const entries = await Promise.all(
        [...sections].map(async ([name, provider]) => {
          try {
            return [name, await provider()] as const;
          } catch (error) {
            return [name, { error: error instanceof Error ? error.message : String(error) }] as const;
          }
        }),
      );
      return Object.fromEntries(entries);
    },
  };
}

/**
 * Registers GET /api/health ({ ok: true, ...health() }) and GET /api/state
 * ({ generatedAt, ...sections }) on the router.
 */
export function registerCoreRoutes(router: Router, state: StateRegistry, health: () => Record<string, unknown>): void {
  router.get('/api/health', () => ({ ok: true, ...health() }));
  router.get('/api/state', async () => ({ generatedAt: new Date().toISOString(), ...(await state.collect()) }));
}
