import { execFile } from "node:child_process";
import { workflowPlatformFacade } from "../../workflow-platform/src/workflow-platform-facade.js";
import type { HostRuntime } from "./host-resolve.js";

/** Largest stdout or stderr a Kit command may produce. */
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const STDERR_TAIL_CHARS = 4000;

/** Git variables that would point a child git at the wrong repository. */
const GIT_LOCATION_VARIABLES = [
  "GIT_DIR",
  "GIT_INDEX_FILE",
  "GIT_PREFIX",
  "GIT_WORK_TREE",
] as const;

export interface KitCommandRequest {
  args: string[];
  bundle: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  runtime: HostRuntime;
  timeoutMs: number;
}

export interface KitSuccess<T> {
  command: string;
  ok: true;
  result: T;
}

export interface KitFailure {
  code: string;
  details?: unknown;
  message: string;
  nextAction: string | null;
  ok: false;
}

export type KitOutcome<T> = KitFailure | KitSuccess<T>;

/** A parsed stdout object before its shape is checked. */
interface RawEnvelope {
  code?: unknown;
  details?: unknown;
  message?: unknown;
  nextAction?: unknown;
  ok?: unknown;
}

function failure(code: string, message: string, details?: unknown): KitFailure {
  return { code, details, message, nextAction: null, ok: false };
}

function childEnvironment(request: KitCommandRequest): NodeJS.ProcessEnv {
  const env = workflowPlatformFacade.runtimeEnvironment(
    request.runtime.mode,
    request.env
  );
  for (const name of GIT_LOCATION_VARIABLES) {
    delete env[name];
  }
  return env;
}

/** Reads the JSON envelope a Kit command prints on stdout. */
function parseEnvelope<T>(
  stdout: string,
  stderr: string,
  exitCode: number | null
): KitOutcome<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return failure(
      "HOST_OUTPUT",
      `The Workflow Kit printed no JSON (exit ${exitCode}).`,
      { stderr: stderr.slice(-STDERR_TAIL_CHARS) }
    );
  }
  const envelope = (parsed ?? {}) as RawEnvelope;
  if (envelope.ok === true && exitCode === 0) {
    return parsed as KitSuccess<T>;
  }
  if (envelope.ok === false && typeof envelope.code === "string") {
    return {
      code: envelope.code,
      details: envelope.details,
      message:
        typeof envelope.message === "string" ? envelope.message : envelope.code,
      nextAction:
        typeof envelope.nextAction === "string" ? envelope.nextAction : null,
      ok: false,
    };
  }
  return failure(
    "HOST_OUTPUT",
    `Unexpected Workflow Kit output (exit ${exitCode}).`,
    { stderr: stderr.slice(-STDERR_TAIL_CHARS) }
  );
}

/**
 * Runs one Kit command as a child process without a shell and resolves
 * with its envelope. Spawn errors and timeouts become failures; the
 * promise never rejects.
 */
export function runKitCommand<T>(
  request: KitCommandRequest
): Promise<KitOutcome<T>> {
  return new Promise((resolve) => {
    execFile(
      request.runtime.executable,
      [request.bundle, ...request.args, "--format", "json"],
      {
        cwd: request.cwd,
        encoding: "utf8",
        env: childEnvironment(request),
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout: request.timeoutMs,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const spawnError = error as
          | (NodeJS.ErrnoException & { killed?: boolean })
          | null;
        if (spawnError?.killed) {
          resolve(
            failure(
              "HOST_TIMEOUT",
              `The Workflow Kit command did not finish in ${request.timeoutMs} ms.`,
              { args: request.args }
            )
          );
          return;
        }
        if (spawnError && typeof spawnError.code === "string") {
          resolve(
            failure(
              "HOST_SPAWN",
              `Cannot run the Workflow Kit: ${spawnError.message}`,
              { executable: request.runtime.executable }
            )
          );
          return;
        }
        const exitCode =
          spawnError && typeof spawnError.code === "number"
            ? spawnError.code
            : 0;
        resolve(parseEnvelope<T>(stdout, stderr, exitCode));
      }
    );
  });
}
