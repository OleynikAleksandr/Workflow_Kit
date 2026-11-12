import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";

export type LegacyStatus = "DONE" | "IN_PROGRESS" | "TODO";

export interface LegacyTask {
  completion: string | null;
  expectedCommit: string | null;
  id: string;
  kind: string | null;
  phase: string;
  scope: string | null;
  status: LegacyStatus;
  title: string;
}

export interface LegacyPlan {
  /** Backtick paths of the context pack. */
  context: string[];
  currentTaskId: string | null;
  planId: string;
  scopeStatus: string;
  tasks: LegacyTask[];
}

const LEGACY_SCHEMA = "harness-ai-plan-v1";

const STATE_BLOCK =
  /<!-- harness-plan-state:start -->\s*```json\s*([\s\S]*?)```\s*<!-- harness-plan-state:end -->/u;
const ROW_START = /^\d+\.\s+\[(TODO|IN_PROGRESS|DONE)\]\s+(.*)$/u;
const TASK_ROW = /^`([^`]+)`\s+([\s\S]*)$/u;
const PHASE_HEADING = /^##\s+(.+?)\s*$/u;
const EXPECTED_COMMIT = /expected commit:\s*`([^`]+)`/u;
const COMPLETION = /completion:\s*([a-z-]+)/u;
const KIND = /\(kind:\s*([a-z]+)\)/u;
const SCOPE = /\(scope:\s*([^;)]*)/u;
const TITLE_END = /\s+\((?:scope|kind|completion):/u;
const RESULT_TAIL = /\s+Result:[\s\S]*$/u;
const CONTEXT_PATH = /`([^`\s]+\.(?:md|json))`/gu;
const CONTINUATION = /^\s+\S/u;
const LINE_BREAK = /\r?\n/u;

interface Row {
  body: string;
  phase: string;
  status: LegacyStatus;
}

function rows(text: string): Row[] {
  const result: Row[] = [];
  let phase = "";
  for (const line of text.split(LINE_BREAK)) {
    const heading = PHASE_HEADING.exec(line);
    const start = ROW_START.exec(line);
    const last = result.at(-1);
    if (heading?.[1]) {
      phase = heading[1];
    } else if (start?.[1] && start[2] !== undefined) {
      result.push({ body: start[2], phase, status: start[1] as LegacyStatus });
    } else if (last && CONTINUATION.test(line)) {
      last.body = `${last.body} ${line.trim()}`;
    }
  }
  return result;
}

function taskOf(row: Row): LegacyTask | null {
  const match = TASK_ROW.exec(row.body);
  if (!(match?.[1] && match[2] !== undefined)) {
    return null;
  }
  const body = match[2];
  const titleEnd = body.search(TITLE_END);
  const title = (titleEnd === -1 ? body : body.slice(0, titleEnd))
    .replace(RESULT_TAIL, "")
    .trim();
  return {
    completion: COMPLETION.exec(body)?.[1] ?? null,
    expectedCommit: EXPECTED_COMMIT.exec(body)?.[1] ?? null,
    id: match[1],
    kind: KIND.exec(body)?.[1] ?? null,
    phase: row.phase,
    scope: SCOPE.exec(body)?.[1]?.trim() ?? null,
    status: row.status,
    title: title || match[1],
  };
}

function contextPaths(text: string): string[] {
  const start = text.indexOf("## Context Pack");
  if (start === -1) {
    return [];
  }
  const end = text.indexOf("\n## ", start + 1);
  const section = text.slice(start, end === -1 ? undefined : end);
  return [
    ...new Set(
      [...section.matchAll(CONTEXT_PATH)]
        .map((item) => item[1] ?? "")
        .filter(Boolean)
    ),
  ];
}

/** Parses a `harness-ai-plan-v1` document: state block, task rows, context pack. */
export function parseLegacyPlan(text: string): LegacyPlan {
  const block = STATE_BLOCK.exec(text)?.[1];
  ensure(
    block,
    "NOT_LEGACY_PLAN",
    "The plan has no harness-ai-plan-v1 state block."
  );
  let state: Record<string, unknown>;
  try {
    state = JSON.parse(block) as Record<string, unknown>;
  } catch {
    state = {};
  }
  ensure(
    state.schema === LEGACY_SCHEMA,
    "NOT_LEGACY_PLAN",
    `The plan schema is not ${LEGACY_SCHEMA}.`
  );
  return {
    context: contextPaths(text),
    currentTaskId:
      typeof state.currentTaskId === "string" ? state.currentTaskId : null,
    planId: typeof state.planId === "string" ? state.planId : "legacy-plan",
    scopeStatus:
      typeof state.executionScopeStatus === "string"
        ? state.executionScopeStatus
        : "NONE",
    tasks: rows(text)
      .map(taskOf)
      .filter((task): task is LegacyTask => task !== null),
  };
}
