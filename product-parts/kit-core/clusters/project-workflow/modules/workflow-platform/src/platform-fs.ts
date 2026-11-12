import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { WorkflowError } from "./workflow-error.js";

const RETRYABLE_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);
const RENAME_ATTEMPTS = 5;
const RENAME_BASE_DELAY_MS = 20;
const DEFAULT_LOCK_STALE_MS = 10 * 60 * 1000;
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));

export interface AtomicWriteOptions {
  mode?: number;
}

export interface FileLockOptions {
  staleMs?: number;
}

export class WorkflowLockError extends WorkflowError {
  constructor(message: string) {
    super(
      "LOCKED",
      message,
      {},
      "Wait for the running workflow operation to finish."
    );
  }
}

function sleepSync(milliseconds: number): void {
  Atomics.wait(sleepBuffer, 0, 0, milliseconds);
}

function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
}

function renameWithRetry(from: string, to: string): void {
  for (let attempt = 1; ; attempt += 1) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      if (
        !RETRYABLE_CODES.has(errorCode(error)) ||
        attempt >= RENAME_ATTEMPTS
      ) {
        throw error;
      }
      sleepSync(RENAME_BASE_DELAY_MS * attempt);
    }
  }
}

/** Writes through a temporary sibling and a rename so readers never see partial files. */
export function atomicWriteFile(
  filePath: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions = {}
): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(
      temporary,
      data,
      options.mode === undefined ? {} : { mode: options.mode }
    );
    renameWithRetry(temporary, filePath);
  } finally {
    if (existsSync(temporary)) {
      rmSync(temporary, { force: true });
    }
  }
}

export function readTextIfExists(filePath: string): string | null {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === "EPERM";
  }
}

function lockIsStale(lockPath: string, staleMs: number): boolean {
  try {
    const owner = JSON.parse(readFileSync(lockPath, "utf8")) as {
      pid?: number;
    };
    const age = Date.now() - statSync(lockPath).mtimeMs;
    return (
      age > staleMs || typeof owner.pid !== "number" || !processAlive(owner.pid)
    );
  } catch {
    return true;
  }
}

function acquireLock(lockPath: string, staleMs: number): number {
  mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    return openSync(lockPath, "wx");
  } catch (error) {
    if (errorCode(error) !== "EEXIST") {
      throw error;
    }
    if (!lockIsStale(lockPath, staleMs)) {
      throw new WorkflowLockError("Another workflow operation is running.");
    }
    rmSync(lockPath, { force: true });
    return openSync(lockPath, "wx");
  }
}

/** Runs fn while holding an exclusive lock file; stale locks are reclaimed. */
export function withFileLock<T>(
  lockPath: string,
  fn: () => T,
  options: FileLockOptions = {}
): T {
  const descriptor = acquireLock(
    lockPath,
    options.staleMs ?? DEFAULT_LOCK_STALE_MS
  );
  try {
    writeSync(
      descriptor,
      JSON.stringify({ at: new Date().toISOString(), pid: process.pid })
    );
    return fn();
  } finally {
    closeSync(descriptor);
    rmSync(lockPath, { force: true });
  }
}
