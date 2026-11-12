import {
  type AtomicWriteOptions,
  atomicWriteFile,
  type FileLockOptions,
  readTextIfExists,
  withFileLock,
} from "./platform-fs.js";
import {
  cmdLauncher,
  posixLauncher,
  powershellLauncher,
} from "./platform-launchers.js";
import {
  currentWorkflowPlatform,
  isWithin,
  normalizeRelativePath,
  relativeFromRoot,
  resolveInside,
  samePath,
  toPosixPath,
  type WorkflowPlatform,
} from "./platform-paths.js";
import {
  buildInvocation,
  type ProcessInvocation,
  type ProcessRequest,
  type ProcessResult,
  resolveExecutable,
  runProcessAsync,
  runProcessSync,
} from "./platform-process.js";
import {
  formatRuntimeFile,
  parseRuntimeFile,
  probeRuntimeVersion,
  type RuntimeMode,
  type RuntimeProbe,
  resolveRuntime,
  runtimeCandidates,
  runtimeEnvironment,
  type WorkflowRuntime,
} from "./platform-runtime.js";

export { KIT_BUNDLE_PATH } from "./platform-launchers.js";
export type { ProcessRequest, ProcessResult } from "./platform-process.js";
export type { RuntimeMode, WorkflowRuntime } from "./platform-runtime.js";
export { RUNTIME_FILE } from "./platform-runtime.js";

export interface ProjectLaunchers {
  cmd: string;
  posix: string;
  powershell: string;
}

export { WorkflowLockError } from "./platform-fs.js";
export { WorkflowPathError, type WorkflowPlatform } from "./platform-paths.js";
export {
  ensure,
  WorkflowError,
  type WorkflowErrorDetails,
} from "./workflow-error.js";

/**
 * Public boundary of the workflow-platform module: OS-neutral paths, atomic
 * files and locks. Every other project-workflow module reaches the
 * filesystem and processes through this facade.
 */
export class WorkflowPlatformFacade {
  readonly platform: WorkflowPlatform;

  constructor(platform: WorkflowPlatform = currentWorkflowPlatform()) {
    this.platform = platform;
  }

  toPosix(value: string): string {
    return toPosixPath(value);
  }

  normalizeRelative(value: string): string {
    return normalizeRelativePath(value);
  }

  resolveInside(root: string, relativePath: string): string {
    return resolveInside(root, relativePath);
  }

  relativeFromRoot(root: string, absolutePath: string): string {
    return relativeFromRoot(root, absolutePath);
  }

  samePath(left: string, right: string): boolean {
    return samePath(left, right, this.platform);
  }

  isWithin(relativePath: string, prefix: string): boolean {
    return isWithin(relativePath, prefix);
  }

  writeFileAtomic(
    filePath: string,
    data: string | Uint8Array,
    options?: AtomicWriteOptions
  ): void {
    atomicWriteFile(filePath, data, options);
  }

  readTextIfExists(filePath: string): string | null {
    return readTextIfExists(filePath);
  }

  withLock<T>(lockPath: string, fn: () => T, options?: FileLockOptions): T {
    return withFileLock(lockPath, fn, options);
  }

  findExecutable(
    name: string,
    env: NodeJS.ProcessEnv = process.env
  ): string | null {
    return resolveExecutable(name, env, this.platform);
  }

  /** Exposes the spawn plan (file, args, verbatim flag) for diagnostics and tests. */
  describeInvocation(
    resolvedExecutable: string,
    args: readonly string[]
  ): ProcessInvocation {
    return buildInvocation(resolvedExecutable, args, this.platform);
  }

  run(request: ProcessRequest): ProcessResult {
    return runProcessSync(request, this.platform);
  }

  runAsync(request: ProcessRequest): Promise<ProcessResult> {
    return runProcessAsync(request, this.platform);
  }

  /** Resolves a Node 22+ runtime for a project; `probe` is injectable for tests. */
  resolveRuntime(
    projectRoot: string | null,
    env: NodeJS.ProcessEnv = process.env,
    probe?: RuntimeProbe
  ): WorkflowRuntime | null {
    const check =
      probe ?? ((candidate) => probeRuntimeVersion(candidate, this.platform));
    return resolveRuntime(
      runtimeCandidates(projectRoot, env, this.platform),
      check
    );
  }

  runtimeEnvironment(
    mode: RuntimeMode,
    base: NodeJS.ProcessEnv = process.env
  ): NodeJS.ProcessEnv {
    return runtimeEnvironment(mode, base);
  }

  formatRuntimeFile(executable: string, mode: RuntimeMode): string {
    return formatRuntimeFile(executable, mode);
  }

  parseRuntimeFile(
    text: string
  ): { executable: string; mode: RuntimeMode } | null {
    return parseRuntimeFile(text);
  }

  launchers(): ProjectLaunchers {
    return {
      cmd: cmdLauncher(),
      posix: posixLauncher(),
      powershell: powershellLauncher(),
    };
  }
}

export const workflowPlatformFacade = new WorkflowPlatformFacade();
