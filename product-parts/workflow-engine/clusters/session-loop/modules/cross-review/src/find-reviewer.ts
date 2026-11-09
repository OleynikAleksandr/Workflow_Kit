// Looks for the channel key of a just created reviewer session (spec M4 13.9): a session of a
// provider like Claude gets its local id from its hooks a few seconds after the start, before any turn.
export const FIND_REVIEWER = Object.freeze({ pollMs: 2000, timeoutMs: 3 * 60_000 });

/** Asks resolve() every pollMs until it returns a key, stop() says the search is moot, or the time is out. */
export async function findReviewer(
  resolve: () => Promise<string | null>,
  options: { pollMs: number; timeoutMs: number; stop: () => boolean },
): Promise<string | null> {
  const deadline = Date.now() + options.timeoutMs;
  for (;;) {
    if (options.stop()) return null;
    const key = await resolve().catch(() => null);
    if (key) return key;
    if (Date.now() >= deadline) return null;
    await new Promise((done) => setTimeout(done, options.pollMs));
  }
}
