import type {
  CheckInput,
  CheckRole,
  CheckStage,
  CommandSpec,
} from "./quality-config.js";
import type { StackId } from "./quality-detect.js";

export type CatalogRole = "audit" | "format" | "lint" | "test" | "typecheck";

/** One tool candidate for a role; `args` follow the tool runner. */
export interface ToolSpec {
  appliesTo?: string[];
  args: string[];
  /** Separate install command for tools outside the package manager. */
  install?: CommandSpec;
  /** Python module name when it differs from the tool name. */
  module?: string;
  /** Marker file name the tool needs (for example tsconfig.json). */
  needs?: string;
  /** Packages that provide the tool; empty means part of the toolchain. */
  packages: string[];
  tool: string;
}

export const ROLE_ORDER: readonly CatalogRole[] = [
  "format",
  "lint",
  "typecheck",
  "test",
  "audit",
];

const ROLE_STAGE: Readonly<Record<CatalogRole, CheckStage>> = {
  audit: "push",
  format: "prepare",
  lint: "commit",
  test: "commit",
  typecheck: "commit",
};

/** Package scripts that already implement a role in a node project. */
export const NODE_ROLE_SCRIPTS: Readonly<
  Partial<Record<CatalogRole, string[]>>
> = {
  lint: ["lint"],
  test: ["test"],
  typecheck: ["typecheck", "type-check"],
};

const tool = (
  name: string,
  args: string[],
  packages: string[] = [],
  extra: Partial<ToolSpec> = {}
): ToolSpec => ({
  args,
  packages,
  tool: name,
  ...extra,
});

export const CATALOG: Readonly<
  Record<StackId, Partial<Record<CatalogRole, ToolSpec[]>>>
> = {
  dotnet: {
    audit: [tool("dotnet", ["list", "package", "--vulnerable"])],
    format: [
      tool("dotnet", ["format", "--include", "{files}"], [], {
        appliesTo: ["**/*.cs"],
      }),
    ],
    lint: [tool("dotnet", ["build", "-warnaserror"])],
    test: [tool("dotnet", ["test"])],
  },
  go: {
    audit: [
      tool("govulncheck", ["./..."], [], {
        install: {
          args: ["install", "golang.org/x/vuln/cmd/govulncheck@latest"],
          executable: "go",
        },
      }),
    ],
    format: [tool("gofmt", ["-w", "{files}"], [], { appliesTo: ["**/*.go"] })],
    lint: [tool("go", ["vet", "./..."])],
    test: [tool("go", ["test", "./..."])],
  },
  jvm: {
    test: [tool("gradle", ["test"]), tool("mvn", ["-q", "test"])],
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
      ),
    ],
    lint: [
      tool("ultracite", ["check"], ["ultracite"]),
      tool("biome", ["check"], ["@biomejs/biome"]),
      tool("eslint", ["."], ["eslint"]),
    ],
    test: [
      tool("vitest", ["run"], ["vitest"]),
      tool("jest", [], ["jest"]),
      tool("node", ["--test"]),
    ],
    typecheck: [
      tool("tsc", ["--noEmit"], ["typescript"], { needs: "tsconfig.json" }),
    ],
  },
  python: {
    audit: [tool("pip-audit", [], ["pip-audit"], { module: "pip_audit" })],
    format: [
      tool("ruff", ["format", "{files}"], ["ruff"], { appliesTo: ["**/*.py"] }),
    ],
    lint: [tool("ruff", ["check"], ["ruff"])],
    test: [tool("pytest", [], ["pytest"])],
    typecheck: [
      tool("pyright", [], ["pyright"]),
      tool("mypy", ["."], ["mypy"]),
    ],
  },
  rust: {
    audit: [
      tool("cargo-audit", ["audit"], [], {
        install: { args: ["install", "cargo-audit"], executable: "cargo" },
      }),
    ],
    format: [
      tool("cargo", ["fmt", "--", "{files}"], [], { appliesTo: ["**/*.rs"] }),
    ],
    lint: [tool("cargo", ["clippy", "--all-targets", "--", "-D", "warnings"])],
    test: [tool("cargo", ["test"])],
    typecheck: [tool("cargo", ["check"])],
  },
  swift: {
    format: [
      tool("swift-format", ["format", "-i", "{files}"], [], {
        appliesTo: ["**/*.swift"],
      }),
    ],
    lint: [tool("swiftlint", [])],
    test: [tool("swift", ["test"])],
  },
};

/** Command that runs a node package binary through the package manager. */
export function nodeCommand(
  manager: string,
  bin: string,
  args: string[]
): CommandSpec {
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

export function nodeScriptCommand(
  manager: string,
  script: string
): CommandSpec {
  if (manager === "npm") {
    return script === "test"
      ? { args: ["test"], executable: "npm" }
      : { args: ["run", "-s", script], executable: "npm" };
  }
  return { args: ["run", script], executable: manager };
}

export function nodeAuditCommand(manager: string): CommandSpec | null {
  if (manager === "npm" || manager === "pnpm" || manager === "yarn") {
    return {
      args: ["audit", ...(manager === "npm" ? ["--audit-level=high"] : [])],
      executable: manager,
    };
  }
  return null;
}

export function nodeInstallCommand(
  manager: string,
  packages: string[]
): CommandSpec {
  const verb: Readonly<Record<string, string[]>> = {
    bun: ["add", "-d"],
    pnpm: ["add", "-D"],
    yarn: ["add", "-D"],
  };
  return {
    args: [...(verb[manager] ?? ["install", "-D"]), ...packages],
    executable: manager,
  };
}

export function pythonCommand(manager: string, spec: ToolSpec): CommandSpec {
  if (manager === "uv" || manager === "poetry") {
    return { args: ["run", spec.tool, ...spec.args], executable: manager };
  }
  return {
    args: ["-m", spec.module ?? spec.tool, ...spec.args],
    executable: "python",
  };
}

export function pythonInstallCommand(
  manager: string,
  packages: string[]
): CommandSpec {
  if (manager === "uv") {
    return { args: ["add", "--dev", ...packages], executable: "uv" };
  }
  if (manager === "poetry") {
    return {
      args: ["add", "--group", "dev", ...packages],
      executable: "poetry",
    };
  }
  return { args: ["-m", "pip", "install", ...packages], executable: "python" };
}

export function checkFor(
  id: string,
  role: CatalogRole,
  command: CommandSpec,
  appliesTo?: string[]
): CheckInput {
  return {
    ...(appliesTo ? { appliesTo } : {}),
    command,
    id,
    required: true,
    role: role as CheckRole,
    stage: ROLE_STAGE[role],
    ...(role === "test" ? { timeoutMs: 600_000 } : {}),
  };
}
