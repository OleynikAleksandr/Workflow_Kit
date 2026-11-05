import { accessSync, chmodSync, closeSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-platform/src/workflow-error.ts
/**
* Structured error of every Workflow Kit module. The CLI renders it as
* `{ok:false, code, message, nextAction, details}`.
*/
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
/** Throws a WorkflowError when the condition is false. */
function ensure(condition, code, message, details = {}, nextAction = null) {
	if (!condition) throw new WorkflowError(code, message, details, nextAction);
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-platform/src/platform-fs.ts
var RETRYABLE_CODES = /* @__PURE__ */ new Set([
	"EPERM",
	"EBUSY",
	"EACCES"
]);
var RENAME_ATTEMPTS = 5;
var RENAME_BASE_DELAY_MS = 20;
var DEFAULT_LOCK_STALE_MS = 600 * 1e3;
var sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
var WorkflowLockError = class extends WorkflowError {
	constructor(message) {
		super("LOCKED", message, {}, "Wait for the running workflow operation to finish.");
	}
};
function sleepSync(milliseconds) {
	Atomics.wait(sleepBuffer, 0, 0, milliseconds);
}
function errorCode(error) {
	return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
}
function renameWithRetry(from, to) {
	for (let attempt = 1;; attempt += 1) try {
		renameSync(from, to);
		return;
	} catch (error) {
		if (!RETRYABLE_CODES.has(errorCode(error)) || attempt >= RENAME_ATTEMPTS) throw error;
		sleepSync(RENAME_BASE_DELAY_MS * attempt);
	}
}
/** Writes through a temporary sibling and a rename so readers never see partial files. */
function atomicWriteFile(filePath, data, options = {}) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	try {
		writeFileSync(temporary, data, options.mode === void 0 ? {} : { mode: options.mode });
		renameWithRetry(temporary, filePath);
	} finally {
		if (existsSync(temporary)) rmSync(temporary, { force: true });
	}
}
function readTextIfExists(filePath) {
	return existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
}
function processAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return errorCode(error) === "EPERM";
	}
}
function lockIsStale(lockPath, staleMs) {
	try {
		const owner = JSON.parse(readFileSync(lockPath, "utf8"));
		return Date.now() - statSync(lockPath).mtimeMs > staleMs || typeof owner.pid !== "number" || !processAlive(owner.pid);
	} catch {
		return true;
	}
}
function acquireLock(lockPath, staleMs) {
	mkdirSync(path.dirname(lockPath), { recursive: true });
	try {
		return openSync(lockPath, "wx");
	} catch (error) {
		if (errorCode(error) !== "EEXIST") throw error;
		if (!lockIsStale(lockPath, staleMs)) throw new WorkflowLockError("Another workflow operation is running.");
		rmSync(lockPath, { force: true });
		return openSync(lockPath, "wx");
	}
}
/** Runs fn while holding an exclusive lock file; stale locks are reclaimed. */
function withFileLock(lockPath, fn, options = {}) {
	const descriptor = acquireLock(lockPath, options.staleMs ?? DEFAULT_LOCK_STALE_MS);
	try {
		writeSync(descriptor, JSON.stringify({
			at: (/* @__PURE__ */ new Date()).toISOString(),
			pid: process.pid
		}));
		return fn();
	} finally {
		closeSync(descriptor);
		rmSync(lockPath, { force: true });
	}
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-platform/src/platform-launchers.ts
/** Project-relative location of the bundled Workflow Kit inside a project. */
var KIT_BUNDLE_PATH = ".harness/workflow/runtime/workflow.mjs";
var MISSING_RUNTIME_MESSAGE = "Workflow Kit needs Node.js 22+ (or open the project in Harness AI once).";
var VERSION_CHECK = "process.exit(Number(process.versions.node.split('.')[0])>=22?0:1)";
/** POSIX sh launcher (`scripts/workflow`); also used by Git for Windows hooks. */
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
/** PowerShell launcher (`scripts/workflow.ps1`). */
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
/** CMD launcher (`scripts/workflow.cmd`): delegates to the PowerShell launcher. */
function cmdLauncher() {
	return [
		"@echo off",
		"rem Managed by Harness Workflow Kit. Do not edit.",
		"powershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0workflow.ps1\" %*",
		"exit /b %ERRORLEVEL%",
		""
	].join("\r\n");
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-platform/src/platform-paths.ts
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
function currentWorkflowPlatform() {
	if (process.platform === "win32" || process.platform === "darwin") return process.platform;
	return "linux";
}
function isCaseInsensitivePlatform(platform) {
	return platform === "win32" || platform === "darwin";
}
/** Converts any OS-style path to forward slashes without resolving it. */
function toPosixPath(value) {
	return value.replace(BACKSLASH_PATTERN, "/");
}
/**
* Normalizes a project-relative path into the canonical POSIX form stored in
* plans, manifests and configuration. Rejects absolute paths, drive letters,
* parent traversal and empty segments.
*/
function normalizeRelativePath(value) {
	if (typeof value !== "string" || value.trim() === "") throw new WorkflowPathError("Path must be a non-empty string.", String(value));
	const posix = toPosixPath(value.trim()).replace(DUPLICATE_SLASH_PATTERN, "/").replace(LEADING_DOT_SLASH_PATTERN, "").replace(TRAILING_SLASH_PATTERN, "");
	if (posix.startsWith("/") || DRIVE_LETTER_PATTERN.test(posix)) throw new WorkflowPathError("Path must be relative to the project.", value);
	if (posix.split("/").some((segment) => segment === ".." || segment === "" || segment === ".")) throw new WorkflowPathError("Path must stay inside the project.", value);
	return posix;
}
/** Resolves a canonical relative path to an absolute OS path inside root. */
function resolveInside(root, relativePath) {
	const normalized = normalizeRelativePath(relativePath);
	const resolved = path.resolve(root, ...normalized.split("/"));
	const relative = path.relative(path.resolve(root), resolved);
	if (relative.startsWith("..") || path.isAbsolute(relative)) throw new WorkflowPathError("Path escapes the project root.", relativePath);
	return resolved;
}
/** Converts an absolute path inside root into the canonical relative form. */
function relativeFromRoot(root, absolutePath) {
	const relative = path.relative(path.resolve(root), path.resolve(absolutePath));
	if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) throw new WorkflowPathError("Path is not inside the project root.", absolutePath);
	return normalizeRelativePath(relative);
}
function samePath(left, right, platform) {
	const a = toPosixPath(left).replace(TRAILING_SLASH_PATTERN, "");
	const b = toPosixPath(right).replace(TRAILING_SLASH_PATTERN, "");
	return isCaseInsensitivePlatform(platform) ? a.toLowerCase() === b.toLowerCase() : a === b;
}
/** True when the relative path equals the prefix or lies below it. */
function isWithin(relativePath, prefix) {
	const value = normalizeRelativePath(relativePath);
	const base = normalizeRelativePath(prefix);
	return value === base || value.startsWith(`${base}/`);
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-platform/src/platform-process.ts
var CMD_META_PATTERN = /([()\][%!^"`<>&|;, *?])/gu;
var QUOTE_WITH_BACKSLASHES_PATTERN = /(\\*)"/gu;
var TRAILING_BACKSLASHES_PATTERN = /(\\*)$/u;
var BATCH_EXTENSION_PATTERN = /\.(?:cmd|bat)$/iu;
var DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD";
var MAX_BUFFER = 64 * 1024 * 1024;
function pathEntries(env, platform) {
	return (env.PATH ?? env.Path ?? "").split(platform === "win32" ? ";" : ":").filter(Boolean);
}
function isExecutableFile(file, platform) {
	try {
		if (!statSync(file).isFile()) return false;
		if (platform !== "win32") accessSync(file, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}
/** Finds an executable on PATH (with PATHEXT on Windows); returns null when missing. */
function resolveExecutable(name, env, platform) {
	const hasDirectory = name.includes("/") || name.includes("\\");
	const extensions = platform === "win32" && path.extname(name) === "" ? (env.PATHEXT ?? DEFAULT_PATHEXT).toLowerCase().split(";").filter(Boolean) : [""];
	const directories = hasDirectory ? [""] : pathEntries(env, platform);
	for (const directory of directories) for (const extension of extensions) {
		const candidate = directory === "" ? `${name}${extension}` : path.join(directory, `${name}${extension}`);
		if (isExecutableFile(candidate, platform)) return candidate;
	}
	return null;
}
function escapeCmdArgument(value) {
	return `"${value.replace(QUOTE_WITH_BACKSLASHES_PATTERN, "$1$1\\\"").replace(TRAILING_BACKSLASHES_PATTERN, "$1$1")}"`.replace(CMD_META_PATTERN, "^$1").replace(CMD_META_PATTERN, "^$1");
}
/**
* Builds the spawn invocation. POSIX and Windows `.exe` run directly without a
* shell; Windows `.cmd`/`.bat` shims run through `cmd.exe /d /s /c` with
* escaped arguments.
*/
function buildInvocation(resolvedExecutable, args, platform) {
	if (platform !== "win32" || !BATCH_EXTENSION_PATTERN.test(resolvedExecutable)) return {
		args: [...args],
		file: resolvedExecutable,
		windowsVerbatimArguments: false
	};
	return {
		args: [
			"/d",
			"/s",
			"/c",
			`"${[resolvedExecutable.replace(CMD_META_PATTERN, "^$1"), ...args.map(escapeCmdArgument)].join(" ")}"`
		],
		file: "cmd.exe",
		windowsVerbatimArguments: true
	};
}
function prepare(request, platform) {
	const env = request.env ?? process.env;
	const resolved = resolveExecutable(request.executable, env, platform) ?? (existsSync(request.executable) ? request.executable : null);
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
function toResult(result) {
	const timedOut = result.error?.code === "ETIMEDOUT";
	return {
		errorMessage: result.error ? result.error.message : null,
		status: result.status,
		stderr: result.stderr ?? "",
		stdout: result.stdout ?? "",
		timedOut
	};
}
/** Runs a process synchronously without a shell. */
function runProcessSync(request, platform) {
	const { env, invocation } = prepare(request, platform);
	if (!invocation) return missing(request.executable);
	return toResult(spawnSync(invocation.file, invocation.args, {
		cwd: request.cwd,
		encoding: "utf8",
		env,
		input: request.input,
		maxBuffer: MAX_BUFFER,
		timeout: request.timeoutMs,
		windowsHide: true,
		windowsVerbatimArguments: invocation.windowsVerbatimArguments
	}));
}
/** Runs a process asynchronously without a shell; used by Core so its event loop never blocks. */
function runProcessAsync(request, platform) {
	const { env, invocation } = prepare(request, platform);
	if (!invocation) return Promise.resolve(missing(request.executable));
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
		child.on("error", (error) => {
			errorMessage = error.message;
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
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-platform/src/platform-runtime.ts
var MINIMUM_NODE_MAJOR = 22;
/** Project-relative file where Harness records the runtime it can lend to launchers. */
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
	return mode === "electron" ? {
		...rest,
		ELECTRON_RUN_AS_NODE: "1"
	} : rest;
}
function formatRuntimeFile(executable, mode) {
	return `${executable.replaceAll("\\", "/")}\n${mode}\n`;
}
function parseRuntimeFile(text) {
	const [executable, mode] = text.split(LINE_SPLIT_PATTERN).map((line) => line.trim());
	if (!executable) return null;
	return {
		executable,
		mode: mode === "electron" ? "electron" : "node"
	};
}
function runtimeCandidates(projectRoot, env, platform) {
	const candidates = [];
	if (env.HARNESS_WORKFLOW_NODE) candidates.push({
		executable: env.HARNESS_WORKFLOW_NODE,
		mode: "node",
		source: "env"
	});
	const recorded = projectRoot ? readTextIfExists(path.join(projectRoot, ...RUNTIME_FILE.split("/"))) : null;
	const parsed = recorded ? parseRuntimeFile(recorded) : null;
	if (parsed) candidates.push({
		...parsed,
		source: "runtime-file"
	});
	const onPath = resolveExecutable("node", env, platform);
	if (onPath) candidates.push({
		executable: onPath,
		mode: "node",
		source: "path"
	});
	for (const executable of OS_NODE_PATHS[platform]) candidates.push({
		executable,
		mode: "node",
		source: "os"
	});
	return candidates;
}
function probeRuntimeVersion(candidate, platform) {
	const result = runProcessSync({
		args: ["-e", VERSION_SCRIPT],
		env: runtimeEnvironment(candidate.mode, process.env),
		executable: candidate.executable,
		timeoutMs: 15e3
	}, platform);
	return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : null;
}
function satisfiesMinimum(version) {
	return Number(version.split(".")[0]) >= MINIMUM_NODE_MAJOR;
}
/** Returns the first candidate whose Node major version is at least 22. */
function resolveRuntime(candidates, probe) {
	for (const candidate of candidates) {
		const version = probe(candidate);
		if (version && satisfiesMinimum(version)) return {
			...candidate,
			version
		};
	}
	return null;
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-platform/src/workflow-platform-facade.ts
/**
* Public boundary of the workflow-platform module: OS-neutral paths, atomic
* files and locks. Every other project-workflow module reaches the
* filesystem and processes through this facade.
*/
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
	resolveRuntime(projectRoot, env = process.env, probe) {
		const check = probe ?? ((candidate) => probeRuntimeVersion(candidate, this.platform));
		return resolveRuntime(runtimeCandidates(projectRoot, env, this.platform), check);
	}
	runtimeEnvironment(mode, base = process.env) {
		return runtimeEnvironment(mode, base);
	}
	formatRuntimeFile(executable, mode) {
		return formatRuntimeFile(executable, mode);
	}
	parseRuntimeFile(text) {
		return parseRuntimeFile(text);
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
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-cli-args.ts
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
/** Splits `command positional… --flag value --flag=value --bool`. */
function parseArgs(argv) {
	const flags = /* @__PURE__ */ new Map();
	const positionals = [];
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index] ?? "";
		if (arg === "--") {
			positionals.push(...argv.slice(index + 1));
			break;
		}
		if (arg === "-h") flags.set("help", true);
		else if (arg.startsWith("--")) {
			const body = arg.slice(2);
			const equals = body.indexOf("=");
			if (equals !== -1) flags.set(body.slice(0, equals), body.slice(equals + 1));
			else if (BOOLEAN_FLAGS.has(body)) flags.set(body, true);
			else {
				const value = argv[index + 1];
				ensure(value !== void 0 && !value.startsWith("--"), "USAGE", `--${body} needs a value.`);
				flags.set(body, value);
				index += 1;
			}
		} else positionals.push(arg);
	}
	const [command = null, ...rest] = positionals;
	return {
		command,
		flags,
		positionals: rest
	};
}
function flag(args, name) {
	const value = args.flags.get(name);
	return typeof value === "string" ? value : void 0;
}
function requiredFlag(args, name) {
	const value = flag(args, name);
	ensure(value !== void 0 && value.trim() !== "", "USAGE", `--${name} is required.`);
	return value;
}
function positional(args, index, label) {
	const value = args.positionals[index];
	ensure(value !== void 0 && value !== "", "USAGE", `${label} is required.`);
	return value;
}
function integerFlag(args, name) {
	const value = flag(args, name);
	if (value === void 0) return;
	const parsed = Number(value);
	ensure(Number.isSafeInteger(parsed), "USAGE", `--${name} must be an integer.`);
	return parsed;
}
/** Reads a JSON input file relative to the working directory. */
function readJsonFile(cwd, file) {
	let text;
	try {
		text = readFileSync(path.resolve(cwd, file), "utf8");
	} catch (cause) {
		throw new WorkflowError("INPUT_UNREADABLE", `Cannot read ${file}: ${cause.message}`);
	}
	try {
		return JSON.parse(text);
	} catch (cause) {
		throw new WorkflowError("INPUT_JSON", `${file} is not valid JSON: ${cause.message}`);
	}
}
/** `--files` as a JSON array or a comma-separated list. */
function listFlag(args, name) {
	const value = flag(args, name);
	if (value === void 0) return;
	if (value.trim().startsWith("[")) try {
		const parsed = JSON.parse(value);
		ensure(Array.isArray(parsed) && parsed.every((item) => typeof item === "string"), "USAGE", `--${name} must list strings.`);
		return parsed;
	} catch (cause) {
		if (cause instanceof WorkflowError) throw cause;
		throw new WorkflowError("USAGE", `--${name} is not a valid JSON list.`);
	}
	return value.split(",").map((item) => item.trim()).filter(Boolean);
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-cli-assignment.ts
function nextText(value) {
	const result = value;
	if (result.idle !== null) {
		const why = result.idle === "NOT_ORCHESTRATED" ? "the scope is not orchestrated" : "the scope is not active";
		return `assignments: none (${result.idle}): ${why}.\n`;
	}
	const lines = [`assignments: scope ${result.scopeId ?? "NONE"}, ${result.active.length} of ${result.maxWorkers} workers active`];
	for (const record of result.active) lines.push(`active: ${record.taskId} ${record.id} ${record.status}`);
	for (const task of result.ready) lines.push(`ready: ${task.id} — ${task.title} (${task.parallelSafe ? "parallel" : "sequential"})`);
	for (const item of result.blocked) lines.push(`blocked: ${item.taskId} ${item.code} (waits for ${item.blockedBy.join(", ") || "none"})`);
	const first = result.ready[0];
	lines.push(first ? `next: scripts/workflow assignment:create --task ${first.id}` : "next: nothing to assign now; wait for the active assignments.");
	return `${lines.join("\n")}\n`;
}
function createText(value) {
	const result = value;
	const record = result.assignment;
	return [
		`assignment: ${record.id} for ${record.taskId}, base ${record.baseCommit.slice(0, 12)}, ${result.created ? "created" : "already assigned"}`,
		"next: start a Claude subagent with isolation worktree and give it this brief:",
		"",
		result.brief
	].join("\n");
}
function attachText(value) {
	const result = value;
	const record = result.assignment;
	return [
		`assignment: ${record.id} ${result.attached ? "attached" : "already attached"}, task ${record.taskId}, ${record.status}`,
		`worktree: ${record.worktree ?? "none"} (${record.branch ?? "detached"})`,
		`main: ${result.worktree.mainRoot}`,
		...result.planCommit ? [`plan commit: ${result.planCommit.slice(0, 12)}`] : [],
		record.status === "NEEDS_SETUP" ? "next: scripts/workflow assignment:setup (the worktree lacks the dependencies its checks need)" : `next: scripts/workflow task:start ${record.taskId}`,
		""
	].join("\n");
}
function setupText(value) {
	const result = value;
	const record = result.assignment;
	const setup = record.setup;
	return [
		`assignment: ${record.id} ${record.status}, ${result.ran && setup ? `set up with ${setup.command} (lock ${setup.lockHash.slice(0, 12)})` : "no dependencies to install"}`,
		...record.status === "READY" ? [`next: scripts/workflow task:start ${record.taskId}`] : [],
		""
	].join("\n");
}
function cleanupText(value) {
	const result = value;
	if (result.assignments.length === 0) return "cleanup: nothing to clean up.\n";
	const lines = result.assignments.map((record) => {
		const cleanup = record.cleanup;
		return cleanup?.status === "PENDING" ? `cleanup: ${record.id} PENDING — ${cleanup.reason}` : `cleanup: ${record.id} DONE`;
	});
	if (result.assignments.some((record) => record.cleanup?.status === "PENDING")) lines.push("next: resolve the reason (for example commit or remove the changes in the worktree), then scripts/workflow assignment:cleanup");
	return `${lines.join("\n")}\n`;
}
function cancelText(value) {
	const result = value;
	const record = result.assignment;
	const task = result.task;
	return [
		`assignment: ${record.id} cancelled, task ${record.taskId} ${task?.status ?? "not in the plan"}`,
		`worktree: ${result.worktree === null ? "none" : `removed ${result.worktree}`}`,
		result.branch === null || result.branchTip === null ? "branch: none" : `branch: deleted ${result.branch} at ${result.branchTip.slice(0, 12)} (restore: git branch ${result.branch} ${result.branchTip})`,
		task?.status === "TODO" ? `next: scripts/workflow assignment:create --task ${task.id}` : "next: scripts/workflow assignment:next",
		""
	].join("\n");
}
function statusText$2(value) {
	const result = value;
	const task = result.task;
	return [
		`assignment: ${result.worktree.id} (${result.assignment?.status ?? "record missing in main"})`,
		`scope: ${result.scopeId ?? "NONE"}, base ${result.worktree.baseCommit.slice(0, 12)}, head ${result.head?.slice(0, 12) ?? "none"}`,
		task ? `task: ${task.id} ${task.status} — ${task.title}` : `task: ${result.worktree.taskId} missing`,
		...result.assignment?.sourceCommit ? [`source: ${result.assignment.sourceCommit}`] : [],
		""
	].join("\n");
}
/** The only commands of an attached executor worktree (spec 5.3). */
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
/** `ASSIGNMENT_READ_ONLY` for any other command in an executor worktree. */
function ensureExecutorCommand(kit, root, command) {
	if (EXECUTOR_COMMANDS.has(command)) return;
	const executor = kit.executorAssignment(root);
	ensure(executor === null, "ASSIGNMENT_READ_ONLY", `${command} is not available in the executor worktree of ${executor?.id}.`, { allowed: [...EXECUTOR_COMMANDS] }, "Run only your task: task:start, commit --task, status, recover, show-task, schema, context, repair, task:block, assignment:status, assignment:setup.");
}
/**
* Orchestrated assignments (spec 5.1, 5.4, 7): `assignment:next|create|cleanup|cancel`
* in main, `attach|status` in the executor worktree, `setup` in both.
*/
var ASSIGNMENT_COMMANDS = {
	"assignment:attach": {
		run: ({ args, kit, root }) => kit.attachAssignment(root, positional(args, 0, "Assignment id")),
		text: attachText,
		usage: "assignment:attach <id>"
	},
	"assignment:cancel": {
		run: ({ args, kit, root }) => kit.cancelAssignment(root, requiredFlag(args, "id"), args.flags.get("force") === true),
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
		text: statusText$2,
		usage: "assignment:status"
	},
	"assignment:next": {
		run: ({ kit, root }) => kit.nextAssignments(root),
		text: nextText,
		usage: "assignment:next"
	}
};
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-cli-context.ts
/** Output budget of `context`: Claude Code cuts tool output near 30 000 chars. */
var CONTEXT_BUDGET = 28e3;
var KIT_FOLDER = ".harness/workflow";
var H2$1 = /^##\s+(.+?)\s*#*\s*$/u;
var FENCE$2 = /^\s*(```|~~~)/u;
var LIST_MORE = "narrow with `scripts/workflow context --list <folder>` (a subfolder)";
function bytesOf(text) {
	return Buffer.byteLength(text, "utf8");
}
function forbidden(request, reason) {
	return new WorkflowError("CONTEXT_FORBIDDEN", `${request}: ${reason}.`, { path: request }, "Ask only for text files of the project outside .harness/workflow/.");
}
/**
* The canonical project-relative path of a request (relative to the
* project root, or absolute inside it); outside the root, or inside the Kit
* folder (also through a symbolic link), is CONTEXT_FORBIDDEN.
*/
function projectPath(root, request) {
	const relative = (base, target) => path.relative(base, target).split(path.sep).join("/");
	const inside = (value) => value !== ".." && !value.startsWith("../") && !path.isAbsolute(value);
	const kitPath = (value) => {
		const lower = value.toLowerCase();
		return lower === KIT_FOLDER || lower.startsWith(`${KIT_FOLDER}/`);
	};
	const absolute = path.resolve(root, request);
	const lexical = relative(path.resolve(root), absolute);
	let real = null;
	try {
		real = relative(realpathSync(root), realpathSync(absolute));
	} catch {}
	const result = inside(lexical) ? lexical : real;
	if (result === null || !inside(result)) throw forbidden(request, "the path is outside the project");
	if (kitPath(result)) throw forbidden(request, "the Kit folder .harness/workflow/ is closed");
	if (real !== null && !inside(real)) throw forbidden(request, "the path leads outside the project");
	if (real !== null && kitPath(real)) throw forbidden(request, "the path leads into .harness/workflow/");
	return result === "" ? "." : result;
}
/** The text of a project file: CONTEXT_MISSING, or CONTEXT_FORBIDDEN for a folder or binary file. */
function readProjectText(root, request, file) {
	const absolute = path.resolve(root, file);
	let isFile = false;
	try {
		isFile = statSync(absolute).isFile();
	} catch {
		throw new WorkflowError("CONTEXT_MISSING", `${request}: the file does not exist.`, { path: file }, "Run `scripts/workflow context --list` for the project documents.");
	}
	if (!isFile) throw forbidden(request, "not a file (ask for files, list a folder with --list)");
	const data = readFileSync(absolute);
	if (data.includes(0)) throw forbidden(request, "not a text file");
	return data.toString("utf8");
}
/** Every request read and checked before anything is returned. */
function requested(recovery, root, requests) {
	return requests.map((request) => {
		const hash = request.indexOf("#");
		const target = hash === -1 ? request : request.slice(0, hash);
		const heading = hash === -1 ? "" : request.slice(hash + 1).trim();
		const file = projectPath(root, target);
		const text = readProjectText(root, request, file);
		const section = heading ? recovery.section(text, heading) : text;
		ensure(section !== null, "CONTEXT_MISSING", `${file} has no heading "${heading}".`, {
			heading,
			path: file
		}, `Run \`scripts/workflow context --list ${path.posix.dirname(file)}\` for its headings.`);
		const body = section.trimEnd();
		return {
			bytes: bytesOf(body),
			path: file,
			text: body,
			...heading ? { heading } : {}
		};
	});
}
/**
* The `##` sections of a document (outside fenced code); the text before
* the first one stays with the first section. Null without `##` headings.
*/
function sections(item) {
	const lines = item.text.split("\n");
	const starts = [];
	let fenced = false;
	for (const [index, line] of lines.entries()) {
		if (FENCE$2.test(line)) {
			fenced = !fenced;
			continue;
		}
		const match = fenced ? null : H2$1.exec(line);
		if (match?.[1]) starts.push({
			heading: match[1],
			index
		});
	}
	if (starts.length === 0) return null;
	return starts.map((start, position) => {
		const from = position === 0 ? 0 : start.index;
		const to = starts[position + 1]?.index ?? lines.length;
		const text = lines.slice(from, to).join("\n").trimEnd();
		return {
			bytes: bytesOf(text),
			heading: start.heading,
			path: item.path,
			text
		};
	});
}
function attribute$1(value) {
	return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;");
}
function block(item) {
	const heading = item.heading ? ` heading="${attribute$1(item.heading)}"` : "";
	return `<document path="${attribute$1(item.path)}"${heading} bytes="${item.bytes}">\n${item.text}\n</document>\n`;
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
/** The `--format text` answer: the marked documents, then the left-out lines. */
function contextText(value) {
	const result = value;
	const parts = result.documents.map(block);
	const tail = result.notIncluded.map(leftOutLine);
	if (tail.length > 0) parts.push(`${tail.join("\n")}\n`);
	return parts.length > 0 ? parts.join("\n") : "no documents\n";
}
/**
* Packs the documents in request order while the answer fits the budget.
* A document larger than the budget alone is split by `##` sections. After
* the first item that does not fit, every later one is left out, so the
* next request continues in order.
*/
function pack(items) {
	const result = {
		documents: [],
		notIncluded: []
	};
	let used = 0;
	let full = false;
	const oversized = (item) => bytesOf(block(item)) > CONTEXT_BUDGET;
	const take = (item) => {
		const size = bytesOf(block(item)) + (result.documents.length > 0 ? 1 : 0);
		if (full || used + size > CONTEXT_BUDGET) {
			full = true;
			return false;
		}
		result.documents.push(item);
		used += size;
		return true;
	};
	for (const item of items) {
		const parts = !full && oversized(item) ? sections(item) : null;
		if (parts) {
			for (const part of parts) if (!take(part)) result.notIncluded.push(leftOut(part, oversized(part)));
		} else if (!take(item)) result.notIncluded.push(leftOut(item, oversized(item) && sections(item) === null));
	}
	while (result.documents.length > 0 && bytesOf(contextText(result)) > CONTEXT_BUDGET) {
		const last = result.documents.pop();
		result.notIncluded.unshift(leftOut(last));
	}
	return result;
}
/** `context --list [<folder>]`: the documents map within the output budget. */
function listDocuments(recovery, root, request) {
	let folder = null;
	if (request !== void 0) {
		const relative = projectPath(root, request);
		let isFolder = false;
		try {
			isFolder = statSync(path.resolve(root, relative)).isDirectory();
		} catch {
			throw new WorkflowError("CONTEXT_MISSING", `${request}: the folder does not exist.`, { path: relative });
		}
		if (!isFolder) throw forbidden(request, "not a folder (ask for a file without --list)");
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
function text$1(value) {
	if ("documents" in value) return contextText(value);
	const list = value;
	return list.entries.length > 0 ? `${list.text}\n` : `no Markdown documents${list.folder ? ` under ${list.folder}` : ""}\n`;
}
/**
* `context <path>[#Heading] …` and `context --list [<folder>]` (spec 3.1):
* project documents as marked text within 28 000 bytes. A pure read: it
* needs no scope and also runs in an executor worktree. Text is its
* default format.
*/
var CONTEXT_COMMANDS = { context: {
	defaultFormat: "text",
	run: ({ args, kit, root }) => {
		if (args.flags.get("list") === true) {
			ensure(args.positionals.length <= 1, "USAGE", "context --list takes at most one folder.");
			return listDocuments(kit.recovery, root, args.positionals[0]);
		}
		ensure(args.positionals.length > 0, "USAGE", "context needs at least one <path>[#Heading], or --list [<folder>].");
		return pack(requested(kit.recovery, root, args.positionals));
	},
	text: text$1,
	usage: "context <path>[#Heading] … | context --list [<folder>]"
} };
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-cli-execution.ts
var STRATEGIES$2 = /* @__PURE__ */ new Set(["orchestrated", "sequential"]);
var OPTIONS$1 = /* @__PURE__ */ new Set([
	"orchestrated",
	"refine",
	"sequential"
]);
var GENERATION_PATTERN = /^[1-9]\d*$/u;
function choice(args, name, allowed) {
	const value = requiredFlag(args, name);
	ensure(allowed.has(value), "USAGE", `--${name} is ${[...allowed].join(", ")}.`);
	return value;
}
function generation(args) {
	const value = requiredFlag(args, "generation");
	ensure(GENERATION_PATTERN.test(value), "USAGE", "--generation must be a positive integer.");
	return Number(value);
}
function proposalText(value) {
	const result = value;
	const lines = [
		`proposal: generation ${result.generation}, recommended ${result.recommended}, parallel work ${result.hasParallelWork ? "yes" : "no"}`,
		`reason: ${result.reason}`,
		`options: ${result.options.join(", ")}`
	];
	lines.push(result.autoChosen && result.scope ? `scope: ${result.scope.scopeId} created as sequential automatically (no parallel work after refining); tell the user and start the first task.` : "next: the user chooses the execution mode; end the turn.");
	return `${lines.join("\n")}\n`;
}
function choiceText(value) {
	const result = value;
	if (result.option === "refine") return `choice: refine (generation ${result.generation}); refine the specification with the user, then run scope:propose again.\n`;
	return `choice: ${result.option} (generation ${result.generation}); scope ${result.scope?.scopeId ?? "NONE"} created at revision ${result.scope?.revision ?? 0}.\n`;
}
function proposalViewText(value) {
	const view = value;
	if (!view) return "proposal: none\n";
	const state = view.refining ? "refining" : "open";
	return `${[
		`proposal: generation ${view.generation} (${state}), recommended ${view.recommended}, parallel work ${view.hasParallelWork ? "yes" : "no"}`,
		`scope: ${view.scopeId ?? "NONE"}${view.objective ? ` — ${view.objective}` : ""}`,
		`reason: ${view.reason}`,
		`options: ${view.options.join(", ")}`
	].join("\n")}\n`;
}
/**
* `scope:propose`, `scope:choose` and the read-only `scope:proposal`: the
* execution mode choice (spec 4.1).
*/
var EXECUTION_COMMANDS = {
	"scope:choose": {
		run: ({ args, kit, root }) => kit.chooseScope(root, {
			generation: generation(args),
			note: requiredFlag(args, "note"),
			option: choice(args, "option", OPTIONS$1),
			session: requiredFlag(args, "session")
		}),
		text: choiceText,
		usage: "scope:choose --generation <N> --option sequential|orchestrated|refine --session <id> --note \"<the user's choice>\""
	},
	"scope:proposal": {
		run: ({ kit, root }) => kit.proposalView(root),
		text: proposalViewText,
		usage: "scope:proposal"
	},
	"scope:propose": {
		run: ({ args, io, kit, root }) => kit.proposeScope(root, readJsonFile(io.cwd, requiredFlag(args, "input")), choice(args, "recommended", STRATEGIES$2), requiredFlag(args, "reason")),
		text: proposalText,
		usage: "scope:propose --input <file.json> --recommended sequential|orchestrated --reason \"<why>\""
	}
};
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-cli-identity.ts
function identityText(value) {
	const result = value;
	return `identity: ${result.name} <${result.email}> (${result.scope} git config)\n`;
}
/**
* `identity:set --name --email --global`: validates the identity
* (GIT_IDENTITY_INVALID, GIT_IDENTITY_PLACEHOLDER) and writes it to the
* global git config. It needs no project: it works in any folder.
*/
var IDENTITY_COMMANDS = { "identity:set": {
	run: ({ args, kit, root }) => {
		ensure(args.flags.get("global") === true, "USAGE", "identity:set needs --global: the identity is set once for all projects.");
		return {
			...kit.git.writeGlobalIdentity(root, {
				email: flag(args, "email") ?? "",
				name: flag(args, "name") ?? ""
			}),
			scope: "global"
		};
	},
	text: identityText,
	usage: "identity:set --name \"<name>\" --email <email> --global"
} };
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-cli-integration.ts
var short = (sha) => sha?.slice(0, 12) ?? "none";
function outcomeText(value) {
	const result = value;
	const lines = [`integration: ${result.assignmentId} ${result.status}, task ${result.taskId}, source ${short(result.source)} into ${short(result.mainHead)}`];
	if (result.status === "CONFLICT") {
		for (const file of result.conflicts) lines.push(`conflict: ${file}`);
		lines.push(`next: resolve the conflicts inside the files of ${result.taskId}, git add them, then scripts/workflow integration:continue --id ${result.assignmentId}`);
		return `${lines.join("\n")}\n`;
	}
	lines.push(`commit: ${short(result.integrationCommit)}`);
	const cleanup = result.assignment?.cleanup;
	lines.push(cleanup?.status === "PENDING" ? `cleanup: PENDING — ${cleanup.reason} (repeat with scripts/workflow assignment:cleanup --id ${result.assignmentId})` : "cleanup: DONE");
	lines.push("next: scripts/workflow assignment:next");
	return `${lines.join("\n")}\n`;
}
function statusText$1(value) {
	const result = value;
	const journal = result.journal;
	if (!journal) return `integration: IDLE${result.mergeHead ? ` (a merge of ${short(result.mergeHead)} is in progress without the Kit)` : ""}\n`;
	const lines = [`integration: ${journal.assignmentId} ${journal.phase}, task ${journal.taskId}, source ${short(journal.source)} into ${short(journal.mainHead)}`, ...result.conflicts.map((file) => `conflict: ${file}`)];
	if (journal.error) lines.push(`error: ${journal.error.trim().split("\n").slice(-5).join("\n")}`);
	lines.push(journal.phase === "UNKNOWN" ? "next: inspect main (git status, git log -1); the Kit does not retry an unproven state" : `next: scripts/workflow integration:continue --id ${journal.assignmentId}`);
	return `${lines.join("\n")}\n`;
}
/** Integration of executor results in main (spec 7). */
var INTEGRATION_COMMANDS = {
	"integration:continue": {
		run: ({ args, kit, root }) => kit.continueIntegration(root, requiredFlag(args, "id")),
		text: outcomeText,
		usage: "integration:continue --id <assignment>"
	},
	"integration:start": {
		run: ({ args, kit, root }) => kit.startIntegration(root, requiredFlag(args, "id"), requiredFlag(args, "source")),
		text: outcomeText,
		usage: "integration:start --id <assignment> --source <sha>"
	},
	"integration:status": {
		run: ({ kit, root }) => kit.integrationStatus(root),
		text: statusText$1,
		usage: "integration:status"
	}
};
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-cli-pause.ts
function pauseText(value) {
	const result = value;
	return result.paused ? `pause: on (${result.at}) — ${result.note}\ntask:start in main and assignment:create are refused until the user continues.\n` : `pause: off (${result.at}) — ${result.note}\n`;
}
/**
* `pause:set --on|--off --note`: the user's pause of the workflow (main
* checkout only; an executor worktree gets ASSIGNMENT_READ_ONLY).
*/
var PAUSE_COMMANDS = { "pause:set": {
	run: ({ args, kit, root }) => {
		const on = args.flags.get("on") === true;
		ensure(on !== (args.flags.get("off") === true), "USAGE", "pause:set needs exactly one of --on or --off.");
		return kit.setPause(root, on, requiredFlag(args, "note"));
	},
	text: pauseText,
	usage: "pause:set --on|--off --note \"<the user's words>\""
} };
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-git/src/git-history.ts
var RECORD_SEPARATOR = "";
var FIELD_SEPARATOR = "\0";
var TRAILER_PATTERN = /^(Workflow-[A-Za-z-]+):\s*(.+)$/u;
var STATUS_PREFIX_LENGTH = 3;
var LEADING_NEWLINE_PATTERN = /^\n/u;
/** Parses `git status --porcelain=v1 -z` including rename/copy pairs. */
function parsePorcelain(output) {
	const entries = output.split(FIELD_SEPARATOR).filter(Boolean);
	const changes = {
		all: [],
		staged: [],
		unstaged: [],
		untracked: []
	};
	for (let index = 0; index < entries.length; index += 1) {
		const entry = entries[index] ?? "";
		const indexState = entry[0] ?? " ";
		const treeState = entry[1] ?? " ";
		const file = entry.slice(STATUS_PREFIX_LENGTH);
		if (indexState === "R" || indexState === "C") {
			const source = entries[index + 1];
			index += 1;
			if (source) changes.staged.push(source);
		}
		if (indexState === "?") {
			changes.untracked.push(file);
			continue;
		}
		if (indexState !== " ") changes.staged.push(file);
		if (treeState !== " ") changes.unstaged.push(file);
	}
	const unique = (values) => [...new Set(values)].sort();
	return {
		all: unique([
			...changes.staged,
			...changes.unstaged,
			...changes.untracked
		]),
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
		if (match?.[1] && match[2]) trailers[match[1]] = [...trailers[match[1]] ?? [], match[2].trim()];
	}
	return trailers;
}
function readChanges(git, root) {
	return parsePorcelain(git.run(root, [
		"status",
		"--porcelain=v1",
		"-z",
		"--untracked-files=all"
	]).stdout);
}
/** Commits reachable from `tip` but not from `from` (all when from is null), oldest first. */
function readHistory(git, root, from, tip = "HEAD", options = {}) {
	const range = from ? `${from}..${tip}` : tip;
	const output = git.run(root, [
		"log",
		"--reverse",
		...options.firstParent ? ["--first-parent"] : [],
		`--format=%H%x00%P%x00%B${RECORD_SEPARATOR}`,
		range
	], { allowFailure: true });
	if (output.status !== 0) return [];
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
/** Paths that differ between two commits, renames as delete plus add, sorted. */
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
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-git/src/git-identity.ts
var PLACEHOLDER_NAMES = /* @__PURE__ */ new Set(["your name", "ваше имя"]);
var PLACEHOLDER_EMAILS = /* @__PURE__ */ new Set(["you@example.com"]);
var PLACEHOLDER_DOMAINS = /* @__PURE__ */ new Set([
	"example",
	"invalid",
	"localhost"
]);
/** The fix every identity refusal names: set a real global identity once. */
var IDENTITY_FIX_COMMANDS = "Run once: `git config --global user.name \"Your Real Name\"` and `git config --global user.email \"you@your-domain\"`; then `scripts/workflow doctor --fix` applies it to the project.";
/** Straight, typographic and backtick quotes of any kind. */
var QUOTES = /["'`\u2018\u2019\u201A\u201C\u201D\u201E\u00AB\u00BB\u2039\u203A]/u;
var ANGLE_BRACKETS = /[<>]/u;
/** `local@domain.tld`: exactly one `@`, no whitespace, a dot in the domain. */
var EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
function isPlaceholderDomain(domain) {
	return domain === "" || PLACEHOLDER_DOMAINS.has(domain) || domain.startsWith("example.") || domain.endsWith(".invalid");
}
/** True for empty, sample or reserved identities that must never sign commits. */
function isPlaceholderIdentity(identity) {
	const name = identity.name.trim().toLowerCase();
	const email = identity.email.trim().toLowerCase();
	if (name === "" || email === "" || PLACEHOLDER_NAMES.has(name)) return true;
	if (PLACEHOLDER_EMAILS.has(email)) return true;
	const at = email.lastIndexOf("@");
	return at < 0 || isPlaceholderDomain(email.slice(at + 1));
}
/**
* The single identity validator (setting and reading alike): the name is
* not empty and has no quotes or angle brackets; the email looks like
* `local@domain.tld` without whitespace, quotes or angle brackets; then
* placeholders are refused.
*/
function identityProblem(identity) {
	const name = identity.name.trim();
	const email = identity.email.trim();
	if (name === "" || QUOTES.test(name) || ANGLE_BRACKETS.test(name)) return {
		code: "GIT_IDENTITY_INVALID",
		field: "name",
		message: "The git name must not be empty and must not contain quotes or angle brackets."
	};
	if (QUOTES.test(email) || ANGLE_BRACKETS.test(email) || !EMAIL_SHAPE.test(email)) return {
		code: "GIT_IDENTITY_INVALID",
		field: "email",
		message: "The git email must look like name@domain.tld, without spaces, quotes or angle brackets."
	};
	if (PLACEHOLDER_NAMES.has(name.toLowerCase())) return {
		code: "GIT_IDENTITY_PLACEHOLDER",
		field: "name",
		message: `"${name}" is a placeholder git name; use your real name.`
	};
	if (isPlaceholderIdentity({
		email,
		name
	})) return {
		code: "GIT_IDENTITY_PLACEHOLDER",
		field: "email",
		message: `${email} is a placeholder git email; use your real address.`
	};
	return null;
}
/** True when the identity passes `identityProblem` and may sign Kit commits. */
function isUsableIdentity(identity) {
	return identityProblem(identity) === null;
}
/** The trimmed identity; throws GIT_IDENTITY_INVALID or GIT_IDENTITY_PLACEHOLDER. */
function validateIdentity(identity) {
	const problem = identityProblem(identity);
	if (problem) throw new WorkflowError(problem.code, problem.message, { field: problem.field });
	return {
		email: identity.email.trim(),
		name: identity.name.trim()
	};
}
/**
* GIT_IDENTITY_REQUIRED: the message names the problem once; the terminal
* fix is only the next action.
*/
function identityRequiredError(configured, suffix = "") {
	return new WorkflowError("GIT_IDENTITY_REQUIRED", `The Workflow Kit needs a real git name and email for its commits; ${configured ? "the configured one is a placeholder or invalid" : "none is set"}.${suffix}`, { placeholder: configured }, IDENTITY_FIX_COMMANDS);
}
/** Identity stored in one config file only (`--local` or `--global`); null when incomplete. */
function readScopedIdentity(git, root, scope) {
	const value = (key) => git.run(root, [
		"config",
		`--${scope}`,
		"--get",
		key
	], { allowFailure: true }).stdout.trim();
	const name = value("user.name");
	const email = value("user.email");
	return name && email ? {
		email,
		name
	} : null;
}
/** The repository-local identity, else the global one; unusable ones are skipped. */
function resolveIdentity(git, root) {
	for (const source of ["local", "global"]) {
		const identity = readScopedIdentity(git, root, source);
		if (identity && isUsableIdentity(identity)) return {
			...identity,
			source
		};
	}
	return null;
}
/** Writes a validated identity into the repository-local config. */
function writeLocalIdentity(git, root, identity) {
	const valid = validateIdentity(identity);
	git.run(root, [
		"config",
		"--local",
		"user.name",
		valid.name
	]);
	git.run(root, [
		"config",
		"--local",
		"user.email",
		valid.email
	]);
}
/** Validates the identity and writes it into the global git config. */
function writeGlobalIdentity(git, cwd, identity) {
	const valid = validateIdentity(identity);
	git.run(cwd, [
		"config",
		"--global",
		"user.name",
		valid.name
	]);
	git.run(cwd, [
		"config",
		"--global",
		"user.email",
		valid.email
	]);
	return valid;
}
/**
* The repository-local identity every Kit commit is signed with; fails with
* GIT_IDENTITY_REQUIRED when it is missing, a placeholder or invalid.
*/
function requireCommitIdentity(git, root) {
	const identity = readScopedIdentity(git, root, "local");
	if (identity && isUsableIdentity(identity)) return identity;
	throw identityRequiredError(identity !== null);
}
/** `-c` arguments that pass an identity to one git command explicitly. */
/**
* Author and committer variables for a Kit commit. Git exports
* `GIT_AUTHOR_*` to hooks and they win over `-c user.*`, so a Kit commit made
* from inside another commit's hook would otherwise inherit that author.
*/
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
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-git/src/git-journal.ts
/** Project-relative directory for local, git-ignored Workflow Kit state. */
var LOCAL_DIR = ".harness/workflow/local";
function sha256$1(value) {
	return createHash("sha256").update(value).digest("hex");
}
function localPath(root, ...parts) {
	return path.join(root, ...LOCAL_DIR.split("/"), ...parts);
}
function readJournal$1(root) {
	const file = localPath(root, "transaction.json");
	return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}
function saveJournal$1(root, journal) {
	workflowPlatformFacade.writeFileAtomic(localPath(root, "transaction.json"), `${JSON.stringify(journal, null, 2)}\n`);
}
function removeJournal$1(root) {
	rmSync(localPath(root, "transaction.json"), { force: true });
	rmSync(localPath(root, "index-before"), { force: true });
}
/** Full commit message: subject/body followed by the Workflow trailers. */
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
	return `${journal.message.trim()}\n\n${trailers.join("\n")}\n`;
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-git/src/git-references.ts
function trailer(commit, key) {
	const values = commit.trailers[key] ?? [];
	ensure(values.length <= 1, "AMBIGUOUS_COMMIT", `Duplicated ${key} trailer in ${commit.sha}.`);
	return values[0];
}
/** Roles of commits that complete a plan task. */
var TASK_ROLES = /* @__PURE__ */ new Set([
	"docs",
	"implementation",
	"integration",
	"quality"
]);
var INTEGRATION_ROLE = "integration";
var INTEGRATION_PARENTS = 2;
/**
* A two-parent commit of main is accepted only as an integration commit:
* role `integration`, `Workflow-Source` equal to its second parent, a task
* and an assignment. Every other merge breaks the linear history.
*/
function checkMerge(commit) {
	const role = trailer(commit, "Workflow-Role");
	const source = trailer(commit, "Workflow-Source");
	ensure(commit.parents.length === INTEGRATION_PARENTS && role === INTEGRATION_ROLE && source !== void 0 && source === commit.parents[1] && Boolean(trailer(commit, "Workflow-Task")) && Boolean(trailer(commit, "Workflow-Assignment")), "HISTORY_NOT_LINEAR", `Commit ${commit.sha} has ${commit.parents.length} parents but is not an integration commit with Workflow-Source equal to its second parent.`, {
		parents: commit.parents,
		role: role ?? null,
		sha: commit.sha
	});
}
/** A path is in scope when it equals or is nested (by segment) in a task file entry. */
function inTaskScope$2(files, file) {
	return files.some((entry) => file === entry || file.startsWith(`${entry}/`));
}
/**
* Paths of a task commit and the files it may touch: a linear commit against
* its parent with the exact task files; an integration commit against its
* first parent with the task files and the paths nested in them.
*/
function commitPaths(git, root, task, planPath, commit) {
	if (trailer(commit, "Workflow-Role") !== INTEGRATION_ROLE) {
		ensure(commit.parents.length === 1, "HISTORY_NOT_LINEAR", `The task commit of ${task.id} must have one parent.`, { sha: commit.sha });
		const paths = readCommitPaths(git, root, commit.sha);
		const allowed = /* @__PURE__ */ new Set([...task.files, planPath]);
		return outsideTask(task, commit, paths, (file) => allowed.has(file));
	}
	ensure(commit.parents.length === INTEGRATION_PARENTS, "HISTORY_NOT_LINEAR", `The integration commit of ${task.id} must have two parents.`, { sha: commit.sha });
	return outsideTask(task, commit, readDiffPaths(git, root, commit.parents[0] ?? "", commit.sha), (file) => file === planPath || inTaskScope$2(task.files, file));
}
function outsideTask(task, commit, paths, allowed) {
	const outside = paths.filter((file) => !allowed(file));
	ensure(outside.length === 0, "COMMIT_SCOPE_MISMATCH", `The commit of ${task.id} touches files outside the task.`, {
		paths: outside,
		sha: commit.sha
	});
	return paths;
}
function taskCommits$1(history, scopeId, task) {
	return history.filter((commit) => trailer(commit, "Workflow-Scope") === scopeId && trailer(commit, "Workflow-Task") === task.id && TASK_ROLES.has(trailer(commit, "Workflow-Role") ?? "") && Number(trailer(commit, "Workflow-Iteration") ?? "1") === task.iteration);
}
function checkCommit(git, root, plan, planPath, task, commit, resolved) {
	ensure(task.status === "DONE", "PLAN_COMMIT_MISMATCH", `Task ${task.id} has a commit but is not DONE.`, { sha: commit.sha });
	const paths = commitPaths(git, root, task, planPath, commit);
	for (const dependency of task.dependencies) {
		const dependencySha = resolved.get(dependency);
		ensure(plan.tasks.find((item) => item.id === dependency && plan.rounds.find((round) => round.id === item.roundId)?.kind === "legacy") || dependencySha && git.succeeds(root, [
			"merge-base",
			"--is-ancestor",
			dependencySha,
			commit.parents[0] ?? ""
		]), "DEPENDENCY_ORDER", `Dependency ${dependency} must be committed before ${task.id}.`);
	}
	return paths;
}
/**
* Proves that every DONE task has exactly one commit in baseline..HEAD that
* touches only its files, after the commits of its dependencies. Main is
* walked by first parents: the executor history an integration commit
* brings in through its second parent is never a main task commit.
*/
function resolveTaskReferences(git, root, plan, planPath, pending) {
	const references = /* @__PURE__ */ new Map();
	const scope = plan.scope;
	if (!scope) return references;
	const history = readHistory(git, root, scope.baselineCommit, "HEAD", { firstParent: true });
	for (const commit of history) if (commit.parents.length > 1) checkMerge(commit);
	const legacyRounds = new Set(plan.rounds.filter((round) => round.kind === "legacy").map((round) => round.id));
	const resolved = /* @__PURE__ */ new Map();
	for (const task of plan.tasks.filter((item) => !legacyRounds.has(item.roundId))) {
		const commits = taskCommits$1(history, scope.id, task);
		ensure(commits.length <= 1, "AMBIGUOUS_COMMIT", `Several commits claim task ${task.id}.`, { shas: commits.map((commit) => commit.sha) });
		const [commit] = commits;
		if (commit) {
			const paths = checkCommit(git, root, plan, planPath, task, commit, resolved);
			resolved.set(task.id, commit.sha);
			references.set(task.id, {
				paths,
				sha: commit.sha,
				status: "committed"
			});
			continue;
		}
		const inTransaction = pending?.scopeId === scope.id && pending.taskId === task.id;
		ensure(task.status !== "DONE" || inTransaction, "PLAN_COMMIT_MISMATCH", `Task ${task.id} is DONE but has no commit.`, {}, "Run `scripts/workflow repair`.");
		references.set(task.id, { status: inTransaction ? "pending" : "open" });
	}
	return references;
}
var EXECUTION_STRATEGIES = ["sequential", "orchestrated"];
var STRATEGIES$1 = new Set(EXECUTION_STRATEGIES);
var GLOB_PATTERN = /[*?[\]{}]/u;
var SEQUENTIAL = {
	maxWorkers: 3,
	ownerSession: null,
	strategy: "sequential"
};
/** Builds the stored execution block from input, filling the defaults. */
function normalizeExecution(input) {
	if (input === void 0 || input === null) return;
	ensure(typeof input === "object" && !Array.isArray(input), "PLAN_EXECUTION", "execution must be an object with a strategy.", { field: "execution" });
	return {
		maxWorkers: input.maxWorkers ?? 3,
		ownerSession: input.ownerSession ?? null,
		strategy: input.strategy
	};
}
/** The effective execution of a scope; a scope without the block is sequential. */
function scopeExecution(scope) {
	return structuredClone(scope?.execution ?? SEQUENTIAL);
}
function validateExecution(execution) {
	if (execution === void 0) return;
	ensure(execution !== null && typeof execution === "object", "PLAN_EXECUTION", "scope.execution must be an object.", { field: "execution" });
	ensure(STRATEGIES$1.has(execution.strategy), "PLAN_EXECUTION", "execution.strategy must be sequential or orchestrated.", { field: "execution.strategy" });
	ensure(Number.isSafeInteger(execution.maxWorkers) && execution.maxWorkers >= 1 && execution.maxWorkers <= 16, "PLAN_EXECUTION", `execution.maxWorkers must be an integer from 1 to 16.`, { field: "execution.maxWorkers" });
	ensure(execution.ownerSession === null || typeof execution.ownerSession === "string" && execution.ownerSession.trim() !== "", "PLAN_EXECUTION", "execution.ownerSession must be a non-empty string or null.", { field: "execution.ownerSession" });
}
/** A concrete path names one file or directory: no glob, not `.`, no trailing `/`. */
function isConcretePath(file) {
	return typeof file === "string" && file.trim() !== "" && file !== "." && !file.endsWith("/") && !GLOB_PATTERN.test(file);
}
function validateParallelLabel(task) {
	if (task.parallelSafe === void 0) return;
	ensure(typeof task.parallelSafe === "boolean", "PLAN_SCHEMA", `parallelSafe must be boolean: ${task.id}`, { field: `tasks.${task.id}.parallelSafe` });
	if (!task.parallelSafe) return;
	ensure(task.kind === "work", "PARALLEL_KIND", `Only work tasks may be parallelSafe: ${task.id}`, { field: `tasks.${task.id}.parallelSafe` });
	const files = Array.isArray(task.files) ? task.files : [];
	const vague = files.filter((file) => !isConcretePath(file));
	ensure(files.length > 0 && vague.length === 0, "PARALLEL_FILES", `A parallelSafe task lists concrete paths only (no glob, no \`.\`, no trailing \`/\`): ${task.id}`, {
		field: `tasks.${task.id}.files`,
		paths: vague,
		taskId: task.id
	}, "Name every file of the task or set parallelSafe to false.");
}
/**
* Validates the execution block of the scope and the parallel labels of the
* tasks. Runs before the generic path checks so vague paths of a
* parallelSafe task report PARALLEL_FILES.
*/
function validatePlanExecution(plan) {
	validateExecution(plan.scope?.execution);
	for (const task of plan.tasks) validateParallelLabel(task);
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
	return first.id !== second.id && first.kind === "work" && second.kind === "work" && first.parallelSafe === true && second.parallelSafe === true && !ancestors(byId, first.id).has(second.id) && !ancestors(byId, second.id).has(first.id) && !first.files.some((file) => second.files.some((other) => pathsOverlap(file, other)));
}
/**
* Two tasks are compatible when both are parallelSafe work tasks, neither
* depends on the other even transitively, and no path of one equals or is
* nested in a path of the other.
*/
function compatibleTasks(plan, firstId, secondId) {
	const byId = new Map(plan.tasks.map((task) => [task.id, task]));
	const first = byId.get(firstId);
	const second = byId.get(secondId);
	return Boolean(first && second && compatible(byId, first, second));
}
/** True when at least one pair of tasks of the plan is compatible. */
function hasParallelWork(plan) {
	const byId = new Map(plan.tasks.map((task) => [task.id, task]));
	const labelled = plan.tasks.filter((task) => task.kind === "work" && task.parallelSafe === true);
	return labelled.some((first, index) => labelled.slice(index + 1).some((second) => compatible(byId, first, second)));
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-plan/src/plan-field-checks.ts
/**
* Field checks shared by plan validation and the input checks. Every
* refusal is `PLAN_SCHEMA` and names the field in `details.field`.
*/
var ID_PATTERN$1 = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
var schemaError = "PLAN_SCHEMA";
function text(value, field) {
	ensure(typeof value === "string" && value.trim() !== "", schemaError, `Field must be a non-empty string: ${field}`, { field });
}
function textList(value, field, { nonEmpty = false } = {}) {
	ensure(Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim() !== ""), schemaError, `Field must be a list of non-empty strings: ${field}`, { field });
	ensure(!nonEmpty || value.length > 0, schemaError, `List must not be empty: ${field}`, { field });
	ensure(new Set(value).size === value.length, schemaError, `List has duplicates: ${field}`, { field });
}
function identifier(value, field) {
	ensure(typeof value === "string" && ID_PATTERN$1.test(value), schemaError, `Invalid identifier in ${field}: ${String(value)}`, { field });
}
function decision$1(value, field) {
	ensure(value && typeof value === "object", schemaError, `Missing decision: ${field}`, { field });
	text(value.text, `${field}.text`);
	text(value.at, `${field}.at`);
}
function relativePaths(values, field) {
	textList(values, field);
	for (const value of values) ensure(workflowPlatformFacade.normalizeRelative(value) === value, schemaError, `Path is not canonical in ${field}: ${value}`, {
		field,
		path: value
	});
}
/** Document references; a refusal names the entry, e.g. `context[0].path`. */
function documents(values, field) {
	ensure(Array.isArray(values), schemaError, `Field must be a list: ${field}`, { field });
	for (const [index, doc] of values.entries()) {
		const entry = `${field}[${index}]`;
		ensure(doc && typeof doc === "object", schemaError, `Document reference must be an object: ${entry}`, { field: entry });
		text(doc.path, `${entry}.path`);
		ensure(typeof doc.required === "boolean", schemaError, `required must be boolean in ${entry}`, { field: `${entry}.required` });
		ensure(doc.heading === void 0 || typeof doc.heading === "string" && doc.heading.trim() !== "", schemaError, `heading must be text in ${entry}`, { field: `${entry}.heading` });
	}
	relativePaths(values.map((doc) => doc.path), `${field}.path`);
}
function byteLength$1(value) {
	return new TextEncoder().encode(value).length;
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-plan/src/plan-model.ts
var PLAN_SCHEMA = "harness-workflow-plan/1";
var PLAN_PATH = ".harness/plans/todo-plan.md";
var DOCS_TASK_PREFIX = "DOCS-";
var MARKDOWN_PATTERN = /\.(?:md|markdown)$/iu;
var PRODUCT_TREE_PREFIX = ".harness/product-tree/";
function isMarkdownPath(file) {
	return MARKDOWN_PATTERN.test(file);
}
/** Documentation: Markdown files and the product tree (`.harness/product-tree/**`). */
function isDocumentationPath(file) {
	return isMarkdownPath(file) || file.startsWith(PRODUCT_TREE_PREFIX);
}
function functionalFiles(task) {
	return task.files.filter((file) => !isDocumentationPath(file));
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
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-plan/src/plan-validation.ts
var ROUND_ID_PATTERN = /^R[0-9]+(?:-[a-z]+)?$/u;
var SHA_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
var LINE_BREAK_PATTERN = /[\r\n]/u;
var TASK_STATUSES = /* @__PURE__ */ new Set([
	"TODO",
	"IN_PROGRESS",
	"DONE"
]);
var TASK_KINDS = /* @__PURE__ */ new Set([
	"work",
	"quality",
	"docs",
	"delivery"
]);
var ROUND_KINDS = /* @__PURE__ */ new Set([
	"implementation",
	"fixes",
	"legacy"
]);
var DELIVERY_STATES = /* @__PURE__ */ new Set([
	"IN_PROGRESS",
	"READY_FOR_ACCEPTANCE",
	"ACCEPTED"
]);
/**
* Validates the round digest written by a DOCS task. Refusals name the
* field of the digest input (`result`, `decisions`, `decisions[2]`); a
* stored digest passes its plan path as `prefix`.
*/
function validateDigest(digest, prefix = "") {
	const at = (name) => prefix ? `${prefix}.${name}` : name;
	ensure(digest && typeof digest === "object", "ROUND_DIGEST_REQUIRED", "A round digest with at least `result` is required.", { field: prefix || "digest" });
	text(digest.result, at("result"));
	ensure(byteLength$1(digest.result) <= 600, "ROUND_DIGEST_TOO_LARGE", `Digest result exceeds 600 bytes.`, { field: at("result") });
	for (const key of [
		"decisions",
		"contracts",
		"references"
	]) {
		const items = digest[key];
		textList(items, at(key));
		ensure(items.length <= 8, "ROUND_DIGEST_TOO_LARGE", `Digest ${key} has more than 8 items.`, { field: at(key) });
		const large = items.findIndex((item) => byteLength$1(item) > 300);
		ensure(large < 0, "ROUND_DIGEST_TOO_LARGE", `Digest ${key} item exceeds 300 bytes.`, { field: at(`${key}[${large}]`) });
	}
}
function validateScope(scope) {
	identifier(scope.id, "scope.id");
	text(scope.objective, "scope.objective");
	textList(scope.acceptance, "scope.acceptance", { nonEmpty: true });
	decision$1(scope.approval, "scope.approval");
	ensure(Array.isArray(scope.decisions), schemaError, "scope.decisions must be a list.", { field: "scope.decisions" });
	for (const [index, item] of scope.decisions.entries()) decision$1(item, `scope.decisions[${index}]`);
	ensure(SHA_PATTERN.test(scope.baselineCommit), schemaError, "scope.baselineCommit must be a full commit SHA.");
	ensure(scope.spec === null || workflowPlatformFacade.normalizeRelative(scope.spec) === scope.spec, schemaError, "scope.spec must be a canonical path or null.", { field: "scope.spec" });
	documents(scope.context, "scope.context");
	ensure(scope.status === "ACTIVE" || scope.status === "BLOCKED", schemaError, "scope.status must be ACTIVE or BLOCKED.");
	ensure(scope.status === "BLOCKED" === (typeof scope.blockedReason === "string" && scope.blockedReason.trim() !== ""), schemaError, "A BLOCKED scope needs blockedReason; an ACTIVE scope has none.");
	ensure(DELIVERY_STATES.has(scope.delivery), schemaError, "Unknown scope.delivery state.");
	ensure(scope.delivery === "ACCEPTED" === (scope.acceptanceNote !== null), schemaError, "acceptanceNote is present exactly when the scope is ACCEPTED.");
	if (scope.acceptanceNote) decision$1(scope.acceptanceNote, "scope.acceptanceNote");
}
function roundDocsDone(plan, roundId) {
	return plan.tasks.some((task) => task.roundId === roundId && task.kind === "docs" && task.status === "DONE");
}
function validateRounds(plan) {
	const rounds = plan.rounds;
	ensure(rounds.length > 0, schemaError, "An active scope needs at least one round.");
	ensure(new Set(rounds.map((round) => round.id)).size === rounds.length, schemaError, "Round ids must be unique.");
	rounds.forEach((round, index) => {
		ensure(ROUND_ID_PATTERN.test(round.id), schemaError, `Invalid round id: ${round.id}`);
		ensure(ROUND_KINDS.has(round.kind), schemaError, `Invalid round kind: ${round.id}`);
		text(round.title, `rounds.${round.id}.title`);
		ensure(round.status === "OPEN" || round.status === "CLOSED", schemaError, `Invalid round status: ${round.id}`);
		ensure(round.status === "CLOSED" || index === rounds.length - 1, schemaError, "Only the last round may be OPEN.");
		if (round.status === "CLOSED" || roundDocsDone(plan, round.id)) validateDigest(round.digest, `rounds.${round.id}.digest`);
		else ensure(round.digest === null, schemaError, `A round gets its digest with its DOCS task: ${round.id}`);
	});
}
function validateTaskFields(task) {
	identifier(task.id, "task.id");
	text(task.title, `tasks.${task.id}.title`);
	text(task.why, `tasks.${task.id}.why`);
	text(task.commitMessage, `tasks.${task.id}.commitMessage`);
	ensure(!LINE_BREAK_PATTERN.test(task.commitMessage), schemaError, `commitMessage must be one line: ${task.id}`, { field: `tasks.${task.id}.commitMessage` });
	ensure(TASK_KINDS.has(task.kind), schemaError, `Invalid task kind: ${task.id}`, { field: `tasks.${task.id}.kind` });
	ensure(TASK_STATUSES.has(task.status), schemaError, `Invalid task status: ${task.id}`);
	ensure(Number.isSafeInteger(task.iteration) && task.iteration >= 1, schemaError, `iteration must be a positive integer: ${task.id}`);
	relativePaths(task.files, `tasks.${task.id}.files`);
	textList(task.dependencies, `tasks.${task.id}.dependencies`);
	textList(task.acceptance, `tasks.${task.id}.acceptance`, { nonEmpty: true });
	textList(task.checks, `tasks.${task.id}.checks`);
	documents(task.context, `tasks.${task.id}.context`);
	ensure(task.docsWaiver === null || typeof task.docsWaiver === "string", schemaError, `docsWaiver must be text or null: ${task.id}`, { field: `tasks.${task.id}.docsWaiver` });
	ensure(task.confirmation === null || task.kind === "delivery", schemaError, `Only delivery tasks carry a confirmation: ${task.id}`);
	if (task.integration !== void 0) {
		ensure(task.status === "DONE" && typeof task.integration === "object" && task.integration !== null && SHA_PATTERN.test(String(task.integration.sourceCommit)), schemaError, `integration belongs to a DONE task and names a full source SHA: ${task.id}`);
		identifier(task.integration.operationId, `tasks.${task.id}.integration.operationId`);
	}
}
function validateTaskGraph(plan) {
	const positions = new Map(plan.tasks.map((task, index) => [task.id, index]));
	ensure(positions.size === plan.tasks.length, schemaError, "Task ids must be unique.");
	const rounds = new Map(plan.rounds.map((round) => [round.id, round]));
	plan.tasks.forEach((task, index) => {
		const round = rounds.get(task.roundId);
		ensure(round, schemaError, `Task references an unknown round: ${task.id}`);
		ensure(round.status === "OPEN" || task.status === "DONE", schemaError, `Tasks of a closed round are DONE: ${task.id}`);
		for (const dependency of task.dependencies) {
			const position = positions.get(dependency);
			ensure(position !== void 0 && position < index, "TASK_ORDER", `Dependency must exist and come earlier: ${task.id} -> ${dependency}`, { field: `tasks.${task.id}.dependencies` });
		}
		if (task.fixes !== null) {
			const fixed = positions.get(task.fixes);
			ensure(fixed !== void 0 && fixed < index, schemaError, `fixes must reference an earlier task: ${task.id}`, { field: `tasks.${task.id}.fixes` });
		}
	});
}
function validateServiceTasks(plan) {
	for (const round of plan.rounds.filter((item) => item.kind !== "legacy")) {
		const roundTasks = plan.tasks.filter((task) => task.roundId === round.id);
		const docs = roundTasks.filter((task) => task.kind === "docs");
		ensure(docs.length <= 1, "DOCS_TASK", `A round has at most one DOCS task: ${round.id}`);
		const docsTask = docs[0];
		ensure(!docsTask || docsTask.id === docsTaskId(round.id), "DOCS_TASK", `DOCS task id must be ${docsTaskId(round.id)}.`);
		ensure(!docsTask || functionalFiles(docsTask).length === 0, "DOCS_TASK", `DOCS task holds documentation only: ${round.id}`);
		const docsIndex = docsTask ? roundTasks.indexOf(docsTask) : roundTasks.length;
		roundTasks.forEach((task, index) => {
			const regular = task.kind === "work" || task.kind === "quality";
			ensure(!(regular && docsTask && index > docsIndex), "DOCS_TASK", `Only delivery tasks follow DOCS: ${task.id}`);
			ensure(!(regular && docsTask) || docsTask.dependencies.includes(task.id), "DOCS_TASK", `DOCS depends on every task of its round: ${task.id}`);
			ensure(task.kind !== "delivery" || docsTask !== void 0 && task.dependencies.includes(docsTask.id), "DELIVERY_ORDER", `Delivery tasks depend on their round DOCS: ${task.id}`);
		});
	}
}
function validateProgress(plan, scope) {
	const running = plan.tasks.filter((task) => task.status === "IN_PROGRESS");
	ensure(running.length <= 1 && (running[0]?.id ?? null) === plan.currentTaskId, schemaError, "currentTaskId must match the only IN_PROGRESS task.");
	ensure((plan.tasks.length > 0 && plan.tasks.every((task) => task.status === "DONE")) === (scope.delivery !== "IN_PROGRESS"), schemaError, "Delivery state must be IN_PROGRESS exactly while tasks remain.");
}
/** Full structural validation of a workflow plan; throws WorkflowError. */
function validatePlan(plan) {
	ensure(plan && typeof plan === "object" && plan.schema === "harness-workflow-plan/1", schemaError, "Unsupported workflow plan schema.");
	ensure(Number.isSafeInteger(plan.revision) && plan.revision >= 1, schemaError, "revision must be a positive integer.");
	text(plan.projectId, "projectId");
	text(plan.projectName, "projectName");
	ensure(Array.isArray(plan.rounds) && Array.isArray(plan.tasks), schemaError, "rounds and tasks must be lists.");
	if (plan.lastClosed !== null) {
		identifier(plan.lastClosed.scopeId, "lastClosed.scopeId");
		text(plan.lastClosed.closedAt, "lastClosed.closedAt");
	}
	if (plan.scope === null) {
		ensure(plan.rounds.length === 0 && plan.tasks.length === 0 && plan.currentTaskId === null, schemaError, "A plan without scope has no rounds, tasks or current task.");
		return plan;
	}
	validateScope(plan.scope);
	validatePlanExecution(plan);
	validateRounds(plan);
	for (const task of plan.tasks) validateTaskFields(task);
	validateTaskGraph(plan);
	validateServiceTasks(plan);
	validateProgress(plan, plan.scope);
	return plan;
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-plan/src/plan-document.ts
var BEGIN = "<!-- harness-workflow:begin -->";
var END = "<!-- harness-workflow:end -->";
var FENCED_JSON_PATTERN = /^```json\n([\s\S]+)\n```$/u;
var CRLF_PATTERN = /\r\n/gu;
function taskLine(task) {
	const lines = [`- [${task.status}] ${task.id} — ${task.title} (${task.kind}${task.parallelSafe ? ", parallel-safe" : ""})`, `  - Commit: ${task.commitMessage}`];
	if (task.files.length > 0) lines.push(`  - Files: ${task.files.join(", ")}`);
	if (task.dependencies.length > 0) lines.push(`  - Depends on: ${task.dependencies.join(", ")}`);
	if (task.fixes) lines.push(`  - Fixes: ${task.fixes}`);
	return lines;
}
function roundLines(round, tasks) {
	const lines = [`### ${round.id} — ${round.title} (${round.kind}, ${round.status})`, ""];
	for (const task of tasks.filter((item) => item.roundId === round.id)) lines.push(...taskLine(task));
	if (round.digest) lines.push("", `Digest: ${round.digest.result}`);
	lines.push("");
	return lines;
}
/** Plans without an execution block render without this line. */
function executionLines(execution) {
	if (!execution) return [];
	if (execution.strategy === "sequential") return ["- Execution: sequential"];
	const owner = execution.ownerSession ? `, owner ${execution.ownerSession}` : "";
	return [`- Execution: orchestrated (max ${execution.maxWorkers} workers${owner})`];
}
function scopeLines(plan) {
	const scope = plan.scope;
	if (!scope) return [
		"## State",
		"",
		`No active scope.${plan.lastClosed ? ` Last closed scope: ${plan.lastClosed.scopeId}.` : ""}`,
		""
	];
	const done = plan.tasks.filter((task) => task.status === "DONE").length;
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
/** Renders the canonical plan document: JSON state plus a readable projection. */
function renderPlanDocument(plan) {
	validatePlan(plan);
	return [
		`# Workflow Plan — ${plan.projectName}`,
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
/** Extracts the JSON state without validating it. */
function extractPlanState(text) {
	const normalized = text.replace(CRLF_PATTERN, "\n");
	ensure(normalized.split(BEGIN).length === 2 && normalized.split(END).length === 2, "PLAN_MARKERS", "The plan needs exactly one harness-workflow state block.");
	const fragment = normalized.split(BEGIN)[1]?.split(END)[0]?.trim() ?? "";
	const match = FENCED_JSON_PATTERN.exec(fragment);
	ensure(match?.[1], "PLAN_MARKERS", "The state block must hold one fenced JSON block.");
	try {
		return JSON.parse(match[1]);
	} catch {
		throw new WorkflowError("PLAN_JSON", "The plan state is not valid JSON.");
	}
}
function isWorkflowPlanDocument(text) {
	return text.includes(BEGIN) && text.includes(END);
}
/**
* Parses and validates a plan document. With `projection` the readable part
* must match the canonical rendering, so manual edits are detected.
*/
function parsePlanDocument(text, options = {}) {
	const plan = validatePlan(extractPlanState(text));
	if (options.projection ?? true) ensure(renderPlanDocument(plan) === text.replace(CRLF_PATTERN, "\n"), "PLAN_PROJECTION", "The readable part of the plan was edited manually.", {}, "Run `scripts/workflow repair` to rebuild it from the JSON state.");
	return plan;
}
var INPUT_TASK_KINDS = ["work", "delivery"];
var EXTEND_ROUNDS = ["current", "new"];
var EXTEND_ROUND_KINDS = ["fixes", "implementation"];
function approval(value, message) {
	ensure(typeof value === "string" && value.trim().length >= 10, "SCOPE_APPROVAL", message, { field: "approval" });
}
function tasksList(value, message) {
	ensure(Array.isArray(value) && value.length > 0, schemaError, message, { field: "tasks" });
}
/** The `scope:create` / `scope:propose` body; task entries are checked on normalization. */
function checkScopeInput(input) {
	ensure(input && typeof input === "object", schemaError, "The scope input must be a JSON object.", { field: "(root)" });
	tasksList(input.tasks, "A scope needs at least one task.");
	approval(input.approval, `Record the user-approved scope content in \`approval\` (at least 10 characters).`);
	ensure(input.tasks.length === 1 || typeof input.spec === "string" && input.spec !== "", "SPEC_REQUIRED", "A scope with several tasks needs a specification document in `spec`.", { field: "spec" });
	identifier(input.id, "id");
	text(input.objective, "objective");
	textList(input.acceptance, "acceptance", { nonEmpty: true });
	ensure(input.decisions === void 0 || Array.isArray(input.decisions) && input.decisions.every((item) => typeof item === "string" && item.trim() !== ""), schemaError, "Field must be a list of non-empty strings: decisions", { field: "decisions" });
	if (input.context !== void 0) documents(input.context, "context");
}
/** One task entry of `scope:create` or `plan:extend`; `field` is its input path. */
function checkTaskInput(input, field) {
	ensure(input && typeof input === "object", schemaError, "Each task must be an object.", { field });
	ensure(input.kind === void 0 || INPUT_TASK_KINDS.includes(input.kind), schemaError, "Task kind in input must be work or delivery; Kit adds quality and docs tasks.", { field: `${field}.kind` });
	if (input.id !== void 0) identifier(input.id, `${field}.id`);
	text(input.title, `${field}.title`);
	text(input.commitMessage, `${field}.commitMessage`);
	textList(input.acceptance, `${field}.acceptance`, { nonEmpty: true });
	for (const key of ["dependencies", "checks"]) if (input[key] !== void 0) textList(input[key], `${field}.${key}`);
	if (input.context !== void 0) documents(input.context, `${field}.context`);
}
/** The `plan:extend` body without its task entries. */
function checkExtendInput(input) {
	ensure(input && typeof input === "object", schemaError, "The plan:extend input must be a JSON object.", { field: "(root)" });
	tasksList(input.tasks, "plan:extend needs at least one task.");
	ensure(input.round === void 0 || EXTEND_ROUNDS.includes(input.round), schemaError, "round must be current or new.", { field: "round" });
	ensure(input.kind === void 0 || EXTEND_ROUND_KINDS.includes(input.kind), schemaError, "kind must be fixes or implementation.", { field: "kind" });
	if (input.title !== void 0) text(input.title, "title");
}
/** The `carryover` body. */
function checkCarryoverInput(input) {
	ensure(input && typeof input === "object", schemaError, "The carryover input must be a JSON object.", { field: "(root)" });
	approval(input.approval, "carryover needs the user's direct instruction in `approval`.");
	identifier(input.id, "id");
	if (input.objective !== void 0) text(input.objective, "objective");
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-plan/src/plan-input-schema.ts
var SCHEMA = "PLAN_SCHEMA";
var EXECUTION = "PLAN_EXECUTION";
/** Task fields `task:update` may change; a task in progress only the second list. */
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
function field$2(name, type, required, description, extra = {}) {
	return {
		code: SCHEMA,
		description,
		name,
		required,
		type,
		...extra
	};
}
function documentFields(prefix) {
	return [
		field$2(`${prefix}`, "object[]", false, "Documents the agent reads."),
		field$2(`${prefix}[].path`, "string", true, "Canonical project-relative path, unique in the list."),
		field$2(`${prefix}[].required`, "boolean", true, "Whether the document is mandatory reading."),
		field$2(`${prefix}[].heading`, "string", false, "Section heading to read instead of the whole document.")
	];
}
function taskFields(prefix) {
	return [
		field$2(prefix, "object[]", true, "Tasks in execution order.", { minItems: 1 }),
		field$2(`${prefix}[].id`, "string", false, "Task id, unique in the plan; defaults to T001, T002, ...", { pattern: ID_PATTERN$1.source }),
		field$2(`${prefix}[].title`, "string", true, "Short task title."),
		field$2(`${prefix}[].commitMessage`, "string", true, "One-line commit message of the task."),
		field$2(`${prefix}[].acceptance`, "string[]", true, "Acceptance criteria: unique non-empty strings.", { minItems: 1 }),
		field$2(`${prefix}[].why`, "string", false, "Why the task exists; defaults to the title."),
		field$2(`${prefix}[].kind`, "string", false, "work (default) or delivery; Kit adds the quality and docs tasks.", { enum: INPUT_TASK_KINDS }),
		field$2(`${prefix}[].files`, "string[]", false, "Canonical project-relative files or directories the task may change."),
		field$2(`${prefix}[].dependencies`, "string[]", false, "Ids of earlier tasks that must be DONE first."),
		field$2(`${prefix}[].checks`, "string[]", false, CHECKS_DESCRIPTION),
		...documentFields(`${prefix}[].context`),
		field$2(`${prefix}[].docsWaiver`, "string|null", false, "Reason the task changes code without its contract document."),
		field$2(`${prefix}[].fixes`, "string|null", false, "Id of the earlier task this task fixes."),
		field$2(`${prefix}[].parallelSafe`, "boolean", false, "The work task may run in parallel; it then lists concrete files only.")
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
var SCOPE_FIELDS = [
	field$2("id", "string", true, "Scope id.", { pattern: ID_PATTERN$1.source }),
	field$2("objective", "string", true, "What the scope delivers."),
	field$2("acceptance", "string[]", true, "Scope acceptance criteria: unique non-empty strings.", { minItems: 1 }),
	{
		code: "SCOPE_APPROVAL",
		description: "The user's agreement with the scope content, in the user's words (trimmed length).",
		minLength: 10,
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
	field$2("decisions", "string[]", false, "User decisions to record."),
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
		description: `Parallel executors of an orchestrated scope; default 3.`,
		maximum: 16,
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
	context: [{
		heading: "2. Empty list",
		path: "docs/spec.md",
		required: true
	}],
	files: ["src/list.ts"],
	id: "T001",
	title: "Empty list hint",
	why: "Users do not understand an empty screen"
};
var SCOPE_EXAMPLE = {
	acceptance: ["An empty list explains what to do"],
	approval: "User: implement the empty list hint from docs/spec.md",
	context: [{
		path: "docs/spec.md",
		required: true
	}],
	decisions: ["The hint text comes from the specification"],
	id: "empty-list-hint",
	objective: "Explain the empty list to the user",
	spec: "docs/spec.md",
	tasks: [TASK_EXAMPLE, {
		acceptance: ["The packaged app shows the hint"],
		commitMessage: "chore: package the app",
		dependencies: ["T001"],
		id: "T002",
		kind: "delivery",
		title: "Package the app"
	}]
};
function scopeSchema(command, description) {
	const propose = command === "scope:propose";
	return {
		command,
		description,
		example: propose ? {
			...SCOPE_EXAMPLE,
			execution: {
				maxWorkers: 2,
				strategy: "sequential"
			}
		} : {
			...SCOPE_EXAMPLE,
			execution: { strategy: "sequential" }
		},
		fields: SCOPE_FIELDS,
		rules: propose ? ["Run `scope:propose --input <file.json> --recommended sequential|orchestrated --reason \"<why>\"`; the user chooses the mode on the card.", ...SCOPE_RULES] : ["A Harness-hosted project (config host `harness`) uses scope:propose instead (EXECUTION_MODE_REQUIRED).", ...SCOPE_RULES]
	};
}
var EXTEND_SCHEMA = {
	command: "plan:extend",
	description: "Tasks added to the open round or to a new round: `plan:extend --input <file.json> [--expected-revision N]`.",
	example: {
		round: "current",
		tasks: [{
			...TASK_EXAMPLE,
			fixes: null,
			id: "T003"
		}]
	},
	fields: [
		field$2("round", "string", false, "current (default while the round DOCS is not done) or new.", { enum: EXTEND_ROUNDS }),
		field$2("kind", "string", false, "Kind of a new round; default fixes.", { enum: EXTEND_ROUND_KINDS }),
		field$2("title", "string", false, "Title of a new round; default Fixes."),
		...taskFields("tasks"),
		field$2("tasks[].before", "string", false, "Id of a not-started task of the current round to insert before; it then depends on the new task.")
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
		acceptance: ["The list shows a hint when it is empty", "The hint is localized"],
		files: ["src/list.ts", "src/list-hint.ts"]
	},
	fields: [
		field$2("acceptance", "string[]", false, "Acceptance criteria: unique non-empty strings.", { minItems: 1 }),
		field$2("checks", "string[]", false, CHECKS_DESCRIPTION),
		field$2("commitMessage", "string", false, "One-line commit message."),
		field$2("context", "object[]", false, "Documents: {path, required, heading?}."),
		field$2("dependencies", "string[]", false, "Ids of earlier tasks."),
		field$2("docsWaiver", "string|null", false, "Docs contract waiver."),
		field$2("files", "string[]", false, "Canonical project-relative paths."),
		field$2("title", "string", false, "Short task title."),
		field$2("why", "string", false, "Why the task exists.")
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
		field$2("id", "string", true, "Id of the new scope.", { pattern: ID_PATTERN$1.source }),
		{
			code: "SCOPE_APPROVAL",
			description: "The user's direct instruction (trimmed length).",
			minLength: 10,
			name: "approval",
			required: true,
			type: "string"
		},
		field$2("objective", "string", false, "Objective of the new scope; defaults to the old one.")
	],
	rules: ["Needs an open scope (NO_SCOPE) with at least one unfinished task (NOTHING_TO_CARRY).", "Unfinished non-DOCS tasks move to round R1 as TODO; QUALITY and DOCS are rebuilt."]
};
function digestList(name, description) {
	return [field$2(name, "string[]", true, description, {
		limitCode: "ROUND_DIGEST_TOO_LARGE",
		maxItems: 8
	}), field$2(`${name}[]`, "string", false, "One item (UTF-8 bytes).", {
		limitCode: "ROUND_DIGEST_TOO_LARGE",
		maxBytes: 300
	})];
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
		field$2("result", "string", true, "What the round delivered (UTF-8 bytes).", {
			limitCode: "ROUND_DIGEST_TOO_LARGE",
			maxBytes: 600
		}),
		...digestList("decisions", "Decisions taken in the round."),
		...digestList("contracts", "Contracts the round created or changed."),
		...digestList("references", "Documents to read for the round.")
	],
	rules: ["Only the DOCS task of a round takes --digest; without it the commit is refused (ROUND_DIGEST_REQUIRED).", "Every list is present (it may be empty) and holds unique non-empty strings."]
};
var SCHEMAS = [
	scopeSchema("scope:create", "The agreed scope: `scope:create --input <file.json>`."),
	scopeSchema("scope:propose", "The scope body proposed for the user's choice of execution mode; the same body as scope:create."),
	EXTEND_SCHEMA,
	PATCH_SCHEMA,
	CARRYOVER_SCHEMA,
	DIGEST_SCHEMA
];
/** Commands whose JSON input the workflow-plan module describes. */
function planInputSchemaCommands() {
	return SCHEMAS.map((schema) => schema.command);
}
/** A copy of the input descriptor of `command`, or null when it has none. */
function planInputSchema(command) {
	const schema = SCHEMAS.find((item) => item.command === command);
	return schema ? structuredClone(schema) : null;
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-plan/src/plan-service-tasks.ts
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
/** Normalizes one input task; `field` is its input path, e.g. `tasks[0]`. */
function normalizeTaskInput(input, roundId, existing, field) {
	checkTaskInput(input, field);
	const id = input.id ?? nextAutoId(existing);
	ensure(!existing.has(id), "PLAN_SCHEMA", `Duplicate task id: ${id}`, { field: `${field}.id` });
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
		...input.parallelSafe === void 0 || input.parallelSafe === false ? {} : { parallelSafe: input.parallelSafe },
		roundId,
		status: "TODO",
		title: input.title,
		why: input.why ?? input.title
	};
}
function qualityTaskId(plan) {
	const used = new Set(plan.tasks.map((task) => task.id));
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
		acceptance: ["Project stacks are detected or chosen from the architecture", "Quality checks are applied with `quality:apply` and the profile is CONFIGURED"],
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
		acceptance: ["Project-wide documents describe the round result", "The round digest records result, decisions, contracts and references"],
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
/**
* Arranges one round: optional QUALITY before the first functional task,
* ordinary work, DOCS depending on all round work, then delivery tasks
* depending on DOCS.
*/
function arrangeRound(plan, roundId, tasks, options) {
	const delivery = tasks.filter((task) => task.kind === "delivery");
	const work = tasks.filter((task) => task.kind !== "delivery");
	const firstFunctional = work.findIndex((task) => task.kind === "work" && functionalFiles(task).length > 0);
	const hasQuality = plan.tasks.some((task) => task.kind === "quality" && task.status !== "DONE");
	if (!(options.qualityConfigured || hasQuality) && firstFunctional >= 0) {
		const quality = buildQualityTask(plan, roundId);
		work[firstFunctional] = {
			...work[firstFunctional],
			dependencies: [.../* @__PURE__ */ new Set([quality.id, ...work[firstFunctional]?.dependencies ?? []])]
		};
		work.splice(firstFunctional, 0, quality);
	}
	const roundWork = [...plan.tasks.filter((task) => task.roundId === roundId && task.kind !== "docs" && task.kind !== "delivery"), ...work];
	const documentation = work.flatMap((task) => task.files.filter(isDocumentationPath));
	const docs = buildDocsTask(roundId, [...options.docsFiles, ...documentation]);
	docs.dependencies = roundWork.map((task) => task.id);
	const arrangedDelivery = delivery.map((task) => ({
		...task,
		dependencies: [.../* @__PURE__ */ new Set([...task.dependencies, docs.id])]
	}));
	return [
		...work,
		docs,
		...arrangedDelivery
	];
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-plan/src/plan-transitions.ts
/** Returns a deep copy with the revision advanced; every transition starts here. */
function nextRevision(plan) {
	const copy = structuredClone(plan);
	copy.revision += 1;
	return copy;
}
function recomputeDelivery(plan) {
	if (!plan.scope) return;
	if (!(plan.tasks.length > 0 && plan.tasks.every((task) => task.status === "DONE"))) {
		plan.scope.delivery = "IN_PROGRESS";
		plan.scope.acceptanceNote = null;
	} else if (plan.scope.delivery === "IN_PROGRESS") plan.scope.delivery = "READY_FOR_ACCEPTANCE";
}
function decision(text, now) {
	return {
		at: now,
		text
	};
}
function createScope$1(plan, input, context) {
	ensure(plan.scope === null, "SCOPE_EXISTS", "The current scope is still open; close it before creating a new one.");
	ensure(context.baselineCommit, "NO_BASELINE", "The repository needs a first commit before a scope can start.", {}, "Finish the kit bootstrap commit first.");
	checkScopeInput(input);
	const next = nextRevision(plan);
	const ids = /* @__PURE__ */ new Set();
	const tasks = input.tasks.map((task, index) => normalizeTaskInput(task, "R1", ids, `tasks[${index}]`));
	const execution = normalizeExecution(input.execution);
	next.scope = {
		acceptance: input.acceptance,
		acceptanceNote: null,
		approval: decision(input.approval, context.now),
		baselineCommit: context.baselineCommit,
		blockedReason: null,
		context: input.context ?? [],
		decisions: (input.decisions ?? []).map((text) => decision(text, context.now)),
		delivery: "IN_PROGRESS",
		...execution ? { execution } : {},
		id: input.id,
		objective: input.objective,
		spec: input.spec ?? null,
		status: "ACTIVE"
	};
	next.rounds = [{
		digest: null,
		id: "R1",
		kind: "implementation",
		status: "OPEN",
		title: "Implementation"
	}];
	next.tasks = arrangeRound(next, "R1", tasks, {
		docsFiles: input.spec ? [input.spec] : [],
		qualityConfigured: context.qualityConfigured
	});
	next.currentTaskId = null;
	return validatePlan(next);
}
function findTask$1(plan, taskId) {
	const task = plan.tasks.find((item) => item.id === taskId);
	ensure(task, "UNKNOWN_TASK", `Task not found: ${taskId}`);
	return task;
}
function nextReadyTask(plan) {
	const current = plan.tasks.find((task) => task.id === plan.currentTaskId);
	if (current) return current;
	const done = new Set(plan.tasks.filter((task) => task.status === "DONE").map((task) => task.id));
	return plan.tasks.find((task) => task.status === "TODO" && task.dependencies.every((id) => done.has(id))) ?? null;
}
function startTask$1(plan, taskId, confirmation) {
	ensure(plan.scope?.status === "ACTIVE", "SCOPE_NOT_ACTIVE", "Implementation needs an ACTIVE scope.");
	const task = findTask$1(plan, taskId);
	if (plan.currentTaskId === taskId) return plan;
	ensure(plan.currentTaskId === null, "TASK_ALREADY_ACTIVE", `Task ${plan.currentTaskId} is in progress; finish it first.`);
	ensure(task.status === "TODO", "TASK_NOT_TODO", `Task ${taskId} is already ${task.status}.`);
	const pending = task.dependencies.filter((id) => findTask$1(plan, id).status !== "DONE");
	ensure(pending.length === 0, "DEPENDENCY_PENDING", `Finish the dependencies first: ${pending.join(", ")}`, { pending });
	ensure(task.kind !== "delivery" || (confirmation ?? "").trim() !== "", "DELIVERY_CONFIRMATION", "Delivery tasks start only with the user's confirmation (`--confirmed \"...\"`).");
	const next = nextRevision(plan);
	const started = findTask$1(next, taskId);
	started.status = "IN_PROGRESS";
	if (started.kind === "delivery") started.confirmation = confirmation;
	next.currentTaskId = taskId;
	return validatePlan(next);
}
function blockScope(plan, reason) {
	ensure(plan.scope?.status === "ACTIVE", "SCOPE_NOT_ACTIVE", "Only an ACTIVE scope can be blocked.");
	ensure(typeof reason === "string" && reason.trim() !== "", "BLOCK_REASON", "Give the reason of the block.");
	const next = nextRevision(plan);
	if (next.scope) {
		next.scope.status = "BLOCKED";
		next.scope.blockedReason = reason.trim();
	}
	return validatePlan(next);
}
function unblockScope(plan) {
	ensure(plan.scope?.status === "BLOCKED", "SCOPE_NOT_BLOCKED", "The scope is not blocked.");
	const next = nextRevision(plan);
	if (next.scope) {
		next.scope.status = "ACTIVE";
		next.scope.blockedReason = null;
	}
	return validatePlan(next);
}
/** A round closes once all of its tasks are DONE and its digest is recorded. */
function closeFinishedRounds(plan) {
	for (const round of plan.rounds) {
		const tasks = plan.tasks.filter((task) => task.roundId === round.id);
		if (round.status === "OPEN" && round.digest && tasks.every((task) => task.status === "DONE")) round.status = "CLOSED";
	}
}
/** Marks the current task DONE; a DOCS task also closes its round with the digest. */
function completeTask(plan, taskId, digest) {
	ensure(plan.currentTaskId === taskId, "TASK_NOT_ACTIVE", `Start the task first: task:start ${taskId}`);
	const next = nextRevision(plan);
	const task = findTask$1(next, taskId);
	task.status = "DONE";
	next.currentTaskId = null;
	if (task.kind === "docs") {
		validateDigest(digest);
		const round = next.rounds.find((item) => item.id === task.roundId);
		if (round && digest) round.digest = {
			contracts: [...digest.contracts],
			decisions: [...digest.decisions],
			references: [...digest.references],
			result: digest.result
		};
	}
	closeFinishedRounds(next);
	recomputeDelivery(next);
	return validatePlan(next);
}
/**
* Marks a TODO `work` or `DOCS` task of an orchestrated scope DONE through
* its integration commit (spec 7): the `startTask` checks (ACTIVE scope, no
* task in progress, TODO, dependencies DONE), then `completeTask` (a DOCS
* task needs the digest), as one revision with `integration` recorded.
*/
function integrateTask(plan, taskId, integration) {
	ensure(plan.scope?.execution?.strategy === "orchestrated", "NOT_ORCHESTRATED", "Only a task of an orchestrated scope is integrated.");
	const kind = findTask$1(plan, taskId).kind;
	ensure(kind === "work" || kind === "docs", "TASK_KIND", `${taskId} is a ${kind} task; only work and DOCS tasks are integrated.`);
	const next = completeTask(startTask$1(plan, taskId, null), taskId, integration.digest);
	next.revision = plan.revision + 1;
	findTask$1(next, taskId).integration = {
		operationId: integration.operationId,
		sourceCommit: integration.sourceCommit
	};
	return validatePlan(next);
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-plan/src/plan-rounds.ts
var ROUND_NUMBER_PATTERN = /^R([0-9]+)$/u;
function nextRoundId(plan) {
	const numbers = plan.rounds.map((round) => Number(ROUND_NUMBER_PATTERN.exec(round.id)?.[1] ?? 0));
	return `R${Math.max(0, ...numbers) + 1}`;
}
function roundTasks(plan, roundId) {
	return plan.tasks.filter((task) => task.roundId === roundId);
}
function docsDone(plan, round) {
	return roundTasks(plan, round.id).some((task) => task.kind === "docs" && task.status === "DONE");
}
function needsQuality(plan, tasks, qualityConfigured) {
	const pending = plan.tasks.some((task) => task.kind === "quality" && task.status !== "DONE");
	return !(qualityConfigured || pending) && tasks.some((task) => task.kind === "work" && functionalFiles(task).length > 0);
}
function startNewRound(plan, input, tasks, context) {
	const last = plan.rounds.at(-1);
	const roundId = nextRoundId(plan);
	let carried = [];
	if (last && last.status === "OPEN") {
		const pending = roundTasks(plan, last.id).filter((task) => task.status !== "DONE");
		ensure(pending.every((task) => task.kind === "delivery" && task.status === "TODO"), "ROUND_OPEN", `Round ${last.id} still has unfinished work; extend it with round "current".`);
		carried = pending.map((task) => ({
			...task,
			dependencies: task.dependencies.filter((id) => id !== docsTaskId(last.id)),
			roundId
		}));
		plan.tasks = plan.tasks.filter((task) => !carried.some((item) => item.id === task.id));
		last.status = "CLOSED";
	}
	plan.rounds.push({
		digest: null,
		id: roundId,
		kind: input.kind ?? "fixes",
		status: "OPEN",
		title: input.title ?? "Fixes"
	});
	for (const task of tasks) task.roundId = roundId;
	plan.tasks.push(...arrangeRound(plan, roundId, [...tasks, ...carried], {
		docsFiles: [],
		qualityConfigured: context.qualityConfigured
	}));
	return roundId;
}
function insertBefore(list, task, beforeId, fallbackId) {
	const target = beforeId ?? fallbackId;
	const index = list.findIndex((item) => item.id === target);
	ensure(index >= 0, "UNKNOWN_TASK", `Task not found for insertion: ${target}`);
	const anchor = list[index];
	ensure(beforeId === void 0 || anchor?.status === "TODO", "TASK_STARTED", `Insert only before a task that has not started: ${target}`);
	if (beforeId !== void 0 && anchor) anchor.dependencies = [.../* @__PURE__ */ new Set([...anchor.dependencies, task.id])];
	list.splice(index, 0, task);
}
function addQualityIfNeeded(plan, roundId, placed, context) {
	if (!needsQuality(plan, placed.map((item) => item.task).filter((task) => task.kind !== "delivery"), context.qualityConfigured)) return;
	const quality = buildQualityTask(plan, roundId);
	const firstFunctional = placed.find((item) => item.task.kind === "work" && functionalFiles(item.task).length > 0);
	if (firstFunctional) {
		firstFunctional.task.dependencies = [.../* @__PURE__ */ new Set([quality.id, ...firstFunctional.task.dependencies])];
		placed.splice(placed.indexOf(firstFunctional), 0, {
			before: firstFunctional.before,
			task: quality
		});
	}
}
function extendOpenRound(plan, round, placed, context) {
	const docs = plan.tasks.find((task) => task.id === docsTaskId(round.id));
	ensure(docs, "DOCS_TASK", `Round ${round.id} has no DOCS task.`);
	let deferred = null;
	if (docs.status === "IN_PROGRESS") {
		docs.status = "TODO";
		plan.currentTaskId = null;
		deferred = docs.id;
	}
	addQualityIfNeeded(plan, round.id, placed, context);
	for (const { before, task } of placed.filter((item) => item.task.kind !== "delivery")) insertBefore(plan.tasks, task, before, docs.id);
	for (const { task } of placed.filter((item) => item.task.kind === "delivery")) plan.tasks.push({
		...task,
		dependencies: [.../* @__PURE__ */ new Set([...task.dependencies, docs.id])]
	});
	const roundWork = roundTasks(plan, round.id).filter((task) => task.kind === "work" || task.kind === "quality");
	docs.dependencies = roundWork.map((task) => task.id);
	docs.files = [.../* @__PURE__ */ new Set([...docs.files, ...roundWork.flatMap((task) => task.files.filter(isDocumentationPath))])];
	return deferred;
}
/** Adds tasks to the open round or to a new round; finished records stay untouched. */
function extendPlan(plan, input, context) {
	ensure(plan.scope !== null, "NO_SCOPE", "There is no active scope to extend.");
	checkExtendInput(input);
	const next = nextRevision(plan);
	const ids = new Set(next.tasks.map((task) => task.id));
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
		ensure(placed.every((item) => item.before === void 0), "PLAN_SCHEMA", "`before` applies only to the current round.", { field: "tasks[].before" });
		roundId = startNewRound(next, input, placed.map((item) => item.task), context);
	} else if (last) deferred = extendOpenRound(next, last, placed, context);
	recomputeDelivery(next);
	return {
		deferredDocsTaskId: deferred,
		plan: validatePlan(next),
		roundId
	};
}
/** Moves an in-progress DOCS task back to TODO (repair action defer-docs). */
function deferDocs(plan) {
	const current = plan.tasks.find((task) => task.id === plan.currentTaskId);
	ensure(current?.kind === "docs", "NOT_DOCS", "The current task is not a DOCS task.");
	const next = nextRevision(plan);
	const docs = next.tasks.find((task) => task.id === current.id);
	if (docs) docs.status = "TODO";
	next.currentTaskId = null;
	return validatePlan(next);
}
function acceptScope$1(plan, note, now) {
	ensure(plan.scope?.delivery === "READY_FOR_ACCEPTANCE", "NOT_READY", "Acceptance needs every task DONE (READY_FOR_ACCEPTANCE).");
	ensure(typeof note === "string" && note.trim().length >= 3, "ACCEPTANCE_NOTE", "Record the user's acceptance words in --note.");
	const next = nextRevision(plan);
	if (next.scope) {
		next.scope.delivery = "ACCEPTED";
		next.scope.acceptanceNote = {
			at: now,
			text: note.trim()
		};
	}
	return validatePlan(next);
}
function closeScope$1(plan, scopeId, note, now) {
	ensure(plan.scope && plan.scope.id === scopeId, "SCOPE_ID", "Pass the exact id of the scope to close (--scope).");
	ensure(plan.scope.delivery === "ACCEPTED", "NOT_ACCEPTED", "Only an ACCEPTED scope closes; record acceptance first.");
	ensure(typeof note === "string" && note.trim().length >= 10, "USER_CLOSE_REQUIRED", "Closing needs the user's direct command in --note; acceptance alone is not one.");
	const closed = emptyPlan(plan.projectId, plan.projectName);
	closed.revision = plan.revision + 1;
	closed.lastClosed = {
		closedAt: now,
		scopeId
	};
	return validatePlan(closed);
}
/** Closes the current scope and opens a new one with every unfinished task. */
function carryoverScope$1(plan, input, context) {
	const scope = plan.scope;
	ensure(scope, "NO_SCOPE", "There is no scope to carry over.");
	checkCarryoverInput(input);
	ensure(context.baselineCommit, "NO_BASELINE", "carryover needs the current HEAD.");
	const done = new Set(plan.tasks.filter((task) => task.status === "DONE").map((task) => task.id));
	const unfinished = plan.tasks.filter((task) => task.status !== "DONE" && task.kind !== "docs");
	ensure(unfinished.length > 0, "NOTHING_TO_CARRY", "Every task is DONE; accept and close the scope instead.");
	const next = nextRevision(plan);
	const tasks = unfinished.map((task) => ({
		...structuredClone(task),
		confirmation: null,
		dependencies: task.dependencies.filter((id) => !done.has(id) && unfinished.some((item) => item.id === id)),
		fixes: unfinished.some((item) => item.id === task.fixes) ? task.fixes : null,
		roundId: "R1",
		status: "TODO"
	}));
	next.lastClosed = {
		closedAt: context.now,
		scopeId: scope.id
	};
	next.scope = {
		...structuredClone(scope),
		acceptanceNote: null,
		approval: {
			at: context.now,
			text: input.approval.trim()
		},
		baselineCommit: context.baselineCommit,
		blockedReason: null,
		decisions: [{
			at: context.now,
			text: `Carried over unfinished tasks from scope ${scope.id}.`
		}],
		delivery: "IN_PROGRESS",
		id: input.id,
		objective: input.objective ?? scope.objective,
		status: "ACTIVE"
	};
	next.rounds = [{
		digest: null,
		id: "R1",
		kind: "implementation",
		status: "OPEN",
		title: "Carried over"
	}];
	next.tasks = [];
	next.currentTaskId = null;
	next.tasks = arrangeRound(next, "R1", tasks.filter((task) => task.kind !== "quality"), {
		docsFiles: scope.spec ? [scope.spec] : [],
		qualityConfigured: context.qualityConfigured
	});
	return validatePlan(next);
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-plan/src/workflow-plan-facade.ts
/**
* Public boundary of the workflow-plan module: the plan model, its
* validation, the Markdown document and every state transition.
*/
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
	parse(text, options) {
		return parsePlanDocument(text, options);
	}
	isPlanDocument(text) {
		return isWorkflowPlanDocument(text);
	}
	planFile(root) {
		return path.join(root, ...PLAN_PATH.split("/"));
	}
	/** Reads the project plan; returns null when the project has no plan file. */
	read(root, options) {
		const text = workflowPlatformFacade.readTextIfExists(this.planFile(root));
		return text === null ? null : parsePlanDocument(text, options);
	}
	createScope(plan, input, context) {
		return createScope$1(plan, input, context);
	}
	startTask(plan, taskId, confirmation = null) {
		return startTask$1(plan, taskId, confirmation);
	}
	completeTask(plan, taskId, digest = null) {
		return completeTask(plan, taskId, digest);
	}
	/** DONE through an integration commit of an orchestrated scope (spec 7). */
	integrateTask(plan, taskId, integration) {
		return integrateTask(plan, taskId, integration);
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
		return acceptScope$1(plan, note, now);
	}
	close(plan, scopeId, note, now) {
		return closeScope$1(plan, scopeId, note, now);
	}
	carryover(plan, input, context) {
		return carryoverScope$1(plan, input, context);
	}
	task(plan, taskId) {
		return findTask$1(plan, taskId);
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
		const text = renderPlanDocument(plan);
		workflowPlatformFacade.writeFileAtomic(this.planFile(root), text);
		return text;
	}
};
var workflowPlanFacade = new WorkflowPlanFacade();
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-git/src/git-transaction.ts
var COMMIT_TIMEOUT_MS = 1800 * 1e3;
var NEXT_ACTION_RETRY = "Fix the reported problem and repeat the same command; your edits are kept.";
function head$1(git, root) {
	const output = git.run(root, [
		"rev-parse",
		"--verify",
		"-q",
		"HEAD"
	], { allowFailure: true });
	return output.status === 0 ? output.stdout.trim() : null;
}
/** The commit being merged (`MERGE_HEAD`), or null when no merge is in progress. */
function mergeHead(git, root) {
	const output = git.run(root, [
		"rev-parse",
		"--verify",
		"-q",
		"MERGE_HEAD^{commit}"
	], { allowFailure: true });
	return output.status === 0 ? output.stdout.trim() : null;
}
function planAbsolute(root, planPath) {
	return path.join(root, ...planPath.split("/"));
}
function indexFile(git, root) {
	return git.text(root, [
		"rev-parse",
		"--path-format=absolute",
		"--git-path",
		"index"
	]);
}
/** Returns the SHA when HEAD is exactly the commit this journal produced. */
function confirmedCommit(git, root, journal) {
	const now = head$1(git, root);
	if (!now || now === journal.beforeHead) return null;
	const [commit] = readHistory(git, root, journal.beforeHead, now, { firstParent: true }).slice(-1);
	if (!commit || commit.trailers["Workflow-Transaction"]?.[0] !== journal.id) return null;
	const parents = [journal.beforeHead, journal.sourceCommit ?? null].filter((sha) => sha !== null);
	ensure(commit.parents.join(" ") === parents.join(" "), "TRANSACTION_PARENT", "The commit parents do not match the transaction.");
	ensure(git.text(root, ["rev-parse", "HEAD^{tree}"]) === journal.candidateTree, "TRANSACTION_TREE", "The commit content differs from the prepared candidate.");
	return now;
}
/** Hook evidence of a transaction until its commit exists. */
function pendingEvidence(root, journal) {
	return localPath(root, "verification", `pending-${journal.id}.json`);
}
function finalize(root, journal, sha) {
	const pending = pendingEvidence(root, journal);
	if (existsSync(pending)) {
		const evidence = {
			...JSON.parse(readFileSync(pending, "utf8")),
			commit: sha
		};
		const text = `${JSON.stringify(evidence, null, 2)}\n`;
		workflowPlatformFacade.writeFileAtomic(localPath(root, "verification", `${sha}.json`), text);
		workflowPlatformFacade.writeFileAtomic(localPath(root, "verification", "last.json"), text);
		rmSync(pending, { force: true });
	}
	workflowPlatformFacade.writeFileAtomic(localPath(root, "last-commit.json"), `${JSON.stringify({
		role: journal.role,
		scopeId: journal.scopeId,
		sha,
		taskId: journal.taskId,
		transaction: journal.id
	}, null, 2)}\n`);
	removeJournal$1(root);
	return {
		excluded: journal.excluded,
		role: journal.role,
		sha,
		taskId: journal.taskId
	};
}
function rollback(git, root, journal) {
	const plan = planAbsolute(root, journal.planPath);
	if (!(head$1(git, root) === journal.beforeHead && existsSync(plan) && sha256$1(readFileSync(plan)) === journal.candidateHash && git.text(root, ["write-tree"]) === journal.candidateTree)) return false;
	discardPreparation(git, root, journal);
	return true;
}
/**
* Restores the index from `index-before` (or the HEAD tree, or empty without
* commits) and the plan from the journal, never touching other working-tree
* files, then records the journal as failed and removes it. `rollback` calls
* it when nothing changed since the preparation; `repair --cancel` also
* when the index or plan changed but HEAD did not.
*/
function discardPreparation(git, root, journal) {
	const backup = localPath(root, "index-before");
	const plan = planAbsolute(root, journal.planPath);
	if (existsSync(backup)) workflowPlatformFacade.writeFileAtomic(indexFile(git, root), readFileSync(backup));
	else if (journal.beforeHead) git.run(root, ["read-tree", journal.beforeHead]);
	else git.run(root, ["read-tree", "--empty"]);
	if (journal.originalPlan === null) rmSync(plan, { force: true });
	else workflowPlatformFacade.writeFileAtomic(plan, journal.originalPlan);
	workflowPlatformFacade.writeFileAtomic(localPath(root, "verification", `failed-${journal.id}.json`), `${JSON.stringify(journal, null, 2)}\n`);
	rmSync(pendingEvidence(root, journal), { force: true });
	removeJournal$1(root);
}
/** The given paths that git ignores; read through stdin, so any count fits. */
function ignoredPaths(git, root, files) {
	if (files.length === 0) return /* @__PURE__ */ new Set();
	const output = git.run(root, [
		"check-ignore",
		"-z",
		"--stdin"
	], {
		allowFailure: true,
		input: `${files.join("\0")}\u0000`
	});
	ensure(output.status === 0 || output.status === 1, "GIT_FAILED", `git check-ignore failed: ${output.stderr.trim() || output.stdout.trim()}`, {
		args: [
			"check-ignore",
			"-z",
			"--stdin"
		],
		status: output.status
	});
	return new Set(output.stdout.split("\0").filter(Boolean));
}
/**
* Stages the selected paths. Index paths are added as they are on disk. A
* path outside the index is added only when it exists and git does not
* ignore it: a deletion already staged for an ignored or missing path (for
* example after `git rm -r --cached node_modules`) stays in the index as is.
*/
function stage(git, root, files) {
	const tracked = new Set(git.run(root, [
		"ls-files",
		"-z",
		"--",
		...files
	]).stdout.split("\0").filter(Boolean));
	const untracked = new Set(files.filter((file) => !tracked.has(file) && existsSync(path.join(root, ...file.split("/")))));
	const ignored = ignoredPaths(git, root, [...untracked]);
	const stageable = files.filter((file) => tracked.has(file) || untracked.has(file) && !ignored.has(file));
	if (stageable.length > 0) git.run(root, [
		"add",
		"-A",
		"--",
		...stageable
	]);
}
function prepareJournal(git, root, request, id) {
	const plan = planAbsolute(root, request.planPath);
	const originalPlan = existsSync(plan) ? readFileSync(plan, "utf8") : null;
	const index = indexFile(git, root);
	if (existsSync(index)) copyFileSync(index, localPath(root, "index-before"));
	return {
		assignmentId: request.assignmentId ?? null,
		beforeHead: head$1(git, root),
		candidateHash: sha256$1(request.planText),
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
/**
* Creates one commit through a journaled transaction. Failed hook checks roll
* the plan and index back while keeping every working-tree edit.
*/
function commitCandidate(git, root, request, id) {
	ensure(readJournal$1(root) === null, "TRANSACTION_PENDING", "Another commit transaction is unfinished.", {}, "Run `scripts/workflow repair` to finish or cancel it.");
	const merging = mergeHead(git, root);
	ensure(merging === (request.sourceCommit ?? null), request.sourceCommit ? "MERGE_REQUIRED" : "MERGE_IN_PROGRESS", request.sourceCommit ? `An integration commit needs the merge of ${request.sourceCommit} in progress.` : "A merge is in progress; only the integration of its source commits it.", {
		mergeHead: merging,
		source: request.sourceCommit ?? null
	}, request.sourceCommit ? "Run `scripts/workflow integration:continue --id <assignment>`." : "Finish it with `scripts/workflow integration:continue --id <assignment>` or abort it with `git merge --abort`.");
	const staged = readChanges(git, root).staged;
	const allowed = /* @__PURE__ */ new Set([...request.files, request.planPath]);
	const foreign = staged.filter((file) => !allowed.has(file));
	ensure(foreign.length === 0, "FOREIGN_STAGED", "The index holds files outside this operation; unstage them first.", { paths: foreign });
	const identity = requireCommitIdentity(git, root);
	mkdirSync(localPath(root), { recursive: true });
	const journal = prepareJournal(git, root, request, id);
	saveJournal$1(root, journal);
	request.prepare?.(request.files);
	workflowPlatformFacade.writeFileAtomic(planAbsolute(root, request.planPath), request.planText);
	stage(git, root, journal.selected);
	if (!(git.run(root, [
		"diff",
		"--cached",
		"--quiet"
	], { allowFailure: true }).status === 1)) {
		rollback(git, root, {
			...journal,
			candidateTree: git.text(root, ["write-tree"])
		});
		throw new WorkflowError("NOTHING_TO_COMMIT", "There are no changes to commit.");
	}
	journal.candidateTree = git.text(root, ["write-tree"]);
	journal.phase = "PREPARED";
	saveJournal$1(root, journal);
	const result = git.run(root, [
		...identityArgs(identity),
		"commit",
		"-q",
		"-F",
		"-"
	], {
		allowFailure: true,
		env: identityEnv(identity),
		input: commitMessageFor(journal),
		timeoutMs: COMMIT_TIMEOUT_MS
	});
	if (result.status !== 0) {
		const failed = {
			...readJournal$1(root) ?? journal,
			error: `${result.stderr}${result.stdout}`.slice(-8e3),
			phase: "FAILED"
		};
		saveJournal$1(root, failed);
		const restored = rollback(git, root, failed);
		throw new WorkflowError("COMMIT_FAILED", restored ? "A commit check failed. The plan and index were restored; your edits are kept." : "The commit failed and the project changed concurrently; the journal is kept.", {
			output: failed.error,
			retryable: restored
		}, restored ? NEXT_ACTION_RETRY : "Run `scripts/workflow repair`.");
	}
	const sha = confirmedCommit(git, root, journal);
	ensure(sha, "COMMIT_NOT_CONFIRMED", "Git finished but the expected commit was not found.", {}, "Run `scripts/workflow repair`.");
	return finalize(root, readJournal$1(root) ?? journal, sha);
}
/** Finishes the bookkeeping of a transaction whose commit already exists. */
function finishConfirmed(git, root) {
	const journal = readJournal$1(root);
	if (!journal) return null;
	const sha = confirmedCommit(git, root, journal);
	return sha ? finalize(root, journal, sha) : null;
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-git/src/git-repair.ts
var MESSAGES = {
	"defer-docs": "Move the in-progress DOCS task back to TODO until the added work is done; files are kept.",
	"finish-commit": "The commit exists; finish the transaction bookkeeping.",
	none: "No damage found.",
	projection: "Rebuild the readable part of the plan from its JSON state.",
	"retry-commit": "Repeat the prepared commit transaction; edits are kept."
};
function head(git, root) {
	return git.run(root, [
		"rev-parse",
		"--verify",
		"-q",
		"HEAD"
	], { allowFailure: true }).stdout.trim();
}
function planText(root, planPath) {
	return workflowPlatformFacade.readTextIfExists(path.join(root, ...planPath.split("/"))) ?? "";
}
function detect(git, root, planPath) {
	const journal = readJournal$1(root);
	if (journal) return confirmedCommit(git, root, journal) ? "finish-commit" : "retry-commit";
	const text = planText(root, planPath);
	if (!workflowPlanFacade.isPlanDocument(text)) return "none";
	const plan = workflowPlanFacade.parse(text, { projection: false });
	if (workflowPlanFacade.render(plan) !== text.replaceAll("\r\n", "\n")) return "projection";
	const current = plan.tasks.find((task) => task.id === plan.currentTaskId);
	return current?.kind === "docs" && current.dependencies.some((id) => plan.tasks.find((task) => task.id === id)?.status !== "DONE") ? "defer-docs" : "none";
}
/** Dry run: what repair would do, with an id that pins the observed state. */
function planRepair(git, root, planPath) {
	const kind = detect(git, root, planPath);
	const journal = readJournal$1(root);
	const repairId = sha256$1(JSON.stringify([
		kind,
		head(git, root),
		sha256$1(planText(root, planPath)),
		journal?.id ?? null
	])).slice(0, 24);
	return {
		kind,
		message: MESSAGES[kind],
		repairId
	};
}
function retry(git, root, repairId) {
	const journal = readJournal$1(root);
	ensure(journal, "NO_TRANSACTION", "There is no transaction to retry.");
	ensure(rollback(git, root, journal), "REPAIR_MANUAL", "HEAD, plan or index changed after preparation; the prepared commit cannot be repeated.", {}, `Cancel the preparation with \`scripts/workflow repair --cancel ${repairId}\` (working-tree edits are kept), then repeat the commit command.`);
	return commitCandidate(git, root, {
		assignmentId: journal.assignmentId ?? null,
		checks: journal.checks,
		excluded: journal.excluded,
		files: journal.selected.filter((file) => file !== journal.planPath),
		iteration: journal.iteration,
		message: journal.message,
		planPath: journal.planPath,
		planText: journal.candidatePlan,
		role: journal.role,
		scopeId: journal.scopeId,
		sourceCommit: journal.sourceCommit ?? null,
		taskId: journal.taskId
	}, journal.id);
}
function applyRepair(git, root, planPath, repairId) {
	const planned = planRepair(git, root, planPath);
	ensure(planned.repairId === repairId, "REPAIR_CHANGED", "The project changed; run `repair` again for a fresh id.");
	if (planned.kind === "finish-commit") return {
		commit: finishConfirmed(git, root),
		kind: planned.kind,
		message: planned.message
	};
	if (planned.kind === "retry-commit") return {
		commit: retry(git, root, repairId),
		kind: planned.kind,
		message: planned.message
	};
	const text = readFileSync(path.join(root, ...planPath.split("/")), "utf8");
	const plan = workflowPlanFacade.parse(text, { projection: false });
	if (planned.kind === "projection") workflowPlanFacade.write(root, plan);
	else if (planned.kind === "defer-docs") workflowPlanFacade.write(root, workflowPlanFacade.deferDocs(plan));
	return {
		commit: null,
		kind: planned.kind,
		message: planned.message
	};
}
function cancelRepair(git, root, planPath, repairId) {
	const planned = planRepair(git, root, planPath);
	ensure(planned.repairId === repairId, "REPAIR_CHANGED", "The project changed; run `repair` again for a fresh id.");
	ensure(planned.kind === "retry-commit", "NO_PREPARATION", "Only an unconfirmed commit preparation can be cancelled.");
	const journal = readJournal$1(root);
	ensure(journal, "NO_PREPARATION", "There is no preparation to cancel.");
	if (rollback(git, root, journal)) return {
		commit: null,
		kind: "cancel",
		message: "Preparation cancelled; edits are kept and the task stays open."
	};
	const now = head(git, root) || null;
	ensure(now === journal.beforeHead, "REPAIR_MANUAL", `HEAD moved from ${journal.beforeHead ?? "no commit"} to ${now ?? "no commit"} after the preparation; the Kit does not undo commits.`, {
		beforeHead: journal.beforeHead,
		head: now
	}, journal.beforeHead ? `Ask the user. To cancel the preparation, return HEAD with \`git reset --soft ${journal.beforeHead}\` (every change stays in the working tree) and run \`scripts/workflow repair\` again.` : "Ask the user how to resolve it; the Kit cannot restore a repository that had no commit.");
	discardPreparation(git, root, journal);
	return {
		commit: null,
		kind: "cancel",
		message: "Preparation cancelled: the index and plan were restored from before the preparation; working-tree files are kept and the task stays open."
	};
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-git/src/git-runner.ts
var DEFAULT_TIMEOUT_MS$1 = 12e4;
/** Thin synchronous git runner bound to one environment. */
var GitRunner = class {
	env;
	platform;
	constructor(platform, env) {
		this.platform = platform;
		this.env = env;
	}
	run(root, args, options = {}) {
		const result = this.platform.run({
			args,
			cwd: root,
			env: options.env ? {
				...this.env,
				...options.env
			} : this.env,
			executable: "git",
			input: options.input,
			timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS$1
		});
		ensure(result.errorMessage === null || result.status !== null, "GIT_UNAVAILABLE", `Git could not run: ${result.errorMessage ?? "unknown error"}`, {}, "Install Git and make sure it is on PATH.");
		const output = {
			status: result.status ?? 1,
			stderr: result.stderr,
			stdout: result.stdout
		};
		ensure(options.allowFailure || output.status === 0, "GIT_FAILED", `git ${args.join(" ")} failed: ${output.stderr.trim() || output.stdout.trim()}`, {
			args,
			status: output.status
		});
		return output;
	}
	text(root, args, options = {}) {
		return this.run(root, args, options).stdout.trim();
	}
	succeeds(root, args) {
		return this.run(root, args, { allowFailure: true }).status === 0;
	}
};
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-git/src/git-task-files.ts
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
function isPrivatePath(file) {
	return PRIVATE_PATTERNS.some((pattern) => pattern.test(file));
}
function isKitManagedPath(file) {
	return KIT_MANAGED_PREFIXES.some((prefix) => file.startsWith(prefix));
}
function baselineFile(root, identity) {
	return localPath(root, "task-files", `${sha256$1(JSON.stringify([
		identity.scopeId,
		identity.taskId,
		identity.iteration
	])).slice(0, 24)}.json`);
}
function fingerprint(root, file) {
	const absolute = path.join(root, ...file.split("/"));
	const stat = lstatSync(absolute, { throwIfNoEntry: false });
	if (!stat) return "deleted";
	if (stat.isSymbolicLink()) return `link:${readlinkSync(absolute)}`;
	return stat.isDirectory() ? "directory" : sha256$1(readFileSync(absolute));
}
/** Records the changes that already existed when the task started. */
function recordBaseline(root, identity, changed) {
	const preexisting = changed.filter((file) => !isKitManagedPath(file));
	const baseline = {
		...identity,
		fingerprints: Object.fromEntries(preexisting.map((file) => [file, fingerprint(root, file)])),
		preexisting
	};
	workflowPlatformFacade.writeFileAtomic(baselineFile(root, identity), `${JSON.stringify(baseline, null, 2)}\n`);
	return baseline;
}
function readBaseline(root, identity) {
	const file = baselineFile(root, identity);
	return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}
/**
* Chooses the files of a task commit: explicit files when given, otherwise
* everything changed since task:start. Kit state and private files are never
* chosen implicitly; everything else that changed is reported as excluded.
*/
function selectTaskFiles(root, identity, changed, explicit) {
	const baseline = readBaseline(root, identity);
	let selected;
	if (explicit) {
		selected = [...new Set(explicit.map((file) => workflowPlatformFacade.normalizeRelative(file)))];
		for (const file of selected) ensure(!isKitManagedPath(file), "MANAGED_FILE", `Workflow Kit state changes only through its commands: ${file}`, { path: file });
	} else {
		ensure(baseline, "TASK_FILES_UNKNOWN", "There is no task:start snapshot; list the files with --files.", {}, `commit --task ${identity.taskId} --files '["path/to/file"]'`);
		const mixed = baseline.preexisting.filter((file) => changed.includes(file) && baseline.fingerprints[file] !== fingerprint(root, file));
		ensure(mixed.length === 0, "EXISTING_EDITS_CHANGED", "Files that had edits before the task changed again; choose the files explicitly with --files.", { paths: mixed });
		selected = changed.filter((file) => !(baseline.preexisting.includes(file) || isKitManagedPath(file) || isPrivatePath(file)));
	}
	const actual = selected.filter((file) => changed.includes(file)).sort();
	return {
		excluded: changed.filter((file) => !(actual.includes(file) || isKitManagedPath(file))),
		preexisting: baseline?.preexisting ?? null,
		selected: actual
	};
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-git/src/workflow-git-facade.ts
/**
* Public boundary of the workflow-git module: git queries, the transactional
* task commit, commit reference resolution and repair.
*/
var WorkflowGitFacade = class {
	/** The fix text of identity refusals: the two `git config --global` commands. */
	identityFix = IDENTITY_FIX_COMMANDS;
	git;
	platform;
	constructor(platform = workflowPlatformFacade, env = process.env) {
		this.platform = platform;
		this.git = new GitRunner(platform, env);
	}
	isRepository(path) {
		return this.git.succeeds(path, ["rev-parse", "--is-inside-work-tree"]);
	}
	topLevel(path) {
		return this.git.text(path, ["rev-parse", "--show-toplevel"]);
	}
	init(root, branch = "main") {
		this.git.run(root, [
			"init",
			"-q",
			`--initial-branch=${branch}`
		]);
	}
	/** Full HEAD SHA, or null in a repository without commits. */
	head(root) {
		const output = this.git.run(root, [
			"rev-parse",
			"--verify",
			"-q",
			"HEAD"
		], { allowFailure: true });
		return output.status === 0 ? output.stdout.trim() : null;
	}
	identity(root) {
		const name = this.git.run(root, ["config", "user.name"], { allowFailure: true }).stdout.trim();
		const email = this.git.run(root, ["config", "user.email"], { allowFailure: true }).stdout.trim();
		return name && email ? {
			email,
			name
		} : null;
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
	show(root, revision, path) {
		const output = this.git.run(root, ["show", `${revision}:${path}`], { allowFailure: true });
		return output.status === 0 ? output.stdout : null;
	}
	config(root, key) {
		const value = this.git.run(root, [
			"config",
			"--get",
			key
		], { allowFailure: true }).stdout.trim();
		return value === "" ? null : value;
	}
	setConfig(root, key, value) {
		this.git.run(root, [
			"config",
			key,
			value
		]);
	}
	localPath(root, ...parts) {
		return localPath(root, ...parts);
	}
	isKitManagedPath(file) {
		return isKitManagedPath(file);
	}
	isPrivatePath(file) {
		return isPrivatePath(file);
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
				const journal = readJournal$1(root);
				return journal ? rollback(this.git, root, journal) : false;
			},
			commit: (root, request) => commitCandidate(this.git, root, request, request.transactionId ?? randomUUID()),
			confirmed: (root, journal) => confirmedCommit(this.git, root, journal),
			finish: (root) => finishConfirmed(this.git, root),
			journal: (root) => readJournal$1(root)
		};
	}
	/** The commit being merged (`MERGE_HEAD`), or null without a merge in progress. */
	mergeHead(root) {
		return mergeHead(this.git, root);
	}
	/** Paths with unresolved merge conflicts, sorted. */
	conflicts(root) {
		return this.git.run(root, [
			"diff",
			"--name-only",
			"-z",
			"--diff-filter=U"
		]).stdout.split("\0").filter(Boolean).sort();
	}
	/** Maps each task to its commit; throws when plan and history disagree. */
	resolveReferences(root, plan, planPath) {
		return resolveTaskReferences(this.git, root, plan, planPath, readJournal$1(root));
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
		return this.git.text(root, [
			"rev-parse",
			"--path-format=absolute",
			"--git-path",
			name
		]);
	}
};
var workflowGitFacade = new WorkflowGitFacade();
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-recovery/src/recovery-model.ts
var RECOVERY_SCHEMA = "harness-workflow-recovery/1";
var KIT_COMMAND = "scripts/workflow";
function byteLength(text) {
	return Buffer.byteLength(text, "utf8");
}
/** Cuts text to at most `limit` UTF-8 bytes without splitting a character. */
function cutBytes(text, limit) {
	if (byteLength(text) <= limit) return text;
	let result = Buffer.from(text, "utf8").subarray(0, Math.max(0, limit)).toString("utf8");
	while (result.endsWith("�")) result = result.slice(0, -1);
	return result;
}
function shortSha(sha) {
	return sha ? sha.slice(0, 8) : "none";
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-quality/src/quality-config.ts
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
var DEFAULT_TIMEOUT_MS = 12e4;
var MIN_RECOVERY_BYTES = 8e3;
var MAX_RECOVERY_BYTES = 12e4;
var DEFAULT_BRIEF_BYTES = 6e4;
var MAX_BRIEF_BYTES = 2e5;
var error = "CONFIG_SCHEMA";
/** A builtin check definition: required, commit stage, default timeout. */
function builtinCheck(id) {
	return {
		builtin: id,
		id,
		required: true,
		role: "custom",
		stage: "commit",
		timeoutMs: DEFAULT_TIMEOUT_MS
	};
}
/** Fills optional check fields with their documented defaults. */
function normalizeCheck(input) {
	return {
		...input,
		required: input.required ?? false,
		timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS
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
		policy: {
			maxFileLines: null,
			taskFileSoftLimit: null
		},
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
function positiveInteger(value, field, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
	ensure(Number.isSafeInteger(value) && value >= min && value <= max, error, `${field} must be an integer between ${min} and ${max}.`, { field });
}
function validateCommand(check, field) {
	ensure(Boolean(check.command) !== Boolean(check.builtin), error, `Check ${check.id} needs exactly one of command or builtin.`, { field: `${field}.command` });
	if (check.builtin) {
		ensure(BUILTINS.has(check.builtin), error, `Unknown builtin check: ${check.builtin}`, { field: `${field}.builtin` });
		return;
	}
	const command = check.command;
	ensure(command && typeof command.executable === "string" && command.executable.trim() !== "", error, `Check ${check.id} needs command.executable.`, { field: `${field}.command.executable` });
	ensure(Array.isArray(command.args) && command.args.every((arg) => typeof arg === "string"), error, `Check ${check.id} needs command.args as a list of strings.`, { field: `${field}.command.args` });
}
/** Validates one check; `field` is its path in refusals, e.g. `checks[0]`. */
function validateCheck(check, field = "check") {
	ensure(check && typeof check.id === "string" && CHECK_ID_PATTERN.test(check.id), error, `Invalid check id: ${String(check?.id)}`, { field: `${field}.id` });
	ensure(ROLES.has(check.role), error, `Unknown role of check ${check.id}: ${String(check.role)}`, { field: `${field}.role` });
	ensure(STAGES.has(check.stage), error, `Unknown stage of check ${check.id}: ${String(check.stage)}`, { field: `${field}.stage` });
	ensure(typeof check.required === "boolean", error, `Check ${check.id} needs required: boolean.`, { field: `${field}.required` });
	positiveInteger(check.timeoutMs, `${field}.timeoutMs`, { max: MAX_TIMEOUT_MS });
	validateCommand(check, field);
	ensure(check.appliesTo === void 0 || Array.isArray(check.appliesTo) && check.appliesTo.every((glob) => typeof glob === "string" && glob !== ""), error, `appliesTo of ${check.id} must be a list of globs.`, { field: `${field}.appliesTo` });
	const artifact = check.role === "package" || check.role === "installed";
	ensure(!artifact || typeof check.evidence === "string" && check.evidence.trim() !== "", error, `Check ${check.id} (${check.role}) needs evidence describing the artifact and scenario.`, { field: `${field}.evidence` });
	ensure(check.stage !== "delivery" || artifact, error, `Only package or installed checks run at the delivery stage: ${check.id}`, { field: `${field}.stage` });
}
function validateContracts(contracts) {
	ensure(Array.isArray(contracts), error, "docs.contracts must map code globs to documents.", { field: "docs.contracts" });
	for (const [index, item] of contracts.entries()) {
		const entry = `docs.contracts[${index}]`;
		ensure(item && typeof item.code === "string", error, "docs.contracts must map code globs to documents.", { field: `${entry}.code` });
		ensure(Array.isArray(item.docs) && item.docs.length > 0, error, "docs.contracts must map code globs to documents.", { field: `${entry}.docs` });
	}
}
/** A configuration written before `budget.briefBytes` gets the default (the file is not rewritten). */
function withBriefBudget(config) {
	const budget = config.budget;
	if (!budget || typeof budget !== "object" || budget.briefBytes !== void 0) return config;
	return {
		...config,
		budget: {
			...config.budget,
			briefBytes: DEFAULT_BRIEF_BYTES
		}
	};
}
function validateConfig(input) {
	ensure(input && input.schema === "harness-workflow-config/1", error, "Unsupported workflow configuration schema.");
	const config = withBriefBudget(input);
	const quality = config.quality;
	ensure(quality && (quality.status === "DISCOVERY" || quality.status === "CONFIGURED"), error, "quality.status must be DISCOVERY or CONFIGURED.");
	ensure(Array.isArray(quality.stacks) && quality.stacks.every((stack) => typeof stack === "string"), error, "quality.stacks must be a list.");
	ensure(quality.status === "DISCOVERY" || quality.stacks.length > 0, error, "A CONFIGURED profile names at least one stack.");
	ensure(Array.isArray(quality.checks), error, "quality.checks must be a list.");
	for (const [index, check] of quality.checks.entries()) validateCheck(check, `quality.checks[${index}]`);
	ensure(new Set(quality.checks.map((check) => check.id)).size === quality.checks.length, error, "Check ids must be unique.", { field: "quality.checks" });
	validateContracts(config.docs?.contracts);
	ensure(config.policy && (config.policy.maxFileLines === null || Number.isSafeInteger(config.policy.maxFileLines)), error, "policy.maxFileLines must be an integer or null.", { field: "policy.maxFileLines" });
	ensure(config.policy.taskFileSoftLimit === null || Number.isSafeInteger(config.policy.taskFileSoftLimit), error, "policy.taskFileSoftLimit must be an integer or null.", { field: "policy.taskFileSoftLimit" });
	positiveInteger(config.budget?.documentBytes, "budget.documentBytes");
	positiveInteger(config.budget?.recoveryBytes, "budget.recoveryBytes", {
		max: MAX_RECOVERY_BYTES,
		min: MIN_RECOVERY_BYTES
	});
	positiveInteger(config.budget.briefBytes, "budget.briefBytes", {
		max: MAX_BRIEF_BYTES,
		min: MIN_RECOVERY_BYTES
	});
	positiveInteger(config.autopilot?.maxContinues, "autopilot.maxContinues", { max: 1e3 });
	ensure(config.host === void 0 || typeof config.host === "string" && config.host.trim() !== "", error, "host must be a non-empty string when present.");
	return config;
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-quality/src/quality-detect.ts
var STACK_ORDER = [
	"node",
	"python",
	"go",
	"rust",
	"dotnet",
	"swift",
	"jvm"
];
var MARKERS$1 = [
	{
		pattern: /^(package\.json|tsconfig\.json|deno\.jsonc?)$/u,
		stack: "node"
	},
	{
		pattern: /^(pyproject\.toml|setup\.py|requirements[^/]*\.txt)$/u,
		stack: "python"
	},
	{
		pattern: /^go\.mod$/u,
		stack: "go"
	},
	{
		pattern: /^Cargo\.toml$/u,
		stack: "rust"
	},
	{
		pattern: /^(global\.json|.+\.csproj|.+\.sln)$/u,
		stack: "dotnet"
	},
	{
		pattern: /^(Package\.swift|.+\.xcodeproj)$/u,
		stack: "swift"
	},
	{
		pattern: /^(pom\.xml|build\.gradle(\.kts)?)$/u,
		stack: "jvm"
	}
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
var NODE_MANAGERS = /* @__PURE__ */ new Set([
	"npm",
	"pnpm",
	"yarn",
	"bun"
]);
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
		const listed = readdirSync(path.join(root, ...directory.split("/").filter((part) => part !== ".")), { withFileTypes: true });
		return {
			directories: listed.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
			files: listed.map((entry) => entry.name)
		};
	} catch {
		return {
			directories: [],
			files: []
		};
	}
}
function join(directory, name) {
	return directory === "." ? name : `${directory}/${name}`;
}
/** Reads a JSON manifest; malformed manifests count as empty. */
function readJsonManifest(root, relative) {
	const text = workflowPlatformFacade.readTextIfExists(path.join(root, ...relative.split("/")));
	if (text === null) return null;
	try {
		const value = JSON.parse(text);
		return value && typeof value === "object" ? value : null;
	} catch {
		return null;
	}
}
function nodeManager(root, directories, locks) {
	for (const directory of directories) {
		const lock = locks.get(directory);
		if (lock && NODE_MANAGERS.has(lock)) return lock;
	}
	for (const directory of directories) {
		const field = readJsonManifest(root, join(directory, "package.json"))?.packageManager;
		const match = typeof field === "string" ? PACKAGE_MANAGER_FIELD.exec(field) : null;
		if (match?.[1]) return match[1];
	}
	return DEFAULT_MANAGER.node;
}
function packageManagerOf(root, stack, directories, markers, locks) {
	if (stack === "node") return nodeManager(root, directories, locks);
	if (stack === "python") return directories.map((directory) => locks.get(directory)).find((value) => value && PYTHON_MANAGERS.has(value)) ?? DEFAULT_MANAGER.python;
	if (stack === "jvm") return markers.some((marker) => path.posix.basename(marker).startsWith("build.gradle")) ? "gradle" : "maven";
	return DEFAULT_MANAGER[stack];
}
/**
* Detects ecosystems from manifests in the project root and its first-level
* subdirectories. Hidden and build-output directories are skipped.
*/
function detectStacks(root) {
	const scanned = ["."];
	for (const name of entries(root, ".").directories.sort()) if (!(name.startsWith(".") || SKIPPED_DIRECTORIES.has(name))) scanned.push(name);
	const found = /* @__PURE__ */ new Map();
	const locks = /* @__PURE__ */ new Map();
	for (const directory of scanned) for (const name of entries(root, directory).files.sort()) {
		const lock = LOCK_FILES[name];
		if (lock && !locks.has(directory)) locks.set(directory, lock);
		const marker = MARKERS$1.find((candidate) => candidate.pattern.test(name));
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
	return STACK_ORDER.flatMap((id) => {
		const current = found.get(id);
		if (!current) return [];
		const directories = [...current.directories];
		return [{
			directories,
			id,
			markers: current.markers,
			packageManager: packageManagerOf(root, id, directories, current.markers, locks)
		}];
	});
}
function recordOf(value) {
	return value && typeof value === "object" ? value : {};
}
/** Collects dependency and script names of the node manifests of a stack. */
function nodeManifest(root, directories) {
	const packages = /* @__PURE__ */ new Set();
	const scripts = /* @__PURE__ */ new Map();
	for (const directory of directories) {
		const manifest = recordOf(readJsonManifest(root, join(directory, "package.json")));
		for (const name of [...Object.keys(recordOf(manifest.dependencies)), ...Object.keys(recordOf(manifest.devDependencies))]) packages.add(name);
		const declared = directory === "." ? Object.entries(recordOf(manifest.scripts)) : [];
		for (const [name, command] of declared) if (typeof command === "string") scripts.set(name, command);
	}
	return {
		packages,
		scripts
	};
}
/** Text of the python manifests, used to recognise declared tools. */
function pythonManifestText(root, markers) {
	return markers.filter((marker) => !marker.endsWith("setup.py")).map((marker) => workflowPlatformFacade.readTextIfExists(path.join(root, ...marker.split("/"))) ?? "").join("\n").toLowerCase();
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-quality/src/quality-apply.ts
var INSTALL_TIMEOUT_MS = 900 * 1e3;
function approvalGiven(input) {
	return typeof input.approval === "string" && input.approval.trim().length >= 10;
}
/** Install commands are checked before anything runs; they need the approval. */
function checkInstalls(input) {
	const commands = input.install ?? [];
	ensure(Array.isArray(commands), "PROFILE_INVALID", "install must be a list of commands.", { field: "install" });
	for (const [index, command] of commands.entries()) {
		const entry = `install[${index}]`;
		ensure(command && typeof command.executable === "string" && command.executable.trim() !== "", "PROFILE_INVALID", "Each install command needs executable and args.", { field: `${entry}.executable` });
		ensure(Array.isArray(command.args) && command.args.every((arg) => typeof arg === "string"), "PROFILE_INVALID", "Each install command needs executable and args.", { field: `${entry}.args` });
	}
	ensure(commands.length === 0 || approvalGiven(input), "INSTALL_APPROVAL", `Installing tools changes the project; record the user's approval in \`approval\` (at least 10 characters).`, { field: "approval" });
}
/** Builds the CONFIGURED configuration; builtin checks of `current` are kept. */
function configuredProfile(current, input) {
	ensure(input && Array.isArray(input.stacks) && input.stacks.length > 0, "PROFILE_INVALID", "The profile names at least one stack.", { field: "stacks" });
	const unknown = input.stacks.filter((id) => !STACK_ORDER.includes(id));
	ensure(unknown.length === 0, "UNKNOWN_STACK", `Unknown stack: ${unknown.join(", ")}`, { field: `stacks[${input.stacks.indexOf(unknown[0])}]` });
	ensure(Array.isArray(input.checks), "PROFILE_INVALID", "The profile needs a checks list.", { field: "checks" });
	const builtins = current.quality.checks.filter((check) => check.builtin);
	const builtinIds = new Set(builtins.map((check) => check.id));
	const checks = input.checks.map((check, index) => {
		const entry = `checks[${index}]`;
		ensure(check && typeof check === "object", "PROFILE_INVALID", "Each check must be an object.", { field: entry });
		ensure(!builtinIds.has(check.id), "PROFILE_INVALID", `Check id ${check.id} is reserved for a Kit builtin.`, { field: `${entry}.id` });
		const normalized = normalizeCheck(check);
		validateCheck(normalized, entry);
		return normalized;
	});
	checkInstalls(input);
	return validateConfig({
		...current,
		docs: input.docs ?? current.docs,
		policy: {
			...current.policy,
			...input.policy ?? {}
		},
		quality: {
			checks: [...checks, ...builtins],
			packageManager: input.packageManager ?? null,
			stacks: [...new Set(input.stacks)],
			status: "CONFIGURED"
		}
	});
}
/**
* Runs approved install commands in the project root. The first failure
* stops the sequence; nothing is rolled back because installs change files
* the user can inspect.
*/
function runInstalls(root, input, env) {
	const commands = input.install ?? [];
	if (commands.length === 0) return [];
	ensure(approvalGiven(input), "INSTALL_APPROVAL", "Installing tools changes the project; record the user's approval in `approval` (at least 10 characters).", { field: "approval" });
	const results = [];
	for (const command of commands) {
		ensure(command && typeof command.executable === "string" && Array.isArray(command.args), "PROFILE_INVALID", "Each install command needs executable and args.");
		const started = Date.now();
		const outcome = workflowPlatformFacade.run({
			args: command.args,
			cwd: command.cwd ? workflowPlatformFacade.resolveInside(root, command.cwd) : root,
			env,
			executable: command.executable,
			timeoutMs: INSTALL_TIMEOUT_MS
		});
		const text = [command.executable, ...command.args].join(" ");
		const output = `${outcome.stdout}${outcome.stderr}`.slice(-4e3);
		if (outcome.status !== 0) throw new WorkflowError("INSTALL_FAILED", `Install command failed: ${text}`, {
			completed: results,
			output: outcome.errorMessage ?? output
		}, "Fix the install problem and repeat quality:apply; the profile was not changed.");
		results.push({
			command: text,
			durationMs: Date.now() - started,
			output
		});
	}
	return results;
}
/**
* Executables that work only with a manifest of their stack (package
* scripts and binaries, modules, projects). Toolchain commands such as
* `node --test` or `python -m pytest` run without one.
*/
var MANIFEST_TOOLS = {
	dotnet: ["dotnet"],
	go: ["go", "govulncheck"],
	jvm: [
		"gradle",
		"gradlew",
		"mvn",
		"mvnw"
	],
	node: [
		"bun",
		"bunx",
		"npm",
		"npx",
		"pnpm",
		"yarn"
	],
	python: ["poetry", "uv"],
	rust: ["cargo", "cargo-audit"],
	swift: ["swift"]
};
var EXECUTABLE_SUFFIX = /\.(?:bat|cmd|exe)$/iu;
var PATH_SEPARATOR = /[\\/]/u;
function executableName(executable) {
	return (executable.split(PATH_SEPARATOR).at(-1) ?? executable).toLowerCase().replace(EXECUTABLE_SUFFIX, "");
}
/**
* True when a check command of the profile needs the stack's manifest. An
* unknown stack id (hand-edited configuration) always needs one.
*/
function needsManifest(config, stack) {
	const tools = MANIFEST_TOOLS[stack];
	if (!tools) return true;
	return config.quality.checks.some((check) => check.command !== void 0 && tools.includes(executableName(check.command.executable)));
}
/**
* Compares the profile stacks with the stacks detected in the project. A
* profile stack without manifests is `missing` only when one of the profile
* checks runs a tool that needs the manifest.
*/
function profileDrift(root, config) {
	if (config.quality.status === "DISCOVERY") return {
		added: [],
		missing: [],
		status: "discovery"
	};
	const detected = detectStacks(root).map((item) => item.id);
	const added = detected.filter((id) => !config.quality.stacks.includes(id));
	const missing = config.quality.stacks.filter((id) => !detected.includes(id) && needsManifest(config, id));
	return {
		added,
		missing,
		status: added.length === 0 && missing.length === 0 ? "ok" : "drift"
	};
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-quality/src/quality-globs.ts
var PLACEHOLDER_PATTERN = /\{([a-z]+)\}/gu;
var LEADING_PLACEHOLDER = /^\{([a-z]+)\}/u;
var SPECIAL_PATTERN = /[|\\{}()[\]^$+?.]/gu;
var compiled = /* @__PURE__ */ new Map();
function compile(pattern) {
	const cached = compiled.get(pattern);
	if (cached) return cached;
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
	const result = {
		names,
		regex: new RegExp(`^${source}$`, "u")
	};
	compiled.set(pattern, result);
	return result;
}
/**
* Matches a canonical path against a glob with `*`, `**` and `{name}`
* captures (one path segment each). Returns the captures, or null.
*/
function matchGlob(pattern, value) {
	const { names, regex } = compile(pattern);
	const match = regex.exec(value);
	if (!match) return null;
	return Object.fromEntries(names.map((name, index) => [name, match[index + 1] ?? ""]));
}
function matchesAny(patterns, value) {
	return patterns.some((pattern) => matchGlob(pattern, value) !== null);
}
function fillPlaceholders(template, values) {
	return template.replace(PLACEHOLDER_PATTERN, (whole, name) => values[name] ?? whole);
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-quality/src/quality-builtins.ts
var MARKDOWN_LINK = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/gu;
var FENCE$1 = /^\s*(```|~~~)/u;
var EXTERNAL_LINK = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/iu;
var NUL = "\0";
var CONFLICT_OPEN = "<<<<<<< ";
var CONFLICT_CLOSE = ">>>>>>> ";
var CONFLICT_SEPARATOR = "=======";
function absolute(root, file) {
	return path.join(root, ...file.split("/"));
}
function existingFile(root, file) {
	const target = absolute(root, file);
	return existsSync(target) && statSync(target).isFile();
}
function markdownFiles(root, files) {
	return files.filter((file) => isMarkdownPath(file) && file !== ".harness/plans/todo-plan.md" && existingFile(root, file));
}
function changedMarkdown(context) {
	return markdownFiles(context.root, context.files);
}
function fileLines(context) {
	const limit = context.config.policy.maxFileLines;
	if (limit === null) return {
		output: "policy.maxFileLines is not set.",
		passed: true
	};
	const over = [];
	for (const file of context.files) {
		if (isDocumentationPath(file) || file.startsWith(".harness/") || !existingFile(context.root, file)) continue;
		const text = readFileSync(absolute(context.root, file), "utf8");
		if (text.includes(NUL)) continue;
		const lines = text.endsWith("\n") ? text.split("\n").length - 1 : text.split("\n").length;
		if (lines > limit) over.push(`${file}: ${lines} lines (limit ${limit})`);
	}
	return over.length === 0 ? {
		output: `File line limit ${limit}: OK.`,
		passed: true
	} : {
		output: over.join("\n"),
		passed: false
	};
}
/**
* Existing Markdown files of `files` (the plan excluded) larger than `limit`
* bytes, in the given order.
*/
function oversizedDocuments(root, files, limit) {
	return markdownFiles(root, files).flatMap((file) => {
		const bytes = statSync(absolute(root, file)).size;
		return bytes > limit ? [{
			bytes,
			path: file
		}] : [];
	});
}
function docSize(context) {
	const limit = context.config.budget.documentBytes;
	const over = oversizedDocuments(context.root, context.files, limit).map((item) => `${item.path}: ${item.bytes} bytes (limit ${limit}); split the document.`);
	return over.length === 0 ? {
		output: `Document size limit ${limit}: OK.`,
		passed: true
	} : {
		output: over.join("\n"),
		passed: false
	};
}
function linkTargets(text) {
	const targets = [];
	let fenced = false;
	for (const line of text.split("\n")) {
		if (FENCE$1.test(line)) {
			fenced = !fenced;
			continue;
		}
		if (fenced) continue;
		for (const match of line.matchAll(MARKDOWN_LINK)) if (match[1]) targets.push(match[1]);
	}
	return targets;
}
function brokenLinks(root, file) {
	const directory = path.dirname(absolute(root, file));
	const broken = [];
	for (const target of linkTargets(readFileSync(absolute(root, file), "utf8"))) {
		if (EXTERNAL_LINK.test(target)) continue;
		const clean = target.split("#")[0]?.split("?")[0] ?? "";
		let decoded = clean;
		try {
			decoded = decodeURIComponent(clean);
		} catch {}
		if (decoded === "") continue;
		const resolved = decoded.startsWith("/") ? path.join(root, decoded) : path.resolve(directory, decoded);
		if (!(!path.relative(root, resolved).startsWith("..") && existsSync(resolved))) broken.push(`${file}: ${target}`);
	}
	return broken;
}
function mdLinks(context) {
	const broken = changedMarkdown(context).flatMap((file) => brokenLinks(context.root, file));
	return broken.length === 0 ? {
		output: "Markdown links: OK.",
		passed: true
	} : {
		output: `Broken relative links:\n${broken.join("\n")}`,
		passed: false
	};
}
/** Line numbers of git conflict markers in one text. */
function conflictLines(text) {
	const opening = [];
	const separators = [];
	for (const [index, raw] of text.split("\n").entries()) {
		const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
		if (line.startsWith(CONFLICT_OPEN) || line.startsWith(CONFLICT_CLOSE)) opening.push(index + 1);
		else if (line === CONFLICT_SEPARATOR) separators.push(index + 1);
	}
	return opening.length === 0 ? [] : [...opening, ...separators].sort((a, b) => a - b);
}
function conflictMarkers(context) {
	const found = [];
	for (const file of context.files) {
		if (!existingFile(context.root, file)) continue;
		const text = readFileSync(absolute(context.root, file), "utf8");
		if (text.includes(NUL)) continue;
		const lines = conflictLines(text);
		if (lines.length > 0) found.push(`${file}: ${lines.length === 1 ? "line" : "lines"} ${lines.join(", ")}`);
	}
	return found.length === 0 ? {
		output: "Conflict markers: none.",
		passed: true
	} : {
		output: `Unresolved conflict markers; resolve the conflict before committing:\n${found.join("\n")}`,
		passed: false
	};
}
/** Lists code files whose contract documents are absent from the candidate. */
function missingContracts(config, files) {
	const candidate = new Set(files);
	const missing = [];
	for (const file of files) for (const contract of config.docs.contracts) {
		const captures = matchGlob(contract.code, file);
		if (!captures) continue;
		const documents = contract.docs.map((doc) => fillPlaceholders(doc, captures));
		if (!documents.some((doc) => candidate.has(doc))) missing.push(`${file} -> ${documents.join(" | ")}`);
	}
	return [...new Set(missing)];
}
function docsContracts(context) {
	const missing = missingContracts(context.config, context.files);
	if (missing.length === 0) return {
		output: "Documentation contracts: OK.",
		passed: true
	};
	if (context.docsWaiver) return {
		output: `Documentation contracts waived: ${context.docsWaiver}\n${missing.join("\n")}`,
		passed: true
	};
	return {
		output: `Code changed without its contract document. Update the document in the same commit or record a docsWaiver.\n${missing.join("\n")}`,
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
/** Builtins that run for service commits: documentation and conflict guards. */
var DOCUMENTATION_BUILTINS = /* @__PURE__ */ new Set([
	"kit:doc-size",
	"kit:md-links",
	"kit:docs-contracts",
	"kit:conflict-markers"
]);
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-quality/src/quality-input-schema.ts
var PROFILE = "PROFILE_INVALID";
var CONFIG = "CONFIG_SCHEMA";
function field$1(name, type, required, code, description, extra = {}) {
	return {
		code,
		description,
		name,
		required,
		type,
		...extra
	};
}
var QUALITY_SCHEMA = {
	command: "quality:apply",
	description: "The quality profile chosen from `quality:detect`: `quality:apply --input <profile.json>`.",
	example: {
		approval: "User approved installing Biome as a dev dependency",
		checks: [{
			command: {
				args: [
					"biome",
					"check",
					"{files}"
				],
				executable: "npx"
			},
			id: "lint",
			required: true,
			role: "lint",
			stage: "commit",
			timeoutMs: 12e4
		}],
		docs: { contracts: [{
			code: "src/{module}/**",
			docs: ["docs/{module}.md"]
		}] },
		install: [{
			args: [
				"install",
				"--save-dev",
				"@biomejs/biome"
			],
			executable: "npm"
		}],
		packageManager: "npm",
		policy: {
			maxFileLines: 500,
			taskFileSoftLimit: null
		},
		stacks: ["node"]
	},
	fields: [
		field$1("stacks", "string[]", true, PROFILE, "Project ecosystems.", { minItems: 1 }),
		field$1("stacks[]", "string", false, "UNKNOWN_STACK", "A known stack id.", { enum: STACK_ORDER }),
		field$1("checks", "object[]", true, PROFILE, "Command checks; Kit builtin checks are kept automatically."),
		field$1("checks[].id", "string", true, CONFIG, "Unique check id; builtin ids (kit:*) are reserved (PROFILE_INVALID).", { pattern: CHECK_ID_PATTERN.source }),
		field$1("checks[].role", "string", true, CONFIG, "What the check does.", { enum: CHECK_ROLES }),
		field$1("checks[].stage", "string", true, CONFIG, "When the check runs.", { enum: CHECK_STAGES }),
		field$1("checks[].command", "object", true, CONFIG, "The command to run."),
		field$1("checks[].command.executable", "string", true, CONFIG, "Executable name or path."),
		field$1("checks[].command.args", "string[]", true, CONFIG, "Arguments; `{files}` expands to the candidate files."),
		field$1("checks[].command.cwd", "string", false, CONFIG, "Project-relative working directory."),
		field$1("checks[].required", "boolean", false, CONFIG, "A failed required check refuses the step; default false."),
		field$1("checks[].timeoutMs", "integer", false, CONFIG, "Timeout in milliseconds; default 120000.", {
			maximum: MAX_TIMEOUT_MS,
			minimum: 1
		}),
		field$1("checks[].appliesTo", "string[]", false, CONFIG, "Globs of the files the check applies to."),
		field$1("checks[].evidence", "string", false, CONFIG, "Artifact and scenario; required for package and installed checks."),
		field$1("docs", "object", false, CONFIG, "Documentation contracts."),
		field$1("docs.contracts", "object[]", true, CONFIG, "Code globs mapped to their contract documents."),
		field$1("docs.contracts[].code", "string", true, CONFIG, "Code glob; `{name}` placeholders bind path segments."),
		field$1("docs.contracts[].docs", "string[]", true, CONFIG, "Documents that change with the code.", { minItems: 1 }),
		field$1("install", "object[]", false, PROFILE, "Tool install commands run before the profile is written."),
		field$1("install[].executable", "string", true, PROFILE, "Executable of the install command."),
		field$1("install[].args", "string[]", true, PROFILE, "Arguments of the install command."),
		field$1("install[].cwd", "string", false, PROFILE, "Project-relative working directory."),
		field$1("approval", "string", false, "INSTALL_APPROVAL", "The user's approval of the installs (trimmed length); required when install is not empty.", { minLength: 10 }),
		field$1("packageManager", "string|null", false, CONFIG, "Package manager of the project."),
		field$1("policy", "object", false, CONFIG, "Project policy."),
		field$1("policy.maxFileLines", "integer|null", false, CONFIG, "Line limit of the kit:file-lines check."),
		field$1("policy.taskFileSoftLimit", "integer|null", false, CONFIG, "Soft limit of files per task.")
	],
	rules: [
		"Only package or installed checks run at the delivery stage, and they need evidence (CONFIG_SCHEMA).",
		"Check ids are unique and never reuse a Kit builtin id (PROFILE_INVALID).",
		"Install commands run in order after validation; the first failure stops them and the profile is not written (INSTALL_FAILED)."
	]
};
/** A copy of the `quality:apply` input descriptor. */
function qualityInputSchema() {
	return structuredClone(QUALITY_SCHEMA);
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-quality/src/quality-catalog.ts
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
/** Package scripts that already implement a role in a node project. */
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
		audit: [tool("dotnet", [
			"list",
			"package",
			"--vulnerable"
		])],
		format: [tool("dotnet", [
			"format",
			"--include",
			"{files}"
		], [], { appliesTo: ["**/*.cs"] })],
		lint: [tool("dotnet", ["build", "-warnaserror"])],
		test: [tool("dotnet", ["test"])]
	},
	go: {
		audit: [tool("govulncheck", ["./..."], [], { install: {
			args: ["install", "golang.org/x/vuln/cmd/govulncheck@latest"],
			executable: "go"
		} })],
		format: [tool("gofmt", ["-w", "{files}"], [], { appliesTo: ["**/*.go"] })],
		lint: [tool("go", ["vet", "./..."])],
		test: [tool("go", ["test", "./..."])]
	},
	jvm: { test: [tool("gradle", ["test"]), tool("mvn", ["-q", "test"])] },
	node: {
		audit: [tool("audit", [])],
		format: [
			tool("ultracite", ["fix", "{files}"], ["ultracite"]),
			tool("biome", [
				"format",
				"--write",
				"{files}"
			], ["@biomejs/biome"]),
			tool("prettier", [
				"--write",
				"--ignore-unknown",
				"{files}"
			], ["prettier"])
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
		typecheck: [tool("tsc", ["--noEmit"], ["typescript"], { needs: "tsconfig.json" })]
	},
	python: {
		audit: [tool("pip-audit", [], ["pip-audit"], { module: "pip_audit" })],
		format: [tool("ruff", ["format", "{files}"], ["ruff"], { appliesTo: ["**/*.py"] })],
		lint: [tool("ruff", ["check"], ["ruff"])],
		test: [tool("pytest", [], ["pytest"])],
		typecheck: [tool("pyright", [], ["pyright"]), tool("mypy", ["."], ["mypy"])]
	},
	rust: {
		audit: [tool("cargo-audit", ["audit"], [], { install: {
			args: ["install", "cargo-audit"],
			executable: "cargo"
		} })],
		format: [tool("cargo", [
			"fmt",
			"--",
			"{files}"
		], [], { appliesTo: ["**/*.rs"] })],
		lint: [tool("cargo", [
			"clippy",
			"--all-targets",
			"--",
			"-D",
			"warnings"
		])],
		test: [tool("cargo", ["test"])],
		typecheck: [tool("cargo", ["check"])]
	},
	swift: {
		format: [tool("swift-format", [
			"format",
			"-i",
			"{files}"
		], [], { appliesTo: ["**/*.swift"] })],
		lint: [tool("swiftlint", [])],
		test: [tool("swift", ["test"])]
	}
};
/** Command that runs a node package binary through the package manager. */
function nodeCommand(manager, bin, args) {
	if (bin === "node") return {
		args,
		executable: "node"
	};
	switch (manager) {
		case "pnpm": return {
			args: [
				"exec",
				bin,
				...args
			],
			executable: "pnpm"
		};
		case "yarn": return {
			args: [bin, ...args],
			executable: "yarn"
		};
		case "bun": return {
			args: [bin, ...args],
			executable: "bunx"
		};
		default: return {
			args: [bin, ...args],
			executable: "npx"
		};
	}
}
function nodeScriptCommand(manager, script) {
	if (manager === "npm") return script === "test" ? {
		args: ["test"],
		executable: "npm"
	} : {
		args: [
			"run",
			"-s",
			script
		],
		executable: "npm"
	};
	return {
		args: ["run", script],
		executable: manager
	};
}
function nodeAuditCommand(manager) {
	if (manager === "npm" || manager === "pnpm" || manager === "yarn") return {
		args: ["audit", ...manager === "npm" ? ["--audit-level=high"] : []],
		executable: manager
	};
	return null;
}
function nodeInstallCommand(manager, packages) {
	return {
		args: [...{
			bun: ["add", "-d"],
			pnpm: ["add", "-D"],
			yarn: ["add", "-D"]
		}[manager] ?? ["install", "-D"], ...packages],
		executable: manager
	};
}
function pythonCommand(manager, spec) {
	if (manager === "uv" || manager === "poetry") return {
		args: [
			"run",
			spec.tool,
			...spec.args
		],
		executable: manager
	};
	return {
		args: [
			"-m",
			spec.module ?? spec.tool,
			...spec.args
		],
		executable: "python"
	};
}
function pythonInstallCommand(manager, packages) {
	if (manager === "uv") return {
		args: [
			"add",
			"--dev",
			...packages
		],
		executable: "uv"
	};
	if (manager === "poetry") return {
		args: [
			"add",
			"--group",
			"dev",
			...packages
		],
		executable: "poetry"
	};
	return {
		args: [
			"-m",
			"pip",
			"install",
			...packages
		],
		executable: "python"
	};
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
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-quality/src/quality-proposal.ts
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
	return chosen ? {
		chosen,
		ready: Boolean(ready)
	} : null;
}
function nodeSelection(root, detection, role) {
	const manager = detection.packageManager;
	const { packages, scripts } = nodeManifest(root, detection.directories);
	const candidates = CATALOG.node[role] ?? [];
	const alternatives = candidates.map((spec) => spec.tool);
	const script = (NODE_ROLE_SCRIPTS[role] ?? []).find((name) => scripts.has(name) && !(scripts.get(name) ?? "").includes(NPM_TEST_PLACEHOLDER));
	if (script) return {
		alternatives,
		command: nodeScriptCommand(manager, script),
		installed: true,
		spec: null
	};
	if (role === "audit") {
		const command = nodeAuditCommand(manager);
		return command ? {
			alternatives: [],
			command,
			installed: true,
			spec: null
		} : null;
	}
	const typed = detection.markers.some((marker) => marker.endsWith("tsconfig.json")) || packages.has("typescript");
	const choice = pick(candidates.filter((spec) => spec.needs !== "tsconfig.json" || typed), (spec) => spec.packages.every((name) => packages.has(name)));
	if (!choice) return null;
	const bin = choice.chosen.tool;
	return {
		alternatives,
		command: nodeCommand(manager, bin, choice.chosen.args),
		installed: choice.ready,
		spec: choice.chosen
	};
}
function pythonSelection(root, detection, role) {
	const tokens = new Set(pythonManifestText(root, detection.markers).split(TOKEN_SEPARATOR));
	const candidates = CATALOG.python[role] ?? [];
	const choice = pick(candidates, (spec) => spec.packages.every((name) => tokens.has(name)));
	if (!choice) return null;
	return {
		alternatives: candidates.map((spec) => spec.tool),
		command: pythonCommand(detection.packageManager, choice.chosen),
		installed: choice.ready,
		spec: choice.chosen
	};
}
function toolchainSelection(detection, role, which) {
	let candidates = CATALOG[detection.id][role] ?? [];
	if (detection.id === "jvm") candidates = candidates.filter((spec) => spec.tool === (detection.packageManager === "gradle" ? "gradle" : "mvn"));
	const choice = pick(candidates, (spec) => which(spec.tool));
	if (!choice) return null;
	const executable = choice.chosen.tool === "cargo-audit" ? "cargo" : choice.chosen.tool;
	return {
		alternatives: candidates.map((spec) => spec.tool),
		command: {
			args: choice.chosen.args,
			executable
		},
		installed: choice.ready,
		spec: choice.chosen
	};
}
function planStack(root, detection, options, idOf, checks) {
	const plan = {
		entries: [],
		installs: [],
		notes: []
	};
	const missingPackages = /* @__PURE__ */ new Set();
	for (const role of ROLE_ORDER) {
		let selection;
		if (detection.id === "node") selection = nodeSelection(root, detection, role);
		else if (detection.id === "python") selection = pythonSelection(root, detection, role);
		else selection = toolchainSelection(detection, role, options.which);
		if (!selection) continue;
		const id = idOf(role);
		checks.push(checkFor(id, role, selection.command, selection.spec?.appliesTo));
		const toolName = selection.spec?.tool ?? `${selection.command.executable} ${selection.command.args.join(" ")}`;
		plan.entries.push({
			alternatives: selection.alternatives,
			id,
			installed: selection.installed,
			role,
			stack: detection.id,
			tool: toolName
		});
		if (selection.installed || !selection.spec) continue;
		if (selection.spec.install) plan.installs.push(selection.spec.install);
		else if (selection.spec.packages.length > 0) for (const name of selection.spec.packages) missingPackages.add(name);
		else plan.notes.push(`${detection.id}: install ${selection.spec.tool} manually; it is not on PATH.`);
	}
	if (missingPackages.size > 0) {
		const names = [...missingPackages];
		plan.installs.unshift(detection.id === "node" ? nodeInstallCommand(detection.packageManager, names) : pythonInstallCommand(detection.packageManager, names));
	}
	return plan;
}
function fallbackDetection(id) {
	return {
		directories: ["."],
		id,
		markers: [],
		packageManager: {
			dotnet: "dotnet",
			go: "go",
			jvm: "maven",
			node: "npm",
			python: "pip",
			rust: "cargo",
			swift: "swift"
		}[id]
	};
}
/** Detects stacks and proposes catalog checks with install commands. */
function proposeQuality(root, options) {
	const detected = detectStacks(root);
	const stacks = (options.stacks ? STACK_ORDER.filter((id) => options.stacks?.includes(id)) : detected.map((item) => item.id)).map((id) => detected.find((item) => item.id === id) ?? fallbackDetection(id));
	const checks = [];
	const entries = [];
	const install = [];
	const notes = [];
	for (const detection of stacks) {
		const idOf = (role) => stacks.length === 1 ? ROLE_ID[role] : `${detection.id}-${ROLE_ID[role]}`;
		const plan = planStack(root, detection, options, idOf, checks);
		entries.push(...plan.entries);
		install.push(...plan.installs);
		notes.push(...plan.notes);
	}
	if (stacks.length === 0) notes.push("No stack detected; pass the stack explicitly from the architecture document.");
	notes.push("Kit builtins (kit:doc-size, kit:md-links, kit:file-lines, kit:docs-contracts, kit:conflict-markers) are always kept.");
	return {
		detected,
		entries,
		notes,
		profile: {
			checks,
			install,
			packageManager: stacks[0]?.packageManager ?? null,
			stacks: stacks.map((item) => item.id)
		}
	};
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-quality/src/quality-runner.ts
var OUTPUT_TAIL$1 = 4e3;
var FILES_ARGUMENT = "{files}";
/** Kit guards that run even when a profile written before them omits them. */
var IMPLICIT_BUILTINS = ["kit:conflict-markers"];
function tail$1(text) {
	return text.length > OUTPUT_TAIL$1 ? `…${text.slice(-4e3)}` : text;
}
/** The configured checks plus the implicit Kit guards the profile lacks. */
function effectiveChecks(config) {
	const listed = config.quality.checks;
	const missing = IMPLICIT_BUILTINS.filter((id) => !listed.some((check) => check.id === id || check.builtin === id));
	return [...listed, ...missing.map(builtinCheck)];
}
function unknownChecks(checks, ids) {
	const known = new Set(checks.map((check) => check.id));
	const unknown = ids.filter((id) => !known.has(id));
	ensure(unknown.length === 0, "CHECK_UNKNOWN", `Unknown checks: ${unknown.join(", ")}`, { checks: unknown }, "Task checks must be ids from `scripts/workflow quality:status`; fix the task with `scripts/workflow task:update <ID> --input <patch.json>`.");
}
var BUILTIN_PREFIX = "kit:";
/**
* Ids a planned task may name in `checks`. A CONFIGURED profile knows its
* checks plus the implicit Kit guards (`known` is exact). Before QUALITY
* only the Kit builtins are known; other ids of the check id form are
* accepted as checks QUALITY will define (`open`), and task:start verifies
* them against the profile.
*/
function plannedCheckRule(config) {
	if (config.quality.status === "CONFIGURED") return {
		known: effectiveChecks(config).map((check) => check.id),
		open: false
	};
	return {
		known: Object.keys(BUILTIN_CHECKS).sort(),
		open: true
	};
}
/** The planned check ids the profile cannot run (see `plannedCheckRule`). */
function unknownPlannedChecks(config, ids) {
	const { known, open } = plannedCheckRule(config);
	return ids.filter((id) => {
		if (known.includes(id)) return false;
		return !(open && CHECK_ID_PATTERN.test(id) && !id.startsWith(BUILTIN_PREFIX));
	});
}
/**
* CHECK_UNKNOWN for the first planned task whose `checks` holds an id the
* profile cannot run: `checks` are quality check ids, never manual checks.
*/
function ensurePlannedChecks(config, tasks) {
	const { known, open } = plannedCheckRule(config);
	for (const task of tasks) {
		const unknown = unknownPlannedChecks(config, task.checks);
		ensure(unknown.length === 0, "CHECK_UNKNOWN", `${task.field}${task.taskId ? ` of ${task.taskId}` : ""} names unknown quality checks: ${unknown.join(", ")}. \`checks\` holds ids of quality checks ${open ? "(a Kit builtin kit:* or an id without spaces that QUALITY will define)" : "of the profile"}; manual checks belong in acceptance.`, {
			checks: unknown,
			field: task.field,
			known,
			taskId: task.taskId
		}, "Use check ids from `scripts/workflow quality:status` or leave `checks` empty, and write manual checks into `acceptance`.");
	}
}
/** Checks a stage runs, in configuration order. */
function selectChecks(request) {
	const { stage } = request;
	const checks = effectiveChecks(request.config);
	if (request.only) {
		unknownChecks(checks, request.only);
		return checks.filter((check) => request.only?.includes(check.id));
	}
	if (request.service) return stage === "commit" ? checks.filter((check) => check.builtin && DOCUMENTATION_BUILTINS.has(check.builtin)) : [];
	const assigned = request.assigned ?? [];
	unknownChecks(checks, assigned);
	return checks.filter((check) => check.stage === stage && (check.required || assigned.includes(check.id)));
}
function result(check, fields) {
	return {
		command: check.builtin ?? [check.command?.executable ?? "", ...check.command?.args ?? []].join(" "),
		durationMs: 0,
		evidence: check.evidence ?? null,
		exitCode: null,
		id: check.id,
		output: "",
		reason: null,
		role: check.role,
		stage: check.stage,
		...fields
	};
}
function isExistingFile(root, file) {
	const target = path.join(root, ...file.split("/"));
	return existsSync(target) && statSync(target).isFile();
}
function runCommand(check, request, files) {
	const command = check.command;
	if (!command) return result(check, {
		reason: "The check has no command.",
		status: "error"
	});
	const usesFiles = command.args.includes(FILES_ARGUMENT);
	const existing = (files ?? []).filter((file) => isExistingFile(request.root, file));
	if (usesFiles && existing.length === 0) return result(check, {
		reason: "No existing files to pass.",
		status: "skipped"
	});
	const args = command.args.flatMap((arg) => arg === FILES_ARGUMENT ? existing : [arg]);
	const executable = (command.executable.includes("/") || command.executable.includes("\\")) && !path.isAbsolute(command.executable) ? workflowPlatformFacade.resolveInside(request.root, command.executable) : command.executable;
	const cwd = command.cwd ? workflowPlatformFacade.resolveInside(request.root, command.cwd) : request.root;
	const started = Date.now();
	const outcome = workflowPlatformFacade.run({
		args,
		cwd,
		env: request.env ?? process.env,
		executable,
		timeoutMs: check.timeoutMs
	});
	const output = tail$1(`${outcome.stdout}${outcome.stderr}`);
	const durationMs = Date.now() - started;
	if (outcome.timedOut) return result(check, {
		durationMs,
		output,
		reason: `Timed out after ${check.timeoutMs} ms.`,
		status: "timeout"
	});
	if (outcome.status === null) return result(check, {
		durationMs,
		output,
		reason: outcome.errorMessage ?? `${command.executable} did not start.`,
		status: "error"
	});
	return result(check, {
		durationMs,
		exitCode: outcome.status,
		output,
		status: outcome.status === 0 ? "passed" : "failed"
	});
}
function runOne(check, request) {
	const filtered = request.files && check.appliesTo ? request.files.filter((file) => matchesAny(check.appliesTo ?? [], file)) : request.files;
	if (request.files && check.appliesTo && filtered?.length === 0) return result(check, {
		reason: "No candidate file matches appliesTo.",
		status: "skipped"
	});
	if (check.builtin) {
		const started = Date.now();
		const outcome = BUILTIN_CHECKS[check.builtin]({
			config: request.config,
			docsWaiver: request.docsWaiver ?? null,
			files: filtered ?? [],
			root: request.root
		});
		return result(check, {
			durationMs: Date.now() - started,
			output: tail$1(outcome.output),
			status: outcome.passed ? "passed" : "failed"
		});
	}
	return runCommand(check, request, filtered);
}
/** Runs the checks of one stage without a shell and reports every result. */
function runStage(request) {
	const startedAt = (/* @__PURE__ */ new Date()).toISOString();
	const results = selectChecks(request).map((check) => runOne(check, request));
	return {
		finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
		ok: results.every((item) => item.status === "passed" || item.status === "skipped"),
		results,
		stage: request.stage,
		startedAt
	};
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-quality/src/workflow-quality-facade.ts
/** Public facade of the workflow-quality module: configuration, detection and checks. */
var WorkflowQualityFacade = class {
	configPath = CONFIG_PATH;
	defaultConfig() {
		return defaultConfig();
	}
	validateConfig(config) {
		return validateConfig(config);
	}
	normalizeCheck(input) {
		const check = normalizeCheck(input);
		validateCheck(check);
		return check;
	}
	configFile(root) {
		return path.join(root, ...CONFIG_PATH.split("/"));
	}
	/** Reads the project configuration; a missing file means the default DISCOVERY profile. */
	readConfig(root) {
		const text = workflowPlatformFacade.readTextIfExists(this.configFile(root));
		if (text === null) return defaultConfig();
		let parsed;
		try {
			parsed = JSON.parse(text);
		} catch (cause) {
			throw new WorkflowError("CONFIG_JSON", `${CONFIG_PATH} is not valid JSON: ${cause.message}`);
		}
		return validateConfig(parsed);
	}
	renderConfig(config) {
		return `${JSON.stringify(validateConfig(config), null, 2)}\n`;
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
		const unknown = (options.stacks ?? []).filter((id) => !STACK_ORDER.includes(id));
		ensure(unknown.length === 0, "UNKNOWN_STACK", `Unknown stack: ${unknown.join(", ")}. Known: ${STACK_ORDER.join(", ")}.`);
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
		const file = workflowGitFacade.localPath(root, "verification", `pending-${transactionId}.json`);
		workflowPlatformFacade.writeFileAtomic(file, `${JSON.stringify({
			reports,
			transaction: transactionId
		}, null, 2)}\n`);
		return file;
	}
	/** Reads stored evidence by commit SHA, or the latest one. */
	readEvidence(root, reference = "last") {
		const text = workflowPlatformFacade.readTextIfExists(workflowGitFacade.localPath(root, "verification", `${reference}.json`));
		return text === null ? null : JSON.parse(text);
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
		return {
			config,
			installs
		};
	}
	drift(root, config = this.readConfig(root)) {
		return profileDrift(root, config);
	}
	writeConfig(root, config) {
		workflowPlatformFacade.writeFileAtomic(this.configFile(root), this.renderConfig(config));
	}
};
var workflowQualityFacade = new WorkflowQualityFacade();
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-assignment/src/assignment-attach.ts
var WORKTREE_RECORD_VERSION = 1;
var WORKTREE_RECORD = "assignment.json";
/** Scope id of the one-task plan of an executor worktree. */
function executorScopeId(id) {
	return `assignment-${id}`;
}
function real(value) {
	return realpathSync(value);
}
function revParse(git, root, flag) {
	return git.git.text(root, [
		"rev-parse",
		"--path-format=absolute",
		flag
	]);
}
/**
* Finds the main checkout of a linked worktree through the common git
* directory. A bare or unusual layout is refused (`ASSIGNMENT_LAYOUT`), the
* main checkout itself is not an executor worktree (`ASSIGNMENT_WORKTREE`).
*/
function locateWorktree(git, root) {
	ensure(git.isRepository(root), "ASSIGNMENT_WORKTREE", "assignment:attach runs inside the executor's git worktree.");
	const bare = git.git.text(root, ["rev-parse", "--is-bare-repository"]);
	const commonDir = real(revParse(git, root, "--git-common-dir"));
	ensure(bare !== "true" && path.basename(commonDir) === ".git", "ASSIGNMENT_LAYOUT", `The repository layout is not supported: the common git directory ${commonDir} is not the .git folder of a main checkout.`, { commonDir }, "Use a normal (non-bare) repository whose worktrees are created with `git worktree add`.");
	const mainRoot = path.dirname(commonDir);
	const worktree = real(git.topLevel(root));
	ensure(real(revParse(git, root, "--git-dir")) !== commonDir && worktree !== mainRoot, "ASSIGNMENT_WORKTREE", "This is the main checkout; assignment:attach runs in the executor's linked worktree.", { mainRoot }, "Start the executor subagent with isolation worktree and run the command there.");
	const branch = git.git.run(root, [
		"symbolic-ref",
		"-q",
		"--short",
		"HEAD"
	], { allowFailure: true }).stdout.trim();
	return {
		branch: branch === "" ? null : branch,
		mainRoot,
		worktree
	};
}
function worktreeRecordFile(root) {
	return workflowGitFacade.localPath(root, WORKTREE_RECORD);
}
function isWorktreeRecord(value) {
	const record = value;
	return record !== null && typeof record === "object" && record.version === WORKTREE_RECORD_VERSION && typeof record.id === "string" && typeof record.mainRoot === "string" && typeof record.scopeId === "string" && typeof record.taskId === "string" && typeof record.baseCommit === "string";
}
/** The executor record of a worktree, or null outside an executor worktree. */
function readWorktreeRecord(root) {
	const file = worktreeRecordFile(root);
	const text = workflowPlatformFacade.readTextIfExists(file);
	if (text === null) return null;
	let parsed = null;
	try {
		parsed = JSON.parse(text);
	} catch {
		parsed = null;
	}
	if (!isWorktreeRecord(parsed)) throw new WorkflowError("ASSIGNMENT_RECORD", "The executor record of this worktree is unreadable.", { file }, "Inspect the record file; the Kit does not guess its state.");
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
	workflowPlatformFacade.writeFileAtomic(worktreeRecordFile(root), `${JSON.stringify(value, null, 2)}\n`);
	return value;
}
/**
* The one-task plan of an executor worktree (spec 5.3), built from the plan of
* the base commit: scope `assignment-<id>`, a copy of the assigned task
* without dependencies, strategy `sequential`, objective and acceptance from
* the task.
*/
function executorPlan(base, record, now) {
	ensure(base.scope?.id === record.scopeId, "ASSIGNMENT_BASE", `The plan of the base commit has no scope ${record.scopeId}.`);
	const task = workflowPlanFacade.task(base, record.taskId);
	ensure(task.status === "TODO" && task.iteration === record.iteration, "ASSIGNMENT_BASE", `${task.id} is ${task.status} (iteration ${task.iteration}) in the base plan; the assignment expects TODO, iteration ${record.iteration}.`);
	const round = base.rounds.find((item) => item.id === task.roundId);
	ensure(round, "ASSIGNMENT_BASE", `The round of ${task.id} is missing.`);
	const copy = structuredClone(task);
	copy.dependencies = [];
	copy.fixes = null;
	return workflowPlanFacade.validate({
		currentTaskId: null,
		lastClosed: null,
		projectId: base.projectId,
		projectName: base.projectName,
		revision: base.revision + 1,
		rounds: [{
			digest: null,
			id: round.id,
			kind: round.kind,
			status: "OPEN",
			title: round.title
		}],
		schema: PLAN_SCHEMA,
		scope: {
			acceptance: [...task.acceptance],
			acceptanceNote: null,
			approval: {
				at: now,
				text: `Assignment ${record.id}: task ${task.id} of scope ${record.scopeId}`
			},
			baselineCommit: record.baseCommit,
			blockedReason: null,
			context: structuredClone(task.context),
			decisions: [],
			delivery: "IN_PROGRESS",
			execution: {
				maxWorkers: 1,
				ownerSession: null,
				strategy: "sequential"
			},
			id: executorScopeId(record.id),
			objective: task.why ? `${task.title}: ${task.why}` : task.title,
			spec: base.scope.spec,
			status: "ACTIVE"
		},
		tasks: [copy]
	});
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-assignment/src/assignment-records.ts
var RECORD_VERSION = 1;
var RECORDS_DIR = "assignments";
var RECORD_SUFFIX = ".json";
var ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
var UNSAFE_ID_CHARACTERS = /[^A-Za-z0-9._-]/gu;
var STATUSES = /* @__PURE__ */ new Set([
	"ASSIGNED",
	"INTEGRATED",
	"NEEDS_SETUP",
	"READY",
	"READY_FOR_INTEGRATION",
	"RUNNING"
]);
/** Stable readable id: `<scopeId>-<taskId>-<iteration>` with unsafe characters as `-`. */
function assignmentId(scopeId, taskId, iteration) {
	return `${scopeId}-${taskId}-${iteration}`.replace(UNSAFE_ID_CHARACTERS, "-");
}
function ensureId(id) {
	ensure(typeof id === "string" && ID_PATTERN.test(id), "ASSIGNMENT_ID", `Invalid assignment id: ${String(id)}`);
}
function recordsDirectory(root) {
	return workflowGitFacade.localPath(root, RECORDS_DIR);
}
function recordFile(root, id) {
	ensureId(id);
	return workflowGitFacade.localPath(root, RECORDS_DIR, `${id}${RECORD_SUFFIX}`);
}
function isRecord(value, id) {
	const record = value;
	return record !== null && typeof record === "object" && record.version === RECORD_VERSION && record.id === id && typeof record.scopeId === "string" && typeof record.taskId === "string" && Number.isSafeInteger(record.iteration) && typeof record.baseCommit === "string" && STATUSES.has(record.status);
}
/** The stored record, or null when the file is missing; an unreadable record fails. */
function readRecord(root, id) {
	const file = recordFile(root, id);
	const text = workflowPlatformFacade.readTextIfExists(file);
	if (text === null) return null;
	let parsed = null;
	try {
		parsed = JSON.parse(text);
	} catch {
		parsed = null;
	}
	if (!isRecord(parsed, id)) throw new WorkflowError("ASSIGNMENT_RECORD", `The assignment record ${id} is unreadable.`, { file }, "Inspect the record file; the Kit does not guess its state.");
	return parsed;
}
/** Every record, oldest first (createdAt, then id). */
function listRecords(root) {
	let names = [];
	try {
		names = readdirSync(recordsDirectory(root));
	} catch {
		return [];
	}
	return names.filter((name) => name.endsWith(RECORD_SUFFIX)).map((name) => name.slice(0, -5)).filter((id) => ID_PATTERN.test(id)).map((id) => readRecord(root, id)).sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}
/** Atomic two-space JSON write. */
function writeRecord(root, record) {
	workflowPlatformFacade.writeFileAtomic(recordFile(root, record.id), `${JSON.stringify(record, null, 2)}\n`);
}
/** Removes the record file; a missing file is not an error. */
function removeRecord(root, id) {
	rmSync(recordFile(root, id), { force: true });
}
/** A record that still occupies its task and a worker: not yet integrated. */
function isActiveRecord(record) {
	return record.status !== "INTEGRATED";
}
/** A new `ASSIGNED` record; nothing about the worktree is known yet. */
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
/** sha256 (hex) of the Kit configuration file, or null when it is absent. */
function configDigest(root) {
	const text = workflowPlatformFacade.readTextIfExists(workflowQualityFacade.configFile(root));
	return text === null ? null : createHash("sha256").update(text).digest("hex");
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-assignment/src/assignment-cleanup.ts
var WORKTREE_LINE = "worktree ";
/** The worktree paths git has registered for the repository of `root`. */
function registeredWorktrees(git, root) {
	return git.git.text(root, [
		"worktree",
		"list",
		"--porcelain"
	]).split("\n").filter((line) => line.startsWith(WORKTREE_LINE)).map((line) => line.slice(9));
}
/** Runs one git step; its refusal (stderr or stdout) or null on success. */
function refusal(git, root, args) {
	const output = git.git.run(root, args, { allowFailure: true });
	if (output.status === 0) return null;
	const text = output.stderr.trim() || output.stdout.trim();
	return `git ${args.join(" ")}: ${text || `exit code ${output.status}`}`;
}
/**
* The cleanup steps after integration (spec 7): `git worktree remove` without
* force (ignored files such as node_modules do not block it), `git worktree
* prune`, then `git branch -d` for the record's branch. The first refusal is
* the pending reason.
*/
function cleanupSteps(git, root, record) {
	const worktree = record.worktree;
	if (worktree !== null && registeredWorktrees(git, root).some((item) => workflowPlatformFacade.samePath(item, worktree))) {
		const removed = refusal(git, root, [
			"worktree",
			"remove",
			worktree
		]);
		if (removed) return removed;
	}
	const pruned = refusal(git, root, ["worktree", "prune"]);
	if (pruned || record.branch === null) return pruned;
	return git.git.succeeds(root, [
		"show-ref",
		"--verify",
		"--quiet",
		`refs/heads/${record.branch}`
	]) ? refusal(git, root, [
		"branch",
		"-d",
		record.branch
	]) : null;
}
/**
* Removes the worktree and the merged branch of an `INTEGRATED` assignment
* and records `cleanup` in the main record: `DONE`, or `PENDING` with the
* reason of a refusal (the next `assignment:cleanup` repeats it). A record
* already `DONE` is returned unchanged.
*/
function cleanupAssignment(git, root, record, now) {
	ensure(record.status === "INTEGRATED", "ASSIGNMENT_NOT_INTEGRATED", `${record.id} is ${record.status}; only an INTEGRATED assignment is cleaned up.`, { status: record.status });
	if (record.cleanup?.status === "DONE") return record;
	const reason = cleanupSteps(git, root, record);
	const cleanup = reason === null ? {
		at: now,
		status: "DONE"
	} : {
		at: now,
		reason,
		status: "PENDING"
	};
	const updated = {
		...record,
		cleanup,
		updatedAt: now
	};
	writeRecord(root, updated);
	return updated;
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-assignment/src/assignment-cancel.ts
/** The registered worktree path of the record, or null. */
function registeredWorktree(git, root, record) {
	const worktree = record.worktree;
	if (worktree === null) return null;
	return registeredWorktrees(git, root).find((item) => workflowPlatformFacade.samePath(item, worktree)) ?? null;
}
function failed(record, reason) {
	throw new WorkflowError("ASSIGNMENT_CANCEL_FAILED", `${record.id} was not cancelled: ${reason}`, {
		id: record.id,
		reason
	}, `Resolve the reason, then repeat scripts/workflow assignment:cancel --id ${record.id}; the record is kept.`);
}
/**
* Cancels an assignment that is not INTEGRATED: removes its registered
* worktree (a dirty one only with `force`), prunes, deletes its branch even
* with commits that were never integrated, and removes the record last, so
* a git refusal keeps the record and the cancel can be repeated. The plan
* of main is not touched: the task stays TODO.
*/
function cancelAssignment$1(git, root, record, options) {
	ensure(record.status !== "INTEGRATED", "ASSIGNMENT_INTEGRATED", `${record.id} is INTEGRATED; its task is done and only its cleanup remains.`, {
		id: record.id,
		status: record.status
	}, `Run scripts/workflow assignment:cleanup --id ${record.id}.`);
	const worktree = registeredWorktree(git, root, record);
	const present = worktree !== null && existsSync(worktree);
	if (present && !options.force) {
		const dirty = git.changes(worktree).all;
		ensure(dirty.length === 0, "ASSIGNMENT_DIRTY", `The worktree ${worktree} of ${record.id} has uncommitted changes.`, {
			id: record.id,
			paths: dirty,
			worktree
		}, `Commit or remove them, or drop them with scripts/workflow assignment:cancel --id ${record.id} --force.`);
	}
	if (present) {
		const removed = refusal(git, root, [
			"worktree",
			"remove",
			...options.force ? ["-f", "-f"] : [],
			worktree
		]);
		if (removed) failed(record, removed);
	}
	const pruned = refusal(git, root, ["worktree", "prune"]);
	if (pruned) failed(record, pruned);
	let branchTip = null;
	if (record.branch !== null) {
		const tip = git.git.run(root, [
			"rev-parse",
			"--verify",
			"-q",
			`refs/heads/${record.branch}`
		], { allowFailure: true });
		if (tip.status === 0) {
			const deleted = refusal(git, root, [
				"branch",
				"-D",
				record.branch
			]);
			if (deleted) failed(record, deleted);
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
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-assignment/src/assignment-guard.ts
/** Launchers of the Kit; an executor never changes them. */
var LAUNCHERS$1 = /* @__PURE__ */ new Set([
	"scripts/workflow",
	"scripts/workflow.cmd",
	"scripts/workflow.ps1"
]);
/** Kit configuration and plans; the plan file itself is checked separately. */
var CONTRACT_PREFIXES = [".harness/workflow/", ".harness/plans/"];
/** A path is in scope when it equals or is nested (by segment) in a task file entry. */
function inTaskScope$1(files, file) {
	return files.some((entry) => file === entry || file.startsWith(`${entry}/`));
}
function parse(text) {
	if (text === null) return null;
	try {
		return workflowPlanFacade.parse(text);
	} catch {
		return null;
	}
}
function contractError(message, paths) {
	return new WorkflowError("ASSIGNMENT_CONTRACT", message, { paths }, "Revert these changes; the executor contract (plan, Kit configuration, launchers) is fixed by the assignment.");
}
/**
* The plan the Kit's own transitions make from the committed executor plan:
* the single task started, its files extended and completed (with the round
* digest of a DOCS task). Null when the candidate cannot be such a plan.
*/
function kitTransition(head, candidate, task) {
	const own = candidate.tasks.find((item) => item.id === task.id);
	if (candidate.tasks.length !== 1 || !own || own.files.length < task.files.length || task.files.some((file, index) => own.files[index] !== file)) return null;
	try {
		const started = structuredClone(workflowPlanFacade.startTask(head, task.id, task.confirmation));
		workflowPlanFacade.task(started, task.id).files = [...own.files];
		const digest = candidate.rounds.find((round) => round.id === task.roundId)?.digest ?? null;
		return workflowPlanFacade.completeTask(started, task.id, digest);
	} catch {
		return null;
	}
}
/**
* Refuses a commit of an executor worktree that breaks the assignment
* contract (spec 5.3), in this order: Kit configuration, launchers and other
* plans (`ASSIGNMENT_CONTRACT`), paths outside the task files
* (`ASSIGNMENT_SCOPE`), and a plan other than the Kit's own transitions of
* the single task (`ASSIGNMENT_CONTRACT`).
*/
function checkExecutorChange(change) {
	const head = parse(change.headPlan);
	const task = head?.tasks.length === 1 ? head.tasks[0] : void 0;
	if (!(head && task)) throw contractError("HEAD has no executor plan with one task.", [change.planPath]);
	const files = change.paths.filter((file) => file !== change.planPath);
	const contract = files.filter((file) => LAUNCHERS$1.has(file) || CONTRACT_PREFIXES.some((prefix) => file.startsWith(prefix)));
	if (contract.length > 0) throw contractError(`An executor never changes the Kit configuration, the launchers or the plans: ${contract.join(", ")}.`, contract);
	const outside = files.filter((file) => !inTaskScope$1(task.files, file));
	ensure(outside.length === 0, "ASSIGNMENT_SCOPE", `These paths are outside the files of ${task.id}: ${outside.join(", ")}.`, {
		files: task.files,
		paths: outside
	}, `Change only the files of ${task.id} or paths nested in them; commit a subset with \`scripts/workflow commit --task ${task.id} --files <json|a,b>\`.`);
	if (change.paths.includes(change.planPath)) {
		const candidate = parse(change.candidatePlan);
		const expected = candidate && kitTransition(head, candidate, task);
		const added = candidate ? (candidate.tasks[0]?.files ?? []).slice(task.files.length) : [];
		if (!(candidate && expected) || workflowPlanFacade.render(expected) !== workflowPlanFacade.render(candidate) || added.some((file) => !inTaskScope$1(task.files, file))) throw contractError(`The plan may change only through the Kit's own transitions of ${task.id}.`, [change.planPath]);
	}
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-assignment/src/assignment-schedule.ts
var ASSIGNABLE_KINDS = /* @__PURE__ */ new Set(["docs", "work"]);
function pendingPrerequisites(plan, task) {
	const status = new Map(plan.tasks.map((item) => [item.id, item.status]));
	const pending = task.dependencies.filter((id) => status.get(id) !== "DONE");
	if (task.kind === "docs") {
		for (const item of plan.tasks) if (item.kind === "work" && item.roundId === task.roundId && item.status !== "DONE") pending.push(item.id);
	}
	return [...new Set(pending)];
}
function blocked(task, code, blockedBy, message) {
	return {
		blockedBy: [...new Set(blockedBy)],
		code,
		message,
		taskId: task.id
	};
}
function verdict(plan, index, taken, maxWorkers) {
	const task = plan.tasks[index];
	const pending = pendingPrerequisites(plan, task);
	if (pending.length > 0) return blocked(task, "DEPENDENCY_PENDING", pending, `${task.id} waits for unfinished prerequisites: ${pending.join(", ")}.`);
	const earlier = plan.tasks.slice(0, index).filter((item) => item.status !== "DONE");
	if (task.parallelSafe === true) {
		const byId = new Map(plan.tasks.map((item) => [item.id, item]));
		const sequential = [...earlier.filter((item) => item.parallelSafe !== true), ...taken.map((id) => byId.get(id)).filter((item) => item !== void 0 && item.parallelSafe !== true)];
		if (sequential.length > 0) return blocked(task, "ASSIGNMENT_BARRIER", sequential.map((item) => item.id), `${task.id} may not overtake an unfinished task that is not parallelSafe.`);
		const conflicts = taken.filter((id) => !workflowPlanFacade.compatibleTasks(plan, task.id, id));
		if (conflicts.length > 0) return blocked(task, "ASSIGNMENT_CONFLICT", conflicts, `${task.id} is not compatible with the assigned ${conflicts.join(", ")} (paths or dependencies).`);
	} else if (earlier.length > 0 || taken.length > 0) return blocked(task, "ASSIGNMENT_BARRIER", [...earlier.map((item) => item.id), ...taken], `${task.id} is not parallelSafe: every earlier task must be DONE and no assignment may be active.`);
	if (taken.length >= maxWorkers) return blocked(task, "ASSIGNMENT_CAPACITY", taken, `All ${maxWorkers} workers are taken.`);
	return null;
}
/**
* Which tasks of an orchestrated scope can be handed out now (spec 5.1, 6).
* Candidates are TODO `work` and `DOCS` tasks without an active assignment,
* visited in plan order; each ready candidate counts as taken for the later
* ones, so the whole `ready` list may be assigned together.
*/
function scheduleAssignments(plan, assignments) {
	const execution = workflowPlanFacade.execution(plan);
	const scope = plan.scope;
	const orchestrated = scope !== null && execution.strategy === "orchestrated";
	const active = scope ? [...new Set(assignments.filter((item) => item.scopeId === scope.id && isActiveRecord(item)).map((item) => item.taskId))] : [];
	const schedule = {
		active,
		blocked: [],
		idle: null,
		maxWorkers: execution.maxWorkers,
		orchestrated,
		ready: []
	};
	if (!orchestrated) return {
		...schedule,
		idle: "NOT_ORCHESTRATED"
	};
	if (scope.status !== "ACTIVE") return {
		...schedule,
		idle: "SCOPE_NOT_ACTIVE"
	};
	const taken = [...active];
	plan.tasks.forEach((task, index) => {
		if (task.status !== "TODO" || !ASSIGNABLE_KINDS.has(task.kind) || active.includes(task.id)) return;
		const reason = verdict(plan, index, taken, execution.maxWorkers);
		if (reason) schedule.blocked.push(reason);
		else {
			schedule.ready.push(task.id);
			taken.push(task.id);
		}
	});
	return schedule;
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-assignment/src/assignment-setup.ts
/** Frozen-lock installs of the node package managers (spec 5.4). */
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
var SETUP_TIMEOUT_MS = 900 * 1e3;
var OUTPUT_TAIL = 4e3;
var SETUP_STATUSES = /* @__PURE__ */ new Set([
	"NEEDS_SETUP",
	"READY",
	"RUNNING"
]);
function tail(text) {
	return text.length > OUTPUT_TAIL ? `…${text.slice(-4e3)}` : text;
}
function hasEntry(file) {
	try {
		lstatSync(file);
		return true;
	} catch {
		return false;
	}
}
/** package.json of the worktree root declares dependencies or devDependencies. */
function declaresDependencies(worktree) {
	const text = workflowPlatformFacade.readTextIfExists(path.join(worktree, "package.json"));
	if (text === null) return false;
	try {
		const manifest = JSON.parse(text);
		return DEPENDENCY_FIELDS.some((field) => {
			const value = manifest[field];
			return value !== null && typeof value === "object" && Object.keys(value).length > 0;
		});
	} catch {
		return false;
	}
}
/**
* The install of the profile's node stack for this worktree, or null when the
* profile has no node stack or the manifest declares no dependencies. The
* package manager is the profile's node one, else the one whose lock file
* exists, else npm.
*/
function stackSetup(worktree, config) {
	if (!(config.quality.stacks.includes("node") && declaresDependencies(worktree))) return null;
	const configured = NODE_SETUP[config.quality.packageManager ?? ""];
	if (configured) return configured;
	return Object.values(NODE_SETUP).find((setup) => setup.locks.some((lock) => existsSync(path.join(worktree, lock)))) ?? NODE_SETUP.npm;
}
/**
* True when the commit-stage checks of the task run commands and the profile
* stack needs dependencies the worktree lacks (no `node_modules` entry). A
* DOCS task commits as a service commit (documentation builtins only), so it
* never needs setup.
*/
function needsSetup(worktree, task) {
	const config = workflowQualityFacade.readConfig(worktree);
	return workflowQualityFacade.selectChecks({
		assigned: task.checks,
		config,
		root: worktree,
		service: task.kind === "docs",
		stage: "commit"
	}).some((check) => check.command !== void 0) && stackSetup(worktree, config) !== null && !hasEntry(path.join(worktree, DEPENDENCY_DIRECTORY));
}
function lockFile(worktree, setup) {
	const lock = setup.locks.find((name) => existsSync(path.join(worktree, name)));
	ensure(lock, "SETUP_LOCK_REQUIRED", `${setup.executable} needs a lock file (${setup.locks.join(" or ")}) in the worktree to install the exact dependencies.`, {
		locks: setup.locks,
		worktree
	}, "Commit the lock file in main, then create the assignment again.");
	return path.join(worktree, lock);
}
function ensureNotLinked(worktree) {
	const dependencies = path.join(worktree, DEPENDENCY_DIRECTORY);
	let linked = false;
	try {
		linked = lstatSync(dependencies).isSymbolicLink();
	} catch {
		linked = false;
	}
	ensure(!linked, "SETUP_LINKED_DEPENDENCIES", `${dependencies} is a link; the install would change the dependencies it points to.`, { path: dependencies }, "Remove the link, then repeat assignment:setup.");
}
function runInstall(worktree, setup, env) {
	const command = [setup.executable, ...setup.args].join(" ");
	const outcome = workflowPlatformFacade.run({
		args: setup.args,
		cwd: worktree,
		env,
		executable: setup.executable,
		timeoutMs: SETUP_TIMEOUT_MS
	});
	const output = tail(`${outcome.stdout}${outcome.stderr}`);
	if (outcome.status !== 0 || outcome.timedOut) throw new WorkflowError("SETUP_FAILED", `${command} failed in ${worktree}: ${outcome.timedOut ? `timed out after ${SETUP_TIMEOUT_MS} ms` : outcome.errorMessage ?? `exit code ${String(outcome.status)}`}.`, {
		command,
		exitCode: outcome.status,
		output
	}, "Fix the cause shown in the output, then repeat assignment:setup.");
	return output;
}
/**
* `assignment:setup` (spec 5.4): runs the stack install in the assignment's
* worktree (never touching main's dependencies), then writes the receipt and
* moves `NEEDS_SETUP` to `READY` in the main record. A failure leaves the
* record unchanged.
*/
function setupAssignment$1(mainRoot, record, options) {
	ensure(record.worktree !== null && SETUP_STATUSES.has(record.status), "ASSIGNMENT_STATUS", `${record.id} is ${record.status}; setup runs for an attached assignment before its result is ready.`, { status: record.status });
	const worktree = record.worktree;
	ensure(existsSync(worktree), "ASSIGNMENT_WORKTREE", `The worktree ${worktree} of ${record.id} does not exist.`, { worktree });
	const setup = stackSetup(worktree, workflowQualityFacade.readConfig(worktree));
	let receipt = null;
	let output = "";
	if (setup) {
		const lock = lockFile(worktree, setup);
		ensureNotLinked(worktree);
		const lockHash = createHash("sha256").update(readFileSync(lock)).digest("hex");
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
	return {
		assignment: updated,
		output,
		ran: setup !== null
	};
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-assignment/src/workflow-assignment-facade.ts
function attribute(value) {
	return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;");
}
/** The marked full text of the context documents, after the brief lines. */
function documentBlocks(documents) {
	if (documents.length === 0) return [];
	return [
		"Context documents (full text, do not re-read them):",
		"",
		...documents.flatMap((item) => [
			`<document path="${attribute(item.path)}"${item.heading ? ` heading="${attribute(item.heading)}"` : ""} bytes="${item.bytes}">`,
			item.text,
			"</document>",
			""
		])
	];
}
function bullets$1(items) {
	return items.length > 0 ? items.map((item) => `   - ${item}`) : ["   - (none)"];
}
/** The ready text of the executor subagent for one assignment. */
function executorBrief(plan, task, record, documents) {
	const commit = task.kind === "docs" ? `scripts/workflow commit --task ${task.id} --digest <file.json> (the round digest: result, decisions, contracts, references)` : `scripts/workflow commit --task ${task.id}`;
	const context = task.context.map((ref) => ref.heading ? `${ref.path} (${ref.heading})` : ref.path);
	return [
		`You are the executor of task ${task.id} of scope ${record.scopeId}${plan.projectName ? ` (project ${plan.projectName})` : ""}; assignment ${record.id}.`,
		"Your working directory is your own git worktree. Work only there.",
		"",
		`1. FIRST run in your worktree: scripts/workflow assignment:attach ${record.id}`,
		"   If it reports NEEDS_SETUP, run scripts/workflow assignment:setup",
		"   (installs the dependencies from the lock file in your worktree).",
		`2. Then run: scripts/workflow task:start ${task.id}`,
		"3. Implement the task within its files and acceptance criteria:",
		`   Title: ${task.title}`,
		...task.why ? [`   Why: ${task.why}`] : [],
		"   Files:",
		...bullets$1(task.files),
		"   Acceptance:",
		...bullets$1(task.acceptance),
		...context.length > 0 ? ["   Context:", ...bullets$1(context)] : [],
		"   Change only the listed files or paths nested inside a listed directory;",
		"   anything else fails with ASSIGNMENT_SCOPE (commit a subset with --files).",
		"   Never edit .harness/workflow/**, the launchers scripts/workflow* or the plan",
		"   (ASSIGNMENT_CONTRACT).",
		`4. Commit through the Kit: ${commit}`,
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
		...documentBlocks(documents)
	].join("\n");
}
/**
* Public boundary of the workflow-assignment module: assignment records of
* the main checkout, the scheduler of orchestrated scopes and the executor
* brief (sections 5.1, 5.2 and 6 of WorkflowKitExecutionModes.md).
*/
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
	brief(plan, task, record, documents = []) {
		return executorBrief(plan, task, record, documents);
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
	checkExecutorChange(change) {
		checkExecutorChange(change);
	}
	/** The task's commit checks need dependencies the worktree lacks (spec 5.4). */
	needsSetup(worktree, task) {
		return needsSetup(worktree, task);
	}
	/** `assignment:setup`: the stack install in the worktree, receipt and READY (spec 5.4). */
	setup(mainRoot, record, options) {
		return setupAssignment$1(mainRoot, record, options);
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
		return cancelAssignment$1(git, mainRoot, record, options);
	}
};
var workflowAssignmentFacade = new WorkflowAssignmentFacade();
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-execution-mode/src/workflow-execution-mode-facade.ts
var PROPOSAL_FILE = "scope-proposal.json";
var PROPOSAL_VERSION = 1;
var REASON_MIN = 10;
var REASON_MAX = 300;
var STRATEGIES = /* @__PURE__ */ new Set(["orchestrated", "sequential"]);
var OPTIONS = /* @__PURE__ */ new Set([
	"orchestrated",
	"refine",
	"sequential"
]);
function canonical(value) {
	if (Array.isArray(value)) return value.map(canonical);
	if (value !== null && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
	return value;
}
/** sha256 of the canonical JSON (sorted keys) of the plan input. */
function planDigest(input) {
	return createHash("sha256").update(JSON.stringify(canonical(input))).digest("hex");
}
/**
* Options of the mode card. With parallel work: the recommendation, the
* other mode, "refine". Without: "sequential", "refine"; recommending
* `orchestrated` then fails with NO_PARALLEL_WORK.
*/
function proposalOptions(recommended, hasParallelWork) {
	ensure(STRATEGIES.has(recommended), "PROPOSAL_RECOMMENDATION", "The recommendation is sequential or orchestrated.");
	if (hasParallelWork) return [
		recommended,
		recommended === "sequential" ? "orchestrated" : "sequential",
		"refine"
	];
	ensure(recommended === "sequential", "NO_PARALLEL_WORK", "The plan has no pair of compatible parallelSafe tasks; orchestrated execution cannot be recommended.", {}, "Recommend sequential, or label independent tasks with parallelSafe and concrete files.");
	return ["sequential", "refine"];
}
function validReason(reason) {
	const text = typeof reason === "string" ? reason.trim() : "";
	ensure(text.length >= REASON_MIN && text.length <= REASON_MAX, "PROPOSAL_REASON", `The reason of the recommendation has ${REASON_MIN} to ${REASON_MAX} characters.`);
	return text;
}
function isProposal(value) {
	const record = value;
	return record !== null && typeof record === "object" && record.version === PROPOSAL_VERSION && Number.isSafeInteger(record.generation) && record.generation >= 1 && Array.isArray(record.options);
}
/**
* Public boundary of the workflow-execution-mode module: the scope proposal
* record, the options of the mode card and the verification of a choice.
*/
var WorkflowExecutionModeFacade = class {
	proposalFile(root) {
		return workflowGitFacade.localPath(root, PROPOSAL_FILE);
	}
	options(recommended, hasParallelWork) {
		return proposalOptions(recommended, hasParallelWork);
	}
	digest(input) {
		return planDigest(input);
	}
	/** The stored proposal; a missing or unreadable record is `null`. */
	readProposal(root) {
		const text = workflowPlatformFacade.readTextIfExists(this.proposalFile(root));
		if (text === null) return null;
		try {
			const parsed = JSON.parse(text);
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
		const options = proposalOptions(request.recommended, request.hasParallelWork);
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
		workflowPlatformFacade.writeFileAtomic(this.proposalFile(root), `${JSON.stringify(proposal, null, 2)}\n`);
	}
	/**
	* Checks a choice against the stored proposal and returns it. A missing
	* proposal, another generation, a proposal in refinement or a stored plan
	* that no longer matches its digest fail with PROPOSAL_CHANGED; an option
	* the card does not offer fails with NO_PARALLEL_WORK (orchestrated
	* without parallel work) or PROPOSAL_OPTION.
	*/
	verifyChoice(root, request) {
		ensure(OPTIONS.has(request.option), "PROPOSAL_OPTION", "The option is sequential, orchestrated or refine.");
		ensure(typeof request.session === "string" && request.session.trim() !== "", "PROPOSAL_SESSION", "The choice names the session that owns the scope.");
		ensure(typeof request.note === "string" && request.note.trim() !== "", "PROPOSAL_NOTE", "The choice records the user's words in the note.");
		const proposal = this.readProposal(root);
		ensure(proposal !== null && proposal.generation === request.generation && proposal.input !== null && proposal.planDigest === planDigest(proposal.input), "PROPOSAL_CHANGED", "The choice does not answer the current scope proposal.", {
			current: proposal?.generation ?? null,
			generation: request.generation
		}, "Read the current proposal and let the user choose again.");
		ensure(request.option !== "orchestrated" || proposal.hasParallelWork, "NO_PARALLEL_WORK", "The proposed plan has no parallel work; orchestrated execution is not offered.");
		ensure(proposal.options.includes(request.option), "PROPOSAL_OPTION", `The proposal offers only: ${proposal.options.join(", ")}.`);
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
		rmSync(this.proposalFile(root), { force: true });
	}
};
var workflowExecutionModeFacade = new WorkflowExecutionModeFacade();
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-recovery/src/recovery-roles.ts
var LIST_LIMIT$1 = 10;
var INTEGRATION_JOURNAL = "integration.json";
var ROLE_RULES = {
	executor: "Role executor: work only in this worktree and only on paths equal to or nested in the task files. Never touch main, the plan or other tasks; no nested executors; no push.",
	orchestrator: "Role orchestrator: work and DOCS tasks go to executors (`assignment:create`, a Claude subagent with isolation: \"worktree\"), their SHAs to `integration:start`; never implement them in main. Run QUALITY and delivery yourself in main. On CONFLICT or CHECKS_FAILED fix within the task files, then `integration:continue --id <id>`.",
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
/**
* Reads the integration journal written by `integration:start`; an
* unreadable journal still counts as an integration in progress.
*/
function readIntegration(git, root) {
	const text = workflowPlatformFacade.readTextIfExists(git.localPath(root, INTEGRATION_JOURNAL));
	if (text === null) return null;
	try {
		const journal = JSON.parse(text);
		const id = journal.assignmentId ?? journal.id;
		return {
			assignmentId: typeof id === "string" ? id : "<id>",
			phase: typeof journal.phase === "string" ? journal.phase : "UNKNOWN"
		};
	} catch {
		return {
			assignmentId: "<id>",
			phase: "UNKNOWN"
		};
	}
}
function mainAssignments(root, plan) {
	return workflowAssignmentFacade.list(root).filter((record) => record.scopeId === plan.scope?.id && workflowAssignmentFacade.isActive(record) || record.cleanup?.status === "PENDING").map((record) => ({
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
/** Gathers the role facts of a checkout; problems become warnings. */
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
	} catch (error) {
		warnings.push(`Assignment state is unreadable (${error.code ?? "error"}); run \`${KIT_COMMAND} assignment:status\` or \`${KIT_COMMAND} doctor\`.`);
	}
	return facts;
}
/** The role of the session; without gathered facts the plan alone decides. */
function agentRole(input) {
	const facts = input.roles;
	if (facts?.executor || facts?.unattachedWorktree) return "executor";
	if (input.plan.scope === null) return "planning";
	return orchestrated(input.plan) ? "orchestrator" : "self";
}
function roleRule(role) {
	return ROLE_RULES[role];
}
/** At most LIST_LIMIT items, then a "… N more" item. */
function bounded(items) {
	const shown = items.slice(0, LIST_LIMIT$1);
	return items.length > LIST_LIMIT$1 ? [...shown, `… ${items.length - LIST_LIMIT$1} more`] : shown;
}
function assignmentLine(record) {
	const place = record.worktree ?? "not attached";
	const cleanup = record.cleanupPending ? ", cleanup PENDING" : "";
	return `${record.id} ${record.taskId} ${record.status} ${place}${cleanup}`;
}
/** `role:` and the assignment lines of the state section. */
function roleStateLines(input) {
	const role = agentRole(input);
	const facts = input.roles;
	if (role === "executor") return facts?.executor ? [`role: executor (assignment ${facts.executor.id}, task ${facts.executor.taskId}, ${facts.executor.status ?? "no main record"})`] : ["role: executor (not attached)"];
	if (role !== "orchestrator" || !facts) return [`role: ${role}`];
	const shown = bounded(facts.assignments.map(assignmentLine));
	return [
		"role: orchestrator",
		`assignments: ${shown.length === 0 ? "none" : ""}`.trimEnd(),
		...shown.map((line) => `- ${line}`),
		`integration: ${facts.integration ? `${facts.integration.assignmentId} ${facts.integration.phase}` : "none"}`
	];
}
/** The planning step: propose the plan, or wait for the user's choice. */
function planningStep(input) {
	const proposal = input.roles?.proposal;
	if (proposal && !proposal.refining) return `No active scope: the scope proposal (generation ${proposal.generation}, recommended ${proposal.recommended}) is waiting for the user's choice on the card. End the turn; do not create the scope yourself.`;
	const propose = `\`${KIT_COMMAND} scope:propose --input <plan.json> --recommended sequential|orchestrated --reason "<why>"\`, then end the turn and wait for the user's choice on the card`;
	if (proposal?.refining) return `No active scope: the user chose to refine the specification. Discuss it, update the spec and the plan, then propose again: ${propose}.`;
	return input.roles?.harness ? `No active scope. Agree the task with the user, write the specification and a plan with parallelSafe labels, then ${propose}.` : `No active scope. Agree the task with the user, write the specification and the plan, then \`${KIT_COMMAND} scope:create --input <plan.json>\`.`;
}
function commitCommand(task) {
	return task.kind === "docs" ? `\`${KIT_COMMAND} commit --task ${task.id} --digest <file.json>\`` : `\`${KIT_COMMAND} commit --task ${task.id}\``;
}
/** The executor step: attach, set up, run the one task, report its SHA. */
function executorStep(input) {
	const executor = input.roles?.executor;
	if (!executor) return `Executor worktree not attached: run \`${KIT_COMMAND} assignment:attach <id>\` with the assignment id from your brief first.`;
	const task = input.plan.tasks.find((item) => item.id === executor.taskId);
	if (!task) return `Task ${executor.taskId} is not in this worktree's plan: report it to the orchestrator.`;
	if (task.status === "DONE") {
		const sha = input.taskCommits[task.id];
		return `Task ${task.id} is committed${sha ? ` (${sha})` : ""}: report the SHA to the orchestrator and end the turn.`;
	}
	if (task.status === "IN_PROGRESS") return `Continue ${task.id}: ${task.title}. Commit with ${commitCommand(task)}, then report the SHA.`;
	if (executor.status === "NEEDS_SETUP") return `The worktree needs setup: run \`${KIT_COMMAND} assignment:setup\`, then \`${KIT_COMMAND} task:start ${task.id}\`.`;
	return `Start ${task.id} via \`${KIT_COMMAND} task:start ${task.id}\`: ${task.title}. Then commit with ${commitCommand(task)} and report the SHA.`;
}
function integrationStep(integration) {
	const id = integration.assignmentId;
	const resume = `\`${KIT_COMMAND} integration:continue --id ${id}\``;
	if (integration.phase === "CONFLICT") return `Integration of ${id} stopped on CONFLICT: resolve the conflicts within the task files, then ${resume}.`;
	if (integration.phase === "CHECKS_FAILED") return `Integration of ${id} failed its checks: fix the cause within the task files, then ${resume}.`;
	return `Integration of ${id} is ${integration.phase}: finish it with ${resume} before anything else (\`${KIT_COMMAND} integration:status\` shows it).`;
}
/** QUALITY or delivery task the orchestrator runs itself, when it is ready. */
function ownStep(plan, facts) {
	const done = new Set(plan.tasks.filter((task) => task.status === "DONE").map((task) => task.id));
	const own = plan.tasks.find((task) => task.status === "TODO" && (task.kind === "quality" || task.kind === "delivery") && task.dependencies.every((id) => done.has(id)));
	if (!own) return null;
	if (own.kind === "quality") return `Run ${own.id} yourself in main via \`${KIT_COMMAND} task:start ${own.id}\`: ${own.title}`;
	const pending = plan.tasks.some((task) => task.kind !== "delivery" && task.status !== "DONE");
	const active = facts.assignments.some((record) => workflowAssignmentFacade.isActive(record));
	return pending || active ? null : `Next task ${own.id} is delivery: ask the user to confirm it, then \`${KIT_COMMAND} task:start ${own.id} --confirmed "<user confirmation>"\`.`;
}
/**
* The orchestrator step in main: an integration in progress, then results
* to integrate, then its own tasks or tasks to hand out, otherwise waiting.
*/
function orchestratorStep(input) {
	const { plan } = input;
	const facts = input.roles ?? emptyFacts(false);
	if (facts.integration) return integrationStep(facts.integration);
	const lines = [];
	const results = facts.assignments.filter((record) => record.status === "READY_FOR_INTEGRATION");
	if (results.length > 0) lines.push("Integrate first, one at a time:", ...bounded(results.map((record) => `\`${KIT_COMMAND} integration:start --id ${record.id} --source ${shortSha(record.sourceCommit)}\` (task ${record.taskId})`)).map((line) => `- ${line}`));
	const current = plan.tasks.find((task) => task.id === plan.currentTaskId);
	const own = current ? `Continue ${current.id} in main: ${current.title}` : ownStep(plan, facts);
	if (own) lines.push(own);
	const ready = current ? [] : workflowAssignmentFacade.schedule(plan, facts.assignments).ready;
	if (ready.length > 0) lines.push(`Hand out ${ready.join(", ")}: for each, \`${KIT_COMMAND} assignment:create --task <ID>\`, then launch a Claude subagent (Agent tool with isolation: "worktree") with the returned brief and wait for its SHA (\`${KIT_COMMAND} assignment:next\` lists what can go now).`);
	const running = facts.assignments.filter((record) => workflowAssignmentFacade.isActive(record) && record.status !== "READY_FOR_INTEGRATION");
	if (lines.length === 0 && running.length > 0) lines.push(`Waiting for executors: ${bounded(running.map((record) => `${record.id} (${record.taskId}, ${record.status})`)).join(", ")}. Integrate each result when its SHA arrives.`);
	const cleanups = facts.assignments.filter((record) => record.cleanupPending);
	if (cleanups.length > 0) lines.push(`Finish cleanups: ${bounded(cleanups.map((record) => `\`${KIT_COMMAND} assignment:cleanup --id ${record.id}\``)).join(", ")}.`);
	return lines.length > 0 ? lines.join("\n") : "No task is ready: check dependencies with the user.";
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-recovery/src/recovery-sections.ts
var LIST_LIMIT = 40;
var UPCOMING = 3;
var VERIFICATION_OUTPUT_BYTES = 1024;
var ROUND_LINE_BYTES = 160;
function bullets(items, empty = "none") {
	return items.length === 0 ? `- ${empty}` : items.map((item) => `- ${item}`).join("\n");
}
function limited(paths) {
	const shown = paths.slice(0, LIST_LIMIT);
	return paths.length > LIST_LIMIT ? [...shown, `… ${paths.length - LIST_LIMIT} more`] : shown;
}
function oneLine(task) {
	return `${task.id} [${task.kind}] ${task.title}`;
}
/** The current task, or the next ready one. */
function focusTask(plan) {
	const current = plan.tasks.find((task) => task.id === plan.currentTaskId);
	if (current) return current;
	const done = new Set(plan.tasks.filter((task) => task.status === "DONE").map((task) => task.id));
	return plan.tasks.find((task) => task.status === "TODO" && task.dependencies.every((id) => done.has(id))) ?? null;
}
function stateSection(input) {
	const { plan } = input;
	const scope = plan.scope;
	const transaction = input.transaction ? `${input.transaction.id} ${input.transaction.phase} (${input.transaction.role}${input.transaction.taskId ? ` ${input.transaction.taskId}` : ""})` : "none";
	return [
		`project: ${plan.projectName} (${plan.projectId})`,
		scope ? `scope: ${scope.id} ${scope.status}, result ${scope.delivery}, revision ${plan.revision}` : `scope: NONE, revision ${plan.revision}`,
		`quality: ${input.quality.status}${input.quality.stacks.length > 0 ? ` (${input.quality.stacks.join(", ")})` : ""}`,
		`head: ${shortSha(input.head)}`,
		`transaction: ${transaction}`,
		`event: ${input.event}`,
		...roleStateLines(input),
		...(input.warnings ?? []).map((warning) => `warning: ${warning}`)
	].join("\n");
}
function nextStep(input, role) {
	const { plan } = input;
	const scope = plan.scope;
	if (!scope) return planningStep(input);
	if (input.transaction) return `A commit transaction is unfinished: run \`${KIT_COMMAND} repair\` before anything else.`;
	if (scope.status === "BLOCKED") return `BLOCKED: ${scope.blockedReason ?? "no reason recorded"}. Resolve it with the user, then unblock.`;
	if (role === "executor") return executorStep(input);
	if (scope.delivery === "READY_FOR_ACCEPTANCE") return "Scope is READY_FOR_ACCEPTANCE: ask the user to accept the result or report defects.";
	if (scope.delivery === "ACCEPTED") return "Scope is ACCEPTED: the user decides when to close it.";
	if (role === "orchestrator") return orchestratorStep(input);
	const task = focusTask(plan);
	if (!task) return "No task is ready: check dependencies with the user.";
	if (task.status === "IN_PROGRESS") return `Continue ${task.id}: ${task.title}`;
	if (task.kind === "delivery") return `Next task ${task.id} is delivery: ask the user to confirm it, then \`${KIT_COMMAND} task:start ${task.id} --confirmed "<user confirmation>"\`.`;
	return `Start ${task.id} via \`${KIT_COMMAND} task:start ${task.id}\`: ${task.title}`;
}
/** The next step for the session's role, followed by the role rule. */
function nextSection(input) {
	const role = agentRole(input);
	return `${nextStep(input, role)}\n${roleRule(role)}`;
}
function objectiveSection(input) {
	const scope = input.plan.scope;
	if (!scope) return "none";
	return [
		scope.objective,
		"",
		"Acceptance:",
		bullets(scope.acceptance)
	].join("\n");
}
function field(name, value, cap, taskId) {
	if (cap === null || Buffer.byteLength(value, "utf8") <= cap) return `${name}: ${value}`;
	const kept = cutBytes(value, cap);
	return `${name}: ${kept} [truncated: ${Buffer.byteLength(value, "utf8") - Buffer.byteLength(kept, "utf8")} bytes, run: ${KIT_COMMAND} show-task ${taskId}]`;
}
/** Full text of one task; `cap` limits each long field in UTF-8 bytes. */
function describeTask(plan, task, taskCommits, cap = null) {
	const lines = [
		`${task.id} [${task.kind}] ${task.status}, round ${task.roundId}, iteration ${task.iteration}`,
		`title: ${task.title}`,
		field("why", task.why, cap, task.id),
		field("files", task.files.join(", ") || "none", cap, task.id),
		`dependencies: ${task.dependencies.join(", ") || "none"}`,
		`checks: ${task.checks.join(", ") || "profile defaults"}`,
		field("acceptance", task.acceptance.join(" | ") || "none", cap, task.id),
		field("context", task.context.map((ref) => ref.heading ? `${ref.path}#${ref.heading}` : ref.path).join(", ") || "none", cap, task.id),
		`commit: ${task.commitMessage}`
	];
	if (task.docsWaiver) lines.push(`docsWaiver: ${task.docsWaiver}`);
	if (task.confirmation) lines.push(`confirmation: ${task.confirmation}`);
	if (task.fixes) {
		const original = plan.tasks.find((item) => item.id === task.fixes);
		lines.push(`fixes: ${task.fixes} ${shortSha(taskCommits[task.fixes])}${original ? ` — ${original.title}` : ""}`);
	}
	if (taskCommits[task.id]) lines.push(`committed: ${taskCommits[task.id]}`);
	return lines.join("\n");
}
/** The focus task in full; `cap` limits each long field in UTF-8 bytes. */
function taskSection(input, cap = null) {
	const task = focusTask(input.plan);
	return task ? describeTask(input.plan, task, input.taskCommits, cap) : "none";
}
function upcomingSection(input) {
	const focus = focusTask(input.plan);
	const pending = input.plan.tasks.filter((task) => task.status === "TODO" && task.id !== focus?.id);
	const shown = pending.slice(0, UPCOMING).map(oneLine);
	const rest = pending.length - shown.length;
	return [bullets(shown), `remaining after these: ${rest}`].join("\n");
}
function recentSection(input) {
	return bullets(input.plan.tasks.filter((task) => task.status === "DONE").slice(-3).map((task) => `${task.id} ${shortSha(input.taskCommits[task.id])} ${task.title}`));
}
function roundsSection(input) {
	const digested = input.plan.rounds.filter((round) => round.digest);
	if (digested.length === 0) return null;
	const full = digested.slice(-3);
	const lines = digested.slice(0, -3).map((round) => `- ${round.id} ${round.title}: ${cutBytes(round.digest?.result ?? "", ROUND_LINE_BYTES)}`);
	for (const round of full) {
		const digest = round.digest;
		if (!digest) continue;
		lines.push(`### ${round.id} ${round.title} (${round.status})`, digest.result);
		for (const [label, items] of [
			["decisions", digest.decisions],
			["contracts", digest.contracts],
			["references", digest.references]
		]) if (items.length > 0) lines.push(`${label}:`, bullets(items));
	}
	return lines.join("\n");
}
function decisionsSection(input) {
	const decisions = input.plan.scope?.decisions ?? [];
	if (decisions.length === 0) return null;
	return bullets(decisions.slice(-5).map((decision) => `${decision.at}: ${decision.text}`));
}
function changesSection(input) {
	const lines = [`outside the task: ${input.changes.length === 0 ? "none" : ""}`.trimEnd()];
	if (input.changes.length > 0) lines.push(bullets(limited(input.changes)));
	if (input.transaction) lines.push(`pending transaction ${input.transaction.id}: ${input.transaction.phase}${input.transaction.error ? ` — ${cutBytes(input.transaction.error, 300)}` : ""}`);
	return lines.join("\n");
}
function verificationSection(input) {
	const verification = input.verification;
	if (!verification) return null;
	const lines = [`commit: ${shortSha(verification.commit)}`];
	let budget = VERIFICATION_OUTPUT_BYTES;
	for (const report of verification.reports) {
		lines.push(`${report.stage}: ${report.ok ? "ok" : "failed"}`);
		for (const item of report.results.filter((entry) => entry.status !== "passed" && entry.status !== "skipped")) {
			const output = cutBytes(item.output.slice(-1024), budget);
			budget -= Buffer.byteLength(output, "utf8");
			lines.push(`- ${item.id} ${item.status}${output ? `:\n${output}` : ""}`);
		}
	}
	return lines.join("\n");
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-recovery/src/recovery-schema.ts
var QUALITY_COMMAND = "quality:apply";
/** Commands with an input descriptor: the plan commands, then `quality:apply`. */
function inputSchemaCommands() {
	return [...workflowPlanFacade.inputSchemaCommands(), QUALITY_COMMAND];
}
/** The input descriptor of `command` from its owner module, or null. */
function inputSchema(command) {
	return command === QUALITY_COMMAND ? workflowQualityFacade.inputSchema() : workflowPlanFacade.inputSchema(command);
}
function limits(spec) {
	const items = [];
	const add = (label, value) => {
		if (value !== void 0) items.push(`${label} ${value}`);
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
	return `- ${spec.name} ${spec.type} ${spec.required ? "required" : "optional"} [${limits(spec).join(", ")}] — ${spec.description}`;
}
/**
* Compact text of a descriptor: one line per field
* (`name type required|optional [limits, code] — description`), the
* cross-field rules and the example as one line of JSON.
*/
function schemaText$1(schema) {
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
/** The task whose input the next step needs: the executor's own task, else the focus task. */
function stepTask(input) {
	const executor = input.roles?.executor;
	const task = executor ? input.plan.tasks.find((item) => item.id === executor.taskId) : focusTask(input.plan);
	return task && task.status !== "DONE" ? task : null;
}
/**
* The command whose input the next step needs, or null: a new scope
* (`scope:propose` for a Harness host, else `scope:create`) unless a
* proposal waits for the user's choice; `plan:extend` for defects of a
* scope ready for or past acceptance; `quality:apply` for a QUALITY task;
* the round digest for a DOCS task outside the orchestrator's main.
*/
function nextSchemaCommand(input) {
	const scope = input.plan.scope;
	if (!scope) {
		const proposal = input.roles?.proposal;
		if (proposal && !proposal.refining) return null;
		return input.roles?.harness ? "scope:propose" : "scope:create";
	}
	if (input.transaction || scope.status === "BLOCKED") return null;
	const role = agentRole(input);
	if (role !== "executor" && (scope.delivery === "READY_FOR_ACCEPTANCE" || scope.delivery === "ACCEPTED")) return "plan:extend";
	const task = stepTask(input);
	if (task?.kind === "quality") return QUALITY_COMMAND;
	return task?.kind === "docs" && role !== "orchestrator" ? "digest" : null;
}
/** The `schema` section of the packet, or null when the next step has no input. */
function schemaSection(input) {
	const command = nextSchemaCommand(input);
	const schema = command ? inputSchema(command) : null;
	return schema ? `Input of the next step (\`${KIT_COMMAND} schema ${schema.command}\` prints it again).\n${schemaText$1(schema)}` : null;
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-recovery/src/recovery-budget.ts
var DOCUMENT_PREFIX = "document ";
var RULES_POINTER = "rules: follow the Workflow Kit section of AGENTS.md (managed by the kit).";
var TASK_CAPS = [
	2e3,
	1e3,
	500,
	250,
	120,
	60
];
var HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*#*\s*$/u;
var SLUG_DROP$1 = /[^\p{L}\p{N}\s-]/gu;
var SLUG_SPACE = /\s+/gu;
function slug(text) {
	return text.toLowerCase().replace(SLUG_DROP$1, "").trim().replace(SLUG_SPACE, "-");
}
/** Returns the Markdown section under a heading (text or slug match), or null. */
function extractHeading(text, heading) {
	const lines = text.split("\n");
	const wanted = slug(heading);
	let start = -1;
	let level = 0;
	for (const [index, line] of lines.entries()) {
		const match = HEADING_PATTERN.exec(line);
		if (!match?.[1] || match[2] === void 0) continue;
		if (start === -1 && slug(match[2]) === wanted) {
			start = index;
			level = match[1].length;
		} else if (start !== -1 && match[1].length <= level) return lines.slice(start, index).join("\n").trimEnd();
	}
	return start === -1 ? null : lines.slice(start).join("\n").trimEnd();
}
function render(input, parts, references, omitted, bytes) {
	const sorted = [...parts].sort((left, right) => left.order - right.order);
	const head = [
		"# Workflow recovery packet",
		`bytes: ${bytes} / budget: ${input.budgetBytes}${bytes > input.budgetBytes ? " (over budget)" : ""}`,
		`included: ${sorted.map((part) => part.name).join(", ")}`,
		`omitted: ${omitted.length > 0 ? omitted.join(", ") : "none"}`,
		RULES_POINTER
	].join("\n");
	const body = sorted.map((part) => `## ${part.name}\n${part.text}`);
	const refs = `## references\n${references.length > 0 ? references.map((line) => `- ${line}`).join("\n") : "- none"}`;
	return `${[
		head,
		...body,
		refs
	].join("\n\n")}\n`;
}
/** Renders until the byte count printed in the header matches the text. */
function settle(input, parts, references, omitted) {
	let bytes = 0;
	let text = render(input, parts, references, omitted, bytes);
	for (let attempt = 0; attempt < 4 && byteLength(text) !== bytes; attempt += 1) {
		bytes = byteLength(text);
		text = render(input, parts, references, omitted, bytes);
	}
	return {
		bytes: byteLength(text),
		text
	};
}
/**
* Scope and task documents in order: a whole-document reference replaces
* the heading references of its path; references of one path and heading
* merge, required if any of them says so.
*/
function documentRefs(input) {
	const scope = input.plan.scope;
	const refs = [];
	if (scope?.spec) refs.push({
		path: scope.spec,
		required: true
	});
	refs.push(...scope?.context ?? [], ...focusTask(input.plan)?.context ?? []);
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
/**
* Required documents as mandatory parts: the whole file, or the section of
* a heading reference (the whole file when the heading is absent). Missing
* and optional documents become references.
*/
function documentParts(input, references) {
	const parts = [];
	for (const ref of documentRefs(input)) {
		const label = ref.heading ? `${ref.path}#${ref.heading}` : ref.path;
		const text = input.readDocument(ref.path);
		if (text === null) {
			references.push(`${label}: missing file`);
			continue;
		}
		if (!ref.required) {
			references.push(`${label} (${byteLength(text)} bytes, optional): read the file when needed`);
			continue;
		}
		const section = ref.heading ? extractHeading(text, ref.heading) : null;
		if (ref.heading && section === null) references.push(`${label}: heading not found, the whole file is included`);
		parts.push(section === null ? {
			name: `${DOCUMENT_PREFIX}${ref.path}`,
			order: 12,
			text: text.trimEnd()
		} : {
			name: `${DOCUMENT_PREFIX}${label}`,
			order: 12,
			text: section
		});
	}
	return parts;
}
/** Optional sections; the earlier a candidate, the longer it is kept. */
function optionalCandidates(input) {
	const candidates = [];
	const add = (name, order, text, reference) => {
		if (text !== null) candidates.push({
			part: {
				name,
				order,
				text
			},
			reference: reference(byteLength(text))
		});
	};
	add("documents", 13, input.documents?.text || null, (bytes) => `documents (${bytes} bytes): run \`${KIT_COMMAND} context --list\``);
	add("rounds", 8, roundsSection(input), (bytes) => `rounds (${bytes} bytes): run \`${KIT_COMMAND} history\``);
	add("decisions", 9, decisionsSection(input), (bytes) => `decisions (${bytes} bytes): scope.decisions in ${PLAN_PATH}`);
	add("verification", 11, verificationSection(input), (bytes) => `verification (${bytes} bytes): .harness/workflow/local/verification/last.json`);
	return candidates;
}
/** Sections that always stay; `schema` only when the next step has an input. */
function mandatoryParts(input, cap) {
	const schema = schemaSection(input);
	return [
		{
			name: "state",
			order: 1,
			text: stateSection(input)
		},
		{
			name: "next",
			order: 2,
			text: nextSection(input)
		},
		{
			name: "objective",
			order: 3,
			text: objectiveSection(input)
		},
		{
			name: "task",
			order: 4,
			text: taskSection(input, cap)
		},
		...schema === null ? [] : [{
			name: "schema",
			order: 5,
			text: schema
		}],
		{
			name: "upcoming",
			order: 6,
			text: upcomingSection(input)
		},
		{
			name: "recent",
			order: 7,
			text: recentSection(input)
		},
		{
			name: "changes",
			order: 10,
			text: changesSection(input)
		}
	];
}
function assembleWithCap(input, cap) {
	const references = [];
	const omitted = [];
	const candidates = optionalCandidates(input);
	const fits = (parts) => settle(input, parts, references, omitted).bytes <= input.budgetBytes;
	let parts = [...mandatoryParts(input, cap), ...documentParts(input, references)];
	const optional = [];
	for (const candidate of candidates) if (fits([...parts, candidate.part])) {
		parts = [...parts, candidate.part];
		optional.push({
			candidate,
			part: candidate.part
		});
	} else {
		omitted.push(candidate.part.name);
		references.push(candidate.reference);
	}
	while (!fits(parts) && optional.length > 0) {
		const last = optional.pop();
		if (last) {
			parts = parts.filter((part) => part !== last.part);
			omitted.push(last.part.name);
			references.push(last.candidate.reference);
		}
	}
	const { bytes, text } = settle(input, parts, references, omitted);
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
		text,
		truncated: cap !== null && taskSection(input, cap) !== taskSection(input)
	};
}
/** True when the packet exceeds the budget even without required documents. */
function overWithoutDocuments(packet) {
	const documents = packet.sections.filter((section) => section.name.startsWith(DOCUMENT_PREFIX)).reduce((sum, section) => sum + byteLength(`\n\n## ${section.name}\n${section.text}`), 0);
	return packet.bytes - documents > packet.budget;
}
/**
* Assembles the packet by priority within `budgetBytes`. Mandatory sections
* and required documents always stay; when the mandatory sections alone do
* not fit, long task fields are shortened with a marker, step by step.
* Optional sections move to references when they do not fit, the last added
* first. Nothing is cut silently: an oversized packet says so.
*/
function assemblePacket(input) {
	let packet = assembleWithCap(input, null);
	for (const cap of TASK_CAPS) {
		if (!(packet.overBudget && overWithoutDocuments(packet))) break;
		packet = assembleWithCap(input, cap);
	}
	return packet;
}
var EVENTS$1 = /* @__PURE__ */ new Set([
	"startup",
	"resume",
	"clear",
	"compact"
]);
/** Reads the SessionStart event (`source`) from the hook input; defaults to startup. */
function hookEvent(stdin) {
	try {
		const parsed = JSON.parse(stdin || "{}");
		const source = parsed && typeof parsed === "object" ? parsed.source : void 0;
		return typeof source === "string" && EVENTS$1.has(source) ? source : "startup";
	} catch {
		return "startup";
	}
}
/**
* SessionStart hook response. Inside Harness (`HARNESS_WORKFLOW_RECOVERY=host`)
* the host already delivered the packet, so no context is repeated.
*/
function sessionStartResponse(context, env) {
	const output = { hookEventName: "SessionStart" };
	if (env["HARNESS_WORKFLOW_RECOVERY"] !== "host") output.additionalContext = context();
	return `${JSON.stringify({
		continue: true,
		hookSpecificOutput: output
	})}\n`;
}
function showTaskText(plan, taskId, commits) {
	const task = plan.tasks.find((item) => item.id === taskId);
	ensure(task, "UNKNOWN_TASK", `Task not found: ${taskId}`);
	return `${describeTask(plan, task, commits)}\n`;
}
/** Workflow commits since the scope baseline, filtered by task or round. */
function workflowHistory(git, root, plan, filter) {
	const roundTasks = filter.round ? new Set(plan.tasks.filter((task) => task.roundId === filter.round).map((task) => task.id)) : null;
	return (git.head(root) ? git.history(root, plan.scope?.baselineCommit ?? null) : []).map((commit) => ({
		role: commit.trailers["Workflow-Role"]?.[0] ?? "external",
		sha: commit.sha,
		subject: commit.subject,
		taskId: commit.trailers["Workflow-Task"]?.[0] ?? null
	})).map((entry) => ({
		...entry,
		taskId: entry.taskId === "-" ? null : entry.taskId
	})).filter((entry) => !filter.task || entry.taskId === filter.task).filter((entry) => !roundTasks || entry.taskId !== null && roundTasks.has(entry.taskId));
}
function historyText(entries) {
	if (entries.length === 0) return "No workflow commits match.\n";
	return `${entries.map((entry) => `${entry.sha.slice(0, 8)} ${entry.role} ${entry.taskId ?? "-"} ${entry.subject}`).join("\n")}\n`;
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-recovery/src/recovery-documents.ts
/** Default byte budget of the documents map (spec 3.2). */
var DOCUMENTS_MAP_BYTES = 4e3;
var MARKDOWN = /\.(md|markdown)$/iu;
var H2 = /^##\s+(.+?)\s*#*\s*$/u;
var FENCE = /^\s*(```|~~~)/u;
var EXCLUDED_SEGMENTS = /* @__PURE__ */ new Set([".git", "node_modules"]);
var EXCLUDED_PREFIXES = [".harness/workflow/", ".harness/plans/archive/"];
function excluded(file) {
	return file.split("/").some((segment) => EXCLUDED_SEGMENTS.has(segment)) || EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix));
}
/** Second-level headings outside fenced code blocks. */
function headings(text) {
	const found = [];
	let fenced = false;
	for (const line of text.split("\n")) {
		if (FENCE.test(line)) {
			fenced = !fenced;
			continue;
		}
		const match = fenced ? null : H2.exec(line);
		if (match?.[1]) found.push(match[1]);
	}
	return found;
}
/** Tracked and untracked-not-ignored Markdown paths, sorted. */
function markdownPaths(git, root) {
	const output = git.git.run(root, [
		"ls-files",
		"-z",
		"--cached",
		"--others",
		"--exclude-standard",
		"--",
		"*.md",
		"*.markdown"
	], { allowFailure: true });
	if (output.status !== 0) return [];
	return [...new Set(output.stdout.split("\0").filter((file) => MARKDOWN.test(file) && !excluded(file)))].sort((left, right) => left < right ? -1 : 1);
}
/** Documents of the specification folder first, then the rest; both sorted. */
function ordered(paths, specPath) {
	const slash = specPath ? specPath.lastIndexOf("/") : -1;
	if (!specPath || slash === -1) return paths;
	const folder = specPath.slice(0, slash + 1);
	return [...paths.filter((file) => file.startsWith(folder)), ...paths.filter((file) => !file.startsWith(folder))];
}
function readMarkdown(root, file) {
	try {
		return workflowPlatformFacade.readTextIfExists(workflowPlatformFacade.resolveInside(root, file));
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
	return `… ${count} more documents: ${more}`;
}
/**
* Renders entries in order while the text (tail line included) fits the
* budget; the remaining entries are counted by the tail line.
*/
function renderDocumentsMap(entries, budget, more) {
	const lines = [];
	let used = 0;
	for (const [index, entry] of entries.entries()) {
		const line = entryLine(entry);
		const rest = entries.length - index - 1;
		const next = used + byteLength(line) + (lines.length > 0 ? 1 : 0);
		if (next + (rest > 0 ? byteLength(tailLine(rest, more)) + 1 : 0) > budget) break;
		lines.push(line);
		used = next;
	}
	const hidden = entries.length - lines.length;
	return {
		entries,
		shown: lines.length,
		text: [...lines, ...hidden > 0 ? [tailLine(hidden, more)] : []].join("\n")
	};
}
/**
* The documents map of a project: Markdown files known to git (tracked or
* untracked and not ignored) without `node_modules`, `.git`,
* `.harness/workflow/**` and `.harness/plans/archive/**` (only those under
* `folder` when given); one line per file with its size and `##` headings.
*/
function documentsMap(git, root, options = {}) {
	const entries = [];
	const folder = options.folder ? `${options.folder}/` : "";
	for (const file of ordered(markdownPaths(git, root).filter((item) => item.startsWith(folder)), options.specPath ?? null)) {
		const text = readMarkdown(root, file);
		if (text !== null) entries.push({
			bytes: byteLength(text),
			headings: headings(text),
			path: file
		});
	}
	return renderDocumentsMap(entries, options.budget ?? DOCUMENTS_MAP_BYTES, options.more ?? DEFAULT_MORE);
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-recovery/src/recovery-gather.ts
function readDocument(root, file) {
	try {
		return workflowPlatformFacade.readTextIfExists(workflowPlatformFacade.resolveInside(root, file));
	} catch {
		return null;
	}
}
function taskCommits(git, root, plan, notes) {
	try {
		const commits = {};
		for (const [taskId, reference] of git.resolveReferences(root, plan, PLAN_PATH)) if (reference.status === "committed") commits[taskId] = reference.sha;
		return commits;
	} catch (error) {
		notes.warnings.push(`Commit references are inconsistent (${error.code ?? "error"}); run \`scripts/workflow doctor\`.`);
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
/** Changed paths outside the focus task, without Kit-managed state. */
function outsideChanges(git, root, plan) {
	const task = focusTask(plan);
	const own = new Set(task?.status === "IN_PROGRESS" ? task.files : []);
	return git.changes(root).all.filter((file) => !(own.has(file) || git.isKitManagedPath(file)));
}
/** Reads plan, configuration, git state and evidence of a project. */
function gatherRecovery(git, root, event, notes) {
	const plan = workflowPlanFacade.read(root) ?? workflowPlanFacade.createEmpty("unknown", "Project");
	const config = workflowQualityFacade.readConfig(root);
	const repository = git.isRepository(root);
	if (!repository) notes.warnings.push("The project is not a git repository.");
	const evidence = workflowQualityFacade.readEvidence(root);
	return {
		budgetBytes: config.budget.recoveryBytes,
		changes: repository ? outsideChanges(git, root, plan) : [],
		documents: repository ? documentsMap(git, root, { specPath: plan.scope?.spec ?? null }) : null,
		event,
		head: repository ? git.head(root) : null,
		plan,
		quality: {
			stacks: config.quality.stacks,
			status: config.quality.status
		},
		readDocument: (file) => readDocument(root, file),
		roles: gatherRoleFacts(git, root, plan, config.host === "harness", notes.warnings),
		taskCommits: repository ? taskCommits(git, root, plan, notes) : {},
		transaction: repository ? transaction(git, root) : null,
		verification: evidence ? {
			commit: evidence.commit ?? null,
			reports: evidence.reports
		} : null
	};
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-recovery/src/workflow-recovery-facade.ts
/**
* Public facade of the workflow-recovery module: the bounded recovery
* packet, the session-start hook and on-demand task history.
*/
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
	section(text, heading) {
		return extractHeading(text, heading);
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
		return schemaText$1(schema);
	}
	/** Reads plan, configuration, git state and evidence of a project. */
	gather(root, event = "startup") {
		const notes = { warnings: [] };
		return {
			...gatherRecovery(this.git, root, event, notes),
			warnings: notes.warnings
		};
	}
	packet(root, event = "startup") {
		return assemblePacket(this.gather(root, event));
	}
	/** `recover --format text|json`. */
	render(packet, format = "text") {
		return format === "json" ? `${JSON.stringify(packet, null, 2)}\n` : packet.text;
	}
	/**
	* `hook session-start --client claude|codex`: reads the hook input and
	* answers in the SessionStart format. Errors never block the session.
	*/
	sessionStart(root, options) {
		const event = hookEvent(options.stdin);
		return sessionStartResponse(() => {
			try {
				return this.packet(root, event).text;
			} catch (error) {
				const { code, message } = error;
				return `Workflow Kit could not build the recovery packet (${code ?? "error"}): ${message}\nRun \`scripts/workflow doctor\`.`;
			}
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
		const entries = workflowHistory(this.git, root, plan, filter);
		return {
			entries,
			text: historyText(entries)
		};
	}
};
var workflowRecoveryFacade = new WorkflowRecoveryFacade();
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-cli-schema.ts
function schemaList() {
	return { commands: workflowRecoveryFacade.inputSchemaCommands().map((command) => ({
		command,
		description: workflowRecoveryFacade.inputSchema(command)?.description ?? ""
	})) };
}
function schemaText(value) {
	if ("commands" in value) return [
		"Commands with an input schema:",
		...value.commands.map((item) => `- ${item.command} — ${item.description}`),
		"Run `scripts/workflow schema <command>` for its fields, rules and an example.",
		""
	].join("\n");
	return `${workflowRecoveryFacade.schemaText(value)}\n`;
}
/**
* `schema [<command>]`: the JSON input descriptor of a Kit command with its
* example, or the list of commands that have one. A pure read: it needs no
* scope and also runs in an executor worktree.
*/
var SCHEMA_COMMANDS = { schema: {
	run: ({ args }) => {
		const command = args.positionals[0];
		if (command === void 0) return schemaList();
		const schema = workflowRecoveryFacade.inputSchema(command);
		if (!schema) {
			const commands = workflowRecoveryFacade.inputSchemaCommands();
			throw new WorkflowError("USAGE", `${command} has no input schema. Commands with a schema: ${commands.join(", ")}.`, { commands }, "Run `scripts/workflow schema` for the list.");
		}
		return schema;
	},
	text: schemaText,
	usage: "schema [<command>]"
} };
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-cli-text.ts
/** One line: the execution mode, assignment counts by status, the integration. */
function executionLine(status) {
	const { execution } = status;
	if (!execution) return "execution: none";
	if (execution.strategy !== "orchestrated") return `execution: ${execution.strategy}`;
	const counts = /* @__PURE__ */ new Map();
	for (const item of status.assignments) counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
	const assignments = counts.size === 0 ? "none" : [...counts].map(([state, count]) => `${state} ${count}`).join(", ");
	const integration = status.integration ? `, integration ${status.integration.taskId ?? "unknown"} ${status.integration.phase ?? "unknown"}` : "";
	return `execution: orchestrated (max ${execution.maxWorkers} workers), assignments: ${assignments}${integration}`;
}
function statusText(status) {
	const lines = [`project: ${status.project ? `${status.project.name} (${status.project.id})` : "not installed"}`, status.scope ? `scope: ${status.scope.id} ${status.scope.status}, result ${status.scope.delivery}, revision ${status.revision}` : `scope: NONE, revision ${status.revision}`];
	if (status.scope?.blockedReason) lines.push(`blocked: ${status.scope.blockedReason}`);
	lines.push(executionLine(status));
	if (status.executor) lines.push(`executor: assignment ${status.executor.assignmentId}, task ${status.executor.taskId}`);
	lines.push(`paused: ${status.paused}`, `progress: ${status.progress.done}/${status.progress.total}`, `current: ${status.currentTask ? `${status.currentTask.id} ${status.currentTask.title}` : "none"}`, `next: ${status.nextTask ? `${status.nextTask.id} [${status.nextTask.kind}] ${status.nextTask.title}` : "none"}`, `quality: ${status.quality.status}${status.quality.stacks.length > 0 ? ` (${status.quality.stacks.join(", ")})` : ""}, drift ${status.quality.drift.status}`, `head: ${status.head ? status.head.slice(0, 8) : "none"}`, `transaction: ${status.transaction ? `${status.transaction.id} ${status.transaction.phase}` : "none"}`, `changes: ${status.changes.length === 0 ? "none" : status.changes.join(", ")}`);
	return `${lines.join("\n")}\n`;
}
function validationText(report) {
	return report.ok ? "Plan and history are consistent.\n" : `${report.errors.map((error) => `${error.code}: ${error.message}`).join("\n")}\n`;
}
function inspectText(result) {
	const { git } = result;
	const repository = git.repository ? `repository, head ${git.head ? git.head.slice(0, 8) : "none"}` : "not a repository";
	const lines = [
		`path: ${result.path}`,
		`state: ${result.state}`,
		`action: ${result.action}`,
		`kit version: ${result.version ?? "none"}`,
		`git: ${repository}`,
		`identity: ${git.identity ? `${git.identity.name} <${git.identity.email}>` : "not set"}`,
		`stacks: ${result.stacks.length > 0 ? result.stacks.join(", ") : "none"}`,
		`transaction: ${result.transactionPending ? "pending" : "none"}`
	];
	if (result.nestedIn) lines.push(`nested in: ${result.nestedIn}`);
	if (result.damaged.length > 0) lines.push(`damaged: ${result.damaged.join(", ")}`);
	return `${lines.join("\n")}\n`;
}
/** Human-readable output of `--format text`. */
function renderText(command, result) {
	const value = result;
	switch (command) {
		case "status": return statusText(result);
		case "validate": return validationText(result);
		case "inspect": return inspectText(result);
		case "recover":
		case "history":
		case "show-task": return String(value.text ?? "");
		default: return `${JSON.stringify(result, null, 2)}\n`;
	}
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-installer/src/installer-provider-hooks.ts
var KIT_LAUNCHER_MARK = "scripts/workflow";
var KIT_HOOK_MARK = "hook session-start";
/** The SessionStart command a provider runs in the project directory. */
function sessionStartCommand(client) {
	return client === "claude" ? `"$CLAUDE_PROJECT_DIR/scripts/workflow" hook session-start --client claude` : "scripts/workflow hook session-start --client codex";
}
function kitGroup(client) {
	return { hooks: [{
		command: sessionStartCommand(client),
		type: "command"
	}] };
}
function isKitGroup(group) {
	const hooks = group?.hooks;
	return Array.isArray(hooks) && hooks.some((hook) => typeof hook?.command === "string" && hook.command.includes(KIT_LAUNCHER_MARK) && hook.command.includes(KIT_HOOK_MARK));
}
function parseObject(current, file) {
	if (current === null || current.trim() === "") return {};
	let parsed;
	try {
		parsed = JSON.parse(current);
	} catch {
		parsed = null;
	}
	ensure(parsed && typeof parsed === "object" && !Array.isArray(parsed), "MANAGED_JSON", `${file} is not a JSON object; fix it by hand first.`, { path: file });
	return parsed;
}
/**
* Adds or replaces the Kit SessionStart entry and keeps every other hook and
* setting of the file.
*/
function mergeSessionStartHook(current, client, file) {
	const settings = parseObject(current, file);
	const hooks = settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {};
	const existing = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];
	const merged = {
		...settings,
		hooks: {
			...hooks,
			SessionStart: [...existing.filter((group) => !isKitGroup(group)), kitGroup(client)]
		}
	};
	return `${JSON.stringify(merged, null, 2)}\n`;
}
/** The Kit entry of a provider settings file, normalized, or null. */
function extractSessionStartHook(current) {
	try {
		const group = (JSON.parse(current ?? "").hooks?.SessionStart ?? []).find(isKitGroup);
		return group ? JSON.stringify(group) : null;
	} catch {
		return null;
	}
}
function expectedSessionStartHook(client) {
	return JSON.stringify(kitGroup(client));
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-installer/src/installer-sections.ts
var MARKERS = {
	hash: {
		begin: "# workflow-kit:begin",
		end: "# workflow-kit:end"
	},
	html: {
		begin: "<!-- workflow-kit:begin -->",
		end: "<!-- workflow-kit:end -->"
	}
};
var SHEBANG = /^#![^\n]*\n/u;
var CRLF = /\r\n/gu;
var LF = /\n/gu;
function eolOf(text) {
	return text.includes("\r\n") ? "\r\n" : "\n";
}
/** The managed block with its markers, using `\n` line ends. */
function sectionBlock(style, body) {
	const { begin, end } = MARKERS[style];
	return `${begin}\n${body.trimEnd()}\n${end}\n`;
}
function bounds(text, style) {
	const { begin, end } = MARKERS[style];
	const start = text.indexOf(begin);
	const stop = start === -1 ? -1 : text.indexOf(end, start);
	if (start === -1 || stop === -1) return null;
	let after = stop + end.length;
	if (text.startsWith("\r\n", after)) after += 2;
	else if (text.startsWith("\n", after)) after += 1;
	return {
		end: after,
		start
	};
}
/** The current managed block (markers included, `\n` line ends), or null. */
function extractSection(text, style) {
	const found = bounds(text, style);
	return found ? text.slice(found.start, found.end).replace(CRLF, "\n") : null;
}
/**
* Replaces or inserts the managed block. Text outside it is kept byte for
* byte; a new block goes to the end, or after the shebang for `top`.
*/
function upsertSection(current, style, body, placement = "bottom") {
	const text = current ?? "";
	const eol = eolOf(text);
	const block = sectionBlock(style, body).replace(LF, eol);
	const found = bounds(text, style);
	if (found) return `${text.slice(0, found.start)}${block}${text.slice(found.end)}`;
	if (placement === "top") {
		const shebang = SHEBANG.exec(text)?.[0] ?? "";
		return `${shebang}${block}${text.slice(shebang.length)}`;
	}
	if (text === "") return block;
	return `${text}${text.endsWith("\n") ? eol : `${eol}${eol}`}${block}`;
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-installer/src/installer-texts.ts
/** English process rules for agents: the managed section of AGENTS.md. */
function agentRules() {
	return `## Workflow Kit (managed section — do not edit by hand)

This project uses the Harness Workflow Kit. The plan lives in
\`.harness/plans/todo-plan.md\` and changes only through \`scripts/workflow\`
commands (Windows: \`scripts\\workflow.cmd\`). Every command prints JSON;
add \`--format text\` for a readable answer.

### Start of every session
1. Unless a workflow recovery packet is already in your context, run
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
/** The managed lines of a git hook: delegate to the Kit and stop on failure. */
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
	return `# ${projectName} — Architecture Overview

Describe the main parts of the system, their responsibilities and the
contracts between them. The DOCS task of every round keeps this document
in line with the code.
`;
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts
/** Version of the Workflow Kit payload; Kit 1.x was Workflow Pilot. */
var KIT_VERSION = "2.2.1";
var MANIFEST_PATH = ".harness/workflow/manifest.json";
var MANIFEST_SCHEMA = "harness-workflow-manifest/1";
var OWN_HOOKS_DIR = ".harness/workflow/hooks";
var MANAGED_GIT_HOOKS = [
	"pre-commit",
	"commit-msg",
	"post-commit",
	"pre-push"
];
var LINE_BREAK$1 = /\r?\n/u;
function sha256(text) {
	return createHash("sha256").update(text, "utf8").digest("hex");
}
function hasClaudeLine(text) {
	return text.split(LINE_BREAK$1).some((line) => line.trim() === CLAUDE_IMPORT_LINE);
}
/** The managed part of a file of the given kind, or null when missing. */
function readManaged(kind, path, current) {
	if (current === null) return null;
	switch (kind) {
		case "owned": return current;
		case "section": return extractSection(current, path.endsWith(".md") ? "html" : "hash");
		case "json": return extractSessionStartHook(current);
		case "line": return hasClaudeLine(current) ? CLAUDE_IMPORT_LINE : null;
		default: return null;
	}
}
function owned(path, content, executable = false) {
	return {
		executable,
		kind: "owned",
		managed: content,
		path,
		read: (current) => current,
		render: () => content
	};
}
function section(path, style, body, placement = "bottom", prefix = "") {
	return {
		executable: false,
		kind: "section",
		managed: sectionBlock(style, body),
		path,
		read: (current) => current === null ? null : extractSection(current, style),
		render: (current) => upsertSection(current ?? (prefix || null), style, body, placement)
	};
}
function created(path, content) {
	return {
		executable: false,
		kind: "create",
		managed: null,
		path,
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
			if (current === null || current.trim() === "") return `${CLAUDE_IMPORT_LINE}\n`;
			if (hasClaudeLine(current)) return current;
			return `${current}${current.endsWith("\n") ? "" : "\n"}\n${CLAUDE_IMPORT_LINE}\n`;
		}
	};
}
function providerHook(path, client) {
	return {
		executable: false,
		kind: "json",
		managed: expectedSessionStartHook(client),
		path,
		read: (current) => readManaged("json", path, current),
		render: (current) => mergeSessionStartHook(current, client, path)
	};
}
function hookEntries(hooksPath) {
	return MANAGED_GIT_HOOKS.map((name) => {
		if (hooksPath === null) {
			const content = `#!/bin/sh\n# Managed by Harness Workflow Kit. Do not edit.\n${sectionBlock("hash", gitHookSection(name))}`;
			return owned(`${OWN_HOOKS_DIR}/${name}`, content, true);
		}
		return {
			...section(`${hooksPath}/${name}`, "hash", gitHookSection(name), "top", "#!/bin/sh\n"),
			executable: true
		};
	});
}
/** Every file the Kit writes into a project, with its writing rule. */
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
		created("docs/architecture/OVERVIEW.md", overviewSkeleton(options.projectName))
	];
}
function buildManifest(entries) {
	return {
		files: entries.map((entry) => ({
			executable: entry.executable,
			kind: entry.kind,
			path: entry.path,
			sha256: entry.managed === null ? null : sha256(entry.managed)
		})),
		schema: MANIFEST_SCHEMA,
		version: KIT_VERSION
	};
}
function renderManifest(manifest) {
	return `${JSON.stringify(manifest, null, 2)}\n`;
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-installer/src/installer-inspect.ts
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
function file$2(root, relative) {
	return path.join(root, ...relative.split("/"));
}
/** Compares dotted versions; negative when `left` is older. */
function compareVersions(left, right) {
	const a = left.split(".").map(Number);
	const b = right.split(".").map(Number);
	for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
		const difference = (a[index] ?? 0) - (b[index] ?? 0);
		if (difference !== 0) return difference;
	}
	return 0;
}
function readManifest(root) {
	const text = workflowPlatformFacade.readTextIfExists(file$2(root, MANIFEST_PATH));
	if (text === null) return null;
	try {
		return JSON.parse(text);
	} catch {
		return {
			files: [],
			schema: "harness-workflow-manifest/1",
			version: "0"
		};
	}
}
/** Managed files whose managed part no longer matches the manifest hash. */
function damagedFiles(root, manifest) {
	return manifest.files.filter((item) => item.sha256 !== null).filter((item) => {
		const current = workflowPlatformFacade.readTextIfExists(file$2(root, item.path));
		const managed = readManaged(item.kind, item.path, current);
		return managed === null || sha256(managed) !== item.sha256;
	}).map((item) => item.path);
}
function kitState(root, manifest) {
	const damaged = damagedFiles(root, manifest);
	if (compareVersions(manifest.version, "2.2.1") < 0) return {
		damaged,
		state: "KIT_OUTDATED"
	};
	return {
		damaged,
		state: damaged.length > 0 ? "KIT_DAMAGED" : "KIT_OK"
	};
}
function classify(root, repository) {
	if (readdirSync(root).length === 0) return {
		damaged: [],
		state: "EMPTY"
	};
	if (existsSync(file$2(root, PILOT_MANIFEST))) return {
		damaged: [],
		state: "PILOT_KIT"
	};
	const manifest = readManifest(root);
	if (manifest) return kitState(root, manifest);
	if ((workflowPlatformFacade.readTextIfExists(file$2(root, ".harness/plans/todo-plan.md")) ?? "").includes(LEGACY_PLAN_SCHEMA)) return {
		damaged: [],
		state: "LEGACY_HARNESS_PLAN"
	};
	return {
		damaged: [],
		state: repository ? "GIT_NO_KIT" : "NOT_GIT"
	};
}
/** `inspect <path>`: classifies a folder without changing anything. */
function inspectFolder(git, folder) {
	const root = path.resolve(folder);
	const base = {
		damaged: [],
		nestedIn: null,
		path: root,
		stacks: [],
		transactionPending: false,
		version: null
	};
	if (!existsSync(root)) {
		const parent = path.dirname(root);
		return {
			...base,
			action: "create",
			git: {
				head: null,
				identity: existsSync(parent) ? git.identity(parent) : null,
				repository: false
			},
			state: "MISSING"
		};
	}
	ensure(statSync(root).isDirectory(), "NOT_A_DIRECTORY", `${root} is not a folder.`);
	const inside = git.isRepository(root);
	const top = inside ? git.topLevel(root) : null;
	const repository = top !== null && workflowPlatformFacade.samePath(realpathSync.native(path.resolve(top)), realpathSync.native(root));
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
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-installer/src/installer-install.ts
var KIT_STATES = /* @__PURE__ */ new Set([
	"KIT_DAMAGED",
	"KIT_OK",
	"KIT_OUTDATED"
]);
var SLUG_DROP = /[^a-z0-9]+/gu;
var SLUG_TRIM = /^-+|-+$/gu;
function projectSlug(name) {
	return name.toLowerCase().replace(SLUG_DROP, "-").replace(SLUG_TRIM, "") || "project";
}
function file$1(root, relative) {
	return path.join(root, ...relative.split("/"));
}
/** Local `core.hooksPath` relative to the root, or null when unset. */
function localHooksPath(git, root) {
	const value = git.git.run(root, [
		"config",
		"--local",
		"--get",
		"core.hooksPath"
	], { allowFailure: true }).stdout.trim();
	if (value === "") return null;
	let relative;
	try {
		relative = workflowPlatformFacade.relativeFromRoot(root, path.resolve(root, value));
	} catch {
		throw new WorkflowError("HOOKS_PATH_OUTSIDE", `core.hooksPath points outside the project: ${value}`);
	}
	return relative === ".harness/workflow/hooks" ? null : relative;
}
function writeIfChanged(root, relative, next, executable) {
	const target = file$1(root, relative);
	const changed = workflowPlatformFacade.readTextIfExists(target) !== next;
	if (changed) workflowPlatformFacade.writeFileAtomic(target, next);
	if (executable && process.platform !== "win32") chmodSync(target, 493);
	return changed;
}
function checkPreconditions(state, update, nestedIn, pending) {
	ensure(!nestedIn, "NESTED_REPOSITORY", `The folder is inside the repository ${nestedIn}; choose its top level or another folder.`);
	ensure(state !== "PILOT_KIT", "PILOT_KIT_UNSUPPORTED", "This project uses Workflow Pilot (Kit 1.x), which Harness does not support.");
	ensure(!pending, "TRANSACTION_PENDING", "A Kit commit transaction is unfinished.", {}, "Run `scripts/workflow repair`.");
	if (update) ensure(KIT_STATES.has(state), "NOT_INSTALLED", "The Workflow Kit is not installed here; install it first.");
	else ensure(!KIT_STATES.has(state), "ALREADY_INSTALLED", "The Workflow Kit is already installed.", {}, "Use `install --update` or `doctor --fix`.");
}
function writePayload(root, entries) {
	const written = [];
	for (const entry of entries) {
		const current = workflowPlatformFacade.readTextIfExists(file$1(root, entry.path));
		if (writeIfChanged(root, entry.path, entry.render(current), entry.executable)) written.push(entry.path);
	}
	return written;
}
/**
* Writes the default configuration when it is absent, or only the host
* marker into an existing one; returns true when the file changed.
*/
function writeConfig(root, host) {
	const exists = workflowPlatformFacade.readTextIfExists(workflowQualityFacade.configFile(root)) !== null;
	const config = exists ? workflowQualityFacade.readConfig(root) : workflowQualityFacade.defaultConfig();
	if (exists && (!host || config.host === host)) return false;
	workflowQualityFacade.writeConfig(root, host ? {
		...config,
		host
	} : config);
	return true;
}
/** Writes configuration, manifest and runtime; returns the written paths. */
function writeState(root, entries, options) {
	const written = [];
	if (writeConfig(root, options.host)) written.push(workflowQualityFacade.configPath);
	if (writeIfChanged(root, ".harness/workflow/manifest.json", renderManifest(buildManifest(entries)), false)) written.push(MANIFEST_PATH);
	const runtime = options.runtime;
	if (runtime) workflowPlatformFacade.writeFileAtomic(file$1(root, RUNTIME_FILE), workflowPlatformFacade.formatRuntimeFile(runtime.executable, runtime.mode));
	return written;
}
/**
* The identity the bootstrap commit will be signed with: the real local one
* of an existing repository, else the real global one (placeholders and
* invalid ones are skipped). Fails with GIT_IDENTITY_REQUIRED before
* anything is written.
*/
function requireInstallIdentity(git, root, repository) {
	const local = repository ? git.readIdentity(root, "local") : null;
	if (local && git.isUsableIdentity(local)) return local;
	const global = git.readIdentity(existsSync(root) ? root : process.cwd(), "global");
	if (global && git.isUsableIdentity(global)) return global;
	throw git.identityRequired(Boolean(local || global), " Nothing was written.");
}
function scopeOf(planText, legacy) {
	if (legacy) return null;
	try {
		return workflowPlanFacade.parse(planText).scope?.id ?? null;
	} catch {
		return null;
	}
}
function commitInstall(git, root, files, planText, update, scopeId) {
	try {
		return git.transactions.commit(root, {
			files,
			message: update ? `chore: update workflow kit to ${KIT_VERSION}` : `chore: install workflow kit ${KIT_VERSION}`,
			planPath: PLAN_PATH,
			planText,
			role: update ? "kit-update" : "bootstrap",
			scopeId,
			taskId: null
		});
	} catch (error) {
		if (error instanceof WorkflowError && error.code === "NOTHING_TO_COMMIT") return null;
		throw error;
	}
}
/** `install <path> [--update]`: writes the Kit and commits it through a transaction. */
function installKit(git, folder, options) {
	const inspected = inspectFolder(git, folder);
	const root = inspected.path;
	const update = options.update === true;
	checkPreconditions(inspected.state, update, inspected.nestedIn, inspected.transactionPending);
	ensure(options.host === void 0 || options.host === null || options.host === "harness", "USAGE", "--host is harness.");
	const identity = requireInstallIdentity(git, root, inspected.git.repository);
	mkdirSync(root, { recursive: true });
	if (!inspected.git.repository) git.init(root);
	const local = git.readIdentity(root, "local");
	if (!(local && git.isUsableIdentity(local))) git.writeLocalIdentity(root, identity);
	const hooksPath = localHooksPath(git, root);
	const before = new Set(git.changes(root).all);
	const name = options.name?.trim() || path.basename(root);
	const entries = buildPayload({
		bundle: options.bundle,
		hooksPath,
		projectName: name
	});
	const written = [...writePayload(root, entries), ...writeState(root, entries, options)];
	const migrationRequired = inspected.state === "LEGACY_HARNESS_PLAN";
	const existingPlan = workflowPlatformFacade.readTextIfExists(file$1(root, PLAN_PATH));
	const planText = existingPlan ?? workflowPlanFacade.render(workflowPlanFacade.createEmpty(projectSlug(name), name));
	if (hooksPath === null) git.setConfig(root, "core.hooksPath", OWN_HOOKS_DIR);
	return {
		commit: commitInstall(git, root, written, planText, update, scopeOf(planText, migrationRequired || existingPlan === null)),
		excluded: [...before].filter((item) => !written.includes(item)).sort(),
		hooksPath: hooksPath ?? ".harness/workflow/hooks",
		migrationRequired,
		previousState: inspected.state,
		root,
		version: KIT_VERSION,
		written
	};
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-installer/src/installer-doctor.ts
var UPDATE = "Run `scripts/workflow doctor --fix` (or `install --update`).";
var check = (id, status, message, fixable = false, nextAction = null) => ({
	fixable,
	id,
	message,
	nextAction,
	status
});
function file(root, relative) {
	return path.join(root, ...relative.split("/"));
}
function manifestChecks(root) {
	const manifest = readManifest(root);
	if (!manifest) return [check("manifest", "fail", "The Workflow Kit manifest is missing.", false, "Install the Kit: `scripts/workflow install`.")];
	const checks = [compareVersions(manifest.version, "2.2.1") < 0 ? check("manifest", "fail", `Kit ${manifest.version} is older than ${KIT_VERSION}.`, true, UPDATE) : check("manifest", "ok", `Kit ${manifest.version}.`)];
	const damaged = damagedFiles(root, manifest);
	checks.push(damaged.length === 0 ? check("managed-files", "ok", "Managed files and sections match the manifest.") : check("managed-files", "fail", `Changed or missing managed parts: ${damaged.join(", ")}.`, true, UPDATE));
	if (process.platform !== "win32") {
		const blocked = manifest.files.filter((item) => item.executable && existsSync(file(root, item.path))).filter((item) => {
			try {
				accessSync(file(root, item.path), constants.X_OK);
				return false;
			} catch {
				return true;
			}
		}).map((item) => item.path);
		checks.push(blocked.length === 0 ? check("executable", "ok", "Launchers and hooks are executable.") : check("executable", "fail", `Not executable: ${blocked.join(", ")}.`, true, UPDATE));
	}
	return checks;
}
function hooksCheck(git, root) {
	const hooksPath = git.git.run(root, [
		"config",
		"--local",
		"--get",
		"core.hooksPath"
	], { allowFailure: true }).stdout.trim();
	if (hooksPath === "") return check("git-hooks", "fail", "core.hooksPath is not set, so Kit hooks do not run.", true, UPDATE);
	const missing = MANAGED_GIT_HOOKS.filter((name) => {
		const text = workflowPlatformFacade.readTextIfExists(path.resolve(root, hooksPath, name));
		return text === null || extractSection(text, "hash") === null;
	});
	return missing.length === 0 ? check("git-hooks", "ok", `Kit hooks run from ${hooksPath === ".harness/workflow/hooks" ? OWN_HOOKS_DIR : hooksPath}.`) : check("git-hooks", "fail", `Hooks without the Kit section in ${hooksPath}: ${missing.join(", ")}.`, true, UPDATE);
}
function planChecks(git, root) {
	const checks = [];
	try {
		const plan = workflowPlanFacade.read(root);
		if (!plan) return [check("plan", "fail", `${PLAN_PATH} is missing.`, false, "Run `scripts/workflow install --update`.")];
		git.resolveReferences(root, plan, PLAN_PATH);
		checks.push(check("plan", "ok", `Plan revision ${plan.revision} matches the history.`));
	} catch (error) {
		const { code, message } = error;
		checks.push(check("plan", "fail", `${code ?? "ERROR"}: ${message}`, false, "Run `scripts/workflow repair`."));
	}
	checks.push(git.transactions.journal(root) ? check("transaction", "fail", "A commit transaction is unfinished.", false, "Run `scripts/workflow repair`.") : check("transaction", "ok", "No unfinished transaction."));
	return checks;
}
/** The real global identity, or null when it is missing, a placeholder or invalid. */
function realGlobalIdentity(git, root) {
	const global = git.readIdentity(root, "global");
	return global && git.isUsableIdentity(global) ? global : null;
}
/** Kit commits sign with the repository-local identity only. */
function identityCheck(git, root) {
	const local = git.readIdentity(root, "local");
	if (local && git.isUsableIdentity(local)) return check("git-identity", "ok", `${local.name} <${local.email}> (repository config).`);
	const problem = local ? `The repository git identity ${local.name} <${local.email}> is a placeholder or invalid.` : "The repository config has no git identity.";
	const global = realGlobalIdentity(git, root);
	return global ? check("git-identity", "fail", problem, true, `Run \`scripts/workflow doctor --fix\` to copy ${global.name} <${global.email}> from the global config.`) : check("git-identity", "fail", problem, false, git.identityFix);
}
function environmentChecks(git, root, options) {
	const runtime = workflowPlatformFacade.resolveRuntime(root, options.env ?? process.env, options.probe);
	const drift = workflowQualityFacade.drift(root);
	return [
		runtime ? check("runtime", "ok", `${runtime.mode} ${runtime.version} (${runtime.source}).`) : check("runtime", "fail", "No Node.js 22+ runtime for the launchers.", false, "Install Node.js 22 or newer, or open the project in Harness AI."),
		identityCheck(git, root),
		drift.status === "drift" ? check("quality-drift", "warn", `Quality profile drift: new ${drift.added.join(", ") || "none"}, missing ${drift.missing.join(", ") || "none"}.`, false, "Extend the plan with a QUALITY task.") : check("quality-drift", "ok", drift.status === "discovery" ? "Quality profile not configured yet." : "Quality profile matches the stacks.")
	];
}
/** Path segments and prefixes the documents scan skips. */
var SKIPPED_SEGMENTS = /* @__PURE__ */ new Set([".git", "node_modules"]);
var SKIPPED_PREFIXES = [".harness/workflow/", ".harness/plans/archive/"];
/** Tracked and untracked-not-ignored Markdown files of the project. */
function projectMarkdown(git, root) {
	const output = git.git.run(root, [
		"ls-files",
		"-z",
		"--cached",
		"--others",
		"--exclude-standard",
		"--",
		"*.md",
		"*.markdown"
	], { allowFailure: true });
	if (output.status !== 0) return [];
	const files = output.stdout.split("\0").filter((item) => item !== "" && !item.split("/").some((segment) => SKIPPED_SEGMENTS.has(segment)) && !SKIPPED_PREFIXES.some((prefix) => item.startsWith(prefix)));
	return [...new Set(files)].sort((left, right) => left < right ? -1 : 1);
}
/** Every project document must fit `budget.documentBytes` (one Read). */
function documentSizeCheck(git, root) {
	const config = workflowQualityFacade.readConfig(root);
	const limit = config.budget.documentBytes;
	const over = workflowQualityFacade.oversizedDocuments(root, projectMarkdown(git, root), config);
	return over.length === 0 ? check("doc-size", "ok", `Markdown documents fit ${limit} bytes.`) : check("doc-size", "warn", `Documents over ${limit} bytes cannot be read in one Read: ${over.map((item) => `${item.path} (${item.bytes} bytes)`).join(", ")}.`, false, "Split each listed document into smaller documents.");
}
function inspectProject(git, root, options) {
	return [
		...manifestChecks(root),
		hooksCheck(git, root),
		...planChecks(git, root),
		...environmentChecks(git, root, options),
		documentSizeCheck(git, root)
	];
}
/** `doctor [--fix]`: project health; `fix` repairs only fixable findings. */
function runDoctor(git, folder, options = {}) {
	const root = path.resolve(folder);
	let checks = inspectProject(git, root, options);
	let fix = null;
	let identityFix = null;
	if (options.fix) {
		const fixable = checks.filter((item) => item.status === "fail" && item.fixable);
		if (fixable.some((item) => item.id === "git-identity")) {
			identityFix = realGlobalIdentity(git, root);
			if (identityFix) git.writeLocalIdentity(root, identityFix);
		}
		if (fixable.some((item) => item.id !== "git-identity") && identityCheck(git, root).status === "ok") fix = installKit(git, root, {
			...options.fix,
			update: true
		});
		if (fix || identityFix) checks = inspectProject(git, root, options);
	}
	return {
		checks,
		fix,
		identityFix,
		ok: checks.every((item) => item.status !== "fail"),
		root
	};
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-installer/src/installer-legacy-plan.ts
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
var LINE_BREAK = /\r?\n/u;
function rows(text) {
	const result = [];
	let phase = "";
	for (const line of text.split(LINE_BREAK)) {
		const heading = PHASE_HEADING.exec(line);
		const start = ROW_START.exec(line);
		const last = result.at(-1);
		if (heading?.[1]) phase = heading[1];
		else if (start?.[1] && start[2] !== void 0) result.push({
			body: start[2],
			phase,
			status: start[1]
		});
		else if (last && CONTINUATION.test(line)) last.body = `${last.body} ${line.trim()}`;
	}
	return result;
}
function taskOf(row) {
	const match = TASK_ROW.exec(row.body);
	if (!(match?.[1] && match[2] !== void 0)) return null;
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
function contextPaths(text) {
	const start = text.indexOf("## Context Pack");
	if (start === -1) return [];
	const end = text.indexOf("\n## ", start + 1);
	const section = text.slice(start, end === -1 ? void 0 : end);
	return [...new Set([...section.matchAll(CONTEXT_PATH)].map((item) => item[1] ?? "").filter(Boolean))];
}
/** Parses a `harness-ai-plan-v1` document: state block, task rows, context pack. */
function parseLegacyPlan(text) {
	const block = STATE_BLOCK.exec(text)?.[1];
	ensure(block, "NOT_LEGACY_PLAN", "The plan has no harness-ai-plan-v1 state block.");
	let state;
	try {
		state = JSON.parse(block);
	} catch {
		state = {};
	}
	ensure(state.schema === LEGACY_SCHEMA, "NOT_LEGACY_PLAN", `The plan schema is not ${LEGACY_SCHEMA}.`);
	return {
		context: contextPaths(text),
		currentTaskId: typeof state.currentTaskId === "string" ? state.currentTaskId : null,
		planId: typeof state.planId === "string" ? state.planId : "legacy-plan",
		scopeStatus: typeof state.executionScopeStatus === "string" ? state.executionScopeStatus : "NONE",
		tasks: rows(text).map(taskOf).filter((task) => task !== null)
	};
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-installer/src/installer-migrate.ts
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
		acceptance: ["Project-wide documents describe the round result", "The round digest records result, decisions, contracts and references"],
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
	const text = `Legacy plan ${legacy.planId}: ${done.length} tasks were done before the move to the Workflow Kit (${first} … ${last}). Their rows stay in the plan of the parent commit of the migration.`;
	return text.length > RESULT_LIMIT ? `${text.slice(0, RESULT_LIMIT)}…` : text;
}
/** Builds the Workflow Kit plan for the remaining work of a legacy plan. */
function buildMigratedPlan(legacy, base, options, existing) {
	const message = options.message ?? DEFAULT_MESSAGE;
	const finished = (item) => item.status === "DONE" || item.expectedCommit === message;
	const done = legacy.tasks.filter(finished);
	const pending = legacy.tasks.filter((item) => !finished(item));
	const acceptanceRows = pending.filter((item) => item.completion === "user-acceptance");
	const docsRows = pending.filter((item) => item.kind === "docs");
	const regular = pending.filter((item) => item.completion !== "user-acceptance" && item.kind !== "docs" && item.kind !== "delivery");
	const deliveries = pending.filter((item) => item.kind === "delivery" && item.completion !== "user-acceptance");
	const plan = workflowPlanFacade.createEmpty(base.projectId, base.projectName);
	const converted = [...acceptanceRows.map((item) => `${item.id} → the user's acceptance through \`accept\``), ...docsRows.map((item) => `${item.id} → DOCS-R1`)];
	if (legacy.scopeStatus !== "ACTIVE" || regular.length + deliveries.length + docsRows.length === 0) return {
		converted,
		legacyDone: done.length,
		migrated: [],
		plan
	};
	const work = regular.map((item) => task(item, item.kind === "quality" ? "quality" : "work", []));
	const docs = docsTask(docsRows[0], work.map((item) => item.id));
	plan.scope = {
		acceptance: options.acceptance ?? ["The user accepts the delivered result"],
		acceptanceNote: null,
		approval: {
			at: options.now,
			text: `Migrated from the legacy plan ${legacy.planId} by migrate:harness-plan.`
		},
		baselineCommit: base.baselineCommit,
		blockedReason: null,
		context: legacy.context.filter(existing).map((item) => ({
			path: item,
			required: false
		})),
		decisions: converted.map((text) => ({
			at: options.now,
			text: `Migration: ${text}.`
		})),
		delivery: "IN_PROGRESS",
		id: legacy.planId,
		objective: options.objective ?? `Finish the remaining work of ${legacy.planId}.`,
		spec: options.spec ?? null,
		status: "ACTIVE"
	};
	plan.rounds = [{
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
	}, {
		digest: null,
		id: "R1",
		kind: "implementation",
		status: "OPEN",
		title: "Remaining work"
	}];
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
/** `migrate:harness-plan`: replaces a legacy plan with a Kit plan in one kit-update commit. */
function migrateHarnessPlan(git, folder, options) {
	const root = path.resolve(folder);
	ensure(readManifest(root), "NOT_INSTALLED", "Install the Workflow Kit before migrating the plan.", {}, "Run `scripts/workflow install`.");
	const text = workflowPlatformFacade.readTextIfExists(path.join(root, ...PLAN_PATH.split("/")));
	ensure(text, "NOT_LEGACY_PLAN", `${PLAN_PATH} does not exist.`);
	const legacy = parseLegacyPlan(text);
	const baselineCommit = git.head(root);
	ensure(baselineCommit, "NO_COMMITS", "The repository has no commits yet.");
	const name = options.name?.trim() || path.basename(root);
	const result = buildMigratedPlan(legacy, {
		baselineCommit,
		projectId: projectSlug(name),
		projectName: name
	}, options, (relative) => existsSync(path.join(root, ...relative.split("/"))));
	ensure(git.transactions.journal(root) === null, "TRANSACTION_PENDING", "A Kit commit transaction is unfinished.");
	return {
		commit: git.transactions.commit(root, {
			files: [],
			message: options.message ?? DEFAULT_MESSAGE,
			planPath: PLAN_PATH,
			planText: workflowPlanFacade.render(result.plan),
			role: "kit-update",
			scopeId: result.plan.scope?.id ?? null,
			taskId: null
		}),
		converted: result.converted,
		legacyDone: result.legacyDone,
		migrated: result.migrated,
		scopeId: result.plan.scope?.id ?? null
	};
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-installer/src/workflow-installer-facade.ts
/**
* Public facade of the workflow-installer module: the installation payload,
* folder inspection, install and update, the project doctor and the
* migration of legacy Harness plans.
*/
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
	manifest(entries) {
		return buildManifest(entries);
	}
	renderManifest(manifest) {
		return renderManifest(manifest);
	}
	/** The English agent rules of the managed AGENTS.md section. */
	agentRules() {
		return agentRules();
	}
};
new WorkflowInstallerFacade();
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-integration/src/integration-journal.ts
var JOURNAL_FILE = "integration.json";
var PHASES = /* @__PURE__ */ new Set([
	"CHECKING",
	"CHECKS_FAILED",
	"CONFLICT",
	"MERGING",
	"PREPARED",
	"UNKNOWN"
]);
/** Absolute path of the integration journal of a checkout. */
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
	].every((field) => typeof field === "string" && field !== "") && PHASES.has(journal.phase);
}
/** The stored journal, or null; an unreadable journal fails (never guessed). */
function readJournal(root) {
	const file = journalFile(root);
	const text = workflowPlatformFacade.readTextIfExists(file);
	if (text === null) return null;
	let parsed = null;
	try {
		parsed = JSON.parse(text);
	} catch {
		parsed = null;
	}
	if (!isJournal(parsed)) throw new WorkflowError("INTEGRATION_UNKNOWN", "The integration journal is unreadable.", { file }, "Inspect main (`git status`) and the journal; the Kit does not guess the state.");
	return parsed;
}
function saveJournal(root, journal) {
	workflowPlatformFacade.writeFileAtomic(journalFile(root), `${JSON.stringify(journal, null, 2)}\n`);
}
function removeJournal(root) {
	rmSync(journalFile(root), { force: true });
}
/** `integration:status`: IDLE, or the journal phase with conflicts and MERGE_HEAD. */
function integrationState(git, root) {
	const journal = readJournal(root);
	const mergeHead = git.mergeHead(root);
	return {
		conflicts: mergeHead ? git.conflicts(root) : [],
		journal,
		mergeHead,
		status: journal?.phase ?? "IDLE"
	};
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-integration/src/integration-proof.ts
/** Launchers of the Kit; an executor source never changes them. */
var LAUNCHERS = /* @__PURE__ */ new Set([
	"scripts/workflow",
	"scripts/workflow.cmd",
	"scripts/workflow.ps1"
]);
var PLAN_ROLE = "assignment-plan";
var RESULT_OK = /* @__PURE__ */ new Set(["passed", "skipped"]);
var HISTORY_HINT = "Integrate only the commit the executor reported: its worktree history must be the assignment plan commit followed by its task commits.";
function single(commit, key) {
	const values = commit.trailers[key] ?? [];
	return values.length === 1 ? values[0] ?? null : null;
}
function historyError(message, details) {
	return new WorkflowError("INTEGRATION_HISTORY", message, details, HISTORY_HINT);
}
function resolveCommit$1(git, root, revision) {
	const output = git.git.run(root, [
		"rev-parse",
		"--verify",
		"-q",
		`${revision}^{commit}`
	], { allowFailure: true });
	return output.status === 0 ? output.stdout.trim() : null;
}
/** The record is ready, the source is its reported commit and the worktree is clean. */
function checkSource(git, mainRoot, assignment, sourceSha) {
	const worktree = assignment.worktree;
	ensure(assignment.status === "READY_FOR_INTEGRATION" && worktree !== null && assignment.sourceCommit !== null, "INTEGRATION_NOT_READY", `Assignment ${assignment.id} is ${assignment.status}, not READY_FOR_INTEGRATION.`, {
		id: assignment.id,
		status: assignment.status
	});
	const source = resolveCommit$1(git, mainRoot, sourceSha);
	ensure(source !== null && source === assignment.sourceCommit, "INTEGRATION_SOURCE", `${sourceSha} is not the source commit ${assignment.sourceCommit} of assignment ${assignment.id}.`, {
		expected: assignment.sourceCommit,
		source: source ?? sourceSha
	});
	ensure(git.head(worktree) === source, "INTEGRATION_SOURCE", `The executor worktree ${worktree} is not at the source commit ${source}.`, {
		head: git.head(worktree),
		source,
		worktree
	});
	const changes = git.changes(worktree).all;
	ensure(changes.length === 0, "INTEGRATION_DIRTY", `The executor worktree ${worktree} has uncommitted changes.`, {
		paths: changes,
		worktree
	});
	return {
		source,
		worktree
	};
}
function basePlan(git, mainRoot, baseCommit) {
	const text = git.show(mainRoot, baseCommit, PLAN_PATH);
	ensure(text !== null, "INTEGRATION_CONTRACT", `The base commit ${baseCommit} has no plan.`);
	return workflowPlanFacade.parse(text);
}
function findTask(plan, taskId) {
	return plan.tasks.find((task) => task.id === taskId) ?? null;
}
/** The role the executor task commit has: `docs` for a DOCS task. */
function taskRole(task) {
	return task.kind === "docs" ? "docs" : "implementation";
}
/**
* `base..source` is exactly the assignment plan commit (only the plan file)
* followed by one or more task commits, each with one parent continuing the
* chain and the trailers of the assignment.
*/
function checkHistory(git, mainRoot, assignment, task, source) {
	const commits = git.history(mainRoot, assignment.baseCommit, source);
	const scopeId = `assignment-${assignment.id}`;
	const role = taskRole(task);
	let parent = assignment.baseCommit;
	commits.forEach((commit, index) => {
		const expectedRole = index === 0 ? PLAN_ROLE : role;
		const wrong = [
			[
				"parents",
				commit.parents.join(" "),
				parent
			],
			[
				"Workflow-Role",
				single(commit, "Workflow-Role"),
				expectedRole
			],
			[
				"Workflow-Scope",
				single(commit, "Workflow-Scope"),
				scopeId
			],
			[
				"Workflow-Task",
				single(commit, "Workflow-Task"),
				task.id
			],
			[
				"Workflow-Assignment",
				single(commit, "Workflow-Assignment"),
				assignment.id
			],
			[
				"Workflow-Iteration",
				single(commit, "Workflow-Iteration"),
				String(assignment.iteration)
			]
		].filter(([, actual, expected]) => actual !== expected);
		if (wrong.length > 0) throw historyError(`Commit ${commit.sha} is not the ${expectedRole} commit of assignment ${assignment.id}.`, {
			mismatches: wrong.map(([field, actual, expected]) => ({
				actual,
				expected,
				field
			})),
			sha: commit.sha
		});
		parent = commit.sha;
	});
	const [planCommit] = commits;
	const last = commits.at(-1);
	if (!(planCommit && last && commits.length > 1 && last.sha === source)) throw historyError(`${assignment.baseCommit}..${source} must hold the assignment plan commit and at least one ${role} commit.`, { commits: commits.map((commit) => commit.sha) });
	const planPaths = git.commitPaths(mainRoot, planCommit.sha);
	if (planPaths.length !== 1 || planPaths[0] !== ".harness/plans/todo-plan.md") throw historyError(`The assignment plan commit ${planCommit.sha} must change only ${PLAN_PATH}.`, {
		paths: planPaths,
		sha: planCommit.sha
	});
	return last;
}
/** The diff `base..source` holds no Kit-managed or launcher file except the plan. */
function checkDiff(git, mainRoot, baseCommit, source) {
	const changed = git.diffPaths(mainRoot, baseCommit, source);
	const managed = changed.filter((file) => file !== ".harness/plans/todo-plan.md" && (git.isKitManagedPath(file) || LAUNCHERS.has(file)));
	if (managed.length > 0) throw historyError(`The executor source changes Workflow Kit files: ${managed.join(", ")}.`, { paths: managed });
	return changed;
}
function readReceipt(worktree, sha) {
	try {
		return workflowQualityFacade.readEvidence(worktree, sha);
	} catch {
		return null;
	}
}
/**
* The receipt of the last task commit exists in the executor worktree, names
* that commit and its transaction, holds every check the commit stage runs
* for the task, and no check failed; assigned checks must have passed.
*/
function checkReceipt(worktree, task, last) {
	const receipt = readReceipt(worktree, last.sha);
	const unchecked = (message, details) => new WorkflowError("INTEGRATION_UNCHECKED", message, {
		sha: last.sha,
		...details
	}, "The executor repeats `scripts/workflow commit --task <ID>` in its worktree so the checks run on its commit.");
	if (!(receipt && Array.isArray(receipt.reports)) || receipt.commit !== last.sha || receipt.transaction !== single(last, "Workflow-Transaction")) throw unchecked(`No check receipt refers to commit ${last.sha}.`, {});
	const checks = receipt.reports.flatMap((report) => (report.results ?? []).map((result) => ({
		id: result.id,
		stage: result.stage,
		status: result.status
	})));
	const expected = workflowQualityFacade.selectChecks({
		assigned: task.checks,
		config: workflowQualityFacade.readConfig(worktree),
		root: worktree,
		service: taskRole(task) !== "implementation",
		stage: "commit"
	});
	const status = (id) => checks.find((check) => check.id === id && check.stage === "commit")?.status;
	const bad = [...checks.filter((check) => !RESULT_OK.has(check.status)).map((c) => c.id), ...expected.filter((check) => task.checks.includes(check.id) ? status(check.id) !== "passed" : !RESULT_OK.has(status(check.id) ?? "error")).map((check) => check.id)];
	if (bad.length > 0) throw unchecked(`Checks of commit ${last.sha} did not pass: ${[...new Set(bad)].join(", ")}.`, { checks: [...new Set(bad)] });
	return checks;
}
/** The task contract of the base plan is the task of main's current plan. */
function checkContract(mainRoot, assignment, base) {
	const current = workflowPlanFacade.read(mainRoot);
	const task = current ? findTask(current, assignment.taskId) : null;
	const contract = (item) => JSON.stringify({
		acceptance: item.acceptance,
		files: item.files,
		kind: item.kind,
		title: item.title
	});
	ensure(current?.scope?.id === assignment.scopeId && task !== null && contract(task) === contract(base), "INTEGRATION_CONTRACT", `The contract of task ${assignment.taskId} in main differs from its base commit ${assignment.baseCommit}.`, {
		scopeId: current?.scope?.id ?? null,
		taskId: assignment.taskId
	}, "Create a new assignment for the changed task.");
}
/**
* Proves an executor source before integration (spec section 7): the ready
* record and clean worktree, the exact executor history, no Kit files in the
* diff, a passed check receipt of the last task commit and an unchanged task
* contract. Throws the first failure.
*/
function proveSource(git, mainRoot, assignment, sourceSha) {
	const { source, worktree } = checkSource(git, mainRoot, assignment, sourceSha);
	const baseTask = findTask(basePlan(git, mainRoot, assignment.baseCommit), assignment.taskId);
	ensure(baseTask !== null, "INTEGRATION_CONTRACT", `The base plan has no task ${assignment.taskId}.`, { taskId: assignment.taskId });
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
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-integration/src/integration-merge.ts
var MERGE_TIMEOUT_MS = 600 * 1e3;
var UNKNOWN_HINT = "Inspect main with `git status` and `git log -1`; abort a merge in progress with `git merge --abort`, then remove .harness/workflow/local/integration.json and start the integration again.";
var continueHint = (id) => `scripts/workflow integration:continue --id ${id}`;
/** A path is in scope when it equals or is nested (by segment) in a task file. */
function inTaskScope(files, file) {
	return files.some((entry) => file === entry || file.startsWith(`${entry}/`));
}
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
/** Records UNKNOWN and throws: the state cannot be proven, nothing is retried. */
function unknown(root, journal, message, error = null) {
	saveJournal(root, {
		...journal,
		error,
		phase: "UNKNOWN"
	});
	throw new WorkflowError("INTEGRATION_UNKNOWN", message, {
		error,
		operationId: journal.operationId
	}, UNKNOWN_HINT);
}
function resolveCommit(git, root, revision) {
	const output = git.git.run(root, [
		"rev-parse",
		"--verify",
		"-q",
		`${revision}^{commit}`
	], { allowFailure: true });
	return output.status === 0 ? output.stdout.trim() : null;
}
/** The plan of main at the journal's HEAD: the base of the plan candidate. */
function mainPlan(git, root, journal) {
	const text = git.show(root, journal.mainHead, PLAN_PATH);
	ensure(text !== null, "NOT_INSTALLED", `${PLAN_PATH} is missing in main.`);
	const plan = workflowPlanFacade.parse(text);
	return {
		plan,
		task: workflowPlanFacade.task(plan, journal.taskId),
		text
	};
}
/**
* Main's plan with the task DONE through this integration (`operationId`,
* `sourceCommit`). A DOCS task takes the round digest its executor recorded
* in the source plan; the executor plan itself is discarded.
*/
function candidatePlan(git, root, plan, journal) {
	const task = workflowPlanFacade.task(plan, journal.taskId);
	let digest = null;
	if (task.kind === "docs") {
		const text = git.show(root, journal.source, PLAN_PATH);
		digest = (text ? workflowPlanFacade.parse(text, { projection: false }) : null)?.rounds.find((round) => round.id === task.roundId)?.digest ?? null;
	}
	return workflowPlanFacade.integrateTask(plan, task.id, {
		digest,
		operationId: journal.operationId,
		sourceCommit: journal.source
	});
}
/** HEAD is the commit of this integration: parents main HEAD and source, its transaction. */
function isIntegrationCommit(git, root, journal, head) {
	const commit = git.history(root, journal.mainHead, head).find((item) => item.sha === head);
	return commit !== void 0 && commit.parents.join(" ") === `${journal.mainHead} ${journal.source}` && commit.trailers["Workflow-Role"]?.join() === "integration" && commit.trailers["Workflow-Transaction"]?.join() === journal.operationId;
}
/**
* After the integration commit: the record becomes INTEGRATED with the
* commit, the executor worktree and branch are cleaned up (a refusal or
* failure is `cleanup: PENDING`, the integration still succeeds), and the
* journal is removed.
*/
function finish(git, root, journal, sha, now) {
	const record = workflowAssignmentFacade.read(root, journal.assignmentId);
	ensure(record, "ASSIGNMENT_UNKNOWN", `The main checkout has no assignment ${journal.assignmentId}.`);
	let updated = record.status === "INTEGRATED" && record.integrationCommit === sha ? record : {
		...record,
		integrationCommit: sha,
		status: "INTEGRATED",
		updatedAt: now()
	};
	workflowAssignmentFacade.write(root, updated);
	try {
		updated = workflowAssignmentFacade.cleanup(git, root, updated, now());
	} catch (error) {
		updated = {
			...updated,
			cleanup: {
				at: now(),
				reason: error.message,
				status: "PENDING"
			}
		};
		workflowAssignmentFacade.write(root, updated);
	}
	removeJournal(root);
	return outcome(journal, {
		assignment: updated,
		integrationCommit: sha,
		status: "INTEGRATED"
	});
}
/** Phase PREPARED: `git merge --no-commit --no-ff <source>`; no MERGE_HEAD is UNKNOWN. */
function merge(git, root, journal) {
	const dirty = git.changes(root).all;
	ensure(dirty.length === 0 && git.mergeHead(root) === null, "INTEGRATION_DIRTY", "Main has changes; the integration merges only into a clean main.", { paths: dirty });
	const merging = {
		...journal,
		phase: "MERGING"
	};
	saveJournal(root, merging);
	const output = git.git.run(root, [
		"merge",
		"--no-commit",
		"--no-ff",
		"-q",
		journal.source
	], {
		allowFailure: true,
		timeoutMs: MERGE_TIMEOUT_MS
	});
	if (git.mergeHead(root) !== journal.source) unknown(root, merging, `git merge of ${journal.source} left no merge state; it is never retried automatically.`, `${output.stderr}${output.stdout}`.slice(-4e3));
	return merging;
}
/** Runs the commit transaction; failed checks keep the merge state (CHECKS_FAILED). */
function commit(git, root, journal, plan, files) {
	const candidate = candidatePlan(git, root, plan, journal);
	const task = workflowPlanFacade.task(plan, journal.taskId);
	const checking = {
		...journal,
		error: null,
		phase: "CHECKING"
	};
	saveJournal(root, checking);
	try {
		return git.transactions.commit(root, {
			assignmentId: journal.assignmentId,
			checks: task.checks,
			files,
			iteration: task.iteration,
			message: `merge: ${task.title}`,
			planPath: PLAN_PATH,
			planText: workflowPlanFacade.render(candidate),
			role: "integration",
			scopeId: plan.scope?.id ?? null,
			sourceCommit: journal.source,
			taskId: task.id,
			transactionId: journal.operationId
		}).sha;
	} catch (error) {
		if (!(error instanceof WorkflowError && error.code === "COMMIT_FAILED")) throw error;
		const output = String(error.details.output ?? error.message);
		saveJournal(root, {
			...checking,
			error: output.slice(-4e3),
			phase: "CHECKS_FAILED"
		});
		throw new WorkflowError("INTEGRATION_CHECKS_FAILED", `The checks of ${task.id} failed on the merged result; the merge and your fixes are kept.`, {
			output,
			phase: "CHECKS_FAILED"
		}, `Fix the files of ${task.id} in main, then run ${continueHint(journal.assignmentId)}.`);
	}
}
/**
* Drives an integration from its journal to the end (spec 7). Reconciles a
* crash first: a pending transaction of this integration is finished or
* rolled back, and a HEAD that already is the integration commit completes
* without a second merge. Never resets.
*/
function resume(git, root, stored, now) {
	let journal = stored;
	const transaction = git.transactions.journal(root);
	if (transaction) {
		ensure(transaction.role === "integration" && transaction.id === journal.operationId, "TRANSACTION_PENDING", "A commit transaction outside this integration is unfinished.", {}, "Run `scripts/workflow repair`.");
		if (git.transactions.confirmed(root, transaction)) {
			const finished = git.transactions.finish(root);
			return finish(git, root, journal, finished?.sha ?? "", now);
		}
		if (!git.transactions.cancel(root)) unknown(root, journal, "The prepared integration commit changed concurrently.");
	}
	const head = git.head(root);
	if (head !== journal.mainHead) {
		if (head && isIntegrationCommit(git, root, journal, head)) return finish(git, root, journal, head, now);
		unknown(root, journal, `Main moved to ${head ?? "nothing"} outside the integration of ${journal.mainHead}.`);
	}
	if (journal.phase === "UNKNOWN") throw new WorkflowError("INTEGRATION_UNKNOWN", "The integration state could not be proven earlier; it is not retried.", {
		error: journal.error,
		operationId: journal.operationId
	}, UNKNOWN_HINT);
	if (journal.phase === "PREPARED") journal = merge(git, root, journal);
	if (git.mergeHead(root) !== journal.source) unknown(root, journal, `No merge of ${journal.source} is in progress.`);
	const { plan, task, text } = mainPlan(git, root, journal);
	workflowPlatformFacade.writeFileAtomic(workflowPlanFacade.planFile(root), text);
	git.git.run(root, [
		"add",
		"--",
		PLAN_PATH
	]);
	const conflicts = git.conflicts(root);
	if (conflicts.length > 0) {
		saveJournal(root, {
			...journal,
			phase: "CONFLICT"
		});
		return outcome(journal, {
			conflicts,
			status: "CONFLICT"
		});
	}
	const changed = git.changes(root).all.filter((file) => file !== PLAN_PATH);
	const outside = changed.filter((file) => !inTaskScope(task.files, file));
	if (outside.length > 0) {
		git.git.run(root, ["merge", "--abort"]);
		removeJournal(root);
		throw new WorkflowError("INTEGRATION_SCOPE", `The merged result changes files outside ${task.id}: ${outside.join(", ")}. The merge was aborted.`, { paths: outside }, `Keep the integration inside the files of ${task.id}, then run scripts/workflow integration:start --id ${journal.assignmentId} --source ${journal.source}.`);
	}
	const sha = commit(git, root, journal, plan, changed);
	return finish(git, root, journal, sha, now);
}
/** Preconditions of a new integration in main (spec 7). */
function ensureCanIntegrate(git, root, plan) {
	ensure(plan, "NOT_INSTALLED", `${PLAN_PATH} does not exist; install the Workflow Kit first.`);
	ensure(plan.scope !== null && workflowPlanFacade.execution(plan).strategy === "orchestrated", "NOT_ORCHESTRATED", "Integration exists only in an orchestrated scope.");
	ensure(plan.scope.status === "ACTIVE", "SCOPE_NOT_ACTIVE", `The scope is ${plan.scope.status}.`);
	ensure(git.transactions.journal(root) === null, "TRANSACTION_PENDING", "A commit transaction is unfinished.", {}, "Run `scripts/workflow repair`.");
	const dirty = git.changes(root).all;
	ensure(dirty.length === 0 && git.mergeHead(root) === null, "INTEGRATION_DIRTY", "Integrate into a clean main: commit or remove the changes first (untracked files too).", { paths: dirty });
}
/**
* `integration:start --id <assignment> --source <sha>` in main. A retry of
* the same assignment and source continues the journal; another integration
* is INTEGRATION_ACTIVE.
*/
function startIntegration$1(git, root, request) {
	const active = readJournal(root);
	if (active) {
		ensure(active.assignmentId === request.assignmentId && resolveCommit(git, root, request.source) === active.source, "INTEGRATION_ACTIVE", `The integration of ${active.assignmentId} is unfinished.`, {
			assignmentId: active.assignmentId,
			phase: active.phase
		}, continueHint(active.assignmentId));
		return resume(git, root, active, request.now);
	}
	const plan = workflowPlanFacade.read(root);
	ensureCanIntegrate(git, root, plan);
	const record = workflowAssignmentFacade.read(root, request.assignmentId);
	ensure(record, "ASSIGNMENT_UNKNOWN", `The main checkout has no assignment ${request.assignmentId}.`);
	const proof = proveSource(git, root, record, request.source);
	const journal = {
		assignmentId: record.id,
		error: null,
		mainHead: git.head(root) ?? "",
		operationId: randomUUID(),
		phase: "PREPARED",
		source: proof.sourceCommit,
		startedAt: request.now(),
		taskId: record.taskId
	};
	candidatePlan(git, root, plan, journal);
	saveJournal(root, journal);
	return resume(git, root, journal, request.now);
}
/** `integration:continue --id <assignment>`: finishes the unfinished integration. */
function continueIntegration$1(git, root, request) {
	const journal = readJournal(root);
	ensure(journal, "NO_INTEGRATION", "No integration is unfinished.", {}, "Start one with scripts/workflow integration:start --id <assignment> --source <sha>.");
	ensure(journal.assignmentId === request.assignmentId, "INTEGRATION_ACTIVE", `The unfinished integration belongs to ${journal.assignmentId}.`, {
		assignmentId: journal.assignmentId,
		phase: journal.phase
	}, continueHint(journal.assignmentId));
	return resume(git, root, journal, request.now);
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-integration/src/workflow-integration-facade.ts
/**
* Public boundary of the workflow-integration module: integration of
* executor results into main (spec section 7): the source proof, the merge
* with its journal, `continue` and the status.
*/
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
		return startIntegration$1(this.git, mainRoot, request);
	}
	/** `integration:continue`: finishes the unfinished integration of the assignment. */
	continue(mainRoot, request) {
		return continueIntegration$1(this.git, mainRoot, request);
	}
	/** `integration:status`: IDLE or the journal phase, conflicts and MERGE_HEAD. */
	status(mainRoot) {
		return integrationState(this.git, mainRoot);
	}
	/** True while an integration journal exists: other Kit writes are refused. */
	isActive(root) {
		return existsSync(journalFile(root));
	}
};
var workflowIntegrationFacade = new WorkflowIntegrationFacade();
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-context.ts
function readPlan(context) {
	const plan = workflowPlanFacade.read(context.root);
	ensure(plan, "NOT_INSTALLED", `${PLAN_PATH} does not exist; install the Workflow Kit first.`, {}, "Run `scripts/workflow install` or open the project in Harness AI.");
	return plan;
}
function readConfig(context) {
	return workflowQualityFacade.readConfig(context.root);
}
function requireHead(context) {
	const head = context.git.head(context.root);
	ensure(head, "NO_COMMITS", "The repository has no commits yet.");
	return head;
}
/** INTEGRATION_ACTIVE while `.harness/workflow/local/integration.json` exists. */
function ensureNoIntegration(context) {
	ensure(!workflowIntegrationFacade.isActive(context.root), "INTEGRATION_ACTIVE", "An integration is unfinished; other Kit writes wait until it completes.", {}, "Run `scripts/workflow integration:status`, then `scripts/workflow integration:continue --id <assignment>`.");
}
/** The shared busy check of Kit writes: no commit transaction, no integration. */
function ensureNoTransaction(context) {
	ensure(context.git.transactions.journal(context.root) === null, "TRANSACTION_PENDING", "A commit transaction is unfinished.", {}, "Run `scripts/workflow repair`.");
	ensureNoIntegration(context);
}
function ensureRevision(plan, expected) {
	ensure(expected === void 0 || plan.revision === expected, "REVISION_MISMATCH", `The plan is at revision ${plan.revision}, not ${String(expected)}; read the status again.`, { revision: plan.revision });
}
/** Runs a mutating operation under the project lock. */
function locked(context, fn) {
	return workflowPlatformFacade.withLock(context.git.localPath(context.root, "kit.lock"), fn);
}
/** Commits the plan (and files) through a Kit transaction. */
function commitPlan(context, plan, request) {
	ensureNoTransaction(context);
	return context.git.transactions.commit(context.root, {
		...request,
		planPath: PLAN_PATH,
		planText: workflowPlanFacade.render(plan)
	});
}
/** Writes a plan state change that the next Kit commit records. */
function savePlan(context, plan) {
	workflowPlanFacade.write(context.root, plan);
}
function changedDocuments(context, paths) {
	const changed = new Set(context.git.changes(context.root).all);
	return [...new Set(paths.filter((item) => Boolean(item)))].filter((item) => changed.has(item));
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-context-budget.ts
/**
* The documents a task brings into its executor brief: its `context`
* (a whole-document reference wins over a heading reference of the same
* path), or the scope specification when the task has no context.
*/
function briefRefs(plan, task) {
	if (task.context.length === 0) {
		const spec = plan.scope?.spec;
		return spec ? [{
			path: spec,
			required: true
		}] : [];
	}
	const whole = new Set(task.context.filter((ref) => !ref.heading).map((ref) => ref.path));
	const seen = /* @__PURE__ */ new Set();
	return task.context.filter((ref) => {
		const key = `${ref.path}\n${ref.heading ?? ""}`;
		if (seen.has(key) || ref.heading && whole.has(ref.path)) return false;
		seen.add(key);
		return true;
	});
}
/**
* Reads the brief documents of a task from `root` (the main checkout): the
* whole file, or only the section of a heading reference. A missing file or
* heading fails with CONTEXT_MISSING.
*/
function briefDocuments(root, plan, task) {
	return briefRefs(plan, task).map((ref) => {
		const text = workflowPlatformFacade.readTextIfExists(workflowPlatformFacade.resolveInside(root, ref.path));
		const section = text !== null && ref.heading ? workflowRecoveryFacade.section(text, ref.heading) : text;
		ensure(section !== null, "CONTEXT_MISSING", text === null ? `The context document ${ref.path} of ${task.id} does not exist.` : `The context document ${ref.path} of ${task.id} has no heading "${ref.heading}".`, {
			path: ref.path,
			taskId: task.id,
			...ref.heading ? { heading: ref.heading } : {}
		}, "Fix the task context: an existing file and, for a section, an existing heading.");
		const body = section.trimEnd();
		return {
			bytes: Buffer.byteLength(body, "utf8"),
			path: ref.path,
			text: body,
			...ref.heading ? { heading: ref.heading } : {}
		};
	});
}
/**
* The brief documents of a task, read from the project root, after the
* checks: they exist (CONTEXT_MISSING) and their text fits
* `budget.briefBytes` (CONTEXT_TOO_LARGE).
*/
function checkedBriefDocuments(context, plan, task, budget = readConfig(context).budget.briefBytes) {
	const documents = briefDocuments(context.root, plan, task);
	const bytes = documents.reduce((sum, item) => sum + item.bytes, 0);
	ensure(bytes <= budget, "CONTEXT_TOO_LARGE", `The context documents of ${task.id} take ${bytes} bytes; the brief budget is ${budget}.`, {
		budget,
		bytes,
		taskId: task.id
	}, "Narrow the task context to sections (heading).");
	return documents;
}
/** The plan-time check of `checkedBriefDocuments` for every given task. */
function ensureContextBudget(context, plan, tasks) {
	const budget = readConfig(context).budget.briefBytes;
	for (const task of tasks) checkedBriefDocuments(context, plan, task, budget);
}
/** Tasks of `next` that are new or whose context differs from `previous`. */
function changedContextTasks(previous, next) {
	const before = new Map(previous.tasks.map((task) => [task.id, task]));
	return next.tasks.filter((task) => {
		const old = before.get(task.id);
		return !old || JSON.stringify(old.context) !== JSON.stringify(task.context);
	});
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-pause.ts
/** The user's pause of the workflow, local state of the main checkout. */
var PAUSE_FILE = "pause.json";
var PAUSE_PATH = `.harness/workflow/local/${PAUSE_FILE}`;
var REWRITE = "Rewrite it on the user's request: scripts/workflow pause:set --on|--off --note \"<the user's words>\".";
function pauseFile(context) {
	return context.git.localPath(context.root, PAUSE_FILE);
}
/** PAUSE_STATE for a file that cannot be read or has the wrong shape. */
function readPause(context) {
	let text = null;
	let parsed = null;
	let readable = true;
	try {
		text = workflowPlatformFacade.readTextIfExists(pauseFile(context));
		parsed = text === null ? null : JSON.parse(text);
	} catch {
		readable = false;
	}
	if (readable && text === null) return {
		at: null,
		note: null,
		paused: false
	};
	const record = parsed ?? {};
	ensure(readable && typeof parsed === "object" && typeof record.paused === "boolean" && typeof record.note === "string" && typeof record.at === "string", "PAUSE_STATE", `${PAUSE_PATH} is unreadable; the pause state is unknown.`, { path: PAUSE_PATH }, REWRITE);
	return {
		at: record.at,
		note: record.note,
		paused: record.paused
	};
}
/**
* `pause:set`: stores the user's pause under the project lock. It needs an
* installed Kit but no scope, and overwrites an unreadable file.
*/
function setPause(context, paused, note) {
	const words = note.trim();
	ensure(words !== "", "USAGE", "--note is required.");
	return locked(context, () => {
		readPlan(context);
		const state = {
			at: context.now(),
			note: words,
			paused
		};
		workflowPlatformFacade.writeFileAtomic(pauseFile(context), `${JSON.stringify(state, null, 2)}\n`);
		return state;
	});
}
/**
* WORKFLOW_PAUSED in the main checkout while the user's pause is on. An
* executor worktree finishes its assignment: the pause does not apply there.
*/
function ensureNotPaused(context) {
	if (workflowAssignmentFacade.worktreeRecord(context.root) !== null) return;
	const pause = readPause(context);
	ensure(!pause.paused, "WORKFLOW_PAUSED", `The workflow is paused by the user (${pause.at}): ${pause.note}`, {
		at: pause.at,
		note: pause.note
	}, "Wait until the user presses Continue in Harness, or run `scripts/workflow pause:set --off --note \"<the user's words>\"` when the user asks to continue.");
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-assignment.ts
/** Integration journal of E9; while it exists no assignment is created. */
var INTEGRATION_FILE = "integration.json";
function activeRecords(plan, root) {
	const scopeId = plan.scope?.id;
	return workflowAssignmentFacade.list(root).filter((record) => record.scopeId === scopeId && workflowAssignmentFacade.isActive(record));
}
function readyTask(task) {
	return {
		id: task.id,
		kind: task.kind,
		parallelSafe: task.parallelSafe === true,
		title: task.title
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
		ready: schedule.ready.map((id) => readyTask(workflowPlanFacade.task(plan, id))),
		scopeId: plan.scope?.id ?? null
	};
}
/** Scope ACTIVE and orchestrated; no transaction, no integration, clean tree. */
function ensureCanAssign(context, plan) {
	ensure(plan.scope !== null && workflowPlanFacade.execution(plan).strategy === "orchestrated", "NOT_ORCHESTRATED", "Assignments exist only in an orchestrated scope.", {}, "In a sequential scope run the tasks yourself: scripts/workflow task:start <ID>.");
	ensure(plan.scope.status === "ACTIVE", "SCOPE_NOT_ACTIVE", `The scope is ${plan.scope.status}.`);
	ensureNoTransaction(context);
	const dirty = context.git.changes(context.root).all.filter((file) => !context.git.isKitManagedPath(file));
	ensure(dirty.length === 0, "DIRTY_TREE", "Create assignments on a clean main working tree.", { paths: dirty }, "Commit or remove the changes first.");
}
/** Dependencies are DONE (the scheduler) and their commits are in the base. */
function ensureDependenciesInBase(context, plan, task, base) {
	if (task.dependencies.length === 0) return;
	const references = context.git.resolveReferences(context.root, plan, PLAN_PATH);
	const missing = task.dependencies.filter((id) => {
		const reference = references.get(id);
		return !(reference?.status === "committed" && context.git.isAncestor(context.root, reference.sha, base));
	});
	ensure(missing.length === 0, "DEPENDENCY_NOT_IN_BASE", `The commits of ${missing.join(", ")} are not ancestors of the base ${base}.`, { dependencies: missing });
}
function scheduled(schedule, task) {
	const reason = schedule.blocked.find((item) => item.taskId === task.id);
	ensure(!reason, reason?.code ?? "ASSIGNMENT_BARRIER", reason?.message ?? "", { blockedBy: reason?.blockedBy ?? [] }, "Run `scripts/workflow assignment:next` for the tasks that can be assigned now.");
	ensure(schedule.ready.includes(task.id), "ASSIGNMENT_BARRIER", `${task.id} cannot be assigned now.`);
}
/**
* The executor brief followed by the documents map of the project (spec
* 3.2, the specification folder first, its own 4000-byte budget with a tail
* line): the brief budget counts only the context documents.
*/
function briefWithMap(context, plan, brief) {
	const map = new WorkflowRecoveryFacade(context.git).documentsMap(context.root, { specPath: plan.scope?.spec ?? null });
	if (map.text === "") return brief;
	return [
		brief.trimEnd(),
		"",
		"Project documents (ask with scripts/workflow context <path>):",
		map.text,
		""
	].join("\n");
}
/**
* `assignment:create --task <ID>` in main (spec 5.1). The plan does not
* change. The brief carries the task's context documents read from main
* and the documents map;
* CONTEXT_MISSING / CONTEXT_TOO_LARGE refuse before a record is written.
*/
function createAssignment(context, taskId) {
	return locked(context, () => {
		const plan = readPlan(context);
		ensureCanAssign(context, plan);
		ensureNotPaused(context);
		const base = requireHead(context);
		const task = workflowPlanFacade.task(plan, taskId);
		ensure(task.kind === "work" || task.kind === "docs", "ASSIGNMENT_KIND", `${task.id} is a ${task.kind} task; the orchestrator runs it in main.`, {}, `Run it yourself: scripts/workflow task:start ${task.id}.`);
		ensure(task.status === "TODO", "TASK_NOT_TODO", `${task.id} is ${task.status}.`);
		const documents = checkedBriefDocuments(context, plan, task);
		const scopeId = plan.scope?.id ?? "NONE";
		const digest = workflowAssignmentFacade.configDigest(context.root);
		const active = activeRecords(plan, context.root);
		const existing = active.find((record) => record.taskId === task.id);
		if (existing) {
			ensure(existing.status === "ASSIGNED" && existing.iteration === task.iteration && existing.baseCommit === base && existing.configDigest === digest, "ASSIGNMENT_EXISTS", `${task.id} already has the active assignment ${existing.id} (${existing.status}).`, {
				id: existing.id,
				status: existing.status
			});
			return {
				assignment: existing,
				brief: briefWithMap(context, plan, workflowAssignmentFacade.brief(plan, task, existing, documents)),
				created: false
			};
		}
		scheduled(workflowAssignmentFacade.schedule(plan, active), task);
		ensureDependenciesInBase(context, plan, task, base);
		const record = workflowAssignmentFacade.create({
			baseCommit: base,
			configDigest: digest,
			iteration: task.iteration,
			now: context.now(),
			scopeId,
			taskId: task.id
		});
		ensure(workflowAssignmentFacade.read(context.root, record.id) === null, "ASSIGNMENT_EXISTS", `The assignment record ${record.id} already exists.`, { id: record.id });
		workflowAssignmentFacade.write(context.root, record);
		return {
			assignment: record,
			brief: briefWithMap(context, plan, workflowAssignmentFacade.brief(plan, task, record, documents)),
			created: true
		};
	});
}
/**
* `assignment:cleanup [--id]` in main (spec 7): removes the worktree and
* merged branch of one INTEGRATED record, or of every INTEGRATED record whose
* cleanup is not DONE. A refusal is recorded as PENDING, not an error.
*/
function cleanupAssignments(context, id) {
	return locked(context, () => {
		let records;
		if (id === void 0) records = workflowAssignmentFacade.list(context.root).filter((record) => record.status === "INTEGRATED" && record.cleanup?.status !== "DONE");
		else {
			const record = workflowAssignmentFacade.read(context.root, id);
			ensure(record, "ASSIGNMENT_UNKNOWN", `The main checkout has no assignment ${id}.`);
			records = [record];
		}
		return { assignments: records.map((record) => workflowAssignmentFacade.cleanup(context.git, context.root, record, context.now())) };
	});
}
/**
* `assignment:cancel --id <id> [--force]` in main: drops an assignment that
* is not INTEGRATED with its worktree and branch (`workflow-assignment`).
* The plan does not change, so the task stays TODO and can be handed out
* again.
*/
function cancelAssignment(context, id, force) {
	return locked(context, () => {
		ensureNoTransaction(context);
		const record = workflowAssignmentFacade.read(context.root, id);
		ensure(record, "ASSIGNMENT_UNKNOWN", `The main checkout has no assignment ${id}.`, {}, "Run `scripts/workflow assignment:next` for the active assignments.");
		const result = workflowAssignmentFacade.cancel(context.git, context.root, record, { force });
		const task = readPlan(context).tasks.find((item) => item.id === record.taskId);
		return {
			...result,
			task: task ? {
				id: task.id,
				status: task.status
			} : null
		};
	});
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-executor.ts
/** The executor record of this checkout, or null outside an executor worktree. */
function executorAssignment(context) {
	return workflowAssignmentFacade.worktreeRecord(context.root);
}
/** HEAD is the `assignment-plan` commit of this assignment right on its base. */
function isPlanCommit(context, head, record) {
	const history = context.git.history(context.root, record.baseCommit, head);
	const [commit] = history;
	return history.length === 1 && commit?.parents[0] === record.baseCommit && commit.trailers["Workflow-Role"]?.[0] === "assignment-plan" && commit.trailers["Workflow-Assignment"]?.[0] === record.id;
}
function commitExecutorPlan(context, record) {
	const text = context.git.show(context.root, record.baseCommit, PLAN_PATH);
	ensure(text, "ASSIGNMENT_BASE", `The base commit ${record.baseCommit} has no plan.`);
	const plan = workflowAssignmentFacade.executorPlan(workflowPlanFacade.parse(text), record, context.now());
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
/**
* `assignment:attach <id>` in the executor worktree (spec 5.1, 5.3): verifies
* the linked worktree, base and clean tree, commits the executor plan and
* records the worktree in both places. A repeated call continues or returns
* the finished attachment.
*/
function attachAssignment(context, id) {
	return locked(context, () => {
		const location = workflowAssignmentFacade.locateWorktree(context.git, context.root);
		const record = workflowAssignmentFacade.read(location.mainRoot, id);
		ensure(record, "ASSIGNMENT_UNKNOWN", `The main checkout ${location.mainRoot} has no assignment ${id}.`, { mainRoot: location.mainRoot }, "Run the exact attach command of your brief.");
		const own = executorAssignment(context);
		ensure(own === null || own.id === id, "ASSIGNMENT_ATTACHED", `This worktree is already attached to ${own?.id}.`, { id: own?.id });
		const here = record.worktree !== null && workflowPlatformFacade.samePath(record.worktree, location.worktree);
		ensure(record.worktree === null || here, "ASSIGNMENT_ATTACHED", `${id} is attached to another worktree: ${record.worktree}.`, { worktree: record.worktree });
		if (own && here) return {
			assignment: record,
			attached: false,
			planCommit: null,
			worktree: own
		};
		ensure(record.status === "ASSIGNED" || here, "ASSIGNMENT_STATUS", `${id} is ${record.status}; only an ASSIGNED assignment is attached.`, { status: record.status });
		ensureNoTransaction(context);
		const dirty = context.git.changes(context.root).all;
		ensure(dirty.length === 0, "ASSIGNMENT_DIRTY", "The executor worktree must be clean before attaching.", { paths: dirty }, "Remove the changes, then repeat the attach command.");
		const head = requireHead(context);
		let planCommit = head;
		if (head === record.baseCommit) planCommit = commitExecutorPlan(context, record);
		else ensure(isPlanCommit(context, head, record), "ASSIGNMENT_BASE", `HEAD ${head} is not the base ${record.baseCommit} of ${id}.`, {
			base: record.baseCommit,
			head
		}, "The worktree must start at the main HEAD the assignment was created on.");
		const task = workflowPlanFacade.task(readPlan(context), record.taskId);
		const updated = {
			...record,
			branch: location.branch,
			status: workflowAssignmentFacade.needsSetup(context.root, task) ? "NEEDS_SETUP" : "READY",
			updatedAt: context.now(),
			worktree: location.worktree
		};
		workflowAssignmentFacade.write(location.mainRoot, updated);
		return {
			assignment: updated,
			attached: true,
			planCommit,
			worktree: workflowAssignmentFacade.writeWorktreeRecord(context.root, updated, location.mainRoot)
		};
	});
}
/** `assignment:status` in an executor worktree. */
function assignmentStatus(context) {
	const own = executorAssignment(context);
	ensure(own, "ASSIGNMENT_NOT_ATTACHED", "This checkout is not an attached executor worktree.", {}, "In main run `scripts/workflow assignment:next`; an executor runs `scripts/workflow assignment:attach <id>` first.");
	const plan = readPlan(context);
	const task = plan.tasks.find((item) => item.id === own.taskId);
	return {
		assignment: workflowAssignmentFacade.read(own.mainRoot, own.id),
		head: context.git.head(context.root),
		scopeId: plan.scope?.id ?? null,
		task: task ? {
			files: task.files,
			id: task.id,
			kind: task.kind,
			status: task.status,
			title: task.title
		} : null,
		worktree: own
	};
}
/**
* `assignment:setup [--id]` (spec 5.4): in an executor worktree for its own
* assignment, in main for `--id`. The install runs without the Kit lock: it
* may outlast the lock's stale limit and touches no plan or git state.
*/
function setupAssignment(context, id) {
	const own = executorAssignment(context);
	ensure(own === null || id === void 0 || id === own.id, "ASSIGNMENT_READ_ONLY", `This worktree sets up only its own assignment ${own?.id}.`, { id: own?.id });
	const target = own?.id ?? id;
	ensure(target, "USAGE", "--id is required outside an executor worktree.", {}, "Run scripts/workflow assignment:setup --id <id> in main, or without --id in the executor worktree.");
	const mainRoot = own?.mainRoot ?? context.root;
	const record = workflowAssignmentFacade.read(mainRoot, target);
	ensure(record, "ASSIGNMENT_UNKNOWN", `The main checkout ${mainRoot} has no assignment ${target}.`, { mainRoot });
	return workflowAssignmentFacade.setup(mainRoot, record, {
		env: context.env,
		now: context.now
	});
}
/** `task:start` in an executor worktree waits for `assignment:setup`. */
function ensureAssignmentReady(context) {
	const own = executorAssignment(context);
	ensure((own && workflowAssignmentFacade.read(own.mainRoot, own.id))?.status !== "NEEDS_SETUP", "ASSIGNMENT_NEEDS_SETUP", `The worktree of ${own?.id} lacks the dependencies its checks need.`, { id: own?.id }, "Run scripts/workflow assignment:setup, then repeat task:start.");
}
/** Updates the main record of this executor worktree; a no-op elsewhere. */
function markAssignment(context, status, sourceCommit) {
	const own = executorAssignment(context);
	const record = own && workflowAssignmentFacade.read(own.mainRoot, own.id);
	if (!(own && record)) return;
	workflowAssignmentFacade.write(own.mainRoot, {
		...record,
		sourceCommit: sourceCommit ?? record.sourceCommit,
		status,
		updatedAt: context.now()
	});
}
/** Contract guard of a commit candidate in an executor worktree (spec 5.3). */
function guardExecutorCommit(context, paths, candidatePlan) {
	if (!executorAssignment(context)) return;
	workflowAssignmentFacade.checkExecutorChange({
		candidatePlan,
		headPlan: context.git.show(context.root, "HEAD", PLAN_PATH),
		paths,
		planPath: PLAN_PATH
	});
}
/** The guard on the staged candidate of a prepared transaction (pre-commit). */
function guardExecutorCandidate(context, journal) {
	if (!executorAssignment(context)) return;
	guardExecutorCommit(context, context.git.git.run(context.root, [
		"diff",
		"--cached",
		"--name-only",
		"--no-renames",
		"-z",
		"HEAD"
	]).stdout.split("\0").filter(Boolean), journal.candidatePlan);
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-hooks.ts
var MANAGED_HINT = "Commit through the Workflow Kit: `scripts/workflow commit --task <ID>` or `scripts/workflow docs:commit`.";
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
	return files.map((file) => {
		const absolute = path.join(root, ...file.split("/"));
		return `${file}:${existsSync(absolute) ? createHash("sha256").update(readFileSync(absolute)).digest("hex") : "deleted"}`;
	}).join("\n");
}
function failedSummary(report) {
	return report.results.filter((item) => item.status !== "passed" && item.status !== "skipped").map((item) => `- ${item.id} ${item.status}${item.reason ? ` (${item.reason})` : ""}\n${item.output.slice(-1500)}`).join("\n");
}
/** The journal's task in its candidate plan, or null. */
function candidateTask(journal) {
	if (!journal.taskId) return null;
	try {
		return workflowPlanFacade.parse(journal.candidatePlan, { projection: false }).tasks.find((task) => task.id === journal.taskId) ?? null;
	} catch {
		return null;
	}
}
/**
* Commit-stage checks of the task run for `implementation` and for the
* integration of a work task; service commits, DOCS and QUALITY run only the
* documentation builtins.
*/
function isServiceCommit(journal, task) {
	if (journal.role === "integration") return task?.kind !== "work";
	return journal.role !== "implementation";
}
function preCommit(context) {
	const { git, root } = context;
	const journal = git.transactions.journal(root);
	if (!journal || journal.phase !== "PREPARED") return fail("MANAGED_COMMIT_REQUIRED", MANAGED_HINT);
	if (git.git.text(root, ["write-tree"]) !== journal.candidateTree) return fail("MANAGED_COMMIT_REQUIRED", "The index differs from the prepared candidate of the transaction.");
	if ((journal.sourceCommit ?? null) !== git.mergeHead(root)) return fail("MANAGED_COMMIT_REQUIRED", journal.sourceCommit ? "The integration commit needs the merge of its source in progress." : "A merge is in progress; only `scripts/workflow integration:continue` commits it.");
	guardExecutorCandidate(context, journal);
	const task = candidateTask(journal);
	const before = fingerprints(root, journal.selected);
	const report = workflowQualityFacade.runStage({
		assigned: journal.checks,
		config: workflowQualityFacade.readConfig(root),
		docsWaiver: task?.docsWaiver ?? null,
		env: context.env,
		files: journal.selected,
		root,
		service: isServiceCommit(journal, task),
		stage: "commit"
	});
	workflowQualityFacade.recordEvidence(root, journal.id, [report]);
	if (git.git.text(root, ["write-tree"]) !== journal.candidateTree || fingerprints(root, journal.selected) !== before) return fail("CHECK_MODIFIED_CANDIDATE", "A commit-stage check changed the candidate files; commit checks may only read. Move fixers to the prepare stage.");
	if (!report.ok) return fail("CHECK_FAILED", `Commit checks failed:\n${failedSummary(report)}`);
	return pass(`Workflow checks passed: ${report.results.map((item) => `${item.id} ${item.status}`).join(", ") || "none"}.`);
}
function commitMessage(context, args) {
	const journal = context.git.transactions.journal(context.root);
	const file = args[0] ? path.resolve(context.root, args[0]) : "";
	const message = file && existsSync(file) ? readFileSync(file, "utf8") : "";
	if (!(journal && message.includes(`Workflow-Transaction: ${journal.id}`))) return fail("MANAGED_COMMIT_REQUIRED", MANAGED_HINT);
	return pass();
}
/** The last round with finished work must have its DOCS task done. */
function pendingDocs(plan) {
	if (!plan) return null;
	const last = plan.rounds.filter((round) => plan.tasks.some((task) => task.roundId === round.id && task.kind !== "docs" && task.status === "DONE")).at(-1);
	if (!last || last.kind === "legacy") return null;
	const docs = plan.tasks.find((task) => task.roundId === last.id && task.kind === "docs");
	return docs && docs.status !== "DONE" ? docs.id : null;
}
function prePush(context) {
	const executor = executorAssignment(context);
	if (executor) return fail("ASSIGNMENT_READ_ONLY", `The executor worktree of ${executor.id} never pushes; report the commit SHA to the orchestrator.`);
	if (context.git.transactions.journal(context.root)) return fail("TRANSACTION_PENDING", "A commit transaction is unfinished; run `scripts/workflow repair`.");
	if (workflowIntegrationFacade.isActive(context.root)) return fail("INTEGRATION_ACTIVE", "An integration is unfinished; run `scripts/workflow integration:continue --id <assignment>`.");
	const docs = pendingDocs(workflowPlanFacade.read(context.root));
	if (docs) return fail("DOCS_PENDING", `Finish ${docs} (documentation and round digest) before pushing.`);
	const report = workflowQualityFacade.runStage({
		config: workflowQualityFacade.readConfig(context.root),
		env: context.env,
		root: context.root,
		stage: "push"
	});
	if (!report.ok) return fail("CHECK_FAILED", `Push checks failed:\n${failedSummary(report)}`);
	return pass(`Workflow push checks passed: ${report.results.map((item) => item.id).join(", ") || "none"}.`);
}
/** `git-hook <name>`: the managed git hooks of an installed project. */
function runGitHook(context, name, args) {
	try {
		switch (name) {
			case "pre-commit": return preCommit(context);
			case "commit-msg": return commitMessage(context, args);
			case "post-commit": return pass();
			case "pre-push": return prePush(context);
			default: return fail("UNKNOWN_HOOK", `Unknown git hook: ${name}`);
		}
	} catch (error) {
		const { code, message } = error;
		return fail(code ?? "HOOK_ERROR", message);
	}
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-integration.ts
function integration(context) {
	return new WorkflowIntegrationFacade(context.git);
}
/**
* `integration:start --id <assignment> --source <sha>` in main (spec 7),
* under the project lock: the preconditions, proof, merge, plan candidate,
* scope check and integration commit belong to `workflow-integration`.
*/
function startIntegration(context, assignmentId, source) {
	return locked(context, () => integration(context).start(context.root, {
		assignmentId,
		now: context.now,
		source
	}));
}
/** `integration:continue --id <assignment>`: finishes after a conflict, failed checks or a crash. */
function continueIntegration(context, assignmentId) {
	return locked(context, () => integration(context).continue(context.root, {
		assignmentId,
		now: context.now
	}));
}
/** `integration:status`, read-only. */
function integrationStatus(context) {
	return integration(context).status(context.root);
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-quality.ts
/** `quality:detect`: a proposal that changes nothing. */
function detectQuality(context, stacks) {
	return workflowQualityFacade.propose(context.root, {
		stacks,
		which: (name) => context.git.platform.findExecutable(name, context.env) !== null
	});
}
/**
* `quality:apply`: installs approved tools, writes the CONFIGURED profile and
* commits it with the files the installation changed. A QUALITY task in
* progress is completed by this commit.
*/
function applyQuality(context, input) {
	return locked(context, () => {
		ensureNoTransaction(context);
		const current = readPlan(context);
		const task = current.tasks.find((item) => item.id === current.currentTaskId && item.kind === "quality");
		const before = new Set(context.git.changes(context.root).all);
		const applied = workflowQualityFacade.applyProfile(context.root, input, context.env);
		const configPath = workflowQualityFacade.configPath;
		let files;
		if (task) files = [...context.git.selectTaskFiles(context.root, {
			iteration: task.iteration,
			scopeId: current.scope?.id ?? "NONE",
			taskId: task.id
		}).selected, configPath];
		else files = [...context.git.changes(context.root).all.filter((file) => !(before.has(file) || context.git.isKitManagedPath(file))), configPath];
		let plan = current;
		if (task) {
			plan = structuredClone(current);
			const own = workflowPlanFacade.task(plan, task.id);
			own.files = [.../* @__PURE__ */ new Set([...own.files, ...files])];
			plan = workflowPlanFacade.completeTask(plan, task.id);
		}
		return {
			commit: commitPlan(context, plan, {
				files,
				iteration: task?.iteration,
				message: task?.commitMessage ?? "chore: apply the project quality profile",
				role: "quality",
				scopeId: current.scope?.id ?? null,
				taskId: task?.id ?? null
			}),
			config: applied.config,
			installs: applied.installs
		};
	});
}
/** `quality:status`: the profile, its checks by stage and drift. */
function qualityStatus(context) {
	const config = workflowQualityFacade.readConfig(context.root);
	const checks = {};
	for (const check of config.quality.checks) checks[check.stage] = [...checks[check.stage] ?? [], check.id];
	return {
		checks,
		drift: workflowQualityFacade.drift(context.root, config),
		stacks: config.quality.stacks,
		status: config.quality.status
	};
}
/** `repair`: dry run, `--apply <id>` or `--cancel <id>`. */
function repair(context, options = {}) {
	return locked(context, () => {
		if (options.apply) return context.git.applyRepair(context.root, PLAN_PATH, options.apply);
		if (options.cancel) return context.git.cancelRepair(context.root, PLAN_PATH, options.cancel);
		return context.git.planRepair(context.root, PLAN_PATH);
	});
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-scope.ts
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
function transition(context) {
	return {
		baselineCommit: requireHead(context),
		now: context.now(),
		qualityConfigured: readConfig(context).quality.status === "CONFIGURED"
	};
}
/**
* CHECK_UNKNOWN before anything is written: `checks` of the input tasks are
* quality check ids (`workflowQualityFacade.ensurePlannedChecks`), refusals
* name the input field `tasks[<index>].checks`.
*/
function ensureInputChecks(context, tasks) {
	workflowQualityFacade.ensurePlannedChecks(readConfig(context), (tasks ?? []).map((task, index) => ({
		checks: task.checks ?? [],
		field: `tasks[${index}].checks`,
		taskId: task.id ?? null
	})));
}
function change(plan, commit) {
	return {
		commit,
		revision: plan.revision,
		scopeId: plan.scope?.id ?? null
	};
}
/** Creates and commits the scope; every creation path clears the proposal. */
function commitScope(context, input) {
	ensureNoTransaction(context);
	const plan = workflowPlanFacade.createScope(readPlan(context), input, transition(context));
	ensureInputChecks(context, input.tasks);
	ensureContextBudget(context, plan, plan.tasks);
	const commit = commitPlan(context, plan, {
		files: changedDocuments(context, [input.spec, ...(input.context ?? []).map((ref) => ref.path)]),
		message: `docs: plan scope ${input.id}`,
		role: "scope-plan",
		scopeId: input.id,
		taskId: null
	});
	workflowExecutionModeFacade.clear(context.root);
	return change(plan, commit);
}
/**
* `scope:create`: records the agreed scope and commits it with its
* documents. A Harness-hosted project chooses the mode through
* `scope:propose` instead (`EXECUTION_MODE_REQUIRED`).
*/
function createScope(context, input) {
	return locked(context, () => {
		ensure(readConfig(context).host !== "harness", "EXECUTION_MODE_REQUIRED", "In a Harness project the user chooses the execution mode; propose the scope instead of creating it.", {}, "Run `scripts/workflow scope:propose --input <file.json> --recommended sequential|orchestrated --reason \"<why>\"` and end the turn.");
		return commitScope(context, input);
	});
}
/** The scope input with the chosen strategy; `maxWorkers` comes from the input or the default. */
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
/**
* `scope:propose`: validates the plan exactly like `scope:create` without
* creating it and stores the proposal for the user's choice. After a
* "refine" answer, a new proposal without parallel work creates the
* sequential scope at once (`autoChosen`).
*/
function proposeScope(context, request) {
	return locked(context, () => {
		ensureNoTransaction(context);
		const candidate = workflowPlanFacade.createScope(readPlan(context), withExecution(request.input, request.recommended, null, null), transition(context));
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
		if (workflowExecutionModeFacade.readProposal(context.root)?.refining === true && !proposal.hasParallelWork) {
			const scope = commitScope(context, withExecution(request.input, "sequential", null, "Execution mode chosen automatically: sequential (no parallel work after the specification was refined)"));
			return {
				...answer,
				autoChosen: true,
				scope
			};
		}
		workflowExecutionModeFacade.writeProposal(context.root, proposal);
		return {
			...answer,
			autoChosen: false,
			scope: null
		};
	});
}
/**
* `scope:choose`: records the user's answer to the current proposal.
* `sequential`/`orchestrated` create the scope from the stored plan,
* `refine` drops the plan and keeps the cycle in refinement. A stale
* choice fails with PROPOSAL_CHANGED before anything is written.
*/
function chooseScope(context, request) {
	return locked(context, () => {
		ensureNoTransaction(context);
		const choice = {
			...request,
			now: context.now()
		};
		const proposal = workflowExecutionModeFacade.verifyChoice(context.root, choice);
		if (request.option === "refine") {
			workflowExecutionModeFacade.refine(context.root, proposal, choice);
			return {
				execution: null,
				generation: proposal.generation,
				option: "refine",
				refining: true,
				scope: null
			};
		}
		const scope = commitScope(context, withExecution(proposal.input, request.option, request.session.trim(), `Execution mode chosen by the user: ${request.option}: ${request.note.trim()}`));
		return {
			execution: workflowPlanFacade.execution(readPlan(context)),
			generation: proposal.generation,
			option: request.option,
			refining: false,
			scope
		};
	});
}
/** `plan:extend`: adds tasks to the open round or a new round. */
function extendScope(context, input, expectedRevision) {
	return locked(context, () => {
		ensureNoTransaction(context);
		const current = readPlan(context);
		ensureRevision(current, expectedRevision);
		const result = workflowPlanFacade.extend(current, input, transition(context));
		ensureInputChecks(context, input.tasks);
		ensureContextBudget(context, result.plan, changedContextTasks(current, result.plan));
		const commit = commitPlan(context, result.plan, {
			files: [],
			message: `docs: extend scope ${current.scope?.id ?? "NONE"} (${result.roundId})`,
			role: "scope-plan",
			scopeId: current.scope?.id ?? null,
			taskId: null
		});
		return {
			...change(result.plan, commit),
			deferredDocsTaskId: result.deferredDocsTaskId,
			roundId: result.roundId
		};
	});
}
/** `task:update`: edits a task that is not done. */
function updateTask(context, taskId, patch, expectedRevision) {
	return locked(context, () => {
		ensureNoTransaction(context);
		const current = readPlan(context);
		ensureRevision(current, expectedRevision);
		const original = workflowPlanFacade.task(current, taskId);
		const fields = Object.keys(patch);
		ensure(fields.length > 0 && fields.every((field) => PATCH_FIELDS.has(field)), "TASK_PATCH", `task:update changes only: ${[...PATCH_FIELDS].join(", ")}.`);
		ensure(original.status === "TODO" || original.status === "IN_PROGRESS" && fields.every((field) => IN_PROGRESS_FIELDS.has(field)), "TASK_PATCH", original.status === "DONE" ? "A DONE task never changes; extend the plan with a fix task." : `A task in progress changes only: ${[...IN_PROGRESS_FIELDS].join(", ")}.`);
		const plan = structuredClone(current);
		plan.revision += 1;
		Object.assign(workflowPlanFacade.task(plan, taskId), structuredClone(patch));
		workflowPlanFacade.validate(plan);
		if (patch.checks !== void 0) workflowQualityFacade.ensurePlannedChecks(readConfig(context), [{
			checks: patch.checks,
			field: "checks",
			taskId
		}]);
		ensureContextBudget(context, plan, [workflowPlanFacade.task(plan, taskId)]);
		return change(plan, commitPlan(context, plan, {
			files: [],
			message: `docs: update task ${taskId}`,
			role: "scope-plan",
			scopeId: plan.scope?.id ?? null,
			taskId: null
		}));
	});
}
/** `accept`: records the user's acceptance; the scope stays open. */
function acceptScope(context, note) {
	return locked(context, () => {
		ensureNoTransaction(context);
		const plan = workflowPlanFacade.accept(readPlan(context), note, context.now());
		return change(plan, commitPlan(context, plan, {
			files: [],
			message: `chore: accept scope ${plan.scope?.id ?? "NONE"}`,
			role: "acceptance",
			scopeId: plan.scope?.id ?? null,
			taskId: null
		}));
	});
}
/** `close`: only from ACCEPTED, on a clean tree, by a direct user command. */
function closeScope(context, scopeId, note) {
	return locked(context, () => {
		ensureNoTransaction(context);
		const dirty = context.git.changes(context.root).all.filter((file) => !context.git.isKitManagedPath(file));
		ensure(dirty.length === 0, "DIRTY_TREE", "Close the scope on a clean working tree.", { paths: dirty });
		const plan = workflowPlanFacade.close(readPlan(context), scopeId, note, context.now());
		const commit = commitPlan(context, plan, {
			files: [],
			message: `chore: close scope ${scopeId}`,
			role: "close",
			scopeId,
			taskId: null
		});
		workflowExecutionModeFacade.clear(context.root);
		return change(plan, commit);
	});
}
/** `carryover`: moves unfinished tasks into a new scope. */
function carryoverScope(context, input) {
	return locked(context, () => {
		ensureNoTransaction(context);
		const plan = workflowPlanFacade.carryover(readPlan(context), input, transition(context));
		return change(plan, commitPlan(context, plan, {
			files: [],
			message: `chore: carry over into scope ${input.id}`,
			role: "carryover",
			scopeId: input.id,
			taskId: null
		}));
	});
}
/** `task:block` / `task:unblock`: the next Kit commit records the state. */
function setBlocked(context, reason) {
	return locked(context, () => {
		ensureNoIntegration(context);
		const current = readPlan(context);
		const plan = reason === null ? workflowPlanFacade.unblock(current) : workflowPlanFacade.block(current, reason);
		savePlan(context, plan);
		return change(plan, null);
	});
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-status.ts
function brief(task) {
	return task ? {
		id: task.id,
		kind: task.kind,
		roundId: task.roundId,
		status: task.status,
		title: task.title
	} : null;
}
function statusTask(task) {
	return {
		dependencies: [...task.dependencies],
		id: task.id,
		kind: task.kind,
		parallelSafe: task.parallelSafe === true,
		roundId: task.roundId,
		status: task.status,
		title: task.title
	};
}
function textOrNull(value) {
	return typeof value === "string" ? value : null;
}
/** Reads the integration journal defensively: its writer owns the format. */
function integrationOf(context) {
	const text = workflowPlatformFacade.readTextIfExists(context.git.localPath(context.root, INTEGRATION_FILE));
	if (text === null) return null;
	let journal = {};
	try {
		const parsed = JSON.parse(text);
		journal = parsed && typeof parsed === "object" ? parsed : {};
	} catch {}
	return {
		assignmentId: textOrNull(journal.assignmentId),
		phase: textOrNull(journal.phase),
		taskId: textOrNull(journal.taskId)
	};
}
function assignmentsOf(context, plan) {
	const scopeId = plan?.scope?.id;
	if (!scopeId) return [];
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
/** Project status for the CLI, Core and the interface. */
function readStatus(context) {
	const plan = workflowPlanFacade.read(context.root);
	const config = workflowQualityFacade.readConfig(context.root);
	const repository = context.git.isRepository(context.root);
	const changes = repository ? context.git.changes(context.root).all.filter((file) => !context.git.isKitManagedPath(file)) : [];
	const tasks = plan?.tasks ?? [];
	const own = executorAssignment(context);
	return {
		assignments: own ? [] : assignmentsOf(context, plan),
		changes,
		currentTask: brief(tasks.find((task) => task.id === plan?.currentTaskId)),
		execution: plan?.scope ? workflowPlanFacade.execution(plan) : null,
		executor: own ? {
			assignmentId: own.id,
			taskId: own.taskId
		} : null,
		head: repository ? context.git.head(context.root) : null,
		installed: plan !== null,
		integration: own ? null : integrationOf(context),
		nextTask: plan ? brief(workflowPlanFacade.nextTask(plan)) : null,
		paused: readPause(context).paused,
		progress: {
			done: tasks.filter((task) => task.status === "DONE").length,
			total: tasks.length
		},
		project: plan ? {
			id: plan.projectId,
			name: plan.projectName
		} : null,
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
/**
* What the orchestrator of an orchestrated scope may act on (spec 10.3):
* the active and pending-cleanup assignments, the integration and the tasks
* the scheduler hands out now. Null in a sequential scope and outside main.
*/
function orchestrationOf(context, status) {
	if (status.execution?.strategy !== "orchestrated" || status.executor) return null;
	const plan = workflowPlanFacade.read(context.root);
	if (!plan) return null;
	const schedule = workflowAssignmentFacade.schedule(plan, activeRecords(plan, context.root));
	return {
		assignments: status.assignments.filter((item) => item.status !== "INTEGRATED" || item.cleanup?.status === "PENDING").map(({ id, sourceCommit, status: state, taskId }) => ({
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
/** The status shape the autopilot decision reads. */
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
	} catch (error) {
		const { code, message } = error;
		errors.push({
			code: code ?? "ERROR",
			message
		});
		return false;
	}
}
/** `validate`: plan document, plan rules and the task-to-commit mapping. */
function validateProject(context) {
	const errors = [];
	let plan = null;
	collect(errors, () => {
		plan = workflowPlanFacade.read(context.root);
	});
	collect(errors, () => workflowQualityFacade.readConfig(context.root));
	if (plan) {
		const current = plan;
		collect(errors, () => context.git.resolveReferences(context.root, current, PLAN_PATH));
	} else if (errors.length === 0) errors.push({
		code: "NOT_INSTALLED",
		message: `${PLAN_PATH} does not exist.`
	});
	return {
		errors,
		ok: errors.length === 0
	};
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/kit-task.ts
function briefOf(task) {
	const { id, kind, roundId, status, title } = task;
	return {
		id,
		kind,
		roundId,
		status,
		title
	};
}
function hasCommitChecks(config) {
	return config.quality.checks.some((check) => check.stage === "commit" && check.command);
}
/**
* Main checkout of an orchestrated scope (spec 6): work and DOCS run only
* through assignments; delivery waits for every earlier task and for the
* last active assignment. QUALITY starts here; sequential scopes are free.
*/
function ensureMainMayStart(context, plan, task) {
	if (workflowPlanFacade.execution(plan).strategy !== "orchestrated") return;
	ensure(task.kind !== "work" && task.kind !== "docs", "ORCHESTRATED_MAIN_READ_ONLY", `${task.id} runs only through an assignment in an orchestrated scope.`, {}, `Run \`scripts/workflow assignment:next\`, then \`scripts/workflow assignment:create --task ${task.id}\`.`);
	if (task.kind !== "delivery") return;
	const index = plan.tasks.indexOf(task);
	const pending = plan.tasks.filter((item, position) => position < index && item.status !== "DONE").map((item) => item.id);
	const active = activeRecords(plan, context.root).map((record) => record.id);
	ensure(pending.length === 0 && active.length === 0, "DELIVERY_NOT_READY", `${task.id} starts when every earlier task is DONE and no assignment is active.`, {
		active,
		pending
	});
}
/** `task:start`: checks, snapshot of earlier changes, IN_PROGRESS. */
function startTask(context, taskId, confirmation) {
	return locked(context, () => {
		ensureNoTransaction(context);
		ensureNotPaused(context);
		const current = readPlan(context);
		const config = readConfig(context);
		const task = workflowPlanFacade.task(current, taskId);
		ensureMainMayStart(context, current, task);
		ensureAssignmentReady(context);
		workflowQualityFacade.selectChecks({
			assigned: task.checks,
			config,
			root: context.root,
			stage: "commit"
		});
		const plan = workflowPlanFacade.startTask(current, taskId, confirmation);
		const baseline = context.git.beginTask(context.root, {
			iteration: task.iteration,
			scopeId: plan.scope?.id ?? "NONE",
			taskId
		});
		savePlan(context, plan);
		markAssignment(context, "RUNNING");
		const warnings = [];
		const limit = config.policy.taskFileSoftLimit;
		const functional = task.files.filter((file) => !isDocumentationPath(file));
		if (limit !== null && functional.length > limit) warnings.push(`The task lists ${functional.length} functional files (soft limit ${limit}); consider splitting it.`);
		return {
			preexisting: baseline.preexisting,
			task: briefOf(workflowPlanFacade.task(plan, taskId)),
			warnings
		};
	});
}
/** Adds the prepare-stage report to the evidence of a finished commit. */
function storePrepareEvidence(context, sha, prepare) {
	const stored = workflowQualityFacade.readEvidence(context.root, sha);
	const evidence = {
		commit: sha,
		reports: [prepare, ...stored?.reports ?? []],
		transaction: stored?.transaction ?? null
	};
	const text = `${JSON.stringify(evidence, null, 2)}\n`;
	for (const name of [`${sha}.json`, "last.json"]) workflowPlatformFacade.writeFileAtomic(context.git.localPath(context.root, "verification", name), text);
}
function runPrepare(context, config, task, files) {
	if (!config.quality.checks.some((check) => check.stage === "prepare")) return null;
	const report = workflowQualityFacade.runStage({
		assigned: task.checks,
		config,
		env: context.env,
		files,
		root: context.root,
		stage: "prepare"
	});
	if (!report.ok) throw new WorkflowError("CHECK_FAILED", "A prepare check failed; nothing was committed.", { report }, "Fix the reported problem and repeat the same command.");
	return report;
}
/** `commit --task`: one task, one transactional commit. */
function commitTask(context, taskId, options = {}) {
	return locked(context, () => {
		ensureNoTransaction(context);
		const current = readPlan(context);
		const config = readConfig(context);
		const task = workflowPlanFacade.task(current, taskId);
		ensure(task.status === "IN_PROGRESS", "TASK_NOT_ACTIVE", `Start the task first: task:start ${taskId}`);
		ensure(task.kind !== "quality", "USE_QUALITY_APPLY", "The QUALITY task is completed by `quality:apply`.");
		ensure(task.kind !== "docs" || Boolean(options.digest), "ROUND_DIGEST_REQUIRED", `${taskId} closes its round: pass the round digest with --digest <file.json>.`);
		const identity = {
			iteration: task.iteration,
			scopeId: current.scope?.id ?? "NONE",
			taskId
		};
		const selection = context.git.selectTaskFiles(context.root, identity, options.files);
		const functional = selection.selected.filter((file) => !isDocumentationPath(file));
		ensure(functional.length === 0 || hasCommitChecks(config), "NOT_CONFIGURED", "Functional files need at least one commit-stage check in the quality profile.", { files: functional }, "Configure the profile with `quality:apply`.");
		const withFiles = structuredClone(current);
		const own = workflowPlanFacade.task(withFiles, taskId);
		own.files = [.../* @__PURE__ */ new Set([...own.files, ...selection.selected])];
		const plan = workflowPlanFacade.completeTask(withFiles, taskId, options.digest ?? null);
		guardExecutorCommit(context, [...selection.selected, PLAN_PATH], workflowPlanFacade.render(plan));
		const prepare = runPrepare(context, config, task, selection.selected);
		const commit = commitPlan(context, plan, {
			assignmentId: executorAssignment(context)?.id ?? null,
			checks: task.checks,
			excluded: selection.excluded,
			files: selection.selected,
			iteration: task.iteration,
			message: task.commitMessage,
			role: task.kind === "docs" ? "docs" : "implementation",
			scopeId: current.scope?.id ?? null,
			taskId
		});
		if (prepare) storePrepareEvidence(context, commit.sha, prepare);
		markAssignment(context, "READY_FOR_INTEGRATION", commit.sha);
		return {
			commit,
			nextTask: readStatus(context).nextTask,
			preexisting: selection.preexisting,
			prepare
		};
	});
}
/** `docs:commit`: documentation outside a task, with no scope or between tasks. */
function commitDocs(context, files, message = "docs: update documentation") {
	return locked(context, () => {
		ensureNoTransaction(context);
		const plan = readPlan(context);
		ensure(plan.currentTaskId === null, "TASK_IN_PROGRESS", `Task ${plan.currentTaskId} is in progress; its documents go into its commit.`);
		const paths = files.map((file) => workflowPlatformFacade.normalizeRelative(file));
		const code = paths.filter((file) => !isDocumentationPath(file));
		ensure(paths.length > 0 && code.length === 0, "DOCS_ONLY", "docs:commit takes documentation only: Markdown files and .harness/product-tree/**.", { paths: code });
		return commitPlan(context, plan, {
			files: paths,
			message,
			role: "docs",
			scopeId: plan.scope?.id ?? null,
			taskId: null
		});
	});
}
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-facade.ts
/**
* Cluster facade of `core-runtime/clusters/project-workflow`: every process
* operation of the Workflow Kit on one project root.
*/
var WorkflowKitFacade = class {
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
		return {
			env: this.env,
			git: this.git,
			now: this.now,
			root
		};
	}
	/** `inspect <path>`: folder state and the action to offer. */
	inspect(folder) {
		return this.installer.inspect(folder);
	}
	/** `doctor [--fix]`: project health; fixes only fixable findings. */
	doctor(folder, options = {}) {
		return this.installer.doctor(folder, {
			env: this.env,
			...options
		});
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
	/** `pause:set --on|--off --note`: the user's pause of the workflow. */
	setPause(root, paused, note) {
		return setPause(this.context(root), paused, note);
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
	sessionStart(root, client, stdin) {
		return this.recovery.sessionStart(root, {
			client,
			env: this.env,
			stdin
		});
	}
	createScope(root, input) {
		return createScope(this.context(root), input);
	}
	/** `scope:propose`: validates the plan and stores the proposal of the mode card. */
	proposeScope(root, input, recommended, reason) {
		return proposeScope(this.context(root), {
			input,
			reason,
			recommended
		});
	}
	/** `scope:choose`: the user's answer to the proposal of `generation`. */
	chooseScope(root, choice) {
		return chooseScope(this.context(root), choice);
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
		if (!proposal) return null;
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
		return setupAssignment(this.context(root), id);
	}
	/** `assignment:cleanup [--id]` in main: worktree and branch removal after integration. */
	cleanupAssignments(root, id) {
		return cleanupAssignments(this.context(root), id);
	}
	/** `assignment:cancel --id [--force]` in main: drops a stuck assignment; the task stays TODO. */
	cancelAssignment(root, id, force = false) {
		return cancelAssignment(this.context(root), id, force);
	}
	/** `integration:start --id --source` in main: merge, plan candidate and integration commit. */
	startIntegration(root, assignmentId, source) {
		return startIntegration(this.context(root), assignmentId, source);
	}
	/** `integration:continue --id`: finishes an unfinished integration. */
	continueIntegration(root, assignmentId) {
		return continueIntegration(this.context(root), assignmentId);
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
		return acceptScope(this.context(root), note);
	}
	close(root, scopeId, note) {
		return closeScope(this.context(root), scopeId, note);
	}
	carryover(root, input) {
		return carryoverScope(this.context(root), input);
	}
	block(root, reason) {
		return setBlocked(this.context(root), reason);
	}
	unblock(root) {
		return setBlocked(this.context(root), null);
	}
	startTask(root, taskId, confirmation = null) {
		return startTask(this.context(root), taskId, confirmation);
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
new WorkflowKitFacade();
//#endregion
//#region product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-cli.ts
var EVENTS = /* @__PURE__ */ new Set([
	"startup",
	"resume",
	"clear",
	"compact"
]);
function resolvePath(io, value) {
	return path.resolve(io.cwd, value ?? ".");
}
/** The bundle to install (this file unless `--bundle`) and the running runtime. */
function ownBundle(args, io) {
	return {
		bundle: readFileSync(resolvePath(io, flag(args, "bundle") ?? fileURLToPath(import.meta.url)), "utf8"),
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
	"autopilot:status": {
		run: ({ kit, root }) => kit.autopilotStatus(root),
		usage: "autopilot:status"
	},
	accept: {
		run: ({ args, kit, root }) => kit.accept(root, requiredFlag(args, "note")),
		usage: "accept --note \"<the user's words>\""
	},
	carryover: {
		run: ({ args, io, kit, root }) => kit.carryover(root, readJsonFile(io.cwd, requiredFlag(args, "input"))),
		usage: "carryover --input <file.json>"
	},
	close: {
		run: ({ args, kit, root }) => kit.close(root, requiredFlag(args, "scope"), requiredFlag(args, "note")),
		usage: "close --scope <id> --note \"<direct user command>\""
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
			if (!files) throw new WorkflowError("USAGE", "--files is required.");
			return kit.commitDocs(root, files, flag(args, "message"));
		},
		usage: "docs:commit --files <json|a,b> [--message \"docs: ...\"]"
	},
	inspect: {
		run: ({ args, io, kit }) => kit.inspect(resolvePath(io, args.positionals[0])),
		usage: "inspect [<path>]"
	},
	doctor: {
		run: ({ args, io, kit }) => kit.doctor(resolvePath(io, args.positionals[0]), { fix: args.flags.get("fix") === true ? ownBundle(args, io) : null }),
		usage: "doctor [<path>] [--fix] [--bundle <workflow.mjs>]"
	},
	install: {
		run: ({ args, io, kit }) => kit.install(resolvePath(io, args.positionals[0]), {
			...ownBundle(args, io),
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
		usage: "migrate:harness-plan [<path>] [--message \"chore: ...\"] [--objective \"...\"] [--spec <doc.md>] [--name <project name>]"
	},
	"plan:extend": {
		run: ({ args, io, kit, root }) => kit.extend(root, readJsonFile(io.cwd, requiredFlag(args, "input")), integerFlag(args, "expected-revision")),
		usage: "plan:extend --input <file.json> [--expected-revision N]"
	},
	"quality:apply": {
		run: ({ args, io, kit, root }) => kit.qualityApply(root, readJsonFile(io.cwd, requiredFlag(args, "input"))),
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
			if (!EVENTS.has(event)) throw new WorkflowError("USAGE", "--event is startup, resume, clear or compact.");
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
	"scope:create": {
		run: ({ args, io, kit, root }) => kit.createScope(root, readJsonFile(io.cwd, requiredFlag(args, "input"))),
		usage: "scope:create --input <file.json>"
	},
	"show-task": {
		run: ({ args, kit, root }) => ({ text: kit.showTask(root, positional(args, 0, "Task id")) }),
		usage: "show-task <ID>"
	},
	status: {
		run: ({ kit, root }) => kit.status(root),
		usage: "status"
	},
	"task:block": {
		run: ({ args, kit, root }) => kit.block(root, requiredFlag(args, "reason")),
		usage: "task:block --reason \"<text>\""
	},
	"task:start": {
		run: ({ args, kit, root }) => kit.startTask(root, positional(args, 0, "Task id"), flag(args, "confirmed") ?? null),
		usage: "task:start <ID> [--confirmed \"<user confirmation>\"]"
	},
	"task:unblock": {
		run: ({ kit, root }) => kit.unblock(root),
		usage: "task:unblock"
	},
	"task:update": {
		run: ({ args, io, kit, root }) => kit.updateTask(root, positional(args, 0, "Task id"), readJsonFile(io.cwd, requiredFlag(args, "input")), integerFlag(args, "expected-revision")),
		usage: "task:update <ID> --input <patch.json> [--expected-revision N]"
	},
	validate: {
		run: ({ kit, root }) => kit.validate(root),
		usage: "validate"
	}
};
function helpText() {
	return [
		"Workflow Kit — the project development process.",
		"",
		"Usage:",
		...Object.entries(COMMANDS).sort(([left], [right]) => left.localeCompare(right)).map(([, spec]) => `  scripts/workflow ${spec.usage}`),
		"  scripts/workflow hook session-start --client claude|codex",
		"  scripts/workflow git-hook <pre-commit|commit-msg|post-commit|pre-push> [args]",
		"",
		"Options: --format json|text (default json; text for context), --root <project>.",
		"Errors: {\"ok\":false,\"code\",\"message\",\"nextAction\"} and exit code 1.",
		""
	].join("\n");
}
function projectRoot(args, io, kit) {
	const explicit = flag(args, "root") ?? io.env.HARNESS_WORKFLOW_ROOT;
	if (explicit) return explicit;
	return kit.git.isRepository(io.cwd) ? kit.git.topLevel(io.cwd) : io.cwd;
}
function errorEnvelope(error) {
	if (error instanceof WorkflowError) return {
		code: error.code,
		details: error.details,
		message: error.message,
		nextAction: error.nextAction ?? null,
		ok: false
	};
	return {
		code: "INTERNAL",
		message: error?.message ?? String(error),
		nextAction: null,
		ok: false
	};
}
function runHook(args, io, kit, root) {
	if (args.command === "hook") {
		const client = flag(args, "client");
		if (positional(args, 0, "Hook name") !== "session-start" || client !== "claude" && client !== "codex") throw new WorkflowError("USAGE", "hook session-start --client claude|codex");
		io.stdout(kit.sessionStart(root, client, io.readStdin()));
		return 0;
	}
	const result = kit.gitHook(root, positional(args, 0, "Hook name"), args.positionals.slice(1));
	if (result.message) io.stderr(`${result.message}\n`);
	return result.exitCode;
}
function dispatch(args, io, kit, format) {
	const command = args.command ?? "help";
	const root = projectRoot(args, io, kit);
	if (command === "hook" || command === "git-hook") return runHook(args, io, kit, root);
	const spec = COMMANDS[command];
	if (!spec) throw new WorkflowError("UNKNOWN_COMMAND", `Unknown command: ${command}`, {}, "Run `scripts/workflow help`.");
	ensureExecutorCommand(kit, root, command);
	const result = spec.run({
		args,
		io,
		kit,
		root
	});
	let text = `${JSON.stringify({
		command,
		ok: true,
		result
	}, null, 2)}\n`;
	if (format === "text") text = spec.text ? spec.text(result) : renderText(command, result);
	io.stdout(text);
	return 0;
}
function writeFailure(io, error, format) {
	const envelope = errorEnvelope(error);
	if (format === "text") io.stderr(`${envelope.code}: ${envelope.message}${envelope.nextAction ? `\nNext: ${envelope.nextAction}` : ""}\n`);
	else io.stdout(`${JSON.stringify(envelope, null, 2)}\n`);
}
/** Runs one Kit command; returns the process exit code. */
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
	} catch (error) {
		writeFailure(io, error, format);
		return 1;
	}
}
function readProcessStdin() {
	if (process.stdin.isTTY) return "";
	try {
		return readFileSync(0, "utf8");
	} catch {
		return "";
	}
}
function invokedDirectly() {
	const entry = process.argv[1];
	if (!entry) return false;
	try {
		return pathToFileURL(realpathSync(entry)).href === import.meta.url;
	} catch {
		return false;
	}
}
if (invokedDirectly()) process.exitCode = runCli(process.argv.slice(2), {
	cwd: process.cwd(),
	env: process.env,
	readStdin: readProcessStdin,
	stderr: (text) => process.stderr.write(text),
	stdout: (text) => process.stdout.write(text)
});
//#endregion
export { runCli };
