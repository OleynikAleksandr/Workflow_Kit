// One mutation lane per session. Stop invalidates unsent work and wakes retry delays.
export interface SendGuard { current(): boolean; wait(ms: number): Promise<void> }
export interface KimiTurnGate {
  send(id: string, run: (guard: SendGuard) => Promise<boolean>): Promise<boolean>;
  interrupt<T>(id: string, run: (acceptedWhileWaiting: () => boolean) => Promise<T>): Promise<T>;
}
export function createTurnGate(): KimiTurnGate {
  const slots = new Map<string, { epoch: number; accepted: number; tail: Promise<unknown>; wake: Set<() => void> }>();
  const slot = (id: string) => {
    let found = slots.get(id);
    if (!found) { found = { epoch: 0, accepted: 0, tail: Promise.resolve(), wake: new Set() }; slots.set(id, found); }
    return found;
  };
  const queue = <T>(entry: ReturnType<typeof slot>, run: () => Promise<T>) => {
    const result = entry.tail.then(run, run);
    entry.tail = result.catch(() => undefined);
    return result;
  };
  return {
    send(id, run) {
      const entry = slot(id);
      const epoch = entry.epoch;
      const current = () => entry.epoch === epoch;
      return queue(entry, async () => {
        if (!current()) return false;
        const accepted = await run({ current, wait: (ms) => new Promise<void>((resolve) => {
          const finish = () => { clearTimeout(timer); entry.wake.delete(finish); resolve(); };
          const timer = setTimeout(finish, ms);
          entry.wake.add(finish);
          if (!current()) finish();
        }) });
        if (accepted) entry.accepted += 1;
        return accepted;
      });
    },
    interrupt(id, run) {
      const entry = slot(id);
      entry.epoch += 1;
      const accepted = entry.accepted;
      for (const wake of [...entry.wake]) wake();
      return queue(entry, () => run(() => entry.accepted !== accepted));
    },
  };
}
