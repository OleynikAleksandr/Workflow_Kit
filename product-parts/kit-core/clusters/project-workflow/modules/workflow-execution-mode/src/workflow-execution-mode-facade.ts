import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { workflowGitFacade } from "../../workflow-git/src/workflow-git-facade.js";
import type { ExecutionStrategy } from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  ensure,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";

/** A button of the mode card: one of the two strategies or "refine the specification". */
export type ExecutionModeOption = ExecutionStrategy | "refine";

const PROPOSAL_FILE = "scope-proposal.json";
const PROPOSAL_VERSION = 1;
const REASON_MIN = 10;
const REASON_MAX = 300;
const STRATEGIES = new Set<string>(["orchestrated", "sequential"]);
const OPTIONS = new Set<string>(["orchestrated", "refine", "sequential"]);

/** The user's answer to a proposal; only `refine` stays recorded. */
interface ProposalChoice {
  at: string;
  generation: number;
  note: string;
  option: ExecutionModeOption;
  session: string;
}

/** `.harness/workflow/local/scope-proposal.json`: the open proposal of one planning cycle. */
export interface ScopeProposal {
  choice: ProposalChoice | null;
  createdAt: string;
  generation: number;
  hasParallelWork: boolean;
  /** The validated scope input; `null` after `refine`. */
  input: unknown;
  options: ExecutionModeOption[];
  planDigest: string | null;
  reason: string;
  recommended: ExecutionStrategy;
  /** The proposal ended with "refine"; the cycle is in refinement. */
  refining: boolean;
  version: typeof PROPOSAL_VERSION;
}

interface ProposalRequest {
  hasParallelWork: boolean;
  input: unknown;
  now: string;
  reason: string;
  recommended: ExecutionStrategy;
}

interface ChoiceRequest {
  generation: number;
  note: string;
  now: string;
  option: ExecutionModeOption;
  session: string;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

/** sha256 of the canonical JSON (sorted keys) of the plan input. */
function planDigest(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(input)))
    .digest("hex");
}

/**
 * Options of the mode card. With parallel work: the recommendation, the
 * other mode, "refine". Without: "sequential", "refine"; recommending
 * `orchestrated` then fails with NO_PARALLEL_WORK.
 */
function proposalOptions(
  recommended: ExecutionStrategy,
  hasParallelWork: boolean
): ExecutionModeOption[] {
  ensure(
    STRATEGIES.has(recommended),
    "PROPOSAL_RECOMMENDATION",
    "The recommendation is sequential or orchestrated."
  );
  if (hasParallelWork) {
    return [
      recommended,
      recommended === "sequential" ? "orchestrated" : "sequential",
      "refine",
    ];
  }
  ensure(
    recommended === "sequential",
    "NO_PARALLEL_WORK",
    "The plan has no pair of compatible parallelSafe tasks; orchestrated execution cannot be recommended.",
    {},
    "Recommend sequential, or label independent tasks with parallelSafe and concrete files."
  );
  return ["sequential", "refine"];
}

function validReason(reason: unknown): string {
  const text = typeof reason === "string" ? reason.trim() : "";
  ensure(
    text.length >= REASON_MIN && text.length <= REASON_MAX,
    "PROPOSAL_REASON",
    `The reason of the recommendation has ${REASON_MIN} to ${REASON_MAX} characters.`
  );
  return text;
}

function isProposal(value: unknown): value is ScopeProposal {
  const record = value as ScopeProposal | null;
  return (
    record !== null &&
    typeof record === "object" &&
    record.version === PROPOSAL_VERSION &&
    Number.isSafeInteger(record.generation) &&
    record.generation >= 1 &&
    Array.isArray(record.options)
  );
}

/**
 * Public boundary of the workflow-execution-mode module: the scope proposal
 * record, the options of the mode card and the verification of a choice.
 */
export class WorkflowExecutionModeFacade {
  proposalFile(root: string): string {
    return workflowGitFacade.localPath(root, PROPOSAL_FILE);
  }

