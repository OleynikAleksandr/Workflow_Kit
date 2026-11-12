import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";

export type ProviderClient = "claude" | "codex";

const KIT_LAUNCHER_MARK = "scripts/workflow";
const KIT_HOOK_MARK = "hook session-start";

/**
 * Claude Code keeps at most 10 000 characters of one hook's output, so the
 * Claude settings run the session-start hook once per packet part.
 */
const CLAUDE_PARTS = 6;

/** Codex raises its hook output limit per entry with this field. */
const CODEX_CONTEXT_LIMIT = 65_536;

interface HookCommand {
  additionalContextLimit?: number;
  command: string;
  type: "command";
}

interface HookGroup {
  hooks: HookCommand[];
  matcher?: string;
}

/**
 * The Kit SessionStart groups of a provider: six Claude groups, each asking
 * for its part of the recovery packet, or one Codex group with a raised
 * output limit that takes the whole packet.
 */
function kitGroups(client: ProviderClient): HookGroup[] {
  if (client === "codex") {
    return [
      {
        hooks: [
          {
            additionalContextLimit: CODEX_CONTEXT_LIMIT,
            command: "scripts/workflow hook session-start --client codex",
            type: "command",
          },
        ],
      },
    ];
  }
  return Array.from({ length: CLAUDE_PARTS }, (_, i) => ({
    hooks: [
      {
        command: `"$CLAUDE_PROJECT_DIR/scripts/workflow" hook session-start --client claude --part ${i + 1}/${CLAUDE_PARTS}`,
        type: "command" as const,
      },
    ],
  }));
}

function isKitGroup(group: unknown): boolean {
  const hooks = (group as HookGroup | null)?.hooks;
  return (
    Array.isArray(hooks) &&
    hooks.some(
      (hook) =>
        typeof hook?.command === "string" &&
        hook.command.includes(KIT_LAUNCHER_MARK) &&
        hook.command.includes(KIT_HOOK_MARK)
    )
  );
}

function parseObject(
  current: string | null,
  file: string
): Record<string, unknown> {
  if (current === null || current.trim() === "") {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(current);
  } catch {
    parsed = null;
  }
  ensure(
    parsed && typeof parsed === "object" && !Array.isArray(parsed),
    "MANAGED_JSON",
    `${file} is not a JSON object; fix it by hand first.`,
    { path: file }
  );
  return parsed as Record<string, unknown>;
}

/**
 * Adds or replaces the Kit SessionStart entry and keeps every other hook and
 * setting of the file.
 */
export function mergeSessionStartHook(
  current: string | null,
  client: ProviderClient,
  file: string
): string {
  const settings = parseObject(current, file);
  const hooks = (
    settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {}
  ) as Record<string, unknown>;
  const existing = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];
  const merged = {
    ...settings,
    hooks: {
      ...hooks,
      SessionStart: [
        ...existing.filter((group) => !isKitGroup(group)),
        ...kitGroups(client),
      ],
    },
  };
  return `${JSON.stringify(merged, null, 2)}\n`;
}

/**
 * The Kit entries of a provider settings file in order, normalized as one
 * JSON array, or null when there is none; inspect and doctor compare it with
 * `expectedSessionStartHook`, so a change in any group shows.
 */
export function extractSessionStartHook(current: string | null): string | null {
  try {
    const settings = JSON.parse(current ?? "") as {
      hooks?: { SessionStart?: unknown[] };
    };
    const groups = (settings.hooks?.SessionStart ?? []).filter(isKitGroup);
    return groups.length > 0 ? JSON.stringify(groups) : null;
  } catch {
    return null;
  }
}

export function expectedSessionStartHook(client: ProviderClient): string {
  return JSON.stringify(kitGroups(client));
}
