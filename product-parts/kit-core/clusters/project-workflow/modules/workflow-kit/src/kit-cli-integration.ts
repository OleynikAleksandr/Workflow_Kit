import { type ParsedArgs, requiredFlag } from "./kit-cli-args.js";
import type {
  IntegrationOutcome,
  IntegrationState,
  WorkflowKitFacade,
} from "./workflow-kit-facade.js";

interface IntegrationCommandContext {
  args: ParsedArgs;
  kit: WorkflowKitFacade;
  root: string;
}

interface IntegrationCommandSpec {
  run: (context: IntegrationCommandContext) => unknown;
  text: (result: unknown) => string;
  usage: string;
}

const short = (sha: string | null): string => sha?.slice(0, 12) ?? "none";

function outcomeText(value: unknown): string {
  const result = value as IntegrationOutcome;
  const lines = [
    `integration: ${result.assignmentId} ${result.status}, task ${result.taskId}, source ${short(result.source)} into ${short(result.mainHead)}`,
  ];
  if (result.status === "CONFLICT") {
    for (const file of result.conflicts) {
      lines.push(`conflict: ${file}`);
    }
    lines.push(
      `next: resolve the conflicts inside the files of ${result.taskId}, git add them, then scripts/workflow integration:continue --id ${result.assignmentId}`
    );
    return `${lines.join("\n")}\n`;
  }
  lines.push(`commit: ${short(result.integrationCommit)}`);
  const cleanup = result.assignment?.cleanup;
  lines.push(
    cleanup?.status === "PENDING"
      ? `cleanup: PENDING — ${cleanup.reason} (repeat with scripts/workflow assignment:cleanup --id ${result.assignmentId})`
      : "cleanup: DONE"
  );
  lines.push("next: scripts/workflow assignment:next");
  return `${lines.join("\n")}\n`;
}

function statusText(value: unknown): string {
  const result = value as IntegrationState;
  const journal = result.journal;
  if (!journal) {
    return `integration: IDLE${result.mergeHead ? ` (a merge of ${short(result.mergeHead)} is in progress without the Kit)` : ""}\n`;
  }
  const lines = [
    `integration: ${journal.assignmentId} ${journal.phase}, task ${journal.taskId}, source ${short(journal.source)} into ${short(journal.mainHead)}`,
    ...result.conflicts.map((file) => `conflict: ${file}`),
  ];
  if (journal.error) {
    lines.push(
      `error: ${journal.error.trim().split("\n").slice(-5).join("\n")}`
    );
  }
  lines.push(
    journal.phase === "UNKNOWN"
      ? "next: inspect main (git status, git log -1); the Kit does not retry an unproven state"
      : `next: scripts/workflow integration:continue --id ${journal.assignmentId}`
  );
  return `${lines.join("\n")}\n`;
}

/** Integration of executor results in main (spec 7). */
export const INTEGRATION_COMMANDS: Readonly<
  Record<string, IntegrationCommandSpec>
> = {
  "integration:continue": {
    run: ({ args, kit, root }) =>
      kit.continueIntegration(root, requiredFlag(args, "id")),
    text: outcomeText,
    usage: "integration:continue --id <assignment>",
  },
  "integration:start": {
    run: ({ args, kit, root }) =>
      kit.startIntegration(
        root,
        requiredFlag(args, "id"),
        requiredFlag(args, "source")
      ),
    text: outcomeText,
    usage: "integration:start --id <assignment> --source <sha>",
  },
  "integration:status": {
    run: ({ kit, root }) => kit.integrationStatus(root),
    text: statusText,
    usage: "integration:status",
  },
};
