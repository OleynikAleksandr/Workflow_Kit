/** Serial admission to one native host. Independent hosts never block one another. */
export class NativeControlArbiter {
  private tails = new Map<string, Promise<void>>();

  /** Abort cancels a queued admission; an admitted operation owns its lease until it settles. */
  run<T>(key: string, action: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    let started = false;
    let cancelled = false;
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const result = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
    const abort = (): void => {
      if (started || cancelled) return;
      cancelled = true;
      reject(signal?.reason ?? new Error('Native admission cancelled'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const previous = this.tails.get(key) ?? Promise.resolve();
    const tail = previous.then(async () => {
      if (cancelled) return;
      started = true;
      signal?.removeEventListener('abort', abort);
      try { resolve(await action()); } catch (error) { reject(error); }
    });
    this.tails.set(key, tail);
    void tail.then(() => {
      signal?.removeEventListener('abort', abort);
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }
}