  options(
    recommended: ExecutionStrategy,
    hasParallelWork: boolean
  ): ExecutionModeOption[] {
    return proposalOptions(recommended, hasParallelWork);
  }

  digest(input: unknown): string {
    return planDigest(input);
  }

  /** The stored proposal; a missing or unreadable record is `null`. */
  readProposal(root: string): ScopeProposal | null {
    const text = workflowPlatformFacade.readTextIfExists(
      this.proposalFile(root)
    );
    if (text === null) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(text);
      return isProposal(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /**
   * Builds the next proposal of the cycle (generation + 1) without writing
   * it. Validates the recommendation, the reason and the options.
   */
  nextProposal(root: string, request: ProposalRequest): ScopeProposal {
    const options = proposalOptions(
      request.recommended,
      request.hasParallelWork
    );
    const reason = validReason(request.reason);
    const previous = this.readProposal(root);
    return {
      choice: null,
      createdAt: request.now,
      generation: (previous?.generation ?? 0) + 1,
      hasParallelWork: request.hasParallelWork,
      input: structuredClone(request.input),
      options,
      planDigest: planDigest(request.input),
      reason,
      recommended: request.recommended,
      refining: false,
      version: PROPOSAL_VERSION,
    };
  }

  writeProposal(root: string, proposal: ScopeProposal): void {
    workflowPlatformFacade.writeFileAtomic(
      this.proposalFile(root),
      `${JSON.stringify(proposal, null, 2)}\n`
    );
  }

  /**
   * Checks a choice against the stored proposal and returns it. A missing
   * proposal, another generation, a proposal in refinement or a stored plan
   * that no longer matches its digest fail with PROPOSAL_CHANGED; an option
   * the card does not offer fails with NO_PARALLEL_WORK (orchestrated
   * without parallel work) or PROPOSAL_OPTION.
   */
  verifyChoice(root: string, request: ChoiceRequest): ScopeProposal {
    ensure(
      OPTIONS.has(request.option),
      "PROPOSAL_OPTION",
      "The option is sequential, orchestrated or refine."
    );
    ensure(
      typeof request.session === "string" && request.session.trim() !== "",
      "PROPOSAL_SESSION",
      "The choice names the session that owns the scope."
    );
    ensure(
      typeof request.note === "string" && request.note.trim() !== "",
      "PROPOSAL_NOTE",
      "The choice records the user's words in the note."
    );
    const proposal = this.readProposal(root);
    const current =
      proposal !== null &&
      proposal.generation === request.generation &&
      proposal.input !== null &&
      proposal.planDigest === planDigest(proposal.input);
    ensure(
      current,
      "PROPOSAL_CHANGED",
      "The choice does not answer the current scope proposal.",
      { current: proposal?.generation ?? null, generation: request.generation },
      "Read the current proposal and let the user choose again."
    );
    ensure(
      request.option !== "orchestrated" || proposal.hasParallelWork,
      "NO_PARALLEL_WORK",
      "The proposed plan has no parallel work; orchestrated execution is not offered."
    );
    ensure(
      proposal.options.includes(request.option),
      "PROPOSAL_OPTION",
      `The proposal offers only: ${proposal.options.join(", ")}.`
    );
    return proposal;
  }

  /** Records "refine": the plan input is dropped and the cycle stays in refinement. */
  refine(
    root: string,
    proposal: ScopeProposal,
    request: ChoiceRequest
  ): ScopeProposal {
    const refined: ScopeProposal = {
      ...proposal,
      choice: {
        at: request.now,
        generation: proposal.generation,
        note: request.note.trim(),
        option: "refine",
        session: request.session.trim(),
      },
      input: null,
      planDigest: null,
      refining: true,
    };
    this.writeProposal(root, refined);
    return refined;
  }

  /** Removes the proposal record: a scope was created or closed. */
  clear(root: string): void {
    rmSync(this.proposalFile(root), { force: true });
  }
}

export const workflowExecutionModeFacade = new WorkflowExecutionModeFacade();
