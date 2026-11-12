import {
  type IntegrationOutcome,
  type IntegrationState,
  WorkflowIntegrationFacade,
} from "../../workflow-integration/src/workflow-integration-facade.js";
import { type KitContext, locked } from "./kit-context.js";

function integration(context: KitContext): WorkflowIntegrationFacade {
  return new WorkflowIntegrationFacade(context.git);
}

/**
 * `integration:start --id <assignment> --source <sha>` in main (spec 7),
 * under the project lock: the preconditions, proof, merge, plan candidate,
 * scope check and integration commit belong to `workflow-integration`.
 */
export function startIntegration(
  context: KitContext,
  assignmentId: string,
  source: string
): IntegrationOutcome {
  return locked(context, () =>
    integration(context).start(context.root, {
      assignmentId,
      now: context.now,
      source,
    })
  );
}

/** `integration:continue --id <assignment>`: finishes after a conflict, failed checks or a crash. */
export function continueIntegration(
  context: KitContext,
  assignmentId: string
): IntegrationOutcome {
  return locked(context, () =>
    integration(context).continue(context.root, {
      assignmentId,
      now: context.now,
    })
  );
}

/** `integration:status`, read-only. */
export function integrationStatus(context: KitContext): IntegrationState {
  return integration(context).status(context.root);
}
