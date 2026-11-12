import { existsSync, statSync } from "node:fs";
import path from "node:path";
import {
  KIT_BUNDLE_PATH,
  type RuntimeMode,
} from "../../workflow-platform/src/workflow-platform-facade.js";

/** File name of the Kit bundle inside a bundle directory. */
const BUNDLE_FILE = "workflow.mjs";

export interface HostRuntime {
  executable: string;
  mode: RuntimeMode;
}

export type BundleSource = "app" | "project";

export interface ResolvedBundle {
  file: string;
  source: BundleSource;
}

/**
 * The bundle shipped with the application: `HARNESS_WORKFLOW_KIT_BUNDLE`
 * (a directory or the `workflow.mjs` file), or null when it is not set or
 * the file does not exist.
 */
function appBundle(env: NodeJS.ProcessEnv): string | null {
  const configured = env.HARNESS_WORKFLOW_KIT_BUNDLE;
  if (!configured) {
    return null;
  }
  const absolute = path.resolve(configured);
  const file =
    existsSync(absolute) && statSync(absolute).isDirectory()
      ? path.join(absolute, BUNDLE_FILE)
      : absolute;
  return existsSync(file) ? file : null;
}

/** The bundle installed into the project, or null. */
function projectBundle(root: string): string | null {
  const file = path.join(root, ...KIT_BUNDLE_PATH.split("/"));
  return existsSync(file) ? file : null;
}

/**
 * The bundle a command runs: the application bundle for `inspect` and
 * `install`, otherwise the project bundle with the application bundle as
 * the fallback.
 */
export function selectBundle(
  env: NodeJS.ProcessEnv,
  root: string | null,
  preferApp: boolean
): ResolvedBundle | null {
  const installed = root && !preferApp ? projectBundle(root) : null;
  if (installed) {
    return { file: installed, source: "project" };
  }
  const shipped = appBundle(env);
  return shipped ? { file: shipped, source: "app" } : null;
}

/**
 * The runtime that executes the bundle: `HARNESS_ELECTRON_NODE` (Electron
 * as Node), else the current process (Electron or Node).
 */
export function hostRuntime(
  env: NodeJS.ProcessEnv,
  current: { execPath: string; electron: boolean }
): HostRuntime {
  if (env.HARNESS_ELECTRON_NODE) {
    return { executable: env.HARNESS_ELECTRON_NODE, mode: "electron" };
  }
  return {
    executable: current.execPath,
    mode: current.electron ? "electron" : "node",
  };
}
