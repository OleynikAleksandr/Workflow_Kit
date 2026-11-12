import { readdirSync } from "node:fs";
import path from "node:path";
import { workflowPlatformFacade } from "../../workflow-platform/src/workflow-platform-facade.js";

export type StackId =
  | "dotnet"
  | "go"
  | "jvm"
  | "node"
  | "python"
  | "rust"
  | "swift";

export const STACK_ORDER: readonly StackId[] = [
  "node",
  "python",
  "go",
  "rust",
  "dotnet",
  "swift",
  "jvm",
];

export interface StackDetection {
  /** Directories (canonical, "." for the root) that hold the markers. */
  directories: string[];
  id: StackId;
  markers: string[];
  packageManager: string;
}

interface Marker {
  pattern: RegExp;
  stack: StackId;
}

const MARKERS: readonly Marker[] = [
  { pattern: /^(package\.json|tsconfig\.json|deno\.jsonc?)$/u, stack: "node" },
  {
    pattern: /^(pyproject\.toml|setup\.py|requirements[^/]*\.txt)$/u,
    stack: "python",
  },
  { pattern: /^go\.mod$/u, stack: "go" },
  { pattern: /^Cargo\.toml$/u, stack: "rust" },
  { pattern: /^(global\.json|.+\.csproj|.+\.sln)$/u, stack: "dotnet" },
  { pattern: /^(Package\.swift|.+\.xcodeproj)$/u, stack: "swift" },
  { pattern: /^(pom\.xml|build\.gradle(\.kts)?)$/u, stack: "jvm" },
];

const LOCK_FILES: Readonly<Record<string, string>> = {
  "bun.lock": "bun",
  "bun.lockb": "bun",
  "package-lock.json": "npm",
  "pnpm-lock.yaml": "pnpm",
  "poetry.lock": "poetry",
  "uv.lock": "uv",
  "yarn.lock": "yarn",
};

const NODE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const PYTHON_MANAGERS = new Set(["uv", "poetry"]);
const DEFAULT_MANAGER: Readonly<Record<StackId, string>> = {
  dotnet: "dotnet",
  go: "go",
  jvm: "maven",
  node: "npm",
  python: "pip",
  rust: "cargo",
  swift: "swift",
};
const SKIPPED_DIRECTORIES = new Set([
  "build",
  "dist",
  "node_modules",
  "out",
  "release",
  "target",
  "vendor",
  "venv",
]);
const PACKAGE_MANAGER_FIELD = /^(npm|pnpm|yarn|bun)@/u;

function entries(
  root: string,
  directory: string
): { directories: string[]; files: string[] } {
  try {
    const listed = readdirSync(
      path.join(root, ...directory.split("/").filter((part) => part !== ".")),
      { withFileTypes: true }
    );
    return {
      directories: listed
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
      files: listed.map((entry) => entry.name),
    };
  } catch {
    return { directories: [], files: [] };
  }
}

function join(directory: string, name: string): string {
  return directory === "." ? name : `${directory}/${name}`;
}

/** Reads a JSON manifest; malformed manifests count as empty. */
function readJsonManifest(
  root: string,
  relative: string
): Record<string, unknown> | null {
  const text = workflowPlatformFacade.readTextIfExists(
    path.join(root, ...relative.split("/"))
  );
  if (text === null) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function nodeManager(
  root: string,
  directories: string[],
  locks: Map<string, string>
): string {
  for (const directory of directories) {
    const lock = locks.get(directory);
    if (lock && NODE_MANAGERS.has(lock)) {
      return lock;
    }
  }
  for (const directory of directories) {
    const field = readJsonManifest(
      root,
      join(directory, "package.json")
    )?.packageManager;
    const match =
      typeof field === "string" ? PACKAGE_MANAGER_FIELD.exec(field) : null;
    if (match?.[1]) {
      return match[1];
    }
  }
  return DEFAULT_MANAGER.node;
}

function packageManagerOf(
  root: string,
  stack: StackId,
  directories: string[],
  markers: string[],
  locks: Map<string, string>
): string {
  if (stack === "node") {
    return nodeManager(root, directories, locks);
  }
  if (stack === "python") {
    const lock = directories
      .map((directory) => locks.get(directory))
      .find((value) => value && PYTHON_MANAGERS.has(value));
    return lock ?? DEFAULT_MANAGER.python;
  }
  if (stack === "jvm") {
    return markers.some((marker) =>
      path.posix.basename(marker).startsWith("build.gradle")
    )
      ? "gradle"
      : "maven";
  }
  return DEFAULT_MANAGER[stack];
}

/**
 * Detects ecosystems from manifests in the project root and its first-level
 * subdirectories. Hidden and build-output directories are skipped.
 */
export function detectStacks(root: string): StackDetection[] {
  const scanned = ["."];
  for (const name of entries(root, ".").directories.sort()) {
    if (!(name.startsWith(".") || SKIPPED_DIRECTORIES.has(name))) {
      scanned.push(name);
    }
  }
  const found = new Map<
    StackId,
    { directories: Set<string>; markers: string[] }
  >();
  const locks = new Map<string, string>();
  for (const directory of scanned) {
    for (const name of entries(root, directory).files.sort()) {
      const lock = LOCK_FILES[name];
      if (lock && !locks.has(directory)) {
        locks.set(directory, lock);
      }
      const marker = MARKERS.find((candidate) => candidate.pattern.test(name));
      if (marker) {
        const current = found.get(marker.stack) ?? {
          directories: new Set<string>(),
          markers: [],
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
        ),
      },
    ];
  });
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/** Collects dependency and script names of the node manifests of a stack. */
export function nodeManifest(
  root: string,
  directories: string[]
): { packages: Set<string>; scripts: Map<string, string> } {
  const packages = new Set<string>();
  const scripts = new Map<string, string>();
  for (const directory of directories) {
    const manifest = recordOf(
      readJsonManifest(root, join(directory, "package.json"))
    );
    for (const name of [
      ...Object.keys(recordOf(manifest.dependencies)),
      ...Object.keys(recordOf(manifest.devDependencies)),
    ]) {
      packages.add(name);
    }
    const declared =
      directory === "." ? Object.entries(recordOf(manifest.scripts)) : [];
    for (const [name, command] of declared) {
      if (typeof command === "string") {
        scripts.set(name, command);
      }
    }
  }
  return { packages, scripts };
}

/** Text of the python manifests, used to recognise declared tools. */
export function pythonManifestText(root: string, markers: string[]): string {
  return markers
    .filter((marker) => !marker.endsWith("setup.py"))
    .map(
      (marker) =>
        workflowPlatformFacade.readTextIfExists(
          path.join(root, ...marker.split("/"))
        ) ?? ""
    )
    .join("\n")
    .toLowerCase();
}
