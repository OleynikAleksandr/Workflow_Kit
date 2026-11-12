import {
  CATALOG,
  type CatalogRole,
  checkFor,
  NODE_ROLE_SCRIPTS,
  nodeAuditCommand,
  nodeCommand,
  nodeInstallCommand,
  nodeScriptCommand,
  pythonCommand,
  pythonInstallCommand,
  ROLE_ORDER,
  type ToolSpec,
} from "./quality-catalog.js";
import type { CheckInput, CommandSpec } from "./quality-config.js";
import {
  detectStacks,
  nodeManifest,
  pythonManifestText,
  STACK_ORDER,
  type StackDetection,
  type StackId,
} from "./quality-detect.js";

export interface ProposalEntry {
  alternatives: string[];
  id: string;
  installed: boolean;
  role: CatalogRole;
  stack: StackId;
  tool: string;
}

/** Detection result plus a suggested profile; it never changes the project. */
export interface QualityProposal {
  detected: StackDetection[];
  entries: ProposalEntry[];
  notes: string[];
  profile: {
    checks: CheckInput[];
    install: CommandSpec[];
    packageManager: string | null;
    stacks: StackId[];
  };
}

export interface ProposeOptions {
  /** Explicit stacks, used when manifests do not exist yet. */
  stacks?: StackId[];
  /** Reports whether an executable is available on PATH. */
  which: (name: string) => boolean;
}

interface StackPlan {
  entries: ProposalEntry[];
  installs: CommandSpec[];
  notes: string[];
}

const ROLE_ID: Readonly<Record<CatalogRole, string>> = {
  audit: "audit",
  format: "format",
  lint: "lint",
  test: "tests",
  typecheck: "typecheck",
};
const NPM_TEST_PLACEHOLDER = "no test specified";
const TOKEN_SEPARATOR = /[^a-z0-9_.-]+/u;

interface Selection {
  alternatives: string[];
  command: CommandSpec;
  installed: boolean;
  spec: ToolSpec | null;
}

function pick(
  candidates: ToolSpec[],
  installed: (spec: ToolSpec) => boolean
): { chosen: ToolSpec; ready: boolean } | null {
  const ready = candidates.find(installed);
  const chosen = ready ?? candidates[0];
  return chosen ? { chosen, ready: Boolean(ready) } : null;
}

function nodeSelection(
  root: string,
  detection: StackDetection,
  role: CatalogRole
): Selection | null {
  const manager = detection.packageManager;
  const { packages, scripts } = nodeManifest(root, detection.directories);
  const candidates = CATALOG.node[role] ?? [];
  const alternatives = candidates.map((spec) => spec.tool);
  const script = (NODE_ROLE_SCRIPTS[role] ?? []).find(
    (name) =>
      scripts.has(name) &&
      !(scripts.get(name) ?? "").includes(NPM_TEST_PLACEHOLDER)
  );
  if (script) {
    return {
      alternatives,
      command: nodeScriptCommand(manager, script),
      installed: true,
      spec: null,
    };
  }
  if (role === "audit") {
    const command = nodeAuditCommand(manager);
    return command
      ? { alternatives: [], command, installed: true, spec: null }
      : null;
  }
  const typed =
    detection.markers.some((marker) => marker.endsWith("tsconfig.json")) ||
    packages.has("typescript");
  const usable = candidates.filter(
    (spec) => spec.needs !== "tsconfig.json" || typed
  );
  const choice = pick(usable, (spec) =>
    spec.packages.every((name) => packages.has(name))
  );
  if (!choice) {
    return null;
  }
  const bin = choice.chosen.tool;
  return {
    alternatives,
    command: nodeCommand(manager, bin, choice.chosen.args),
    installed: choice.ready,
    spec: choice.chosen,
  };
}

function pythonSelection(
  root: string,
  detection: StackDetection,
  role: CatalogRole
): Selection | null {
  const tokens = new Set(
    pythonManifestText(root, detection.markers).split(TOKEN_SEPARATOR)
  );
  const candidates = CATALOG.python[role] ?? [];
  const choice = pick(candidates, (spec) =>
    spec.packages.every((name) => tokens.has(name))
  );
  if (!choice) {
    return null;
  }
  return {
    alternatives: candidates.map((spec) => spec.tool),
    command: pythonCommand(detection.packageManager, choice.chosen),
    installed: choice.ready,
    spec: choice.chosen,
  };
}

function toolchainSelection(
  detection: StackDetection,
  role: CatalogRole,
  which: (name: string) => boolean
): Selection | null {
  let candidates = CATALOG[detection.id][role] ?? [];
  if (detection.id === "jvm") {
    candidates = candidates.filter(
      (spec) =>
        spec.tool === (detection.packageManager === "gradle" ? "gradle" : "mvn")
    );
  }
  const choice = pick(candidates, (spec) => which(spec.tool));
  if (!choice) {
    return null;
  }
  const executable =
    choice.chosen.tool === "cargo-audit" ? "cargo" : choice.chosen.tool;
  return {
    alternatives: candidates.map((spec) => spec.tool),
    command: { args: choice.chosen.args, executable },
    installed: choice.ready,
    spec: choice.chosen,
  };
}

function planStack(
  root: string,
  detection: StackDetection,
  options: ProposeOptions,
  idOf: (role: CatalogRole) => string,
  checks: CheckInput[]
): StackPlan {
  const plan: StackPlan = { entries: [], installs: [], notes: [] };
  const missingPackages = new Set<string>();
  for (const role of ROLE_ORDER) {
    let selection: Selection | null;
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
    const toolName =
      selection.spec?.tool ??
      `${selection.command.executable} ${selection.command.args.join(" ")}`;
    plan.entries.push({
      alternatives: selection.alternatives,
      id,
      installed: selection.installed,
      role,
      stack: detection.id,
      tool: toolName,
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
      detection.id === "node"
        ? nodeInstallCommand(detection.packageManager, names)
        : pythonInstallCommand(detection.packageManager, names)
    );
  }
  return plan;
}

function fallbackDetection(id: StackId): StackDetection {
  const manager: Readonly<Record<StackId, string>> = {
    dotnet: "dotnet",
    go: "go",
    jvm: "maven",
    node: "npm",
    python: "pip",
    rust: "cargo",
    swift: "swift",
  };
  return { directories: ["."], id, markers: [], packageManager: manager[id] };
}

/** Detects stacks and proposes catalog checks with install commands. */
export function proposeQuality(
  root: string,
  options: ProposeOptions
): QualityProposal {
  const detected = detectStacks(root);
  const wanted = options.stacks
    ? STACK_ORDER.filter((id) => options.stacks?.includes(id))
    : detected.map((item) => item.id);
  const stacks = wanted.map(
    (id) => detected.find((item) => item.id === id) ?? fallbackDetection(id)
  );
  const checks: CheckInput[] = [];
  const entries: ProposalEntry[] = [];
  const install: CommandSpec[] = [];
  const notes: string[] = [];
  for (const detection of stacks) {
    const idOf = (role: CatalogRole) =>
      stacks.length === 1 ? ROLE_ID[role] : `${detection.id}-${ROLE_ID[role]}`;
    const plan = planStack(root, detection, options, idOf, checks);
    entries.push(...plan.entries);
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
    entries,
    notes,
    profile: {
      checks,
      install,
      packageManager: stacks[0]?.packageManager ?? null,
      stacks: stacks.map((item) => item.id),
    },
  };
}
