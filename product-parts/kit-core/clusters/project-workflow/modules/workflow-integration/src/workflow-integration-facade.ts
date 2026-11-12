import { existsSync } from "node:fs";
import type { AssignmentRecord } from "../../workflow-assignment/src/workflow-assignment-facade.js";
import {
  type WorkflowGitFacade,
  workflowGitFacade,
} from "../../workflow-git/src/workflow-git-facade.js";
import {
  type IntegrationState,
  integrationState,
  journalFile,
} from "./integration-journal.js";
import {
  continueIntegration,
  type IntegrationOutcome,
  startIntegration,
} from "./integration-merge.js";
import { type IntegrationProof, proveSource } from "./integration-proof.js";

export type {
  IntegrationJournal,
  IntegrationPhase,
  IntegrationState,
} from "./integration-journal.js";
export type { IntegrationOutcome } from "./integration-merge.js";
export type { IntegrationProof, ProvenCheck } from "./integration-proof.js";

/**
 * Public boundary of the workflow-integration module: integration of
 * executor results into main (spec section 7): the source proof, the merge
 * with its journal, `continue` and the status.
 */
export class WorkflowIntegrationFacade {
  readonly git: WorkflowGitFacade;

  constructor(git: WorkflowGitFacade = workflowGitFacade) {
    this.git = git;
  }

  /** Proves an executor source of an assignment or throws the first failure. */
  proveSource(
    mainRoot: string,
    assignment: AssignmentRecord,
    sourceSha: string
  ): IntegrationProof {
    return proveSource(this.git, mainRoot, assignment, sourceSha);
  }

  /** `integration:start`: proves, merges and commits the source (or continues the same one). */
  start(
    mainRoot: string,
    request: { assignmentId: string; now: () => string; source: string }
  ): IntegrationOutcome {
    return startIntegration(this.git, mainRoot, request);
  }

  /** `integration:continue`: finishes the unfinished integration of the assignment. */
  continue(
    mainRoot: string,
    request: { assignmentId: string; now: () => string }
  ): IntegrationOutcome {
    return continueIntegration(this.git, mainRoot, request);
  }

  /** `integration:status`: IDLE or the journal phase, conflicts and MERGE_HEAD. */
  status(mainRoot: string): IntegrationState {
    return integrationState(this.git, mainRoot);
  }

  /** True while an integration journal exists: other Kit writes are refused. */
  isActive(root: string): boolean {
    return existsSync(journalFile(root));
  }
}

export const workflowIntegrationFacade = new WorkflowIntegrationFacade();
