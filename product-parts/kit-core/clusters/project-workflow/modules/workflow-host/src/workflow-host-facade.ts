import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type {
  DoctorReport,
  InspectResult,
  InstallOutcome,
} from "../../workflow-installer/src/workflow-installer-facade.js";
import type {
  KitStatus,
  ScopeChoiceResult,
  ScopeProposalView,
  ValidationReport,
} from "../../workflow-kit/src/workflow-kit-facade.js";
import {
  RUNTIME_FILE,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import type { RecoveryPacket } from "../../workflow-recovery/src/workflow-recovery-facade.js";
import {
  type HostRuntime,
  hostRuntime,
  type ResolvedBundle,
  selectBundle,
} from "./host-resolve.js";
import { type KitOutcome, runKitCommand } from "./host-runner.js";

export type {
  BundleSource,
  HostRuntime,
  ResolvedBundle,
} from "./host-resolve.js";
export type { KitFailure, KitOutcome, KitSuccess } from "./host-runner.js";

const DEFAULT_TIMEOUT_MS = 120_000;
/** Install and doctor fixes make a commit whose hooks may run checks. */
const COMMIT_TIMEOUT_MS = 600_000;
const KIT_DIRECTORY = ".harness/workflow";

export interface WorkflowHostOptions {
  /** The running process; defaults to `process`. */
  current?: { electron: boolean; execPath: string };
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

/** The `identity:set` result: the trimmed identity written to the global git config. */
export interface GitIdentitySetResult {
  email: string;
  name: string;
  scope: "global";
}

export interface RunOptions {
  /** Working directory; defaults to the root or the process directory. */
  cwd?: string;
  /** Use the application bundle even when the project has its own. */
  preferApp?: boolean;
  /** Project root, passed as `--root`. */
  root?: string;
  timeoutMs?: number;
}

/** The nearest existing directory of a path (a new project folder may not exist yet). */
function existingAncestor(target: string): string {
  let current = target;
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      return current;
    }
    current = parent;
  }
  return current;
}

/**
 * Public facade of the workflow-host module: Core runs Workflow Kit
 * commands through it as child processes of the shipped or installed
 * bundle and receives their JSON envelopes. Only Core uses this module.
 */
export class WorkflowHostFacade {
  private readonly current: { electron: boolean; execPath: string };
  private readonly env: NodeJS.ProcessEnv;
  private readonly timeoutMs: number;

  constructor(options: WorkflowHostOptions = {}) {
    this.env = options.env ?? process.env;
    this.current = options.current ?? {
      electron: Boolean(process.versions.electron),
      execPath: process.execPath,
    };
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** The runtime that executes Kit bundles. */
  runtime(): HostRuntime {
    return hostRuntime(this.env, this.current);
  }

  /** The bundle a command for this root would run, or null. */
  bundle(root: string | null, preferApp = false): ResolvedBundle | null {
    return selectBundle(this.env, root, preferApp);
  }

  /** Runs any Kit command; never rejects. */
  run<T>(args: string[], options: RunOptions = {}): Promise<KitOutcome<T>> {
    const root = options.root ? path.resolve(options.root) : null;
    const bundle = this.bundle(root, options.preferApp ?? false);
    if (!bundle) {
      return Promise.resolve({
        code: "HOST_NO_BUNDLE",
        message:
          "The Workflow Kit bundle is not available (HARNESS_WORKFLOW_KIT_BUNDLE).",
        nextAction: null,
        ok: false,
      });
    }
    return runKitCommand<T>({
      args: root ? [...args, "--root", root] : args,
      bundle: bundle.file,
      cwd: options.cwd ?? root ?? process.cwd(),
      env: this.env,
      runtime: this.runtime(),
      timeoutMs: options.timeoutMs ?? this.timeoutMs,
    });
  }

  /** `inspect <folder>` with the application bundle. */
  inspect(folder: string): Promise<KitOutcome<InspectResult>> {
    const target = path.resolve(folder);
    return this.run(["inspect", target], {
      cwd: existingAncestor(target),
      preferApp: true,
    });
  }

  /**
   * `install <folder>` with the application bundle: a new folder, a folder
   * without the Kit, or an update (`update: true`).
   */
  install(
    folder: string,
    options: { host?: "harness"; name?: string; update?: boolean } = {}
  ): Promise<KitOutcome<InstallOutcome>> {
    const target = path.resolve(folder);
    const args = ["install", target];
    if (options.host) {
      args.push("--host", options.host);
    }
    if (options.name) {
      args.push("--name", options.name);
    }
    if (options.update) {
      args.push("--update");
    }
    return this.run(args, {
      cwd: existingAncestor(target),
      preferApp: true,
      timeoutMs: COMMIT_TIMEOUT_MS,
    });
  }

  /**
   * `identity:set --name --email --global` with the application bundle:
   * the Kit validates the identity and writes the global git config. It
   * needs no project, so it runs before a project exists, in the home
   * directory. Values go as `--flag=value`, so a value starting with `--`
   * stays a value.
   */
  setIdentity(identity: {
    email: string;
    name: string;
  }): Promise<KitOutcome<GitIdentitySetResult>> {
    return this.run(
      [
        "identity:set",
        `--name=${identity.name}`,
        `--email=${identity.email}`,
        "--global",
      ],
      { cwd: homedir(), preferApp: true }
    );
  }

  status(root: string): Promise<KitOutcome<KitStatus>> {
    return this.run(["status"], { root });
  }

  /** `scope:proposal`: the card view of the stored scope proposal, or `null`. */
  proposal(root: string): Promise<KitOutcome<ScopeProposalView | null>> {
    return this.run(["scope:proposal"], { root });
  }

  /** `scope:choose`: records the user's answer to the proposal of `generation`. */
  chooseScope(
    root: string,
    choice: {
      generation: number;
      note: string;
      option: "orchestrated" | "refine" | "sequential";
      session: string;
    }
  ): Promise<KitOutcome<ScopeChoiceResult>> {
    return this.run(
      [
        "scope:choose",
        "--generation",
        String(choice.generation),
        "--option",
        choice.option,
        "--session",
        choice.session,
        "--note",
        choice.note,
      ],
      { root }
    );
  }

  validate(root: string): Promise<KitOutcome<ValidationReport>> {
    return this.run(["validate"], { root });
  }

  recover(
    root: string,
    event: "clear" | "compact" | "resume" | "startup" = "startup"
  ): Promise<KitOutcome<RecoveryPacket>> {
    return this.run(["recover", "--event", event], { root });
  }

  /** `doctor`; `fix` restores managed files from the project bundle. */
  doctor(root: string, fix = false): Promise<KitOutcome<DoctorReport>> {
    const target = path.resolve(root);
    return this.run(fix ? ["doctor", target, "--fix"] : ["doctor", target], {
      cwd: target,
      timeoutMs: fix ? COMMIT_TIMEOUT_MS : this.timeoutMs,
    });
  }

  /**
   * Records the host runtime in `.harness/workflow/local/runtime` of a
   * project with the Kit, so its launchers work without a system Node.
   * Returns false when the project has no Kit.
   */
  writeRuntimeFile(root: string): boolean {
    const target = path.resolve(root);
    if (!existsSync(path.join(target, ...KIT_DIRECTORY.split("/")))) {
      return false;
    }
    const runtime = this.runtime();
    workflowPlatformFacade.writeFileAtomic(
      path.join(target, ...RUNTIME_FILE.split("/")),
      workflowPlatformFacade.formatRuntimeFile(runtime.executable, runtime.mode)
    );
    return true;
  }
}

export const workflowHostFacade = new WorkflowHostFacade();
