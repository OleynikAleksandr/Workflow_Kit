// The Kit facts and host steps of an autopiloting run (spec M39): the project's own
// `autopilot:status` and `status`, the grant and its revocation through `KitRunner.runHost` with
// a one-time host ticket. Only public Kit commands; `.harness/**` is never read.
import { realpathSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { KitOutcome, KitRunner } from '#kit-runner';
import { autopilotSupport } from '#plan-view';
import type { KitProposal, KitProposalDigest } from '#plan-view';
import type { HostOperation, HostTickets } from './host-ticket.ts';
import { hostInputDigest } from './host-ticket.ts';

/** The part of `autopilot:status` (Kit 2.3.3) a run reads. */
export interface RunKitStatus {
  revision: number;
  head: string | null;
  capability?: unknown;
  proposal?: { digest: string; generation: number } | null;
  authorization?: { runId: string; revision: number; revoked: unknown; delivery: Array<{ taskId: string }>; accept: boolean; close: boolean; ci?: unknown } | null;
  /** The next task of the plan (T007: a started delivery deferred after a red CI). */
  nextTask?: { id: string; kind: string; status: string } | null;
  acceptance?: Array<{ criterion: number; kind: 'automatic' | 'manual' }> | null;
}

/** The automation block of the scope as `status` shows it (Kit 2.3.0+). */
export interface RunAutomation {
  acceptance: Array<{ criterion: number; kind: 'automatic' | 'manual' }>;
  ci: unknown;
  delivery: Array<{ taskId: string; effects: string[] }>;
  publication: { branch: string; upstream: string } | null;
}

export interface RunScope {
  id: string;
  ownerSession: string | null;
  automation: RunAutomation | null;
}

export interface HostStep {
  ok: boolean;
  code: string | null;
  message: string | null;
  result: Record<string, unknown> | null;
  ticketId: string;
  redeemed: boolean;
}

const RETRIES = 3;

export function realRoot(root: string): string {
  try {
    return realpathSync(root);
  } catch {
    return root;
  }
}

export function createRunKit(options: { runner: KitRunner; tickets: HostTickets }) {
  async function read<T>(root: string, args: string[]): Promise<T | null> {
    if (!options.runner.installed(root)) return null;
    const outcome: KitOutcome<T> = await options.runner.run<T>(root, args);
    return outcome.ok ? outcome.result : null;
  }

  return {
    status: (root: string) => read<RunKitStatus>(root, ['autopilot:status']),
    /** A public Kit command of the run (T007: `task:defer-delivery`); the Kit outcome as it is. */
    command: <T>(root: string, args: string[]): Promise<KitOutcome<T>> => options.runner.run<T>(root, args),
    /** The open proposal (`scope:proposal`): recommended mode and options; null without one. */
    proposal: async (root: string): Promise<KitProposal | null> => {
      if (!options.runner.installed(root)) return null;
      const outcome = await options.runner.proposal(root);
      return outcome.ok ? outcome.result : null;
    },
    /** The digest of the open proposal (`scope:proposal --digest`); null without one. */
    digest: async (root: string): Promise<KitProposalDigest | null> => {
      if (!options.runner.installed(root)) return null;
      const outcome = await options.runner.proposalDigest(root);
      return outcome.ok ? outcome.result : null;
    },
    supported: (status: RunKitStatus | null) => autopilotSupport(status),

    async scope(root: string): Promise<RunScope | null> {
      const status = await read<{ scope?: { id?: string; automation?: RunAutomation | null } | null; execution?: { ownerSession?: string | null } | null }>(root, ['status']);
      if (!status?.scope?.id) return null;
      return { id: status.scope.id, ownerSession: status.execution?.ownerSession ?? null, automation: status.scope.automation ?? null };
    },

    /**
     * A host-only command with a ticket bound to this step; a stale revision (the agent committed
     * meanwhile) is retried with the fresh one. The input file lives in `.harness/inputs/` only
     * for the call.
     */
    async host(
      root: string,
      step: { operation: HostOperation; runId: string; scopeId: string; ownerSession: string | null; input: Record<string, unknown>; args: (inputFile: string | null, revision: number) => string[]; file: boolean },
    ): Promise<HostStep> {
      let last: HostStep | null = null;
      for (let attempt = 0; attempt < RETRIES; attempt += 1) {
        const status = await read<RunKitStatus>(root, ['autopilot:status']);
        if (!status) return { ok: false, code: 'KIT_UNAVAILABLE', message: 'Kit проекта не ответил', result: null, ticketId: '', redeemed: false };
        const inputFile = step.file ? `.harness/inputs/autopilot-${step.runId}-${step.operation.replace(':', '-')}.json` : null;
        if (inputFile) {
          await mkdir(path.join(root, '.harness', 'inputs'), { recursive: true });
          await writeFile(path.join(root, ...inputFile.split('/')), `${JSON.stringify(step.input, null, 2)}\n`);
        }
        const verifier = options.tickets.issue({
          operation: step.operation,
          root: realRoot(root),
          runId: step.runId,
          scopeId: step.scopeId,
          ownerSession: step.ownerSession,
          expectedRevision: status.revision,
          inputDigest: hostInputDigest(step.input),
        });
        const outcome = await options.runner.runHost<Record<string, unknown>>(root, step.args(inputFile, status.revision), verifier);
        if (inputFile) await rm(path.join(root, ...inputFile.split('/')), { force: true });
        const redeemed = options.tickets.redeemed().includes(verifier.ticketId);
        last = outcome.ok
          ? { ok: true, code: null, message: null, result: outcome.result, ticketId: verifier.ticketId, redeemed }
          : { ok: false, code: outcome.code, message: outcome.message, result: null, ticketId: verifier.ticketId, redeemed };
        if (outcome.ok || outcome.code !== 'REVISION_MISMATCH') return last;
      }
      return last!;
    },
  };
}

export type RunKit = ReturnType<typeof createRunKit>;
