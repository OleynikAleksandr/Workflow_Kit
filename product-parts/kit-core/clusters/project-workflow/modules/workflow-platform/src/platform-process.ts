import { type SpawnSyncReturns, spawn, spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import path from "node:path";
import type { WorkflowPlatform } from "./platform-paths.js";

export interface ProcessRequest {
  args: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  executable: string;
  input?: string;
  timeoutMs?: number;
}

export interface ProcessResult {
  errorMessage: string | null;
  status: number | null;
  stderr: string;
  stdout: string;
  timedOut: boolean;
}

export interface ProcessInvocation {
  args: string[];
  file: string;
  windowsVerbatimArguments: boolean;
}

const CMD_META_PATTERN = /([()\][%!^"`<>&|;, *?])/gu;
const QUOTE_WITH_BACKSLASHES_PATTERN = /(\\*)"/gu;
const TRAILING_BACKSLASHES_PATTERN = /(\\*)$/u;
const BATCH_EXTENSION_PATTERN = /\.(?:cmd|bat)$/iu;
const DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD";
const MAX_BUFFER = 64 * 1024 * 1024;

function pathEntries(
  env: NodeJS.ProcessEnv,
  platform: WorkflowPlatform
): string[] {
  const value = env.PATH ?? env.Path ?? "";
  return value.split(platform === "win32" ? ";" : ":").filter(Boolean);
}

function isExecutableFile(file: string, platform: WorkflowPlatform): boolean {
  try {
    if (!statSync(file).isFile()) {
      return false;
    }
    if (platform !== "win32") {
      accessSync(file, constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

/** Finds an executable on PATH (with PATHEXT on Windows); returns null when missing. */
export function resolveExecutable(
  name: string,
  env: NodeJS.ProcessEnv,
  platform: WorkflowPlatform
): string | null {
  const hasDirectory = name.includes("/") || name.includes("\\");
  const extensions =
    platform === "win32" && path.extname(name) === ""
      ? (env.PATHEXT ?? DEFAULT_PATHEXT)
          .toLowerCase()
          .split(";")
          .filter(Boolean)
      : [""];
  const directories = hasDirectory ? [""] : pathEntries(env, platform);
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate =
        directory === ""
          ? `${name}${extension}`
          : path.join(directory, `${name}${extension}`);
      if (isExecutableFile(candidate, platform)) {
        return candidate;
      }
    }
  }
  return null;
}

function escapeCmdArgument(value: string): string {
  const quoted = `"${value
    .replace(QUOTE_WITH_BACKSLASHES_PATTERN, '$1$1\\"')
    .replace(TRAILING_BACKSLASHES_PATTERN, "$1$1")}"`;
  // Batch shims re-parse their arguments, so metacharacters are escaped twice.
  return quoted
    .replace(CMD_META_PATTERN, "^$1")
    .replace(CMD_META_PATTERN, "^$1");
}

/**
 * Builds the spawn invocation. POSIX and Windows `.exe` run directly without a
 * shell; Windows `.cmd`/`.bat` shims run through `cmd.exe /d /s /c` with
 * escaped arguments.
 */
export function buildInvocation(
  resolvedExecutable: string,
  args: readonly string[],
  platform: WorkflowPlatform
): ProcessInvocation {
  if (
    platform !== "win32" ||
    !BATCH_EXTENSION_PATTERN.test(resolvedExecutable)
  ) {
    return {
      args: [...args],
      file: resolvedExecutable,
      windowsVerbatimArguments: false,
    };
  }
  const command = [
    resolvedExecutable.replace(CMD_META_PATTERN, "^$1"),
    ...args.map(escapeCmdArgument),
  ].join(" ");
  return {
    args: ["/d", "/s", "/c", `"${command}"`],
    file: "cmd.exe",
    windowsVerbatimArguments: true,
  };
}

function prepare(request: ProcessRequest, platform: WorkflowPlatform) {
  const env = request.env ?? process.env;
  const resolved =
    resolveExecutable(request.executable, env, platform) ??
    (existsSync(request.executable) ? request.executable : null);
  return {
    env,
    invocation: resolved
      ? buildInvocation(resolved, request.args, platform)
      : null,
  };
}

function missing(executable: string): ProcessResult {
  return {
    errorMessage: `Executable not found: ${executable}`,
    status: null,
    stderr: "",
    stdout: "",
    timedOut: false,
  };
}

function toResult(result: SpawnSyncReturns<string>): ProcessResult {
  const timedOut =
    (result.error as { code?: string } | undefined)?.code === "ETIMEDOUT";
  return {
    errorMessage: result.error ? result.error.message : null,
    status: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
    timedOut,
  };
}

/** Runs a process synchronously without a shell. */
export function runProcessSync(
  request: ProcessRequest,
  platform: WorkflowPlatform
): ProcessResult {
  const { env, invocation } = prepare(request, platform);
  if (!invocation) {
    return missing(request.executable);
  }
  return toResult(
    spawnSync(invocation.file, invocation.args, {
      cwd: request.cwd,
      encoding: "utf8",
      env,
      input: request.input,
      maxBuffer: MAX_BUFFER,
      timeout: request.timeoutMs,
      windowsHide: true,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    })
  );
}

/** Runs a process asynchronously without a shell; used by Core so its event loop never blocks. */
export function runProcessAsync(
  request: ProcessRequest,
  platform: WorkflowPlatform
): Promise<ProcessResult> {
  const { env, invocation } = prepare(request, platform);
  if (!invocation) {
    return Promise.resolve(missing(request.executable));
  }
  return new Promise((resolve) => {
    const child = spawn(invocation.file, invocation.args, {
      cwd: request.cwd,
      env,
      timeout: request.timeoutMs,
      windowsHide: true,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    });
    let stdout = "";
    let stderr = "";
    let errorMessage: string | null = null;
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      errorMessage = error.message;
    });
    child.on("close", (status, signal) => {
      resolve({
        errorMessage,
        status,
        stderr,
        stdout,
        timedOut: signal === "SIGTERM" && status === null,
      });
    });
    child.stdin.end(request.input ?? "");
  });
}
