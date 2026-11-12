import { createHash } from "node:crypto";
import {
  KIT_BUNDLE_PATH,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  expectedSessionStartHook,
  extractSessionStartHook,
  mergeSessionStartHook,
} from "./installer-provider-hooks.js";
import {
  extractSection,
  type SectionStyle,
  sectionBlock,
  upsertSection,
} from "./installer-sections.js";
import {
  agentRules,
  CLAUDE_IMPORT_LINE,
  gitattributesSection,
  gitHookSection,
  gitignoreSection,
  overviewSkeleton,
  readmeSkeleton,
} from "./installer-texts.js";

/** Version of the Workflow Kit payload; Kit 1.x was Workflow Pilot. */
export const KIT_VERSION = "2.2.4";
export const MANIFEST_PATH = ".harness/workflow/manifest.json";
export const MANIFEST_SCHEMA = "harness-workflow-manifest/1";
export const OWN_HOOKS_DIR = ".harness/workflow/hooks";
export const MANAGED_GIT_HOOKS = [
  "pre-commit",
  "commit-msg",
  "post-commit",
  "pre-push",
] as const;

/**
 * owned — the whole file belongs to the Kit; section — a marked block;
 * json — the Kit entry of a JSON file; line — one line; create — written
 * only when the file does not exist.
 */
export type EntryKind = "create" | "json" | "line" | "owned" | "section";

export interface PayloadEntry {
  executable: boolean;
  kind: EntryKind;
  /** Expected managed part (normalized), or null for `create`. */
  managed: string | null;
  path: string;
  /** Reads the managed part from the current file text. */
  read: (current: string | null) => string | null;
  /** New file text from the current text (null when absent). */
  render: (current: string | null) => string;
}

export interface PayloadOptions {
  bundle: string;
  /** Configured `core.hooksPath` relative to the root, or null. */
  hooksPath: string | null;
  projectName: string;
}

export interface ManifestFile {
  executable: boolean;
  kind: EntryKind;
  path: string;
  sha256: string | null;
}

export interface KitManifest {
  files: ManifestFile[];
  schema: typeof MANIFEST_SCHEMA;
  version: string;
}

const LINE_BREAK = /\r?\n/u;

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function hasClaudeLine(text: string): boolean {
  return text
    .split(LINE_BREAK)
    .some((line) => line.trim() === CLAUDE_IMPORT_LINE);
}

/** The managed part of a file of the given kind, or null when missing. */
export function readManaged(
  kind: EntryKind,
  path: string,
  current: string | null
): string | null {
  if (current === null) {
    return null;
  }
  switch (kind) {
    case "owned":
      return current;
    case "section":
      return extractSection(current, path.endsWith(".md") ? "html" : "hash");
    case "json":
      return extractSessionStartHook(current);
    case "line":
      return hasClaudeLine(current) ? CLAUDE_IMPORT_LINE : null;
    default:
      return null;
  }
}

function owned(
  path: string,
  content: string,
  executable = false
): PayloadEntry {
  return {
    executable,
    kind: "owned",
    managed: content,
    path,
    read: (current) => current,
    render: () => content,
  };
}

function section(
  path: string,
  style: SectionStyle,
  body: string,
  placement: "bottom" | "top" = "bottom",
  prefix = ""
): PayloadEntry {
  return {
    executable: false,
    kind: "section",
    managed: sectionBlock(style, body),
    path,
    read: (current) =>
      current === null ? null : extractSection(current, style),
    render: (current) =>
      upsertSection(current ?? (prefix || null), style, body, placement),
  };
}

function created(path: string, content: string): PayloadEntry {
  return {
    executable: false,
    kind: "create",
    managed: null,
    path,
    read: () => null,
    render: (current) => current ?? content,
  };
}

function claudeLine(): PayloadEntry {
  return {
    executable: false,
    kind: "line",
    managed: CLAUDE_IMPORT_LINE,
    path: "CLAUDE.md",
    read: (current) => readManaged("line", "CLAUDE.md", current),
    render: (current) => {
      if (current === null || current.trim() === "") {
        return `${CLAUDE_IMPORT_LINE}\n`;
      }
      if (hasClaudeLine(current)) {
        return current;
      }
      return `${current}${current.endsWith("\n") ? "" : "\n"}\n${CLAUDE_IMPORT_LINE}\n`;
    },
  };
}

function providerHook(path: string, client: "claude" | "codex"): PayloadEntry {
  return {
    executable: false,
    kind: "json",
    managed: expectedSessionStartHook(client),
    path,
    read: (current) => readManaged("json", path, current),
    render: (current) => mergeSessionStartHook(current, client, path),
  };
}

function hookEntries(hooksPath: string | null): PayloadEntry[] {
  return MANAGED_GIT_HOOKS.map((name) => {
    if (hooksPath === null) {
      const content = `#!/bin/sh\n# Managed by Harness Workflow Kit. Do not edit.\n${sectionBlock("hash", gitHookSection(name))}`;
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
      executable: true,
    };
  });
}

/** Every file the Kit writes into a project, with its writing rule. */
export function buildPayload(options: PayloadOptions): PayloadEntry[] {
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
    ),
  ];
}

export function buildManifest(entries: PayloadEntry[]): KitManifest {
  return {
    files: entries.map((entry) => ({
      executable: entry.executable,
      kind: entry.kind,
      path: entry.path,
      sha256: entry.managed === null ? null : sha256(entry.managed),
    })),
    schema: MANIFEST_SCHEMA,
    version: KIT_VERSION,
  };
}

export function renderManifest(manifest: KitManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
