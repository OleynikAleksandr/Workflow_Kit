import path from "node:path";
import { readTextIfExists } from "./platform-fs.js";
import type { WorkflowPlatform } from "./platform-paths.js";
import {
  type ProcessResult,
  resolveExecutable,
  runProcessSync,
} from "./platform-process.js";

export type RuntimeMode = "electron" | "node";

export interface WorkflowRuntime {
  executable: string;
  mode: RuntimeMode;
  source: "env" | "os" | "path" | "runtime-file";
  version: string;
}

export interface RuntimeCandidate {
  executable: string;
  mode: RuntimeMode;
  source: WorkflowRuntime["source"];
}

export type RuntimeProbe = (candidate: RuntimeCandidate) => string | null;

const MINIMUM_NODE_MAJOR = 22;
/** Project-relative file where Harness records the runtime it can lend to launchers. */
export const RUNTIME_FILE = ".harness/workflow/local/runtime";
const VERSION_SCRIPT = "process.stdout.write(process.versions.node)";
const LINE_SPLIT_PATTERN = /\r?\n/u;

const OS_NODE_PATHS: Record<WorkflowPlatform, string[]> = {
  darwin: ["/opt/homebrew/bin/node", "/usr/local/bin/node"],
  linux: ["/usr/local/bin/node", "/usr/bin/node"],
  win32: ["C:/Program Files/nodejs/node.exe"],
};

export function runtimeEnvironment(
  mode: RuntimeMode,
  base: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  const { ELECTRON_RUN_AS_NODE: _removed, ...rest } = base;
  return mode === "electron" ? { ...rest, ELECTRON_RUN_AS_NODE: "1" } : rest;
}

export function formatRuntimeFile(
  executable: string,
  mode: RuntimeMode
): string {
  return `${executable.replaceAll("\\", "/")}\n${mode}\n`;
}

export function parseRuntimeFile(
  text: string
): { executable: string; mode: RuntimeMode } | null {
  const [executable, mode] = text
    .split(LINE_SPLIT_PATTERN)
    .map((line) => line.trim());
  if (!executable) {
    return null;
  }
  return { executable, mode: mode === "electron" ? "electron" : "node" };
}

export function runtimeCandidates(
  projectRoot: string | null,
  env: NodeJS.ProcessEnv,
  platform: WorkflowPlatform
): RuntimeCandidate[] {
  const candidates: RuntimeCandidate[] = [];
  if (env.HARNESS_WORKFLOW_NODE) {
    candidates.push({
      executable: env.HARNESS_WORKFLOW_NODE,
      mode: "node",
      source: "env",
    });
  }
  const recorded = projectRoot
    ? readTextIfExists(path.join(projectRoot, ...RUNTIME_FILE.split("/")))
    : null;
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

export function probeRuntimeVersion(
  candidate: RuntimeCandidate,
  platform: WorkflowPlatform
): string | null {
  const result: ProcessResult = runProcessSync(
    {
      args: ["-e", VERSION_SCRIPT],
      env: runtimeEnvironment(candidate.mode, process.env),
      executable: candidate.executable,
      timeoutMs: 15_000,
    },
    platform
  );
  return result.status === 0 && result.stdout.trim()
    ? result.stdout.trim()
    : null;
}

function satisfiesMinimum(version: string): boolean {
  return Number(version.split(".")[0]) >= MINIMUM_NODE_MAJOR;
}

/** Returns the first candidate whose Node major version is at least 22. */
export function resolveRuntime(
  candidates: RuntimeCandidate[],
  probe: RuntimeProbe
): WorkflowRuntime | null {
  for (const candidate of candidates) {
    const version = probe(candidate);
    if (version && satisfiesMinimum(version)) {
      return { ...candidate, version };
    }
  }
  return null;
}
