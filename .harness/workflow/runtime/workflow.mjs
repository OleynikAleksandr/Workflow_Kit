// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-cli.ts
import { readFileSync as readFileSync11, realpathSync as realpathSync4 } from "node:fs";
import path25 from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/platform-fs.ts
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
  writeSync
} from "node:fs";
import path from "node:path";

// product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/workflow-error.ts
var WorkflowError = class extends Error {
  code;
  details;
  nextAction;
  constructor(code, message, details = {}, nextAction = null) {
    super(message);
    this.code = code;
    this.details = details;
    this.nextAction = nextAction;
  }
};
function ensure(condition, code, message, details = {}, nextAction = null) {
  if (!condition) {
    throw new WorkflowError(code, message, details, nextAction);
  }
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/platform-fs.ts
var RETRYABLE_CODES = /* @__PURE__ */ new Set(["EPERM", "EBUSY", "EACCES"]);
var RENAME_ATTEMPTS = 5;
var RENAME_BASE_DELAY_MS = 20;
var DEFAULT_LOCK_STALE_MS = 10 * 60 * 1e3;
var sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
var WorkflowLockError = class extends WorkflowError {
  constructor(message) {
    super(
      "LOCKED",
      message,
      {},
      "Wait for the running workflow operation to finish."
    );
  }
};
function sleepSync(milliseconds) {
  Atomics.wait(sleepBuffer, 0, 0, milliseconds);
}
function errorCode(error2) {
  return typeof error2 === "object" && error2 !== null && "code" in error2 ? String(error2.code) : "";
}
function renameWithRetry(from, to) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      renameSync(from, to);
      return;
    } catch (error2) {
      if (!RETRYABLE_CODES.has(errorCode(error2)) || attempt >= RENAME_ATTEMPTS) {
        throw error2;
      }
      sleepSync(RENAME_BASE_DELAY_MS * attempt);
    }
  }
}
function atomicWriteFile(filePath, data, options = {}) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(
      temporary,
      data,
      options.mode === void 0 ? {} : { mode: options.mode }
    );
    renameWithRetry(temporary, filePath);
  } finally {
    if (existsSync(temporary)) {
      rmSync(temporary, { force: true });
    }
  }
}
function readTextIfExists(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
}
function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error2) {
    return errorCode(error2) === "EPERM";
  }
}
function lockIsStale(lockPath, staleMs) {
  try {
    const owner = JSON.parse(readFileSync(lockPath, "utf8"));
    const age = Date.now() - statSync(lockPath).mtimeMs;
    return age > staleMs || typeof owner.pid !== "number" || !processAlive(owner.pid);
  } catch {
    return true;
  }
}
function acquireLock(lockPath, staleMs) {
  mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    return openSync(lockPath, "wx");
  } catch (error2) {
    if (errorCode(error2) !== "EEXIST") {
      throw error2;
    }
    if (!lockIsStale(lockPath, staleMs)) {
      throw new WorkflowLockError("Another workflow operation is running.");
    }
    rmSync(lockPath, { force: true });
    return openSync(lockPath, "wx");
  }
}
function withFileLock(lockPath, fn, options = {}) {
  const descriptor = acquireLock(
    lockPath,
    options.staleMs ?? DEFAULT_LOCK_STALE_MS
  );
  try {
    writeSync(
      descriptor,
      JSON.stringify({ at: (/* @__PURE__ */ new Date()).toISOString(), pid: process.pid })
    );
    return fn();
  } finally {
    closeSync(descriptor);
    rmSync(lockPath, { force: true });
  }
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/platform-launchers.ts
var KIT_BUNDLE_PATH = ".harness/workflow/runtime/workflow.mjs";
var MISSING_RUNTIME_MESSAGE = "Workflow Kit needs Node.js 22+ (or open the project in Harness AI once).";
var VERSION_CHECK = "process.exit(Number(process.versions.node.split('.')[0])>=22?0:1)";
function posixLauncher() {
  return `#!/bin/sh
# Managed by Harness Workflow Kit. Do not edit.
set -eu
root=$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/.." && pwd))
kit="$root/${KIT_BUNDLE_PATH}"
try_runtime() {
  candidate=$1
  mode=$2
  shift 2
  [ -n "$candidate" ] && [ -x "$candidate" ] || return 1
  if [ "$mode" = electron ]; then
    ELECTRON_RUN_AS_NODE=1 "$candidate" -e "${VERSION_CHECK}" >/dev/null 2>&1 || return 1
    ELECTRON_RUN_AS_NODE=1 exec "$candidate" "$kit" "$@"
  fi
  env -u ELECTRON_RUN_AS_NODE "$candidate" -e "${VERSION_CHECK}" >/dev/null 2>&1 || return 1
  exec env -u ELECTRON_RUN_AS_NODE "$candidate" "$kit" "$@"
}
if [ -n "\${HARNESS_WORKFLOW_NODE:-}" ]; then
  try_runtime "$HARNESS_WORKFLOW_NODE" node "$@" || true
fi
runtime_file="$root/.harness/workflow/local/runtime"
if [ -f "$runtime_file" ]; then
  try_runtime "$(sed -n 1p "$runtime_file")" "$(sed -n 2p "$runtime_file")" "$@" || true
fi
try_runtime "$(command -v node 2>/dev/null || true)" node "$@" || true
for candidate in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
  try_runtime "$candidate" node "$@" || true
done
echo "${MISSING_RUNTIME_MESSAGE}" >&2
exit 127
`;
}
function powershellLauncher() {
  return `# Managed by Harness Workflow Kit. Do not edit.
$ErrorActionPreference = 'Stop'
$root = (& git rev-parse --show-toplevel 2>$null)
if (-not $root) { $root = Split-Path -Parent $PSScriptRoot }
$kit = Join-Path $root '${KIT_BUNDLE_PATH}'
function Test-Runtime([string]$Path, [string]$Mode) {
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return $false }
  if ($Mode -eq 'electron') { $env:ELECTRON_RUN_AS_NODE = '1' } else { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
  & $Path -e "${VERSION_CHECK}" 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}
$candidates = @()
if ($env:HARNESS_WORKFLOW_NODE) { $candidates += ,@($env:HARNESS_WORKFLOW_NODE, 'node') }
$runtimeFile = Join-Path $root '.harness/workflow/local/runtime'
if (Test-Path -LiteralPath $runtimeFile) {
  $lines = @(Get-Content -LiteralPath $runtimeFile)
  $mode = if ($lines.Count -gt 1) { $lines[1] } else { 'node' }
  $candidates += ,@($lines[0], $mode)
}
$onPath = Get-Command node -ErrorAction SilentlyContinue
if ($onPath) { $candidates += ,@($onPath.Source, 'node') }
$candidates += ,@((Join-Path $env:ProgramFiles 'nodejs/node.exe'), 'node')
foreach ($candidate in $candidates) {
  if (Test-Runtime $candidate[0] $candidate[1]) {
    & $candidate[0] $kit @args
    exit $LASTEXITCODE
  }
}
[Console]::Error.WriteLine('${MISSING_RUNTIME_MESSAGE}')
exit 127
`;
}
function cmdLauncher() {
  return [
    "@echo off",
    "rem Managed by Harness Workflow Kit. Do not edit.",
    'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0workflow.ps1" %*',
    "exit /b %ERRORLEVEL%",
    ""
  ].join("\r\n");
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/platform-paths.ts
import path2 from "node:path";
var BACKSLASH_PATTERN = /\\/gu;
var DRIVE_LETTER_PATTERN = /^[A-Za-z]:/u;
var DUPLICATE_SLASH_PATTERN = /\/{2,}/gu;
var TRAILING_SLASH_PATTERN = /\/+$/u;
var LEADING_DOT_SLASH_PATTERN = /^(?:\.\/)+/u;
var WorkflowPathError = class extends WorkflowError {
  constructor(message, offendingPath) {
    super("UNSAFE_PATH", message, { path: offendingPath });
  }
};
function currentWorkflowPlatform(platform) {
  const current = platform ?? process.platform;
  if (current === "win32" || current === "darwin") {
    return current;
  }
  return "linux";
}
function isCaseInsensitivePlatform(platform) {
  return platform === "win32" || platform === "darwin";
}
function toPosixPath(value) {
  return value.replace(BACKSLASH_PATTERN, "/");
}
function normalizeRelativePath(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new WorkflowPathError(
      "Path must be a non-empty string.",
      String(value)
    );
  }
  const posix = toPosixPath(value.trim()).replace(DUPLICATE_SLASH_PATTERN, "/").replace(LEADING_DOT_SLASH_PATTERN, "").replace(TRAILING_SLASH_PATTERN, "");
  if (posix.startsWith("/") || DRIVE_LETTER_PATTERN.test(posix)) {
    throw new WorkflowPathError("Path must be relative to the project.", value);
  }
  const segments = posix.split("/");
  if (segments.some(
    (segment) => segment === ".." || segment === "" || segment === "."
  )) {
    throw new WorkflowPathError("Path must stay inside the project.", value);
  }
  return posix;
}
function resolveInside(root, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const resolved = path2.resolve(root, ...normalized.split("/"));
  const relative = path2.relative(path2.resolve(root), resolved);
  if (relative.startsWith("..") || path2.isAbsolute(relative)) {
    throw new WorkflowPathError("Path escapes the project root.", relativePath);
  }
  return resolved;
}
function relativeFromRoot(root, absolutePath) {
  const relative = path2.relative(
    path2.resolve(root),
    path2.resolve(absolutePath)
  );
  if (relative === "" || relative.startsWith("..") || path2.isAbsolute(relative)) {
    throw new WorkflowPathError(
      "Path is not inside the project root.",
      absolutePath
    );
  }
  return normalizeRelativePath(relative);
}
function samePath(left, right, platform) {
  const a = toPosixPath(left).replace(TRAILING_SLASH_PATTERN, "");
  const b = toPosixPath(right).replace(TRAILING_SLASH_PATTERN, "");
  return isCaseInsensitivePlatform(platform) ? a.toLowerCase() === b.toLowerCase() : a === b;
}
function isWithin(relativePath, prefix) {
  const value = normalizeRelativePath(relativePath);
  const base = normalizeRelativePath(prefix);
  return value === base || value.startsWith(`${base}/`);
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/platform-process.ts
import { spawn, spawnSync } from "node:child_process";
import { accessSync, constants, existsSync as existsSync2, statSync as statSync2 } from "node:fs";
import path3 from "node:path";
var CMD_META_PATTERN = /([()\][%!^"`<>&|;, *?])/gu;
var QUOTE_WITH_BACKSLASHES_PATTERN = /(\\*)"/gu;
var TRAILING_BACKSLASHES_PATTERN = /(\\*)$/u;
var BATCH_EXTENSION_PATTERN = /\.(?:cmd|bat)$/iu;
var DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD";
var MAX_BUFFER = 64 * 1024 * 1024;
function pathEntries(env, platform) {
  const value = env.PATH ?? env.Path ?? "";
  return value.split(platform === "win32" ? ";" : ":").filter(Boolean);
}
function isExecutableFile(file4, platform) {
  try {
    if (!statSync2(file4).isFile()) {
      return false;
    }
    if (platform !== "win32") {
      accessSync(file4, constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}
function resolveExecutable(name, env, platform) {
  const hasDirectory = name.includes("/") || name.includes("\\");
  const extensions = platform === "win32" && path3.extname(name) === "" ? (env.PATHEXT ?? DEFAULT_PATHEXT).toLowerCase().split(";").filter(Boolean) : [""];
  const directories = hasDirectory ? [""] : pathEntries(env, platform);
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = directory === "" ? `${name}${extension}` : path3.join(directory, `${name}${extension}`);
      if (isExecutableFile(candidate, platform)) {
        return candidate;
      }
    }
  }
  return null;
}
function escapeCmdArgument(value) {
  const quoted = `"${value.replace(QUOTE_WITH_BACKSLASHES_PATTERN, '$1$1\\"').replace(TRAILING_BACKSLASHES_PATTERN, "$1$1")}"`;
  return quoted.replace(CMD_META_PATTERN, "^$1").replace(CMD_META_PATTERN, "^$1");
}
function buildInvocation(resolvedExecutable, args, platform) {
  if (platform !== "win32" || !BATCH_EXTENSION_PATTERN.test(resolvedExecutable)) {
    return {
      args: [...args],
      file: resolvedExecutable,
      windowsVerbatimArguments: false
    };
  }
  const command = [
    resolvedExecutable.replace(CMD_META_PATTERN, "^$1"),
    ...args.map(escapeCmdArgument)
  ].join(" ");
  return {
    args: ["/d", "/s", "/c", `"${command}"`],
    file: "cmd.exe",
    windowsVerbatimArguments: true
  };
}
function prepare(request, platform) {
  const env = request.env ?? process.env;
  const resolved = resolveExecutable(request.executable, env, platform) ?? (existsSync2(request.executable) ? request.executable : null);
  return {
    env,
    invocation: resolved ? buildInvocation(resolved, request.args, platform) : null
  };
}
function missing(executable) {
  return {
    errorMessage: `Executable not found: ${executable}`,
    status: null,
    stderr: "",
    stdout: "",
    timedOut: false
  };
}
function toResult(result2) {
  const timedOut = result2.error?.code === "ETIMEDOUT";
  return {
    errorMessage: result2.error ? result2.error.message : null,
    status: result2.status,
    stderr: result2.stderr ?? "",
    stdout: result2.stdout ?? "",
    timedOut
  };
}
function runProcessSync(request, platform) {
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
      windowsVerbatimArguments: invocation.windowsVerbatimArguments
    })
  );
}
function runProcessAsync(request, platform) {
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
      windowsVerbatimArguments: invocation.windowsVerbatimArguments
    });
    let stdout = "";
    let stderr = "";
    let errorMessage = null;
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error2) => {
      errorMessage = error2.message;
    });
    child.on("close", (status, signal) => {
      resolve({
        errorMessage,
        status,
        stderr,
        stdout,
        timedOut: signal === "SIGTERM" && status === null
      });
    });
    child.stdin.end(request.input ?? "");
  });
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/platform-runtime.ts
import path4 from "node:path";
var MINIMUM_NODE_MAJOR = 22;
var RUNTIME_FILE = ".harness/workflow/local/runtime";
var VERSION_SCRIPT = "process.stdout.write(process.versions.node)";
var LINE_SPLIT_PATTERN = /\r?\n/u;
var OS_NODE_PATHS = {
  darwin: ["/opt/homebrew/bin/node", "/usr/local/bin/node"],
  linux: ["/usr/local/bin/node", "/usr/bin/node"],
  win32: ["C:/Program Files/nodejs/node.exe"]
};
function runtimeEnvironment(mode, base) {
  const { ELECTRON_RUN_AS_NODE: _removed, ...rest } = base;
  return mode === "electron" ? { ...rest, ELECTRON_RUN_AS_NODE: "1" } : rest;
}
function formatRuntimeFile(executable, mode) {
  return `${executable.replaceAll("\\", "/")}
${mode}
`;
}
function parseRuntimeFile(text3) {
  const [executable, mode] = text3.split(LINE_SPLIT_PATTERN).map((line) => line.trim());
  if (!executable) {
    return null;
  }
  return { executable, mode: mode === "electron" ? "electron" : "node" };
}
function runtimeCandidates(projectRoot2, env, platform) {
  const candidates = [];
  if (env.HARNESS_WORKFLOW_NODE) {
    candidates.push({
      executable: env.HARNESS_WORKFLOW_NODE,
      mode: "node",
      source: "env"
    });
  }
  const recorded = projectRoot2 ? readTextIfExists(path4.join(projectRoot2, ...RUNTIME_FILE.split("/"))) : null;
  const parsed = recorded ? parseRuntimeFile(recorded) : null;
  if (parsed) {
    candidates.push({ ...parsed, source: "runtime-file" });
  }
  const onPath = resolveExecutable("node", env, platform);
  if (onPath) {
    candidates.push({ executable: onPath, mode: "node", source: "path" });
  }
  for (const executable of OS_NODE_PATHS[platform]) {
    candidates.push({ executable, mode: "node", source: "os" });
  }
  return candidates;
}
function probeRuntimeVersion(candidate, platform) {
  const result2 = runProcessSync(
    {
      args: ["-e", VERSION_SCRIPT],
      env: runtimeEnvironment(candidate.mode, process.env),
      executable: candidate.executable,
      timeoutMs: 15e3
    },
    platform
  );
  return result2.status === 0 && result2.stdout.trim() ? result2.stdout.trim() : null;
}
function satisfiesMinimum(version) {
  return Number(version.split(".")[0]) >= MINIMUM_NODE_MAJOR;
}
function resolveRuntime(candidates, probe) {
  for (const candidate of candidates) {
    const version = probe(candidate);
    if (version && satisfiesMinimum(version)) {
      return { ...candidate, version };
    }
  }
  return null;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/workflow-platform-facade.ts
var WorkflowPlatformFacade = class {
  platform;
  constructor(platform = currentWorkflowPlatform()) {
    this.platform = platform;
  }
  toPosix(value) {
    return toPosixPath(value);
  }
  normalizeRelative(value) {
    return normalizeRelativePath(value);
  }
  resolveInside(root, relativePath) {
    return resolveInside(root, relativePath);
  }
  relativeFromRoot(root, absolutePath) {
    return relativeFromRoot(root, absolutePath);
  }
  samePath(left, right) {
    return samePath(left, right, this.platform);
  }
  isWithin(relativePath, prefix) {
    return isWithin(relativePath, prefix);
  }
  writeFileAtomic(filePath, data, options) {
    atomicWriteFile(filePath, data, options);
  }
  readTextIfExists(filePath) {
    return readTextIfExists(filePath);
  }
  withLock(lockPath, fn, options) {
    return withFileLock(lockPath, fn, options);
  }
  findExecutable(name, env = process.env) {
    return resolveExecutable(name, env, this.platform);
  }
  /** Exposes the spawn plan (file, args, verbatim flag) for diagnostics and tests. */
  describeInvocation(resolvedExecutable, args) {
    return buildInvocation(resolvedExecutable, args, this.platform);
  }
  run(request) {
    return runProcessSync(request, this.platform);
  }
  runAsync(request) {
    return runProcessAsync(request, this.platform);
  }
  /** Resolves a Node 22+ runtime for a project; `probe` is injectable for tests. */
  resolveRuntime(projectRoot2, env = process.env, probe) {
    const check2 = probe ?? ((candidate) => probeRuntimeVersion(candidate, this.platform));
    return resolveRuntime(
      runtimeCandidates(projectRoot2, env, this.platform),
      check2
    );
  }
  runtimeEnvironment(mode, base = process.env) {
    return runtimeEnvironment(mode, base);
  }
  formatRuntimeFile(executable, mode) {
    return formatRuntimeFile(executable, mode);
  }
  parseRuntimeFile(text3) {
    return parseRuntimeFile(text3);
  }
  launchers() {
    return {
      cmd: cmdLauncher(),
      posix: posixLauncher(),
      powershell: powershellLauncher()
    };
  }
};
var workflowPlatformFacade = new WorkflowPlatformFacade();

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-args.ts
import { readFileSync as readFileSync2 } from "node:fs";
import path5 from "node:path";
var BOOLEAN_FLAGS = /* @__PURE__ */ new Set([
  "help",
  "fix",
  "force",
  "dry-run",
  "global",
  "list",
  "off",
  "on",
  "update"
]);
function parseArgs(argv) {
  const flags = /* @__PURE__ */ new Map();
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (arg === "-h") {
      flags.set("help", true);
    } else if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const equals = body.indexOf("=");
      if (equals !== -1) {
        flags.set(body.slice(0, equals), body.slice(equals + 1));
      } else if (BOOLEAN_FLAGS.has(body)) {
        flags.set(body, true);
      } else {
        const value = argv[index + 1];
        ensure(
          value !== void 0 && !value.startsWith("--"),
          "USAGE",
          `--${body} needs a value.`
        );
        flags.set(body, value);
        index += 1;
      }
    } else {
      positionals.push(arg);
    }
  }
  const [command = null, ...rest] = positionals;
  return { command, flags, positionals: rest };
}
function flag(args, name) {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : void 0;
}
function requiredFlag(args, name) {
  const value = flag(args, name);
  ensure(
    value !== void 0 && value.trim() !== "",
    "USAGE",
    `--${name} is required.`
  );
  return value;
}
function positional(args, index, label) {
  const value = args.positionals[index];
  ensure(value !== void 0 && value !== "", "USAGE", `${label} is required.`);
  return value;
}
function integerFlag(args, name) {
  const value = flag(args, name);
  if (value === void 0) {
    return;
  }
  const parsed = Number(value);
  ensure(
    Number.isSafeInteger(parsed),
    "USAGE",
    `--${name} must be an integer.`
  );
  return parsed;
}
function readJsonFile(cwd, file4) {
  let text3;
  try {
    text3 = readFileSync2(path5.resolve(cwd, file4), "utf8");
  } catch (cause) {
    throw new WorkflowError(
      "INPUT_UNREADABLE",
      `Cannot read ${file4}: ${cause.message}`
    );
  }
  try {
    return JSON.parse(text3);
  } catch (cause) {
    throw new WorkflowError(
      "INPUT_JSON",
      `${file4} is not valid JSON: ${cause.message}`
    );
  }
}
function listFlag(args, name) {
  const value = flag(args, name);
  if (value === void 0) {
    return;
  }
  if (value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      ensure(
        Array.isArray(parsed) && parsed.every((item) => typeof item === "string"),
        "USAGE",
        `--${name} must list strings.`
      );
      return parsed;
    } catch (cause) {
      if (cause instanceof WorkflowError) {
        throw cause;
      }
      throw new WorkflowError("USAGE", `--${name} is not a valid JSON list.`);
    }
  }
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-assignment.ts
function nextText(value) {
  const result2 = value;
  if (result2.idle !== null) {
    const why = result2.idle === "NOT_ORCHESTRATED" ? "the scope is not orchestrated" : "the scope is not active";
    return `assignments: none (${result2.idle}): ${why}.
`;
  }
  const lines = [
    `assignments: scope ${result2.scopeId ?? "NONE"}, ${result2.active.length} of ${result2.maxWorkers} workers active`
  ];
  for (const record of result2.active) {
    lines.push(`active: ${record.taskId} ${record.id} ${record.status}`);
  }
  for (const task2 of result2.ready) {
    lines.push(
      `ready: ${task2.id} \u2014 ${task2.title} (${task2.parallelSafe ? "parallel" : "sequential"})`
    );
  }
  for (const item of result2.blocked) {
    lines.push(
      `blocked: ${item.taskId} ${item.code} (waits for ${item.blockedBy.join(", ") || "none"})`
    );
  }
  const first = result2.ready[0];
  lines.push(
    first ? `next: scripts/workflow assignment:create --task ${first.id}` : "next: nothing to assign now; wait for the active assignments."
  );
  return `${lines.join("\n")}
`;
}
function createText(value) {
  const result2 = value;
  const record = result2.assignment;
  return [
    `assignment: ${record.id} for ${record.taskId}, base ${record.baseCommit.slice(0, 12)}, ${result2.created ? "created" : "already assigned"}`,
    "next: start a Claude subagent with isolation worktree and give it this brief:",
    "",
    result2.brief
  ].join("\n");
}
function attachText(value) {
  const result2 = value;
  const record = result2.assignment;
  return [
    `assignment: ${record.id} ${result2.attached ? "attached" : "already attached"}, task ${record.taskId}, ${record.status}`,
    `worktree: ${record.worktree ?? "none"} (${record.branch ?? "detached"})`,
    `main: ${result2.worktree.mainRoot}`,
    ...result2.planCommit ? [`plan commit: ${result2.planCommit.slice(0, 12)}`] : [],
    record.status === "NEEDS_SETUP" ? "next: scripts/workflow assignment:setup (the worktree lacks the dependencies its checks need)" : `next: scripts/workflow task:start ${record.taskId}`,
    ""
  ].join("\n");
}
function setupText(value) {
  const result2 = value;
  const record = result2.assignment;
  const setup = record.setup;
  return [
    `assignment: ${record.id} ${record.status}, ${result2.ran && setup ? `set up with ${setup.command} (lock ${setup.lockHash.slice(0, 12)})` : "no dependencies to install"}`,
    ...record.status === "READY" ? [`next: scripts/workflow task:start ${record.taskId}`] : [],
    ""
  ].join("\n");
}
function cleanupText(value) {
  const result2 = value;
  if (result2.assignments.length === 0) {
    return "cleanup: nothing to clean up.\n";
  }
  const lines = result2.assignments.map((record) => {
    const cleanup = record.cleanup;
    return cleanup?.status === "PENDING" ? `cleanup: ${record.id} PENDING \u2014 ${cleanup.reason}` : `cleanup: ${record.id} DONE`;
  });
  if (result2.assignments.some((record) => record.cleanup?.status === "PENDING")) {
    lines.push(
      "next: resolve the reason (for example commit or remove the changes in the worktree), then scripts/workflow assignment:cleanup"
    );
  }
  return `${lines.join("\n")}
`;
}
function cancelText(value) {
  const result2 = value;
  const record = result2.assignment;
  const task2 = result2.task;
  return [
    `assignment: ${record.id} cancelled, task ${record.taskId} ${task2?.status ?? "not in the plan"}`,
    `worktree: ${result2.worktree === null ? "none" : `removed ${result2.worktree}`}`,
    result2.branch === null || result2.branchTip === null ? "branch: none" : `branch: deleted ${result2.branch} at ${result2.branchTip.slice(0, 12)} (restore: git branch ${result2.branch} ${result2.branchTip})`,
    task2?.status === "TODO" ? `next: scripts/workflow assignment:create --task ${task2.id}` : "next: scripts/workflow assignment:next",
    ""
  ].join("\n");
}
function statusText(value) {
  const result2 = value;
  const task2 = result2.task;
  return [
    `assignment: ${result2.worktree.id} (${result2.assignment?.status ?? "record missing in main"})`,
    `scope: ${result2.scopeId ?? "NONE"}, base ${result2.worktree.baseCommit.slice(0, 12)}, head ${result2.head?.slice(0, 12) ?? "none"}`,
    task2 ? `task: ${task2.id} ${task2.status} \u2014 ${task2.title}` : `task: ${result2.worktree.taskId} missing`,
    ...result2.assignment?.sourceCommit ? [`source: ${result2.assignment.sourceCommit}`] : [],
    ""
  ].join("\n");
}
var EXECUTOR_COMMANDS = /* @__PURE__ */ new Set([
  "assignment:attach",
  "assignment:setup",
  "assignment:status",
  "commit",
  "context",
  "recover",
  "repair",
  "schema",
  "show-task",
  "status",
  "task:block",
  "task:start",
  "validate"
]);
function ensureExecutorCommand(kit, root, command) {
  if (EXECUTOR_COMMANDS.has(command)) {
    return;
  }
  const executor = kit.executorAssignment(root);
  ensure(
    executor === null,
    "ASSIGNMENT_READ_ONLY",
    `${command} is not available in the executor worktree of ${executor?.id}.`,
    { allowed: [...EXECUTOR_COMMANDS] },
    "Run only your task: task:start, commit --task, status, recover, show-task, schema, context, repair, task:block, assignment:status, assignment:setup."
  );
}
var ASSIGNMENT_COMMANDS = {
  "assignment:attach": {
    run: ({ args, kit, root }) => kit.attachAssignment(root, positional(args, 0, "Assignment id")),
    text: attachText,
    usage: "assignment:attach <id>"
  },
  "assignment:cancel": {
    run: ({ args, kit, root }) => kit.cancelAssignment(
      root,
      requiredFlag(args, "id"),
      args.flags.get("force") === true
    ),
    text: cancelText,
    usage: "assignment:cancel --id <id> [--force]"
  },
  "assignment:cleanup": {
    run: ({ args, kit, root }) => kit.cleanupAssignments(root, flag(args, "id")),
    text: cleanupText,
    usage: "assignment:cleanup [--id <id>]"
  },
  "assignment:create": {
    run: ({ args, kit, root }) => kit.createAssignment(root, requiredFlag(args, "task")),
    text: createText,
    usage: "assignment:create --task <ID>"
  },
  "assignment:setup": {
    run: ({ args, kit, root }) => kit.setupAssignment(root, flag(args, "id")),
    text: setupText,
    usage: "assignment:setup [--id <id>]"
  },
  "assignment:status": {
    run: ({ kit, root }) => kit.assignmentStatus(root),
    text: statusText,
    usage: "assignment:status"
  },
  "assignment:next": {
    run: ({ kit, root }) => kit.nextAssignments(root),
    text: nextText,
    usage: "assignment:next"
  }
};

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-context.ts
import { readFileSync as readFileSync3, realpathSync, statSync as statSync3 } from "node:fs";
import path6 from "node:path";
var CONTEXT_BUDGET = 28e3;
var KIT_FOLDER = ".harness/workflow";
var H2 = /^##\s+(.+?)\s*#*\s*$/u;
var FENCE = /^\s*(```|~~~)/u;
var LIST_MORE = "narrow with `scripts/workflow context --list <folder>` (a subfolder)";
function bytesOf(text3) {
  return Buffer.byteLength(text3, "utf8");
}
function forbidden(request, reason) {
  return new WorkflowError(
    "CONTEXT_FORBIDDEN",
    `${request}: ${reason}.`,
    { path: request },
    "Ask only for text files of the project outside .harness/workflow/."
  );
}
function projectPath(root, request) {
  const relative = (base, target) => path6.relative(base, target).split(path6.sep).join("/");
  const inside = (value) => value !== ".." && !value.startsWith("../") && !path6.isAbsolute(value);
  const kitPath = (value) => {
    const lower = value.toLowerCase();
    return lower === KIT_FOLDER || lower.startsWith(`${KIT_FOLDER}/`);
  };
  const absolute2 = path6.resolve(root, request);
  const lexical = relative(path6.resolve(root), absolute2);
  let real2 = null;
  try {
    real2 = relative(realpathSync(root), realpathSync(absolute2));
  } catch {
  }
  const result2 = inside(lexical) ? lexical : real2;
  if (result2 === null || !inside(result2)) {
    throw forbidden(request, "the path is outside the project");
  }
  if (kitPath(result2)) {
    throw forbidden(request, "the Kit folder .harness/workflow/ is closed");
  }
  if (real2 !== null && !inside(real2)) {
    throw forbidden(request, "the path leads outside the project");
  }
  if (real2 !== null && kitPath(real2)) {
    throw forbidden(request, "the path leads into .harness/workflow/");
  }
  return result2 === "" ? "." : result2;
}
function readProjectText(root, request, file4) {
  const absolute2 = path6.resolve(root, file4);
  let isFile = false;
  try {
    isFile = statSync3(absolute2).isFile();
  } catch {
    throw new WorkflowError(
      "CONTEXT_MISSING",
      `${request}: the file does not exist.`,
      { path: file4 },
      "Run `scripts/workflow context --list` for the project documents."
    );
  }
  if (!isFile) {
    throw forbidden(
      request,
      "not a file (ask for files, list a folder with --list)"
    );
  }
  const data = readFileSync3(absolute2);
  if (data.includes(0)) {
    throw forbidden(request, "not a text file");
  }
  return data.toString("utf8");
}
function requested(recovery, root, requests) {
  return requests.map((request) => {
    const hash = request.indexOf("#");
    const target = hash === -1 ? request : request.slice(0, hash);
    const heading = hash === -1 ? "" : request.slice(hash + 1).trim();
    const file4 = projectPath(root, target);
    const text3 = readProjectText(root, request, file4);
    const section2 = heading ? recovery.section(text3, heading) : text3;
    ensure(
      section2 !== null,
      "CONTEXT_MISSING",
      `${file4} has no heading "${heading}".`,
      { heading, path: file4 },
      `Run \`scripts/workflow context --list ${path6.posix.dirname(file4)}\` for its headings.`
    );
    const body = section2.trimEnd();
    return {
      bytes: bytesOf(body),
      path: file4,
      text: body,
      ...heading ? { heading } : {}
    };
  });
}
function sections(item) {
  const lines = item.text.split("\n");
  const starts = [];
  let fenced = false;
  for (const [index, line] of lines.entries()) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    const match = fenced ? null : H2.exec(line);
    if (match?.[1]) {
      starts.push({ heading: match[1], index });
    }
  }
  if (starts.length === 0) {
    return null;
  }
  return starts.map((start, position) => {
    const from = position === 0 ? 0 : start.index;
    const to = starts[position + 1]?.index ?? lines.length;
    const text3 = lines.slice(from, to).join("\n").trimEnd();
    return {
      bytes: bytesOf(text3),
      heading: start.heading,
      path: item.path,
      text: text3
    };
  });
}
function attribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
function block(item) {
  const heading = item.heading ? ` heading="${attribute(item.heading)}"` : "";
  return `<document path="${attribute(item.path)}"${heading} bytes="${item.bytes}">
${item.text}
</document>
`;
}
function leftOut(item, tooLarge = false) {
  return {
    bytes: item.bytes,
    path: item.path,
    ...item.heading ? { heading: item.heading } : {},
    ...tooLarge ? { tooLarge: true } : {}
  };
}
function leftOutLine(item) {
  const request = item.heading ? `${item.path}#${item.heading}` : item.path;
  return item.tooLarge ? `not included (larger than the ${CONTEXT_BUDGET}-byte budget, no ## sections): ${request} (${item.bytes} bytes)` : `not included (ask again): ${request} (${item.bytes} bytes)`;
}
function contextText(value) {
  const result2 = value;
  const parts = result2.documents.map(block);
  const tail3 = result2.notIncluded.map(leftOutLine);
  if (tail3.length > 0) {
    parts.push(`${tail3.join("\n")}
`);
  }
  return parts.length > 0 ? parts.join("\n") : "no documents\n";
}
function pack(items) {
  const result2 = { documents: [], notIncluded: [] };
  let used = 0;
  let full = false;
  const oversized = (item) => bytesOf(block(item)) > CONTEXT_BUDGET;
  const take = (item) => {
    const size = bytesOf(block(item)) + (result2.documents.length > 0 ? 1 : 0);
    if (full || used + size > CONTEXT_BUDGET) {
      full = true;
      return false;
    }
    result2.documents.push(item);
    used += size;
    return true;
  };
  for (const item of items) {
    const parts = !full && oversized(item) ? sections(item) : null;
    if (parts) {
      for (const part of parts) {
        if (!take(part)) {
          result2.notIncluded.push(leftOut(part, oversized(part)));
        }
      }
    } else if (!take(item)) {
      result2.notIncluded.push(
        leftOut(item, oversized(item) && sections(item) === null)
      );
    }
  }
  while (result2.documents.length > 0 && bytesOf(contextText(result2)) > CONTEXT_BUDGET) {
    const last = result2.documents.pop();
    result2.notIncluded.unshift(leftOut(last));
  }
  return result2;
}
function listDocuments(recovery, root, request) {
  let folder = null;
  if (request !== void 0) {
    const relative = projectPath(root, request);
    let isFolder = false;
    try {
      isFolder = statSync3(path6.resolve(root, relative)).isDirectory();
    } catch {
      throw new WorkflowError(
        "CONTEXT_MISSING",
        `${request}: the folder does not exist.`,
        { path: relative }
      );
    }
    if (!isFolder) {
      throw forbidden(request, "not a folder (ask for a file without --list)");
    }
    folder = relative === "." ? null : relative;
  }
  return {
    folder,
    ...recovery.documentsMap(root, {
      budget: CONTEXT_BUDGET,
      folder,
      more: LIST_MORE
    })
  };
}
function text(value) {
  if ("documents" in value) {
    return contextText(value);
  }
  const list = value;
  return list.entries.length > 0 ? `${list.text}
` : `no Markdown documents${list.folder ? ` under ${list.folder}` : ""}
`;
}
var CONTEXT_COMMANDS = {
  context: {
    defaultFormat: "text",
    run: ({ args, kit, root }) => {
      if (args.flags.get("list") === true) {
        ensure(
          args.positionals.length <= 1,
          "USAGE",
          "context --list takes at most one folder."
        );
        return listDocuments(kit.recovery, root, args.positionals[0]);
      }
      ensure(
        args.positionals.length > 0,
        "USAGE",
        "context needs at least one <path>[#Heading], or --list [<folder>]."
      );
      return pack(requested(kit.recovery, root, args.positionals));
    },
    text,
    usage: "context <path>[#Heading] \u2026 | context --list [<folder>]"
  }
};

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-execution.ts
var STRATEGIES = /* @__PURE__ */ new Set(["orchestrated", "sequential"]);
var OPTIONS = /* @__PURE__ */ new Set(["orchestrated", "refine", "sequential"]);
var GENERATION_PATTERN = /^[1-9]\d*$/u;
function choice(args, name, allowed) {
  const value = requiredFlag(args, name);
  ensure(
    allowed.has(value),
    "USAGE",
    `--${name} is ${[...allowed].join(", ")}.`
  );
  return value;
}
function generation(args) {
  const value = requiredFlag(args, "generation");
  ensure(
    GENERATION_PATTERN.test(value),
    "USAGE",
    "--generation must be a positive integer."
  );
  return Number(value);
}
function proposalText(value) {
  const result2 = value;
  const lines = [
    `proposal: generation ${result2.generation}, recommended ${result2.recommended}, parallel work ${result2.hasParallelWork ? "yes" : "no"}`,
    `reason: ${result2.reason}`,
    `options: ${result2.options.join(", ")}`
  ];
  lines.push(
    result2.autoChosen && result2.scope ? `scope: ${result2.scope.scopeId} created as sequential automatically (no parallel work after refining); tell the user and start the first task.` : "next: the user chooses the execution mode; end the turn."
  );
  return `${lines.join("\n")}
`;
}
function choiceText(value) {
  const result2 = value;
  if (result2.option === "refine") {
    return `choice: refine (generation ${result2.generation}); refine the specification with the user, then run scope:propose again.
`;
  }
  return `choice: ${result2.option} (generation ${result2.generation}); scope ${result2.scope?.scopeId ?? "NONE"} created at revision ${result2.scope?.revision ?? 0}.
`;
}
function proposalViewText(value) {
  const view = value;
  if (!view) {
    return "proposal: none\n";
  }
  const state = view.refining ? "refining" : "open";
  return `${[
    `proposal: generation ${view.generation} (${state}), recommended ${view.recommended}, parallel work ${view.hasParallelWork ? "yes" : "no"}`,
    `scope: ${view.scopeId ?? "NONE"}${view.objective ? ` \u2014 ${view.objective}` : ""}`,
    `reason: ${view.reason}`,
    `options: ${view.options.join(", ")}`
  ].join("\n")}
`;
}
var EXECUTION_COMMANDS = {
  "scope:choose": {
    run: ({ args, kit, root }) => kit.chooseScope(root, {
      generation: generation(args),
      note: requiredFlag(args, "note"),
      option: choice(args, "option", OPTIONS),
      session: requiredFlag(args, "session")
    }),
    text: choiceText,
    usage: `scope:choose --generation <N> --option sequential|orchestrated|refine --session <id> --note "<the user's choice>"`
  },
  "scope:proposal": {
    run: ({ kit, root }) => kit.proposalView(root),
    text: proposalViewText,
    usage: "scope:proposal"
  },
  "scope:propose": {
    run: ({ args, io, kit, root }) => kit.proposeScope(
      root,
      readJsonFile(io.cwd, requiredFlag(args, "input")),
      choice(args, "recommended", STRATEGIES),
      requiredFlag(args, "reason")
    ),
    text: proposalText,
    usage: 'scope:propose --input <file.json> --recommended sequential|orchestrated --reason "<why>"'
  }
};

// product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/workflow-git-facade.ts
import { randomUUID } from "node:crypto";

// product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-history.ts
var RECORD_SEPARATOR = "";
var FIELD_SEPARATOR = "\0";
var TRAILER_PATTERN = /^(Workflow-[A-Za-z-]+):\s*(.+)$/u;
var STATUS_PREFIX_LENGTH = 3;
var LEADING_NEWLINE_PATTERN = /^\n/u;
function parsePorcelain(output) {
  const entries2 = output.split(FIELD_SEPARATOR).filter(Boolean);
  const changes = {
    all: [],
    staged: [],
    unstaged: [],
    untracked: []
  };
  for (let index = 0; index < entries2.length; index += 1) {
    const entry = entries2[index] ?? "";
    const indexState = entry[0] ?? " ";
    const treeState = entry[1] ?? " ";
    const file4 = entry.slice(STATUS_PREFIX_LENGTH);
    if (indexState === "R" || indexState === "C") {
      const source = entries2[index + 1];
      index += 1;
      if (source) {
        changes.staged.push(source);
      }
    }
    if (indexState === "?") {
      changes.untracked.push(file4);
      continue;
    }
    if (indexState !== " ") {
      changes.staged.push(file4);
    }
    if (treeState !== " ") {
      changes.unstaged.push(file4);
    }
  }
  const unique = (values) => [...new Set(values)].sort();
  return {
    all: unique([...changes.staged, ...changes.unstaged, ...changes.untracked]),
    staged: unique(changes.staged),
    unstaged: unique(changes.unstaged),
    untracked: unique(changes.untracked)
  };
}
function parseTrailers(message) {
  const trailers = {};
  const paragraphs = message.trim().split("\n\n");
  const last = paragraphs.length > 1 ? paragraphs.at(-1) ?? "" : "";
  for (const line of last.split("\n")) {
    const match = TRAILER_PATTERN.exec(line.trim());
    if (match?.[1] && match[2]) {
      trailers[match[1]] = [...trailers[match[1]] ?? [], match[2].trim()];
    }
  }
  return trailers;
}
function readChanges(git, root) {
  return parsePorcelain(
    git.run(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout
  );
}
function readHistory(git, root, from, tip = "HEAD", options = {}) {
  const range = from ? `${from}..${tip}` : tip;
  const output = git.run(
    root,
    [
      "log",
      "--reverse",
      ...options.firstParent ? ["--first-parent"] : [],
      `--format=%H%x00%P%x00%B${RECORD_SEPARATOR}`,
      range
    ],
    { allowFailure: true }
  );
  if (output.status !== 0) {
    return [];
  }
  return output.stdout.split(RECORD_SEPARATOR).map((record) => record.replace(LEADING_NEWLINE_PATTERN, "")).filter((record) => record.trim() !== "").map((record) => {
    const [sha = "", parents = "", message = ""] = record.split(FIELD_SEPARATOR);
    return {
      message: message.trim(),
      parents: parents.split(" ").filter(Boolean),
      sha,
      subject: message.split("\n")[0]?.trim() ?? "",
      trailers: parseTrailers(message)
    };
  });
}
function readCommitPaths(git, root, sha) {
  return git.run(root, [
    "diff-tree",
    "--no-commit-id",
    "--name-only",
    "-r",
    "-z",
    "--root",
    sha
  ]).stdout.split(FIELD_SEPARATOR).filter(Boolean).sort();
}
function readDiffPaths(git, root, from, to) {
  return git.run(root, [
    "diff-tree",
    "-r",
    "--name-only",
    "--no-renames",
    "-z",
    from,
    to
  ]).stdout.split(FIELD_SEPARATOR).filter(Boolean).sort();
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-identity.ts
var PLACEHOLDER_NAMES = /* @__PURE__ */ new Set(["your name", "\u0432\u0430\u0448\u0435 \u0438\u043C\u044F"]);
var PLACEHOLDER_EMAILS = /* @__PURE__ */ new Set(["you@example.com"]);
var PLACEHOLDER_DOMAINS = /* @__PURE__ */ new Set(["example", "invalid", "localhost"]);
var IDENTITY_FIX_COMMANDS = 'Run once: `git config --global user.name "Your Real Name"` and `git config --global user.email "you@your-domain"`; then `scripts/workflow doctor --fix` applies it to the project.';
var QUOTES = /["'`\u2018\u2019\u201A\u201C\u201D\u201E\u00AB\u00BB\u2039\u203A]/u;
var ANGLE_BRACKETS = /[<>]/u;
var EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
function isPlaceholderDomain(domain) {
  return domain === "" || PLACEHOLDER_DOMAINS.has(domain) || domain.startsWith("example.") || domain.endsWith(".invalid");
}
function isPlaceholderIdentity(identity) {
  const name = identity.name.trim().toLowerCase();
  const email = identity.email.trim().toLowerCase();
  if (name === "" || email === "" || PLACEHOLDER_NAMES.has(name)) {
    return true;
  }
  if (PLACEHOLDER_EMAILS.has(email)) {
    return true;
  }
  const at = email.lastIndexOf("@");
  return at < 0 || isPlaceholderDomain(email.slice(at + 1));
}
function identityProblem(identity) {
  const name = identity.name.trim();
  const email = identity.email.trim();
  if (name === "" || QUOTES.test(name) || ANGLE_BRACKETS.test(name)) {
    return {
      code: "GIT_IDENTITY_INVALID",
      field: "name",
      message: "The git name must not be empty and must not contain quotes or angle brackets."
    };
  }
  if (QUOTES.test(email) || ANGLE_BRACKETS.test(email) || !EMAIL_SHAPE.test(email)) {
    return {
      code: "GIT_IDENTITY_INVALID",
      field: "email",
      message: "The git email must look like name@domain.tld, without spaces, quotes or angle brackets."
    };
  }
  if (PLACEHOLDER_NAMES.has(name.toLowerCase())) {
    return {
      code: "GIT_IDENTITY_PLACEHOLDER",
      field: "name",
      message: `"${name}" is a placeholder git name; use your real name.`
    };
  }
  if (isPlaceholderIdentity({ email, name })) {
    return {
      code: "GIT_IDENTITY_PLACEHOLDER",
      field: "email",
      message: `${email} is a placeholder git email; use your real address.`
    };
  }
  return null;
}
function isUsableIdentity(identity) {
  return identityProblem(identity) === null;
}
function validateIdentity(identity) {
  const problem = identityProblem(identity);
  if (problem) {
    throw new WorkflowError(problem.code, problem.message, {
      field: problem.field
    });
  }
  return { email: identity.email.trim(), name: identity.name.trim() };
}
function identityRequiredError(configured, suffix = "") {
  return new WorkflowError(
    "GIT_IDENTITY_REQUIRED",
    `The Workflow Kit needs a real git name and email for its commits; ${configured ? "the configured one is a placeholder or invalid" : "none is set"}.${suffix}`,
    { placeholder: configured },
    IDENTITY_FIX_COMMANDS
  );
}
function readScopedIdentity(git, root, scope) {
  const value = (key) => git.run(root, ["config", `--${scope}`, "--get", key], { allowFailure: true }).stdout.trim();
  const name = value("user.name");
  const email = value("user.email");
  return name && email ? { email, name } : null;
}
function resolveIdentity(git, root) {
  for (const source of ["local", "global"]) {
    const identity = readScopedIdentity(git, root, source);
    if (identity && isUsableIdentity(identity)) {
      return { ...identity, source };
    }
  }
  return null;
}
function writeLocalIdentity(git, root, identity) {
  const valid = validateIdentity(identity);
  git.run(root, ["config", "--local", "user.name", valid.name]);
  git.run(root, ["config", "--local", "user.email", valid.email]);
}
function writeGlobalIdentity(git, cwd, identity) {
  const valid = validateIdentity(identity);
  git.run(cwd, ["config", "--global", "user.name", valid.name]);
  git.run(cwd, ["config", "--global", "user.email", valid.email]);
  return valid;
}
function requireCommitIdentity(git, root) {
  const identity = readScopedIdentity(git, root, "local");
  if (identity && isUsableIdentity(identity)) {
    return identity;
  }
  throw identityRequiredError(identity !== null);
}
function identityEnv(identity) {
  return {
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_AUTHOR_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name
  };
}
function identityArgs(identity) {
  return [
    "-c",
    `user.name=${identity.name}`,
    "-c",
    `user.email=${identity.email}`
  ];
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-journal.ts
import { createHash } from "node:crypto";
import { existsSync as existsSync3, readFileSync as readFileSync4, rmSync as rmSync2 } from "node:fs";
import path7 from "node:path";
var LOCAL_DIR = ".harness/workflow/local";
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function localPath(root, ...parts) {
  return path7.join(root, ...LOCAL_DIR.split("/"), ...parts);
}
function readJournal(root) {
  const file4 = localPath(root, "transaction.json");
  return existsSync3(file4) ? JSON.parse(readFileSync4(file4, "utf8")) : null;
}
function saveJournal(root, journal) {
  workflowPlatformFacade.writeFileAtomic(
    localPath(root, "transaction.json"),
    `${JSON.stringify(journal, null, 2)}
`
  );
}
function removeJournal(root) {
  rmSync2(localPath(root, "transaction.json"), { force: true });
  rmSync2(localPath(root, "index-before"), { force: true });
}
function commitMessageFor(journal) {
  const trailers = [
    `Workflow-Scope: ${journal.scopeId ?? "NONE"}`,
    `Workflow-Task: ${journal.taskId ?? "-"}`,
    `Workflow-Role: ${journal.role}`,
    ...journal.taskId === null ? [] : [`Workflow-Iteration: ${journal.iteration}`],
    ...journal.assignmentId ? [`Workflow-Assignment: ${journal.assignmentId}`] : [],
    ...journal.sourceCommit ? [`Workflow-Source: ${journal.sourceCommit}`] : [],
    `Workflow-Transaction: ${journal.id}`
  ];
  return `${journal.message.trim()}

${trailers.join("\n")}
`;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-references.ts
function trailer(commit2, key) {
  const values = commit2.trailers[key] ?? [];
  ensure(
    values.length <= 1,
    "AMBIGUOUS_COMMIT",
    `Duplicated ${key} trailer in ${commit2.sha}.`
  );
  return values[0];
}
var TASK_ROLES = /* @__PURE__ */ new Set([
  "docs",
  "implementation",
  "integration",
  "quality"
]);
var INTEGRATION_ROLE = "integration";
var INTEGRATION_PARENTS = 2;
function checkMerge(commit2) {
  const role = trailer(commit2, "Workflow-Role");
  const source = trailer(commit2, "Workflow-Source");
  const valid = commit2.parents.length === INTEGRATION_PARENTS && role === INTEGRATION_ROLE && source !== void 0 && source === commit2.parents[1] && Boolean(trailer(commit2, "Workflow-Task")) && Boolean(trailer(commit2, "Workflow-Assignment"));
  ensure(
    valid,
    "HISTORY_NOT_LINEAR",
    `Commit ${commit2.sha} has ${commit2.parents.length} parents but is not an integration commit with Workflow-Source equal to its second parent.`,
    { parents: commit2.parents, role: role ?? null, sha: commit2.sha }
  );
}
function inTaskScope(files, file4) {
  return files.some((entry) => file4 === entry || file4.startsWith(`${entry}/`));
}
function commitPaths(git, root, task2, planPath, commit2) {
  if (trailer(commit2, "Workflow-Role") !== INTEGRATION_ROLE) {
    ensure(
      commit2.parents.length === 1,
      "HISTORY_NOT_LINEAR",
      `The task commit of ${task2.id} must have one parent.`,
      { sha: commit2.sha }
    );
    const paths2 = readCommitPaths(git, root, commit2.sha);
    const allowed = /* @__PURE__ */ new Set([...task2.files, planPath]);
    return outsideTask(task2, commit2, paths2, (file4) => allowed.has(file4));
  }
  ensure(
    commit2.parents.length === INTEGRATION_PARENTS,
    "HISTORY_NOT_LINEAR",
    `The integration commit of ${task2.id} must have two parents.`,
    { sha: commit2.sha }
  );
  const paths = readDiffPaths(git, root, commit2.parents[0] ?? "", commit2.sha);
  return outsideTask(
    task2,
    commit2,
    paths,
    (file4) => file4 === planPath || inTaskScope(task2.files, file4)
  );
}
function outsideTask(task2, commit2, paths, allowed) {
  const outside = paths.filter((file4) => !allowed(file4));
  ensure(
    outside.length === 0,
    "COMMIT_SCOPE_MISMATCH",
    `The commit of ${task2.id} touches files outside the task.`,
    { paths: outside, sha: commit2.sha }
  );
  return paths;
}
function taskCommits(history, scopeId, task2) {
  return history.filter(
    (commit2) => trailer(commit2, "Workflow-Scope") === scopeId && trailer(commit2, "Workflow-Task") === task2.id && TASK_ROLES.has(trailer(commit2, "Workflow-Role") ?? "") && Number(trailer(commit2, "Workflow-Iteration") ?? "1") === task2.iteration
  );
}
function checkCommit(git, root, plan, planPath, task2, commit2, resolved) {
  ensure(
    task2.status === "DONE",
    "PLAN_COMMIT_MISMATCH",
    `Task ${task2.id} has a commit but is not DONE.`,
    { sha: commit2.sha }
  );
  const paths = commitPaths(git, root, task2, planPath, commit2);
  for (const dependency of task2.dependencies) {
    const dependencySha = resolved.get(dependency);
    const legacy = plan.tasks.find(
      (item) => item.id === dependency && plan.rounds.find((round) => round.id === item.roundId)?.kind === "legacy"
    );
    ensure(
      legacy || dependencySha && git.succeeds(root, [
        "merge-base",
        "--is-ancestor",
        dependencySha,
        commit2.parents[0] ?? ""
      ]),
      "DEPENDENCY_ORDER",
      `Dependency ${dependency} must be committed before ${task2.id}.`
    );
  }
  return paths;
}
function resolveTaskReferences(git, root, plan, planPath, pending) {
  const references = /* @__PURE__ */ new Map();
  const scope = plan.scope;
  if (!scope) {
    return references;
  }
  const history = readHistory(git, root, scope.baselineCommit, "HEAD", {
    firstParent: true
  });
  for (const commit2 of history) {
    if (commit2.parents.length > 1) {
      checkMerge(commit2);
    }
  }
  const legacyRounds = new Set(
    plan.rounds.filter((round) => round.kind === "legacy").map((round) => round.id)
  );
  const resolved = /* @__PURE__ */ new Map();
  for (const task2 of plan.tasks.filter(
    (item) => !legacyRounds.has(item.roundId)
  )) {
    const commits = taskCommits(history, scope.id, task2);
    ensure(
      commits.length <= 1,
      "AMBIGUOUS_COMMIT",
      `Several commits claim task ${task2.id}.`,
      { shas: commits.map((commit3) => commit3.sha) }
    );
    const [commit2] = commits;
    if (commit2) {
      const paths = checkCommit(
        git,
        root,
        plan,
        planPath,
        task2,
        commit2,
        resolved
      );
      resolved.set(task2.id, commit2.sha);
      references.set(task2.id, { paths, sha: commit2.sha, status: "committed" });
      continue;
    }
    const inTransaction = pending?.scopeId === scope.id && pending.taskId === task2.id;
    ensure(
      task2.status !== "DONE" || inTransaction,
      "PLAN_COMMIT_MISMATCH",
      `Task ${task2.id} is DONE but has no commit.`,
      {},
      "Run `scripts/workflow repair`."
    );
    references.set(task2.id, { status: inTransaction ? "pending" : "open" });
  }
  return references;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-repair.ts
import { readFileSync as readFileSync6 } from "node:fs";
import path11 from "node:path";

// product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/workflow-plan-facade.ts
import path8 from "node:path";

// product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-execution.ts
var DEFAULT_MAX_WORKERS = 3;
var MAX_WORKERS_LIMIT = 16;
var EXECUTION_STRATEGIES = [
  "sequential",
  "orchestrated"
];
var STRATEGIES2 = new Set(EXECUTION_STRATEGIES);
var GLOB_PATTERN = /[*?[\]{}]/u;
var SEQUENTIAL = {
  maxWorkers: DEFAULT_MAX_WORKERS,
  ownerSession: null,
  strategy: "sequential"
};
function normalizeExecution(input) {
  if (input === void 0 || input === null) {
    return;
  }
  ensure(
    typeof input === "object" && !Array.isArray(input),
    "PLAN_EXECUTION",
    "execution must be an object with a strategy.",
    { field: "execution" }
  );
  return {
    maxWorkers: input.maxWorkers ?? DEFAULT_MAX_WORKERS,
    ownerSession: input.ownerSession ?? null,
    strategy: input.strategy
  };
}
function scopeExecution(scope) {
  return structuredClone(scope?.execution ?? SEQUENTIAL);
}
function validateExecution(execution) {
  if (execution === void 0) {
    return;
  }
  ensure(
    execution !== null && typeof execution === "object",
    "PLAN_EXECUTION",
    "scope.execution must be an object.",
    { field: "execution" }
  );
  ensure(
    STRATEGIES2.has(execution.strategy),
    "PLAN_EXECUTION",
    "execution.strategy must be sequential or orchestrated.",
    { field: "execution.strategy" }
  );
  ensure(
    Number.isSafeInteger(execution.maxWorkers) && execution.maxWorkers >= 1 && execution.maxWorkers <= MAX_WORKERS_LIMIT,
    "PLAN_EXECUTION",
    `execution.maxWorkers must be an integer from 1 to ${MAX_WORKERS_LIMIT}.`,
    { field: "execution.maxWorkers" }
  );
  ensure(
    execution.ownerSession === null || typeof execution.ownerSession === "string" && execution.ownerSession.trim() !== "",
    "PLAN_EXECUTION",
    "execution.ownerSession must be a non-empty string or null.",
    { field: "execution.ownerSession" }
  );
}
function isConcretePath(file4) {
  return typeof file4 === "string" && file4.trim() !== "" && file4 !== "." && !file4.endsWith("/") && !GLOB_PATTERN.test(file4);
}
function validateParallelLabel(task2) {
  if (task2.parallelSafe === void 0) {
    return;
  }
  ensure(
    typeof task2.parallelSafe === "boolean",
    "PLAN_SCHEMA",
    `parallelSafe must be boolean: ${task2.id}`,
    { field: `tasks.${task2.id}.parallelSafe` }
  );
  if (!task2.parallelSafe) {
    return;
  }
  ensure(
    task2.kind === "work",
    "PARALLEL_KIND",
    `Only work tasks may be parallelSafe: ${task2.id}`,
    { field: `tasks.${task2.id}.parallelSafe` }
  );
  const files = Array.isArray(task2.files) ? task2.files : [];
  const vague = files.filter((file4) => !isConcretePath(file4));
  ensure(
    files.length > 0 && vague.length === 0,
    "PARALLEL_FILES",
    `A parallelSafe task lists concrete paths only (no glob, no \`.\`, no trailing \`/\`): ${task2.id}`,
    { field: `tasks.${task2.id}.files`, paths: vague, taskId: task2.id },
    "Name every file of the task or set parallelSafe to false."
  );
}
function validatePlanExecution(plan) {
  validateExecution(plan.scope?.execution);
  for (const task2 of plan.tasks) {
    validateParallelLabel(task2);
  }
}
function ancestors(byId, taskId) {
  const seen = /* @__PURE__ */ new Set();
  const pending = [...byId.get(taskId)?.dependencies ?? []];
  while (pending.length > 0) {
    const id = pending.pop();
    if (!seen.has(id)) {
      seen.add(id);
      pending.push(...byId.get(id)?.dependencies ?? []);
    }
  }
  return seen;
}
function pathsOverlap(first, second) {
  return first === second || first.startsWith(`${second}/`) || second.startsWith(`${first}/`);
}
function compatible(byId, first, second) {
  return first.id !== second.id && first.kind === "work" && second.kind === "work" && first.parallelSafe === true && second.parallelSafe === true && !ancestors(byId, first.id).has(second.id) && !ancestors(byId, second.id).has(first.id) && !first.files.some(
    (file4) => second.files.some((other) => pathsOverlap(file4, other))
  );
}
function compatibleTasks(plan, firstId, secondId) {
  const byId = new Map(plan.tasks.map((task2) => [task2.id, task2]));
  const first = byId.get(firstId);
  const second = byId.get(secondId);
  return Boolean(first && second && compatible(byId, first, second));
}
function hasParallelWork(plan) {
  const byId = new Map(plan.tasks.map((task2) => [task2.id, task2]));
  const labelled = plan.tasks.filter(
    (task2) => task2.kind === "work" && task2.parallelSafe === true
  );
  return labelled.some(
    (first, index) => labelled.slice(index + 1).some((second) => compatible(byId, first, second))
  );
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-field-checks.ts
var ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
var schemaError = "PLAN_SCHEMA";
function text2(value, field4) {
  ensure(
    typeof value === "string" && value.trim() !== "",
    schemaError,
    `Field must be a non-empty string: ${field4}`,
    { field: field4 }
  );
}
function textList(value, field4, { nonEmpty = false } = {}) {
  ensure(
    Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim() !== ""),
    schemaError,
    `Field must be a list of non-empty strings: ${field4}`,
    { field: field4 }
  );
  ensure(
    !nonEmpty || value.length > 0,
    schemaError,
    `List must not be empty: ${field4}`,
    { field: field4 }
  );
  ensure(
    new Set(value).size === value.length,
    schemaError,
    `List has duplicates: ${field4}`,
    { field: field4 }
  );
}
function identifier(value, field4) {
  ensure(
    typeof value === "string" && ID_PATTERN.test(value),
    schemaError,
    `Invalid identifier in ${field4}: ${String(value)}`,
    { field: field4 }
  );
}
function decision(value, field4) {
  ensure(
    value && typeof value === "object",
    schemaError,
    `Missing decision: ${field4}`,
    { field: field4 }
  );
  text2(value.text, `${field4}.text`);
  text2(value.at, `${field4}.at`);
}
function relativePaths(values, field4) {
  textList(values, field4);
  for (const value of values) {
    ensure(
      workflowPlatformFacade.normalizeRelative(value) === value,
      schemaError,
      `Path is not canonical in ${field4}: ${value}`,
      { field: field4, path: value }
    );
  }
}
function documents(values, field4) {
  ensure(Array.isArray(values), schemaError, `Field must be a list: ${field4}`, {
    field: field4
  });
  for (const [index, doc] of values.entries()) {
    const entry = `${field4}[${index}]`;
    ensure(
      doc && typeof doc === "object",
      schemaError,
      `Document reference must be an object: ${entry}`,
      { field: entry }
    );
    text2(doc.path, `${entry}.path`);
    ensure(
      typeof doc.required === "boolean",
      schemaError,
      `required must be boolean in ${entry}`,
      { field: `${entry}.required` }
    );
    ensure(
      doc.heading === void 0 || typeof doc.heading === "string" && doc.heading.trim() !== "",
      schemaError,
      `heading must be text in ${entry}`,
      { field: `${entry}.heading` }
    );
  }
  relativePaths(
    values.map((doc) => doc.path),
    `${field4}.path`
  );
}
function byteLength(value) {
  return new TextEncoder().encode(value).length;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-model.ts
var PLAN_SCHEMA = "harness-workflow-plan/1";
var PLAN_PATH = ".harness/plans/todo-plan.md";
var DIGEST_RESULT_MAX_BYTES = 600;
var DIGEST_ITEM_MAX_BYTES = 300;
var DIGEST_MAX_ITEMS = 8;
var DOCS_TASK_PREFIX = "DOCS-";
var MARKDOWN_PATTERN = /\.(?:md|markdown)$/iu;
var PRODUCT_TREE_PREFIX = ".harness/product-tree/";
function isMarkdownPath(file4) {
  return MARKDOWN_PATTERN.test(file4);
}
function isDocumentationPath(file4) {
  return isMarkdownPath(file4) || file4.startsWith(PRODUCT_TREE_PREFIX);
}
function functionalFiles(task2) {
  return task2.files.filter((file4) => !isDocumentationPath(file4));
}
function docsTaskId(roundId) {
  return `${DOCS_TASK_PREFIX}${roundId}`;
}
function emptyPlan(projectId, projectName) {
  return {
    currentTaskId: null,
    lastClosed: null,
    projectId,
    projectName,
    revision: 1,
    rounds: [],
    schema: PLAN_SCHEMA,
    scope: null,
    tasks: []
  };
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-validation.ts
var ROUND_ID_PATTERN = /^R[0-9]+(?:-[a-z]+)?$/u;
var SHA_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
var LINE_BREAK_PATTERN = /[\r\n]/u;
var TASK_STATUSES = /* @__PURE__ */ new Set(["TODO", "IN_PROGRESS", "DONE"]);
var TASK_KINDS = /* @__PURE__ */ new Set(["work", "quality", "docs", "delivery"]);
var ROUND_KINDS = /* @__PURE__ */ new Set(["implementation", "fixes", "legacy"]);
var DELIVERY_STATES = /* @__PURE__ */ new Set([
  "IN_PROGRESS",
  "READY_FOR_ACCEPTANCE",
  "ACCEPTED"
]);
function validateDigest(digest, prefix = "") {
  const at = (name) => prefix ? `${prefix}.${name}` : name;
  ensure(
    digest && typeof digest === "object",
    "ROUND_DIGEST_REQUIRED",
    "A round digest with at least `result` is required.",
    { field: prefix || "digest" }
  );
  text2(digest.result, at("result"));
  ensure(
    byteLength(digest.result) <= DIGEST_RESULT_MAX_BYTES,
    "ROUND_DIGEST_TOO_LARGE",
    `Digest result exceeds ${DIGEST_RESULT_MAX_BYTES} bytes.`,
    { field: at("result") }
  );
  for (const key of ["decisions", "contracts", "references"]) {
    const items = digest[key];
    textList(items, at(key));
    ensure(
      items.length <= DIGEST_MAX_ITEMS,
      "ROUND_DIGEST_TOO_LARGE",
      `Digest ${key} has more than ${DIGEST_MAX_ITEMS} items.`,
      { field: at(key) }
    );
    const large = items.findIndex(
      (item) => byteLength(item) > DIGEST_ITEM_MAX_BYTES
    );
    ensure(
      large < 0,
      "ROUND_DIGEST_TOO_LARGE",
      `Digest ${key} item exceeds ${DIGEST_ITEM_MAX_BYTES} bytes.`,
      { field: at(`${key}[${large}]`) }
    );
  }
}
function validateScope(scope) {
  identifier(scope.id, "scope.id");
  text2(scope.objective, "scope.objective");
  textList(scope.acceptance, "scope.acceptance", { nonEmpty: true });
  decision(scope.approval, "scope.approval");
  ensure(
    Array.isArray(scope.decisions),
    schemaError,
    "scope.decisions must be a list.",
    { field: "scope.decisions" }
  );
  for (const [index, item] of scope.decisions.entries()) {
    decision(item, `scope.decisions[${index}]`);
  }
  ensure(
    SHA_PATTERN.test(scope.baselineCommit),
    schemaError,
    "scope.baselineCommit must be a full commit SHA."
  );
  ensure(
    scope.spec === null || workflowPlatformFacade.normalizeRelative(scope.spec) === scope.spec,
    schemaError,
    "scope.spec must be a canonical path or null.",
    { field: "scope.spec" }
  );
  documents(scope.context, "scope.context");
  ensure(
    scope.status === "ACTIVE" || scope.status === "BLOCKED",
    schemaError,
    "scope.status must be ACTIVE or BLOCKED."
  );
  ensure(
    scope.status === "BLOCKED" === (typeof scope.blockedReason === "string" && scope.blockedReason.trim() !== ""),
    schemaError,
    "A BLOCKED scope needs blockedReason; an ACTIVE scope has none."
  );
  ensure(
    DELIVERY_STATES.has(scope.delivery),
    schemaError,
    "Unknown scope.delivery state."
  );
  ensure(
    scope.delivery === "ACCEPTED" === (scope.acceptanceNote !== null),
    schemaError,
    "acceptanceNote is present exactly when the scope is ACCEPTED."
  );
  if (scope.acceptanceNote) {
    decision(scope.acceptanceNote, "scope.acceptanceNote");
  }
}
function roundDocsDone(plan, roundId) {
  return plan.tasks.some(
    (task2) => task2.roundId === roundId && task2.kind === "docs" && task2.status === "DONE"
  );
}
function validateRounds(plan) {
  const rounds = plan.rounds;
  ensure(
    rounds.length > 0,
    schemaError,
    "An active scope needs at least one round."
  );
  ensure(
    new Set(rounds.map((round) => round.id)).size === rounds.length,
    schemaError,
    "Round ids must be unique."
  );
  rounds.forEach((round, index) => {
    ensure(
      ROUND_ID_PATTERN.test(round.id),
      schemaError,
      `Invalid round id: ${round.id}`
    );
    ensure(
      ROUND_KINDS.has(round.kind),
      schemaError,
      `Invalid round kind: ${round.id}`
    );
    text2(round.title, `rounds.${round.id}.title`);
    ensure(
      round.status === "OPEN" || round.status === "CLOSED",
      schemaError,
      `Invalid round status: ${round.id}`
    );
    ensure(
      round.status === "CLOSED" || index === rounds.length - 1,
      schemaError,
      "Only the last round may be OPEN."
    );
    if (round.status === "CLOSED" || roundDocsDone(plan, round.id)) {
      validateDigest(round.digest, `rounds.${round.id}.digest`);
    } else {
      ensure(
        round.digest === null,
        schemaError,
        `A round gets its digest with its DOCS task: ${round.id}`
      );
    }
  });
}
function validateTaskFields(task2) {
  identifier(task2.id, "task.id");
  text2(task2.title, `tasks.${task2.id}.title`);
  text2(task2.why, `tasks.${task2.id}.why`);
  text2(task2.commitMessage, `tasks.${task2.id}.commitMessage`);
  ensure(
    !LINE_BREAK_PATTERN.test(task2.commitMessage),
    schemaError,
    `commitMessage must be one line: ${task2.id}`,
    { field: `tasks.${task2.id}.commitMessage` }
  );
  ensure(
    TASK_KINDS.has(task2.kind),
    schemaError,
    `Invalid task kind: ${task2.id}`,
    { field: `tasks.${task2.id}.kind` }
  );
  ensure(
    TASK_STATUSES.has(task2.status),
    schemaError,
    `Invalid task status: ${task2.id}`
  );
  ensure(
    Number.isSafeInteger(task2.iteration) && task2.iteration >= 1,
    schemaError,
    `iteration must be a positive integer: ${task2.id}`
  );
  relativePaths(task2.files, `tasks.${task2.id}.files`);
  textList(task2.dependencies, `tasks.${task2.id}.dependencies`);
  textList(task2.acceptance, `tasks.${task2.id}.acceptance`, { nonEmpty: true });
  textList(task2.checks, `tasks.${task2.id}.checks`);
  documents(task2.context, `tasks.${task2.id}.context`);
  ensure(
    task2.docsWaiver === null || typeof task2.docsWaiver === "string",
    schemaError,
    `docsWaiver must be text or null: ${task2.id}`,
    { field: `tasks.${task2.id}.docsWaiver` }
  );
  ensure(
    task2.confirmation === null || task2.kind === "delivery",
    schemaError,
    `Only delivery tasks carry a confirmation: ${task2.id}`
  );
  if (task2.integration !== void 0) {
    ensure(
      task2.status === "DONE" && typeof task2.integration === "object" && task2.integration !== null && SHA_PATTERN.test(String(task2.integration.sourceCommit)),
      schemaError,
      `integration belongs to a DONE task and names a full source SHA: ${task2.id}`
    );
    identifier(
      task2.integration.operationId,
      `tasks.${task2.id}.integration.operationId`
    );
  }
}
function validateTaskGraph(plan) {
  const positions = new Map(plan.tasks.map((task2, index) => [task2.id, index]));
  ensure(
    positions.size === plan.tasks.length,
    schemaError,
    "Task ids must be unique."
  );
  const rounds = new Map(plan.rounds.map((round) => [round.id, round]));
  plan.tasks.forEach((task2, index) => {
    const round = rounds.get(task2.roundId);
    ensure(round, schemaError, `Task references an unknown round: ${task2.id}`);
    ensure(
      round.status === "OPEN" || task2.status === "DONE",
      schemaError,
      `Tasks of a closed round are DONE: ${task2.id}`
    );
    for (const dependency of task2.dependencies) {
      const position = positions.get(dependency);
      ensure(
        position !== void 0 && position < index,
        "TASK_ORDER",
        `Dependency must exist and come earlier: ${task2.id} -> ${dependency}`,
        { field: `tasks.${task2.id}.dependencies` }
      );
    }
    if (task2.fixes !== null) {
      const fixed = positions.get(task2.fixes);
      ensure(
        fixed !== void 0 && fixed < index,
        schemaError,
        `fixes must reference an earlier task: ${task2.id}`,
        { field: `tasks.${task2.id}.fixes` }
      );
    }
  });
}
function validateServiceTasks(plan) {
  for (const round of plan.rounds.filter((item) => item.kind !== "legacy")) {
    const roundTasks2 = plan.tasks.filter((task2) => task2.roundId === round.id);
    const docs = roundTasks2.filter((task2) => task2.kind === "docs");
    ensure(
      docs.length <= 1,
      "DOCS_TASK",
      `A round has at most one DOCS task: ${round.id}`
    );
    const docsTask2 = docs[0];
    ensure(
      !docsTask2 || docsTask2.id === docsTaskId(round.id),
      "DOCS_TASK",
      `DOCS task id must be ${docsTaskId(round.id)}.`
    );
    ensure(
      !docsTask2 || functionalFiles(docsTask2).length === 0,
      "DOCS_TASK",
      `DOCS task holds documentation only: ${round.id}`
    );
    const docsIndex = docsTask2 ? roundTasks2.indexOf(docsTask2) : roundTasks2.length;
    roundTasks2.forEach((task2, index) => {
      const regular = task2.kind === "work" || task2.kind === "quality";
      ensure(
        !(regular && docsTask2 && index > docsIndex),
        "DOCS_TASK",
        `Only delivery tasks follow DOCS: ${task2.id}`
      );
      ensure(
        !(regular && docsTask2) || docsTask2.dependencies.includes(task2.id),
        "DOCS_TASK",
        `DOCS depends on every task of its round: ${task2.id}`
      );
      ensure(
        task2.kind !== "delivery" || docsTask2 !== void 0 && task2.dependencies.includes(docsTask2.id),
        "DELIVERY_ORDER",
        `Delivery tasks depend on their round DOCS: ${task2.id}`
      );
    });
  }
}
function validateProgress(plan, scope) {
  const running = plan.tasks.filter((task2) => task2.status === "IN_PROGRESS");
  ensure(
    running.length <= 1 && (running[0]?.id ?? null) === plan.currentTaskId,
    schemaError,
    "currentTaskId must match the only IN_PROGRESS task."
  );
  const allDone = plan.tasks.length > 0 && plan.tasks.every((task2) => task2.status === "DONE");
  ensure(
    allDone === (scope.delivery !== "IN_PROGRESS"),
    schemaError,
    "Delivery state must be IN_PROGRESS exactly while tasks remain."
  );
}
function validatePlan(plan) {
  ensure(
    plan && typeof plan === "object" && plan.schema === PLAN_SCHEMA,
    schemaError,
    "Unsupported workflow plan schema."
  );
  ensure(
    Number.isSafeInteger(plan.revision) && plan.revision >= 1,
    schemaError,
    "revision must be a positive integer."
  );
  text2(plan.projectId, "projectId");
  text2(plan.projectName, "projectName");
  ensure(
    Array.isArray(plan.rounds) && Array.isArray(plan.tasks),
    schemaError,
    "rounds and tasks must be lists."
  );
  if (plan.lastClosed !== null) {
    identifier(plan.lastClosed.scopeId, "lastClosed.scopeId");
    text2(plan.lastClosed.closedAt, "lastClosed.closedAt");
  }
  if (plan.scope === null) {
    ensure(
      plan.rounds.length === 0 && plan.tasks.length === 0 && plan.currentTaskId === null,
      schemaError,
      "A plan without scope has no rounds, tasks or current task."
    );
    return plan;
  }
  validateScope(plan.scope);
  validatePlanExecution(plan);
  validateRounds(plan);
  for (const task2 of plan.tasks) {
    validateTaskFields(task2);
  }
  validateTaskGraph(plan);
  validateServiceTasks(plan);
  validateProgress(plan, plan.scope);
  return plan;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-document.ts
var BEGIN = "<!-- harness-workflow:begin -->";
var END = "<!-- harness-workflow:end -->";
var FENCED_JSON_PATTERN = /^```json\n([\s\S]+)\n```$/u;
var CRLF_PATTERN = /\r\n/gu;
function taskLine(task2) {
  const lines = [
    `- [${task2.status}] ${task2.id} \u2014 ${task2.title} (${task2.kind}${task2.parallelSafe ? ", parallel-safe" : ""})`,
    `  - Commit: ${task2.commitMessage}`
  ];
  if (task2.files.length > 0) {
    lines.push(`  - Files: ${task2.files.join(", ")}`);
  }
  if (task2.dependencies.length > 0) {
    lines.push(`  - Depends on: ${task2.dependencies.join(", ")}`);
  }
  if (task2.fixes) {
    lines.push(`  - Fixes: ${task2.fixes}`);
  }
  return lines;
}
function roundLines(round, tasks) {
  const lines = [
    `### ${round.id} \u2014 ${round.title} (${round.kind}, ${round.status})`,
    ""
  ];
  for (const task2 of tasks.filter((item) => item.roundId === round.id)) {
    lines.push(...taskLine(task2));
  }
  if (round.digest) {
    lines.push("", `Digest: ${round.digest.result}`);
  }
  lines.push("");
  return lines;
}
function executionLines(execution) {
  if (!execution) {
    return [];
  }
  if (execution.strategy === "sequential") {
    return ["- Execution: sequential"];
  }
  const owner = execution.ownerSession ? `, owner ${execution.ownerSession}` : "";
  return [
    `- Execution: orchestrated (max ${execution.maxWorkers} workers${owner})`
  ];
}
function scopeLines(plan) {
  const scope = plan.scope;
  if (!scope) {
    const previous = plan.lastClosed ? ` Last closed scope: ${plan.lastClosed.scopeId}.` : "";
    return ["## State", "", `No active scope.${previous}`, ""];
  }
  const done = plan.tasks.filter((task2) => task2.status === "DONE").length;
  return [
    "## State",
    "",
    `- Scope: ${scope.id} (${scope.status}${scope.blockedReason ? `: ${scope.blockedReason}` : ""})`,
    `- Delivery: ${scope.delivery}`,
    ...executionLines(scope.execution),
    `- Current task: ${plan.currentTaskId ?? "none"}`,
    `- Progress: ${done}/${plan.tasks.length}`,
    `- Revision: ${plan.revision}`,
    "",
    "## Objective",
    "",
    scope.objective,
    "",
    "## Acceptance",
    "",
    ...scope.acceptance.map((item) => `- ${item}`),
    "",
    "## Rounds",
    "",
    ...plan.rounds.flatMap((round) => roundLines(round, plan.tasks))
  ];
}
function renderPlanDocument(plan) {
  validatePlan(plan);
  return [
    `# Workflow Plan \u2014 ${plan.projectName}`,
    "",
    BEGIN,
    "```json",
    JSON.stringify(plan, null, 2),
    "```",
    END,
    "",
    ...scopeLines(plan),
    "State changes only through `scripts/workflow` commands. History lives in Git.",
    ""
  ].join("\n");
}
function extractPlanState(text3) {
  const normalized = text3.replace(CRLF_PATTERN, "\n");
  ensure(
    normalized.split(BEGIN).length === 2 && normalized.split(END).length === 2,
    "PLAN_MARKERS",
    "The plan needs exactly one harness-workflow state block."
  );
  const fragment = normalized.split(BEGIN)[1]?.split(END)[0]?.trim() ?? "";
  const match = FENCED_JSON_PATTERN.exec(fragment);
  ensure(
    match?.[1],
    "PLAN_MARKERS",
    "The state block must hold one fenced JSON block."
  );
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new WorkflowError("PLAN_JSON", "The plan state is not valid JSON.");
  }
}
function isWorkflowPlanDocument(text3) {
  return text3.includes(BEGIN) && text3.includes(END);
}
function parsePlanDocument(text3, options = {}) {
  const plan = validatePlan(extractPlanState(text3));
  if (options.projection ?? true) {
    ensure(
      renderPlanDocument(plan) === text3.replace(CRLF_PATTERN, "\n"),
      "PLAN_PROJECTION",
      "The readable part of the plan was edited manually.",
      {},
      "Run `scripts/workflow repair` to rebuild it from the JSON state."
    );
  }
  return plan;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-input-checks.ts
var APPROVAL_MIN_LENGTH = 10;
var INPUT_TASK_KINDS = ["work", "delivery"];
var EXTEND_ROUNDS = ["current", "new"];
var EXTEND_ROUND_KINDS = [
  "fixes",
  "implementation"
];
function approval(value, message) {
  ensure(
    typeof value === "string" && value.trim().length >= APPROVAL_MIN_LENGTH,
    "SCOPE_APPROVAL",
    message,
    { field: "approval" }
  );
}
function tasksList(value, message) {
  ensure(Array.isArray(value) && value.length > 0, schemaError, message, {
    field: "tasks"
  });
}
function checkScopeInput(input) {
  ensure(
    input && typeof input === "object",
    schemaError,
    "The scope input must be a JSON object.",
    { field: "(root)" }
  );
  tasksList(input.tasks, "A scope needs at least one task.");
  approval(
    input.approval,
    `Record the user-approved scope content in \`approval\` (at least ${APPROVAL_MIN_LENGTH} characters).`
  );
  ensure(
    input.tasks.length === 1 || typeof input.spec === "string" && input.spec !== "",
    "SPEC_REQUIRED",
    "A scope with several tasks needs a specification document in `spec`.",
    { field: "spec" }
  );
  identifier(input.id, "id");
  text2(input.objective, "objective");
  textList(input.acceptance, "acceptance", { nonEmpty: true });
  ensure(
    input.decisions === void 0 || Array.isArray(input.decisions) && input.decisions.every(
      (item) => typeof item === "string" && item.trim() !== ""
    ),
    schemaError,
    "Field must be a list of non-empty strings: decisions",
    { field: "decisions" }
  );
  if (input.context !== void 0) {
    documents(input.context, "context");
  }
}
function checkTaskInput(input, field4) {
  ensure(
    input && typeof input === "object",
    schemaError,
    "Each task must be an object.",
    { field: field4 }
  );
  ensure(
    input.kind === void 0 || INPUT_TASK_KINDS.includes(input.kind),
    schemaError,
    "Task kind in input must be work or delivery; Kit adds quality and docs tasks.",
    { field: `${field4}.kind` }
  );
  if (input.id !== void 0) {
    identifier(input.id, `${field4}.id`);
  }
  text2(input.title, `${field4}.title`);
  text2(input.commitMessage, `${field4}.commitMessage`);
  textList(input.acceptance, `${field4}.acceptance`, { nonEmpty: true });
  for (const key of ["dependencies", "checks"]) {
    if (input[key] !== void 0) {
      textList(input[key], `${field4}.${key}`);
    }
  }
  if (input.context !== void 0) {
    documents(input.context, `${field4}.context`);
  }
}
function checkExtendInput(input) {
  ensure(
    input && typeof input === "object",
    schemaError,
    "The plan:extend input must be a JSON object.",
    { field: "(root)" }
  );
  tasksList(input.tasks, "plan:extend needs at least one task.");
  ensure(
    input.round === void 0 || EXTEND_ROUNDS.includes(input.round),
    schemaError,
    "round must be current or new.",
    { field: "round" }
  );
  ensure(
    input.kind === void 0 || EXTEND_ROUND_KINDS.includes(input.kind),
    schemaError,
    "kind must be fixes or implementation.",
    { field: "kind" }
  );
  if (input.title !== void 0) {
    text2(input.title, "title");
  }
}
function checkCarryoverInput(input) {
  ensure(
    input && typeof input === "object",
    schemaError,
    "The carryover input must be a JSON object.",
    { field: "(root)" }
  );
  approval(
    input.approval,
    "carryover needs the user's direct instruction in `approval`."
  );
  identifier(input.id, "id");
  if (input.objective !== void 0) {
    text2(input.objective, "objective");
  }
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-input-schema-fields.ts
var SCHEMA = "PLAN_SCHEMA";
function field(name, type, required, description, extra = {}) {
  return { code: SCHEMA, description, name, required, type, ...extra };
}
function documentFields(prefix) {
  return [
    field(`${prefix}`, "object[]", false, "Documents the agent reads."),
    field(
      `${prefix}[].path`,
      "string",
      true,
      "Canonical project-relative path, unique in the list."
    ),
    field(
      `${prefix}[].required`,
      "boolean",
      true,
      "Whether the document is mandatory reading."
    ),
    field(
      `${prefix}[].heading`,
      "string",
      false,
      "Section heading to read instead of the whole document."
    )
  ];
}
function taskFields(prefix) {
  return [
    field(prefix, "object[]", true, "Tasks in execution order.", {
      minItems: 1
    }),
    field(
      `${prefix}[].id`,
      "string",
      false,
      "Task id, unique in the plan; defaults to T001, T002, ...",
      { pattern: ID_PATTERN.source }
    ),
    field(`${prefix}[].title`, "string", true, "Short task title."),
    field(
      `${prefix}[].commitMessage`,
      "string",
      true,
      "One-line commit message of the task."
    ),
    field(
      `${prefix}[].acceptance`,
      "string[]",
      true,
      "Acceptance criteria: unique non-empty strings.",
      { minItems: 1 }
    ),
    field(
      `${prefix}[].why`,
      "string",
      false,
      "Why the task exists; defaults to the title."
    ),
    field(
      `${prefix}[].kind`,
      "string",
      false,
      "work (default) or delivery; Kit adds the quality and docs tasks.",
      { enum: INPUT_TASK_KINDS }
    ),
    field(
      `${prefix}[].files`,
      "string[]",
      false,
      "Canonical project-relative files or directories the task may change."
    ),
    field(
      `${prefix}[].dependencies`,
      "string[]",
      false,
      "Ids of earlier tasks that must be DONE first."
    ),
    field(`${prefix}[].checks`, "string[]", false, CHECKS_DESCRIPTION),
    ...documentFields(`${prefix}[].context`),
    field(
      `${prefix}[].docsWaiver`,
      "string|null",
      false,
      "Reason the task changes code without its contract document."
    ),
    field(
      `${prefix}[].fixes`,
      "string|null",
      false,
      "Id of the earlier task this task fixes."
    ),
    field(
      `${prefix}[].parallelSafe`,
      "boolean",
      false,
      "The work task may run in parallel; it then lists concrete files only."
    )
  ];
}
var CHECKS_DESCRIPTION = "Ids of quality checks (quality.checks of .harness/workflow/config.json, Kit builtins kit:*) the task runs besides the required ones, e.g. an optional delivery check; never manual checks (those go into acceptance).";
var CHECKS_RULE = "checks are quality check ids (CHECK_UNKNOWN): with the profile CONFIGURED each id is one of its checks (scripts/workflow quality:status); before QUALITY an id without spaces (^[A-Za-z0-9][A-Za-z0-9._:-]*$, a kit: id must be a Kit builtin) that task:start then finds in the profile. Only new tasks and changed checks are checked.";
var TASK_RULES = [
  CHECKS_RULE,
  "dependencies and fixes point only to earlier tasks (TASK_ORDER, PLAN_SCHEMA).",
  "parallelSafe applies to work tasks only (PARALLEL_KIND) that list concrete paths: no glob, no `.`, no trailing `/` (PARALLEL_FILES).",
  "A QUALITY task is added before the first task with functional files while the quality profile is not CONFIGURED; the round DOCS task and the order of delivery tasks are computed by Kit."
];

// product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-input-schema.ts
var EXECUTION = "PLAN_EXECUTION";
var TASK_PATCH_FIELDS = [
  "acceptance",
  "checks",
  "commitMessage",
  "context",
  "dependencies",
  "docsWaiver",
  "files",
  "title",
  "why"
];
var IN_PROGRESS_PATCH_FIELDS = [
  "acceptance",
  "checks",
  "docsWaiver",
  "files"
];
var SCOPE_FIELDS = [
  field("id", "string", true, "Scope id.", { pattern: ID_PATTERN.source }),
  field("objective", "string", true, "What the scope delivers."),
  field(
    "acceptance",
    "string[]",
    true,
    "Scope acceptance criteria: unique non-empty strings.",
    { minItems: 1 }
  ),
  {
    code: "SCOPE_APPROVAL",
    description: "The user's agreement with the scope content, in the user's words (trimmed length).",
    minLength: APPROVAL_MIN_LENGTH,
    name: "approval",
    required: true,
    type: "string"
  },
  {
    code: "SPEC_REQUIRED",
    description: "Canonical path of the specification; required when the scope has several tasks.",
    name: "spec",
    required: false,
    type: "string|null"
  },
  ...documentFields("context"),
  field("decisions", "string[]", false, "User decisions to record."),
  {
    code: EXECUTION,
    description: "Execution block; absent means sequential. scope:propose replaces the strategy with the user's choice.",
    name: "execution",
    required: false,
    type: "object"
  },
  {
    code: EXECUTION,
    description: "sequential or orchestrated.",
    enum: EXECUTION_STRATEGIES,
    name: "execution.strategy",
    required: true,
    type: "string"
  },
  {
    code: EXECUTION,
    description: `Parallel executors of an orchestrated scope; default ${DEFAULT_MAX_WORKERS}.`,
    maximum: MAX_WORKERS_LIMIT,
    minimum: 1,
    name: "execution.maxWorkers",
    required: false,
    type: "integer"
  },
  {
    code: EXECUTION,
    description: "Session that owns the orchestration, or null.",
    name: "execution.ownerSession",
    required: false,
    type: "string|null"
  },
  ...taskFields("tasks")
];
var SCOPE_RULES = [
  "A scope is created only when no scope is open (SCOPE_EXISTS) and the repository has a commit (NO_BASELINE).",
  "A scope with several tasks needs `spec` (SPEC_REQUIRED).",
  ...TASK_RULES
];
var TASK_EXAMPLE = {
  acceptance: ["The list shows a hint when it is empty"],
  commitMessage: "feat: show a hint for the empty list",
  context: [{ heading: "2. Empty list", path: "docs/spec.md", required: true }],
  files: ["src/list.ts"],
  id: "T001",
  title: "Empty list hint",
  why: "Users do not understand an empty screen"
};
var SCOPE_EXAMPLE = {
  acceptance: ["An empty list explains what to do"],
  approval: "User: implement the empty list hint from docs/spec.md",
  context: [{ path: "docs/spec.md", required: true }],
  decisions: ["The hint text comes from the specification"],
  id: "empty-list-hint",
  objective: "Explain the empty list to the user",
  spec: "docs/spec.md",
  tasks: [
    TASK_EXAMPLE,
    {
      acceptance: ["The packaged app shows the hint"],
      commitMessage: "chore: package the app",
      dependencies: ["T001"],
      id: "T002",
      kind: "delivery",
      title: "Package the app"
    }
  ]
};
function scopeSchema(command, description) {
  const propose = command === "scope:propose";
  return {
    command,
    description,
    example: propose ? {
      ...SCOPE_EXAMPLE,
      execution: { maxWorkers: 2, strategy: "sequential" }
    } : { ...SCOPE_EXAMPLE, execution: { strategy: "sequential" } },
    fields: SCOPE_FIELDS,
    rules: propose ? [
      'Run `scope:propose --input <file.json> --recommended sequential|orchestrated --reason "<why>"`; the user chooses the mode on the card.',
      ...SCOPE_RULES
    ] : [
      "A Harness-hosted project (config host `harness`) uses scope:propose instead (EXECUTION_MODE_REQUIRED).",
      ...SCOPE_RULES
    ]
  };
}
var EXTEND_SCHEMA = {
  command: "plan:extend",
  description: "Tasks added to the open round or to a new round: `plan:extend --input <file.json> [--expected-revision N]`.",
  example: {
    round: "current",
    tasks: [{ ...TASK_EXAMPLE, fixes: null, id: "T003" }]
  },
  fields: [
    field(
      "round",
      "string",
      false,
      "current (default while the round DOCS is not done) or new.",
      { enum: EXTEND_ROUNDS }
    ),
    field("kind", "string", false, "Kind of a new round; default fixes.", {
      enum: EXTEND_ROUND_KINDS
    }),
    field("title", "string", false, "Title of a new round; default Fixes."),
    ...taskFields("tasks"),
    field(
      "tasks[].before",
      "string",
      false,
      "Id of a not-started task of the current round to insert before; it then depends on the new task."
    )
  ],
  rules: [
    "DONE tasks never change; a defect becomes a new task that names the original in `fixes`.",
    "A closed round or a round whose DOCS is done gets a new round; a new round needs the old one to have only TODO delivery tasks left (ROUND_OPEN).",
    "`before` applies only to the current round and to a TODO task (TASK_STARTED, UNKNOWN_TASK).",
    "`--expected-revision N` refuses a stale plan (REVISION_MISMATCH).",
    "A READY_FOR_ACCEPTANCE or ACCEPTED scope returns to IN_PROGRESS.",
    ...TASK_RULES
  ]
};
var PATCH_SCHEMA = {
  command: "task:update",
  description: "Patch of a task that is not DONE: `task:update <ID> --input <patch.json> [--expected-revision N]`.",
  example: {
    acceptance: [
      "The list shows a hint when it is empty",
      "The hint is localized"
    ],
    files: ["src/list.ts", "src/list-hint.ts"]
  },
  fields: [
    field(
      "acceptance",
      "string[]",
      false,
      "Acceptance criteria: unique non-empty strings.",
      { minItems: 1 }
    ),
    field("checks", "string[]", false, CHECKS_DESCRIPTION),
    field("commitMessage", "string", false, "One-line commit message."),
    field(
      "context",
      "object[]",
      false,
      "Documents: {path, required, heading?}."
    ),
    field("dependencies", "string[]", false, "Ids of earlier tasks."),
    field("docsWaiver", "string|null", false, "Docs contract waiver."),
    field("files", "string[]", false, "Canonical project-relative paths."),
    field("title", "string", false, "Short task title."),
    field("why", "string", false, "Why the task exists.")
  ],
  rules: [
    `Only these fields change (TASK_PATCH): ${TASK_PATCH_FIELDS.join(", ")}.`,
    `A task IN_PROGRESS changes only ${IN_PROGRESS_PATCH_FIELDS.join(", ")}; a DONE task never changes (TASK_PATCH).`,
    "The patched plan is validated as a whole; refusals name the plan field `tasks.<ID>.<field>`.",
    CHECKS_RULE,
    "`--expected-revision N` refuses a stale plan (REVISION_MISMATCH)."
  ]
};
var CARRYOVER_SCHEMA = {
  command: "carryover",
  description: "Closes the current scope and opens a new one with every unfinished task: `carryover --input <file.json>`.",
  example: {
    approval: "User: continue the unfinished tasks in a new scope",
    id: "empty-list-hint-2",
    objective: "Finish the empty list hint"
  },
  fields: [
    field("id", "string", true, "Id of the new scope.", {
      pattern: ID_PATTERN.source
    }),
    {
      code: "SCOPE_APPROVAL",
      description: "The user's direct instruction (trimmed length).",
      minLength: APPROVAL_MIN_LENGTH,
      name: "approval",
      required: true,
      type: "string"
    },
    field(
      "objective",
      "string",
      false,
      "Objective of the new scope; defaults to the old one."
    )
  ],
  rules: [
    "Needs an open scope (NO_SCOPE) with at least one unfinished task (NOTHING_TO_CARRY).",
    "Unfinished non-DOCS tasks move to round R1 as TODO; QUALITY and DOCS are rebuilt."
  ]
};
function digestList(name, description) {
  return [
    field(name, "string[]", true, description, {
      limitCode: "ROUND_DIGEST_TOO_LARGE",
      maxItems: DIGEST_MAX_ITEMS
    }),
    field(`${name}[]`, "string", false, "One item (UTF-8 bytes).", {
      limitCode: "ROUND_DIGEST_TOO_LARGE",
      maxBytes: DIGEST_ITEM_MAX_BYTES
    })
  ];
}
var DIGEST_SCHEMA = {
  command: "digest",
  description: "Round digest of the DOCS task: `commit --task DOCS-<round> --digest <file.json>`.",
  example: {
    contracts: ["list facade: emptyHint(locale) returns the hint text"],
    decisions: ["The hint text comes from the specification"],
    references: ["docs/spec.md"],
    result: "The empty list shows a localized hint."
  },
  fields: [
    field("result", "string", true, "What the round delivered (UTF-8 bytes).", {
      limitCode: "ROUND_DIGEST_TOO_LARGE",
      maxBytes: DIGEST_RESULT_MAX_BYTES
    }),
    ...digestList("decisions", "Decisions taken in the round."),
    ...digestList("contracts", "Contracts the round created or changed."),
    ...digestList("references", "Documents to read for the round.")
  ],
  rules: [
    "Only the DOCS task of a round takes --digest; without it the commit is refused (ROUND_DIGEST_REQUIRED).",
    "Every list is present (it may be empty) and holds unique non-empty strings."
  ]
};
var SCHEMAS = [
  scopeSchema(
    "scope:create",
    "The agreed scope: `scope:create --input <file.json>`."
  ),
  scopeSchema(
    "scope:propose",
    "The scope body proposed for the user's choice of execution mode; the same body as scope:create."
  ),
  EXTEND_SCHEMA,
  PATCH_SCHEMA,
  CARRYOVER_SCHEMA,
  DIGEST_SCHEMA
];
function planInputSchemaCommands() {
  return SCHEMAS.map((schema) => schema.command);
}
function planInputSchema(command) {
  const schema = SCHEMAS.find((item) => item.command === command);
  return schema ? structuredClone(schema) : null;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-service-tasks.ts
var QUALITY_TITLE = "Configure the project quality profile";
var DOCS_TITLE = "Reconcile project documentation and write the round digest";
var DEFAULT_DOCS_FILES = ["README.md", "docs/architecture/OVERVIEW.md"];
var AUTO_ID_PATTERN = /^T([0-9]+)$/u;
function nextAutoId(existing) {
  let highest = 0;
  for (const id of existing) {
    const match = AUTO_ID_PATTERN.exec(id);
    highest = Math.max(highest, match ? Number(match[1]) : 0);
  }
  return `T${String(highest + 1).padStart(3, "0")}`;
}
function normalizeTaskInput(input, roundId, existing, field4) {
  checkTaskInput(input, field4);
  const id = input.id ?? nextAutoId(existing);
  ensure(!existing.has(id), "PLAN_SCHEMA", `Duplicate task id: ${id}`, {
    field: `${field4}.id`
  });
  existing.add(id);
  return {
    acceptance: input.acceptance,
    checks: input.checks ?? [],
    commitMessage: input.commitMessage,
    confirmation: null,
    context: input.context ?? [],
    dependencies: input.dependencies ?? [],
    docsWaiver: input.docsWaiver ?? null,
    files: input.files ?? [],
    fixes: input.fixes ?? null,
    id,
    iteration: 1,
    kind: input.kind ?? "work",
    // Absent and false are stored alike: the field is kept only when set.
    ...input.parallelSafe === void 0 || input.parallelSafe === false ? {} : { parallelSafe: input.parallelSafe },
    roundId,
    status: "TODO",
    title: input.title,
    why: input.why ?? input.title
  };
}
function qualityTaskId(plan) {
  const used = new Set(plan.tasks.map((task2) => task2.id));
  let index = 1;
  let id = "QUALITY";
  while (used.has(id)) {
    index += 1;
    id = `QUALITY-${index}`;
  }
  return id;
}
function buildQualityTask(plan, roundId) {
  return {
    acceptance: [
      "Project stacks are detected or chosen from the architecture",
      "Quality checks are applied with `quality:apply` and the profile is CONFIGURED"
    ],
    checks: [],
    commitMessage: "chore: configure the project quality profile",
    confirmation: null,
    context: [],
    dependencies: [],
    docsWaiver: null,
    files: [],
    fixes: null,
    id: qualityTaskId(plan),
    iteration: 1,
    kind: "quality",
    roundId,
    status: "TODO",
    title: QUALITY_TITLE,
    why: "Functional code needs a configured quality profile before its first commit."
  };
}
function buildDocsTask(roundId, files) {
  return {
    acceptance: [
      "Project-wide documents describe the round result",
      "The round digest records result, decisions, contracts and references"
    ],
    checks: [],
    commitMessage: `docs: reconcile documentation for ${roundId}`,
    confirmation: null,
    context: [],
    dependencies: [],
    docsWaiver: null,
    files: [.../* @__PURE__ */ new Set([...DEFAULT_DOCS_FILES, ...files])],
    fixes: null,
    id: docsTaskId(roundId),
    iteration: 1,
    kind: "docs",
    roundId,
    status: "TODO",
    title: DOCS_TITLE,
    why: "Keep the project context current for the next agent and close the round."
  };
}
function arrangeRound(plan, roundId, tasks, options) {
  const delivery = tasks.filter((task2) => task2.kind === "delivery");
  const work = tasks.filter((task2) => task2.kind !== "delivery");
  const firstFunctional = work.findIndex(
    (task2) => task2.kind === "work" && functionalFiles(task2).length > 0
  );
  const hasQuality = plan.tasks.some(
    (task2) => task2.kind === "quality" && task2.status !== "DONE"
  );
  if (!(options.qualityConfigured || hasQuality) && firstFunctional >= 0) {
    const quality = buildQualityTask(plan, roundId);
    work[firstFunctional] = {
      ...work[firstFunctional],
      dependencies: [
        .../* @__PURE__ */ new Set([
          quality.id,
          ...work[firstFunctional]?.dependencies ?? []
        ])
      ]
    };
    work.splice(firstFunctional, 0, quality);
  }
  const roundWork = [
    ...plan.tasks.filter(
      (task2) => task2.roundId === roundId && task2.kind !== "docs" && task2.kind !== "delivery"
    ),
    ...work
  ];
  const documentation = work.flatMap(
    (task2) => task2.files.filter(isDocumentationPath)
  );
  const docs = buildDocsTask(roundId, [...options.docsFiles, ...documentation]);
  docs.dependencies = roundWork.map((task2) => task2.id);
  const arrangedDelivery = delivery.map((task2) => ({
    ...task2,
    dependencies: [.../* @__PURE__ */ new Set([...task2.dependencies, docs.id])]
  }));
  return [...work, docs, ...arrangedDelivery];
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-transitions.ts
function nextRevision(plan) {
  const copy = structuredClone(plan);
  copy.revision += 1;
  return copy;
}
function recomputeDelivery(plan) {
  if (!plan.scope) {
    return;
  }
  const allDone = plan.tasks.length > 0 && plan.tasks.every((task2) => task2.status === "DONE");
  if (!allDone) {
    plan.scope.delivery = "IN_PROGRESS";
    plan.scope.acceptanceNote = null;
  } else if (plan.scope.delivery === "IN_PROGRESS") {
    plan.scope.delivery = "READY_FOR_ACCEPTANCE";
  }
}
function decision2(text3, now) {
  return { at: now, text: text3 };
}
function createScope(plan, input, context) {
  ensure(
    plan.scope === null,
    "SCOPE_EXISTS",
    "The current scope is still open; close it before creating a new one."
  );
  ensure(
    context.baselineCommit,
    "NO_BASELINE",
    "The repository needs a first commit before a scope can start.",
    {},
    "Finish the kit bootstrap commit first."
  );
  checkScopeInput(input);
  const next = nextRevision(plan);
  const ids = /* @__PURE__ */ new Set();
  const tasks = input.tasks.map(
    (task2, index) => normalizeTaskInput(task2, "R1", ids, `tasks[${index}]`)
  );
  const execution = normalizeExecution(input.execution);
  next.scope = {
    acceptance: input.acceptance,
    acceptanceNote: null,
    approval: decision2(input.approval, context.now),
    baselineCommit: context.baselineCommit,
    blockedReason: null,
    context: input.context ?? [],
    decisions: (input.decisions ?? []).map(
      (text3) => decision2(text3, context.now)
    ),
    delivery: "IN_PROGRESS",
    ...execution ? { execution } : {},
    id: input.id,
    objective: input.objective,
    spec: input.spec ?? null,
    status: "ACTIVE"
  };
  next.rounds = [
    {
      digest: null,
      id: "R1",
      kind: "implementation",
      status: "OPEN",
      title: "Implementation"
    }
  ];
  next.tasks = arrangeRound(next, "R1", tasks, {
    docsFiles: input.spec ? [input.spec] : [],
    qualityConfigured: context.qualityConfigured
  });
  next.currentTaskId = null;
  return validatePlan(next);
}
function findTask(plan, taskId) {
  const task2 = plan.tasks.find((item) => item.id === taskId);
  ensure(task2, "UNKNOWN_TASK", `Task not found: ${taskId}`);
  return task2;
}
function nextReadyTask(plan) {
  const current = plan.tasks.find((task2) => task2.id === plan.currentTaskId);
  if (current) {
    return current;
  }
  const done = new Set(
    plan.tasks.filter((task2) => task2.status === "DONE").map((task2) => task2.id)
  );
  return plan.tasks.find(
    (task2) => task2.status === "TODO" && task2.dependencies.every((id) => done.has(id))
  ) ?? null;
}
function startTask(plan, taskId, confirmation) {
  ensure(
    plan.scope?.status === "ACTIVE",
    "SCOPE_NOT_ACTIVE",
    "Implementation needs an ACTIVE scope."
  );
  const task2 = findTask(plan, taskId);
  if (plan.currentTaskId === taskId) {
    return plan;
  }
  ensure(
    plan.currentTaskId === null,
    "TASK_ALREADY_ACTIVE",
    `Task ${plan.currentTaskId} is in progress; finish it first.`
  );
  ensure(
    task2.status === "TODO",
    "TASK_NOT_TODO",
    `Task ${taskId} is already ${task2.status}.`
  );
  const pending = task2.dependencies.filter(
    (id) => findTask(plan, id).status !== "DONE"
  );
  ensure(
    pending.length === 0,
    "DEPENDENCY_PENDING",
    `Finish the dependencies first: ${pending.join(", ")}`,
    { pending }
  );
  ensure(
    task2.kind !== "delivery" || (confirmation ?? "").trim() !== "",
    "DELIVERY_CONFIRMATION",
    'Delivery tasks start only with the user\'s confirmation (`--confirmed "..."`).'
  );
  const next = nextRevision(plan);
  const started = findTask(next, taskId);
  started.status = "IN_PROGRESS";
  if (started.kind === "delivery") {
    started.confirmation = confirmation;
  }
  next.currentTaskId = taskId;
  return validatePlan(next);
}
function blockScope(plan, reason) {
  ensure(
    plan.scope?.status === "ACTIVE",
    "SCOPE_NOT_ACTIVE",
    "Only an ACTIVE scope can be blocked."
  );
  ensure(
    typeof reason === "string" && reason.trim() !== "",
    "BLOCK_REASON",
    "Give the reason of the block."
  );
  const next = nextRevision(plan);
  if (next.scope) {
    next.scope.status = "BLOCKED";
    next.scope.blockedReason = reason.trim();
  }
  return validatePlan(next);
}
function unblockScope(plan) {
  ensure(
    plan.scope?.status === "BLOCKED",
    "SCOPE_NOT_BLOCKED",
    "The scope is not blocked."
  );
  const next = nextRevision(plan);
  if (next.scope) {
    next.scope.status = "ACTIVE";
    next.scope.blockedReason = null;
  }
  return validatePlan(next);
}
function closeFinishedRounds(plan) {
  for (const round of plan.rounds) {
    const tasks = plan.tasks.filter((task2) => task2.roundId === round.id);
    if (round.status === "OPEN" && round.digest && tasks.every((task2) => task2.status === "DONE")) {
      round.status = "CLOSED";
    }
  }
}
function completeTask(plan, taskId, digest) {
  ensure(
    plan.currentTaskId === taskId,
    "TASK_NOT_ACTIVE",
    `Start the task first: task:start ${taskId}`
  );
  const next = nextRevision(plan);
  const task2 = findTask(next, taskId);
  task2.status = "DONE";
  next.currentTaskId = null;
  if (task2.kind === "docs") {
    validateDigest(digest);
    const round = next.rounds.find((item) => item.id === task2.roundId);
    if (round && digest) {
      round.digest = {
        contracts: [...digest.contracts],
        decisions: [...digest.decisions],
        references: [...digest.references],
        result: digest.result
      };
    }
  }
  closeFinishedRounds(next);
  recomputeDelivery(next);
  return validatePlan(next);
}
function integrateTask(plan, taskId, integration2) {
  ensure(
    plan.scope?.execution?.strategy === "orchestrated",
    "NOT_ORCHESTRATED",
    "Only a task of an orchestrated scope is integrated."
  );
  const kind = findTask(plan, taskId).kind;
  ensure(
    kind === "work" || kind === "docs",
    "TASK_KIND",
    `${taskId} is a ${kind} task; only work and DOCS tasks are integrated.`
  );
  const next = completeTask(
    startTask(plan, taskId, null),
    taskId,
    integration2.digest
  );
  next.revision = plan.revision + 1;
  findTask(next, taskId).integration = {
    operationId: integration2.operationId,
    sourceCommit: integration2.sourceCommit
  };
  return validatePlan(next);
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-scope-completion.ts
function acceptScope(plan, note, now) {
  ensure(
    plan.scope?.delivery === "READY_FOR_ACCEPTANCE",
    "NOT_READY",
    "Acceptance needs every task DONE (READY_FOR_ACCEPTANCE)."
  );
  ensure(
    typeof note === "string" && note.trim().length >= 3,
    "ACCEPTANCE_NOTE",
    "Record the user's acceptance words in --note."
  );
  const next = nextRevision(plan);
  if (next.scope) {
    next.scope.delivery = "ACCEPTED";
    next.scope.acceptanceNote = { at: now, text: note.trim() };
  }
  return validatePlan(next);
}
function closeScope(plan, scopeId, note, now) {
  ensure(
    plan.scope && plan.scope.id === scopeId,
    "SCOPE_ID",
    "Pass the exact id of the scope to close (--scope)."
  );
  ensure(
    plan.scope.delivery === "ACCEPTED",
    "NOT_ACCEPTED",
    "Only an ACCEPTED scope closes; record acceptance first."
  );
  ensure(
    typeof note === "string" && note.trim().length >= 10,
    "USER_CLOSE_REQUIRED",
    "Closing needs the user's direct command in --note; acceptance alone is not one."
  );
  const closed = emptyPlan(plan.projectId, plan.projectName);
  closed.revision = plan.revision + 1;
  closed.lastClosed = { closedAt: now, scopeId };
  return validatePlan(closed);
}
function carryoverScope(plan, input, context) {
  const scope = plan.scope;
  ensure(scope, "NO_SCOPE", "There is no scope to carry over.");
  checkCarryoverInput(input);
  ensure(
    context.baselineCommit,
    "NO_BASELINE",
    "carryover needs the current HEAD."
  );
  const done = new Set(
    plan.tasks.filter((task2) => task2.status === "DONE").map((task2) => task2.id)
  );
  const unfinished = plan.tasks.filter(
    (task2) => task2.status !== "DONE" && task2.kind !== "docs"
  );
  ensure(
    unfinished.length > 0,
    "NOTHING_TO_CARRY",
    "Every task is DONE; accept and close the scope instead."
  );
  const next = nextRevision(plan);
  const tasks = unfinished.map((task2) => ({
    ...structuredClone(task2),
    confirmation: null,
    dependencies: task2.dependencies.filter(
      (id) => !done.has(id) && unfinished.some((item) => item.id === id)
    ),
    fixes: unfinished.some((item) => item.id === task2.fixes) ? task2.fixes : null,
    roundId: "R1",
    status: "TODO"
  }));
  next.lastClosed = { closedAt: context.now, scopeId: scope.id };
  next.scope = {
    ...structuredClone(scope),
    acceptanceNote: null,
    approval: { at: context.now, text: input.approval.trim() },
    baselineCommit: context.baselineCommit,
    blockedReason: null,
    decisions: [
      {
        at: context.now,
        text: `Carried over unfinished tasks from scope ${scope.id}.`
      }
    ],
    delivery: "IN_PROGRESS",
    id: input.id,
    objective: input.objective ?? scope.objective,
    status: "ACTIVE"
  };
  next.rounds = [
    {
      digest: null,
      id: "R1",
      kind: "implementation",
      status: "OPEN",
      title: "Carried over"
    }
  ];
  next.tasks = [];
  next.currentTaskId = null;
  next.tasks = arrangeRound(
    next,
    "R1",
    tasks.filter((task2) => task2.kind !== "quality"),
    {
      docsFiles: scope.spec ? [scope.spec] : [],
      qualityConfigured: context.qualityConfigured
    }
  );
  return validatePlan(next);
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-rounds.ts
var ROUND_NUMBER_PATTERN = /^R([0-9]+)$/u;
function nextRoundId(plan) {
  const numbers = plan.rounds.map(
    (round) => Number(ROUND_NUMBER_PATTERN.exec(round.id)?.[1] ?? 0)
  );
  return `R${Math.max(0, ...numbers) + 1}`;
}
function roundTasks(plan, roundId) {
  return plan.tasks.filter((task2) => task2.roundId === roundId);
}
function docsDone(plan, round) {
  return roundTasks(plan, round.id).some(
    (task2) => task2.kind === "docs" && task2.status === "DONE"
  );
}
function needsQuality(plan, tasks, qualityConfigured) {
  const pending = plan.tasks.some(
    (task2) => task2.kind === "quality" && task2.status !== "DONE"
  );
  return !(qualityConfigured || pending) && tasks.some(
    (task2) => task2.kind === "work" && functionalFiles(task2).length > 0
  );
}
function startNewRound(plan, input, tasks, context) {
  const last = plan.rounds.at(-1);
  const roundId = nextRoundId(plan);
  let carried = [];
  if (last && last.status === "OPEN") {
    const pending = roundTasks(plan, last.id).filter(
      (task2) => task2.status !== "DONE"
    );
    ensure(
      pending.every(
        (task2) => task2.kind === "delivery" && task2.status === "TODO"
      ),
      "ROUND_OPEN",
      `Round ${last.id} still has unfinished work; extend it with round "current".`
    );
    carried = pending.map((task2) => ({
      ...task2,
      dependencies: task2.dependencies.filter(
        (id) => id !== docsTaskId(last.id)
      ),
      roundId
    }));
    plan.tasks = plan.tasks.filter(
      (task2) => !carried.some((item) => item.id === task2.id)
    );
    last.status = "CLOSED";
  }
  plan.rounds.push({
    digest: null,
    id: roundId,
    kind: input.kind ?? "fixes",
    status: "OPEN",
    title: input.title ?? "Fixes"
  });
  for (const task2 of tasks) {
    task2.roundId = roundId;
  }
  plan.tasks.push(
    ...arrangeRound(plan, roundId, [...tasks, ...carried], {
      docsFiles: [],
      qualityConfigured: context.qualityConfigured
    })
  );
  return roundId;
}
function insertBefore(list, task2, beforeId, fallbackId) {
  const target = beforeId ?? fallbackId;
  const index = list.findIndex((item) => item.id === target);
  ensure(index >= 0, "UNKNOWN_TASK", `Task not found for insertion: ${target}`);
  const anchor = list[index];
  ensure(
    beforeId === void 0 || anchor?.status === "TODO",
    "TASK_STARTED",
    `Insert only before a task that has not started: ${target}`
  );
  if (beforeId !== void 0 && anchor) {
    anchor.dependencies = [.../* @__PURE__ */ new Set([...anchor.dependencies, task2.id])];
  }
  list.splice(index, 0, task2);
}
function addQualityIfNeeded(plan, roundId, placed, context) {
  const work = placed.map((item) => item.task).filter((task2) => task2.kind !== "delivery");
  if (!needsQuality(plan, work, context.qualityConfigured)) {
    return;
  }
  const quality = buildQualityTask(plan, roundId);
  const firstFunctional = placed.find(
    (item) => item.task.kind === "work" && functionalFiles(item.task).length > 0
  );
  if (firstFunctional) {
    firstFunctional.task.dependencies = [
      .../* @__PURE__ */ new Set([quality.id, ...firstFunctional.task.dependencies])
    ];
    placed.splice(placed.indexOf(firstFunctional), 0, {
      before: firstFunctional.before,
      task: quality
    });
  }
}
function extendOpenRound(plan, round, placed, context) {
  const docs = plan.tasks.find((task2) => task2.id === docsTaskId(round.id));
  ensure(docs, "DOCS_TASK", `Round ${round.id} has no DOCS task.`);
  let deferred = null;
  if (docs.status === "IN_PROGRESS") {
    docs.status = "TODO";
    plan.currentTaskId = null;
    deferred = docs.id;
  }
  addQualityIfNeeded(plan, round.id, placed, context);
  for (const { before, task: task2 } of placed.filter(
    (item) => item.task.kind !== "delivery"
  )) {
    insertBefore(plan.tasks, task2, before, docs.id);
  }
  for (const { task: task2 } of placed.filter(
    (item) => item.task.kind === "delivery"
  )) {
    plan.tasks.push({
      ...task2,
      dependencies: [.../* @__PURE__ */ new Set([...task2.dependencies, docs.id])]
    });
  }
  const roundWork = roundTasks(plan, round.id).filter(
    (task2) => task2.kind === "work" || task2.kind === "quality"
  );
  docs.dependencies = roundWork.map((task2) => task2.id);
  docs.files = [
    .../* @__PURE__ */ new Set([
      ...docs.files,
      ...roundWork.flatMap((task2) => task2.files.filter(isDocumentationPath))
    ])
  ];
  return deferred;
}
function extendPlan(plan, input, context) {
  ensure(
    plan.scope !== null,
    "NO_SCOPE",
    "There is no active scope to extend."
  );
  checkExtendInput(input);
  const next = nextRevision(plan);
  const ids = new Set(next.tasks.map((task2) => task2.id));
  const last = next.rounds.at(-1);
  const wantsNew = input.round === "new" || !last || last.status === "CLOSED" || docsDone(next, last);
  const targetId = wantsNew ? nextRoundId(next) : last?.id ?? "R1";
  const placed = input.tasks.map((source, index) => ({
    before: source.before,
    task: normalizeTaskInput(source, targetId, ids, `tasks[${index}]`)
  }));
  let deferred = null;
  let roundId = targetId;
  if (wantsNew) {
    ensure(
      placed.every((item) => item.before === void 0),
      "PLAN_SCHEMA",
      "`before` applies only to the current round.",
      { field: "tasks[].before" }
    );
    roundId = startNewRound(
      next,
      input,
      placed.map((item) => item.task),
      context
    );
  } else if (last) {
    deferred = extendOpenRound(next, last, placed, context);
  }
  recomputeDelivery(next);
  return { deferredDocsTaskId: deferred, plan: validatePlan(next), roundId };
}
function deferDocs(plan) {
  const current = plan.tasks.find((task2) => task2.id === plan.currentTaskId);
  ensure(
    current?.kind === "docs",
    "NOT_DOCS",
    "The current task is not a DOCS task."
  );
  const next = nextRevision(plan);
  const docs = next.tasks.find((task2) => task2.id === current.id);
  if (docs) {
    docs.status = "TODO";
  }
  next.currentTaskId = null;
  return validatePlan(next);
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/workflow-plan-facade.ts
var WorkflowPlanFacade = class {
  createEmpty(projectId, projectName) {
    return emptyPlan(projectId, projectName);
  }
  validate(plan) {
    return validatePlan(plan);
  }
  validateDigest(digest) {
    validateDigest(digest);
  }
  /**
   * Input descriptor of a plan command (`scope:create`, `scope:propose`,
   * `plan:extend`, `task:update`, `carryover`, `digest`), or null.
   */
  inputSchema(command) {
    return planInputSchema(command);
  }
  /** Commands with a plan input descriptor, in a stable order. */
  inputSchemaCommands() {
    return planInputSchemaCommands();
  }
  render(plan) {
    return renderPlanDocument(plan);
  }
  parse(text3, options) {
    return parsePlanDocument(text3, options);
  }
  isPlanDocument(text3) {
    return isWorkflowPlanDocument(text3);
  }
  planFile(root) {
    return path8.join(root, ...PLAN_PATH.split("/"));
  }
  /** Reads the project plan; returns null when the project has no plan file. */
  read(root, options) {
    const text3 = workflowPlatformFacade.readTextIfExists(this.planFile(root));
    return text3 === null ? null : parsePlanDocument(text3, options);
  }
  createScope(plan, input, context) {
    return createScope(plan, input, context);
  }
  startTask(plan, taskId, confirmation = null) {
    return startTask(plan, taskId, confirmation);
  }
  completeTask(plan, taskId, digest = null) {
    return completeTask(plan, taskId, digest);
  }
  /** DONE through an integration commit of an orchestrated scope (spec 7). */
  integrateTask(plan, taskId, integration2) {
    return integrateTask(plan, taskId, integration2);
  }
  block(plan, reason) {
    return blockScope(plan, reason);
  }
  unblock(plan) {
    return unblockScope(plan);
  }
  extend(plan, input, context) {
    return extendPlan(plan, input, context);
  }
  deferDocs(plan) {
    return deferDocs(plan);
  }
  accept(plan, note, now) {
    return acceptScope(plan, note, now);
  }
  close(plan, scopeId, note, now) {
    return closeScope(plan, scopeId, note, now);
  }
  carryover(plan, input, context) {
    return carryoverScope(plan, input, context);
  }
  task(plan, taskId) {
    return findTask(plan, taskId);
  }
  /** The current task, or the first TODO task whose dependencies are DONE. */
  nextTask(plan) {
    return nextReadyTask(plan);
  }
  /** The scope execution block; a plan without one is sequential. */
  execution(plan) {
    return scopeExecution(plan.scope);
  }
  /** Kit-computed fact: at least one pair of tasks may run in parallel. */
  hasParallelWork(plan) {
    return hasParallelWork(plan);
  }
  /** Whether two tasks of the plan may run at the same time (spec section 2). */
  compatibleTasks(plan, firstId, secondId) {
    return compatibleTasks(plan, firstId, secondId);
  }
  write(root, plan) {
    const text3 = renderPlanDocument(plan);
    workflowPlatformFacade.writeFileAtomic(this.planFile(root), text3);
    return text3;
  }
};
var workflowPlanFacade = new WorkflowPlanFacade();

// product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-transaction.ts
import {
  copyFileSync,
  existsSync as existsSync5,
  mkdirSync as mkdirSync2,
  readFileSync as readFileSync5,
  rmSync as rmSync3
} from "node:fs";
import path10 from "node:path";

// product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-staging.ts
import { existsSync as existsSync4 } from "node:fs";
import path9 from "node:path";
function ignoredPaths(git, root, files) {
  if (files.length === 0) {
    return /* @__PURE__ */ new Set();
  }
  const output = git.run(root, ["check-ignore", "-z", "--stdin"], {
    allowFailure: true,
    input: `${files.join("\0")}\0`
  });
  ensure(
    output.status === 0 || output.status === 1,
    "GIT_FAILED",
    `git check-ignore failed: ${output.stderr.trim() || output.stdout.trim()}`,
    { args: ["check-ignore", "-z", "--stdin"], status: output.status }
  );
  return new Set(output.stdout.split("\0").filter(Boolean));
}
function absentPaths(git, root, files) {
  if (files.length === 0) {
    return /* @__PURE__ */ new Set();
  }
  const tracked = new Set(
    git.run(root, ["ls-files", "-z", "--", ...files]).stdout.split("\0").filter(Boolean)
  );
  const untracked = files.filter((file4) => !tracked.has(file4));
  const existing = new Set(
    untracked.filter((file4) => existsSync4(path9.join(root, ...file4.split("/"))))
  );
  const ignored = ignoredPaths(git, root, [...existing]);
  return new Set(
    untracked.filter((file4) => !existing.has(file4) || ignored.has(file4))
  );
}
function stage(git, root, files) {
  const absent = absentPaths(git, root, files);
  const stageable = files.filter((file4) => !absent.has(file4));
  if (stageable.length > 0) {
    git.run(root, ["add", "-A", "--", ...stageable]);
  }
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-transaction.ts
var COMMIT_TIMEOUT_MS = 30 * 60 * 1e3;
var NEXT_ACTION_RETRY = "Fix the reported problem and repeat the same command; your edits are kept.";
function head(git, root) {
  const output = git.run(root, ["rev-parse", "--verify", "-q", "HEAD"], {
    allowFailure: true
  });
  return output.status === 0 ? output.stdout.trim() : null;
}
function mergeHead(git, root) {
  const output = git.run(
    root,
    ["rev-parse", "--verify", "-q", "MERGE_HEAD^{commit}"],
    { allowFailure: true }
  );
  return output.status === 0 ? output.stdout.trim() : null;
}
function planAbsolute(root, planPath) {
  return path10.join(root, ...planPath.split("/"));
}
function indexFile(git, root) {
  return git.text(root, [
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    "index"
  ]);
}
function confirmedCommit(git, root, journal) {
  const now = head(git, root);
  if (!now || now === journal.beforeHead) {
    return null;
  }
  const [commit2] = readHistory(git, root, journal.beforeHead, now, {
    firstParent: true
  }).slice(-1);
  if (!commit2 || commit2.trailers["Workflow-Transaction"]?.[0] !== journal.id) {
    return null;
  }
  const parents = [journal.beforeHead, journal.sourceCommit ?? null].filter(
    (sha) => sha !== null
  );
  ensure(
    commit2.parents.join(" ") === parents.join(" "),
    "TRANSACTION_PARENT",
    "The commit parents do not match the transaction."
  );
  ensure(
    git.text(root, ["rev-parse", "HEAD^{tree}"]) === journal.candidateTree,
    "TRANSACTION_TREE",
    "The commit content differs from the prepared candidate."
  );
  return now;
}
function pendingEvidence(root, journal) {
  return localPath(root, "verification", `pending-${journal.id}.json`);
}
function finalize(root, journal, sha) {
  const pending = pendingEvidence(root, journal);
  if (existsSync5(pending)) {
    const evidence = {
      ...JSON.parse(readFileSync5(pending, "utf8")),
      commit: sha
    };
    const text3 = `${JSON.stringify(evidence, null, 2)}
`;
    workflowPlatformFacade.writeFileAtomic(
      localPath(root, "verification", `${sha}.json`),
      text3
    );
    workflowPlatformFacade.writeFileAtomic(
      localPath(root, "verification", "last.json"),
      text3
    );
    rmSync3(pending, { force: true });
  }
  workflowPlatformFacade.writeFileAtomic(
    localPath(root, "last-commit.json"),
    `${JSON.stringify({ role: journal.role, scopeId: journal.scopeId, sha, taskId: journal.taskId, transaction: journal.id }, null, 2)}
`
  );
  removeJournal(root);
  return {
    excluded: journal.excluded,
    role: journal.role,
    sha,
    taskId: journal.taskId
  };
}
function rollback(git, root, journal) {
  const plan = planAbsolute(root, journal.planPath);
  const untouched = head(git, root) === journal.beforeHead && existsSync5(plan) && sha256(readFileSync5(plan)) === journal.candidateHash && git.text(root, ["write-tree"]) === journal.candidateTree;
  if (!untouched) {
    return false;
  }
  discardPreparation(git, root, journal);
  return true;
}
function discardPreparation(git, root, journal) {
  const backup = localPath(root, "index-before");
  const plan = planAbsolute(root, journal.planPath);
  if (existsSync5(backup)) {
    workflowPlatformFacade.writeFileAtomic(
      indexFile(git, root),
      readFileSync5(backup)
    );
  } else if (journal.beforeHead) {
    git.run(root, ["read-tree", journal.beforeHead]);
  } else {
    git.run(root, ["read-tree", "--empty"]);
  }
  if (journal.originalPlan === null) {
    rmSync3(plan, { force: true });
  } else {
    workflowPlatformFacade.writeFileAtomic(plan, journal.originalPlan);
  }
  workflowPlatformFacade.writeFileAtomic(
    localPath(root, "verification", `failed-${journal.id}.json`),
    `${JSON.stringify(journal, null, 2)}
`
  );
  rmSync3(pendingEvidence(root, journal), { force: true });
  removeJournal(root);
}
function prepareJournal(git, root, request, id) {
  const plan = planAbsolute(root, request.planPath);
  const originalPlan = existsSync5(plan) ? readFileSync5(plan, "utf8") : null;
  const index = indexFile(git, root);
  if (existsSync5(index)) {
    copyFileSync(index, localPath(root, "index-before"));
  }
  return {
    assignmentId: request.assignmentId ?? null,
    beforeHead: head(git, root),
    candidateHash: sha256(request.planText),
    candidatePlan: request.planText,
    candidateTree: null,
    checkedSnapshot: null,
    checks: request.checks ?? [],
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    error: null,
    excluded: request.excluded ?? [],
    id,
    iteration: request.iteration ?? 1,
    message: request.message,
    originalPlan,
    phase: "PREPARING",
    planPath: request.planPath,
    role: request.role,
    schema: 1,
    scopeId: request.scopeId,
    selected: [.../* @__PURE__ */ new Set([...request.files, request.planPath])].sort(),
    sourceCommit: request.sourceCommit ?? null,
    taskId: request.taskId
  };
}
function commitCandidate(git, root, request, id) {
  ensure(
    readJournal(root) === null,
    "TRANSACTION_PENDING",
    "Another commit transaction is unfinished.",
    {},
    "Run `scripts/workflow repair` to finish or cancel it."
  );
  const merging = mergeHead(git, root);
  ensure(
    merging === (request.sourceCommit ?? null),
    request.sourceCommit ? "MERGE_REQUIRED" : "MERGE_IN_PROGRESS",
    request.sourceCommit ? `An integration commit needs the merge of ${request.sourceCommit} in progress.` : "A merge is in progress; only the integration of its source commits it.",
    { mergeHead: merging, source: request.sourceCommit ?? null },
    request.sourceCommit ? "Run `scripts/workflow integration:continue --id <assignment>`." : "Finish it with `scripts/workflow integration:continue --id <assignment>` or abort it with `git merge --abort`."
  );
  const staged = readChanges(git, root).staged;
  const allowed = /* @__PURE__ */ new Set([...request.files, request.planPath]);
  const foreign = staged.filter((file4) => !allowed.has(file4));
  ensure(
    foreign.length === 0,
    "FOREIGN_STAGED",
    "The index holds files outside this operation; unstage them first.",
    { paths: foreign }
  );
  const identity = requireCommitIdentity(git, root);
  mkdirSync2(localPath(root), { recursive: true });
  const journal = prepareJournal(git, root, request, id);
  saveJournal(root, journal);
  request.prepare?.(request.files);
  workflowPlatformFacade.writeFileAtomic(
    planAbsolute(root, request.planPath),
    request.planText
  );
  stage(git, root, journal.selected);
  const hasChanges = git.run(root, ["diff", "--cached", "--quiet"], { allowFailure: true }).status === 1;
  if (!hasChanges) {
    rollback(git, root, {
      ...journal,
      candidateTree: git.text(root, ["write-tree"])
    });
    throw new WorkflowError(
      "NOTHING_TO_COMMIT",
      "There are no changes to commit."
    );
  }
  journal.candidateTree = git.text(root, ["write-tree"]);
  journal.phase = "PREPARED";
  saveJournal(root, journal);
  const result2 = git.run(
    root,
    [...identityArgs(identity), "commit", "-q", "-F", "-"],
    {
      allowFailure: true,
      env: identityEnv(identity),
      input: commitMessageFor(journal),
      timeoutMs: COMMIT_TIMEOUT_MS
    }
  );
  if (result2.status !== 0) {
    const failed2 = {
      ...readJournal(root) ?? journal,
      error: `${result2.stderr}${result2.stdout}`.slice(-8e3),
      phase: "FAILED"
    };
    saveJournal(root, failed2);
    const restored = rollback(git, root, failed2);
    throw new WorkflowError(
      "COMMIT_FAILED",
      restored ? "A commit check failed. The plan and index were restored; your edits are kept." : "The commit failed and the project changed concurrently; the journal is kept.",
      { output: failed2.error, retryable: restored },
      restored ? NEXT_ACTION_RETRY : "Run `scripts/workflow repair`."
    );
  }
  const sha = confirmedCommit(git, root, journal);
  ensure(
    sha,
    "COMMIT_NOT_CONFIRMED",
    "Git finished but the expected commit was not found.",
    {},
    "Run `scripts/workflow repair`."
  );
  return finalize(root, readJournal(root) ?? journal, sha);
}
function finishConfirmed(git, root) {
  const journal = readJournal(root);
  if (!journal) {
    return null;
  }
  const sha = confirmedCommit(git, root, journal);
  return sha ? finalize(root, journal, sha) : null;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-repair.ts
var MESSAGES = {
  "defer-docs": "Move the in-progress DOCS task back to TODO until the added work is done; files are kept.",
  "finish-commit": "The commit exists; finish the transaction bookkeeping.",
  none: "No damage found.",
  projection: "Rebuild the readable part of the plan from its JSON state.",
  "retry-commit": "Repeat the prepared commit transaction; edits are kept."
};
function head2(git, root) {
  return git.run(root, ["rev-parse", "--verify", "-q", "HEAD"], { allowFailure: true }).stdout.trim();
}
function planText(root, planPath) {
  return workflowPlatformFacade.readTextIfExists(
    path11.join(root, ...planPath.split("/"))
  ) ?? "";
}
function detect(git, root, planPath) {
  const journal = readJournal(root);
  if (journal) {
    return confirmedCommit(git, root, journal) ? "finish-commit" : "retry-commit";
  }
  const text3 = planText(root, planPath);
  if (!workflowPlanFacade.isPlanDocument(text3)) {
    return "none";
  }
  const plan = workflowPlanFacade.parse(text3, { projection: false });
  if (workflowPlanFacade.render(plan) !== text3.replaceAll("\r\n", "\n")) {
    return "projection";
  }
  const current = plan.tasks.find((task2) => task2.id === plan.currentTaskId);
  const waiting = current?.kind === "docs" && current.dependencies.some(
    (id) => plan.tasks.find((task2) => task2.id === id)?.status !== "DONE"
  );
  return waiting ? "defer-docs" : "none";
}
function planRepair(git, root, planPath) {
  const kind = detect(git, root, planPath);
  const journal = readJournal(root);
  const repairId = sha256(
    JSON.stringify([
      kind,
      head2(git, root),
      sha256(planText(root, planPath)),
      journal?.id ?? null
    ])
  ).slice(0, 24);
  return { kind, message: MESSAGES[kind], repairId };
}
function retry(git, root, repairId) {
  const journal = readJournal(root);
  ensure(journal, "NO_TRANSACTION", "There is no transaction to retry.");
  ensure(
    rollback(git, root, journal),
    "REPAIR_MANUAL",
    "HEAD, plan or index changed after preparation; the prepared commit cannot be repeated.",
    {},
    `Cancel the preparation with \`scripts/workflow repair --cancel ${repairId}\` (working-tree edits are kept), then repeat the commit command.`
  );
  return commitCandidate(
    git,
    root,
    {
      assignmentId: journal.assignmentId ?? null,
      checks: journal.checks,
      excluded: journal.excluded,
      files: journal.selected.filter((file4) => file4 !== journal.planPath),
      iteration: journal.iteration,
      message: journal.message,
      planPath: journal.planPath,
      planText: journal.candidatePlan,
      role: journal.role,
      scopeId: journal.scopeId,
      sourceCommit: journal.sourceCommit ?? null,
      taskId: journal.taskId
    },
    journal.id
  );
}
function applyRepair(git, root, planPath, repairId) {
  const planned = planRepair(git, root, planPath);
  ensure(
    planned.repairId === repairId,
    "REPAIR_CHANGED",
    "The project changed; run `repair` again for a fresh id."
  );
  if (planned.kind === "finish-commit") {
    return {
      commit: finishConfirmed(git, root),
      kind: planned.kind,
      message: planned.message
    };
  }
  if (planned.kind === "retry-commit") {
    return {
      commit: retry(git, root, repairId),
      kind: planned.kind,
      message: planned.message
    };
  }
  const text3 = readFileSync6(path11.join(root, ...planPath.split("/")), "utf8");
  const plan = workflowPlanFacade.parse(text3, { projection: false });
  if (planned.kind === "projection") {
    workflowPlanFacade.write(root, plan);
  } else if (planned.kind === "defer-docs") {
    workflowPlanFacade.write(root, workflowPlanFacade.deferDocs(plan));
  }
  return { commit: null, kind: planned.kind, message: planned.message };
}
function cancelRepair(git, root, planPath, repairId) {
  const planned = planRepair(git, root, planPath);
  ensure(
    planned.repairId === repairId,
    "REPAIR_CHANGED",
    "The project changed; run `repair` again for a fresh id."
  );
  ensure(
    planned.kind === "retry-commit",
    "NO_PREPARATION",
    "Only an unconfirmed commit preparation can be cancelled."
  );
  const journal = readJournal(root);
  ensure(journal, "NO_PREPARATION", "There is no preparation to cancel.");
  if (rollback(git, root, journal)) {
    return {
      commit: null,
      kind: "cancel",
      message: "Preparation cancelled; edits are kept and the task stays open."
    };
  }
  const now = head2(git, root) || null;
  ensure(
    now === journal.beforeHead,
    "REPAIR_MANUAL",
    `HEAD moved from ${journal.beforeHead ?? "no commit"} to ${now ?? "no commit"} after the preparation; the Kit does not undo commits.`,
    { beforeHead: journal.beforeHead, head: now },
    journal.beforeHead ? `Ask the user. To cancel the preparation, return HEAD with \`git reset --soft ${journal.beforeHead}\` (every change stays in the working tree) and run \`scripts/workflow repair\` again.` : "Ask the user how to resolve it; the Kit cannot restore a repository that had no commit."
  );
  discardPreparation(git, root, journal);
  return {
    commit: null,
    kind: "cancel",
    message: "Preparation cancelled: the index and plan were restored from before the preparation; working-tree files are kept and the task stays open."
  };
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-runner.ts
var DEFAULT_TIMEOUT_MS = 12e4;
var GitRunner = class {
  env;
  platform;
  constructor(platform, env) {
    this.platform = platform;
    this.env = env;
  }
  run(root, args, options = {}) {
    const result2 = this.platform.run({
      args,
      cwd: root,
      env: options.env ? { ...this.env, ...options.env } : this.env,
      executable: "git",
      input: options.input,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    });
    ensure(
      result2.errorMessage === null || result2.status !== null,
      "GIT_UNAVAILABLE",
      `Git could not run: ${result2.errorMessage ?? "unknown error"}`,
      {},
      "Install Git and make sure it is on PATH."
    );
    const output = {
      status: result2.status ?? 1,
      stderr: result2.stderr,
      stdout: result2.stdout
    };
    ensure(
      options.allowFailure || output.status === 0,
      "GIT_FAILED",
      `git ${args.join(" ")} failed: ${output.stderr.trim() || output.stdout.trim()}`,
      { args, status: output.status }
    );
    return output;
  }
  text(root, args, options = {}) {
    return this.run(root, args, options).stdout.trim();
  }
  succeeds(root, args) {
    return this.run(root, args, { allowFailure: true }).status === 0;
  }
};

// product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-task-files.ts
import { existsSync as existsSync6, lstatSync, readFileSync as readFileSync7, readlinkSync } from "node:fs";
import path12 from "node:path";
var PRIVATE_PATTERNS = [
  /(?:^|\/)\.env(?:\.[^/]*)?$/u,
  /\.(?:pem|key|p12|pfx)$/iu,
  /(?:^|\/)id_(?:rsa|ed25519|ecdsa)(?:\.pub)?$/u,
  /(?:^|\/)\.npmrc$/u
];
var KIT_MANAGED_PREFIXES = [
  ".harness/workflow/",
  ".harness/plans/",
  ".harness/runtime/"
];
function isPrivatePath(file4) {
  return PRIVATE_PATTERNS.some((pattern) => pattern.test(file4));
}
function isKitManagedPath(file4) {
  return KIT_MANAGED_PREFIXES.some((prefix) => file4.startsWith(prefix));
}
function baselineFile(root, identity) {
  const key = sha256(
    JSON.stringify([identity.scopeId, identity.taskId, identity.iteration])
  ).slice(0, 24);
  return localPath(root, "task-files", `${key}.json`);
}
function fingerprint(root, file4) {
  const absolute2 = path12.join(root, ...file4.split("/"));
  const stat = lstatSync(absolute2, { throwIfNoEntry: false });
  if (!stat) {
    return "deleted";
  }
  if (stat.isSymbolicLink()) {
    return `link:${readlinkSync(absolute2)}`;
  }
  return stat.isDirectory() ? "directory" : sha256(readFileSync7(absolute2));
}
function recordBaseline(root, identity, changed) {
  const preexisting = changed.filter((file4) => !isKitManagedPath(file4));
  const baseline = {
    ...identity,
    fingerprints: Object.fromEntries(
      preexisting.map((file4) => [file4, fingerprint(root, file4)])
    ),
    preexisting
  };
  workflowPlatformFacade.writeFileAtomic(
    baselineFile(root, identity),
    `${JSON.stringify(baseline, null, 2)}
`
  );
  return baseline;
}
function readBaseline(root, identity) {
  const file4 = baselineFile(root, identity);
  return existsSync6(file4) ? JSON.parse(readFileSync7(file4, "utf8")) : null;
}
function selectTaskFiles(root, identity, changed, explicit) {
  const baseline = readBaseline(root, identity);
  let selected;
  if (explicit) {
    selected = [
      ...new Set(
        explicit.map((file4) => workflowPlatformFacade.normalizeRelative(file4))
      )
    ];
    for (const file4 of selected) {
      ensure(
        !isKitManagedPath(file4),
        "MANAGED_FILE",
        `Workflow Kit state changes only through its commands: ${file4}`,
        { path: file4 }
      );
    }
  } else {
    ensure(
      baseline,
      "TASK_FILES_UNKNOWN",
      "There is no task:start snapshot; list the files with --files.",
      {},
      `commit --task ${identity.taskId} --files '["path/to/file"]'`
    );
    const mixed = baseline.preexisting.filter(
      (file4) => changed.includes(file4) && baseline.fingerprints[file4] !== fingerprint(root, file4)
    );
    ensure(
      mixed.length === 0,
      "EXISTING_EDITS_CHANGED",
      "Files that had edits before the task changed again; choose the files explicitly with --files.",
      { paths: mixed }
    );
    selected = changed.filter(
      (file4) => !(baseline.preexisting.includes(file4) || isKitManagedPath(file4) || isPrivatePath(file4))
    );
  }
  const actual = selected.filter((file4) => changed.includes(file4)).sort();
  return {
    excluded: changed.filter(
      (file4) => !(actual.includes(file4) || isKitManagedPath(file4))
    ),
    preexisting: baseline?.preexisting ?? null,
    selected: actual
  };
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/workflow-git-facade.ts
var WorkflowGitFacade = class {
  /** The fix text of identity refusals: the two `git config --global` commands. */
  identityFix = IDENTITY_FIX_COMMANDS;
  git;
  platform;
  constructor(platform = workflowPlatformFacade, env = process.env) {
    this.platform = platform;
    this.git = new GitRunner(platform, env);
  }
  isRepository(path26) {
    return this.git.succeeds(path26, ["rev-parse", "--is-inside-work-tree"]);
  }
  topLevel(path26) {
    return this.git.text(path26, ["rev-parse", "--show-toplevel"]);
  }
  init(root, branch = "main") {
    this.git.run(root, ["init", "-q", `--initial-branch=${branch}`]);
  }
  /** Full HEAD SHA, or null in a repository without commits. */
  head(root) {
    const output = this.git.run(root, ["rev-parse", "--verify", "-q", "HEAD"], {
      allowFailure: true
    });
    return output.status === 0 ? output.stdout.trim() : null;
  }
  identity(root) {
    const name = this.git.run(root, ["config", "user.name"], { allowFailure: true }).stdout.trim();
    const email = this.git.run(root, ["config", "user.email"], { allowFailure: true }).stdout.trim();
    return name && email ? { email, name } : null;
  }
  /** Identity from one config file only (`local` or `global`); null when incomplete. */
  readIdentity(root, scope) {
    return readScopedIdentity(this.git, root, scope);
  }
  /** Local identity, else global; unusable ones are skipped. */
  resolveIdentity(root) {
    return resolveIdentity(this.git, root);
  }
  isPlaceholderIdentity(identity) {
    return isPlaceholderIdentity(identity);
  }
  /** True when the identity is neither invalid nor a placeholder. */
  isUsableIdentity(identity) {
    return isUsableIdentity(identity);
  }
  /** The GIT_IDENTITY_REQUIRED refusal (message once, fix in nextAction). */
  identityRequired(configured, suffix = "") {
    return identityRequiredError(configured, suffix);
  }
  /** Writes a validated identity to the repository-local config (GIT_IDENTITY_INVALID / GIT_IDENTITY_PLACEHOLDER otherwise). */
  writeLocalIdentity(root, identity) {
    writeLocalIdentity(this.git, root, identity);
  }
  /** `identity:set --global`: validates and writes `user.name` / `user.email` to the global config; returns the trimmed identity. */
  writeGlobalIdentity(cwd, identity) {
    return writeGlobalIdentity(this.git, cwd, identity);
  }
  changes(root) {
    return readChanges(this.git, root);
  }
  history(root, from, tip = "HEAD") {
    return readHistory(this.git, root, from, tip);
  }
  commitPaths(root, sha) {
    return readCommitPaths(this.git, root, sha);
  }
  /** Paths that differ between two commits (renames as delete plus add), sorted. */
  diffPaths(root, from, to) {
    return readDiffPaths(this.git, root, from, to);
  }
  isAncestor(root, ancestor, descendant) {
    return this.git.succeeds(root, [
      "merge-base",
      "--is-ancestor",
      ancestor,
      descendant
    ]);
  }
  /** File content at a revision (`:path` reads the index); null when absent. */
  show(root, revision, path26) {
    const output = this.git.run(root, ["show", `${revision}:${path26}`], {
      allowFailure: true
    });
    return output.status === 0 ? output.stdout : null;
  }
  config(root, key) {
    const value = this.git.run(root, ["config", "--get", key], { allowFailure: true }).stdout.trim();
    return value === "" ? null : value;
  }
  setConfig(root, key, value) {
    this.git.run(root, ["config", key, value]);
  }
  localPath(root, ...parts) {
    return localPath(root, ...parts);
  }
  isKitManagedPath(file4) {
    return isKitManagedPath(file4);
  }
  isPrivatePath(file4) {
    return isPrivatePath(file4);
  }
  /** Snapshot of the edits that existed when a task started. */
  beginTask(root, identity) {
    return recordBaseline(root, identity, this.changes(root).all);
  }
  selectTaskFiles(root, identity, explicit) {
    return selectTaskFiles(root, identity, this.changes(root).all, explicit);
  }
  /** Journaled commit transaction (see module.md). */
  get transactions() {
    return {
      cancel: (root) => {
        const journal = readJournal(root);
        return journal ? rollback(this.git, root, journal) : false;
      },
      commit: (root, request) => commitCandidate(
        this.git,
        root,
        request,
        request.transactionId ?? randomUUID()
      ),
      confirmed: (root, journal) => confirmedCommit(this.git, root, journal),
      finish: (root) => finishConfirmed(this.git, root),
      journal: (root) => readJournal(root)
    };
  }
  /**
   * Paths of `files` the commit candidate will not contain: outside the
   * index and missing on disk or ignored by git (the paths `stage` skips).
   */
  absentPaths(root, files) {
    const absent = absentPaths(this.git, root, files);
    return files.filter((file4) => absent.has(file4));
  }
  /** The commit being merged (`MERGE_HEAD`), or null without a merge in progress. */
  mergeHead(root) {
    return mergeHead(this.git, root);
  }
  /** Paths with unresolved merge conflicts, sorted. */
  conflicts(root) {
    return this.git.run(root, ["diff", "--name-only", "-z", "--diff-filter=U"]).stdout.split("\0").filter(Boolean).sort();
  }
  /** Maps each task to its commit; throws when plan and history disagree. */
  resolveReferences(root, plan, planPath) {
    return resolveTaskReferences(
      this.git,
      root,
      plan,
      planPath,
      readJournal(root)
    );
  }
  planRepair(root, planPath) {
    return planRepair(this.git, root, planPath);
  }
  applyRepair(root, planPath, repairId) {
    return applyRepair(this.git, root, planPath, repairId);
  }
  cancelRepair(root, planPath, repairId) {
    return cancelRepair(this.git, root, planPath, repairId);
  }
  /** Absolute path of a path inside the git directory (e.g. `hooks`, `index`). */
  gitPath(root, name) {
    const value = this.git.text(root, [
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      name
    ]);
    return value;
  }
};
var workflowGitFacade = new WorkflowGitFacade();

// product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-model.ts
var RECOVERY_SCHEMA = "harness-workflow-recovery/1";
var KIT_COMMAND = "scripts/workflow";
function byteLength2(text3) {
  return Buffer.byteLength(text3, "utf8");
}
function cutBytes(text3, limit) {
  if (byteLength2(text3) <= limit) {
    return text3;
  }
  let result2 = Buffer.from(text3, "utf8").subarray(0, Math.max(0, limit)).toString("utf8");
  while (result2.endsWith("\uFFFD")) {
    result2 = result2.slice(0, -1);
  }
  return result2;
}
function shortSha(sha) {
  return sha ? sha.slice(0, 8) : "none";
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/workflow-quality-facade.ts
import path16 from "node:path";

// product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-config.ts
var CONFIG_PATH = ".harness/workflow/config.json";
var CONFIG_SCHEMA = "harness-workflow-config/1";
var CHECK_ROLES = [
  "architecture",
  "audit",
  "custom",
  "duplication",
  "format",
  "installed",
  "links",
  "lint",
  "package",
  "test",
  "typecheck"
];
var CHECK_STAGES = [
  "prepare",
  "commit",
  "push",
  "delivery"
];
var ROLES = new Set(CHECK_ROLES);
var STAGES = new Set(CHECK_STAGES);
var BUILTINS = /* @__PURE__ */ new Set([
  "kit:conflict-markers",
  "kit:doc-size",
  "kit:docs-contracts",
  "kit:file-lines",
  "kit:md-links"
]);
var CHECK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
var MAX_TIMEOUT_MS = 6e5;
var DEFAULT_TIMEOUT_MS2 = 12e4;
var MIN_RECOVERY_BYTES = 8e3;
var MAX_RECOVERY_BYTES = 12e4;
var DEFAULT_BRIEF_BYTES = 6e4;
var MAX_BRIEF_BYTES = 2e5;
var error = "CONFIG_SCHEMA";
function builtinCheck(id) {
  return {
    builtin: id,
    id,
    required: true,
    role: "custom",
    stage: "commit",
    timeoutMs: DEFAULT_TIMEOUT_MS2
  };
}
function normalizeCheck(input) {
  return {
    ...input,
    required: input.required ?? false,
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS2
  };
}
function defaultConfig() {
  return {
    autopilot: { maxContinues: 40 },
    budget: {
      briefBytes: DEFAULT_BRIEF_BYTES,
      documentBytes: 28e3,
      recoveryBytes: 32e3
    },
    docs: { contracts: [] },
    policy: { maxFileLines: null, taskFileSoftLimit: null },
    quality: {
      checks: [
        builtinCheck("kit:doc-size"),
        builtinCheck("kit:md-links"),
        builtinCheck("kit:file-lines"),
        builtinCheck("kit:docs-contracts"),
        builtinCheck("kit:conflict-markers")
      ],
      packageManager: null,
      stacks: [],
      status: "DISCOVERY"
    },
    schema: CONFIG_SCHEMA
  };
}
function positiveInteger(value, field4, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  ensure(
    Number.isSafeInteger(value) && value >= min && value <= max,
    error,
    `${field4} must be an integer between ${min} and ${max}.`,
    { field: field4 }
  );
}
function validateCommand(check2, field4) {
  ensure(
    Boolean(check2.command) !== Boolean(check2.builtin),
    error,
    `Check ${check2.id} needs exactly one of command or builtin.`,
    { field: `${field4}.command` }
  );
  if (check2.builtin) {
    ensure(
      BUILTINS.has(check2.builtin),
      error,
      `Unknown builtin check: ${check2.builtin}`,
      { field: `${field4}.builtin` }
    );
    return;
  }
  const command = check2.command;
  ensure(
    command && typeof command.executable === "string" && command.executable.trim() !== "",
    error,
    `Check ${check2.id} needs command.executable.`,
    { field: `${field4}.command.executable` }
  );
  ensure(
    Array.isArray(command.args) && command.args.every((arg) => typeof arg === "string"),
    error,
    `Check ${check2.id} needs command.args as a list of strings.`,
    { field: `${field4}.command.args` }
  );
}
function validateCheck(check2, field4 = "check") {
  ensure(
    check2 && typeof check2.id === "string" && CHECK_ID_PATTERN.test(check2.id),
    error,
    `Invalid check id: ${String(check2?.id)}`,
    { field: `${field4}.id` }
  );
  ensure(
    ROLES.has(check2.role),
    error,
    `Unknown role of check ${check2.id}: ${String(check2.role)}`,
    { field: `${field4}.role` }
  );
  ensure(
    STAGES.has(check2.stage),
    error,
    `Unknown stage of check ${check2.id}: ${String(check2.stage)}`,
    { field: `${field4}.stage` }
  );
  ensure(
    typeof check2.required === "boolean",
    error,
    `Check ${check2.id} needs required: boolean.`,
    { field: `${field4}.required` }
  );
  positiveInteger(check2.timeoutMs, `${field4}.timeoutMs`, {
    max: MAX_TIMEOUT_MS
  });
  validateCommand(check2, field4);
  ensure(
    check2.appliesTo === void 0 || Array.isArray(check2.appliesTo) && check2.appliesTo.every(
      (glob) => typeof glob === "string" && glob !== ""
    ),
    error,
    `appliesTo of ${check2.id} must be a list of globs.`,
    { field: `${field4}.appliesTo` }
  );
  const artifact = check2.role === "package" || check2.role === "installed";
  ensure(
    !artifact || typeof check2.evidence === "string" && check2.evidence.trim() !== "",
    error,
    `Check ${check2.id} (${check2.role}) needs evidence describing the artifact and scenario.`,
    { field: `${field4}.evidence` }
  );
  ensure(
    check2.stage !== "delivery" || artifact,
    error,
    `Only package or installed checks run at the delivery stage: ${check2.id}`,
    { field: `${field4}.stage` }
  );
}
function validateContracts(contracts) {
  ensure(
    Array.isArray(contracts),
    error,
    "docs.contracts must map code globs to documents.",
    { field: "docs.contracts" }
  );
  for (const [index, item] of contracts.entries()) {
    const entry = `docs.contracts[${index}]`;
    ensure(
      item && typeof item.code === "string",
      error,
      "docs.contracts must map code globs to documents.",
      { field: `${entry}.code` }
    );
    ensure(
      Array.isArray(item.docs) && item.docs.length > 0,
      error,
      "docs.contracts must map code globs to documents.",
      { field: `${entry}.docs` }
    );
  }
}
function withBriefBudget(config) {
  const budget = config.budget;
  if (!budget || typeof budget !== "object" || budget.briefBytes !== void 0) {
    return config;
  }
  return {
    ...config,
    budget: { ...config.budget, briefBytes: DEFAULT_BRIEF_BYTES }
  };
}
function validateConfig(input) {
  ensure(
    input && input.schema === CONFIG_SCHEMA,
    error,
    "Unsupported workflow configuration schema."
  );
  const config = withBriefBudget(input);
  const quality = config.quality;
  ensure(
    quality && (quality.status === "DISCOVERY" || quality.status === "CONFIGURED"),
    error,
    "quality.status must be DISCOVERY or CONFIGURED."
  );
  ensure(
    Array.isArray(quality.stacks) && quality.stacks.every((stack) => typeof stack === "string"),
    error,
    "quality.stacks must be a list."
  );
  ensure(
    quality.status === "DISCOVERY" || quality.stacks.length > 0,
    error,
    "A CONFIGURED profile names at least one stack."
  );
  ensure(
    Array.isArray(quality.checks),
    error,
    "quality.checks must be a list."
  );
  for (const [index, check2] of quality.checks.entries()) {
    validateCheck(check2, `quality.checks[${index}]`);
  }
  ensure(
    new Set(quality.checks.map((check2) => check2.id)).size === quality.checks.length,
    error,
    "Check ids must be unique.",
    { field: "quality.checks" }
  );
  validateContracts(config.docs?.contracts);
  ensure(
    config.policy && (config.policy.maxFileLines === null || Number.isSafeInteger(config.policy.maxFileLines)),
    error,
    "policy.maxFileLines must be an integer or null.",
    { field: "policy.maxFileLines" }
  );
  ensure(
    config.policy.taskFileSoftLimit === null || Number.isSafeInteger(config.policy.taskFileSoftLimit),
    error,
    "policy.taskFileSoftLimit must be an integer or null.",
    { field: "policy.taskFileSoftLimit" }
  );
  positiveInteger(config.budget?.documentBytes, "budget.documentBytes");
  positiveInteger(config.budget?.recoveryBytes, "budget.recoveryBytes", {
    max: MAX_RECOVERY_BYTES,
    min: MIN_RECOVERY_BYTES
  });
  positiveInteger(config.budget.briefBytes, "budget.briefBytes", {
    max: MAX_BRIEF_BYTES,
    min: MIN_RECOVERY_BYTES
  });
  positiveInteger(config.autopilot?.maxContinues, "autopilot.maxContinues", {
    max: 1e3
  });
  ensure(
    config.host === void 0 || typeof config.host === "string" && config.host.trim() !== "",
    error,
    "host must be a non-empty string when present."
  );
  return config;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-detect.ts
import { readdirSync } from "node:fs";
import path13 from "node:path";
var STACK_ORDER = [
  "node",
  "python",
  "go",
  "rust",
  "dotnet",
  "swift",
  "jvm"
];
var MARKERS = [
  { pattern: /^(package\.json|tsconfig\.json|deno\.jsonc?)$/u, stack: "node" },
  {
    pattern: /^(pyproject\.toml|setup\.py|requirements[^/]*\.txt)$/u,
    stack: "python"
  },
  { pattern: /^go\.mod$/u, stack: "go" },
  { pattern: /^Cargo\.toml$/u, stack: "rust" },
  { pattern: /^(global\.json|.+\.csproj|.+\.sln)$/u, stack: "dotnet" },
  { pattern: /^(Package\.swift|.+\.xcodeproj)$/u, stack: "swift" },
  { pattern: /^(pom\.xml|build\.gradle(\.kts)?)$/u, stack: "jvm" }
];
var LOCK_FILES = {
  "bun.lock": "bun",
  "bun.lockb": "bun",
  "package-lock.json": "npm",
  "pnpm-lock.yaml": "pnpm",
  "poetry.lock": "poetry",
  "uv.lock": "uv",
  "yarn.lock": "yarn"
};
var NODE_MANAGERS = /* @__PURE__ */ new Set(["npm", "pnpm", "yarn", "bun"]);
var PYTHON_MANAGERS = /* @__PURE__ */ new Set(["uv", "poetry"]);
var DEFAULT_MANAGER = {
  dotnet: "dotnet",
  go: "go",
  jvm: "maven",
  node: "npm",
  python: "pip",
  rust: "cargo",
  swift: "swift"
};
var SKIPPED_DIRECTORIES = /* @__PURE__ */ new Set([
  "build",
  "dist",
  "node_modules",
  "out",
  "release",
  "target",
  "vendor",
  "venv"
]);
var PACKAGE_MANAGER_FIELD = /^(npm|pnpm|yarn|bun)@/u;
function entries(root, directory) {
  try {
    const listed = readdirSync(
      path13.join(root, ...directory.split("/").filter((part) => part !== ".")),
      { withFileTypes: true }
    );
    return {
      directories: listed.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
      files: listed.map((entry) => entry.name)
    };
  } catch {
    return { directories: [], files: [] };
  }
}
function join(directory, name) {
  return directory === "." ? name : `${directory}/${name}`;
}
function readJsonManifest(root, relative) {
  const text3 = workflowPlatformFacade.readTextIfExists(
    path13.join(root, ...relative.split("/"))
  );
  if (text3 === null) {
    return null;
  }
  try {
    const value = JSON.parse(text3);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}
function nodeManager(root, directories, locks) {
  for (const directory of directories) {
    const lock = locks.get(directory);
    if (lock && NODE_MANAGERS.has(lock)) {
      return lock;
    }
  }
  for (const directory of directories) {
    const field4 = readJsonManifest(
      root,
      join(directory, "package.json")
    )?.packageManager;
    const match = typeof field4 === "string" ? PACKAGE_MANAGER_FIELD.exec(field4) : null;
    if (match?.[1]) {
      return match[1];
    }
  }
  return DEFAULT_MANAGER.node;
}
function packageManagerOf(root, stack, directories, markers, locks) {
  if (stack === "node") {
    return nodeManager(root, directories, locks);
  }
  if (stack === "python") {
    const lock = directories.map((directory) => locks.get(directory)).find((value) => value && PYTHON_MANAGERS.has(value));
    return lock ?? DEFAULT_MANAGER.python;
  }
  if (stack === "jvm") {
    return markers.some(
      (marker) => path13.posix.basename(marker).startsWith("build.gradle")
    ) ? "gradle" : "maven";
  }
  return DEFAULT_MANAGER[stack];
}
function detectStacks(root) {
  const scanned = ["."];
  for (const name of entries(root, ".").directories.sort()) {
    if (!(name.startsWith(".") || SKIPPED_DIRECTORIES.has(name))) {
      scanned.push(name);
    }
  }
  const found = /* @__PURE__ */ new Map();
  const locks = /* @__PURE__ */ new Map();
  for (const directory of scanned) {
    for (const name of entries(root, directory).files.sort()) {
      const lock = LOCK_FILES[name];
      if (lock && !locks.has(directory)) {
        locks.set(directory, lock);
      }
      const marker = MARKERS.find((candidate) => candidate.pattern.test(name));
      if (marker) {
        const current = found.get(marker.stack) ?? {
          directories: /* @__PURE__ */ new Set(),
          markers: []
        };
        current.directories.add(directory);
        current.markers.push(join(directory, name));
        found.set(marker.stack, current);
      }
    }
  }
  return STACK_ORDER.flatMap((id) => {
    const current = found.get(id);
    if (!current) {
      return [];
    }
    const directories = [...current.directories];
    return [
      {
        directories,
        id,
        markers: current.markers,
        packageManager: packageManagerOf(
          root,
          id,
          directories,
          current.markers,
          locks
        )
      }
    ];
  });
}
function recordOf(value) {
  return value && typeof value === "object" ? value : {};
}
function nodeManifest(root, directories) {
  const packages = /* @__PURE__ */ new Set();
  const scripts = /* @__PURE__ */ new Map();
  for (const directory of directories) {
    const manifest = recordOf(
      readJsonManifest(root, join(directory, "package.json"))
    );
    for (const name of [
      ...Object.keys(recordOf(manifest.dependencies)),
      ...Object.keys(recordOf(manifest.devDependencies))
    ]) {
      packages.add(name);
    }
    const declared = directory === "." ? Object.entries(recordOf(manifest.scripts)) : [];
    for (const [name, command] of declared) {
      if (typeof command === "string") {
        scripts.set(name, command);
      }
    }
  }
  return { packages, scripts };
}
function pythonManifestText(root, markers) {
  return markers.filter((marker) => !marker.endsWith("setup.py")).map(
    (marker) => workflowPlatformFacade.readTextIfExists(
      path13.join(root, ...marker.split("/"))
    ) ?? ""
  ).join("\n").toLowerCase();
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-apply.ts
var INSTALL_TIMEOUT_MS = 15 * 60 * 1e3;
var MIN_APPROVAL = 10;
var OUTPUT_TAIL = 4e3;
function approvalGiven(input) {
  return typeof input.approval === "string" && input.approval.trim().length >= MIN_APPROVAL;
}
function checkInstalls(input) {
  const commands = input.install ?? [];
  ensure(
    Array.isArray(commands),
    "PROFILE_INVALID",
    "install must be a list of commands.",
    { field: "install" }
  );
  for (const [index, command] of commands.entries()) {
    const entry = `install[${index}]`;
    ensure(
      command && typeof command.executable === "string" && command.executable.trim() !== "",
      "PROFILE_INVALID",
      "Each install command needs executable and args.",
      { field: `${entry}.executable` }
    );
    ensure(
      Array.isArray(command.args) && command.args.every((arg) => typeof arg === "string"),
      "PROFILE_INVALID",
      "Each install command needs executable and args.",
      { field: `${entry}.args` }
    );
  }
  ensure(
    commands.length === 0 || approvalGiven(input),
    "INSTALL_APPROVAL",
    `Installing tools changes the project; record the user's approval in \`approval\` (at least ${MIN_APPROVAL} characters).`,
    { field: "approval" }
  );
}
function configuredProfile(current, input) {
  ensure(
    input && Array.isArray(input.stacks) && input.stacks.length > 0,
    "PROFILE_INVALID",
    "The profile names at least one stack.",
    { field: "stacks" }
  );
  const unknown2 = input.stacks.filter(
    (id) => !STACK_ORDER.includes(id)
  );
  ensure(
    unknown2.length === 0,
    "UNKNOWN_STACK",
    `Unknown stack: ${unknown2.join(", ")}`,
    { field: `stacks[${input.stacks.indexOf(unknown2[0])}]` }
  );
  ensure(
    Array.isArray(input.checks),
    "PROFILE_INVALID",
    "The profile needs a checks list.",
    { field: "checks" }
  );
  const builtins = current.quality.checks.filter((check2) => check2.builtin);
  const builtinIds = new Set(builtins.map((check2) => check2.id));
  const checks = input.checks.map((check2, index) => {
    const entry = `checks[${index}]`;
    ensure(
      check2 && typeof check2 === "object",
      "PROFILE_INVALID",
      "Each check must be an object.",
      { field: entry }
    );
    ensure(
      !builtinIds.has(check2.id),
      "PROFILE_INVALID",
      `Check id ${check2.id} is reserved for a Kit builtin.`,
      { field: `${entry}.id` }
    );
    const normalized = normalizeCheck(check2);
    validateCheck(normalized, entry);
    return normalized;
  });
  checkInstalls(input);
  return validateConfig({
    ...current,
    docs: input.docs ?? current.docs,
    policy: { ...current.policy, ...input.policy ?? {} },
    quality: {
      checks: [...checks, ...builtins],
      packageManager: input.packageManager ?? null,
      stacks: [...new Set(input.stacks)],
      status: "CONFIGURED"
    }
  });
}
function runInstalls(root, input, env) {
  const commands = input.install ?? [];
  if (commands.length === 0) {
    return [];
  }
  ensure(
    approvalGiven(input),
    "INSTALL_APPROVAL",
    "Installing tools changes the project; record the user's approval in `approval` (at least 10 characters).",
    { field: "approval" }
  );
  const results = [];
  for (const command of commands) {
    ensure(
      command && typeof command.executable === "string" && Array.isArray(command.args),
      "PROFILE_INVALID",
      "Each install command needs executable and args."
    );
    const started = Date.now();
    const outcome2 = workflowPlatformFacade.run({
      args: command.args,
      cwd: command.cwd ? workflowPlatformFacade.resolveInside(root, command.cwd) : root,
      env,
      executable: command.executable,
      timeoutMs: INSTALL_TIMEOUT_MS
    });
    const text3 = [command.executable, ...command.args].join(" ");
    const output = `${outcome2.stdout}${outcome2.stderr}`.slice(-OUTPUT_TAIL);
    if (outcome2.status !== 0) {
      throw new WorkflowError(
        "INSTALL_FAILED",
        `Install command failed: ${text3}`,
        { completed: results, output: outcome2.errorMessage ?? output },
        "Fix the install problem and repeat quality:apply; the profile was not changed."
      );
    }
    results.push({ command: text3, durationMs: Date.now() - started, output });
  }
  return results;
}
var MANIFEST_TOOLS = {
  dotnet: ["dotnet"],
  go: ["go", "govulncheck"],
  jvm: ["gradle", "gradlew", "mvn", "mvnw"],
  node: ["bun", "bunx", "npm", "npx", "pnpm", "yarn"],
  python: ["poetry", "uv"],
  rust: ["cargo", "cargo-audit"],
  swift: ["swift"]
};
var EXECUTABLE_SUFFIX = /\.(?:bat|cmd|exe)$/iu;
var PATH_SEPARATOR = /[\\/]/u;
function executableName(executable) {
  const base = executable.split(PATH_SEPARATOR).at(-1) ?? executable;
  return base.toLowerCase().replace(EXECUTABLE_SUFFIX, "");
}
function needsManifest(config, stack) {
  const tools = MANIFEST_TOOLS[stack];
  if (!tools) {
    return true;
  }
  return config.quality.checks.some(
    (check2) => check2.command !== void 0 && tools.includes(executableName(check2.command.executable))
  );
}
function profileDrift(root, config) {
  if (config.quality.status === "DISCOVERY") {
    return { added: [], missing: [], status: "discovery" };
  }
  const detected = detectStacks(root).map((item) => item.id);
  const added = detected.filter((id) => !config.quality.stacks.includes(id));
  const missing2 = config.quality.stacks.filter(
    (id) => !detected.includes(id) && needsManifest(config, id)
  );
  return {
    added,
    missing: missing2,
    status: added.length === 0 && missing2.length === 0 ? "ok" : "drift"
  };
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-builtins.ts
import { existsSync as existsSync7, readFileSync as readFileSync8, statSync as statSync4 } from "node:fs";
import path14 from "node:path";

// product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-globs.ts
var PLACEHOLDER_PATTERN = /\{([a-z]+)\}/gu;
var LEADING_PLACEHOLDER = /^\{([a-z]+)\}/u;
var SPECIAL_PATTERN = /[|\\{}()[\]^$+?.]/gu;
var compiled = /* @__PURE__ */ new Map();
function compile(pattern) {
  const cached = compiled.get(pattern);
  if (cached) {
    return cached;
  }
  const names = [];
  let source = "";
  let index = 0;
  while (index < pattern.length) {
    const rest = pattern.slice(index);
    const placeholder = LEADING_PLACEHOLDER.exec(rest);
    if (placeholder?.[1]) {
      names.push(placeholder[1]);
      source += "([^/]+)";
      index += placeholder[0].length;
    } else if (rest.startsWith("**/")) {
      source += "(?:.*/)?";
      index += 3;
    } else if (rest.startsWith("**")) {
      source += ".*";
      index += 2;
    } else if (rest.startsWith("*")) {
      source += "[^/]*";
      index += 1;
    } else {
      source += (pattern[index] ?? "").replace(SPECIAL_PATTERN, "\\$&");
      index += 1;
    }
  }
  const result2 = { names, regex: new RegExp(`^${source}$`, "u") };
  compiled.set(pattern, result2);
  return result2;
}
function matchGlob(pattern, value) {
  const { names, regex } = compile(pattern);
  const match = regex.exec(value);
  if (!match) {
    return null;
  }
  return Object.fromEntries(
    names.map((name, index) => [name, match[index + 1] ?? ""])
  );
}
function matchesAny(patterns, value) {
  return patterns.some((pattern) => matchGlob(pattern, value) !== null);
}
function fillPlaceholders(template, values) {
  return template.replace(
    PLACEHOLDER_PATTERN,
    (whole, name) => values[name] ?? whole
  );
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-builtins.ts
var MARKDOWN_LINK = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/gu;
var FENCE2 = /^\s*(```|~~~)/u;
var EXTERNAL_LINK = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/iu;
var NUL = "\0";
var CONFLICT_OPEN = "<<<<<<< ";
var CONFLICT_CLOSE = ">>>>>>> ";
var CONFLICT_SEPARATOR = "=======";
function absolute(root, file4) {
  return path14.join(root, ...file4.split("/"));
}
function existingFile(root, file4) {
  const target = absolute(root, file4);
  return existsSync7(target) && statSync4(target).isFile();
}
function markdownFiles(root, files) {
  return files.filter(
    (file4) => isMarkdownPath(file4) && file4 !== PLAN_PATH && existingFile(root, file4)
  );
}
function committedFiles(context) {
  return context.files.filter((file4) => !context.removed.has(file4));
}
function changedMarkdown(context) {
  return markdownFiles(context.root, committedFiles(context));
}
function fileLines(context) {
  const limit = context.config.policy.maxFileLines;
  if (limit === null) {
    return { output: "policy.maxFileLines is not set.", passed: true };
  }
  const over = [];
  for (const file4 of committedFiles(context)) {
    if (isDocumentationPath(file4) || file4.startsWith(".harness/") || !existingFile(context.root, file4)) {
      continue;
    }
    const text3 = readFileSync8(absolute(context.root, file4), "utf8");
    if (text3.includes(NUL)) {
      continue;
    }
    const lines = text3.endsWith("\n") ? text3.split("\n").length - 1 : text3.split("\n").length;
    if (lines > limit) {
      over.push(`${file4}: ${lines} lines (limit ${limit})`);
    }
  }
  return over.length === 0 ? { output: `File line limit ${limit}: OK.`, passed: true } : { output: over.join("\n"), passed: false };
}
function oversizedDocuments(root, files, limit) {
  return markdownFiles(root, files).flatMap((file4) => {
    const bytes = statSync4(absolute(root, file4)).size;
    return bytes > limit ? [{ bytes, path: file4 }] : [];
  });
}
function docSize(context) {
  const limit = context.config.budget.documentBytes;
  const over = oversizedDocuments(
    context.root,
    committedFiles(context),
    limit
  ).map(
    (item) => `${item.path}: ${item.bytes} bytes (limit ${limit}); split the document.`
  );
  return over.length === 0 ? { output: `Document size limit ${limit}: OK.`, passed: true } : { output: over.join("\n"), passed: false };
}
function linkTargets(text3) {
  const targets = [];
  let fenced = false;
  for (const line of text3.split("\n")) {
    if (FENCE2.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) {
      continue;
    }
    for (const match of line.matchAll(MARKDOWN_LINK)) {
      if (match[1]) {
        targets.push(match[1]);
      }
    }
  }
  return targets;
}
function brokenLinks(root, file4) {
  const directory = path14.dirname(absolute(root, file4));
  const broken = [];
  for (const target of linkTargets(
    readFileSync8(absolute(root, file4), "utf8")
  )) {
    if (EXTERNAL_LINK.test(target)) {
      continue;
    }
    const clean = target.split("#")[0]?.split("?")[0] ?? "";
    let decoded = clean;
    try {
      decoded = decodeURIComponent(clean);
    } catch {
    }
    if (decoded === "") {
      continue;
    }
    const resolved = decoded.startsWith("/") ? path14.join(root, decoded) : path14.resolve(directory, decoded);
    const inside = !path14.relative(root, resolved).startsWith("..");
    if (!(inside && existsSync7(resolved))) {
      broken.push(`${file4}: ${target}`);
    }
  }
  return broken;
}
function mdLinks(context) {
  const broken = changedMarkdown(context).flatMap(
    (file4) => brokenLinks(context.root, file4)
  );
  return broken.length === 0 ? { output: "Markdown links: OK.", passed: true } : { output: `Broken relative links:
${broken.join("\n")}`, passed: false };
}
function conflictLines(text3) {
  const opening = [];
  const separators = [];
  for (const [index, raw] of text3.split("\n").entries()) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.startsWith(CONFLICT_OPEN) || line.startsWith(CONFLICT_CLOSE)) {
      opening.push(index + 1);
    } else if (line === CONFLICT_SEPARATOR) {
      separators.push(index + 1);
    }
  }
  return opening.length === 0 ? [] : [...opening, ...separators].sort((a, b) => a - b);
}
function conflictMarkers(context) {
  const found = [];
  for (const file4 of committedFiles(context)) {
    if (!existingFile(context.root, file4)) {
      continue;
    }
    const text3 = readFileSync8(absolute(context.root, file4), "utf8");
    if (text3.includes(NUL)) {
      continue;
    }
    const lines = conflictLines(text3);
    if (lines.length > 0) {
      found.push(
        `${file4}: ${lines.length === 1 ? "line" : "lines"} ${lines.join(", ")}`
      );
    }
  }
  return found.length === 0 ? { output: "Conflict markers: none.", passed: true } : {
    output: `Unresolved conflict markers; resolve the conflict before committing:
${found.join("\n")}`,
    passed: false
  };
}
function missingContracts(config, files) {
  const candidate = new Set(files);
  const missing2 = [];
  for (const file4 of files) {
    for (const contract of config.docs.contracts) {
      const captures = matchGlob(contract.code, file4);
      if (!captures) {
        continue;
      }
      const documents2 = contract.docs.map(
        (doc) => fillPlaceholders(doc, captures)
      );
      if (!documents2.some((doc) => candidate.has(doc))) {
        missing2.push(`${file4} -> ${documents2.join(" | ")}`);
      }
    }
  }
  return [...new Set(missing2)];
}
function docsContracts(context) {
  const missing2 = missingContracts(context.config, context.files);
  if (missing2.length === 0) {
    return { output: "Documentation contracts: OK.", passed: true };
  }
  if (context.docsWaiver) {
    return {
      output: `Documentation contracts waived: ${context.docsWaiver}
${missing2.join("\n")}`,
      passed: true
    };
  }
  return {
    output: `Code changed without its contract document. Update the document in the same commit or record a docsWaiver.
${missing2.join("\n")}`,
    passed: false
  };
}
var BUILTIN_CHECKS = {
  "kit:conflict-markers": conflictMarkers,
  "kit:doc-size": docSize,
  "kit:docs-contracts": docsContracts,
  "kit:file-lines": fileLines,
  "kit:md-links": mdLinks
};
var DOCUMENTATION_BUILTINS = /* @__PURE__ */ new Set([
  "kit:doc-size",
  "kit:md-links",
  "kit:docs-contracts",
  "kit:conflict-markers"
]);

// product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-input-schema.ts
var PROFILE = "PROFILE_INVALID";
var CONFIG = "CONFIG_SCHEMA";
function field2(name, type, required, code, description, extra = {}) {
  return { code, description, name, required, type, ...extra };
}
var QUALITY_SCHEMA = {
  command: "quality:apply",
  description: "The quality profile chosen from `quality:detect`: `quality:apply --input <profile.json>`.",
  example: {
    approval: "User approved installing Biome as a dev dependency",
    checks: [
      {
        command: { args: ["biome", "check", "{files}"], executable: "npx" },
        id: "lint",
        required: true,
        role: "lint",
        stage: "commit",
        timeoutMs: 12e4
      }
    ],
    docs: {
      contracts: [{ code: "src/{module}/**", docs: ["docs/{module}.md"] }]
    },
    install: [
      { args: ["install", "--save-dev", "@biomejs/biome"], executable: "npm" }
    ],
    packageManager: "npm",
    policy: { maxFileLines: 500, taskFileSoftLimit: null },
    stacks: ["node"]
  },
  fields: [
    field2("stacks", "string[]", true, PROFILE, "Project ecosystems.", {
      minItems: 1
    }),
    field2("stacks[]", "string", false, "UNKNOWN_STACK", "A known stack id.", {
      enum: STACK_ORDER
    }),
    field2(
      "checks",
      "object[]",
      true,
      PROFILE,
      "Command checks; Kit builtin checks are kept automatically."
    ),
    field2(
      "checks[].id",
      "string",
      true,
      CONFIG,
      "Unique check id; builtin ids (kit:*) are reserved (PROFILE_INVALID).",
      { pattern: CHECK_ID_PATTERN.source }
    ),
    field2("checks[].role", "string", true, CONFIG, "What the check does.", {
      enum: CHECK_ROLES
    }),
    field2("checks[].stage", "string", true, CONFIG, "When the check runs.", {
      enum: CHECK_STAGES
    }),
    field2("checks[].command", "object", true, CONFIG, "The command to run."),
    field2(
      "checks[].command.executable",
      "string",
      true,
      CONFIG,
      "Executable name or path."
    ),
    field2(
      "checks[].command.args",
      "string[]",
      true,
      CONFIG,
      "Arguments; `{files}` expands to the candidate files."
    ),
    field2(
      "checks[].command.cwd",
      "string",
      false,
      CONFIG,
      "Project-relative working directory."
    ),
    field2(
      "checks[].required",
      "boolean",
      false,
      CONFIG,
      "A failed required check refuses the step; default false."
    ),
    field2(
      "checks[].timeoutMs",
      "integer",
      false,
      CONFIG,
      "Timeout in milliseconds; default 120000.",
      { maximum: MAX_TIMEOUT_MS, minimum: 1 }
    ),
    field2(
      "checks[].appliesTo",
      "string[]",
      false,
      CONFIG,
      "Globs of the files the check applies to."
    ),
    field2(
      "checks[].evidence",
      "string",
      false,
      CONFIG,
      "Artifact and scenario; required for package and installed checks."
    ),
    field2("docs", "object", false, CONFIG, "Documentation contracts."),
    field2(
      "docs.contracts",
      "object[]",
      true,
      CONFIG,
      "Code globs mapped to their contract documents."
    ),
    field2(
      "docs.contracts[].code",
      "string",
      true,
      CONFIG,
      "Code glob; `{name}` placeholders bind path segments."
    ),
    field2(
      "docs.contracts[].docs",
      "string[]",
      true,
      CONFIG,
      "Documents that change with the code.",
      { minItems: 1 }
    ),
    field2(
      "install",
      "object[]",
      false,
      PROFILE,
      "Tool install commands run before the profile is written."
    ),
    field2(
      "install[].executable",
      "string",
      true,
      PROFILE,
      "Executable of the install command."
    ),
    field2(
      "install[].args",
      "string[]",
      true,
      PROFILE,
      "Arguments of the install command."
    ),
    field2(
      "install[].cwd",
      "string",
      false,
      PROFILE,
      "Project-relative working directory."
    ),
    field2(
      "approval",
      "string",
      false,
      "INSTALL_APPROVAL",
      "The user's approval of the installs (trimmed length); required when install is not empty.",
      { minLength: MIN_APPROVAL }
    ),
    field2(
      "packageManager",
      "string|null",
      false,
      CONFIG,
      "Package manager of the project."
    ),
    field2("policy", "object", false, CONFIG, "Project policy."),
    field2(
      "policy.maxFileLines",
      "integer|null",
      false,
      CONFIG,
      "Line limit of the kit:file-lines check."
    ),
    field2(
      "policy.taskFileSoftLimit",
      "integer|null",
      false,
      CONFIG,
      "Soft limit of files per task."
    )
  ],
  rules: [
    "Only package or installed checks run at the delivery stage, and they need evidence (CONFIG_SCHEMA).",
    "Check ids are unique and never reuse a Kit builtin id (PROFILE_INVALID).",
    "Install commands run in order after validation; the first failure stops them and the profile is not written (INSTALL_FAILED)."
  ]
};
function qualityInputSchema() {
  return structuredClone(QUALITY_SCHEMA);
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-catalog.ts
var ROLE_ORDER = [
  "format",
  "lint",
  "typecheck",
  "test",
  "audit"
];
var ROLE_STAGE = {
  audit: "push",
  format: "prepare",
  lint: "commit",
  test: "commit",
  typecheck: "commit"
};
var NODE_ROLE_SCRIPTS = {
  lint: ["lint"],
  test: ["test"],
  typecheck: ["typecheck", "type-check"]
};
var tool = (name, args, packages = [], extra = {}) => ({
  args,
  packages,
  tool: name,
  ...extra
});
var CATALOG = {
  dotnet: {
    audit: [tool("dotnet", ["list", "package", "--vulnerable"])],
    format: [
      tool("dotnet", ["format", "--include", "{files}"], [], {
        appliesTo: ["**/*.cs"]
      })
    ],
    lint: [tool("dotnet", ["build", "-warnaserror"])],
    test: [tool("dotnet", ["test"])]
  },
  go: {
    audit: [
      tool("govulncheck", ["./..."], [], {
        install: {
          args: ["install", "golang.org/x/vuln/cmd/govulncheck@latest"],
          executable: "go"
        }
      })
    ],
    format: [tool("gofmt", ["-w", "{files}"], [], { appliesTo: ["**/*.go"] })],
    lint: [tool("go", ["vet", "./..."])],
    test: [tool("go", ["test", "./..."])]
  },
  jvm: {
    test: [tool("gradle", ["test"]), tool("mvn", ["-q", "test"])]
  },
  node: {
    audit: [tool("audit", [])],
    format: [
      tool("ultracite", ["fix", "{files}"], ["ultracite"]),
      tool("biome", ["format", "--write", "{files}"], ["@biomejs/biome"]),
      tool(
        "prettier",
        ["--write", "--ignore-unknown", "{files}"],
        ["prettier"]
      )
    ],
    lint: [
      tool("ultracite", ["check"], ["ultracite"]),
      tool("biome", ["check"], ["@biomejs/biome"]),
      tool("eslint", ["."], ["eslint"])
    ],
    test: [
      tool("vitest", ["run"], ["vitest"]),
      tool("jest", [], ["jest"]),
      tool("node", ["--test"])
    ],
    typecheck: [
      tool("tsc", ["--noEmit"], ["typescript"], { needs: "tsconfig.json" })
    ]
  },
  python: {
    audit: [tool("pip-audit", [], ["pip-audit"], { module: "pip_audit" })],
    format: [
      tool("ruff", ["format", "{files}"], ["ruff"], { appliesTo: ["**/*.py"] })
    ],
    lint: [tool("ruff", ["check"], ["ruff"])],
    test: [tool("pytest", [], ["pytest"])],
    typecheck: [
      tool("pyright", [], ["pyright"]),
      tool("mypy", ["."], ["mypy"])
    ]
  },
  rust: {
    audit: [
      tool("cargo-audit", ["audit"], [], {
        install: { args: ["install", "cargo-audit"], executable: "cargo" }
      })
    ],
    format: [
      tool("cargo", ["fmt", "--", "{files}"], [], { appliesTo: ["**/*.rs"] })
    ],
    lint: [tool("cargo", ["clippy", "--all-targets", "--", "-D", "warnings"])],
    test: [tool("cargo", ["test"])],
    typecheck: [tool("cargo", ["check"])]
  },
  swift: {
    format: [
      tool("swift-format", ["format", "-i", "{files}"], [], {
        appliesTo: ["**/*.swift"]
      })
    ],
    lint: [tool("swiftlint", [])],
    test: [tool("swift", ["test"])]
  }
};
function nodeCommand(manager, bin, args) {
  if (bin === "node") {
    return { args, executable: "node" };
  }
  switch (manager) {
    case "pnpm":
      return { args: ["exec", bin, ...args], executable: "pnpm" };
    case "yarn":
      return { args: [bin, ...args], executable: "yarn" };
    case "bun":
      return { args: [bin, ...args], executable: "bunx" };
    default:
      return { args: [bin, ...args], executable: "npx" };
  }
}
function nodeScriptCommand(manager, script) {
  if (manager === "npm") {
    return script === "test" ? { args: ["test"], executable: "npm" } : { args: ["run", "-s", script], executable: "npm" };
  }
  return { args: ["run", script], executable: manager };
}
function nodeAuditCommand(manager) {
  if (manager === "npm" || manager === "pnpm" || manager === "yarn") {
    return {
      args: ["audit", ...manager === "npm" ? ["--audit-level=high"] : []],
      executable: manager
    };
  }
  return null;
}
function nodeInstallCommand(manager, packages) {
  const verb = {
    bun: ["add", "-d"],
    pnpm: ["add", "-D"],
    yarn: ["add", "-D"]
  };
  return {
    args: [...verb[manager] ?? ["install", "-D"], ...packages],
    executable: manager
  };
}
function pythonCommand(manager, spec) {
  if (manager === "uv" || manager === "poetry") {
    return { args: ["run", spec.tool, ...spec.args], executable: manager };
  }
  return {
    args: ["-m", spec.module ?? spec.tool, ...spec.args],
    executable: "python"
  };
}
function pythonInstallCommand(manager, packages) {
  if (manager === "uv") {
    return { args: ["add", "--dev", ...packages], executable: "uv" };
  }
  if (manager === "poetry") {
    return {
      args: ["add", "--group", "dev", ...packages],
      executable: "poetry"
    };
  }
  return { args: ["-m", "pip", "install", ...packages], executable: "python" };
}
function checkFor(id, role, command, appliesTo) {
  return {
    ...appliesTo ? { appliesTo } : {},
    command,
    id,
    required: true,
    role,
    stage: ROLE_STAGE[role],
    ...role === "test" ? { timeoutMs: 6e5 } : {}
  };
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-proposal.ts
var ROLE_ID = {
  audit: "audit",
  format: "format",
  lint: "lint",
  test: "tests",
  typecheck: "typecheck"
};
var NPM_TEST_PLACEHOLDER = "no test specified";
var TOKEN_SEPARATOR = /[^a-z0-9_.-]+/u;
function pick(candidates, installed) {
  const ready = candidates.find(installed);
  const chosen = ready ?? candidates[0];
  return chosen ? { chosen, ready: Boolean(ready) } : null;
}
function nodeSelection(root, detection, role) {
  const manager = detection.packageManager;
  const { packages, scripts } = nodeManifest(root, detection.directories);
  const candidates = CATALOG.node[role] ?? [];
  const alternatives = candidates.map((spec) => spec.tool);
  const script = (NODE_ROLE_SCRIPTS[role] ?? []).find(
    (name) => scripts.has(name) && !(scripts.get(name) ?? "").includes(NPM_TEST_PLACEHOLDER)
  );
  if (script) {
    return {
      alternatives,
      command: nodeScriptCommand(manager, script),
      installed: true,
      spec: null
    };
  }
  if (role === "audit") {
    const command = nodeAuditCommand(manager);
    return command ? { alternatives: [], command, installed: true, spec: null } : null;
  }
  const typed = detection.markers.some((marker) => marker.endsWith("tsconfig.json")) || packages.has("typescript");
  const usable = candidates.filter(
    (spec) => spec.needs !== "tsconfig.json" || typed
  );
  const choice2 = pick(
    usable,
    (spec) => spec.packages.every((name) => packages.has(name))
  );
  if (!choice2) {
    return null;
  }
  const bin = choice2.chosen.tool;
  return {
    alternatives,
    command: nodeCommand(manager, bin, choice2.chosen.args),
    installed: choice2.ready,
    spec: choice2.chosen
  };
}
function pythonSelection(root, detection, role) {
  const tokens = new Set(
    pythonManifestText(root, detection.markers).split(TOKEN_SEPARATOR)
  );
  const candidates = CATALOG.python[role] ?? [];
  const choice2 = pick(
    candidates,
    (spec) => spec.packages.every((name) => tokens.has(name))
  );
  if (!choice2) {
    return null;
  }
  return {
    alternatives: candidates.map((spec) => spec.tool),
    command: pythonCommand(detection.packageManager, choice2.chosen),
    installed: choice2.ready,
    spec: choice2.chosen
  };
}
function toolchainSelection(detection, role, which) {
  let candidates = CATALOG[detection.id][role] ?? [];
  if (detection.id === "jvm") {
    candidates = candidates.filter(
      (spec) => spec.tool === (detection.packageManager === "gradle" ? "gradle" : "mvn")
    );
  }
  const choice2 = pick(candidates, (spec) => which(spec.tool));
  if (!choice2) {
    return null;
  }
  const executable = choice2.chosen.tool === "cargo-audit" ? "cargo" : choice2.chosen.tool;
  return {
    alternatives: candidates.map((spec) => spec.tool),
    command: { args: choice2.chosen.args, executable },
    installed: choice2.ready,
    spec: choice2.chosen
  };
}
function planStack(root, detection, options, idOf, checks) {
  const plan = { entries: [], installs: [], notes: [] };
  const missingPackages = /* @__PURE__ */ new Set();
  for (const role of ROLE_ORDER) {
    let selection;
    if (detection.id === "node") {
      selection = nodeSelection(root, detection, role);
    } else if (detection.id === "python") {
      selection = pythonSelection(root, detection, role);
    } else {
      selection = toolchainSelection(detection, role, options.which);
    }
    if (!selection) {
      continue;
    }
    const id = idOf(role);
    checks.push(
      checkFor(id, role, selection.command, selection.spec?.appliesTo)
    );
    const toolName = selection.spec?.tool ?? `${selection.command.executable} ${selection.command.args.join(" ")}`;
    plan.entries.push({
      alternatives: selection.alternatives,
      id,
      installed: selection.installed,
      role,
      stack: detection.id,
      tool: toolName
    });
    if (selection.installed || !selection.spec) {
      continue;
    }
    if (selection.spec.install) {
      plan.installs.push(selection.spec.install);
    } else if (selection.spec.packages.length > 0) {
      for (const name of selection.spec.packages) {
        missingPackages.add(name);
      }
    } else {
      plan.notes.push(
        `${detection.id}: install ${selection.spec.tool} manually; it is not on PATH.`
      );
    }
  }
  if (missingPackages.size > 0) {
    const names = [...missingPackages];
    plan.installs.unshift(
      detection.id === "node" ? nodeInstallCommand(detection.packageManager, names) : pythonInstallCommand(detection.packageManager, names)
    );
  }
  return plan;
}
function fallbackDetection(id) {
  const manager = {
    dotnet: "dotnet",
    go: "go",
    jvm: "maven",
    node: "npm",
    python: "pip",
    rust: "cargo",
    swift: "swift"
  };
  return { directories: ["."], id, markers: [], packageManager: manager[id] };
}
function proposeQuality(root, options) {
  const detected = detectStacks(root);
  const wanted = options.stacks ? STACK_ORDER.filter((id) => options.stacks?.includes(id)) : detected.map((item) => item.id);
  const stacks = wanted.map(
    (id) => detected.find((item) => item.id === id) ?? fallbackDetection(id)
  );
  const checks = [];
  const entries2 = [];
  const install = [];
  const notes = [];
  for (const detection of stacks) {
    const idOf = (role) => stacks.length === 1 ? ROLE_ID[role] : `${detection.id}-${ROLE_ID[role]}`;
    const plan = planStack(root, detection, options, idOf, checks);
    entries2.push(...plan.entries);
    install.push(...plan.installs);
    notes.push(...plan.notes);
  }
  if (stacks.length === 0) {
    notes.push(
      "No stack detected; pass the stack explicitly from the architecture document."
    );
  }
  notes.push(
    "Kit builtins (kit:doc-size, kit:md-links, kit:file-lines, kit:docs-contracts, kit:conflict-markers) are always kept."
  );
  return {
    detected,
    entries: entries2,
    notes,
    profile: {
      checks,
      install,
      packageManager: stacks[0]?.packageManager ?? null,
      stacks: stacks.map((item) => item.id)
    }
  };
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-runner.ts
import { existsSync as existsSync8, statSync as statSync5 } from "node:fs";
import path15 from "node:path";
var OUTPUT_TAIL2 = 4e3;
var FILES_ARGUMENT = "{files}";
var IMPLICIT_BUILTINS = ["kit:conflict-markers"];
function tail(text3) {
  return text3.length > OUTPUT_TAIL2 ? `\u2026${text3.slice(-OUTPUT_TAIL2)}` : text3;
}
function effectiveChecks(config) {
  const listed = config.quality.checks;
  const missing2 = IMPLICIT_BUILTINS.filter(
    (id) => !listed.some((check2) => check2.id === id || check2.builtin === id)
  );
  return [...listed, ...missing2.map(builtinCheck)];
}
function unknownChecks(checks, ids) {
  const known = new Set(checks.map((check2) => check2.id));
  const unknown2 = ids.filter((id) => !known.has(id));
  ensure(
    unknown2.length === 0,
    "CHECK_UNKNOWN",
    `Unknown checks: ${unknown2.join(", ")}`,
    { checks: unknown2 },
    "Task checks must be ids from `scripts/workflow quality:status`; fix the task with `scripts/workflow task:update <ID> --input <patch.json>`."
  );
}
var BUILTIN_PREFIX = "kit:";
function plannedCheckRule(config) {
  if (config.quality.status === "CONFIGURED") {
    return {
      known: effectiveChecks(config).map((check2) => check2.id),
      open: false
    };
  }
  return { known: Object.keys(BUILTIN_CHECKS).sort(), open: true };
}
function unknownPlannedChecks(config, ids) {
  const { known, open } = plannedCheckRule(config);
  return ids.filter((id) => {
    if (known.includes(id)) {
      return false;
    }
    return !(open && CHECK_ID_PATTERN.test(id) && !id.startsWith(BUILTIN_PREFIX));
  });
}
function ensurePlannedChecks(config, tasks) {
  const { known, open } = plannedCheckRule(config);
  for (const task2 of tasks) {
    const unknown2 = unknownPlannedChecks(config, task2.checks);
    ensure(
      unknown2.length === 0,
      "CHECK_UNKNOWN",
      `${task2.field}${task2.taskId ? ` of ${task2.taskId}` : ""} names unknown quality checks: ${unknown2.join(", ")}. \`checks\` holds ids of quality checks ${open ? "(a Kit builtin kit:* or an id without spaces that QUALITY will define)" : "of the profile"}; manual checks belong in acceptance.`,
      { checks: unknown2, field: task2.field, known, taskId: task2.taskId },
      "Use check ids from `scripts/workflow quality:status` or leave `checks` empty, and write manual checks into `acceptance`."
    );
  }
}
function selectChecks(request) {
  const { stage: stage2 } = request;
  const checks = effectiveChecks(request.config);
  if (request.only) {
    unknownChecks(checks, request.only);
    return checks.filter((check2) => request.only?.includes(check2.id));
  }
  if (request.service) {
    return stage2 === "commit" ? checks.filter(
      (check2) => check2.builtin && DOCUMENTATION_BUILTINS.has(check2.builtin)
    ) : [];
  }
  const assigned = request.assigned ?? [];
  unknownChecks(checks, assigned);
  return checks.filter(
    (check2) => check2.stage === stage2 && (check2.required || assigned.includes(check2.id))
  );
}
function result(check2, fields) {
  return {
    command: check2.builtin ?? [check2.command?.executable ?? "", ...check2.command?.args ?? []].join(
      " "
    ),
    durationMs: 0,
    evidence: check2.evidence ?? null,
    exitCode: null,
    id: check2.id,
    output: "",
    reason: null,
    role: check2.role,
    stage: check2.stage,
    ...fields
  };
}
function isExistingFile(root, file4) {
  const target = path15.join(root, ...file4.split("/"));
  return existsSync8(target) && statSync5(target).isFile();
}
function runCommand(check2, request, files) {
  const command = check2.command;
  if (!command) {
    return result(check2, {
      reason: "The check has no command.",
      status: "error"
    });
  }
  const usesFiles = command.args.includes(FILES_ARGUMENT);
  const removed = new Set(request.removed ?? []);
  const existing = (files ?? []).filter(
    (file4) => !removed.has(file4) && isExistingFile(request.root, file4)
  );
  if (usesFiles && existing.length === 0) {
    return result(check2, {
      reason: "No existing files to pass.",
      status: "skipped"
    });
  }
  const args = command.args.flatMap(
    (arg) => arg === FILES_ARGUMENT ? existing : [arg]
  );
  const hasDirectory = command.executable.includes("/") || command.executable.includes("\\");
  const executable = hasDirectory && !path15.isAbsolute(command.executable) ? workflowPlatformFacade.resolveInside(request.root, command.executable) : command.executable;
  const cwd = command.cwd ? workflowPlatformFacade.resolveInside(request.root, command.cwd) : request.root;
  const started = Date.now();
  const outcome2 = workflowPlatformFacade.run({
    args,
    cwd,
    env: request.env ?? process.env,
    executable,
    timeoutMs: check2.timeoutMs
  });
  const output = tail(`${outcome2.stdout}${outcome2.stderr}`);
  const durationMs = Date.now() - started;
  if (outcome2.timedOut) {
    return result(check2, {
      durationMs,
      output,
      reason: `Timed out after ${check2.timeoutMs} ms.`,
      status: "timeout"
    });
  }
  if (outcome2.status === null) {
    return result(check2, {
      durationMs,
      output,
      reason: outcome2.errorMessage ?? `${command.executable} did not start.`,
      status: "error"
    });
  }
  return result(check2, {
    durationMs,
    exitCode: outcome2.status,
    output,
    status: outcome2.status === 0 ? "passed" : "failed"
  });
}
function runOne(check2, request) {
  const filtered = request.files && check2.appliesTo ? request.files.filter((file4) => matchesAny(check2.appliesTo ?? [], file4)) : request.files;
  if (request.files && check2.appliesTo && filtered?.length === 0) {
    return result(check2, {
      reason: "No candidate file matches appliesTo.",
      status: "skipped"
    });
  }
  if (check2.builtin) {
    const started = Date.now();
    const outcome2 = BUILTIN_CHECKS[check2.builtin]({
      config: request.config,
      docsWaiver: request.docsWaiver ?? null,
      files: filtered ?? [],
      removed: new Set(request.removed ?? []),
      root: request.root
    });
    return result(check2, {
      durationMs: Date.now() - started,
      output: tail(outcome2.output),
      status: outcome2.passed ? "passed" : "failed"
    });
  }
  return runCommand(check2, request, filtered);
}
function runStage(request) {
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const results = selectChecks(request).map((check2) => runOne(check2, request));
  return {
    finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
    ok: results.every(
      (item) => item.status === "passed" || item.status === "skipped"
    ),
    results,
    stage: request.stage,
    startedAt
  };
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/workflow-quality-facade.ts
var WorkflowQualityFacade = class {
  configPath = CONFIG_PATH;
  defaultConfig() {
    return defaultConfig();
  }
  validateConfig(config) {
    return validateConfig(config);
  }
  normalizeCheck(input) {
    const check2 = normalizeCheck(input);
    validateCheck(check2);
    return check2;
  }
  configFile(root) {
    return path16.join(root, ...CONFIG_PATH.split("/"));
  }
  /** Reads the project configuration; a missing file means the default DISCOVERY profile. */
  readConfig(root) {
    const text3 = workflowPlatformFacade.readTextIfExists(this.configFile(root));
    if (text3 === null) {
      return defaultConfig();
    }
    let parsed;
    try {
      parsed = JSON.parse(text3);
    } catch (cause) {
      throw new WorkflowError(
        "CONFIG_JSON",
        `${CONFIG_PATH} is not valid JSON: ${cause.message}`
      );
    }
    return validateConfig(parsed);
  }
  renderConfig(config) {
    return `${JSON.stringify(validateConfig(config), null, 2)}
`;
  }
  /** Ecosystems recognised by detection and the catalog, in priority order. */
  stacks() {
    return STACK_ORDER;
  }
  detect(root) {
    return detectStacks(root);
  }
  /**
   * Proposes a quality profile from detection and the catalog. `stacks`
   * overrides detection; `which` defaults to a PATH lookup.
   */
  propose(root, options = {}) {
    const unknown2 = (options.stacks ?? []).filter(
      (id) => !STACK_ORDER.includes(id)
    );
    ensure(
      unknown2.length === 0,
      "UNKNOWN_STACK",
      `Unknown stack: ${unknown2.join(", ")}. Known: ${STACK_ORDER.join(", ")}.`
    );
    return proposeQuality(root, {
      stacks: options.stacks,
      which: options.which ?? ((name) => workflowPlatformFacade.findExecutable(name) !== null)
    });
  }
  /**
   * Planned `tasks[].checks` ids the profile cannot run: with a CONFIGURED
   * profile every id not in it, before QUALITY ids that are not of the check
   * id form or name an unknown `kit:` builtin.
   */
  unknownPlannedChecks(config, ids) {
    return unknownPlannedChecks(config, ids);
  }
  /** CHECK_UNKNOWN for the first planned task with an unknown check id. */
  ensurePlannedChecks(config, tasks) {
    ensurePlannedChecks(config, tasks);
  }
  /** Checks a stage would run, without running them. */
  selectChecks(request) {
    return selectChecks(request);
  }
  runStage(request) {
    return runStage(request);
  }
  /** Code files of the candidate whose contract documents are missing. */
  missingContracts(config, files) {
    return missingContracts(config, files);
  }
  /**
   * Markdown files of `files` (the plan excluded) larger than the
   * `budget.documentBytes` of `config`: the size rule of `kit:doc-size`.
   */
  oversizedDocuments(root, files, config) {
    return oversizedDocuments(root, files, config.budget.documentBytes);
  }
  /**
   * Stores stage reports of a commit transaction. The git module renames the
   * pending record to `<sha>.json` and `last.json` once the commit exists.
   */
  recordEvidence(root, transactionId, reports) {
    const file4 = workflowGitFacade.localPath(
      root,
      "verification",
      `pending-${transactionId}.json`
    );
    workflowPlatformFacade.writeFileAtomic(
      file4,
      `${JSON.stringify({ reports, transaction: transactionId }, null, 2)}
`
    );
    return file4;
  }
  /** Reads stored evidence by commit SHA, or the latest one. */
  readEvidence(root, reference = "last") {
    const text3 = workflowPlatformFacade.readTextIfExists(
      workflowGitFacade.localPath(root, "verification", `${reference}.json`)
    );
    return text3 === null ? null : JSON.parse(text3);
  }
  /** Input descriptor of `quality:apply` (a copy; same shape as the plan descriptors). */
  inputSchema() {
    return qualityInputSchema();
  }
  /** The configuration `apply` would write, without installing anything. */
  previewProfile(root, input) {
    return configuredProfile(this.readConfig(root), input);
  }
  /**
   * `quality:apply`: validates the profile, runs approved install commands
   * and writes the CONFIGURED configuration. The `quality` commit is made
   * by the Workflow Kit facade.
   */
  applyProfile(root, input, env = process.env) {
    const config = this.previewProfile(root, input);
    const installs = runInstalls(root, input, env);
    this.writeConfig(root, config);
    return { config, installs };
  }
  drift(root, config = this.readConfig(root)) {
    return profileDrift(root, config);
  }
  writeConfig(root, config) {
    workflowPlatformFacade.writeFileAtomic(
      this.configFile(root),
      this.renderConfig(config)
    );
  }
};
var workflowQualityFacade = new WorkflowQualityFacade();

// product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-attach.ts
import { realpathSync as realpathSync2 } from "node:fs";
import path17 from "node:path";
var WORKTREE_RECORD_VERSION = 1;
var WORKTREE_RECORD = "assignment.json";
function executorScopeId(id) {
  return `assignment-${id}`;
}
function real(value) {
  return realpathSync2(value);
}
function revParse(git, root, flag2) {
  return git.git.text(root, ["rev-parse", "--path-format=absolute", flag2]);
}
function locateWorktree(git, root) {
  ensure(
    git.isRepository(root),
    "ASSIGNMENT_WORKTREE",
    "assignment:attach runs inside the executor's git worktree."
  );
  const bare = git.git.text(root, ["rev-parse", "--is-bare-repository"]);
  const commonDir = real(revParse(git, root, "--git-common-dir"));
  ensure(
    bare !== "true" && path17.basename(commonDir) === ".git",
    "ASSIGNMENT_LAYOUT",
    `The repository layout is not supported: the common git directory ${commonDir} is not the .git folder of a main checkout.`,
    { commonDir },
    "Use a normal (non-bare) repository whose worktrees are created with `git worktree add`."
  );
  const mainRoot = path17.dirname(commonDir);
  const worktree = real(git.topLevel(root));
  const gitDir = real(revParse(git, root, "--git-dir"));
  ensure(
    gitDir !== commonDir && worktree !== mainRoot,
    "ASSIGNMENT_WORKTREE",
    "This is the main checkout; assignment:attach runs in the executor's linked worktree.",
    { mainRoot },
    "Start the executor subagent with isolation worktree and run the command there."
  );
  const branch = git.git.run(root, ["symbolic-ref", "-q", "--short", "HEAD"], {
    allowFailure: true
  }).stdout.trim();
  return { branch: branch === "" ? null : branch, mainRoot, worktree };
}
function worktreeRecordFile(root) {
  return workflowGitFacade.localPath(root, WORKTREE_RECORD);
}
function isWorktreeRecord(value) {
  const record = value;
  return record !== null && typeof record === "object" && record.version === WORKTREE_RECORD_VERSION && typeof record.id === "string" && typeof record.mainRoot === "string" && typeof record.scopeId === "string" && typeof record.taskId === "string" && typeof record.baseCommit === "string";
}
function readWorktreeRecord(root) {
  const file4 = worktreeRecordFile(root);
  const text3 = workflowPlatformFacade.readTextIfExists(file4);
  if (text3 === null) {
    return null;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(text3);
  } catch {
    parsed = null;
  }
  if (!isWorktreeRecord(parsed)) {
    throw new WorkflowError(
      "ASSIGNMENT_RECORD",
      "The executor record of this worktree is unreadable.",
      { file: file4 },
      "Inspect the record file; the Kit does not guess its state."
    );
  }
  return parsed;
}
function writeWorktreeRecord(root, record, mainRoot) {
  const value = {
    baseCommit: record.baseCommit,
    id: record.id,
    mainRoot,
    scopeId: record.scopeId,
    taskId: record.taskId,
    version: WORKTREE_RECORD_VERSION
  };
  workflowPlatformFacade.writeFileAtomic(
    worktreeRecordFile(root),
    `${JSON.stringify(value, null, 2)}
`
  );
  return value;
}
function executorPlan(base, record, now) {
  ensure(
    base.scope?.id === record.scopeId,
    "ASSIGNMENT_BASE",
    `The plan of the base commit has no scope ${record.scopeId}.`
  );
  const task2 = workflowPlanFacade.task(base, record.taskId);
  ensure(
    task2.status === "TODO" && task2.iteration === record.iteration,
    "ASSIGNMENT_BASE",
    `${task2.id} is ${task2.status} (iteration ${task2.iteration}) in the base plan; the assignment expects TODO, iteration ${record.iteration}.`
  );
  const round = base.rounds.find((item) => item.id === task2.roundId);
  ensure(round, "ASSIGNMENT_BASE", `The round of ${task2.id} is missing.`);
  const copy = structuredClone(task2);
  copy.dependencies = [];
  copy.fixes = null;
  return workflowPlanFacade.validate({
    currentTaskId: null,
    lastClosed: null,
    projectId: base.projectId,
    projectName: base.projectName,
    revision: base.revision + 1,
    rounds: [
      {
        digest: null,
        id: round.id,
        kind: round.kind,
        status: "OPEN",
        title: round.title
      }
    ],
    schema: PLAN_SCHEMA,
    scope: {
      acceptance: [...task2.acceptance],
      acceptanceNote: null,
      approval: {
        at: now,
        text: `Assignment ${record.id}: task ${task2.id} of scope ${record.scopeId}`
      },
      baselineCommit: record.baseCommit,
      blockedReason: null,
      context: structuredClone(task2.context),
      decisions: [],
      delivery: "IN_PROGRESS",
      execution: { maxWorkers: 1, ownerSession: null, strategy: "sequential" },
      id: executorScopeId(record.id),
      objective: task2.why ? `${task2.title}: ${task2.why}` : task2.title,
      spec: base.scope.spec,
      status: "ACTIVE"
    },
    tasks: [copy]
  });
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-cancel.ts
import { existsSync as existsSync9 } from "node:fs";

// product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-records.ts
import { createHash as createHash2 } from "node:crypto";
import { readdirSync as readdirSync2, rmSync as rmSync4 } from "node:fs";
var RECORD_VERSION = 1;
var RECORDS_DIR = "assignments";
var RECORD_SUFFIX = ".json";
var ID_PATTERN2 = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
var UNSAFE_ID_CHARACTERS = /[^A-Za-z0-9._-]/gu;
var STATUSES = /* @__PURE__ */ new Set([
  "ASSIGNED",
  "INTEGRATED",
  "NEEDS_SETUP",
  "READY",
  "READY_FOR_INTEGRATION",
  "RUNNING"
]);
function assignmentId(scopeId, taskId, iteration) {
  return `${scopeId}-${taskId}-${iteration}`.replace(UNSAFE_ID_CHARACTERS, "-");
}
function ensureId(id) {
  ensure(
    typeof id === "string" && ID_PATTERN2.test(id),
    "ASSIGNMENT_ID",
    `Invalid assignment id: ${String(id)}`
  );
}
function recordsDirectory(root) {
  return workflowGitFacade.localPath(root, RECORDS_DIR);
}
function recordFile(root, id) {
  ensureId(id);
  return workflowGitFacade.localPath(
    root,
    RECORDS_DIR,
    `${id}${RECORD_SUFFIX}`
  );
}
function isRecord(value, id) {
  const record = value;
  return record !== null && typeof record === "object" && record.version === RECORD_VERSION && record.id === id && typeof record.scopeId === "string" && typeof record.taskId === "string" && Number.isSafeInteger(record.iteration) && typeof record.baseCommit === "string" && STATUSES.has(record.status);
}
function readRecord(root, id) {
  const file4 = recordFile(root, id);
  const text3 = workflowPlatformFacade.readTextIfExists(file4);
  if (text3 === null) {
    return null;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(text3);
  } catch {
    parsed = null;
  }
  if (!isRecord(parsed, id)) {
    throw new WorkflowError(
      "ASSIGNMENT_RECORD",
      `The assignment record ${id} is unreadable.`,
      { file: file4 },
      "Inspect the record file; the Kit does not guess its state."
    );
  }
  return parsed;
}
function listRecords(root) {
  let names = [];
  try {
    names = readdirSync2(recordsDirectory(root));
  } catch {
    return [];
  }
  return names.filter((name) => name.endsWith(RECORD_SUFFIX)).map((name) => name.slice(0, -RECORD_SUFFIX.length)).filter((id) => ID_PATTERN2.test(id)).map((id) => readRecord(root, id)).sort(
    (left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
  );
}
function writeRecord(root, record) {
  workflowPlatformFacade.writeFileAtomic(
    recordFile(root, record.id),
    `${JSON.stringify(record, null, 2)}
`
  );
}
function removeRecord(root, id) {
  rmSync4(recordFile(root, id), { force: true });
}
function isActiveRecord(record) {
  return record.status !== "INTEGRATED";
}
function newRecord(input) {
  return {
    baseCommit: input.baseCommit,
    branch: null,
    cleanup: null,
    configDigest: input.configDigest,
    createdAt: input.now,
    id: assignmentId(input.scopeId, input.taskId, input.iteration),
    integrationCommit: null,
    iteration: input.iteration,
    scopeId: input.scopeId,
    setup: null,
    sourceCommit: null,
    status: "ASSIGNED",
    taskId: input.taskId,
    updatedAt: input.now,
    version: RECORD_VERSION,
    worktree: null
  };
}
function configDigest(root) {
  const text3 = workflowPlatformFacade.readTextIfExists(
    workflowQualityFacade.configFile(root)
  );
  return text3 === null ? null : createHash2("sha256").update(text3).digest("hex");
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-cleanup.ts
var WORKTREE_LINE = "worktree ";
function registeredWorktrees(git, root) {
  return git.git.text(root, ["worktree", "list", "--porcelain"]).split("\n").filter((line) => line.startsWith(WORKTREE_LINE)).map((line) => line.slice(WORKTREE_LINE.length));
}
function refusal(git, root, args) {
  const output = git.git.run(root, args, { allowFailure: true });
  if (output.status === 0) {
    return null;
  }
  const text3 = output.stderr.trim() || output.stdout.trim();
  return `git ${args.join(" ")}: ${text3 || `exit code ${output.status}`}`;
}
function cleanupSteps(git, root, record) {
  const worktree = record.worktree;
  if (worktree !== null && registeredWorktrees(git, root).some(
    (item) => workflowPlatformFacade.samePath(item, worktree)
  )) {
    const removed = refusal(git, root, ["worktree", "remove", worktree]);
    if (removed) {
      return removed;
    }
  }
  const pruned = refusal(git, root, ["worktree", "prune"]);
  if (pruned || record.branch === null) {
    return pruned;
  }
  const exists = git.git.succeeds(root, [
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${record.branch}`
  ]);
  return exists ? refusal(git, root, ["branch", "-d", record.branch]) : null;
}
function cleanupAssignment(git, root, record, now) {
  ensure(
    record.status === "INTEGRATED",
    "ASSIGNMENT_NOT_INTEGRATED",
    `${record.id} is ${record.status}; only an INTEGRATED assignment is cleaned up.`,
    { status: record.status }
  );
  if (record.cleanup?.status === "DONE") {
    return record;
  }
  const reason = cleanupSteps(git, root, record);
  const cleanup = reason === null ? { at: now, status: "DONE" } : { at: now, reason, status: "PENDING" };
  const updated = { ...record, cleanup, updatedAt: now };
  writeRecord(root, updated);
  return updated;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-cancel.ts
function registeredWorktree(git, root, record) {
  const worktree = record.worktree;
  if (worktree === null) {
    return null;
  }
  return registeredWorktrees(git, root).find(
    (item) => workflowPlatformFacade.samePath(item, worktree)
  ) ?? null;
}
function failed(record, reason) {
  throw new WorkflowError(
    "ASSIGNMENT_CANCEL_FAILED",
    `${record.id} was not cancelled: ${reason}`,
    { id: record.id, reason },
    `Resolve the reason, then repeat scripts/workflow assignment:cancel --id ${record.id}; the record is kept.`
  );
}
function cancelAssignment(git, root, record, options) {
  ensure(
    record.status !== "INTEGRATED",
    "ASSIGNMENT_INTEGRATED",
    `${record.id} is INTEGRATED; its task is done and only its cleanup remains.`,
    { id: record.id, status: record.status },
    `Run scripts/workflow assignment:cleanup --id ${record.id}.`
  );
  const worktree = registeredWorktree(git, root, record);
  const present = worktree !== null && existsSync9(worktree);
  if (present && !options.force) {
    const dirty = git.changes(worktree).all;
    ensure(
      dirty.length === 0,
      "ASSIGNMENT_DIRTY",
      `The worktree ${worktree} of ${record.id} has uncommitted changes.`,
      { id: record.id, paths: dirty, worktree },
      `Commit or remove them, or drop them with scripts/workflow assignment:cancel --id ${record.id} --force.`
    );
  }
  if (present) {
    const force = options.force ? ["-f", "-f"] : [];
    const removed = refusal(git, root, [
      "worktree",
      "remove",
      ...force,
      worktree
    ]);
    if (removed) {
      failed(record, removed);
    }
  }
  const pruned = refusal(git, root, ["worktree", "prune"]);
  if (pruned) {
    failed(record, pruned);
  }
  let branchTip = null;
  if (record.branch !== null) {
    const tip = git.git.run(
      root,
      ["rev-parse", "--verify", "-q", `refs/heads/${record.branch}`],
      { allowFailure: true }
    );
    if (tip.status === 0) {
      const deleted = refusal(git, root, ["branch", "-D", record.branch]);
      if (deleted) {
        failed(record, deleted);
      }
      branchTip = tip.stdout.trim();
    }
  }
  removeRecord(root, record.id);
  return {
    assignment: record,
    branch: branchTip === null ? null : record.branch,
    branchTip,
    worktree
  };
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-guard.ts
var LAUNCHERS = /* @__PURE__ */ new Set([
  "scripts/workflow",
  "scripts/workflow.cmd",
  "scripts/workflow.ps1"
]);
var CONTRACT_PREFIXES = [".harness/workflow/", ".harness/plans/"];
function inTaskScope2(files, file4) {
  return files.some((entry) => file4 === entry || file4.startsWith(`${entry}/`));
}
function parse(text3) {
  if (text3 === null) {
    return null;
  }
  try {
    return workflowPlanFacade.parse(text3);
  } catch {
    return null;
  }
}
function contractError(message, paths) {
  return new WorkflowError(
    "ASSIGNMENT_CONTRACT",
    message,
    { paths },
    "Revert these changes; the executor contract (plan, Kit configuration, launchers) is fixed by the assignment."
  );
}
function kitTransition(head3, candidate, task2) {
  const own = candidate.tasks.find((item) => item.id === task2.id);
  if (candidate.tasks.length !== 1 || !own || own.files.length < task2.files.length || task2.files.some((file4, index) => own.files[index] !== file4)) {
    return null;
  }
  try {
    const started = structuredClone(
      workflowPlanFacade.startTask(head3, task2.id, task2.confirmation)
    );
    workflowPlanFacade.task(started, task2.id).files = [...own.files];
    const digest = candidate.rounds.find((round) => round.id === task2.roundId)?.digest ?? null;
    return workflowPlanFacade.completeTask(started, task2.id, digest);
  } catch {
    return null;
  }
}
function checkExecutorChange(change2) {
  const head3 = parse(change2.headPlan);
  const task2 = head3?.tasks.length === 1 ? head3.tasks[0] : void 0;
  if (!(head3 && task2)) {
    throw contractError("HEAD has no executor plan with one task.", [
      change2.planPath
    ]);
  }
  const files = change2.paths.filter((file4) => file4 !== change2.planPath);
  const contract = files.filter(
    (file4) => LAUNCHERS.has(file4) || CONTRACT_PREFIXES.some((prefix) => file4.startsWith(prefix))
  );
  if (contract.length > 0) {
    throw contractError(
      `An executor never changes the Kit configuration, the launchers or the plans: ${contract.join(", ")}.`,
      contract
    );
  }
  const outside = files.filter((file4) => !inTaskScope2(task2.files, file4));
  ensure(
    outside.length === 0,
    "ASSIGNMENT_SCOPE",
    `These paths are outside the files of ${task2.id}: ${outside.join(", ")}.`,
    { files: task2.files, paths: outside },
    `Change only the files of ${task2.id} or paths nested in them; commit a subset with \`scripts/workflow commit --task ${task2.id} --files <json|a,b>\`.`
  );
  if (change2.paths.includes(change2.planPath)) {
    const candidate = parse(change2.candidatePlan);
    const expected = candidate && kitTransition(head3, candidate, task2);
    const added = candidate ? (candidate.tasks[0]?.files ?? []).slice(task2.files.length) : [];
    if (!(candidate && expected) || workflowPlanFacade.render(expected) !== workflowPlanFacade.render(candidate) || added.some((file4) => !inTaskScope2(task2.files, file4))) {
      throw contractError(
        `The plan may change only through the Kit's own transitions of ${task2.id}.`,
        [change2.planPath]
      );
    }
  }
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-schedule.ts
var ASSIGNABLE_KINDS = /* @__PURE__ */ new Set(["docs", "work"]);
function pendingPrerequisites(plan, task2) {
  const status = new Map(plan.tasks.map((item) => [item.id, item.status]));
  const pending = task2.dependencies.filter((id) => status.get(id) !== "DONE");
  if (task2.kind === "docs") {
    for (const item of plan.tasks) {
      if (item.kind === "work" && item.roundId === task2.roundId && item.status !== "DONE") {
        pending.push(item.id);
      }
    }
  }
  return [...new Set(pending)];
}
function blocked(task2, code, blockedBy, message) {
  return { blockedBy: [...new Set(blockedBy)], code, message, taskId: task2.id };
}
function verdict(plan, index, taken, maxWorkers) {
  const task2 = plan.tasks[index];
  const pending = pendingPrerequisites(plan, task2);
  if (pending.length > 0) {
    return blocked(
      task2,
      "DEPENDENCY_PENDING",
      pending,
      `${task2.id} waits for unfinished prerequisites: ${pending.join(", ")}.`
    );
  }
  const earlier = plan.tasks.slice(0, index).filter((item) => item.status !== "DONE");
  if (task2.parallelSafe === true) {
    const byId = new Map(plan.tasks.map((item) => [item.id, item]));
    const sequential = [
      ...earlier.filter((item) => item.parallelSafe !== true),
      ...taken.map((id) => byId.get(id)).filter(
        (item) => item !== void 0 && item.parallelSafe !== true
      )
    ];
    if (sequential.length > 0) {
      return blocked(
        task2,
        "ASSIGNMENT_BARRIER",
        sequential.map((item) => item.id),
        `${task2.id} may not overtake an unfinished task that is not parallelSafe.`
      );
    }
    const conflicts = taken.filter(
      (id) => !workflowPlanFacade.compatibleTasks(plan, task2.id, id)
    );
    if (conflicts.length > 0) {
      return blocked(
        task2,
        "ASSIGNMENT_CONFLICT",
        conflicts,
        `${task2.id} is not compatible with the assigned ${conflicts.join(", ")} (paths or dependencies).`
      );
    }
  } else if (earlier.length > 0 || taken.length > 0) {
    return blocked(
      task2,
      "ASSIGNMENT_BARRIER",
      [...earlier.map((item) => item.id), ...taken],
      `${task2.id} is not parallelSafe: every earlier task must be DONE and no assignment may be active.`
    );
  }
  if (taken.length >= maxWorkers) {
    return blocked(
      task2,
      "ASSIGNMENT_CAPACITY",
      taken,
      `All ${maxWorkers} workers are taken.`
    );
  }
  return null;
}
function scheduleAssignments(plan, assignments) {
  const execution = workflowPlanFacade.execution(plan);
  const scope = plan.scope;
  const orchestrated2 = scope !== null && execution.strategy === "orchestrated";
  const active = scope ? [
    ...new Set(
      assignments.filter((item) => item.scopeId === scope.id && isActiveRecord(item)).map((item) => item.taskId)
    )
  ] : [];
  const schedule = {
    active,
    blocked: [],
    idle: null,
    maxWorkers: execution.maxWorkers,
    orchestrated: orchestrated2,
    ready: []
  };
  if (!orchestrated2) {
    return { ...schedule, idle: "NOT_ORCHESTRATED" };
  }
  if (scope.status !== "ACTIVE") {
    return { ...schedule, idle: "SCOPE_NOT_ACTIVE" };
  }
  const taken = [...active];
  plan.tasks.forEach((task2, index) => {
    if (task2.status !== "TODO" || !ASSIGNABLE_KINDS.has(task2.kind) || active.includes(task2.id)) {
      return;
    }
    const reason = verdict(plan, index, taken, execution.maxWorkers);
    if (reason) {
      schedule.blocked.push(reason);
    } else {
      schedule.ready.push(task2.id);
      taken.push(task2.id);
    }
  });
  return schedule;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-setup.ts
import { createHash as createHash3 } from "node:crypto";
import { existsSync as existsSync10, lstatSync as lstatSync2, readFileSync as readFileSync9 } from "node:fs";
import path18 from "node:path";
var NODE_SETUP = {
  bun: {
    args: ["install", "--frozen-lockfile"],
    executable: "bun",
    locks: ["bun.lock", "bun.lockb"]
  },
  npm: {
    args: ["ci"],
    executable: "npm",
    locks: ["package-lock.json", "npm-shrinkwrap.json"]
  },
  pnpm: {
    args: ["install", "--frozen-lockfile"],
    executable: "pnpm",
    locks: ["pnpm-lock.yaml"]
  },
  yarn: {
    args: ["install", "--frozen-lockfile"],
    executable: "yarn",
    locks: ["yarn.lock"]
  }
};
var DEPENDENCY_FIELDS = ["dependencies", "devDependencies"];
var DEPENDENCY_DIRECTORY = "node_modules";
var SETUP_TIMEOUT_MS = 15 * 60 * 1e3;
var OUTPUT_TAIL3 = 4e3;
var SETUP_STATUSES = /* @__PURE__ */ new Set(["NEEDS_SETUP", "READY", "RUNNING"]);
function tail2(text3) {
  return text3.length > OUTPUT_TAIL3 ? `\u2026${text3.slice(-OUTPUT_TAIL3)}` : text3;
}
function hasEntry(file4) {
  try {
    lstatSync2(file4);
    return true;
  } catch {
    return false;
  }
}
function declaresDependencies(worktree) {
  const text3 = workflowPlatformFacade.readTextIfExists(
    path18.join(worktree, "package.json")
  );
  if (text3 === null) {
    return false;
  }
  try {
    const manifest = JSON.parse(text3);
    return DEPENDENCY_FIELDS.some((field4) => {
      const value = manifest[field4];
      return value !== null && typeof value === "object" && Object.keys(value).length > 0;
    });
  } catch {
    return false;
  }
}
function stackSetup(worktree, config) {
  if (!(config.quality.stacks.includes("node") && declaresDependencies(worktree))) {
    return null;
  }
  const configured = NODE_SETUP[config.quality.packageManager ?? ""];
  if (configured) {
    return configured;
  }
  return Object.values(NODE_SETUP).find(
    (setup) => setup.locks.some((lock) => existsSync10(path18.join(worktree, lock)))
  ) ?? NODE_SETUP.npm;
}
function needsSetup(worktree, task2) {
  const config = workflowQualityFacade.readConfig(worktree);
  const checks = workflowQualityFacade.selectChecks({
    assigned: task2.checks,
    config,
    root: worktree,
    service: task2.kind === "docs",
    stage: "commit"
  });
  return checks.some((check2) => check2.command !== void 0) && stackSetup(worktree, config) !== null && !hasEntry(path18.join(worktree, DEPENDENCY_DIRECTORY));
}
function lockFile(worktree, setup) {
  const lock = setup.locks.find(
    (name) => existsSync10(path18.join(worktree, name))
  );
  ensure(
    lock,
    "SETUP_LOCK_REQUIRED",
    `${setup.executable} needs a lock file (${setup.locks.join(" or ")}) in the worktree to install the exact dependencies.`,
    { locks: setup.locks, worktree },
    "Commit the lock file in main, then create the assignment again."
  );
  return path18.join(worktree, lock);
}
function ensureNotLinked(worktree) {
  const dependencies = path18.join(worktree, DEPENDENCY_DIRECTORY);
  let linked = false;
  try {
    linked = lstatSync2(dependencies).isSymbolicLink();
  } catch {
    linked = false;
  }
  ensure(
    !linked,
    "SETUP_LINKED_DEPENDENCIES",
    `${dependencies} is a link; the install would change the dependencies it points to.`,
    { path: dependencies },
    "Remove the link, then repeat assignment:setup."
  );
}
function runInstall(worktree, setup, env) {
  const command = [setup.executable, ...setup.args].join(" ");
  const outcome2 = workflowPlatformFacade.run({
    args: setup.args,
    cwd: worktree,
    env,
    executable: setup.executable,
    timeoutMs: SETUP_TIMEOUT_MS
  });
  const output = tail2(`${outcome2.stdout}${outcome2.stderr}`);
  if (outcome2.status !== 0 || outcome2.timedOut) {
    throw new WorkflowError(
      "SETUP_FAILED",
      `${command} failed in ${worktree}: ${outcome2.timedOut ? `timed out after ${SETUP_TIMEOUT_MS} ms` : outcome2.errorMessage ?? `exit code ${String(outcome2.status)}`}.`,
      { command, exitCode: outcome2.status, output },
      "Fix the cause shown in the output, then repeat assignment:setup."
    );
  }
  return output;
}
function setupAssignment(mainRoot, record, options) {
  ensure(
    record.worktree !== null && SETUP_STATUSES.has(record.status),
    "ASSIGNMENT_STATUS",
    `${record.id} is ${record.status}; setup runs for an attached assignment before its result is ready.`,
    { status: record.status }
  );
  const worktree = record.worktree;
  ensure(
    existsSync10(worktree),
    "ASSIGNMENT_WORKTREE",
    `The worktree ${worktree} of ${record.id} does not exist.`,
    { worktree }
  );
  const setup = stackSetup(
    worktree,
    workflowQualityFacade.readConfig(worktree)
  );
  let receipt = null;
  let output = "";
  if (setup) {
    const lock = lockFile(worktree, setup);
    ensureNotLinked(worktree);
    const lockHash = createHash3("sha256").update(readFileSync9(lock)).digest("hex");
    output = runInstall(worktree, setup, options.env);
    receipt = {
      at: options.now(),
      command: [setup.executable, ...setup.args].join(" "),
      lockHash
    };
  }
  const current = readRecord(mainRoot, record.id) ?? record;
  const updated = {
    ...current,
    setup: receipt ?? current.setup ?? null,
    status: current.status === "NEEDS_SETUP" ? "READY" : current.status,
    updatedAt: options.now()
  };
  writeRecord(mainRoot, updated);
  return { assignment: updated, output, ran: setup !== null };
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/workflow-assignment-facade.ts
function attribute2(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
function documentBlocks(documents2) {
  if (documents2.length === 0) {
    return [];
  }
  return [
    "Context documents (full text, do not re-read them):",
    "",
    ...documents2.flatMap((item) => [
      `<document path="${attribute2(item.path)}"${item.heading ? ` heading="${attribute2(item.heading)}"` : ""} bytes="${item.bytes}">`,
      item.text,
      "</document>",
      ""
    ])
  ];
}
function bullets(items) {
  return items.length > 0 ? items.map((item) => `   - ${item}`) : ["   - (none)"];
}
function executorBrief(plan, task2, record, documents2) {
  const commit2 = task2.kind === "docs" ? `scripts/workflow commit --task ${task2.id} --digest <file.json> (the round digest: result, decisions, contracts, references)` : `scripts/workflow commit --task ${task2.id}`;
  const context = task2.context.map(
    (ref) => ref.heading ? `${ref.path} (${ref.heading})` : ref.path
  );
  const lines = [
    `You are the executor of task ${task2.id} of scope ${record.scopeId}${plan.projectName ? ` (project ${plan.projectName})` : ""}; assignment ${record.id}.`,
    "Your working directory is your own git worktree. Work only there.",
    "",
    `1. FIRST run in your worktree: scripts/workflow assignment:attach ${record.id}`,
    "   If it reports NEEDS_SETUP, run scripts/workflow assignment:setup",
    "   (installs the dependencies from the lock file in your worktree).",
    `2. Then run: scripts/workflow task:start ${task2.id}`,
    "3. Implement the task within its files and acceptance criteria:",
    `   Title: ${task2.title}`,
    ...task2.why ? [`   Why: ${task2.why}`] : [],
    "   Files:",
    ...bullets(task2.files),
    "   Acceptance:",
    ...bullets(task2.acceptance),
    ...context.length > 0 ? ["   Context:", ...bullets(context)] : [],
    "   Change only the listed files or paths nested inside a listed directory;",
    "   anything else fails with ASSIGNMENT_SCOPE (commit a subset with --files).",
    "   Never edit .harness/workflow/**, the launchers scripts/workflow* or the plan",
    "   (ASSIGNMENT_CONTRACT).",
    `4. Commit through the Kit: ${commit2}`,
    "   If a check fails, fix the cause and repeat the same command.",
    "5. Reply with the SHA of that commit.",
    "",
    "Rules:",
    "- In your worktree only these Kit commands work: status, validate, recover,",
    "  show-task, task:start, commit, repair, task:block, assignment:status,",
    "  assignment:setup, assignment:attach (retry); anything else fails with",
    "  ASSIGNMENT_READ_ONLY.",
    "- Never push; the orchestrator integrates your commit.",
    "- Never touch the main checkout, the plan or other tasks.",
    "- Do not set the git identity (no git config user.name / user.email).",
    "- Do not create nested executors.",
    "",
    ...documentBlocks(documents2)
  ];
  return lines.join("\n");
}
var WorkflowAssignmentFacade = class {
  id(scopeId, taskId, iteration) {
    return assignmentId(scopeId, taskId, iteration);
  }
  recordFile(root, id) {
    return recordFile(root, id);
  }
  read(root, id) {
    return readRecord(root, id);
  }
  list(root) {
    return listRecords(root);
  }
  write(root, record) {
    writeRecord(root, record);
  }
  create(input) {
    return newRecord(input);
  }
  isActive(record) {
    return isActiveRecord(record);
  }
  configDigest(root) {
    return configDigest(root);
  }
  schedule(plan, assignments) {
    return scheduleAssignments(plan, assignments);
  }
  /**
   * The executor brief; `documents` (the task context, or the scope
   * specification) follow the brief lines as marked full text.
   */
  brief(plan, task2, record, documents2 = []) {
    return executorBrief(plan, task2, record, documents2);
  }
  /** The main checkout and branch of a linked executor worktree (spec 5.1). */
  locateWorktree(git, root) {
    return locateWorktree(git, root);
  }
  /** `.harness/workflow/local/assignment.json` of a worktree, or null. */
  worktreeRecord(root) {
    return readWorktreeRecord(root);
  }
  writeWorktreeRecord(root, record, mainRoot) {
    return writeWorktreeRecord(root, record, mainRoot);
  }
  /** The one-task plan of the executor worktree, built from the base plan (spec 5.3). */
  executorPlan(base, record, now) {
    return executorPlan(base, record, now);
  }
  /** Throws ASSIGNMENT_CONTRACT / ASSIGNMENT_SCOPE for a commit that breaks the contract. */
  checkExecutorChange(change2) {
    checkExecutorChange(change2);
  }
  /** The task's commit checks need dependencies the worktree lacks (spec 5.4). */
  needsSetup(worktree, task2) {
    return needsSetup(worktree, task2);
  }
  /** `assignment:setup`: the stack install in the worktree, receipt and READY (spec 5.4). */
  setup(mainRoot, record, options) {
    return setupAssignment(mainRoot, record, options);
  }
  /**
   * Removes the worktree and merged branch of an INTEGRATED record and writes
   * `cleanup` DONE or PENDING; the integration calls it right after
   * INTEGRATED (spec 7).
   */
  cleanup(git, mainRoot, record, now) {
    return cleanupAssignment(git, mainRoot, record, now);
  }
  /**
   * `assignment:cancel`: a record that is not INTEGRATED is removed with its
   * registered worktree (dirty only with `force`) and its branch; a git
   * refusal keeps the record (ASSIGNMENT_CANCEL_FAILED).
   */
  cancel(git, mainRoot, record, options) {
    return cancelAssignment(git, mainRoot, record, options);
  }
};
var workflowAssignmentFacade = new WorkflowAssignmentFacade();

// product-parts/kit-core/clusters/project-workflow/modules/workflow-execution-mode/src/workflow-execution-mode-facade.ts
import { createHash as createHash4 } from "node:crypto";
import { rmSync as rmSync5 } from "node:fs";
var PROPOSAL_FILE = "scope-proposal.json";
var PROPOSAL_VERSION = 1;
var REASON_MIN = 10;
var REASON_MAX = 300;
var STRATEGIES3 = /* @__PURE__ */ new Set(["orchestrated", "sequential"]);
var OPTIONS2 = /* @__PURE__ */ new Set(["orchestrated", "refine", "sequential"]);
function canonical(value) {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}
function planDigest(input) {
  return createHash4("sha256").update(JSON.stringify(canonical(input))).digest("hex");
}
function proposalOptions(recommended, hasParallelWork2) {
  ensure(
    STRATEGIES3.has(recommended),
    "PROPOSAL_RECOMMENDATION",
    "The recommendation is sequential or orchestrated."
  );
  if (hasParallelWork2) {
    return [
      recommended,
      recommended === "sequential" ? "orchestrated" : "sequential",
      "refine"
    ];
  }
  ensure(
    recommended === "sequential",
    "NO_PARALLEL_WORK",
    "The plan has no pair of compatible parallelSafe tasks; orchestrated execution cannot be recommended.",
    {},
    "Recommend sequential, or label independent tasks with parallelSafe and concrete files."
  );
  return ["sequential", "refine"];
}
function validReason(reason) {
  const text3 = typeof reason === "string" ? reason.trim() : "";
  ensure(
    text3.length >= REASON_MIN && text3.length <= REASON_MAX,
    "PROPOSAL_REASON",
    `The reason of the recommendation has ${REASON_MIN} to ${REASON_MAX} characters.`
  );
  return text3;
}
function isProposal(value) {
  const record = value;
  return record !== null && typeof record === "object" && record.version === PROPOSAL_VERSION && Number.isSafeInteger(record.generation) && record.generation >= 1 && Array.isArray(record.options);
}
var WorkflowExecutionModeFacade = class {
  proposalFile(root) {
    return workflowGitFacade.localPath(root, PROPOSAL_FILE);
  }
  options(recommended, hasParallelWork2) {
    return proposalOptions(recommended, hasParallelWork2);
  }
  digest(input) {
    return planDigest(input);
  }
  /** The stored proposal; a missing or unreadable record is `null`. */
  readProposal(root) {
    const text3 = workflowPlatformFacade.readTextIfExists(
      this.proposalFile(root)
    );
    if (text3 === null) {
      return null;
    }
    try {
      const parsed = JSON.parse(text3);
      return isProposal(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  /**
   * Builds the next proposal of the cycle (generation + 1) without writing
   * it. Validates the recommendation, the reason and the options.
   */
  nextProposal(root, request) {
    const options = proposalOptions(
      request.recommended,
      request.hasParallelWork
    );
    const reason = validReason(request.reason);
    const previous = this.readProposal(root);
    return {
      choice: null,
      createdAt: request.now,
      generation: (previous?.generation ?? 0) + 1,
      hasParallelWork: request.hasParallelWork,
      input: structuredClone(request.input),
      options,
      planDigest: planDigest(request.input),
      reason,
      recommended: request.recommended,
      refining: false,
      version: PROPOSAL_VERSION
    };
  }
  writeProposal(root, proposal) {
    workflowPlatformFacade.writeFileAtomic(
      this.proposalFile(root),
      `${JSON.stringify(proposal, null, 2)}
`
    );
  }
  /**
   * Checks a choice against the stored proposal and returns it. A missing
   * proposal, another generation, a proposal in refinement or a stored plan
   * that no longer matches its digest fail with PROPOSAL_CHANGED; an option
   * the card does not offer fails with NO_PARALLEL_WORK (orchestrated
   * without parallel work) or PROPOSAL_OPTION.
   */
  verifyChoice(root, request) {
    ensure(
      OPTIONS2.has(request.option),
      "PROPOSAL_OPTION",
      "The option is sequential, orchestrated or refine."
    );
    ensure(
      typeof request.session === "string" && request.session.trim() !== "",
      "PROPOSAL_SESSION",
      "The choice names the session that owns the scope."
    );
    ensure(
      typeof request.note === "string" && request.note.trim() !== "",
      "PROPOSAL_NOTE",
      "The choice records the user's words in the note."
    );
    const proposal = this.readProposal(root);
    const current = proposal !== null && proposal.generation === request.generation && proposal.input !== null && proposal.planDigest === planDigest(proposal.input);
    ensure(
      current,
      "PROPOSAL_CHANGED",
      "The choice does not answer the current scope proposal.",
      { current: proposal?.generation ?? null, generation: request.generation },
      "Read the current proposal and let the user choose again."
    );
    ensure(
      request.option !== "orchestrated" || proposal.hasParallelWork,
      "NO_PARALLEL_WORK",
      "The proposed plan has no parallel work; orchestrated execution is not offered."
    );
    ensure(
      proposal.options.includes(request.option),
      "PROPOSAL_OPTION",
      `The proposal offers only: ${proposal.options.join(", ")}.`
    );
    return proposal;
  }
  /** Records "refine": the plan input is dropped and the cycle stays in refinement. */
  refine(root, proposal, request) {
    const refined = {
      ...proposal,
      choice: {
        at: request.now,
        generation: proposal.generation,
        note: request.note.trim(),
        option: "refine",
        session: request.session.trim()
      },
      input: null,
      planDigest: null,
      refining: true
    };
    this.writeProposal(root, refined);
    return refined;
  }
  /** Removes the proposal record: a scope was created or closed. */
  clear(root) {
    rmSync5(this.proposalFile(root), { force: true });
  }
};
var workflowExecutionModeFacade = new WorkflowExecutionModeFacade();

// product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-roles.ts
var LIST_LIMIT = 10;
var INTEGRATION_JOURNAL = "integration.json";
var ROLE_RULES = {
  executor: "Role executor: work only in this worktree and only on paths equal to or nested in the task files. Never touch main, the plan or other tasks; no nested executors; no push.",
  orchestrator: 'Role orchestrator: work and DOCS tasks go to executors (`assignment:create`, a Claude subagent with isolation: "worktree"), their SHAs to `integration:start`; never implement them in main. Run QUALITY and delivery yourself in main. On CONFLICT or CHECKS_FAILED fix within the task files, then `integration:continue --id <id>`.',
  planning: "Role planning: write the specification and a plan with parallelSafe labels; no functional changes before the scope exists. After proposing, end the turn until the user chooses.",
  self: "Role self: run the tasks in order in main (task:start, work, commit --task). Helper subagents work in main without their own worktree and never commit; no assignments."
};
function emptyFacts(harness) {
  return {
    assignments: [],
    executor: null,
    harness,
    integration: null,
    proposal: null,
    unattachedWorktree: false
  };
}
function orchestrated(plan) {
  return plan.scope !== null && workflowPlanFacade.execution(plan).strategy === "orchestrated";
}
function readIntegration(git, root) {
  const text3 = workflowPlatformFacade.readTextIfExists(
    git.localPath(root, INTEGRATION_JOURNAL)
  );
  if (text3 === null) {
    return null;
  }
  try {
    const journal = JSON.parse(text3);
    const id = journal.assignmentId ?? journal.id;
    return {
      assignmentId: typeof id === "string" ? id : "<id>",
      phase: typeof journal.phase === "string" ? journal.phase : "UNKNOWN"
    };
  } catch {
    return { assignmentId: "<id>", phase: "UNKNOWN" };
  }
}
function mainAssignments(root, plan) {
  return workflowAssignmentFacade.list(root).filter(
    (record) => record.scopeId === plan.scope?.id && workflowAssignmentFacade.isActive(record) || record.cleanup?.status === "PENDING"
  ).map((record) => ({
    cleanupPending: record.cleanup?.status === "PENDING",
    id: record.id,
    scopeId: record.scopeId,
    sourceCommit: record.sourceCommit,
    status: record.status,
    taskId: record.taskId,
    worktree: record.worktree
  }));
}
function isLinkedWorktree(git, root) {
  try {
    workflowAssignmentFacade.locateWorktree(git, root);
    return true;
  } catch {
    return false;
  }
}
function gatherRoleFacts(git, root, plan, harness, warnings) {
  const facts = emptyFacts(harness);
  try {
    const record = workflowAssignmentFacade.worktreeRecord(root);
    if (record) {
      const main = workflowAssignmentFacade.read(record.mainRoot, record.id);
      facts.executor = {
        id: record.id,
        status: main?.status ?? null,
        taskId: record.taskId
      };
      return facts;
    }
    if (plan.scope === null) {
      const proposal = workflowExecutionModeFacade.readProposal(root);
      facts.proposal = proposal && {
        generation: proposal.generation,
        recommended: proposal.recommended,
        refining: proposal.refining
      };
      return facts;
    }
    if (orchestrated(plan)) {
      facts.unattachedWorktree = isLinkedWorktree(git, root);
      if (!facts.unattachedWorktree) {
        facts.assignments = mainAssignments(root, plan);
        facts.integration = readIntegration(git, root);
      }
    }
  } catch (error2) {
    warnings.push(
      `Assignment state is unreadable (${error2.code ?? "error"}); run \`${KIT_COMMAND} assignment:status\` or \`${KIT_COMMAND} doctor\`.`
    );
  }
  return facts;
}
function agentRole(input) {
  const facts = input.roles;
  if (facts?.executor || facts?.unattachedWorktree) {
    return "executor";
  }
  if (input.plan.scope === null) {
    return "planning";
  }
  return orchestrated(input.plan) ? "orchestrator" : "self";
}
function roleRule(role) {
  return ROLE_RULES[role];
}
function bounded(items) {
  const shown = items.slice(0, LIST_LIMIT);
  return items.length > LIST_LIMIT ? [...shown, `\u2026 ${items.length - LIST_LIMIT} more`] : shown;
}
function assignmentLine(record) {
  const place = record.worktree ?? "not attached";
  const cleanup = record.cleanupPending ? ", cleanup PENDING" : "";
  return `${record.id} ${record.taskId} ${record.status} ${place}${cleanup}`;
}
function roleStateLines(input) {
  const role = agentRole(input);
  const facts = input.roles;
  if (role === "executor") {
    return facts?.executor ? [
      `role: executor (assignment ${facts.executor.id}, task ${facts.executor.taskId}, ${facts.executor.status ?? "no main record"})`
    ] : ["role: executor (not attached)"];
  }
  if (role !== "orchestrator" || !facts) {
    return [`role: ${role}`];
  }
  const shown = bounded(facts.assignments.map(assignmentLine));
  return [
    "role: orchestrator",
    `assignments: ${shown.length === 0 ? "none" : ""}`.trimEnd(),
    ...shown.map((line) => `- ${line}`),
    `integration: ${facts.integration ? `${facts.integration.assignmentId} ${facts.integration.phase}` : "none"}`
  ];
}
function planningStep(input) {
  const proposal = input.roles?.proposal;
  if (proposal && !proposal.refining) {
    return `No active scope: the scope proposal (generation ${proposal.generation}, recommended ${proposal.recommended}) is waiting for the user's choice on the card. End the turn; do not create the scope yourself.`;
  }
  const propose = `\`${KIT_COMMAND} scope:propose --input <plan.json> --recommended sequential|orchestrated --reason "<why>"\`, then end the turn and wait for the user's choice on the card`;
  if (proposal?.refining) {
    return `No active scope: the user chose to refine the specification. Discuss it, update the spec and the plan, then propose again: ${propose}.`;
  }
  return input.roles?.harness ? `No active scope. Agree the task with the user, write the specification and a plan with parallelSafe labels, then ${propose}.` : `No active scope. Agree the task with the user, write the specification and the plan, then \`${KIT_COMMAND} scope:create --input <plan.json>\`.`;
}
function commitCommand(task2) {
  return task2.kind === "docs" ? `\`${KIT_COMMAND} commit --task ${task2.id} --digest <file.json>\`` : `\`${KIT_COMMAND} commit --task ${task2.id}\``;
}
function executorStep(input) {
  const executor = input.roles?.executor;
  if (!executor) {
    return `Executor worktree not attached: run \`${KIT_COMMAND} assignment:attach <id>\` with the assignment id from your brief first.`;
  }
  const task2 = input.plan.tasks.find((item) => item.id === executor.taskId);
  if (!task2) {
    return `Task ${executor.taskId} is not in this worktree's plan: report it to the orchestrator.`;
  }
  if (task2.status === "DONE") {
    const sha = input.taskCommits[task2.id];
    return `Task ${task2.id} is committed${sha ? ` (${sha})` : ""}: report the SHA to the orchestrator and end the turn.`;
  }
  if (task2.status === "IN_PROGRESS") {
    return `Continue ${task2.id}: ${task2.title}. Commit with ${commitCommand(task2)}, then report the SHA.`;
  }
  if (executor.status === "NEEDS_SETUP") {
    return `The worktree needs setup: run \`${KIT_COMMAND} assignment:setup\`, then \`${KIT_COMMAND} task:start ${task2.id}\`.`;
  }
  return `Start ${task2.id} via \`${KIT_COMMAND} task:start ${task2.id}\`: ${task2.title}. Then commit with ${commitCommand(task2)} and report the SHA.`;
}
function integrationStep(integration2) {
  const id = integration2.assignmentId;
  const resume2 = `\`${KIT_COMMAND} integration:continue --id ${id}\``;
  if (integration2.phase === "CONFLICT") {
    return `Integration of ${id} stopped on CONFLICT: resolve the conflicts within the task files, then ${resume2}.`;
  }
  if (integration2.phase === "CHECKS_FAILED") {
    return `Integration of ${id} failed its checks: fix the cause within the task files, then ${resume2}.`;
  }
  return `Integration of ${id} is ${integration2.phase}: finish it with ${resume2} before anything else (\`${KIT_COMMAND} integration:status\` shows it).`;
}
function ownStep(plan, facts) {
  const done = new Set(
    plan.tasks.filter((task2) => task2.status === "DONE").map((task2) => task2.id)
  );
  const own = plan.tasks.find(
    (task2) => task2.status === "TODO" && (task2.kind === "quality" || task2.kind === "delivery") && task2.dependencies.every((id) => done.has(id))
  );
  if (!own) {
    return null;
  }
  if (own.kind === "quality") {
    return `Run ${own.id} yourself in main via \`${KIT_COMMAND} task:start ${own.id}\`: ${own.title}`;
  }
  const pending = plan.tasks.some(
    (task2) => task2.kind !== "delivery" && task2.status !== "DONE"
  );
  const active = facts.assignments.some(
    (record) => workflowAssignmentFacade.isActive(record)
  );
  return pending || active ? null : `Next task ${own.id} is delivery: ask the user to confirm it, then \`${KIT_COMMAND} task:start ${own.id} --confirmed "<user confirmation>"\`.`;
}
function orchestratorStep(input) {
  const { plan } = input;
  const facts = input.roles ?? emptyFacts(false);
  if (facts.integration) {
    return integrationStep(facts.integration);
  }
  const lines = [];
  const results = facts.assignments.filter(
    (record) => record.status === "READY_FOR_INTEGRATION"
  );
  if (results.length > 0) {
    lines.push(
      "Integrate first, one at a time:",
      ...bounded(
        results.map(
          (record) => `\`${KIT_COMMAND} integration:start --id ${record.id} --source ${shortSha(record.sourceCommit)}\` (task ${record.taskId})`
        )
      ).map((line) => `- ${line}`)
    );
  }
  const current = plan.tasks.find((task2) => task2.id === plan.currentTaskId);
  const own = current ? `Continue ${current.id} in main: ${current.title}` : ownStep(plan, facts);
  if (own) {
    lines.push(own);
  }
  const ready = current ? [] : workflowAssignmentFacade.schedule(plan, facts.assignments).ready;
  if (ready.length > 0) {
    lines.push(
      `Hand out ${ready.join(", ")}: for each, \`${KIT_COMMAND} assignment:create --task <ID>\`, then launch a Claude subagent (Agent tool with isolation: "worktree") with the returned brief and wait for its SHA (\`${KIT_COMMAND} assignment:next\` lists what can go now).`
    );
  }
  const running = facts.assignments.filter(
    (record) => workflowAssignmentFacade.isActive(record) && record.status !== "READY_FOR_INTEGRATION"
  );
  if (lines.length === 0 && running.length > 0) {
    lines.push(
      `Waiting for executors: ${bounded(running.map((record) => `${record.id} (${record.taskId}, ${record.status})`)).join(", ")}. Integrate each result when its SHA arrives.`
    );
  }
  const cleanups = facts.assignments.filter((record) => record.cleanupPending);
  if (cleanups.length > 0) {
    lines.push(
      `Finish cleanups: ${bounded(cleanups.map((record) => `\`${KIT_COMMAND} assignment:cleanup --id ${record.id}\``)).join(", ")}.`
    );
  }
  return lines.length > 0 ? lines.join("\n") : "No task is ready: check dependencies with the user.";
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-sections.ts
var LIST_LIMIT2 = 40;
var UPCOMING = 3;
var RECENT = 3;
var FULL_ROUNDS = 3;
var DECISIONS = 5;
var VERIFICATION_OUTPUT_BYTES = 1024;
var ROUND_LINE_BYTES = 160;
function bullets2(items, empty = "none") {
  return items.length === 0 ? `- ${empty}` : items.map((item) => `- ${item}`).join("\n");
}
function limited(paths) {
  const shown = paths.slice(0, LIST_LIMIT2);
  return paths.length > LIST_LIMIT2 ? [...shown, `\u2026 ${paths.length - LIST_LIMIT2} more`] : shown;
}
function oneLine(task2) {
  return `${task2.id} [${task2.kind}] ${task2.title}`;
}
function focusTask(plan) {
  const current = plan.tasks.find((task2) => task2.id === plan.currentTaskId);
  if (current) {
    return current;
  }
  const done = new Set(
    plan.tasks.filter((task2) => task2.status === "DONE").map((task2) => task2.id)
  );
  return plan.tasks.find(
    (task2) => task2.status === "TODO" && task2.dependencies.every((id) => done.has(id))
  ) ?? null;
}
function stateSection(input) {
  const { plan } = input;
  const scope = plan.scope;
  const transaction2 = input.transaction ? `${input.transaction.id} ${input.transaction.phase} (${input.transaction.role}${input.transaction.taskId ? ` ${input.transaction.taskId}` : ""})` : "none";
  return [
    `project: ${plan.projectName} (${plan.projectId})`,
    scope ? `scope: ${scope.id} ${scope.status}, result ${scope.delivery}, revision ${plan.revision}` : `scope: NONE, revision ${plan.revision}`,
    `quality: ${input.quality.status}${input.quality.stacks.length > 0 ? ` (${input.quality.stacks.join(", ")})` : ""}`,
    `head: ${shortSha(input.head)}`,
    `transaction: ${transaction2}`,
    `event: ${input.event}`,
    ...roleStateLines(input),
    ...(input.warnings ?? []).map((warning) => `warning: ${warning}`)
  ].join("\n");
}
function nextStep(input, role) {
  const { plan } = input;
  const scope = plan.scope;
  if (!scope) {
    return planningStep(input);
  }
  if (input.transaction) {
    return `A commit transaction is unfinished: run \`${KIT_COMMAND} repair\` before anything else.`;
  }
  if (scope.status === "BLOCKED") {
    return `BLOCKED: ${scope.blockedReason ?? "no reason recorded"}. Resolve it with the user, then unblock.`;
  }
  if (role === "executor") {
    return executorStep(input);
  }
  if (scope.delivery === "READY_FOR_ACCEPTANCE") {
    return "Scope is READY_FOR_ACCEPTANCE: ask the user to accept the result or report defects.";
  }
  if (scope.delivery === "ACCEPTED") {
    return "Scope is ACCEPTED: the user decides when to close it.";
  }
  if (role === "orchestrator") {
    return orchestratorStep(input);
  }
  const task2 = focusTask(plan);
  if (!task2) {
    return "No task is ready: check dependencies with the user.";
  }
  if (task2.status === "IN_PROGRESS") {
    return `Continue ${task2.id}: ${task2.title}`;
  }
  if (task2.kind === "delivery") {
    return `Next task ${task2.id} is delivery: ask the user to confirm it, then \`${KIT_COMMAND} task:start ${task2.id} --confirmed "<user confirmation>"\`.`;
  }
  return `Start ${task2.id} via \`${KIT_COMMAND} task:start ${task2.id}\`: ${task2.title}`;
}
function nextSection(input) {
  const role = agentRole(input);
  return `${nextStep(input, role)}
${roleRule(role)}`;
}
function objectiveSection(input) {
  const scope = input.plan.scope;
  if (!scope) {
    return "none";
  }
  return [scope.objective, "", "Acceptance:", bullets2(scope.acceptance)].join(
    "\n"
  );
}
function field3(name, value, cap, taskId) {
  if (cap === null || Buffer.byteLength(value, "utf8") <= cap) {
    return `${name}: ${value}`;
  }
  const kept = cutBytes(value, cap);
  const removed = Buffer.byteLength(value, "utf8") - Buffer.byteLength(kept, "utf8");
  return `${name}: ${kept} [truncated: ${removed} bytes, run: ${KIT_COMMAND} show-task ${taskId}]`;
}
function describeTask(plan, task2, taskCommits3, cap = null) {
  const lines = [
    `${task2.id} [${task2.kind}] ${task2.status}, round ${task2.roundId}, iteration ${task2.iteration}`,
    `title: ${task2.title}`,
    field3("why", task2.why, cap, task2.id),
    field3("files", task2.files.join(", ") || "none", cap, task2.id),
    `dependencies: ${task2.dependencies.join(", ") || "none"}`,
    `checks: ${task2.checks.join(", ") || "profile defaults"}`,
    field3("acceptance", task2.acceptance.join(" | ") || "none", cap, task2.id),
    field3(
      "context",
      task2.context.map((ref) => ref.heading ? `${ref.path}#${ref.heading}` : ref.path).join(", ") || "none",
      cap,
      task2.id
    ),
    `commit: ${task2.commitMessage}`
  ];
  if (task2.docsWaiver) {
    lines.push(`docsWaiver: ${task2.docsWaiver}`);
  }
  if (task2.confirmation) {
    lines.push(`confirmation: ${task2.confirmation}`);
  }
  if (task2.fixes) {
    const original = plan.tasks.find((item) => item.id === task2.fixes);
    lines.push(
      `fixes: ${task2.fixes} ${shortSha(taskCommits3[task2.fixes])}${original ? ` \u2014 ${original.title}` : ""}`
    );
  }
  if (taskCommits3[task2.id]) {
    lines.push(`committed: ${taskCommits3[task2.id]}`);
  }
  return lines.join("\n");
}
function taskSection(input, cap = null) {
  const task2 = focusTask(input.plan);
  return task2 ? describeTask(input.plan, task2, input.taskCommits, cap) : "none";
}
function upcomingSection(input) {
  const focus = focusTask(input.plan);
  const pending = input.plan.tasks.filter(
    (task2) => task2.status === "TODO" && task2.id !== focus?.id
  );
  const shown = pending.slice(0, UPCOMING).map(oneLine);
  const rest = pending.length - shown.length;
  return [bullets2(shown), `remaining after these: ${rest}`].join("\n");
}
function recentSection(input) {
  const done = input.plan.tasks.filter((task2) => task2.status === "DONE").slice(-RECENT);
  return bullets2(
    done.map(
      (task2) => `${task2.id} ${shortSha(input.taskCommits[task2.id])} ${task2.title}`
    )
  );
}
function roundsSection(input) {
  const digested = input.plan.rounds.filter((round) => round.digest);
  if (digested.length === 0) {
    return null;
  }
  const full = digested.slice(-FULL_ROUNDS);
  const early = digested.slice(0, -FULL_ROUNDS);
  const lines = early.map(
    (round) => `- ${round.id} ${round.title}: ${cutBytes(round.digest?.result ?? "", ROUND_LINE_BYTES)}`
  );
  for (const round of full) {
    const digest = round.digest;
    if (!digest) {
      continue;
    }
    lines.push(
      `### ${round.id} ${round.title} (${round.status})`,
      digest.result
    );
    for (const [label, items] of [
      ["decisions", digest.decisions],
      ["contracts", digest.contracts],
      ["references", digest.references]
    ]) {
      if (items.length > 0) {
        lines.push(`${label}:`, bullets2(items));
      }
    }
  }
  return lines.join("\n");
}
function decisionsSection(input) {
  const decisions = input.plan.scope?.decisions ?? [];
  if (decisions.length === 0) {
    return null;
  }
  return bullets2(
    decisions.slice(-DECISIONS).map((decision3) => `${decision3.at}: ${decision3.text}`)
  );
}
function changesSection(input) {
  const lines = [
    `outside the task: ${input.changes.length === 0 ? "none" : ""}`.trimEnd()
  ];
  if (input.changes.length > 0) {
    lines.push(bullets2(limited(input.changes)));
  }
  if (input.transaction) {
    lines.push(
      `pending transaction ${input.transaction.id}: ${input.transaction.phase}${input.transaction.error ? ` \u2014 ${cutBytes(input.transaction.error, 300)}` : ""}`
    );
  }
  return lines.join("\n");
}
function verificationSection(input) {
  const verification = input.verification;
  if (!verification) {
    return null;
  }
  const lines = [`commit: ${shortSha(verification.commit)}`];
  let budget = VERIFICATION_OUTPUT_BYTES;
  for (const report of verification.reports) {
    lines.push(`${report.stage}: ${report.ok ? "ok" : "failed"}`);
    for (const item of report.results.filter(
      (entry) => entry.status !== "passed" && entry.status !== "skipped"
    )) {
      const output = cutBytes(
        item.output.slice(-VERIFICATION_OUTPUT_BYTES),
        budget
      );
      budget -= Buffer.byteLength(output, "utf8");
      lines.push(`- ${item.id} ${item.status}${output ? `:
${output}` : ""}`);
    }
  }
  return lines.join("\n");
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-schema.ts
var QUALITY_COMMAND = "quality:apply";
function inputSchemaCommands() {
  return [...workflowPlanFacade.inputSchemaCommands(), QUALITY_COMMAND];
}
function inputSchema(command) {
  return command === QUALITY_COMMAND ? workflowQualityFacade.inputSchema() : workflowPlanFacade.inputSchema(command);
}
function limits(spec) {
  const items = [];
  const add = (label, value) => {
    if (value !== void 0) {
      items.push(`${label} ${value}`);
    }
  };
  add("minItems", spec.minItems);
  add("maxItems", spec.maxItems);
  add("maxBytes", spec.maxBytes);
  add("minLength", spec.minLength);
  add("minimum", spec.minimum);
  add("maximum", spec.maximum);
  add("enum", spec.enum?.join("|"));
  add("pattern", spec.pattern);
  add("code", spec.code);
  add("limitCode", spec.limitCode);
  return items;
}
function fieldLine(spec) {
  return `- ${spec.name} ${spec.type} ${spec.required ? "required" : "optional"} [${limits(spec).join(", ")}] \u2014 ${spec.description}`;
}
function schemaText(schema) {
  return [
    `${schema.command}: ${schema.description}`,
    "fields:",
    ...schema.fields.map(fieldLine),
    "rules:",
    ...schema.rules.map((rule) => `- ${rule}`),
    "example:",
    JSON.stringify(schema.example)
  ].join("\n");
}
function stepTask(input) {
  const executor = input.roles?.executor;
  const task2 = executor ? input.plan.tasks.find((item) => item.id === executor.taskId) : focusTask(input.plan);
  return task2 && task2.status !== "DONE" ? task2 : null;
}
function nextSchemaCommand(input) {
  const scope = input.plan.scope;
  if (!scope) {
    const proposal = input.roles?.proposal;
    if (proposal && !proposal.refining) {
      return null;
    }
    return input.roles?.harness ? "scope:propose" : "scope:create";
  }
  if (input.transaction || scope.status === "BLOCKED") {
    return null;
  }
  const role = agentRole(input);
  if (role !== "executor" && (scope.delivery === "READY_FOR_ACCEPTANCE" || scope.delivery === "ACCEPTED")) {
    return "plan:extend";
  }
  const task2 = stepTask(input);
  if (task2?.kind === "quality") {
    return QUALITY_COMMAND;
  }
  return task2?.kind === "docs" && role !== "orchestrator" ? "digest" : null;
}
function schemaSection(input) {
  const command = nextSchemaCommand(input);
  const schema = command ? inputSchema(command) : null;
  return schema ? `Input of the next step (\`${KIT_COMMAND} schema ${schema.command}\` prints it again).
${schemaText(schema)}` : null;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-budget.ts
var DOCUMENT_PREFIX = "document ";
var RULES_POINTER = "rules: follow the Workflow Kit section of AGENTS.md (managed by the kit).";
var TASK_CAPS = [2e3, 1e3, 500, 250, 120, 60];
var HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*#*\s*$/u;
var SLUG_DROP = /[^\p{L}\p{N}\s-]/gu;
var SLUG_SPACE = /\s+/gu;
function slug(text3) {
  return text3.toLowerCase().replace(SLUG_DROP, "").trim().replace(SLUG_SPACE, "-");
}
function extractHeading(text3, heading) {
  const lines = text3.split("\n");
  const wanted = slug(heading);
  let start = -1;
  let level = 0;
  for (const [index, line] of lines.entries()) {
    const match = HEADING_PATTERN.exec(line);
    if (!match?.[1] || match[2] === void 0) {
      continue;
    }
    if (start === -1 && slug(match[2]) === wanted) {
      start = index;
      level = match[1].length;
    } else if (start !== -1 && match[1].length <= level) {
      return lines.slice(start, index).join("\n").trimEnd();
    }
  }
  return start === -1 ? null : lines.slice(start).join("\n").trimEnd();
}
function render(input, parts, references, omitted, bytes) {
  const sorted = [...parts].sort((left, right) => left.order - right.order);
  const head3 = [
    "# Workflow recovery packet",
    `bytes: ${bytes} / budget: ${input.budgetBytes}${bytes > input.budgetBytes ? " (over budget)" : ""}`,
    `included: ${sorted.map((part) => part.name).join(", ")}`,
    `omitted: ${omitted.length > 0 ? omitted.join(", ") : "none"}`,
    RULES_POINTER
  ].join("\n");
  const body = sorted.map((part) => `## ${part.name}
${part.text}`);
  const refs = `## references
${references.length > 0 ? references.map((line) => `- ${line}`).join("\n") : "- none"}`;
  return `${[head3, ...body, refs].join("\n\n")}
`;
}
function settle(input, parts, references, omitted) {
  let bytes = 0;
  let text3 = render(input, parts, references, omitted, bytes);
  for (let attempt = 0; attempt < 4 && byteLength2(text3) !== bytes; attempt += 1) {
    bytes = byteLength2(text3);
    text3 = render(input, parts, references, omitted, bytes);
  }
  return { bytes: byteLength2(text3), text: text3 };
}
function documentRefs(input) {
  const scope = input.plan.scope;
  const refs = [];
  if (scope?.spec) {
    refs.push({ path: scope.spec, required: true });
  }
  refs.push(
    ...scope?.context ?? [],
    ...focusTask(input.plan)?.context ?? []
  );
  const byKey = /* @__PURE__ */ new Map();
  for (const ref of refs) {
    const whole = refs.some((item) => item.path === ref.path && !item.heading);
    const key = whole ? ref.path : `${ref.path}#${ref.heading ?? ""}`;
    byKey.set(key, {
      path: ref.path,
      ...whole || !ref.heading ? {} : { heading: ref.heading },
      required: (byKey.get(key)?.required ?? false) || ref.required
    });
  }
  return [...byKey.values()];
}
function documentParts(input, references) {
  const parts = [];
  for (const ref of documentRefs(input)) {
    const label = ref.heading ? `${ref.path}#${ref.heading}` : ref.path;
    const text3 = input.readDocument(ref.path);
    if (text3 === null) {
      references.push(`${label}: missing file`);
      continue;
    }
    if (!ref.required) {
      references.push(
        `${label} (${byteLength2(text3)} bytes, optional): read the file when needed`
      );
      continue;
    }
    const section2 = ref.heading ? extractHeading(text3, ref.heading) : null;
    if (ref.heading && section2 === null) {
      references.push(
        `${label}: heading not found, the whole file is included`
      );
    }
    parts.push(
      section2 === null ? {
        name: `${DOCUMENT_PREFIX}${ref.path}`,
        order: 12,
        text: text3.trimEnd()
      } : { name: `${DOCUMENT_PREFIX}${label}`, order: 12, text: section2 }
    );
  }
  return parts;
}
function optionalCandidates(input) {
  const candidates = [];
  const add = (name, order, text3, reference) => {
    if (text3 !== null) {
      candidates.push({
        part: { name, order, text: text3 },
        reference: reference(byteLength2(text3))
      });
    }
  };
  add(
    "documents",
    13,
    input.documents?.text || null,
    (bytes) => `documents (${bytes} bytes): run \`${KIT_COMMAND} context --list\``
  );
  add(
    "rounds",
    8,
    roundsSection(input),
    (bytes) => `rounds (${bytes} bytes): run \`${KIT_COMMAND} history\``
  );
  add(
    "decisions",
    9,
    decisionsSection(input),
    (bytes) => `decisions (${bytes} bytes): scope.decisions in ${PLAN_PATH}`
  );
  add(
    "verification",
    11,
    verificationSection(input),
    (bytes) => `verification (${bytes} bytes): .harness/workflow/local/verification/last.json`
  );
  return candidates;
}
function mandatoryParts(input, cap) {
  const schema = schemaSection(input);
  return [
    { name: "state", order: 1, text: stateSection(input) },
    { name: "next", order: 2, text: nextSection(input) },
    { name: "objective", order: 3, text: objectiveSection(input) },
    { name: "task", order: 4, text: taskSection(input, cap) },
    ...schema === null ? [] : [{ name: "schema", order: 5, text: schema }],
    { name: "upcoming", order: 6, text: upcomingSection(input) },
    { name: "recent", order: 7, text: recentSection(input) },
    { name: "changes", order: 10, text: changesSection(input) }
  ];
}
function assembleWithCap(input, cap) {
  const references = [];
  const omitted = [];
  const candidates = optionalCandidates(input);
  const fits = (parts2) => settle(input, parts2, references, omitted).bytes <= input.budgetBytes;
  let parts = [
    ...mandatoryParts(input, cap),
    ...documentParts(input, references)
  ];
  const optional = [];
  for (const candidate of candidates) {
    if (fits([...parts, candidate.part])) {
      parts = [...parts, candidate.part];
      optional.push({ candidate, part: candidate.part });
    } else {
      omitted.push(candidate.part.name);
      references.push(candidate.reference);
    }
  }
  while (!fits(parts) && optional.length > 0) {
    const last = optional.pop();
    if (last) {
      parts = parts.filter((part) => part !== last.part);
      omitted.push(last.part.name);
      references.push(last.candidate.reference);
    }
  }
  const { bytes, text: text3 } = settle(input, parts, references, omitted);
  const sorted = [...parts].sort((left, right) => left.order - right.order);
  return {
    budget: input.budgetBytes,
    bytes,
    event: input.event,
    included: sorted.map((part) => part.name),
    omitted,
    overBudget: bytes > input.budgetBytes,
    references,
    schema: RECOVERY_SCHEMA,
    sections: sorted.map(({ name, text: sectionText }) => ({
      name,
      text: sectionText
    })),
    text: text3,
    truncated: cap !== null && taskSection(input, cap) !== taskSection(input)
  };
}
function overWithoutDocuments(packet) {
  const documents2 = packet.sections.filter((section2) => section2.name.startsWith(DOCUMENT_PREFIX)).reduce(
    (sum, section2) => sum + byteLength2(`

## ${section2.name}
${section2.text}`),
    0
  );
  return packet.bytes - documents2 > packet.budget;
}
function assemblePacket(input) {
  let packet = assembleWithCap(input, null);
  for (const cap of TASK_CAPS) {
    if (!(packet.overBudget && overWithoutDocuments(packet))) {
      break;
    }
    packet = assembleWithCap(input, cap);
  }
  return packet;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-commands.ts
var HOST_RECOVERY_VARIABLE = "HARNESS_WORKFLOW_RECOVERY";
var EVENTS = /* @__PURE__ */ new Set([
  "startup",
  "resume",
  "clear",
  "compact"
]);
function hookEvent(stdin) {
  try {
    const parsed = JSON.parse(stdin || "{}");
    const source = parsed && typeof parsed === "object" ? parsed.source : void 0;
    return typeof source === "string" && EVENTS.has(source) ? source : "startup";
  } catch {
    return "startup";
  }
}
function sessionStartResponse(context, env) {
  const output = {
    hookEventName: "SessionStart"
  };
  if (env[HOST_RECOVERY_VARIABLE] !== "host") {
    const text3 = context();
    if (text3 !== null) {
      output.additionalContext = text3;
    }
  }
  return `${JSON.stringify({ continue: true, hookSpecificOutput: output })}
`;
}
function showTaskText(plan, taskId, commits) {
  const task2 = plan.tasks.find((item) => item.id === taskId);
  ensure(task2, "UNKNOWN_TASK", `Task not found: ${taskId}`);
  return `${describeTask(plan, task2, commits)}
`;
}
function workflowHistory(git, root, plan, filter) {
  const roundTasks2 = filter.round ? new Set(
    plan.tasks.filter((task2) => task2.roundId === filter.round).map((task2) => task2.id)
  ) : null;
  const commits = git.head(root) ? git.history(root, plan.scope?.baselineCommit ?? null) : [];
  return commits.map((commit2) => ({
    role: commit2.trailers["Workflow-Role"]?.[0] ?? "external",
    sha: commit2.sha,
    subject: commit2.subject,
    taskId: commit2.trailers["Workflow-Task"]?.[0] ?? null
  })).map((entry) => ({
    ...entry,
    taskId: entry.taskId === "-" ? null : entry.taskId
  })).filter((entry) => !filter.task || entry.taskId === filter.task).filter(
    (entry) => !roundTasks2 || entry.taskId !== null && roundTasks2.has(entry.taskId)
  );
}
function historyText(entries2) {
  if (entries2.length === 0) {
    return "No workflow commits match.\n";
  }
  return `${entries2.map((entry) => `${entry.sha.slice(0, 8)} ${entry.role} ${entry.taskId ?? "-"} ${entry.subject}`).join("\n")}
`;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-documents.ts
var DOCUMENTS_MAP_BYTES = 4e3;
var MARKDOWN = /\.(md|markdown)$/iu;
var H22 = /^##\s+(.+?)\s*#*\s*$/u;
var FENCE3 = /^\s*(```|~~~)/u;
var EXCLUDED_SEGMENTS = /* @__PURE__ */ new Set([".git", "node_modules"]);
var EXCLUDED_PREFIXES = [".harness/workflow/", ".harness/plans/archive/"];
function excluded(file4) {
  return file4.split("/").some((segment) => EXCLUDED_SEGMENTS.has(segment)) || EXCLUDED_PREFIXES.some((prefix) => file4.startsWith(prefix));
}
function headings(text3) {
  const found = [];
  let fenced = false;
  for (const line of text3.split("\n")) {
    if (FENCE3.test(line)) {
      fenced = !fenced;
      continue;
    }
    const match = fenced ? null : H22.exec(line);
    if (match?.[1]) {
      found.push(match[1]);
    }
  }
  return found;
}
function markdownPaths(git, root) {
  const output = git.git.run(
    root,
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "*.md",
      "*.markdown"
    ],
    { allowFailure: true }
  );
  if (output.status !== 0) {
    return [];
  }
  const paths = new Set(
    output.stdout.split("\0").filter((file4) => MARKDOWN.test(file4) && !excluded(file4))
  );
  return [...paths].sort((left, right) => left < right ? -1 : 1);
}
function ordered(paths, specPath) {
  const slash = specPath ? specPath.lastIndexOf("/") : -1;
  if (!specPath || slash === -1) {
    return paths;
  }
  const folder = specPath.slice(0, slash + 1);
  return [
    ...paths.filter((file4) => file4.startsWith(folder)),
    ...paths.filter((file4) => !file4.startsWith(folder))
  ];
}
function readMarkdown(root, file4) {
  try {
    return workflowPlatformFacade.readTextIfExists(
      workflowPlatformFacade.resolveInside(root, file4)
    );
  } catch {
    return null;
  }
}
function entryLine(entry) {
  const base = `${entry.path} (${entry.bytes} bytes)`;
  return entry.headings.length > 0 ? `${base}: ${entry.headings.join("; ")}` : base;
}
var DEFAULT_MORE = `\`${KIT_COMMAND} context --list\``;
function tailLine(count, more) {
  return `\u2026 ${count} more documents: ${more}`;
}
function renderDocumentsMap(entries2, budget, more) {
  const lines = [];
  let used = 0;
  for (const [index, entry] of entries2.entries()) {
    const line = entryLine(entry);
    const rest = entries2.length - index - 1;
    const next = used + byteLength2(line) + (lines.length > 0 ? 1 : 0);
    const reserve = rest > 0 ? byteLength2(tailLine(rest, more)) + 1 : 0;
    if (next + reserve > budget) {
      break;
    }
    lines.push(line);
    used = next;
  }
  const hidden = entries2.length - lines.length;
  return {
    entries: entries2,
    shown: lines.length,
    text: [...lines, ...hidden > 0 ? [tailLine(hidden, more)] : []].join(
      "\n"
    )
  };
}
function documentsMap(git, root, options = {}) {
  const entries2 = [];
  const folder = options.folder ? `${options.folder}/` : "";
  for (const file4 of ordered(
    markdownPaths(git, root).filter((item) => item.startsWith(folder)),
    options.specPath ?? null
  )) {
    const text3 = readMarkdown(root, file4);
    if (text3 !== null) {
      entries2.push({
        bytes: byteLength2(text3),
        headings: headings(text3),
        path: file4
      });
    }
  }
  return renderDocumentsMap(
    entries2,
    options.budget ?? DOCUMENTS_MAP_BYTES,
    options.more ?? DEFAULT_MORE
  );
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-gather.ts
function readDocument(root, file4) {
  try {
    return workflowPlatformFacade.readTextIfExists(
      workflowPlatformFacade.resolveInside(root, file4)
    );
  } catch {
    return null;
  }
}
function taskCommits2(git, root, plan, notes) {
  try {
    const commits = {};
    for (const [taskId, reference] of git.resolveReferences(
      root,
      plan,
      PLAN_PATH
    )) {
      if (reference.status === "committed") {
        commits[taskId] = reference.sha;
      }
    }
    return commits;
  } catch (error2) {
    notes.warnings.push(
      `Commit references are inconsistent (${error2.code ?? "error"}); run \`scripts/workflow doctor\`.`
    );
    return {};
  }
}
function transaction(git, root) {
  const journal = git.transactions.journal(root);
  return journal ? {
    error: journal.error,
    id: journal.id,
    phase: journal.phase,
    role: journal.role,
    taskId: journal.taskId
  } : null;
}
function outsideChanges(git, root, plan) {
  const task2 = focusTask(plan);
  const own = new Set(task2?.status === "IN_PROGRESS" ? task2.files : []);
  return git.changes(root).all.filter((file4) => !(own.has(file4) || git.isKitManagedPath(file4)));
}
function gatherRecovery(git, root, event, notes) {
  const plan = workflowPlanFacade.read(root) ?? workflowPlanFacade.createEmpty("unknown", "Project");
  const config = workflowQualityFacade.readConfig(root);
  const repository = git.isRepository(root);
  if (!repository) {
    notes.warnings.push("The project is not a git repository.");
  }
  const evidence = workflowQualityFacade.readEvidence(root);
  return {
    budgetBytes: config.budget.recoveryBytes,
    changes: repository ? outsideChanges(git, root, plan) : [],
    documents: repository ? documentsMap(git, root, { specPath: plan.scope?.spec ?? null }) : null,
    event,
    head: repository ? git.head(root) : null,
    plan,
    quality: { stacks: config.quality.stacks, status: config.quality.status },
    readDocument: (file4) => readDocument(root, file4),
    roles: gatherRoleFacts(
      git,
      root,
      plan,
      config.host === "harness",
      notes.warnings
    ),
    taskCommits: repository ? taskCommits2(git, root, plan, notes) : {},
    transaction: repository ? transaction(git, root) : null,
    verification: evidence ? { commit: evidence.commit ?? null, reports: evidence.reports } : null
  };
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-parts.ts
import { createHash as createHash5 } from "node:crypto";
var PART_LIMIT = 9500;
var MAX_PARTS = 16;
var INCOMPLETE_RESERVE = 200;
var HEAD_LINE = /^head: (\S+)/mu;
var REVISION = /\brevision (\d+)/u;
var SECTION_START = /(?=^## )/mu;
var LINE_END = /(?<=\n)/u;
var PART_VALUE = /^(\d{1,2})\/(\d{1,2})$/u;
function partLine(index, count, meta) {
  return `# Workflow recovery packet \u2014 part ${index}/${count} \xB7 revision ${meta.revision} \xB7 head ${meta.head} \xB7 digest ${meta.digest}
`;
}
function packetMeta(text3) {
  return {
    digest: createHash5("sha256").update(text3).digest("hex").slice(0, 12),
    head: HEAD_LINE.exec(text3)?.[1] ?? "-",
    revision: REVISION.exec(text3)?.[1] ?? "-"
  };
}
function cutLine(line, limit) {
  const pieces = [];
  let rest = line;
  while (rest.length > limit) {
    let cut = limit;
    const code = rest.charCodeAt(cut - 1);
    if (code >= 55296 && code <= 56319) {
      cut -= 1;
    }
    pieces.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest !== "") {
    pieces.push(rest);
  }
  return pieces;
}
function units(text3, limit) {
  const result2 = [];
  for (const section2 of text3.split(SECTION_START)) {
    if (section2.length <= limit) {
      result2.push(section2);
      continue;
    }
    for (const line of section2.split(LINE_END)) {
      result2.push(...cutLine(line, limit));
    }
  }
  return result2.filter((unit) => unit !== "");
}
function pack2(items, limit) {
  const chunks = [];
  let current = "";
  for (const item of items) {
    if (current !== "" && current.length + item.length > limit) {
      chunks.push(current);
      current = "";
    }
    current += item;
  }
  if (current !== "" || chunks.length === 0) {
    chunks.push(current);
  }
  return chunks;
}
function packetParts(text3, count) {
  const meta = packetMeta(text3);
  const body = PART_LIMIT - partLine(MAX_PARTS, MAX_PARTS, meta).length - 1;
  const pieces = units(text3, body - INCOMPLETE_RESERVE);
  const full = pack2(pieces, body);
  let chunks = full;
  if (full.length > count) {
    const head3 = full.slice(0, count - 1);
    const used = head3.reduce((sum, chunk) => sum + chunk.length, 0);
    const last = pack2(joinFrom(pieces, used), body - INCOMPLETE_RESERVE)[0] ?? "";
    const line = `
Packet incomplete: it needs ${full.length} parts, ${count} delivered. Run \`scripts/workflow recover --format text\`.
`;
    chunks = [...head3, `${last}${line}`];
  }
  const total = chunks.length;
  return {
    needed: full.length,
    parts: chunks.map((chunk, i) => `${partLine(i + 1, total, meta)}${chunk}`)
  };
}
function joinFrom(pieces, used) {
  let consumed = 0;
  const rest = [];
  for (const piece of pieces) {
    if (consumed >= used) {
      rest.push(piece);
    }
    consumed += piece.length;
  }
  return rest;
}
function parsePart(value) {
  const match = PART_VALUE.exec(value ?? "");
  if (!match) {
    return null;
  }
  const index = Number(match[1]);
  const count = Number(match[2]);
  return index >= 1 && index <= count && count <= MAX_PARTS ? { count, index } : null;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/workflow-recovery-facade.ts
var WorkflowRecoveryFacade = class {
  git;
  constructor(git = workflowGitFacade) {
    this.git = git;
  }
  /** Builds the packet from already gathered state. */
  build(input) {
    return assemblePacket(input);
  }
  /** Markdown section under a heading, matched by text or slug. */
  section(text3, heading) {
    return extractHeading(text3, heading);
  }
  /**
   * The documents map of a project (the packet `documents` section):
   * Markdown files known to git (only under `folder` when given), the
   * specification folder first, within `budget` bytes (default 4000) with a
   * tail line (hint `more`) for the rest.
   */
  documentsMap(root, options = {}) {
    return documentsMap(this.git, root, options);
  }
  /**
   * Input descriptor of a Kit command (the plan commands, `digest` and
   * `quality:apply`, read from their owner facades), or null.
   */
  inputSchema(command) {
    return inputSchema(command);
  }
  /** Commands with an input descriptor, in a stable order. */
  inputSchemaCommands() {
    return inputSchemaCommands();
  }
  /** The compact text of a descriptor, as the packet `schema` section shows it. */
  schemaText(schema) {
    return schemaText(schema);
  }
  /** Reads plan, configuration, git state and evidence of a project. */
  gather(root, event = "startup") {
    const notes = { warnings: [] };
    const input = gatherRecovery(this.git, root, event, notes);
    return { ...input, warnings: notes.warnings };
  }
  packet(root, event = "startup") {
    return assemblePacket(this.gather(root, event));
  }
  /** `recover --format text|json`. */
  render(packet, format = "text") {
    return format === "json" ? `${JSON.stringify(packet, null, 2)}
` : packet.text;
  }
  /**
   * `hook session-start --client claude|codex [--part K/N]`: reads the hook
   * input and answers in the SessionStart format, with the whole packet or
   * with its part K (no context when the packet has fewer parts). Errors
   * never block the session.
   */
  sessionStart(root, options) {
    const event = hookEvent(options.stdin);
    return sessionStartResponse(() => {
      let text3;
      try {
        text3 = this.packet(root, event).text;
      } catch (error2) {
        const { code, message } = error2;
        text3 = `Workflow Kit could not build the recovery packet (${code ?? "error"}): ${message}
Run \`scripts/workflow doctor\`.`;
      }
      const part = options.part;
      if (!part) {
        return text3;
      }
      return packetParts(text3, part.count).parts[part.index - 1] ?? null;
    }, options.env ?? process.env);
  }
  /** `show-task <ID>`: the full task text with its commit when done. */
  showTask(root, taskId) {
    const input = this.gather(root);
    return showTaskText(input.plan, taskId, input.taskCommits);
  }
  /** `history [--task ID] [--round R]`: workflow commits from git. */
  history(root, filter = {}) {
    const plan = workflowPlanFacade.read(root) ?? workflowPlanFacade.createEmpty("unknown", "Project");
    const entries2 = workflowHistory(this.git, root, plan, filter);
    return { entries: entries2, text: historyText(entries2) };
  }
};
var workflowRecoveryFacade = new WorkflowRecoveryFacade();

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-hook.ts
function runHook(args, io, kit, root) {
  if (args.command === "hook") {
    const client = flag(args, "client");
    if (positional(args, 0, "Hook name") !== "session-start" || client !== "claude" && client !== "codex") {
      throw new WorkflowError(
        "USAGE",
        "hook session-start --client claude|codex"
      );
    }
    const partValue = flag(args, "part");
    const part = partValue === void 0 ? null : parsePart(partValue);
    if (partValue !== void 0 && part === null) {
      io.stderr(
        "hook session-start: --part must be K/N with 1 <= K <= N <= 16\n"
      );
      io.stdout(
        `${JSON.stringify({ continue: true, hookSpecificOutput: { hookEventName: "SessionStart" } })}
`
      );
      return 0;
    }
    io.stdout(kit.sessionStart(root, client, io.readStdin(), part));
    return 0;
  }
  const result2 = kit.gitHook(
    root,
    positional(args, 0, "Hook name"),
    args.positionals.slice(1)
  );
  if (result2.message) {
    io.stderr(`${result2.message}
`);
  }
  return result2.exitCode;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-identity.ts
function identityText(value) {
  const result2 = value;
  return `identity: ${result2.name} <${result2.email}> (${result2.scope} git config)
`;
}
var IDENTITY_COMMANDS = {
  "identity:set": {
    run: ({ args, kit, root }) => {
      ensure(
        args.flags.get("global") === true,
        "USAGE",
        "identity:set needs --global: the identity is set once for all projects."
      );
      const identity = kit.git.writeGlobalIdentity(root, {
        email: flag(args, "email") ?? "",
        name: flag(args, "name") ?? ""
      });
      return { ...identity, scope: "global" };
    },
    text: identityText,
    usage: 'identity:set --name "<name>" --email <email> --global'
  }
};

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-integration.ts
var short = (sha) => sha?.slice(0, 12) ?? "none";
function outcomeText(value) {
  const result2 = value;
  const lines = [
    `integration: ${result2.assignmentId} ${result2.status}, task ${result2.taskId}, source ${short(result2.source)} into ${short(result2.mainHead)}`
  ];
  if (result2.status === "CONFLICT") {
    for (const file4 of result2.conflicts) {
      lines.push(`conflict: ${file4}`);
    }
    lines.push(
      `next: resolve the conflicts inside the files of ${result2.taskId}, git add them, then scripts/workflow integration:continue --id ${result2.assignmentId}`
    );
    return `${lines.join("\n")}
`;
  }
  lines.push(`commit: ${short(result2.integrationCommit)}`);
  const cleanup = result2.assignment?.cleanup;
  lines.push(
    cleanup?.status === "PENDING" ? `cleanup: PENDING \u2014 ${cleanup.reason} (repeat with scripts/workflow assignment:cleanup --id ${result2.assignmentId})` : "cleanup: DONE"
  );
  lines.push("next: scripts/workflow assignment:next");
  return `${lines.join("\n")}
`;
}
function statusText2(value) {
  const result2 = value;
  const journal = result2.journal;
  if (!journal) {
    return `integration: IDLE${result2.mergeHead ? ` (a merge of ${short(result2.mergeHead)} is in progress without the Kit)` : ""}
`;
  }
  const lines = [
    `integration: ${journal.assignmentId} ${journal.phase}, task ${journal.taskId}, source ${short(journal.source)} into ${short(journal.mainHead)}`,
    ...result2.conflicts.map((file4) => `conflict: ${file4}`)
  ];
  if (journal.error) {
    lines.push(
      `error: ${journal.error.trim().split("\n").slice(-5).join("\n")}`
    );
  }
  lines.push(
    journal.phase === "UNKNOWN" ? "next: inspect main (git status, git log -1); the Kit does not retry an unproven state" : `next: scripts/workflow integration:continue --id ${journal.assignmentId}`
  );
  return `${lines.join("\n")}
`;
}
var INTEGRATION_COMMANDS = {
  "integration:continue": {
    run: ({ args, kit, root }) => kit.continueIntegration(root, requiredFlag(args, "id")),
    text: outcomeText,
    usage: "integration:continue --id <assignment>"
  },
  "integration:start": {
    run: ({ args, kit, root }) => kit.startIntegration(
      root,
      requiredFlag(args, "id"),
      requiredFlag(args, "source")
    ),
    text: outcomeText,
    usage: "integration:start --id <assignment> --source <sha>"
  },
  "integration:status": {
    run: ({ kit, root }) => kit.integrationStatus(root),
    text: statusText2,
    usage: "integration:status"
  }
};

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-pause.ts
function pauseText(value) {
  const result2 = value;
  return result2.paused ? `pause: on (${result2.at}) \u2014 ${result2.note}
task:start in main and assignment:create are refused until the user continues.
` : `pause: off (${result2.at}) \u2014 ${result2.note}
`;
}
var PAUSE_COMMANDS = {
  "pause:set": {
    run: ({ args, kit, root }) => {
      const on = args.flags.get("on") === true;
      const off = args.flags.get("off") === true;
      ensure(
        on !== off,
        "USAGE",
        "pause:set needs exactly one of --on or --off."
      );
      return kit.setPause(root, on, requiredFlag(args, "note"));
    },
    text: pauseText,
    usage: `pause:set --on|--off --note "<the user's words>"`
  }
};

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-schema.ts
function schemaList() {
  return {
    commands: workflowRecoveryFacade.inputSchemaCommands().map((command) => ({
      command,
      description: workflowRecoveryFacade.inputSchema(command)?.description ?? ""
    }))
  };
}
function schemaText2(value) {
  if ("commands" in value) {
    return [
      "Commands with an input schema:",
      ...value.commands.map(
        (item) => `- ${item.command} \u2014 ${item.description}`
      ),
      "Run `scripts/workflow schema <command>` for its fields, rules and an example.",
      ""
    ].join("\n");
  }
  return `${workflowRecoveryFacade.schemaText(value)}
`;
}
var SCHEMA_COMMANDS = {
  schema: {
    run: ({ args }) => {
      const command = args.positionals[0];
      if (command === void 0) {
        return schemaList();
      }
      const schema = workflowRecoveryFacade.inputSchema(command);
      if (!schema) {
        const commands = workflowRecoveryFacade.inputSchemaCommands();
        throw new WorkflowError(
          "USAGE",
          `${command} has no input schema. Commands with a schema: ${commands.join(", ")}.`,
          { commands },
          "Run `scripts/workflow schema` for the list."
        );
      }
      return schema;
    },
    text: schemaText2,
    usage: "schema [<command>]"
  }
};

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-scope.ts
var SCOPE_COMMANDS = {
  accept: {
    run: ({ args, kit, root }) => kit.accept(root, requiredFlag(args, "note")),
    usage: `accept --note "<the user's words>"`
  },
  carryover: {
    run: ({ args, io, kit, root }) => kit.carryover(
      root,
      readJsonFile(io.cwd, requiredFlag(args, "input"))
    ),
    usage: "carryover --input <file.json>"
  },
  close: {
    run: ({ args, kit, root }) => kit.close(root, requiredFlag(args, "scope"), requiredFlag(args, "note")),
    usage: 'close --scope <id> --note "<direct user command>"'
  },
  "plan:extend": {
    run: ({ args, io, kit, root }) => kit.extend(
      root,
      readJsonFile(io.cwd, requiredFlag(args, "input")),
      integerFlag(args, "expected-revision")
    ),
    usage: "plan:extend --input <file.json> [--expected-revision N]"
  },
  "scope:create": {
    run: ({ args, io, kit, root }) => kit.createScope(
      root,
      readJsonFile(io.cwd, requiredFlag(args, "input"))
    ),
    usage: "scope:create --input <file.json>"
  },
  "task:block": {
    run: ({ args, kit, root }) => kit.block(root, requiredFlag(args, "reason")),
    usage: 'task:block --reason "<text>"'
  },
  "task:unblock": {
    run: ({ kit, root }) => kit.unblock(root),
    usage: "task:unblock"
  },
  "task:update": {
    run: ({ args, io, kit, root }) => kit.updateTask(
      root,
      positional(args, 0, "Task id"),
      readJsonFile(io.cwd, requiredFlag(args, "input")),
      integerFlag(args, "expected-revision")
    ),
    usage: "task:update <ID> --input <patch.json> [--expected-revision N]"
  }
};

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-text.ts
function executionLine(status) {
  const { execution } = status;
  if (!execution) {
    return "execution: none";
  }
  if (execution.strategy !== "orchestrated") {
    return `execution: ${execution.strategy}`;
  }
  const counts = /* @__PURE__ */ new Map();
  for (const item of status.assignments) {
    counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  }
  const assignments = counts.size === 0 ? "none" : [...counts].map(([state, count]) => `${state} ${count}`).join(", ");
  const integration2 = status.integration ? `, integration ${status.integration.taskId ?? "unknown"} ${status.integration.phase ?? "unknown"}` : "";
  return `execution: orchestrated (max ${execution.maxWorkers} workers), assignments: ${assignments}${integration2}`;
}
function statusText3(status) {
  const lines = [
    `project: ${status.project ? `${status.project.name} (${status.project.id})` : "not installed"}`,
    status.scope ? `scope: ${status.scope.id} ${status.scope.status}, result ${status.scope.delivery}, revision ${status.revision}` : `scope: NONE, revision ${status.revision}`
  ];
  if (status.scope?.blockedReason) {
    lines.push(`blocked: ${status.scope.blockedReason}`);
  }
  lines.push(executionLine(status));
  if (status.executor) {
    lines.push(
      `executor: assignment ${status.executor.assignmentId}, task ${status.executor.taskId}`
    );
  }
  lines.push(
    `paused: ${status.paused}`,
    `progress: ${status.progress.done}/${status.progress.total}`,
    `current: ${status.currentTask ? `${status.currentTask.id} ${status.currentTask.title}` : "none"}`,
    `next: ${status.nextTask ? `${status.nextTask.id} [${status.nextTask.kind}] ${status.nextTask.title}` : "none"}`,
    `quality: ${status.quality.status}${status.quality.stacks.length > 0 ? ` (${status.quality.stacks.join(", ")})` : ""}, drift ${status.quality.drift.status}`,
    `head: ${status.head ? status.head.slice(0, 8) : "none"}`,
    `transaction: ${status.transaction ? `${status.transaction.id} ${status.transaction.phase}` : "none"}`,
    `changes: ${status.changes.length === 0 ? "none" : status.changes.join(", ")}`
  );
  return `${lines.join("\n")}
`;
}
function validationText(report) {
  return report.ok ? "Plan and history are consistent.\n" : `${report.errors.map((error2) => `${error2.code}: ${error2.message}`).join("\n")}
`;
}
function inspectText(result2) {
  const { git } = result2;
  const repository = git.repository ? `repository, head ${git.head ? git.head.slice(0, 8) : "none"}` : "not a repository";
  const lines = [
    `path: ${result2.path}`,
    `state: ${result2.state}`,
    `action: ${result2.action}`,
    `kit version: ${result2.version ?? "none"}`,
    `git: ${repository}`,
    `identity: ${git.identity ? `${git.identity.name} <${git.identity.email}>` : "not set"}`,
    `stacks: ${result2.stacks.length > 0 ? result2.stacks.join(", ") : "none"}`,
    `transaction: ${result2.transactionPending ? "pending" : "none"}`
  ];
  if (result2.nestedIn) {
    lines.push(`nested in: ${result2.nestedIn}`);
  }
  if (result2.damaged.length > 0) {
    lines.push(`damaged: ${result2.damaged.join(", ")}`);
  }
  return `${lines.join("\n")}
`;
}
function renderText(command, result2) {
  const value = result2;
  switch (command) {
    case "status":
      return statusText3(result2);
    case "validate":
      return validationText(result2);
    case "inspect":
      return inspectText(result2);
    case "recover":
    case "history":
    case "show-task":
      return String(value.text ?? "");
    default:
      return `${JSON.stringify(result2, null, 2)}
`;
  }
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/src/workflow-integration-facade.ts
import { existsSync as existsSync11 } from "node:fs";

// product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/src/integration-journal.ts
import { rmSync as rmSync6 } from "node:fs";
var JOURNAL_FILE = "integration.json";
var PHASES = /* @__PURE__ */ new Set([
  "CHECKING",
  "CHECKS_FAILED",
  "CONFLICT",
  "MERGING",
  "PREPARED",
  "UNKNOWN"
]);
function journalFile(root) {
  return workflowGitFacade.localPath(root, JOURNAL_FILE);
}
function isJournal(value) {
  const journal = value;
  return journal !== null && typeof journal === "object" && [
    journal.assignmentId,
    journal.mainHead,
    journal.operationId,
    journal.source,
    journal.taskId
  ].every((field4) => typeof field4 === "string" && field4 !== "") && PHASES.has(journal.phase);
}
function readJournal2(root) {
  const file4 = journalFile(root);
  const text3 = workflowPlatformFacade.readTextIfExists(file4);
  if (text3 === null) {
    return null;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(text3);
  } catch {
    parsed = null;
  }
  if (!isJournal(parsed)) {
    throw new WorkflowError(
      "INTEGRATION_UNKNOWN",
      "The integration journal is unreadable.",
      { file: file4 },
      "Inspect main (`git status`) and the journal; the Kit does not guess the state."
    );
  }
  return parsed;
}
function saveJournal2(root, journal) {
  workflowPlatformFacade.writeFileAtomic(
    journalFile(root),
    `${JSON.stringify(journal, null, 2)}
`
  );
}
function removeJournal2(root) {
  rmSync6(journalFile(root), { force: true });
}
function integrationState(git, root) {
  const journal = readJournal2(root);
  const mergeHead2 = git.mergeHead(root);
  return {
    conflicts: mergeHead2 ? git.conflicts(root) : [],
    journal,
    mergeHead: mergeHead2,
    status: journal?.phase ?? "IDLE"
  };
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/src/integration-merge.ts
import { randomUUID as randomUUID2 } from "node:crypto";

// product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/src/integration-phases.ts
var MERGE_TIMEOUT_MS = 10 * 60 * 1e3;
var ERROR_TAIL = 4e3;
var UNKNOWN_HINT = "Inspect main with `git status` and `git log -1`; abort a merge in progress with `git merge --abort`, then remove .harness/workflow/local/integration.json and start the integration again.";
var continueHint = (id) => `scripts/workflow integration:continue --id ${id}`;
function outcome(journal, fields) {
  return {
    assignment: null,
    assignmentId: journal.assignmentId,
    conflicts: [],
    integrationCommit: null,
    mainHead: journal.mainHead,
    operationId: journal.operationId,
    source: journal.source,
    taskId: journal.taskId,
    ...fields
  };
}
function unknown(root, journal, message, error2 = null) {
  saveJournal2(root, { ...journal, error: error2, phase: "UNKNOWN" });
  throw new WorkflowError(
    "INTEGRATION_UNKNOWN",
    message,
    { error: error2, operationId: journal.operationId },
    UNKNOWN_HINT
  );
}
function candidatePlan(git, root, plan, journal) {
  const task2 = workflowPlanFacade.task(plan, journal.taskId);
  let digest = null;
  if (task2.kind === "docs") {
    const text3 = git.show(root, journal.source, PLAN_PATH);
    const source = text3 ? workflowPlanFacade.parse(text3, { projection: false }) : null;
    digest = source?.rounds.find((round) => round.id === task2.roundId)?.digest ?? null;
  }
  return workflowPlanFacade.integrateTask(plan, task2.id, {
    digest,
    operationId: journal.operationId,
    sourceCommit: journal.source
  });
}
function finish(git, root, journal, sha, now) {
  const record = workflowAssignmentFacade.read(root, journal.assignmentId);
  ensure(
    record,
    "ASSIGNMENT_UNKNOWN",
    `The main checkout has no assignment ${journal.assignmentId}.`
  );
  let updated = record.status === "INTEGRATED" && record.integrationCommit === sha ? record : {
    ...record,
    integrationCommit: sha,
    status: "INTEGRATED",
    updatedAt: now()
  };
  workflowAssignmentFacade.write(root, updated);
  try {
    updated = workflowAssignmentFacade.cleanup(git, root, updated, now());
  } catch (error2) {
    updated = {
      ...updated,
      cleanup: {
        at: now(),
        reason: error2.message,
        status: "PENDING"
      }
    };
    workflowAssignmentFacade.write(root, updated);
  }
  removeJournal2(root);
  return outcome(journal, {
    assignment: updated,
    integrationCommit: sha,
    status: "INTEGRATED"
  });
}
function merge(git, root, journal) {
  const dirty = git.changes(root).all;
  ensure(
    dirty.length === 0 && git.mergeHead(root) === null,
    "INTEGRATION_DIRTY",
    "Main has changes; the integration merges only into a clean main.",
    { paths: dirty }
  );
  const merging = { ...journal, phase: "MERGING" };
  saveJournal2(root, merging);
  const output = git.git.run(
    root,
    ["merge", "--no-commit", "--no-ff", "-q", journal.source],
    { allowFailure: true, timeoutMs: MERGE_TIMEOUT_MS }
  );
  if (git.mergeHead(root) !== journal.source) {
    unknown(
      root,
      merging,
      `git merge of ${journal.source} left no merge state; it is never retried automatically.`,
      `${output.stderr}${output.stdout}`.slice(-ERROR_TAIL)
    );
  }
  return merging;
}
function commit(git, root, journal, plan, files) {
  const candidate = candidatePlan(git, root, plan, journal);
  const task2 = workflowPlanFacade.task(plan, journal.taskId);
  const checking = {
    ...journal,
    error: null,
    phase: "CHECKING"
  };
  saveJournal2(root, checking);
  try {
    return git.transactions.commit(root, {
      assignmentId: journal.assignmentId,
      checks: task2.checks,
      files,
      iteration: task2.iteration,
      message: `merge: ${task2.title}`,
      planPath: PLAN_PATH,
      planText: workflowPlanFacade.render(candidate),
      role: "integration",
      scopeId: plan.scope?.id ?? null,
      sourceCommit: journal.source,
      taskId: task2.id,
      transactionId: journal.operationId
    }).sha;
  } catch (error2) {
    if (!(error2 instanceof WorkflowError && error2.code === "COMMIT_FAILED")) {
      throw error2;
    }
    const output = String(error2.details.output ?? error2.message);
    saveJournal2(root, {
      ...checking,
      error: output.slice(-ERROR_TAIL),
      phase: "CHECKS_FAILED"
    });
    throw new WorkflowError(
      "INTEGRATION_CHECKS_FAILED",
      `The checks of ${task2.id} failed on the merged result; the merge and your fixes are kept.`,
      { output, phase: "CHECKS_FAILED" },
      `Fix the files of ${task2.id} in main, then run ${continueHint(journal.assignmentId)}.`
    );
  }
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/src/integration-proof.ts
var LAUNCHERS2 = /* @__PURE__ */ new Set([
  "scripts/workflow",
  "scripts/workflow.cmd",
  "scripts/workflow.ps1"
]);
var PLAN_ROLE = "assignment-plan";
var RESULT_OK = /* @__PURE__ */ new Set(["passed", "skipped"]);
var HISTORY_HINT = "Integrate only the commit the executor reported: its worktree history must be the assignment plan commit followed by its task commits.";
function single(commit2, key) {
  const values = commit2.trailers[key] ?? [];
  return values.length === 1 ? values[0] ?? null : null;
}
function historyError(message, details) {
  return new WorkflowError(
    "INTEGRATION_HISTORY",
    message,
    details,
    HISTORY_HINT
  );
}
function resolveCommit(git, root, revision) {
  const output = git.git.run(
    root,
    ["rev-parse", "--verify", "-q", `${revision}^{commit}`],
    { allowFailure: true }
  );
  return output.status === 0 ? output.stdout.trim() : null;
}
function checkSource(git, mainRoot, assignment, sourceSha) {
  const worktree = assignment.worktree;
  ensure(
    assignment.status === "READY_FOR_INTEGRATION" && worktree !== null && assignment.sourceCommit !== null,
    "INTEGRATION_NOT_READY",
    `Assignment ${assignment.id} is ${assignment.status}, not READY_FOR_INTEGRATION.`,
    { id: assignment.id, status: assignment.status }
  );
  const source = resolveCommit(git, mainRoot, sourceSha);
  ensure(
    source !== null && source === assignment.sourceCommit,
    "INTEGRATION_SOURCE",
    `${sourceSha} is not the source commit ${assignment.sourceCommit} of assignment ${assignment.id}.`,
    { expected: assignment.sourceCommit, source: source ?? sourceSha }
  );
  ensure(
    git.head(worktree) === source,
    "INTEGRATION_SOURCE",
    `The executor worktree ${worktree} is not at the source commit ${source}.`,
    { head: git.head(worktree), source, worktree }
  );
  const changes = git.changes(worktree).all;
  ensure(
    changes.length === 0,
    "INTEGRATION_DIRTY",
    `The executor worktree ${worktree} has uncommitted changes.`,
    { paths: changes, worktree }
  );
  return { source, worktree };
}
function basePlan(git, mainRoot, baseCommit) {
  const text3 = git.show(mainRoot, baseCommit, PLAN_PATH);
  ensure(
    text3 !== null,
    "INTEGRATION_CONTRACT",
    `The base commit ${baseCommit} has no plan.`
  );
  return workflowPlanFacade.parse(text3);
}
function findTask2(plan, taskId) {
  return plan.tasks.find((task2) => task2.id === taskId) ?? null;
}
function taskRole(task2) {
  return task2.kind === "docs" ? "docs" : "implementation";
}
function checkHistory(git, mainRoot, assignment, task2, source) {
  const commits = git.history(mainRoot, assignment.baseCommit, source);
  const scopeId = `assignment-${assignment.id}`;
  const role = taskRole(task2);
  let parent = assignment.baseCommit;
  commits.forEach((commit2, index) => {
    const expectedRole = index === 0 ? PLAN_ROLE : role;
    const wrong = [
      ["parents", commit2.parents.join(" "), parent],
      ["Workflow-Role", single(commit2, "Workflow-Role"), expectedRole],
      ["Workflow-Scope", single(commit2, "Workflow-Scope"), scopeId],
      ["Workflow-Task", single(commit2, "Workflow-Task"), task2.id],
      [
        "Workflow-Assignment",
        single(commit2, "Workflow-Assignment"),
        assignment.id
      ],
      [
        "Workflow-Iteration",
        single(commit2, "Workflow-Iteration"),
        String(assignment.iteration)
      ]
    ].filter(([, actual, expected]) => actual !== expected);
    if (wrong.length > 0) {
      throw historyError(
        `Commit ${commit2.sha} is not the ${expectedRole} commit of assignment ${assignment.id}.`,
        {
          mismatches: wrong.map(([field4, actual, expected]) => ({
            actual,
            expected,
            field: field4
          })),
          sha: commit2.sha
        }
      );
    }
    parent = commit2.sha;
  });
  const [planCommit] = commits;
  const last = commits.at(-1);
  if (!(planCommit && last && commits.length > 1 && last.sha === source)) {
    throw historyError(
      `${assignment.baseCommit}..${source} must hold the assignment plan commit and at least one ${role} commit.`,
      { commits: commits.map((commit2) => commit2.sha) }
    );
  }
  const planPaths = git.commitPaths(mainRoot, planCommit.sha);
  if (planPaths.length !== 1 || planPaths[0] !== PLAN_PATH) {
    throw historyError(
      `The assignment plan commit ${planCommit.sha} must change only ${PLAN_PATH}.`,
      { paths: planPaths, sha: planCommit.sha }
    );
  }
  return last;
}
function checkDiff(git, mainRoot, baseCommit, source) {
  const changed = git.diffPaths(mainRoot, baseCommit, source);
  const managed = changed.filter(
    (file4) => file4 !== PLAN_PATH && (git.isKitManagedPath(file4) || LAUNCHERS2.has(file4))
  );
  if (managed.length > 0) {
    throw historyError(
      `The executor source changes Workflow Kit files: ${managed.join(", ")}.`,
      { paths: managed }
    );
  }
  return changed;
}
function readReceipt(worktree, sha) {
  try {
    return workflowQualityFacade.readEvidence(worktree, sha);
  } catch {
    return null;
  }
}
function checkReceipt(worktree, task2, last) {
  const receipt = readReceipt(worktree, last.sha);
  const unchecked = (message, details) => new WorkflowError(
    "INTEGRATION_UNCHECKED",
    message,
    { sha: last.sha, ...details },
    "The executor repeats `scripts/workflow commit --task <ID>` in its worktree so the checks run on its commit."
  );
  if (!(receipt && Array.isArray(receipt.reports)) || receipt.commit !== last.sha || receipt.transaction !== single(last, "Workflow-Transaction")) {
    throw unchecked(`No check receipt refers to commit ${last.sha}.`, {});
  }
  const checks = receipt.reports.flatMap(
    (report) => (report.results ?? []).map((result2) => ({
      id: result2.id,
      stage: result2.stage,
      status: result2.status
    }))
  );
  const expected = workflowQualityFacade.selectChecks({
    assigned: task2.checks,
    config: workflowQualityFacade.readConfig(worktree),
    root: worktree,
    service: taskRole(task2) !== "implementation",
    stage: "commit"
  });
  const status = (id) => checks.find((check2) => check2.id === id && check2.stage === "commit")?.status;
  const bad = [
    ...checks.filter((check2) => !RESULT_OK.has(check2.status)).map((c) => c.id),
    ...expected.filter(
      (check2) => task2.checks.includes(check2.id) ? status(check2.id) !== "passed" : !RESULT_OK.has(status(check2.id) ?? "error")
    ).map((check2) => check2.id)
  ];
  if (bad.length > 0) {
    throw unchecked(
      `Checks of commit ${last.sha} did not pass: ${[...new Set(bad)].join(", ")}.`,
      { checks: [...new Set(bad)] }
    );
  }
  return checks;
}
function checkContract(mainRoot, assignment, base) {
  const current = workflowPlanFacade.read(mainRoot);
  const task2 = current ? findTask2(current, assignment.taskId) : null;
  const contract = (item) => JSON.stringify({
    acceptance: item.acceptance,
    files: item.files,
    kind: item.kind,
    title: item.title
  });
  ensure(
    current?.scope?.id === assignment.scopeId && task2 !== null && contract(task2) === contract(base),
    "INTEGRATION_CONTRACT",
    `The contract of task ${assignment.taskId} in main differs from its base commit ${assignment.baseCommit}.`,
    { scopeId: current?.scope?.id ?? null, taskId: assignment.taskId },
    "Create a new assignment for the changed task."
  );
}
function proveSource(git, mainRoot, assignment, sourceSha) {
  const { source, worktree } = checkSource(
    git,
    mainRoot,
    assignment,
    sourceSha
  );
  const baseTask = findTask2(
    basePlan(git, mainRoot, assignment.baseCommit),
    assignment.taskId
  );
  ensure(
    baseTask !== null,
    "INTEGRATION_CONTRACT",
    `The base plan has no task ${assignment.taskId}.`,
    { taskId: assignment.taskId }
  );
  const last = checkHistory(git, mainRoot, assignment, baseTask, source);
  const changedFiles = checkDiff(git, mainRoot, assignment.baseCommit, source);
  const checks = checkReceipt(worktree, baseTask, last);
  checkContract(mainRoot, assignment, baseTask);
  return {
    assignmentId: assignment.id,
    baseCommit: assignment.baseCommit,
    changedFiles,
    checks,
    sourceCommit: source,
    sourceTree: git.git.text(mainRoot, ["rev-parse", `${source}^{tree}`]),
    taskId: assignment.taskId
  };
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/src/integration-merge.ts
function inTaskScope3(files, file4) {
  return files.some((entry) => file4 === entry || file4.startsWith(`${entry}/`));
}
function resolveCommit2(git, root, revision) {
  const output = git.git.run(
    root,
    ["rev-parse", "--verify", "-q", `${revision}^{commit}`],
    { allowFailure: true }
  );
  return output.status === 0 ? output.stdout.trim() : null;
}
function mainPlan(git, root, journal) {
  const text3 = git.show(root, journal.mainHead, PLAN_PATH);
  ensure(text3 !== null, "NOT_INSTALLED", `${PLAN_PATH} is missing in main.`);
  const plan = workflowPlanFacade.parse(text3);
  return { plan, task: workflowPlanFacade.task(plan, journal.taskId), text: text3 };
}
function isIntegrationCommit(git, root, journal, head3) {
  const commit2 = git.history(root, journal.mainHead, head3).find((item) => item.sha === head3);
  return commit2 !== void 0 && commit2.parents.join(" ") === `${journal.mainHead} ${journal.source}` && commit2.trailers["Workflow-Role"]?.join() === "integration" && commit2.trailers["Workflow-Transaction"]?.join() === journal.operationId;
}
function resume(git, root, stored, now) {
  let journal = stored;
  const transaction2 = git.transactions.journal(root);
  if (transaction2) {
    ensure(
      transaction2.role === "integration" && transaction2.id === journal.operationId,
      "TRANSACTION_PENDING",
      "A commit transaction outside this integration is unfinished.",
      {},
      "Run `scripts/workflow repair`."
    );
    if (git.transactions.confirmed(root, transaction2)) {
      const finished = git.transactions.finish(root);
      return finish(git, root, journal, finished?.sha ?? "", now);
    }
    if (!git.transactions.cancel(root)) {
      unknown(
        root,
        journal,
        "The prepared integration commit changed concurrently."
      );
    }
  }
  const head3 = git.head(root);
  if (head3 !== journal.mainHead) {
    if (head3 && isIntegrationCommit(git, root, journal, head3)) {
      return finish(git, root, journal, head3, now);
    }
    unknown(
      root,
      journal,
      `Main moved to ${head3 ?? "nothing"} outside the integration of ${journal.mainHead}.`
    );
  }
  if (journal.phase === "UNKNOWN") {
    throw new WorkflowError(
      "INTEGRATION_UNKNOWN",
      "The integration state could not be proven earlier; it is not retried.",
      { error: journal.error, operationId: journal.operationId },
      UNKNOWN_HINT
    );
  }
  if (journal.phase === "PREPARED") {
    journal = merge(git, root, journal);
  }
  if (git.mergeHead(root) !== journal.source) {
    unknown(root, journal, `No merge of ${journal.source} is in progress.`);
  }
  const { plan, task: task2, text: text3 } = mainPlan(git, root, journal);
  workflowPlatformFacade.writeFileAtomic(
    workflowPlanFacade.planFile(root),
    text3
  );
  git.git.run(root, ["add", "--", PLAN_PATH]);
  const conflicts = git.conflicts(root);
  if (conflicts.length > 0) {
    saveJournal2(root, { ...journal, phase: "CONFLICT" });
    return outcome(journal, { conflicts, status: "CONFLICT" });
  }
  const changed = git.changes(root).all.filter((file4) => file4 !== PLAN_PATH);
  const outside = changed.filter((file4) => !inTaskScope3(task2.files, file4));
  if (outside.length > 0) {
    git.git.run(root, ["merge", "--abort"]);
    removeJournal2(root);
    throw new WorkflowError(
      "INTEGRATION_SCOPE",
      `The merged result changes files outside ${task2.id}: ${outside.join(", ")}. The merge was aborted.`,
      { paths: outside },
      `Keep the integration inside the files of ${task2.id}, then run scripts/workflow integration:start --id ${journal.assignmentId} --source ${journal.source}.`
    );
  }
  const sha = commit(git, root, journal, plan, changed);
  return finish(git, root, journal, sha, now);
}
function ensureCanIntegrate(git, root, plan) {
  ensure(
    plan,
    "NOT_INSTALLED",
    `${PLAN_PATH} does not exist; install the Workflow Kit first.`
  );
  ensure(
    plan.scope !== null && workflowPlanFacade.execution(plan).strategy === "orchestrated",
    "NOT_ORCHESTRATED",
    "Integration exists only in an orchestrated scope."
  );
  ensure(
    plan.scope.status === "ACTIVE",
    "SCOPE_NOT_ACTIVE",
    `The scope is ${plan.scope.status}.`
  );
  ensure(
    git.transactions.journal(root) === null,
    "TRANSACTION_PENDING",
    "A commit transaction is unfinished.",
    {},
    "Run `scripts/workflow repair`."
  );
  const dirty = git.changes(root).all;
  ensure(
    dirty.length === 0 && git.mergeHead(root) === null,
    "INTEGRATION_DIRTY",
    "Integrate into a clean main: commit or remove the changes first (untracked files too).",
    { paths: dirty }
  );
}
function startIntegration(git, root, request) {
  const active = readJournal2(root);
  if (active) {
    ensure(
      active.assignmentId === request.assignmentId && resolveCommit2(git, root, request.source) === active.source,
      "INTEGRATION_ACTIVE",
      `The integration of ${active.assignmentId} is unfinished.`,
      { assignmentId: active.assignmentId, phase: active.phase },
      continueHint(active.assignmentId)
    );
    return resume(git, root, active, request.now);
  }
  const plan = workflowPlanFacade.read(root);
  ensureCanIntegrate(git, root, plan);
  const record = workflowAssignmentFacade.read(root, request.assignmentId);
  ensure(
    record,
    "ASSIGNMENT_UNKNOWN",
    `The main checkout has no assignment ${request.assignmentId}.`
  );
  const proof = proveSource(git, root, record, request.source);
  const journal = {
    assignmentId: record.id,
    error: null,
    mainHead: git.head(root) ?? "",
    operationId: randomUUID2(),
    phase: "PREPARED",
    source: proof.sourceCommit,
    startedAt: request.now(),
    taskId: record.taskId
  };
  candidatePlan(git, root, plan, journal);
  saveJournal2(root, journal);
  return resume(git, root, journal, request.now);
}
function continueIntegration(git, root, request) {
  const journal = readJournal2(root);
  ensure(
    journal,
    "NO_INTEGRATION",
    "No integration is unfinished.",
    {},
    "Start one with scripts/workflow integration:start --id <assignment> --source <sha>."
  );
  ensure(
    journal.assignmentId === request.assignmentId,
    "INTEGRATION_ACTIVE",
    `The unfinished integration belongs to ${journal.assignmentId}.`,
    { assignmentId: journal.assignmentId, phase: journal.phase },
    continueHint(journal.assignmentId)
  );
  return resume(git, root, journal, request.now);
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/src/workflow-integration-facade.ts
var WorkflowIntegrationFacade = class {
  git;
  constructor(git = workflowGitFacade) {
    this.git = git;
  }
  /** Proves an executor source of an assignment or throws the first failure. */
  proveSource(mainRoot, assignment, sourceSha) {
    return proveSource(this.git, mainRoot, assignment, sourceSha);
  }
  /** `integration:start`: proves, merges and commits the source (or continues the same one). */
  start(mainRoot, request) {
    return startIntegration(this.git, mainRoot, request);
  }
  /** `integration:continue`: finishes the unfinished integration of the assignment. */
  continue(mainRoot, request) {
    return continueIntegration(this.git, mainRoot, request);
  }
  /** `integration:status`: IDLE or the journal phase, conflicts and MERGE_HEAD. */
  status(mainRoot) {
    return integrationState(this.git, mainRoot);
  }
  /** True while an integration journal exists: other Kit writes are refused. */
  isActive(root) {
    return existsSync11(journalFile(root));
  }
};
var workflowIntegrationFacade = new WorkflowIntegrationFacade();

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-context.ts
function readPlan(context) {
  const plan = workflowPlanFacade.read(context.root);
  ensure(
    plan,
    "NOT_INSTALLED",
    `${PLAN_PATH} does not exist; install the Workflow Kit first.`,
    {},
    "Run `scripts/workflow install` or open the project in Harness AI."
  );
  return plan;
}
function readConfig(context) {
  return workflowQualityFacade.readConfig(context.root);
}
function requireHead(context) {
  const head3 = context.git.head(context.root);
  ensure(head3, "NO_COMMITS", "The repository has no commits yet.");
  return head3;
}
function ensureNoIntegration(context) {
  ensure(
    !workflowIntegrationFacade.isActive(context.root),
    "INTEGRATION_ACTIVE",
    "An integration is unfinished; other Kit writes wait until it completes.",
    {},
    "Run `scripts/workflow integration:status`, then `scripts/workflow integration:continue --id <assignment>`."
  );
}
function ensureNoTransaction(context) {
  ensure(
    context.git.transactions.journal(context.root) === null,
    "TRANSACTION_PENDING",
    "A commit transaction is unfinished.",
    {},
    "Run `scripts/workflow repair`."
  );
  ensureNoIntegration(context);
}
function ensureRevision(plan, expected) {
  ensure(
    expected === void 0 || plan.revision === expected,
    "REVISION_MISMATCH",
    `The plan is at revision ${plan.revision}, not ${String(expected)}; read the status again.`,
    { revision: plan.revision }
  );
}
function locked(context, fn) {
  return workflowPlatformFacade.withLock(
    context.git.localPath(context.root, "kit.lock"),
    fn
  );
}
function commitPlan(context, plan, request) {
  ensureNoTransaction(context);
  return context.git.transactions.commit(context.root, {
    ...request,
    planPath: PLAN_PATH,
    planText: workflowPlanFacade.render(plan)
  });
}
function savePlan(context, plan) {
  workflowPlanFacade.write(context.root, plan);
}
function changedDocuments(context, paths) {
  const changed = new Set(context.git.changes(context.root).all);
  return [
    ...new Set(paths.filter((item) => Boolean(item)))
  ].filter((item) => changed.has(item));
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-context-budget.ts
function briefRefs(plan, task2) {
  if (task2.context.length === 0) {
    const spec = plan.scope?.spec;
    return spec ? [{ path: spec, required: true }] : [];
  }
  const whole = new Set(
    task2.context.filter((ref) => !ref.heading).map((ref) => ref.path)
  );
  const seen = /* @__PURE__ */ new Set();
  return task2.context.filter((ref) => {
    const key = `${ref.path}
${ref.heading ?? ""}`;
    if (seen.has(key) || ref.heading && whole.has(ref.path)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
function briefDocuments(root, plan, task2) {
  return briefRefs(plan, task2).map((ref) => {
    const text3 = workflowPlatformFacade.readTextIfExists(
      workflowPlatformFacade.resolveInside(root, ref.path)
    );
    const section2 = text3 !== null && ref.heading ? workflowRecoveryFacade.section(text3, ref.heading) : text3;
    ensure(
      section2 !== null,
      "CONTEXT_MISSING",
      text3 === null ? `The context document ${ref.path} of ${task2.id} does not exist.` : `The context document ${ref.path} of ${task2.id} has no heading "${ref.heading}".`,
      {
        path: ref.path,
        taskId: task2.id,
        ...ref.heading ? { heading: ref.heading } : {}
      },
      "Fix the task context: an existing file and, for a section, an existing heading."
    );
    const body = section2.trimEnd();
    return {
      bytes: Buffer.byteLength(body, "utf8"),
      path: ref.path,
      text: body,
      ...ref.heading ? { heading: ref.heading } : {}
    };
  });
}
function checkedBriefDocuments(context, plan, task2, budget = readConfig(context).budget.briefBytes) {
  const documents2 = briefDocuments(context.root, plan, task2);
  const bytes = documents2.reduce((sum, item) => sum + item.bytes, 0);
  ensure(
    bytes <= budget,
    "CONTEXT_TOO_LARGE",
    `The context documents of ${task2.id} take ${bytes} bytes; the brief budget is ${budget}.`,
    { budget, bytes, taskId: task2.id },
    "Narrow the task context to sections (heading)."
  );
  return documents2;
}
function ensureContextBudget(context, plan, tasks) {
  const budget = readConfig(context).budget.briefBytes;
  for (const task2 of tasks) {
    checkedBriefDocuments(context, plan, task2, budget);
  }
}
function changedContextTasks(previous, next) {
  const before = new Map(previous.tasks.map((task2) => [task2.id, task2]));
  return next.tasks.filter((task2) => {
    const old = before.get(task2.id);
    return !old || JSON.stringify(old.context) !== JSON.stringify(task2.context);
  });
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-pause.ts
var PAUSE_FILE = "pause.json";
var PAUSE_PATH = `.harness/workflow/local/${PAUSE_FILE}`;
var REWRITE = `Rewrite it on the user's request: scripts/workflow pause:set --on|--off --note "<the user's words>".`;
function pauseFile(context) {
  return context.git.localPath(context.root, PAUSE_FILE);
}
function readPause(context) {
  let text3 = null;
  let parsed = null;
  let readable = true;
  try {
    text3 = workflowPlatformFacade.readTextIfExists(pauseFile(context));
    parsed = text3 === null ? null : JSON.parse(text3);
  } catch {
    readable = false;
  }
  if (readable && text3 === null) {
    return { at: null, note: null, paused: false };
  }
  const record = parsed ?? {};
  ensure(
    readable && typeof parsed === "object" && typeof record.paused === "boolean" && typeof record.note === "string" && typeof record.at === "string",
    "PAUSE_STATE",
    `${PAUSE_PATH} is unreadable; the pause state is unknown.`,
    { path: PAUSE_PATH },
    REWRITE
  );
  return {
    at: record.at,
    note: record.note,
    paused: record.paused
  };
}
function setPause(context, paused, note) {
  const words = note.trim();
  ensure(words !== "", "USAGE", "--note is required.");
  return locked(context, () => {
    readPlan(context);
    const state = { at: context.now(), note: words, paused };
    workflowPlatformFacade.writeFileAtomic(
      pauseFile(context),
      `${JSON.stringify(state, null, 2)}
`
    );
    return state;
  });
}
function ensureNotPaused(context) {
  if (workflowAssignmentFacade.worktreeRecord(context.root) !== null) {
    return;
  }
  const pause = readPause(context);
  ensure(
    !pause.paused,
    "WORKFLOW_PAUSED",
    `The workflow is paused by the user (${pause.at}): ${pause.note}`,
    { at: pause.at, note: pause.note },
    'Wait until the user presses Continue in Harness, or run `scripts/workflow pause:set --off --note "<the user\'s words>"` when the user asks to continue.'
  );
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-assignment.ts
var INTEGRATION_FILE = "integration.json";
function activeRecords(plan, root) {
  const scopeId = plan.scope?.id;
  return workflowAssignmentFacade.list(root).filter(
    (record) => record.scopeId === scopeId && workflowAssignmentFacade.isActive(record)
  );
}
function readyTask(task2) {
  return {
    id: task2.id,
    kind: task2.kind,
    parallelSafe: task2.parallelSafe === true,
    title: task2.title
  };
}
function nextAssignments(context) {
  const plan = readPlan(context);
  const active = activeRecords(plan, context.root);
  const schedule = workflowAssignmentFacade.schedule(plan, active);
  return {
    active,
    blocked: schedule.blocked,
    idle: schedule.idle,
    maxWorkers: schedule.maxWorkers,
    orchestrated: schedule.orchestrated,
    ready: schedule.ready.map(
      (id) => readyTask(workflowPlanFacade.task(plan, id))
    ),
    scopeId: plan.scope?.id ?? null
  };
}
function ensureCanAssign(context, plan) {
  ensure(
    plan.scope !== null && workflowPlanFacade.execution(plan).strategy === "orchestrated",
    "NOT_ORCHESTRATED",
    "Assignments exist only in an orchestrated scope.",
    {},
    "In a sequential scope run the tasks yourself: scripts/workflow task:start <ID>."
  );
  ensure(
    plan.scope.status === "ACTIVE",
    "SCOPE_NOT_ACTIVE",
    `The scope is ${plan.scope.status}.`
  );
  ensureNoTransaction(context);
  const dirty = context.git.changes(context.root).all.filter((file4) => !context.git.isKitManagedPath(file4));
  ensure(
    dirty.length === 0,
    "DIRTY_TREE",
    "Create assignments on a clean main working tree.",
    { paths: dirty },
    "Commit or remove the changes first."
  );
}
function ensureDependenciesInBase(context, plan, task2, base) {
  if (task2.dependencies.length === 0) {
    return;
  }
  const references = context.git.resolveReferences(
    context.root,
    plan,
    PLAN_PATH
  );
  const missing2 = task2.dependencies.filter((id) => {
    const reference = references.get(id);
    return !(reference?.status === "committed" && context.git.isAncestor(context.root, reference.sha, base));
  });
  ensure(
    missing2.length === 0,
    "DEPENDENCY_NOT_IN_BASE",
    `The commits of ${missing2.join(", ")} are not ancestors of the base ${base}.`,
    { dependencies: missing2 }
  );
}
function scheduled(schedule, task2) {
  const reason = schedule.blocked.find((item) => item.taskId === task2.id);
  ensure(
    !reason,
    reason?.code ?? "ASSIGNMENT_BARRIER",
    reason?.message ?? "",
    { blockedBy: reason?.blockedBy ?? [] },
    "Run `scripts/workflow assignment:next` for the tasks that can be assigned now."
  );
  ensure(
    schedule.ready.includes(task2.id),
    "ASSIGNMENT_BARRIER",
    `${task2.id} cannot be assigned now.`
  );
}
function briefWithMap(context, plan, brief2) {
  const map = new WorkflowRecoveryFacade(context.git).documentsMap(
    context.root,
    { specPath: plan.scope?.spec ?? null }
  );
  if (map.text === "") {
    return brief2;
  }
  return [
    brief2.trimEnd(),
    "",
    "Project documents (ask with scripts/workflow context <path>):",
    map.text,
    ""
  ].join("\n");
}
function createAssignment(context, taskId) {
  return locked(context, () => {
    const plan = readPlan(context);
    ensureCanAssign(context, plan);
    ensureNotPaused(context);
    const base = requireHead(context);
    const task2 = workflowPlanFacade.task(plan, taskId);
    ensure(
      task2.kind === "work" || task2.kind === "docs",
      "ASSIGNMENT_KIND",
      `${task2.id} is a ${task2.kind} task; the orchestrator runs it in main.`,
      {},
      `Run it yourself: scripts/workflow task:start ${task2.id}.`
    );
    ensure(
      task2.status === "TODO",
      "TASK_NOT_TODO",
      `${task2.id} is ${task2.status}.`
    );
    const documents2 = checkedBriefDocuments(context, plan, task2);
    const scopeId = plan.scope?.id ?? "NONE";
    const digest = workflowAssignmentFacade.configDigest(context.root);
    const active = activeRecords(plan, context.root);
    const existing = active.find((record2) => record2.taskId === task2.id);
    if (existing) {
      ensure(
        existing.status === "ASSIGNED" && existing.iteration === task2.iteration && existing.baseCommit === base && existing.configDigest === digest,
        "ASSIGNMENT_EXISTS",
        `${task2.id} already has the active assignment ${existing.id} (${existing.status}).`,
        { id: existing.id, status: existing.status }
      );
      return {
        assignment: existing,
        brief: briefWithMap(
          context,
          plan,
          workflowAssignmentFacade.brief(plan, task2, existing, documents2)
        ),
        created: false
      };
    }
    scheduled(workflowAssignmentFacade.schedule(plan, active), task2);
    ensureDependenciesInBase(context, plan, task2, base);
    const record = workflowAssignmentFacade.create({
      baseCommit: base,
      configDigest: digest,
      iteration: task2.iteration,
      now: context.now(),
      scopeId,
      taskId: task2.id
    });
    ensure(
      workflowAssignmentFacade.read(context.root, record.id) === null,
      "ASSIGNMENT_EXISTS",
      `The assignment record ${record.id} already exists.`,
      { id: record.id }
    );
    workflowAssignmentFacade.write(context.root, record);
    return {
      assignment: record,
      brief: briefWithMap(
        context,
        plan,
        workflowAssignmentFacade.brief(plan, task2, record, documents2)
      ),
      created: true
    };
  });
}
function cleanupAssignments(context, id) {
  return locked(context, () => {
    let records;
    if (id === void 0) {
      records = workflowAssignmentFacade.list(context.root).filter(
        (record) => record.status === "INTEGRATED" && record.cleanup?.status !== "DONE"
      );
    } else {
      const record = workflowAssignmentFacade.read(context.root, id);
      ensure(
        record,
        "ASSIGNMENT_UNKNOWN",
        `The main checkout has no assignment ${id}.`
      );
      records = [record];
    }
    return {
      assignments: records.map(
        (record) => workflowAssignmentFacade.cleanup(
          context.git,
          context.root,
          record,
          context.now()
        )
      )
    };
  });
}
function cancelAssignment2(context, id, force) {
  return locked(context, () => {
    ensureNoTransaction(context);
    const record = workflowAssignmentFacade.read(context.root, id);
    ensure(
      record,
      "ASSIGNMENT_UNKNOWN",
      `The main checkout has no assignment ${id}.`,
      {},
      "Run `scripts/workflow assignment:next` for the active assignments."
    );
    const result2 = workflowAssignmentFacade.cancel(
      context.git,
      context.root,
      record,
      { force }
    );
    const task2 = readPlan(context).tasks.find(
      (item) => item.id === record.taskId
    );
    return {
      ...result2,
      task: task2 ? { id: task2.id, status: task2.status } : null
    };
  });
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-executor.ts
function executorAssignment(context) {
  return workflowAssignmentFacade.worktreeRecord(context.root);
}
function isPlanCommit(context, head3, record) {
  const history = context.git.history(context.root, record.baseCommit, head3);
  const [commit2] = history;
  return history.length === 1 && commit2?.parents[0] === record.baseCommit && commit2.trailers["Workflow-Role"]?.[0] === "assignment-plan" && commit2.trailers["Workflow-Assignment"]?.[0] === record.id;
}
function commitExecutorPlan(context, record) {
  const text3 = context.git.show(context.root, record.baseCommit, PLAN_PATH);
  ensure(
    text3,
    "ASSIGNMENT_BASE",
    `The base commit ${record.baseCommit} has no plan.`
  );
  const plan = workflowAssignmentFacade.executorPlan(
    workflowPlanFacade.parse(text3),
    record,
    context.now()
  );
  return commitPlan(context, plan, {
    assignmentId: record.id,
    files: [],
    iteration: record.iteration,
    message: `docs: plan assignment ${record.id}`,
    role: "assignment-plan",
    scopeId: plan.scope?.id ?? null,
    taskId: record.taskId
  }).sha;
}
function attachAssignment(context, id) {
  return locked(context, () => {
    const location = workflowAssignmentFacade.locateWorktree(
      context.git,
      context.root
    );
    const record = workflowAssignmentFacade.read(location.mainRoot, id);
    ensure(
      record,
      "ASSIGNMENT_UNKNOWN",
      `The main checkout ${location.mainRoot} has no assignment ${id}.`,
      { mainRoot: location.mainRoot },
      "Run the exact attach command of your brief."
    );
    const own = executorAssignment(context);
    ensure(
      own === null || own.id === id,
      "ASSIGNMENT_ATTACHED",
      `This worktree is already attached to ${own?.id}.`,
      { id: own?.id }
    );
    const here = record.worktree !== null && workflowPlatformFacade.samePath(record.worktree, location.worktree);
    ensure(
      record.worktree === null || here,
      "ASSIGNMENT_ATTACHED",
      `${id} is attached to another worktree: ${record.worktree}.`,
      { worktree: record.worktree }
    );
    if (own && here) {
      return {
        assignment: record,
        attached: false,
        planCommit: null,
        worktree: own
      };
    }
    ensure(
      record.status === "ASSIGNED" || here,
      "ASSIGNMENT_STATUS",
      `${id} is ${record.status}; only an ASSIGNED assignment is attached.`,
      { status: record.status }
    );
    ensureNoTransaction(context);
    const dirty = context.git.changes(context.root).all;
    ensure(
      dirty.length === 0,
      "ASSIGNMENT_DIRTY",
      "The executor worktree must be clean before attaching.",
      { paths: dirty },
      "Remove the changes, then repeat the attach command."
    );
    const head3 = requireHead(context);
    let planCommit = head3;
    if (head3 === record.baseCommit) {
      planCommit = commitExecutorPlan(context, record);
    } else {
      ensure(
        isPlanCommit(context, head3, record),
        "ASSIGNMENT_BASE",
        `HEAD ${head3} is not the base ${record.baseCommit} of ${id}.`,
        { base: record.baseCommit, head: head3 },
        "The worktree must start at the main HEAD the assignment was created on."
      );
    }
    const task2 = workflowPlanFacade.task(readPlan(context), record.taskId);
    const updated = {
      ...record,
      branch: location.branch,
      status: workflowAssignmentFacade.needsSetup(context.root, task2) ? "NEEDS_SETUP" : "READY",
      updatedAt: context.now(),
      worktree: location.worktree
    };
    workflowAssignmentFacade.write(location.mainRoot, updated);
    return {
      assignment: updated,
      attached: true,
      planCommit,
      worktree: workflowAssignmentFacade.writeWorktreeRecord(
        context.root,
        updated,
        location.mainRoot
      )
    };
  });
}
function assignmentStatus(context) {
  const own = executorAssignment(context);
  ensure(
    own,
    "ASSIGNMENT_NOT_ATTACHED",
    "This checkout is not an attached executor worktree.",
    {},
    "In main run `scripts/workflow assignment:next`; an executor runs `scripts/workflow assignment:attach <id>` first."
  );
  const plan = readPlan(context);
  const task2 = plan.tasks.find((item) => item.id === own.taskId);
  return {
    assignment: workflowAssignmentFacade.read(own.mainRoot, own.id),
    head: context.git.head(context.root),
    scopeId: plan.scope?.id ?? null,
    task: task2 ? {
      files: task2.files,
      id: task2.id,
      kind: task2.kind,
      status: task2.status,
      title: task2.title
    } : null,
    worktree: own
  };
}
function setupAssignment2(context, id) {
  const own = executorAssignment(context);
  ensure(
    own === null || id === void 0 || id === own.id,
    "ASSIGNMENT_READ_ONLY",
    `This worktree sets up only its own assignment ${own?.id}.`,
    { id: own?.id }
  );
  const target = own?.id ?? id;
  ensure(
    target,
    "USAGE",
    "--id is required outside an executor worktree.",
    {},
    "Run scripts/workflow assignment:setup --id <id> in main, or without --id in the executor worktree."
  );
  const mainRoot = own?.mainRoot ?? context.root;
  const record = workflowAssignmentFacade.read(mainRoot, target);
  ensure(
    record,
    "ASSIGNMENT_UNKNOWN",
    `The main checkout ${mainRoot} has no assignment ${target}.`,
    { mainRoot }
  );
  return workflowAssignmentFacade.setup(mainRoot, record, {
    env: context.env,
    now: context.now
  });
}
function ensureAssignmentReady(context) {
  const own = executorAssignment(context);
  const record = own && workflowAssignmentFacade.read(own.mainRoot, own.id);
  ensure(
    record?.status !== "NEEDS_SETUP",
    "ASSIGNMENT_NEEDS_SETUP",
    `The worktree of ${own?.id} lacks the dependencies its checks need.`,
    { id: own?.id },
    "Run scripts/workflow assignment:setup, then repeat task:start."
  );
}
function markAssignment(context, status, sourceCommit) {
  const own = executorAssignment(context);
  const record = own && workflowAssignmentFacade.read(own.mainRoot, own.id);
  if (!(own && record)) {
    return;
  }
  workflowAssignmentFacade.write(own.mainRoot, {
    ...record,
    sourceCommit: sourceCommit ?? record.sourceCommit,
    status,
    updatedAt: context.now()
  });
}
function guardExecutorCommit(context, paths, candidatePlan2) {
  if (!executorAssignment(context)) {
    return;
  }
  workflowAssignmentFacade.checkExecutorChange({
    candidatePlan: candidatePlan2,
    headPlan: context.git.show(context.root, "HEAD", PLAN_PATH),
    paths,
    planPath: PLAN_PATH
  });
}
function guardExecutorCandidate(context, journal) {
  if (!executorAssignment(context)) {
    return;
  }
  const paths = context.git.git.run(context.root, [
    "diff",
    "--cached",
    "--name-only",
    "--no-renames",
    "-z",
    "HEAD"
  ]).stdout.split("\0").filter(Boolean);
  guardExecutorCommit(context, paths, journal.candidatePlan);
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-doctor.ts
import path22 from "node:path";

// product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-doctor-checks.ts
import { accessSync as accessSync2, constants as constants2, existsSync as existsSync13 } from "node:fs";
import path20 from "node:path";

// product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-inspect.ts
import { existsSync as existsSync12, readdirSync as readdirSync3, realpathSync as realpathSync3, statSync as statSync6 } from "node:fs";
import path19 from "node:path";

// product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts
import { createHash as createHash6 } from "node:crypto";

// product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-provider-hooks.ts
var KIT_LAUNCHER_MARK = "scripts/workflow";
var KIT_HOOK_MARK = "hook session-start";
var CLAUDE_PARTS = 6;
var CODEX_CONTEXT_LIMIT = 65536;
function kitGroups(client) {
  if (client === "codex") {
    return [
      {
        hooks: [
          {
            additionalContextLimit: CODEX_CONTEXT_LIMIT,
            command: "scripts/workflow hook session-start --client codex",
            type: "command"
          }
        ]
      }
    ];
  }
  return Array.from({ length: CLAUDE_PARTS }, (_, i) => ({
    hooks: [
      {
        command: `"$CLAUDE_PROJECT_DIR/scripts/workflow" hook session-start --client claude --part ${i + 1}/${CLAUDE_PARTS}`,
        type: "command"
      }
    ]
  }));
}
function isKitGroup(group) {
  const hooks = group?.hooks;
  return Array.isArray(hooks) && hooks.some(
    (hook) => typeof hook?.command === "string" && hook.command.includes(KIT_LAUNCHER_MARK) && hook.command.includes(KIT_HOOK_MARK)
  );
}
function parseObject(current, file4) {
  if (current === null || current.trim() === "") {
    return {};
  }
  let parsed;
  try {
    parsed = JSON.parse(current);
  } catch {
    parsed = null;
  }
  ensure(
    parsed && typeof parsed === "object" && !Array.isArray(parsed),
    "MANAGED_JSON",
    `${file4} is not a JSON object; fix it by hand first.`,
    { path: file4 }
  );
  return parsed;
}
function mergeSessionStartHook(current, client, file4) {
  const settings = parseObject(current, file4);
  const hooks = settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {};
  const existing = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];
  const merged = {
    ...settings,
    hooks: {
      ...hooks,
      SessionStart: [
        ...existing.filter((group) => !isKitGroup(group)),
        ...kitGroups(client)
      ]
    }
  };
  return `${JSON.stringify(merged, null, 2)}
`;
}
function extractSessionStartHook(current) {
  try {
    const settings = JSON.parse(current ?? "");
    const groups = (settings.hooks?.SessionStart ?? []).filter(isKitGroup);
    return groups.length > 0 ? JSON.stringify(groups) : null;
  } catch {
    return null;
  }
}
function expectedSessionStartHook(client) {
  return JSON.stringify(kitGroups(client));
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-sections.ts
var MARKERS2 = {
  hash: { begin: "# workflow-kit:begin", end: "# workflow-kit:end" },
  html: {
    begin: "<!-- workflow-kit:begin -->",
    end: "<!-- workflow-kit:end -->"
  }
};
var SHEBANG = /^#![^\n]*\n/u;
var CRLF = /\r\n/gu;
var LF = /\n/gu;
function eolOf(text3) {
  return text3.includes("\r\n") ? "\r\n" : "\n";
}
function sectionBlock(style, body) {
  const { begin, end } = MARKERS2[style];
  return `${begin}
${body.trimEnd()}
${end}
`;
}
function bounds(text3, style) {
  const { begin, end } = MARKERS2[style];
  const start = text3.indexOf(begin);
  const stop = start === -1 ? -1 : text3.indexOf(end, start);
  if (start === -1 || stop === -1) {
    return null;
  }
  let after = stop + end.length;
  if (text3.startsWith("\r\n", after)) {
    after += 2;
  } else if (text3.startsWith("\n", after)) {
    after += 1;
  }
  return { end: after, start };
}
function extractSection(text3, style) {
  const found = bounds(text3, style);
  return found ? text3.slice(found.start, found.end).replace(CRLF, "\n") : null;
}
function upsertSection(current, style, body, placement = "bottom") {
  const text3 = current ?? "";
  const eol = eolOf(text3);
  const block2 = sectionBlock(style, body).replace(LF, eol);
  const found = bounds(text3, style);
  if (found) {
    return `${text3.slice(0, found.start)}${block2}${text3.slice(found.end)}`;
  }
  if (placement === "top") {
    const shebang = SHEBANG.exec(text3)?.[0] ?? "";
    return `${shebang}${block2}${text3.slice(shebang.length)}`;
  }
  if (text3 === "") {
    return block2;
  }
  const separator = text3.endsWith("\n") ? eol : `${eol}${eol}`;
  return `${text3}${separator}${block2}`;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-texts.ts
function agentRules() {
  return `## Workflow Kit (managed section \u2014 do not edit by hand)

This project uses the Harness Workflow Kit. The plan lives in
\`.harness/plans/todo-plan.md\` and changes only through \`scripts/workflow\`
commands (Windows: \`scripts\\workflow.cmd\`). Every command prints JSON;
add \`--format text\` for a readable answer.

### Start of every session
1. The recovery packet arrives at session start (Claude: in parts K/N).
   Unless the whole packet is in your context \u2014 every part with one digest,
   no \`<persisted-output>\`, no truncation marker \u2014 run
   \`scripts/workflow recover --format text\`.
2. Follow the \`next\` line of the packet.

### Inputs and documents
- Before writing a \`--input\` JSON, run \`scripts/workflow schema <command>\`
  for its fields, limits and an example.
- Get documents with \`scripts/workflow context <path>[#Heading]\` (one call,
  marked text) instead of reading large files piecewise;
  \`context --list\` prints the documents map.
- Never read Kit runtime files (\`.harness/workflow/runtime/**\`, the bundle),
  generated code, logs or transcripts: the Kit gives what is needed from them.

### When a plan is needed
- Discussion, research, specifications and documentation-only commits need
  no plan. Commit documents with \`scripts/workflow docs:commit --files <paths>\`.
- Changing functional files is allowed only inside a started task of the
  active scope.
- A clear user instruction to implement allows you to write the
  specification and create the scope with
  \`scripts/workflow scope:create --input <file.json>\` without asking again.
  Record the agreement in \`approval\`. The plan never replaces the user's
  current instruction. In a Harness project (\`"host": "harness"\`) propose
  the scope instead (see Execution modes).

### Execution modes
The recovery packet names your \`role:\`; follow it.
- **planning** (no scope, Harness project): write the specification and a
  plan with \`parallelSafe\` labels, then run
  \`scripts/workflow scope:propose --input <file.json> --recommended <mode> --reason "<why>"\`
  and end the turn; the user chooses the mode on the card.
- **self** (\`sequential\`): run the tasks in order in main. Helper subagents
  may help, but they work in main without their own worktree and never commit.
- **orchestrator** (\`orchestrated\`, main): \`assignment:next\`,
  \`assignment:create --task <ID>\`, a Claude subagent (Agent tool with
  \`isolation: "worktree"\`) gets the returned brief; integrate its SHA with
  \`integration:start --id <id> --source <sha>\` (on CONFLICT or CHECKS_FAILED
  fix within the task files, then \`integration:continue --id <id>\`). Run
  QUALITY and delivery yourself; never implement work or DOCS tasks in main.
- **executor** (assignment worktree): \`assignment:attach <id>\`, then
  \`task:start\`, work only within the task files, \`commit --task\`, reply
  with the SHA. Never touch main, the plan or other tasks; no nested
  executors, no push.
- Never set the git identity (\`git config user.*\`). If a command refuses
  with \`GIT_IDENTITY_REQUIRED\`, report it to the user with the command it
  prints.

### One task, one commit, one turn
1. \`scripts/workflow task:start <ID>\`; a delivery task needs
   \`--confirmed "<the user's confirmation>"\`.
2. Implement the task within its files and acceptance criteria.
3. \`scripts/workflow commit --task <ID>\`. The DOCS task of a round
   reconciles shared documents and needs \`--digest <file.json>\`
   (\`result\`, \`decisions\`, \`contracts\`, \`references\`).
4. If a check fails, fix the cause and repeat the same command; your edits
   are kept.
5. Report the result briefly and end the turn. The user or the Harness
   autopilot starts the next task.
- If the task cannot be finished in this turn, stop at a safe point, name
  the state and end the turn without committing it.
- A new user message does not cancel the accepted instruction; take it into
  account within the current task.

### Rules
- Never commit with \`git commit\` directly and never use \`--no-verify\`.
- Never edit the plan, \`.harness/workflow/**\` or the launchers by hand.
- A finished task never changes. Defects found later become a fixes round:
  \`scripts/workflow plan:extend --input <file.json> --expected-revision <N>\`.
- Before the first functional code, the QUALITY task chooses checks with
  \`quality:detect\` and applies them with \`quality:apply --input <file.json>\`.
  Installing tools needs the user's approval in \`approval\`.
- Update the contract document of a module in the same commit as its code
  (\`docs.contracts\` in \`.harness/workflow/config.json\`).
- Acceptance (\`accept --note "<the user's words>"\`) records the user's
  decision. Closing the scope (\`close\`) needs a separate direct user command.
- Build, packaging, publishing and push happen only in delivery tasks.
- If the scope is BLOCKED, only discuss and diagnose; run \`task:unblock\`
  after the user resolves the reason.
- If a command reports an unfinished transaction, run
  \`scripts/workflow repair\` and follow it.
- Use \`scripts/workflow show-task <ID>\` and \`scripts/workflow history\` for
  details the recovery packet left out.`;
}
var CLAUDE_IMPORT_LINE = "@AGENTS.md";
function gitignoreSection() {
  return [
    "# Workflow Kit local state",
    ".harness/workflow/local/",
    ".harness/runtime/",
    ".harness/sessions/",
    ".claude/worktrees/",
    ".DS_Store",
    "# Dependency folders: installed by quality:apply, never committed",
    "node_modules/",
    ".venv/",
    "__pycache__/"
  ].join("\n");
}
function gitattributesSection() {
  return [
    "scripts/workflow text eol=lf",
    "scripts/workflow.cmd text eol=crlf",
    "scripts/workflow.ps1 text eol=crlf",
    ".harness/** text eol=lf"
  ].join("\n");
}
function gitHookSection(name) {
  return `"$(git rev-parse --show-toplevel)/scripts/workflow" git-hook ${name} "$@" || exit $?`;
}
function readmeSkeleton(projectName) {
  return `# ${projectName}

Project context for people and agents. Describe what the project does, how
to run it and where its architecture is documented
([docs/architecture/OVERVIEW.md](docs/architecture/OVERVIEW.md)).

Development follows the Workflow Kit rules in [AGENTS.md](AGENTS.md).
`;
}
function overviewSkeleton(projectName) {
  return `# ${projectName} \u2014 Architecture Overview

Describe the main parts of the system, their responsibilities and the
contracts between them. The DOCS task of every round keeps this document
in line with the code.
`;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts
var KIT_VERSION = "2.2.4";
var MANIFEST_PATH = ".harness/workflow/manifest.json";
var MANIFEST_SCHEMA = "harness-workflow-manifest/1";
var OWN_HOOKS_DIR = ".harness/workflow/hooks";
var MANAGED_GIT_HOOKS = [
  "pre-commit",
  "commit-msg",
  "post-commit",
  "pre-push"
];
var LINE_BREAK = /\r?\n/u;
function sha2562(text3) {
  return createHash6("sha256").update(text3, "utf8").digest("hex");
}
function hasClaudeLine(text3) {
  return text3.split(LINE_BREAK).some((line) => line.trim() === CLAUDE_IMPORT_LINE);
}
function readManaged(kind, path26, current) {
  if (current === null) {
    return null;
  }
  switch (kind) {
    case "owned":
      return current;
    case "section":
      return extractSection(current, path26.endsWith(".md") ? "html" : "hash");
    case "json":
      return extractSessionStartHook(current);
    case "line":
      return hasClaudeLine(current) ? CLAUDE_IMPORT_LINE : null;
    default:
      return null;
  }
}
function owned(path26, content, executable = false) {
  return {
    executable,
    kind: "owned",
    managed: content,
    path: path26,
    read: (current) => current,
    render: () => content
  };
}
function section(path26, style, body, placement = "bottom", prefix = "") {
  return {
    executable: false,
    kind: "section",
    managed: sectionBlock(style, body),
    path: path26,
    read: (current) => current === null ? null : extractSection(current, style),
    render: (current) => upsertSection(current ?? (prefix || null), style, body, placement)
  };
}
function created(path26, content) {
  return {
    executable: false,
    kind: "create",
    managed: null,
    path: path26,
    read: () => null,
    render: (current) => current ?? content
  };
}
function claudeLine() {
  return {
    executable: false,
    kind: "line",
    managed: CLAUDE_IMPORT_LINE,
    path: "CLAUDE.md",
    read: (current) => readManaged("line", "CLAUDE.md", current),
    render: (current) => {
      if (current === null || current.trim() === "") {
        return `${CLAUDE_IMPORT_LINE}
`;
      }
      if (hasClaudeLine(current)) {
        return current;
      }
      return `${current}${current.endsWith("\n") ? "" : "\n"}
${CLAUDE_IMPORT_LINE}
`;
    }
  };
}
function providerHook(path26, client) {
  return {
    executable: false,
    kind: "json",
    managed: expectedSessionStartHook(client),
    path: path26,
    read: (current) => readManaged("json", path26, current),
    render: (current) => mergeSessionStartHook(current, client, path26)
  };
}
function hookEntries(hooksPath) {
  return MANAGED_GIT_HOOKS.map((name) => {
    if (hooksPath === null) {
      const content = `#!/bin/sh
# Managed by Harness Workflow Kit. Do not edit.
${sectionBlock("hash", gitHookSection(name))}`;
      return owned(`${OWN_HOOKS_DIR}/${name}`, content, true);
    }
    return {
      ...section(
        `${hooksPath}/${name}`,
        "hash",
        gitHookSection(name),
        "top",
        "#!/bin/sh\n"
      ),
      executable: true
    };
  });
}
function buildPayload(options) {
  const launchers = workflowPlatformFacade.launchers();
  return [
    owned(KIT_BUNDLE_PATH, options.bundle),
    owned("scripts/workflow", launchers.posix, true),
    owned("scripts/workflow.cmd", launchers.cmd),
    owned("scripts/workflow.ps1", launchers.powershell),
    ...hookEntries(options.hooksPath),
    section("AGENTS.md", "html", agentRules()),
    claudeLine(),
    providerHook(".codex/hooks.json", "codex"),
    providerHook(".claude/settings.json", "claude"),
    section(".gitignore", "hash", gitignoreSection()),
    section(".gitattributes", "hash", gitattributesSection()),
    created("README.md", readmeSkeleton(options.projectName)),
    created(
      "docs/architecture/OVERVIEW.md",
      overviewSkeleton(options.projectName)
    )
  ];
}
function buildManifest(entries2) {
  return {
    files: entries2.map((entry) => ({
      executable: entry.executable,
      kind: entry.kind,
      path: entry.path,
      sha256: entry.managed === null ? null : sha2562(entry.managed)
    })),
    schema: MANIFEST_SCHEMA,
    version: KIT_VERSION
  };
}
function renderManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}
`;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-inspect.ts
var PILOT_MANIFEST = ".harness/kit-manifest.json";
var LEGACY_PLAN_SCHEMA = "harness-ai-plan-v1";
var ACTIONS = {
  EMPTY: "install",
  GIT_NO_KIT: "install",
  KIT_DAMAGED: "doctor",
  KIT_OK: "open",
  KIT_OUTDATED: "update",
  LEGACY_HARNESS_PLAN: "install-migrate",
  MISSING: "create",
  NOT_GIT: "install",
  PILOT_KIT: "unsupported"
};
function file(root, relative) {
  return path19.join(root, ...relative.split("/"));
}
function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}
function readManifest(root) {
  const text3 = workflowPlatformFacade.readTextIfExists(
    file(root, MANIFEST_PATH)
  );
  if (text3 === null) {
    return null;
  }
  try {
    return JSON.parse(text3);
  } catch {
    return { files: [], schema: "harness-workflow-manifest/1", version: "0" };
  }
}
function damagedFiles(root, manifest) {
  return manifest.files.filter((item) => item.sha256 !== null).filter((item) => {
    const current = workflowPlatformFacade.readTextIfExists(
      file(root, item.path)
    );
    const managed = readManaged(item.kind, item.path, current);
    return managed === null || sha2562(managed) !== item.sha256;
  }).map((item) => item.path);
}
function kitState(root, manifest) {
  const damaged = damagedFiles(root, manifest);
  if (compareVersions(manifest.version, KIT_VERSION) < 0) {
    return { damaged, state: "KIT_OUTDATED" };
  }
  return { damaged, state: damaged.length > 0 ? "KIT_DAMAGED" : "KIT_OK" };
}
function classify(root, repository) {
  if (readdirSync3(root).length === 0) {
    return { damaged: [], state: "EMPTY" };
  }
  if (existsSync12(file(root, PILOT_MANIFEST))) {
    return { damaged: [], state: "PILOT_KIT" };
  }
  const manifest = readManifest(root);
  if (manifest) {
    return kitState(root, manifest);
  }
  if ((workflowPlatformFacade.readTextIfExists(file(root, PLAN_PATH)) ?? "").includes(LEGACY_PLAN_SCHEMA)) {
    return { damaged: [], state: "LEGACY_HARNESS_PLAN" };
  }
  return { damaged: [], state: repository ? "GIT_NO_KIT" : "NOT_GIT" };
}
function inspectFolder(git, folder) {
  const root = path19.resolve(folder);
  const base = {
    damaged: [],
    nestedIn: null,
    path: root,
    stacks: [],
    transactionPending: false,
    version: null
  };
  if (!existsSync12(root)) {
    const parent = path19.dirname(root);
    return {
      ...base,
      action: "create",
      git: {
        head: null,
        identity: existsSync12(parent) ? git.identity(parent) : null,
        repository: false
      },
      state: "MISSING"
    };
  }
  ensure(
    statSync6(root).isDirectory(),
    "NOT_A_DIRECTORY",
    `${root} is not a folder.`
  );
  const inside = git.isRepository(root);
  const top = inside ? git.topLevel(root) : null;
  const repository = top !== null && workflowPlatformFacade.samePath(
    realpathSync3.native(path19.resolve(top)),
    realpathSync3.native(root)
  );
  const nestedIn = inside && !repository ? top : null;
  const { damaged, state } = classify(root, repository);
  return {
    action: nestedIn ? "unsupported" : ACTIONS[state],
    damaged,
    git: {
      head: repository ? git.head(root) : null,
      identity: git.identity(root),
      repository
    },
    nestedIn,
    path: root,
    stacks: workflowQualityFacade.detect(root).map((stack) => stack.id),
    state,
    transactionPending: repository && git.transactions.journal(root) !== null,
    version: readManifest(root)?.version ?? null
  };
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-doctor-checks.ts
var UPDATE = "Run `scripts/workflow doctor --fix` (or `install --update`).";
var check = (id, status, message, fixable = false, nextAction = null) => ({
  fixable,
  id,
  message,
  nextAction,
  status
});
function file2(root, relative) {
  return path20.join(root, ...relative.split("/"));
}
function manifestChecks(root, platform) {
  const manifest = readManifest(root);
  if (!manifest) {
    return [
      check(
        "manifest",
        "fail",
        "The Workflow Kit manifest is missing.",
        false,
        "Install the Kit: `scripts/workflow install`."
      )
    ];
  }
  const checks = [
    compareVersions(manifest.version, KIT_VERSION) < 0 ? check(
      "manifest",
      "fail",
      `Kit ${manifest.version} is older than ${KIT_VERSION}.`,
      true,
      UPDATE
    ) : check("manifest", "ok", `Kit ${manifest.version}.`)
  ];
  const damaged = damagedFiles(root, manifest);
  checks.push(
    damaged.length === 0 ? check(
      "managed-files",
      "ok",
      "Managed files and sections match the manifest."
    ) : check(
      "managed-files",
      "fail",
      `Changed or missing managed parts: ${damaged.join(", ")}.`,
      true,
      UPDATE
    )
  );
  if (platform !== "win32") {
    const blocked2 = manifest.files.filter((item) => item.executable && existsSync13(file2(root, item.path))).filter((item) => {
      try {
        accessSync2(file2(root, item.path), constants2.X_OK);
        return false;
      } catch {
        return true;
      }
    }).map((item) => item.path);
    checks.push(
      blocked2.length === 0 ? check("executable", "ok", "Launchers and hooks are executable.") : check(
        "executable",
        "fail",
        `Not executable: ${blocked2.join(", ")}.`,
        true,
        UPDATE
      )
    );
  }
  return checks;
}
function hooksCheck(git, root) {
  const hooksPath = git.git.run(root, ["config", "--local", "--get", "core.hooksPath"], {
    allowFailure: true
  }).stdout.trim();
  if (hooksPath === "") {
    return check(
      "git-hooks",
      "fail",
      "core.hooksPath is not set, so Kit hooks do not run.",
      true,
      UPDATE
    );
  }
  const missing2 = MANAGED_GIT_HOOKS.filter((name) => {
    const text3 = workflowPlatformFacade.readTextIfExists(
      path20.resolve(root, hooksPath, name)
    );
    return text3 === null || extractSection(text3, "hash") === null;
  });
  return missing2.length === 0 ? check(
    "git-hooks",
    "ok",
    `Kit hooks run from ${hooksPath === OWN_HOOKS_DIR ? OWN_HOOKS_DIR : hooksPath}.`
  ) : check(
    "git-hooks",
    "fail",
    `Hooks without the Kit section in ${hooksPath}: ${missing2.join(", ")}.`,
    true,
    UPDATE
  );
}
function planChecks(git, root) {
  const checks = [];
  try {
    const plan = workflowPlanFacade.read(root);
    if (!plan) {
      return [
        check(
          "plan",
          "fail",
          `${PLAN_PATH} is missing.`,
          false,
          "Run `scripts/workflow install --update`."
        )
      ];
    }
    git.resolveReferences(root, plan, PLAN_PATH);
    checks.push(
      check("plan", "ok", `Plan revision ${plan.revision} matches the history.`)
    );
  } catch (error2) {
    const { code, message } = error2;
    checks.push(
      check(
        "plan",
        "fail",
        `${code ?? "ERROR"}: ${message}`,
        false,
        "Run `scripts/workflow repair`."
      )
    );
  }
  checks.push(
    git.transactions.journal(root) ? check(
      "transaction",
      "fail",
      "A commit transaction is unfinished.",
      false,
      "Run `scripts/workflow repair`."
    ) : check("transaction", "ok", "No unfinished transaction.")
  );
  return checks;
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-install.ts
import { chmodSync, existsSync as existsSync14, mkdirSync as mkdirSync3 } from "node:fs";
import path21 from "node:path";
var KIT_STATES = /* @__PURE__ */ new Set([
  "KIT_DAMAGED",
  "KIT_OK",
  "KIT_OUTDATED"
]);
var SLUG_DROP2 = /[^a-z0-9]+/gu;
var SLUG_TRIM = /^-+|-+$/gu;
function projectSlug(name) {
  return name.toLowerCase().replace(SLUG_DROP2, "-").replace(SLUG_TRIM, "") || "project";
}
function file3(root, relative) {
  return path21.join(root, ...relative.split("/"));
}
function localHooksPath(git, root) {
  const value = git.git.run(root, ["config", "--local", "--get", "core.hooksPath"], {
    allowFailure: true
  }).stdout.trim();
  if (value === "") {
    return null;
  }
  let relative;
  try {
    relative = workflowPlatformFacade.relativeFromRoot(
      root,
      path21.resolve(root, value)
    );
  } catch {
    throw new WorkflowError(
      "HOOKS_PATH_OUTSIDE",
      `core.hooksPath points outside the project: ${value}`
    );
  }
  return relative === OWN_HOOKS_DIR ? null : relative;
}
function writeIfChanged(root, relative, next, executable, platform = workflowPlatformFacade.platform) {
  const target = file3(root, relative);
  const changed = workflowPlatformFacade.readTextIfExists(target) !== next;
  if (changed) {
    workflowPlatformFacade.writeFileAtomic(target, next);
  }
  if (executable && platform !== "win32") {
    chmodSync(target, 493);
  }
  return changed;
}
function checkPreconditions(state, update, nestedIn, pending) {
  ensure(
    !nestedIn,
    "NESTED_REPOSITORY",
    `The folder is inside the repository ${nestedIn}; choose its top level or another folder.`
  );
  ensure(
    state !== "PILOT_KIT",
    "PILOT_KIT_UNSUPPORTED",
    "This project uses Workflow Pilot (Kit 1.x), which Harness does not support."
  );
  ensure(
    !pending,
    "TRANSACTION_PENDING",
    "A Kit commit transaction is unfinished.",
    {},
    "Run `scripts/workflow repair`."
  );
  if (update) {
    ensure(
      KIT_STATES.has(state),
      "NOT_INSTALLED",
      "The Workflow Kit is not installed here; install it first."
    );
  } else {
    ensure(
      !KIT_STATES.has(state),
      "ALREADY_INSTALLED",
      "The Workflow Kit is already installed.",
      {},
      "Use `install --update` or `doctor --fix`."
    );
  }
}
function writePayload(root, entries2, platform) {
  const written = [];
  for (const entry of entries2) {
    const current = workflowPlatformFacade.readTextIfExists(
      file3(root, entry.path)
    );
    if (writeIfChanged(
      root,
      entry.path,
      entry.render(current),
      entry.executable,
      platform
    )) {
      written.push(entry.path);
    }
  }
  return written;
}
function writeConfig(root, host) {
  const exists = workflowPlatformFacade.readTextIfExists(
    workflowQualityFacade.configFile(root)
  ) !== null;
  const config = exists ? workflowQualityFacade.readConfig(root) : workflowQualityFacade.defaultConfig();
  if (exists && (!host || config.host === host)) {
    return false;
  }
  workflowQualityFacade.writeConfig(root, host ? { ...config, host } : config);
  return true;
}
function writeState(root, entries2, options) {
  const written = [];
  if (writeConfig(root, options.host)) {
    written.push(workflowQualityFacade.configPath);
  }
  if (writeIfChanged(
    root,
    MANIFEST_PATH,
    renderManifest(buildManifest(entries2)),
    false
  )) {
    written.push(MANIFEST_PATH);
  }
  const runtime = options.runtime;
  if (runtime) {
    workflowPlatformFacade.writeFileAtomic(
      file3(root, RUNTIME_FILE),
      workflowPlatformFacade.formatRuntimeFile(runtime.executable, runtime.mode)
    );
  }
  return written;
}
function requireInstallIdentity(git, root, repository) {
  const local = repository ? git.readIdentity(root, "local") : null;
  if (local && git.isUsableIdentity(local)) {
    return local;
  }
  const global = git.readIdentity(
    existsSync14(root) ? root : process.cwd(),
    "global"
  );
  if (global && git.isUsableIdentity(global)) {
    return global;
  }
  throw git.identityRequired(Boolean(local || global), " Nothing was written.");
}
function scopeOf(planText2, legacy) {
  if (legacy) {
    return null;
  }
  try {
    return workflowPlanFacade.parse(planText2).scope?.id ?? null;
  } catch {
    return null;
  }
}
function commitInstall(git, root, files, planText2, update, scopeId) {
  try {
    return git.transactions.commit(root, {
      files,
      message: update ? `chore: update workflow kit to ${KIT_VERSION}` : `chore: install workflow kit ${KIT_VERSION}`,
      planPath: PLAN_PATH,
      planText: planText2,
      role: update ? "kit-update" : "bootstrap",
      scopeId,
      taskId: null
    });
  } catch (error2) {
    if (error2 instanceof WorkflowError && error2.code === "NOTHING_TO_COMMIT") {
      return null;
    }
    throw error2;
  }
}
function installKit(git, folder, options) {
  const inspected = inspectFolder(git, folder);
  const root = inspected.path;
  const update = options.update === true;
  checkPreconditions(
    inspected.state,
    update,
    inspected.nestedIn,
    inspected.transactionPending
  );
  ensure(
    options.host === void 0 || options.host === null || options.host === "harness",
    "USAGE",
    "--host is harness."
  );
  const identity = requireInstallIdentity(git, root, inspected.git.repository);
  mkdirSync3(root, { recursive: true });
  if (!inspected.git.repository) {
    git.init(root);
  }
  const local = git.readIdentity(root, "local");
  if (!(local && git.isUsableIdentity(local))) {
    git.writeLocalIdentity(root, identity);
  }
  const hooksPath = localHooksPath(git, root);
  const before = new Set(git.changes(root).all);
  const name = options.name?.trim() || path21.basename(root);
  const entries2 = buildPayload({
    bundle: options.bundle,
    hooksPath,
    projectName: name
  });
  const written = [
    ...writePayload(
      root,
      entries2,
      options.platform ?? workflowPlatformFacade.platform
    ),
    ...writeState(root, entries2, options)
  ];
  const migrationRequired = inspected.state === "LEGACY_HARNESS_PLAN";
  const existingPlan = workflowPlatformFacade.readTextIfExists(
    file3(root, PLAN_PATH)
  );
  const planText2 = existingPlan ?? workflowPlanFacade.render(
    workflowPlanFacade.createEmpty(projectSlug(name), name)
  );
  if (hooksPath === null) {
    git.setConfig(root, "core.hooksPath", OWN_HOOKS_DIR);
  }
  const commit2 = commitInstall(
    git,
    root,
    written,
    planText2,
    update,
    scopeOf(planText2, migrationRequired || existingPlan === null)
  );
  return {
    commit: commit2,
    excluded: [...before].filter((item) => !written.includes(item)).sort(),
    hooksPath: hooksPath ?? OWN_HOOKS_DIR,
    migrationRequired,
    previousState: inspected.state,
    root,
    version: KIT_VERSION,
    written
  };
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-doctor.ts
function realGlobalIdentity(git, root) {
  const global = git.readIdentity(root, "global");
  return global && git.isUsableIdentity(global) ? global : null;
}
function identityCheck(git, root) {
  const local = git.readIdentity(root, "local");
  if (local && git.isUsableIdentity(local)) {
    return check(
      "git-identity",
      "ok",
      `${local.name} <${local.email}> (repository config).`
    );
  }
  const problem = local ? `The repository git identity ${local.name} <${local.email}> is a placeholder or invalid.` : "The repository config has no git identity.";
  const global = realGlobalIdentity(git, root);
  return global ? check(
    "git-identity",
    "fail",
    problem,
    true,
    `Run \`scripts/workflow doctor --fix\` to copy ${global.name} <${global.email}> from the global config.`
  ) : check("git-identity", "fail", problem, false, git.identityFix);
}
function environmentChecks(git, root, options) {
  const runtime = workflowPlatformFacade.resolveRuntime(
    root,
    options.env ?? process.env,
    options.probe
  );
  const drift = workflowQualityFacade.drift(root);
  return [
    runtime ? check(
      "runtime",
      "ok",
      `${runtime.mode} ${runtime.version} (${runtime.source}).`
    ) : check(
      "runtime",
      "fail",
      "No Node.js 22+ runtime for the launchers.",
      false,
      "Install Node.js 22 or newer, or open the project in Harness AI."
    ),
    identityCheck(git, root),
    drift.status === "drift" ? check(
      "quality-drift",
      "warn",
      `Quality profile drift: new ${drift.added.join(", ") || "none"}, missing ${drift.missing.join(", ") || "none"}.`,
      false,
      "Extend the plan with a QUALITY task."
    ) : check(
      "quality-drift",
      "ok",
      drift.status === "discovery" ? "Quality profile not configured yet." : "Quality profile matches the stacks."
    )
  ];
}
var SKIPPED_SEGMENTS = /* @__PURE__ */ new Set([".git", "node_modules"]);
var SKIPPED_PREFIXES = [".harness/workflow/", ".harness/plans/archive/"];
function projectMarkdown(git, root) {
  const output = git.git.run(
    root,
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "*.md",
      "*.markdown"
    ],
    { allowFailure: true }
  );
  if (output.status !== 0) {
    return [];
  }
  const files = output.stdout.split("\0").filter(
    (item) => item !== "" && !item.split("/").some((segment) => SKIPPED_SEGMENTS.has(segment)) && !SKIPPED_PREFIXES.some((prefix) => item.startsWith(prefix))
  );
  return [...new Set(files)].sort((left, right) => left < right ? -1 : 1);
}
function documentSizeCheck(git, root) {
  const config = workflowQualityFacade.readConfig(root);
  const limit = config.budget.documentBytes;
  const over = workflowQualityFacade.oversizedDocuments(
    root,
    projectMarkdown(git, root),
    config
  );
  return over.length === 0 ? check("doc-size", "ok", `Markdown documents fit ${limit} bytes.`) : check(
    "doc-size",
    "warn",
    `Documents over ${limit} bytes cannot be read in one Read: ${over.map((item) => `${item.path} (${item.bytes} bytes)`).join(", ")}.`,
    false,
    "Split each listed document into smaller documents."
  );
}
function inspectProject(git, root, options) {
  return [
    ...manifestChecks(root, options.platform ?? workflowPlatformFacade.platform),
    hooksCheck(git, root),
    ...planChecks(git, root),
    ...environmentChecks(git, root, options),
    documentSizeCheck(git, root)
  ];
}
function runDoctor(git, folder, options = {}) {
  const root = path22.resolve(folder);
  let checks = inspectProject(git, root, options);
  let fix = null;
  let identityFix = null;
  if (options.fix) {
    const fixable = checks.filter(
      (item) => item.status === "fail" && item.fixable
    );
    if (fixable.some((item) => item.id === "git-identity")) {
      identityFix = realGlobalIdentity(git, root);
      if (identityFix) {
        git.writeLocalIdentity(root, identityFix);
      }
    }
    if (fixable.some((item) => item.id !== "git-identity") && identityCheck(git, root).status === "ok") {
      fix = installKit(git, root, {
        ...options.fix,
        update: true,
        ...options.platform ? { platform: options.platform } : {}
      });
    }
    if (fix || identityFix) {
      checks = inspectProject(git, root, options);
    }
  }
  return {
    checks,
    fix,
    identityFix,
    ok: checks.every((item) => item.status !== "fail"),
    root
  };
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-migrate.ts
import { existsSync as existsSync15 } from "node:fs";
import path23 from "node:path";

// product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-legacy-plan.ts
var LEGACY_SCHEMA = "harness-ai-plan-v1";
var STATE_BLOCK = /<!-- harness-plan-state:start -->\s*```json\s*([\s\S]*?)```\s*<!-- harness-plan-state:end -->/u;
var ROW_START = /^\d+\.\s+\[(TODO|IN_PROGRESS|DONE)\]\s+(.*)$/u;
var TASK_ROW = /^`([^`]+)`\s+([\s\S]*)$/u;
var PHASE_HEADING = /^##\s+(.+?)\s*$/u;
var EXPECTED_COMMIT = /expected commit:\s*`([^`]+)`/u;
var COMPLETION = /completion:\s*([a-z-]+)/u;
var KIND = /\(kind:\s*([a-z]+)\)/u;
var SCOPE = /\(scope:\s*([^;)]*)/u;
var TITLE_END = /\s+\((?:scope|kind|completion):/u;
var RESULT_TAIL = /\s+Result:[\s\S]*$/u;
var CONTEXT_PATH = /`([^`\s]+\.(?:md|json))`/gu;
var CONTINUATION = /^\s+\S/u;
var LINE_BREAK2 = /\r?\n/u;
function rows(text3) {
  const result2 = [];
  let phase = "";
  for (const line of text3.split(LINE_BREAK2)) {
    const heading = PHASE_HEADING.exec(line);
    const start = ROW_START.exec(line);
    const last = result2.at(-1);
    if (heading?.[1]) {
      phase = heading[1];
    } else if (start?.[1] && start[2] !== void 0) {
      result2.push({ body: start[2], phase, status: start[1] });
    } else if (last && CONTINUATION.test(line)) {
      last.body = `${last.body} ${line.trim()}`;
    }
  }
  return result2;
}
function taskOf(row) {
  const match = TASK_ROW.exec(row.body);
  if (!(match?.[1] && match[2] !== void 0)) {
    return null;
  }
  const body = match[2];
  const titleEnd = body.search(TITLE_END);
  const title = (titleEnd === -1 ? body : body.slice(0, titleEnd)).replace(RESULT_TAIL, "").trim();
  return {
    completion: COMPLETION.exec(body)?.[1] ?? null,
    expectedCommit: EXPECTED_COMMIT.exec(body)?.[1] ?? null,
    id: match[1],
    kind: KIND.exec(body)?.[1] ?? null,
    phase: row.phase,
    scope: SCOPE.exec(body)?.[1]?.trim() ?? null,
    status: row.status,
    title: title || match[1]
  };
}
function contextPaths(text3) {
  const start = text3.indexOf("## Context Pack");
  if (start === -1) {
    return [];
  }
  const end = text3.indexOf("\n## ", start + 1);
  const section2 = text3.slice(start, end === -1 ? void 0 : end);
  return [
    ...new Set(
      [...section2.matchAll(CONTEXT_PATH)].map((item) => item[1] ?? "").filter(Boolean)
    )
  ];
}
function parseLegacyPlan(text3) {
  const block2 = STATE_BLOCK.exec(text3)?.[1];
  ensure(
    block2,
    "NOT_LEGACY_PLAN",
    "The plan has no harness-ai-plan-v1 state block."
  );
  let state;
  try {
    state = JSON.parse(block2);
  } catch {
    state = {};
  }
  ensure(
    state.schema === LEGACY_SCHEMA,
    "NOT_LEGACY_PLAN",
    `The plan schema is not ${LEGACY_SCHEMA}.`
  );
  return {
    context: contextPaths(text3),
    currentTaskId: typeof state.currentTaskId === "string" ? state.currentTaskId : null,
    planId: typeof state.planId === "string" ? state.planId : "legacy-plan",
    scopeStatus: typeof state.executionScopeStatus === "string" ? state.executionScopeStatus : "NONE",
    tasks: rows(text3).map(taskOf).filter((task2) => task2 !== null)
  };
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-migrate.ts
var LEGACY_ROUND = "R0-legacy";
var DEFAULT_MESSAGE = "chore: migrate the plan into the workflow kit";
var RESULT_LIMIT = 590;
function task(legacy, kind, dependencies) {
  return {
    acceptance: [legacy.title],
    checks: [],
    commitMessage: legacy.expectedCommit ?? `chore: ${legacy.id}`,
    confirmation: null,
    context: [],
    dependencies,
    docsWaiver: null,
    files: [],
    fixes: null,
    id: legacy.id,
    iteration: 1,
    kind,
    roundId: "R1",
    status: "TODO",
    title: legacy.title,
    why: `Migrated from ${legacy.phase || "the legacy plan"}${legacy.scope ? `; legacy scope: ${legacy.scope}` : ""}.`
  };
}
function docsTask(source, dependencies) {
  return {
    acceptance: [
      "Project-wide documents describe the round result",
      "The round digest records result, decisions, contracts and references"
    ],
    checks: [],
    commitMessage: source?.expectedCommit ?? "docs: reconcile documentation for R1",
    confirmation: null,
    context: [],
    dependencies,
    docsWaiver: null,
    files: [],
    fixes: null,
    id: "DOCS-R1",
    iteration: 1,
    kind: "docs",
    roundId: "R1",
    status: "TODO",
    title: source?.title ?? "Reconcile project documentation and write the round digest",
    why: "Keep the project context current for the next agent and close the round."
  };
}
function legacyResult(legacy, done) {
  const first = done[0]?.id ?? "none";
  const last = done.at(-1)?.id ?? "none";
  const text3 = `Legacy plan ${legacy.planId}: ${done.length} tasks were done before the move to the Workflow Kit (${first} \u2026 ${last}). Their rows stay in the plan of the parent commit of the migration.`;
  return text3.length > RESULT_LIMIT ? `${text3.slice(0, RESULT_LIMIT)}\u2026` : text3;
}
function buildMigratedPlan(legacy, base, options, existing) {
  const message = options.message ?? DEFAULT_MESSAGE;
  const finished = (item) => item.status === "DONE" || item.expectedCommit === message;
  const done = legacy.tasks.filter(finished);
  const pending = legacy.tasks.filter((item) => !finished(item));
  const acceptanceRows = pending.filter(
    (item) => item.completion === "user-acceptance"
  );
  const docsRows = pending.filter((item) => item.kind === "docs");
  const regular = pending.filter(
    (item) => item.completion !== "user-acceptance" && item.kind !== "docs" && item.kind !== "delivery"
  );
  const deliveries = pending.filter(
    (item) => item.kind === "delivery" && item.completion !== "user-acceptance"
  );
  const plan = workflowPlanFacade.createEmpty(base.projectId, base.projectName);
  const converted = [
    ...acceptanceRows.map(
      (item) => `${item.id} \u2192 the user's acceptance through \`accept\``
    ),
    ...docsRows.map((item) => `${item.id} \u2192 DOCS-R1`)
  ];
  if (legacy.scopeStatus !== "ACTIVE" || regular.length + deliveries.length + docsRows.length === 0) {
    return { converted, legacyDone: done.length, migrated: [], plan };
  }
  const work = regular.map(
    (item) => task(item, item.kind === "quality" ? "quality" : "work", [])
  );
  const docs = docsTask(
    docsRows[0],
    work.map((item) => item.id)
  );
  plan.scope = {
    acceptance: options.acceptance ?? ["The user accepts the delivered result"],
    acceptanceNote: null,
    approval: {
      at: options.now,
      text: `Migrated from the legacy plan ${legacy.planId} by migrate:harness-plan.`
    },
    baselineCommit: base.baselineCommit,
    blockedReason: null,
    context: legacy.context.filter(existing).map((item) => ({ path: item, required: false })),
    decisions: converted.map((text3) => ({
      at: options.now,
      text: `Migration: ${text3}.`
    })),
    delivery: "IN_PROGRESS",
    id: legacy.planId,
    objective: options.objective ?? `Finish the remaining work of ${legacy.planId}.`,
    spec: options.spec ?? null,
    status: "ACTIVE"
  };
  plan.rounds = [
    {
      digest: {
        contracts: [],
        decisions: [],
        references: [`git show ${base.baselineCommit}:${PLAN_PATH}`],
        result: legacyResult(legacy, done)
      },
      id: LEGACY_ROUND,
      kind: "legacy",
      status: "CLOSED",
      title: `Legacy plan ${legacy.planId}`
    },
    {
      digest: null,
      id: "R1",
      kind: "implementation",
      status: "OPEN",
      title: "Remaining work"
    }
  ];
  plan.tasks = [
    ...work,
    docs,
    ...deliveries.map((item) => task(item, "delivery", [docs.id]))
  ];
  return {
    converted,
    legacyDone: done.length,
    migrated: plan.tasks.map((item) => item.id),
    plan: workflowPlanFacade.validate(plan)
  };
}
function migrateHarnessPlan(git, folder, options) {
  const root = path23.resolve(folder);
  ensure(
    readManifest(root),
    "NOT_INSTALLED",
    "Install the Workflow Kit before migrating the plan.",
    {},
    "Run `scripts/workflow install`."
  );
  const text3 = workflowPlatformFacade.readTextIfExists(
    path23.join(root, ...PLAN_PATH.split("/"))
  );
  ensure(text3, "NOT_LEGACY_PLAN", `${PLAN_PATH} does not exist.`);
  const legacy = parseLegacyPlan(text3);
  const baselineCommit = git.head(root);
  ensure(baselineCommit, "NO_COMMITS", "The repository has no commits yet.");
  const name = options.name?.trim() || path23.basename(root);
  const result2 = buildMigratedPlan(
    legacy,
    { baselineCommit, projectId: projectSlug(name), projectName: name },
    options,
    (relative) => existsSync15(path23.join(root, ...relative.split("/")))
  );
  ensure(
    git.transactions.journal(root) === null,
    "TRANSACTION_PENDING",
    "A Kit commit transaction is unfinished."
  );
  const commit2 = git.transactions.commit(root, {
    files: [],
    message: options.message ?? DEFAULT_MESSAGE,
    planPath: PLAN_PATH,
    planText: workflowPlanFacade.render(result2.plan),
    role: "kit-update",
    scopeId: result2.plan.scope?.id ?? null,
    taskId: null
  });
  return {
    commit: commit2,
    converted: result2.converted,
    legacyDone: result2.legacyDone,
    migrated: result2.migrated,
    scopeId: result2.plan.scope?.id ?? null
  };
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/workflow-installer-facade.ts
var WorkflowInstallerFacade = class {
  version = KIT_VERSION;
  manifestPath = MANIFEST_PATH;
  git;
  constructor(git = workflowGitFacade) {
    this.git = git;
  }
  /** `inspect <path>`: classifies a folder without changing it. */
  inspect(folder) {
    return inspectFolder(this.git, folder);
  }
  /** `install <path> [--update]`: installs or updates the Kit and commits it. */
  install(folder, options) {
    return installKit(this.git, folder, options);
  }
  /** `doctor [--fix]`: health checks; `fix` repairs fixable findings only. */
  doctor(folder, options = {}) {
    return runDoctor(this.git, folder, options);
  }
  /** `migrate:harness-plan`: a legacy Harness plan becomes a Kit plan. */
  migrateHarnessPlan(folder, options) {
    return migrateHarnessPlan(this.git, folder, options);
  }
  /** Every file the Kit writes into a project, with its writing rule. */
  payload(options) {
    return buildPayload(options);
  }
  manifest(entries2) {
    return buildManifest(entries2);
  }
  renderManifest(manifest) {
    return renderManifest(manifest);
  }
  /** The English agent rules of the managed AGENTS.md section. */
  agentRules() {
    return agentRules();
  }
};
var workflowInstallerFacade = new WorkflowInstallerFacade();

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-status.ts
function brief(task2) {
  return task2 ? {
    id: task2.id,
    kind: task2.kind,
    roundId: task2.roundId,
    status: task2.status,
    title: task2.title
  } : null;
}
function statusTask(task2) {
  return {
    dependencies: [...task2.dependencies],
    id: task2.id,
    kind: task2.kind,
    parallelSafe: task2.parallelSafe === true,
    roundId: task2.roundId,
    status: task2.status,
    title: task2.title
  };
}
function textOrNull(value) {
  return typeof value === "string" ? value : null;
}
function integrationOf(context) {
  const text3 = workflowPlatformFacade.readTextIfExists(
    context.git.localPath(context.root, INTEGRATION_FILE)
  );
  if (text3 === null) {
    return null;
  }
  let journal = {};
  try {
    const parsed = JSON.parse(text3);
    journal = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
  }
  return {
    assignmentId: textOrNull(journal.assignmentId),
    phase: textOrNull(journal.phase),
    taskId: textOrNull(journal.taskId)
  };
}
function assignmentsOf(context, plan) {
  const scopeId = plan?.scope?.id;
  if (!scopeId) {
    return [];
  }
  return workflowAssignmentFacade.list(context.root).filter((record) => record.scopeId === scopeId).map((record) => ({
    branch: record.branch,
    cleanup: record.cleanup,
    id: record.id,
    integrationCommit: record.integrationCommit,
    sourceCommit: record.sourceCommit,
    status: record.status,
    taskId: record.taskId,
    worktree: record.worktree
  }));
}
function proposalOf(context) {
  const proposal = workflowExecutionModeFacade.readProposal(context.root);
  return proposal ? {
    generation: proposal.generation,
    hasParallelWork: proposal.hasParallelWork,
    options: [...proposal.options],
    recommended: proposal.recommended,
    refining: proposal.refining
  } : null;
}
function transactionOf(context) {
  const journal = context.git.transactions.journal(context.root);
  return journal ? {
    error: journal.error,
    id: journal.id,
    phase: journal.phase,
    role: journal.role,
    taskId: journal.taskId
  } : null;
}
function readStatus(context) {
  const plan = workflowPlanFacade.read(context.root);
  const config = workflowQualityFacade.readConfig(context.root);
  const repository = context.git.isRepository(context.root);
  const changes = repository ? context.git.changes(context.root).all.filter((file4) => !context.git.isKitManagedPath(file4)) : [];
  const tasks = plan?.tasks ?? [];
  const own = executorAssignment(context);
  return {
    assignments: own ? [] : assignmentsOf(context, plan),
    changes,
    currentTask: brief(tasks.find((task2) => task2.id === plan?.currentTaskId)),
    execution: plan?.scope ? workflowPlanFacade.execution(plan) : null,
    executor: own ? { assignmentId: own.id, taskId: own.taskId } : null,
    head: repository ? context.git.head(context.root) : null,
    installed: plan !== null,
    integration: own ? null : integrationOf(context),
    nextTask: plan ? brief(workflowPlanFacade.nextTask(plan)) : null,
    paused: readPause(context).paused,
    progress: {
      done: tasks.filter((task2) => task2.status === "DONE").length,
      total: tasks.length
    },
    project: plan ? { id: plan.projectId, name: plan.projectName } : null,
    quality: {
      drift: workflowQualityFacade.drift(context.root, config),
      stacks: config.quality.stacks,
      status: config.quality.status
    },
    revision: plan?.revision ?? 0,
    rounds: (plan?.rounds ?? []).map(({ id, kind, status }) => ({
      id,
      kind,
      status
    })),
    scope: plan?.scope ? {
      blockedReason: plan.scope.blockedReason,
      delivery: plan.scope.delivery,
      id: plan.scope.id,
      objective: plan.scope.objective,
      status: plan.scope.status
    } : null,
    scopeProposal: proposalOf(context),
    tasks: tasks.map(statusTask),
    transaction: repository ? transactionOf(context) : null
  };
}
function orchestrationOf(context, status) {
  if (status.execution?.strategy !== "orchestrated" || status.executor) {
    return null;
  }
  const plan = workflowPlanFacade.read(context.root);
  if (!plan) {
    return null;
  }
  const schedule = workflowAssignmentFacade.schedule(
    plan,
    activeRecords(plan, context.root)
  );
  return {
    assignments: status.assignments.filter(
      (item) => item.status !== "INTEGRATED" || item.cleanup?.status === "PENDING"
    ).map(({ id, sourceCommit, status: state, taskId }) => ({
      cleanupPending: state === "INTEGRATED",
      id,
      sourceCommit,
      status: state,
      taskId
    })),
    integration: status.integration,
    readyTasks: schedule.ready
  };
}
function autopilotStatus(context) {
  const status = readStatus(context);
  return {
    blockedReason: status.scope?.blockedReason ?? null,
    delivery: status.scope?.delivery ?? null,
    head: status.head,
    nextTask: status.nextTask,
    orchestration: orchestrationOf(context, status),
    paused: status.paused,
    proposalPending: status.scopeProposal !== null && !status.scopeProposal.refining,
    revision: status.revision,
    scope: status.scope?.status ?? "NONE",
    transactionPending: status.transaction !== null
  };
}
function collect(errors, action) {
  try {
    action();
    return true;
  } catch (error2) {
    const { code, message } = error2;
    errors.push({ code: code ?? "ERROR", message });
    return false;
  }
}
function validateProject(context) {
  const errors = [];
  let plan = null;
  collect(errors, () => {
    plan = workflowPlanFacade.read(context.root);
  });
  collect(errors, () => workflowQualityFacade.readConfig(context.root));
  if (plan) {
    const current = plan;
    collect(
      errors,
      () => context.git.resolveReferences(context.root, current, PLAN_PATH)
    );
  } else if (errors.length === 0) {
    errors.push({
      code: "NOT_INSTALLED",
      message: `${PLAN_PATH} does not exist.`
    });
  }
  return { errors, ok: errors.length === 0 };
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-facade-base.ts
var WorkflowKitBase = class {
  env;
  git;
  installer;
  recovery;
  now;
  constructor(options = {}) {
    this.env = options.env ?? process.env;
    this.git = options.git ?? workflowGitFacade;
    this.now = options.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
    this.recovery = new WorkflowRecoveryFacade(this.git);
    this.installer = new WorkflowInstallerFacade(this.git);
  }
  context(root) {
    return { env: this.env, git: this.git, now: this.now, root };
  }
  /** `inspect <path>`: folder state and the action to offer. */
  inspect(folder) {
    return this.installer.inspect(folder);
  }
  /** `doctor [--fix]`: project health; fixes only fixable findings. */
  doctor(folder, options = {}) {
    return this.installer.doctor(folder, { env: this.env, ...options });
  }
  /** `migrate:harness-plan`: a legacy Harness plan becomes a Kit plan. */
  migrateHarnessPlan(folder, options) {
    return this.installer.migrateHarnessPlan(folder, {
      ...options,
      now: this.now()
    });
  }
  /** `install <path> [--update]`. */
  install(folder, options) {
    return this.installer.install(folder, options);
  }
  status(root) {
    return readStatus(this.context(root));
  }
  validate(root) {
    return validateProject(this.context(root));
  }
  autopilotStatus(root) {
    return autopilotStatus(this.context(root));
  }
  recover(root, event = "startup") {
    return this.recovery.packet(root, event);
  }
  showTask(root, taskId) {
    return this.recovery.showTask(root, taskId);
  }
  history(root, filter = {}) {
    return this.recovery.history(root, filter);
  }
  sessionStart(root, client, stdin, part = null) {
    return this.recovery.sessionStart(root, {
      client,
      env: this.env,
      part,
      stdin
    });
  }
};

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-hooks.ts
import { createHash as createHash7 } from "node:crypto";
import { existsSync as existsSync16, readFileSync as readFileSync10 } from "node:fs";
import path24 from "node:path";
var MANAGED_HINT = "Commit through the Workflow Kit: `scripts/workflow commit --task <ID>` or `scripts/workflow docs:commit`.";
var OUTPUT_TAIL4 = 1500;
var pass = (message = "") => ({
  code: null,
  exitCode: 0,
  message
});
var fail = (code, message) => ({
  code,
  exitCode: 1,
  message: `${code}: ${message}`
});
function fingerprints(root, files) {
  return files.map((file4) => {
    const absolute2 = path24.join(root, ...file4.split("/"));
    const digest = existsSync16(absolute2) ? createHash7("sha256").update(readFileSync10(absolute2)).digest("hex") : "deleted";
    return `${file4}:${digest}`;
  }).join("\n");
}
function failedSummary(report) {
  return report.results.filter((item) => item.status !== "passed" && item.status !== "skipped").map(
    (item) => `- ${item.id} ${item.status}${item.reason ? ` (${item.reason})` : ""}
${item.output.slice(-OUTPUT_TAIL4)}`
  ).join("\n");
}
function candidateTask(journal) {
  if (!journal.taskId) {
    return null;
  }
  try {
    const plan = workflowPlanFacade.parse(journal.candidatePlan, {
      projection: false
    });
    return plan.tasks.find((task2) => task2.id === journal.taskId) ?? null;
  } catch {
    return null;
  }
}
function isServiceCommit(journal, task2) {
  if (journal.role === "integration") {
    return task2?.kind !== "work";
  }
  return journal.role !== "implementation";
}
function preCommit(context) {
  const { git, root } = context;
  const journal = git.transactions.journal(root);
  if (!journal || journal.phase !== "PREPARED") {
    return fail("MANAGED_COMMIT_REQUIRED", MANAGED_HINT);
  }
  const treeBefore = git.git.text(root, ["write-tree"]);
  if (treeBefore !== journal.candidateTree) {
    return fail(
      "MANAGED_COMMIT_REQUIRED",
      "The index differs from the prepared candidate of the transaction."
    );
  }
  if ((journal.sourceCommit ?? null) !== git.mergeHead(root)) {
    return fail(
      "MANAGED_COMMIT_REQUIRED",
      journal.sourceCommit ? "The integration commit needs the merge of its source in progress." : "A merge is in progress; only `scripts/workflow integration:continue` commits it."
    );
  }
  guardExecutorCandidate(context, journal);
  const task2 = candidateTask(journal);
  const before = fingerprints(root, journal.selected);
  const report = workflowQualityFacade.runStage({
    assigned: journal.checks,
    config: workflowQualityFacade.readConfig(root),
    docsWaiver: task2?.docsWaiver ?? null,
    env: context.env,
    files: journal.selected,
    // The index equals the candidate: paths outside it are not committed.
    removed: git.absentPaths(root, journal.selected),
    root,
    service: isServiceCommit(journal, task2),
    stage: "commit"
  });
  workflowQualityFacade.recordEvidence(root, journal.id, [report]);
  if (git.git.text(root, ["write-tree"]) !== journal.candidateTree || fingerprints(root, journal.selected) !== before) {
    return fail(
      "CHECK_MODIFIED_CANDIDATE",
      "A commit-stage check changed the candidate files; commit checks may only read. Move fixers to the prepare stage."
    );
  }
  if (!report.ok) {
    return fail(
      "CHECK_FAILED",
      `Commit checks failed:
${failedSummary(report)}`
    );
  }
  return pass(
    `Workflow checks passed: ${report.results.map((item) => `${item.id} ${item.status}`).join(", ") || "none"}.`
  );
}
function commitMessage(context, args) {
  const journal = context.git.transactions.journal(context.root);
  const file4 = args[0] ? path24.resolve(context.root, args[0]) : "";
  const message = file4 && existsSync16(file4) ? readFileSync10(file4, "utf8") : "";
  if (!(journal && message.includes(`Workflow-Transaction: ${journal.id}`))) {
    return fail("MANAGED_COMMIT_REQUIRED", MANAGED_HINT);
  }
  return pass();
}
function pendingDocs(plan) {
  if (!plan) {
    return null;
  }
  const rounds = plan.rounds.filter(
    (round) => plan.tasks.some(
      (task2) => task2.roundId === round.id && task2.kind !== "docs" && task2.status === "DONE"
    )
  );
  const last = rounds.at(-1);
  if (!last || last.kind === "legacy") {
    return null;
  }
  const docs = plan.tasks.find(
    (task2) => task2.roundId === last.id && task2.kind === "docs"
  );
  return docs && docs.status !== "DONE" ? docs.id : null;
}
function prePush(context) {
  const executor = executorAssignment(context);
  if (executor) {
    return fail(
      "ASSIGNMENT_READ_ONLY",
      `The executor worktree of ${executor.id} never pushes; report the commit SHA to the orchestrator.`
    );
  }
  if (context.git.transactions.journal(context.root)) {
    return fail(
      "TRANSACTION_PENDING",
      "A commit transaction is unfinished; run `scripts/workflow repair`."
    );
  }
  if (workflowIntegrationFacade.isActive(context.root)) {
    return fail(
      "INTEGRATION_ACTIVE",
      "An integration is unfinished; run `scripts/workflow integration:continue --id <assignment>`."
    );
  }
  const docs = pendingDocs(workflowPlanFacade.read(context.root));
  if (docs) {
    return fail(
      "DOCS_PENDING",
      `Finish ${docs} (documentation and round digest) before pushing.`
    );
  }
  const report = workflowQualityFacade.runStage({
    config: workflowQualityFacade.readConfig(context.root),
    env: context.env,
    root: context.root,
    stage: "push"
  });
  if (!report.ok) {
    return fail(
      "CHECK_FAILED",
      `Push checks failed:
${failedSummary(report)}`
    );
  }
  return pass(
    `Workflow push checks passed: ${report.results.map((item) => item.id).join(", ") || "none"}.`
  );
}
function runGitHook(context, name, args) {
  try {
    switch (name) {
      case "pre-commit":
        return preCommit(context);
      case "commit-msg":
        return commitMessage(context, args);
      case "post-commit":
        return pass();
      case "pre-push":
        return prePush(context);
      default:
        return fail("UNKNOWN_HOOK", `Unknown git hook: ${name}`);
    }
  } catch (error2) {
    const { code, message } = error2;
    return fail(code ?? "HOOK_ERROR", message);
  }
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-integration.ts
function integration(context) {
  return new WorkflowIntegrationFacade(context.git);
}
function startIntegration2(context, assignmentId2, source) {
  return locked(
    context,
    () => integration(context).start(context.root, {
      assignmentId: assignmentId2,
      now: context.now,
      source
    })
  );
}
function continueIntegration2(context, assignmentId2) {
  return locked(
    context,
    () => integration(context).continue(context.root, {
      assignmentId: assignmentId2,
      now: context.now
    })
  );
}
function integrationStatus(context) {
  return integration(context).status(context.root);
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-quality.ts
function detectQuality(context, stacks) {
  return workflowQualityFacade.propose(context.root, {
    stacks,
    which: (name) => context.git.platform.findExecutable(name, context.env) !== null
  });
}
function applyQuality(context, input) {
  return locked(context, () => {
    ensureNoTransaction(context);
    const current = readPlan(context);
    const task2 = current.tasks.find(
      (item) => item.id === current.currentTaskId && item.kind === "quality"
    );
    const before = new Set(context.git.changes(context.root).all);
    const applied = workflowQualityFacade.applyProfile(
      context.root,
      input,
      context.env
    );
    const configPath = workflowQualityFacade.configPath;
    let files;
    if (task2) {
      const selection = context.git.selectTaskFiles(context.root, {
        iteration: task2.iteration,
        scopeId: current.scope?.id ?? "NONE",
        taskId: task2.id
      });
      files = [...selection.selected, configPath];
    } else {
      files = [
        ...context.git.changes(context.root).all.filter(
          (file4) => !(before.has(file4) || context.git.isKitManagedPath(file4))
        ),
        configPath
      ];
    }
    let plan = current;
    if (task2) {
      plan = structuredClone(current);
      const own = workflowPlanFacade.task(plan, task2.id);
      own.files = [.../* @__PURE__ */ new Set([...own.files, ...files])];
      plan = workflowPlanFacade.completeTask(plan, task2.id);
    }
    const commit2 = commitPlan(context, plan, {
      files,
      iteration: task2?.iteration,
      message: task2?.commitMessage ?? "chore: apply the project quality profile",
      role: "quality",
      scopeId: current.scope?.id ?? null,
      taskId: task2?.id ?? null
    });
    return { commit: commit2, config: applied.config, installs: applied.installs };
  });
}
function qualityStatus(context) {
  const config = workflowQualityFacade.readConfig(context.root);
  const checks = {};
  for (const check2 of config.quality.checks) {
    checks[check2.stage] = [...checks[check2.stage] ?? [], check2.id];
  }
  return {
    checks,
    drift: workflowQualityFacade.drift(context.root, config),
    stacks: config.quality.stacks,
    status: config.quality.status
  };
}
function repair(context, options = {}) {
  return locked(context, () => {
    if (options.apply) {
      return context.git.applyRepair(context.root, PLAN_PATH, options.apply);
    }
    if (options.cancel) {
      return context.git.cancelRepair(context.root, PLAN_PATH, options.cancel);
    }
    return context.git.planRepair(context.root, PLAN_PATH);
  });
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-scope-create.ts
function transition(context) {
  return {
    baselineCommit: requireHead(context),
    now: context.now(),
    qualityConfigured: readConfig(context).quality.status === "CONFIGURED"
  };
}
function ensureInputChecks(context, tasks) {
  workflowQualityFacade.ensurePlannedChecks(
    readConfig(context),
    (tasks ?? []).map((task2, index) => ({
      checks: task2.checks ?? [],
      field: `tasks[${index}].checks`,
      taskId: task2.id ?? null
    }))
  );
}
function change(plan, commit2) {
  return { commit: commit2, revision: plan.revision, scopeId: plan.scope?.id ?? null };
}
function commitScope(context, input) {
  ensureNoTransaction(context);
  const plan = workflowPlanFacade.createScope(
    readPlan(context),
    input,
    transition(context)
  );
  ensureInputChecks(context, input.tasks);
  ensureContextBudget(context, plan, plan.tasks);
  const documents2 = changedDocuments(context, [
    input.spec,
    ...(input.context ?? []).map((ref) => ref.path)
  ]);
  const commit2 = commitPlan(context, plan, {
    files: documents2,
    message: `docs: plan scope ${input.id}`,
    role: "scope-plan",
    scopeId: input.id,
    taskId: null
  });
  workflowExecutionModeFacade.clear(context.root);
  return change(plan, commit2);
}
function createScope2(context, input) {
  return locked(context, () => {
    ensure(
      readConfig(context).host !== "harness",
      "EXECUTION_MODE_REQUIRED",
      "In a Harness project the user chooses the execution mode; propose the scope instead of creating it.",
      {},
      'Run `scripts/workflow scope:propose --input <file.json> --recommended sequential|orchestrated --reason "<why>"` and end the turn.'
    );
    return commitScope(context, input);
  });
}
function withExecution(input, strategy, ownerSession, note) {
  const maxWorkers = input.execution?.maxWorkers;
  return {
    ...structuredClone(input),
    ...note === null ? {} : { approval: `${input.approval} | ${note}` },
    execution: {
      ...maxWorkers === void 0 ? {} : { maxWorkers },
      ownerSession,
      strategy
    }
  };
}
function proposeScope(context, request) {
  return locked(context, () => {
    ensureNoTransaction(context);
    const candidate = workflowPlanFacade.createScope(
      readPlan(context),
      withExecution(request.input, request.recommended, null, null),
      transition(context)
    );
    ensureInputChecks(context, request.input.tasks);
    ensureContextBudget(context, candidate, candidate.tasks);
    const proposal = workflowExecutionModeFacade.nextProposal(context.root, {
      hasParallelWork: workflowPlanFacade.hasParallelWork(candidate),
      input: request.input,
      now: context.now(),
      reason: request.reason,
      recommended: request.recommended
    });
    const answer = {
      generation: proposal.generation,
      hasParallelWork: proposal.hasParallelWork,
      options: proposal.options,
      reason: proposal.reason,
      recommended: proposal.recommended
    };
    const previous = workflowExecutionModeFacade.readProposal(context.root);
    if (previous?.refining === true && !proposal.hasParallelWork) {
      const scope = commitScope(
        context,
        withExecution(
          request.input,
          "sequential",
          null,
          "Execution mode chosen automatically: sequential (no parallel work after the specification was refined)"
        )
      );
      return { ...answer, autoChosen: true, scope };
    }
    workflowExecutionModeFacade.writeProposal(context.root, proposal);
    return { ...answer, autoChosen: false, scope: null };
  });
}
function chooseScope(context, request) {
  return locked(context, () => {
    ensureNoTransaction(context);
    const choice2 = { ...request, now: context.now() };
    const proposal = workflowExecutionModeFacade.verifyChoice(
      context.root,
      choice2
    );
    if (request.option === "refine") {
      workflowExecutionModeFacade.refine(context.root, proposal, choice2);
      return {
        execution: null,
        generation: proposal.generation,
        option: "refine",
        refining: true,
        scope: null
      };
    }
    const scope = commitScope(
      context,
      withExecution(
        proposal.input,
        request.option,
        request.session.trim(),
        `Execution mode chosen by the user: ${request.option}: ${request.note.trim()}`
      )
    );
    return {
      execution: workflowPlanFacade.execution(readPlan(context)),
      generation: proposal.generation,
      option: request.option,
      refining: false,
      scope
    };
  });
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-scope.ts
var PATCH_FIELDS = /* @__PURE__ */ new Set([
  "acceptance",
  "checks",
  "commitMessage",
  "context",
  "dependencies",
  "docsWaiver",
  "files",
  "title",
  "why"
]);
var IN_PROGRESS_FIELDS = /* @__PURE__ */ new Set([
  "acceptance",
  "checks",
  "docsWaiver",
  "files"
]);
function extendScope(context, input, expectedRevision) {
  return locked(context, () => {
    ensureNoTransaction(context);
    const current = readPlan(context);
    ensureRevision(current, expectedRevision);
    const result2 = workflowPlanFacade.extend(
      current,
      input,
      transition(context)
    );
    ensureInputChecks(context, input.tasks);
    ensureContextBudget(
      context,
      result2.plan,
      changedContextTasks(current, result2.plan)
    );
    const commit2 = commitPlan(context, result2.plan, {
      files: [],
      message: `docs: extend scope ${current.scope?.id ?? "NONE"} (${result2.roundId})`,
      role: "scope-plan",
      scopeId: current.scope?.id ?? null,
      taskId: null
    });
    return {
      ...change(result2.plan, commit2),
      deferredDocsTaskId: result2.deferredDocsTaskId,
      roundId: result2.roundId
    };
  });
}
function updateTask(context, taskId, patch, expectedRevision) {
  return locked(context, () => {
    ensureNoTransaction(context);
    const current = readPlan(context);
    ensureRevision(current, expectedRevision);
    const original = workflowPlanFacade.task(current, taskId);
    const fields = Object.keys(patch);
    ensure(
      fields.length > 0 && fields.every((field4) => PATCH_FIELDS.has(field4)),
      "TASK_PATCH",
      `task:update changes only: ${[...PATCH_FIELDS].join(", ")}.`
    );
    ensure(
      original.status === "TODO" || original.status === "IN_PROGRESS" && fields.every((field4) => IN_PROGRESS_FIELDS.has(field4)),
      "TASK_PATCH",
      original.status === "DONE" ? "A DONE task never changes; extend the plan with a fix task." : `A task in progress changes only: ${[...IN_PROGRESS_FIELDS].join(", ")}.`
    );
    const plan = structuredClone(current);
    plan.revision += 1;
    Object.assign(
      workflowPlanFacade.task(plan, taskId),
      structuredClone(patch)
    );
    workflowPlanFacade.validate(plan);
    if (patch.checks !== void 0) {
      workflowQualityFacade.ensurePlannedChecks(readConfig(context), [
        { checks: patch.checks, field: "checks", taskId }
      ]);
    }
    ensureContextBudget(context, plan, [workflowPlanFacade.task(plan, taskId)]);
    const commit2 = commitPlan(context, plan, {
      files: [],
      message: `docs: update task ${taskId}`,
      role: "scope-plan",
      scopeId: plan.scope?.id ?? null,
      taskId: null
    });
    return change(plan, commit2);
  });
}
function acceptScope2(context, note) {
  return locked(context, () => {
    ensureNoTransaction(context);
    const plan = workflowPlanFacade.accept(
      readPlan(context),
      note,
      context.now()
    );
    const commit2 = commitPlan(context, plan, {
      files: [],
      message: `chore: accept scope ${plan.scope?.id ?? "NONE"}`,
      role: "acceptance",
      scopeId: plan.scope?.id ?? null,
      taskId: null
    });
    return change(plan, commit2);
  });
}
function closeScope2(context, scopeId, note) {
  return locked(context, () => {
    ensureNoTransaction(context);
    const dirty = context.git.changes(context.root).all.filter((file4) => !context.git.isKitManagedPath(file4));
    ensure(
      dirty.length === 0,
      "DIRTY_TREE",
      "Close the scope on a clean working tree.",
      { paths: dirty }
    );
    const plan = workflowPlanFacade.close(
      readPlan(context),
      scopeId,
      note,
      context.now()
    );
    const commit2 = commitPlan(context, plan, {
      files: [],
      message: `chore: close scope ${scopeId}`,
      role: "close",
      scopeId,
      taskId: null
    });
    workflowExecutionModeFacade.clear(context.root);
    return change(plan, commit2);
  });
}
function carryoverScope2(context, input) {
  return locked(context, () => {
    ensureNoTransaction(context);
    const plan = workflowPlanFacade.carryover(
      readPlan(context),
      input,
      transition(context)
    );
    const commit2 = commitPlan(context, plan, {
      files: [],
      message: `chore: carry over into scope ${input.id}`,
      role: "carryover",
      scopeId: input.id,
      taskId: null
    });
    return change(plan, commit2);
  });
}
function setBlocked(context, reason) {
  return locked(context, () => {
    ensureNoIntegration(context);
    const current = readPlan(context);
    const plan = reason === null ? workflowPlanFacade.unblock(current) : workflowPlanFacade.block(current, reason);
    savePlan(context, plan);
    return change(plan, null);
  });
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-task.ts
function briefOf(task2) {
  const { id, kind, roundId, status, title } = task2;
  return { id, kind, roundId, status, title };
}
function hasCommitChecks(config) {
  return config.quality.checks.some(
    (check2) => check2.stage === "commit" && check2.command
  );
}
function ensureMainMayStart(context, plan, task2) {
  if (workflowPlanFacade.execution(plan).strategy !== "orchestrated") {
    return;
  }
  ensure(
    task2.kind !== "work" && task2.kind !== "docs",
    "ORCHESTRATED_MAIN_READ_ONLY",
    `${task2.id} runs only through an assignment in an orchestrated scope.`,
    {},
    `Run \`scripts/workflow assignment:next\`, then \`scripts/workflow assignment:create --task ${task2.id}\`.`
  );
  if (task2.kind !== "delivery") {
    return;
  }
  const index = plan.tasks.indexOf(task2);
  const pending = plan.tasks.filter((item, position) => position < index && item.status !== "DONE").map((item) => item.id);
  const active = activeRecords(plan, context.root).map((record) => record.id);
  ensure(
    pending.length === 0 && active.length === 0,
    "DELIVERY_NOT_READY",
    `${task2.id} starts when every earlier task is DONE and no assignment is active.`,
    { active, pending }
  );
}
function startTask2(context, taskId, confirmation) {
  return locked(context, () => {
    ensureNoTransaction(context);
    ensureNotPaused(context);
    const current = readPlan(context);
    const config = readConfig(context);
    const task2 = workflowPlanFacade.task(current, taskId);
    ensureMainMayStart(context, current, task2);
    ensureAssignmentReady(context);
    workflowQualityFacade.selectChecks({
      assigned: task2.checks,
      config,
      root: context.root,
      stage: "commit"
    });
    const plan = workflowPlanFacade.startTask(current, taskId, confirmation);
    const baseline = context.git.beginTask(context.root, {
      iteration: task2.iteration,
      scopeId: plan.scope?.id ?? "NONE",
      taskId
    });
    savePlan(context, plan);
    markAssignment(context, "RUNNING");
    const warnings = [];
    const limit = config.policy.taskFileSoftLimit;
    const functional = task2.files.filter((file4) => !isDocumentationPath(file4));
    if (limit !== null && functional.length > limit) {
      warnings.push(
        `The task lists ${functional.length} functional files (soft limit ${limit}); consider splitting it.`
      );
    }
    return {
      preexisting: baseline.preexisting,
      task: briefOf(workflowPlanFacade.task(plan, taskId)),
      warnings
    };
  });
}
function storePrepareEvidence(context, sha, prepare2) {
  const stored = workflowQualityFacade.readEvidence(context.root, sha);
  const evidence = {
    commit: sha,
    reports: [prepare2, ...stored?.reports ?? []],
    transaction: stored?.transaction ?? null
  };
  const text3 = `${JSON.stringify(evidence, null, 2)}
`;
  for (const name of [`${sha}.json`, "last.json"]) {
    workflowPlatformFacade.writeFileAtomic(
      context.git.localPath(context.root, "verification", name),
      text3
    );
  }
}
function runPrepare(context, config, task2, files) {
  if (!config.quality.checks.some((check2) => check2.stage === "prepare")) {
    return null;
  }
  const report = workflowQualityFacade.runStage({
    assigned: task2.checks,
    config,
    env: context.env,
    files,
    // Staging will skip these paths: fixers never get the copies on disk.
    removed: context.git.absentPaths(context.root, files),
    root: context.root,
    stage: "prepare"
  });
  if (!report.ok) {
    throw new WorkflowError(
      "CHECK_FAILED",
      "A prepare check failed; nothing was committed.",
      { report },
      "Fix the reported problem and repeat the same command."
    );
  }
  return report;
}
function commitTask(context, taskId, options = {}) {
  return locked(context, () => {
    ensureNoTransaction(context);
    const current = readPlan(context);
    const config = readConfig(context);
    const task2 = workflowPlanFacade.task(current, taskId);
    ensure(
      task2.status === "IN_PROGRESS",
      "TASK_NOT_ACTIVE",
      `Start the task first: task:start ${taskId}`
    );
    ensure(
      task2.kind !== "quality",
      "USE_QUALITY_APPLY",
      "The QUALITY task is completed by `quality:apply`."
    );
    ensure(
      task2.kind !== "docs" || Boolean(options.digest),
      "ROUND_DIGEST_REQUIRED",
      `${taskId} closes its round: pass the round digest with --digest <file.json>.`
    );
    const identity = {
      iteration: task2.iteration,
      scopeId: current.scope?.id ?? "NONE",
      taskId
    };
    const selection = context.git.selectTaskFiles(
      context.root,
      identity,
      options.files
    );
    const functional = selection.selected.filter(
      (file4) => !isDocumentationPath(file4)
    );
    ensure(
      functional.length === 0 || hasCommitChecks(config),
      "NOT_CONFIGURED",
      "Functional files need at least one commit-stage check in the quality profile.",
      { files: functional },
      "Configure the profile with `quality:apply`."
    );
    const withFiles = structuredClone(current);
    const own = workflowPlanFacade.task(withFiles, taskId);
    own.files = [.../* @__PURE__ */ new Set([...own.files, ...selection.selected])];
    const plan = workflowPlanFacade.completeTask(
      withFiles,
      taskId,
      options.digest ?? null
    );
    guardExecutorCommit(
      context,
      [...selection.selected, PLAN_PATH],
      workflowPlanFacade.render(plan)
    );
    const prepare2 = runPrepare(context, config, task2, selection.selected);
    const commit2 = commitPlan(context, plan, {
      assignmentId: executorAssignment(context)?.id ?? null,
      checks: task2.checks,
      excluded: selection.excluded,
      files: selection.selected,
      iteration: task2.iteration,
      message: task2.commitMessage,
      role: task2.kind === "docs" ? "docs" : "implementation",
      scopeId: current.scope?.id ?? null,
      taskId
    });
    if (prepare2) {
      storePrepareEvidence(context, commit2.sha, prepare2);
    }
    markAssignment(context, "READY_FOR_INTEGRATION", commit2.sha);
    return {
      commit: commit2,
      nextTask: readStatus(context).nextTask,
      preexisting: selection.preexisting,
      prepare: prepare2
    };
  });
}
function commitDocs(context, files, message = "docs: update documentation") {
  return locked(context, () => {
    ensureNoTransaction(context);
    const plan = readPlan(context);
    ensure(
      plan.currentTaskId === null,
      "TASK_IN_PROGRESS",
      `Task ${plan.currentTaskId} is in progress; its documents go into its commit.`
    );
    const paths = files.map(
      (file4) => workflowPlatformFacade.normalizeRelative(file4)
    );
    const code = paths.filter((file4) => !isDocumentationPath(file4));
    ensure(
      paths.length > 0 && code.length === 0,
      "DOCS_ONLY",
      "docs:commit takes documentation only: Markdown files and .harness/product-tree/**.",
      { paths: code }
    );
    return commitPlan(context, plan, {
      files: paths,
      message,
      role: "docs",
      scopeId: plan.scope?.id ?? null,
      taskId: null
    });
  });
}

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-facade.ts
var WorkflowKitFacade = class extends WorkflowKitBase {
  /** `pause:set --on|--off --note`: the user's pause of the workflow. */
  setPause(root, paused, note) {
    return setPause(this.context(root), paused, note);
  }
  createScope(root, input) {
    return createScope2(this.context(root), input);
  }
  /** `scope:propose`: validates the plan and stores the proposal of the mode card. */
  proposeScope(root, input, recommended, reason) {
    return proposeScope(this.context(root), { input, reason, recommended });
  }
  /** `scope:choose`: the user's answer to the proposal of `generation`. */
  chooseScope(root, choice2) {
    return chooseScope(this.context(root), choice2);
  }
  /** The stored scope proposal, or `null`. */
  readProposal(root) {
    return workflowExecutionModeFacade.readProposal(root);
  }
  /** `assignment:next`: the tasks that can be handed out now and the active assignments. */
  nextAssignments(root) {
    return nextAssignments(this.context(root));
  }
  /** `assignment:create --task`: a new assignment record and the executor brief. */
  createAssignment(root, taskId) {
    return createAssignment(this.context(root), taskId);
  }
  /** `scope:proposal`: the read-only card view of the stored proposal, or `null`. */
  proposalView(root) {
    const proposal = this.readProposal(root);
    if (!proposal) {
      return null;
    }
    const input = proposal.input;
    return {
      createdAt: proposal.createdAt,
      generation: proposal.generation,
      hasParallelWork: proposal.hasParallelWork,
      host: readConfig(this.context(root)).host ?? null,
      objective: typeof input?.objective === "string" ? input.objective : null,
      options: [...proposal.options],
      reason: proposal.reason,
      recommended: proposal.recommended,
      refining: proposal.refining,
      scopeId: typeof input?.id === "string" ? input.id : null
    };
  }
  /** `assignment:attach <id>` in the executor worktree: executor plan and records. */
  attachAssignment(root, id) {
    return attachAssignment(this.context(root), id);
  }
  /** `assignment:status` in the executor worktree. */
  assignmentStatus(root) {
    return assignmentStatus(this.context(root));
  }
  /** `assignment:setup [--id]`: the stack install of an executor worktree (spec 5.4). */
  setupAssignment(root, id) {
    return setupAssignment2(this.context(root), id);
  }
  /** `assignment:cleanup [--id]` in main: worktree and branch removal after integration. */
  cleanupAssignments(root, id) {
    return cleanupAssignments(this.context(root), id);
  }
  /** `assignment:cancel --id [--force]` in main: drops a stuck assignment; the task stays TODO. */
  cancelAssignment(root, id, force = false) {
    return cancelAssignment2(this.context(root), id, force);
  }
  /** `integration:start --id --source` in main: merge, plan candidate and integration commit. */
  startIntegration(root, assignmentId2, source) {
    return startIntegration2(this.context(root), assignmentId2, source);
  }
  /** `integration:continue --id`: finishes an unfinished integration. */
  continueIntegration(root, assignmentId2) {
    return continueIntegration2(this.context(root), assignmentId2);
  }
  /** `integration:status`: IDLE or the phase of the integration journal. */
  integrationStatus(root) {
    return integrationStatus(this.context(root));
  }
  /** The executor record of the checkout; null outside an executor worktree. */
  executorAssignment(root) {
    return executorAssignment(this.context(root));
  }
  extend(root, input, expectedRevision) {
    return extendScope(this.context(root), input, expectedRevision);
  }
  updateTask(root, taskId, patch, expectedRevision) {
    return updateTask(this.context(root), taskId, patch, expectedRevision);
  }
  accept(root, note) {
    return acceptScope2(this.context(root), note);
  }
  close(root, scopeId, note) {
    return closeScope2(this.context(root), scopeId, note);
  }
  carryover(root, input) {
    return carryoverScope2(this.context(root), input);
  }
  block(root, reason) {
    return setBlocked(this.context(root), reason);
  }
  unblock(root) {
    return setBlocked(this.context(root), null);
  }
  startTask(root, taskId, confirmation = null) {
    return startTask2(this.context(root), taskId, confirmation);
  }
  commitTask(root, taskId, options = {}) {
    return commitTask(this.context(root), taskId, options);
  }
  commitDocs(root, files, message) {
    return commitDocs(this.context(root), files, message);
  }
  qualityDetect(root, stacks) {
    return detectQuality(this.context(root), stacks);
  }
  qualityApply(root, input) {
    return applyQuality(this.context(root), input);
  }
  qualityStatus(root) {
    return qualityStatus(this.context(root));
  }
  /** `git-hook <name>`: handlers of the managed git hooks. */
  gitHook(root, name, args = []) {
    return runGitHook(this.context(root), name, args);
  }
  repair(root, options = {}) {
    return repair(this.context(root), options);
  }
};
var workflowKitFacade = new WorkflowKitFacade();

// product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-cli.ts
var EVENTS2 = /* @__PURE__ */ new Set(["startup", "resume", "clear", "compact"]);
function resolvePath(io, value) {
  return path25.resolve(io.cwd, value ?? ".");
}
function ownBundle(args, io) {
  return {
    bundle: readFileSync11(
      resolvePath(io, flag(args, "bundle") ?? fileURLToPath(import.meta.url)),
      "utf8"
    ),
    runtime: {
      executable: process.execPath,
      mode: process.versions.electron ? "electron" : "node"
    }
  };
}
var COMMANDS = {
  ...EXECUTION_COMMANDS,
  ...ASSIGNMENT_COMMANDS,
  ...INTEGRATION_COMMANDS,
  ...IDENTITY_COMMANDS,
  ...PAUSE_COMMANDS,
  ...SCHEMA_COMMANDS,
  ...CONTEXT_COMMANDS,
  ...SCOPE_COMMANDS,
  "autopilot:status": {
    run: ({ kit, root }) => kit.autopilotStatus(root),
    usage: "autopilot:status"
  },
  commit: {
    run: ({ args, io, kit, root }) => {
      const digest = flag(args, "digest");
      return kit.commitTask(root, requiredFlag(args, "task"), {
        digest: digest ? readJsonFile(io.cwd, digest) : null,
        files: listFlag(args, "files")
      });
    },
    usage: "commit --task <ID> [--files <json|a,b>] [--digest <file.json>]"
  },
  "docs:commit": {
    run: ({ args, kit, root }) => {
      const files = listFlag(args, "files");
      if (!files) {
        throw new WorkflowError("USAGE", "--files is required.");
      }
      return kit.commitDocs(root, files, flag(args, "message"));
    },
    usage: 'docs:commit --files <json|a,b> [--message "docs: ..."]'
  },
  inspect: {
    run: ({ args, io, kit }) => kit.inspect(resolvePath(io, args.positionals[0])),
    usage: "inspect [<path>]"
  },
  doctor: {
    run: ({ args, io, kit }) => kit.doctor(resolvePath(io, args.positionals[0]), {
      fix: args.flags.get("fix") === true ? ownBundle(args, io) : null
    }),
    usage: "doctor [<path>] [--fix] [--bundle <workflow.mjs>]"
  },
  install: {
    run: ({ args, io, kit }) => kit.install(resolvePath(io, args.positionals[0]), {
      ...ownBundle(args, io),
      // The installer refuses any other value with USAGE.
      host: flag(args, "host"),
      name: flag(args, "name"),
      update: args.flags.get("update") === true
    }),
    usage: "install [<path>] [--name <project name>] [--update] [--host harness] [--bundle <workflow.mjs>]"
  },
  history: {
    run: ({ args, kit, root }) => kit.history(root, {
      round: flag(args, "round"),
      task: flag(args, "task")
    }),
    usage: "history [--task <ID>] [--round <R>]"
  },
  "migrate:harness-plan": {
    run: ({ args, io, kit }) => kit.migrateHarnessPlan(resolvePath(io, args.positionals[0]), {
      message: flag(args, "message"),
      name: flag(args, "name"),
      objective: flag(args, "objective"),
      spec: flag(args, "spec") ?? null
    }),
    usage: 'migrate:harness-plan [<path>] [--message "chore: ..."] [--objective "..."] [--spec <doc.md>] [--name <project name>]'
  },
  "quality:apply": {
    run: ({ args, io, kit, root }) => kit.qualityApply(
      root,
      readJsonFile(io.cwd, requiredFlag(args, "input"))
    ),
    usage: "quality:apply --input <profile.json>"
  },
  "quality:detect": {
    run: ({ args, kit, root }) => kit.qualityDetect(root, listFlag(args, "stack")),
    usage: "quality:detect [--stack node,python]"
  },
  "quality:status": {
    run: ({ kit, root }) => kit.qualityStatus(root),
    usage: "quality:status"
  },
  recover: {
    run: ({ args, kit, root }) => {
      const event = flag(args, "event") ?? "startup";
      if (!EVENTS2.has(event)) {
        throw new WorkflowError(
          "USAGE",
          "--event is startup, resume, clear or compact."
        );
      }
      return kit.recover(root, event);
    },
    usage: "recover [--event startup|resume|clear|compact]"
  },
  repair: {
    run: ({ args, kit, root }) => kit.repair(root, {
      apply: flag(args, "apply"),
      cancel: flag(args, "cancel")
    }),
    usage: "repair [--apply <repairId> | --cancel <repairId>]"
  },
  "show-task": {
    run: ({ args, kit, root }) => ({
      text: kit.showTask(root, positional(args, 0, "Task id"))
    }),
    usage: "show-task <ID>"
  },
  status: {
    run: ({ kit, root }) => kit.status(root),
    usage: "status"
  },
  "task:start": {
    run: ({ args, kit, root }) => kit.startTask(
      root,
      positional(args, 0, "Task id"),
      flag(args, "confirmed") ?? null
    ),
    usage: 'task:start <ID> [--confirmed "<user confirmation>"]'
  },
  validate: {
    run: ({ kit, root }) => kit.validate(root),
    usage: "validate"
  }
};
function helpText() {
  const lines = Object.entries(COMMANDS).sort(([left], [right]) => left.localeCompare(right)).map(([, spec]) => `  scripts/workflow ${spec.usage}`);
  return [
    "Workflow Kit \u2014 the project development process.",
    "",
    "Usage:",
    ...lines,
    "  scripts/workflow hook session-start --client claude|codex [--part K/N]",
    "  scripts/workflow git-hook <pre-commit|commit-msg|post-commit|pre-push> [args]",
    "",
    "Options: --format json|text (default json; text for context), --root <project>.",
    'Errors: {"ok":false,"code","message","nextAction"} and exit code 1.',
    ""
  ].join("\n");
}
function projectRoot(args, io, kit) {
  const explicit = flag(args, "root") ?? io.env.HARNESS_WORKFLOW_ROOT;
  if (explicit) {
    return explicit;
  }
  return kit.git.isRepository(io.cwd) ? kit.git.topLevel(io.cwd) : io.cwd;
}
function errorEnvelope(error2) {
  if (error2 instanceof WorkflowError) {
    return {
      code: error2.code,
      details: error2.details,
      message: error2.message,
      nextAction: error2.nextAction ?? null,
      ok: false
    };
  }
  return {
    code: "INTERNAL",
    message: error2?.message ?? String(error2),
    nextAction: null,
    ok: false
  };
}
function dispatch(args, io, kit, format) {
  const command = args.command ?? "help";
  const root = projectRoot(args, io, kit);
  if (command === "hook" || command === "git-hook") {
    return runHook(args, io, kit, root);
  }
  const spec = COMMANDS[command];
  if (!spec) {
    throw new WorkflowError(
      "UNKNOWN_COMMAND",
      `Unknown command: ${command}`,
      {},
      "Run `scripts/workflow help`."
    );
  }
  ensureExecutorCommand(kit, root, command);
  const result2 = spec.run({ args, io, kit, root });
  let text3 = `${JSON.stringify({ command, ok: true, result: result2 }, null, 2)}
`;
  if (format === "text") {
    text3 = spec.text ? spec.text(result2) : renderText(command, result2);
  }
  io.stdout(text3);
  return 0;
}
function writeFailure(io, error2, format) {
  const envelope = errorEnvelope(error2);
  if (format === "text") {
    io.stderr(
      `${envelope.code}: ${envelope.message}${envelope.nextAction ? `
Next: ${envelope.nextAction}` : ""}
`
    );
  } else {
    io.stdout(`${JSON.stringify(envelope, null, 2)}
`);
  }
}
function runCli(argv, io, kit) {
  const facade = kit ?? new WorkflowKitFacade({ env: io.env });
  let format = "json";
  try {
    const args = parseArgs(argv);
    format = flag(args, "format") ?? COMMANDS[args.command ?? ""]?.defaultFormat ?? "json";
    const wantsHelp = args.command === "help" || args.flags.get("help") === true;
    if (!args.command || wantsHelp) {
      io.stdout(helpText());
      return wantsHelp ? 0 : 1;
    }
    return dispatch(args, io, facade, format);
  } catch (error2) {
    writeFailure(io, error2, format);
    return 1;
  }
}
function readProcessStdin() {
  if (process.stdin.isTTY) {
    return "";
  }
  try {
    return readFileSync11(0, "utf8");
  } catch {
    return "";
  }
}
function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return pathToFileURL(realpathSync4(entry)).href === import.meta.url;
  } catch {
    return false;
  }
}
if (invokedDirectly()) {
  process.exitCode = runCli(process.argv.slice(2), {
    cwd: process.cwd(),
    env: process.env,
    readStdin: readProcessStdin,
    stderr: (text3) => process.stderr.write(text3),
    stdout: (text3) => process.stdout.write(text3)
  });
}
export {
  runCli
};
