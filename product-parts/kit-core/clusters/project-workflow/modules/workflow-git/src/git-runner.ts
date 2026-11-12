import {
  ensure,
  type WorkflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";

export interface GitOptions {
  allowFailure?: boolean;
  /** Variables layered over the runner environment for this call only. */
  env?: NodeJS.ProcessEnv;
  input?: string;
  timeoutMs?: number;
}

export interface GitOutput {
  status: number;
  stderr: string;
  stdout: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;

/** Thin synchronous git runner bound to one environment. */
export class GitRunner {
  private readonly env: NodeJS.ProcessEnv;
  private readonly platform: WorkflowPlatformFacade;

  constructor(platform: WorkflowPlatformFacade, env: NodeJS.ProcessEnv) {
    this.platform = platform;
    this.env = env;
  }

  run(root: string, args: string[], options: GitOptions = {}): GitOutput {
    const result = this.platform.run({
      args,
      cwd: root,
      env: options.env ? { ...this.env, ...options.env } : this.env,
      executable: "git",
      input: options.input,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    ensure(
      result.errorMessage === null || result.status !== null,
      "GIT_UNAVAILABLE",
      `Git could not run: ${result.errorMessage ?? "unknown error"}`,
      {},
      "Install Git and make sure it is on PATH."
    );
    const output = {
      status: result.status ?? 1,
      stderr: result.stderr,
      stdout: result.stdout,
    };
    ensure(
      options.allowFailure || output.status === 0,
      "GIT_FAILED",
      `git ${args.join(" ")} failed: ${output.stderr.trim() || output.stdout.trim()}`,
      { args, status: output.status }
    );
    return output;
  }

  text(root: string, args: string[], options: GitOptions = {}): string {
    return this.run(root, args, options).stdout.trim();
  }

  succeeds(root: string, args: string[]): boolean {
    return this.run(root, args, { allowFailure: true }).status === 0;
  }
}
