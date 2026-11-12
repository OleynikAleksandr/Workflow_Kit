import type { WorkflowPlan } from "../../workflow-plan/src/workflow-plan-facade.js";
import type { DocumentsMap } from "./recovery-documents.js";
import type { RoleFacts } from "./recovery-roles.js";

export const RECOVERY_SCHEMA = "harness-workflow-recovery/1";
export const KIT_COMMAND = "scripts/workflow";

export type RecoveryEvent = "clear" | "compact" | "resume" | "startup";

export interface TransactionSummary {
  error: string | null;
  id: string;
  phase: string;
  role: string;
  taskId: string | null;
}

export interface VerificationSummary {
  commit: string | null;
  reports: {
    ok: boolean;
    results: { id: string; output: string; status: string }[];
    stage: string;
  }[];
}

/** Everything the packet needs; gathered by the facade or passed by tests. */
export interface RecoveryInput {
  budgetBytes: number;
  /** Working-tree changes outside the current task. */
  changes: string[];
  /** The documents map of the project; absent or null: no `documents` section. */
  documents?: DocumentsMap | null;
  event: RecoveryEvent;
  head: string | null;
  plan: WorkflowPlan;
  quality: { stacks: string[]; status: string };
  /** Reads a project document by canonical path; null when absent. */
  readDocument: (path: string) => string | null;
  /** Facts that decide the agent role; absent means the plan alone decides. */
  roles?: RoleFacts;
  /** Task id → commit SHA of the completed tasks. */
  taskCommits: Record<string, string>;
  transaction: TransactionSummary | null;
  verification: VerificationSummary | null;
  /** Problems met while gathering the state; shown in the state section. */
  warnings?: string[];
}

export interface PacketSection {
  name: string;
  text: string;
}

export interface RecoveryPacket {
  budget: number;
  bytes: number;
  event: RecoveryEvent;
  included: string[];
  omitted: string[];
  overBudget: boolean;
  references: string[];
  schema: typeof RECOVERY_SCHEMA;
  sections: PacketSection[];
  text: string;
  truncated: boolean;
}

export function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** Cuts text to at most `limit` UTF-8 bytes without splitting a character. */
export function cutBytes(text: string, limit: number): string {
  if (byteLength(text) <= limit) {
    return text;
  }
  let result = Buffer.from(text, "utf8")
    .subarray(0, Math.max(0, limit))
    .toString("utf8");
  while (result.endsWith("�")) {
    result = result.slice(0, -1);
  }
  return result;
}

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 8) : "none";
}
