/** Runs actions one at a time per key (D10: actions on one project or provider never overlap). */
export interface KeyedMutex {
  run<T>(key: string, action: () => Promise<T> | T): Promise<T>;
  /** True while an action for the key is running or waiting. */
  busy(key: string): boolean;
}

/** Creates an in-process keyed mutex; a failing action releases the lock for the next one. */
export function createKeyedMutex(): KeyedMutex {
  const tails = new Map<string, Promise<unknown>>();
  return {
    run(key, action) {
      const previous = tails.get(key) ?? Promise.resolve();
      const result = previous.then(() => action());
      const tail = result.catch(() => undefined);
      tails.set(key, tail);
      void tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      return result;
    },
    busy: (key) => tails.has(key),
  };
}
