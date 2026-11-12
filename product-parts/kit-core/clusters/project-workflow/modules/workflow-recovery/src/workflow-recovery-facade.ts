import {
  type WorkflowGitFacade,
  workflowGitFacade,
} from "../../workflow-git/src/workflow-git-facade.js";
import {
  type InputSchema,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import { assemblePacket, extractHeading } from "./recovery-budget.js";
import {
  type HistoryEntry,
  type HookClient,
  historyText,
  hookEvent,
  sessionStartResponse,
  showTaskText,
  workflowHistory,
} from "./recovery-commands.js";
import {
  type DocumentsMap,
  type DocumentsMapOptions,
  documentsMap,
} from "./recovery-documents.js";
import { type GatherNotes, gatherRecovery } from "./recovery-gather.js";
import type {
  RecoveryEvent,
  RecoveryInput,
  RecoveryPacket,
} from "./recovery-model.js";
import { type PartRequest, packetParts } from "./recovery-parts.js";
import {
  inputSchema,
  inputSchemaCommands,
  schemaText,
} from "./recovery-schema.js";

export type { HistoryEntry, HookClient } from "./recovery-commands.js";
export { HOST_RECOVERY_VARIABLE } from "./recovery-commands.js";
export type {
  DocumentEntry,
  DocumentsMap,
  DocumentsMapOptions,
} from "./recovery-documents.js";
export type {
  PacketSection,
  RecoveryEvent,
  RecoveryInput,
  RecoveryPacket,
  TransactionSummary,
  VerificationSummary,
} from "./recovery-model.js";
export type { PacketParts, PartRequest } from "./recovery-parts.js";
export {
  MAX_PARTS,
  PART_LIMIT,
  packetParts,
  parsePart,
} from "./recovery-parts.js";

/**
 * Public facade of the workflow-recovery module: the bounded recovery
 * packet, the session-start hook and on-demand task history.
 */
export class WorkflowRecoveryFacade {
  readonly git: WorkflowGitFacade;

  constructor(git: WorkflowGitFacade = workflowGitFacade) {
    this.git = git;
  }

  /** Builds the packet from already gathered state. */
  build(input: RecoveryInput): RecoveryPacket {
    return assemblePacket(input);
  }

  /** Markdown section under a heading, matched by text or slug. */
  section(text: string, heading: string): string | null {
    return extractHeading(text, heading);
  }

  /**
   * The documents map of a project (the packet `documents` section):
   * Markdown files known to git (only under `folder` when given), the
   * specification folder first, within `budget` bytes (default 4000) with a
   * tail line (hint `more`) for the rest.
   */
  documentsMap(root: string, options: DocumentsMapOptions = {}): DocumentsMap {
    return documentsMap(this.git, root, options);
  }

  /**
   * Input descriptor of a Kit command (the plan commands, `digest` and
   * `quality:apply`, read from their owner facades), or null.
   */
  inputSchema(command: string): InputSchema | null {
    return inputSchema(command);
  }

  /** Commands with an input descriptor, in a stable order. */
  inputSchemaCommands(): string[] {
    return inputSchemaCommands();
  }

  /** The compact text of a descriptor, as the packet `schema` section shows it. */
  schemaText(schema: InputSchema): string {
    return schemaText(schema);
  }

  /** Reads plan, configuration, git state and evidence of a project. */
  gather(root: string, event: RecoveryEvent = "startup"): RecoveryInput {
    const notes: GatherNotes = { warnings: [] };
    const input = gatherRecovery(this.git, root, event, notes);
    return { ...input, warnings: notes.warnings };
  }

  packet(root: string, event: RecoveryEvent = "startup"): RecoveryPacket {
    return assemblePacket(this.gather(root, event));
  }

  /** `recover --format text|json`. */
  render(packet: RecoveryPacket, format: "json" | "text" = "text"): string {
    return format === "json"
      ? `${JSON.stringify(packet, null, 2)}\n`
      : packet.text;
  }

  /**
   * `hook session-start --client claude|codex [--part K/N]`: reads the hook
   * input and answers in the SessionStart format, with the whole packet or
   * with its part K (no context when the packet has fewer parts). Errors
   * never block the session.
   */
  sessionStart(
    root: string,
    options: {
      client: HookClient;
      env?: NodeJS.ProcessEnv;
      part?: PartRequest | null;
      stdin: string;
    }
  ): string {
    const event = hookEvent(options.stdin);
    return sessionStartResponse(() => {
      let text: string;
      try {
        text = this.packet(root, event).text;
      } catch (error) {
        const { code, message } = error as { code?: string; message: string };
        text = `Workflow Kit could not build the recovery packet (${code ?? "error"}): ${message}\nRun \`scripts/workflow doctor\`.`;
      }
      const part = options.part;
      if (!part) {
        return text;
      }
      return packetParts(text, part.count).parts[part.index - 1] ?? null;
    }, options.env ?? process.env);
  }

  /** `show-task <ID>`: the full task text with its commit when done. */
  showTask(root: string, taskId: string): string {
    const input = this.gather(root);
    return showTaskText(input.plan, taskId, input.taskCommits);
  }

  /** `history [--task ID] [--round R]`: workflow commits from git. */
  history(
    root: string,
    filter: { round?: string; task?: string } = {}
  ): { entries: HistoryEntry[]; text: string } {
    const plan =
      workflowPlanFacade.read(root) ??
      workflowPlanFacade.createEmpty("unknown", "Project");
    const entries = workflowHistory(this.git, root, plan, filter);
    return { entries, text: historyText(entries) };
  }
}

export const workflowRecoveryFacade = new WorkflowRecoveryFacade();
