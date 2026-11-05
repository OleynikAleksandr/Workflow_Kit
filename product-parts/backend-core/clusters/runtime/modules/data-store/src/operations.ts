// Long actions as operations (D10): a POST answers at once with an operationId, the progress is
// visible in /api/state, and starting the same action again while it runs returns the running one.
import { randomBytes } from 'node:crypto';

/** Lifecycle of an operation. */
export type OperationStatus = 'running' | 'succeeded' | 'failed';

/** Error of a failed operation in the uniform API shape; hint tells the user what to do. */
export interface OperationError {
  code: string;
  message: string;
  hint?: string;
  [field: string]: unknown;
}

/** A long action and its outcome as shown in /api/state. */
export interface Operation {
  /** operationId returned by the POST that started it. */
  id: string;
  /** Deduplication key: one running operation per key. */
  key: string;
  /** Dotted kind, e.g. "provider.trust" or "provider.session.create". */
  kind: string;
  /** Human-readable title for the panel. */
  title: string;
  /** What the operation acts on, e.g. { provider: "claude", project: "<id>" }. */
  scope: Record<string, string | null>;
  status: OperationStatus;
  /** Latest progress note (for example "ожидание очереди"); null when none. */
  progress: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** Value returned by the action (succeeded only). */
  result?: unknown;
  /** Why the action failed (failed only). */
  error?: OperationError;
}

/** Handle the action receives to report progress. */
export interface OperationHandle {
  readonly id: string;
  progress(note: string | null): void;
}

/** What to start. */
export interface OperationSpec<T> {
  key: string;
  kind: string;
  title: string;
  scope?: Record<string, string | null>;
  run: (handle: OperationHandle) => Promise<T> | T;
  /** Called once after the action finished (success or failure); its errors are ignored. */
  onFinish?: (operation: Operation) => unknown;
}

/** Answer of start(): the new operation, or the running one with the same key. */
export interface StartedOperation {
  operation: Operation;
  /** True when an operation with this key was already running and no new one was started. */
  existing: boolean;
}

/** The "operations" section of /api/state, newest first. */
export interface OperationsSection {
  operations: Operation[];
}

/** Registry of operations kept in memory (operations do not survive a restart). */
export interface Operations {
  start<T>(spec: OperationSpec<T>): StartedOperation;
  get(id: string): Operation | undefined;
  /** The running operation with this key, if any. */
  active(key: string): Operation | undefined;
  /** Running operations first, then finished ones, newest first. */
  list(): Operation[];
  /** Resolves with the finished operation (also for an already finished one). */
  wait(id: string): Promise<Operation>;
  section(): OperationsSection;
}

/** Options; the clock, ids and retention are injectable for tests. */
export interface OperationsOptions {
  now?: () => Date;
  newId?: () => string;
  /** How many finished operations are kept (default 50). */
  keepFinished?: number;
  /** How long a finished operation stays visible, in ms (default 15 min). */
  keepMs?: number;
}

/** Converts a thrown value into an OperationError: code, message, hint and details are kept. */
export function toOperationError(error: unknown): OperationError {
  if (error instanceof Error) {
    const source = error as Error & { code?: unknown; hint?: unknown; details?: unknown };
    const details = typeof source.details === 'object' && source.details !== null ? (source.details as Record<string, unknown>) : {};
    const result: OperationError = {
      ...details,
      code: typeof source.code === 'string' ? source.code : 'internal',
      message: error.message,
    };
    if (typeof source.hint === 'string') result.hint = source.hint;
    return result;
  }
  return { code: 'internal', message: String(error) };
}

function copy(operation: Operation): Operation {
  return { ...operation, scope: { ...operation.scope } };
}

/** Creates an in-memory operation registry. */
export function createOperations(options: OperationsOptions = {}): Operations {
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? (() => `op-${randomBytes(6).toString('hex')}`);
  const keepFinished = options.keepFinished ?? 50;
  const keepMs = options.keepMs ?? 15 * 60 * 1000;
  const all = new Map<string, Operation>();
  const running = new Map<string, string>();
  const done = new Map<string, Promise<Operation>>();

  function prune(): void {
    const finished = [...all.values()].filter((op) => op.status !== 'running');
    const limit = now().getTime() - keepMs;
    finished.sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
    finished.forEach((op, index) => {
      if (index >= keepFinished || Date.parse(op.finishedAt ?? '') < limit) {
        all.delete(op.id);
        done.delete(op.id);
      }
    });
  }

  function list(): Operation[] {
    prune();
    return [...all.values()]
      .sort((a, b) => {
        if ((a.status === 'running') !== (b.status === 'running')) return a.status === 'running' ? -1 : 1;
        return b.startedAt.localeCompare(a.startedAt);
      })
      .map(copy);
  }

  return {
    start<T>(spec: OperationSpec<T>): StartedOperation {
      const runningId = running.get(spec.key);
      const current = runningId === undefined ? undefined : all.get(runningId);
      if (current) return { operation: copy(current), existing: true };
      let id = newId();
      while (all.has(id)) id = newId();
      const operation: Operation = {
        id,
        key: spec.key,
        kind: spec.kind,
        title: spec.title,
        scope: { ...spec.scope },
        status: 'running',
        progress: null,
        startedAt: now().toISOString(),
        finishedAt: null,
      };
      all.set(id, operation);
      running.set(spec.key, id);
      const handle: OperationHandle = {
        id,
        progress: (note) => {
          if (operation.status === 'running') operation.progress = note;
        },
      };
      const finished = (async (): Promise<Operation> => {
        try {
          operation.result = await spec.run(handle);
          operation.status = 'succeeded';
        } catch (error) {
          operation.error = toOperationError(error);
          operation.status = 'failed';
        }
        operation.progress = null;
        operation.finishedAt = now().toISOString();
        if (running.get(spec.key) === id) running.delete(spec.key);
        try {
          await spec.onFinish?.(copy(operation));
        } catch {
          // The journal of an operation must not change its outcome.
        }
        prune();
        return copy(operation);
      })();
      done.set(id, finished);
      return { operation: copy(operation), existing: false };
    },
    get(id) {
      const operation = all.get(id);
      return operation ? copy(operation) : undefined;
    },
    active(key) {
      const id = running.get(key);
      const operation = id === undefined ? undefined : all.get(id);
      return operation ? copy(operation) : undefined;
    },
    list,
    wait(id) {
      const pending = done.get(id);
      if (!pending) return Promise.reject(new Error(`Unknown operation: ${id}`));
      return pending;
    },
    section: () => ({ operations: list() }),
  };
}
