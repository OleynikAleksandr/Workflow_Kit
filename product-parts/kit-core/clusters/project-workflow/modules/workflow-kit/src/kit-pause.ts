import { workflowAssignmentFacade } from "../../workflow-assignment/src/workflow-assignment-facade.js";
import {
  ensure,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import { type KitContext, locked, readPlan } from "./kit-context.js";

/** The user's pause of the workflow, local state of the main checkout. */
const PAUSE_FILE = "pause.json";
const PAUSE_PATH = `.harness/workflow/local/${PAUSE_FILE}`;

/** `.harness/workflow/local/pause.json`; a missing file is not paused. */
export interface PauseState {
  at: string | null;
  note: string | null;
  paused: boolean;
}

const REWRITE =
  "Rewrite it on the user's request: scripts/workflow pause:set --on|--off --note \"<the user's words>\".";

function pauseFile(context: KitContext): string {
  return context.git.localPath(context.root, PAUSE_FILE);
}

/** PAUSE_STATE for a file that cannot be read or has the wrong shape. */
export function readPause(context: KitContext): PauseState {
  let text: string | null = null;
  let parsed: unknown = null;
  let readable = true;
  try {
    text = workflowPlatformFacade.readTextIfExists(pauseFile(context));
    parsed = text === null ? null : JSON.parse(text);
  } catch {
    readable = false;
  }
  if (readable && text === null) {
    return { at: null, note: null, paused: false };
  }
  const record = (parsed ?? {}) as Record<string, unknown>;
  ensure(
    readable &&
      typeof parsed === "object" &&
      typeof record.paused === "boolean" &&
      typeof record.note === "string" &&
      typeof record.at === "string",
    "PAUSE_STATE",
    `${PAUSE_PATH} is unreadable; the pause state is unknown.`,
    { path: PAUSE_PATH },
    REWRITE
  );
  return {
    at: record.at as string,
    note: record.note as string,
    paused: record.paused as boolean,
  };
}

/**
 * `pause:set`: stores the user's pause under the project lock. It needs an
 * installed Kit but no scope, and overwrites an unreadable file.
 */
export function setPause(
  context: KitContext,
  paused: boolean,
  note: string
): PauseState {
  const words = note.trim();
  ensure(words !== "", "USAGE", "--note is required.");
  return locked(context, () => {
    readPlan(context);
    const state: PauseState = { at: context.now(), note: words, paused };
    workflowPlatformFacade.writeFileAtomic(
      pauseFile(context),
      `${JSON.stringify(state, null, 2)}\n`
    );
    return state;
  });
}

/**
 * WORKFLOW_PAUSED in the main checkout while the user's pause is on. An
 * executor worktree finishes its assignment: the pause does not apply there.
 */
export function ensureNotPaused(context: KitContext): void {
  if (workflowAssignmentFacade.worktreeRecord(context.root) !== null) {
    return;
  }
  const pause = readPause(context);
  ensure(
    !pause.paused,
    "WORKFLOW_PAUSED",
    `The workflow is paused by the user (${pause.at}): ${pause.note}`,
    { at: pause.at, note: pause.note },
    'Wait until the user presses Continue in Harness, or run `scripts/workflow pause:set --off --note "<the user\'s words>"` when the user asks to continue.'
  );
}
