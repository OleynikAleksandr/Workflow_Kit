// One-time host tickets of the autopilot transitions (M39). The service
// issues a ticket after it checked the real source of the step, binds it to
// the project root, run, scope, owner, operation, expected revision and the
// input digest, and hands it only to the Kit child it forks (kit-runner
// runHost). The ticket is never written to an environment, a file or a log.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { realpathSync } from 'node:fs';
import type { HostPayload, HostVerdict, HostVerifier } from '#kit-runner';

/** The operations only the host performs (the Kit's `HostOperation`). */
export type HostOperation = 'accept' | 'autopilot:authorize' | 'autopilot:revoke' | 'close';

export type HostBinding = HostPayload & { operation: HostOperation };

/** A redeemed ticket, for the run journal (spec M39: kept across restarts). */
export interface HostRedemption {
  binding: HostBinding;
  redeemedAt: number;
  ticketId: string;
}

export interface HostTicketsOptions {
  now?: () => number;
  /** Lifetime of a ticket (default 60 s). */
  ttlMs?: number;
  /** Called once when a ticket is redeemed, before the verdict is sent. */
  onRedeem?: (redemption: HostRedemption) => void;
}

export interface HostTickets {
  /** A verifier for one child: its ticket and the one-time check. */
  issue(binding: HostBinding): HostVerifier & { ticketId: string };
  /** Ids of redeemed tickets (restored from the journal after a restart). */
  redeemed(): string[];
  /** Marks ticket ids as redeemed, e.g. from the run journal after a restart. */
  restore(ticketIds: readonly string[]): void;
}

export const HOST_TICKET_TTL_MS = 60_000;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** sha256 of the canonical JSON: the Kit's `hostDigest` of an input or a payload. */
export function hostInputDigest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value) ?? null))
    .digest('hex');
}

function realRoot(root: string): string {
  try {
    return realpathSync(root);
  } catch {
    return root;
  }
}

function sameText(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

const FIELDS = ['expectedRevision', 'inputDigest', 'operation', 'ownerSession', 'runId', 'scopeId'] as const;

function mismatch(binding: HostBinding, payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return 'payload';
  const given = payload as Record<string, unknown>;
  for (const field of FIELDS) {
    if (given[field] !== binding[field]) return field;
  }
  return typeof given['root'] === 'string' && realRoot(given['root']) === realRoot(binding.root) ? null : 'root';
}

export function createHostTickets(options: HostTicketsOptions = {}): HostTickets {
  const now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? HOST_TICKET_TTL_MS;
  const spent = new Set<string>();
  return {
    issue(binding) {
      const ticketId = randomBytes(9).toString('base64url');
      const ticket = `${ticketId}.${randomBytes(32).toString('base64url')}`;
      const expiresAt = now() + ttl;
      const verify = (request: { payload: unknown; payloadDigest: unknown; ticket: unknown }): HostVerdict => {
        if (typeof request.ticket !== 'string' || !sameText(request.ticket, ticket)) return { ok: false, reason: 'unknown ticket' };
        if (spent.has(ticketId)) return { ok: false, reason: 'ticket already used' };
        if (now() > expiresAt) return { ok: false, reason: 'ticket expired' };
        if (request.payloadDigest !== hostInputDigest(request.payload)) return { ok: false, reason: 'payload digest' };
        const field = mismatch(binding, request.payload);
        if (field) return { ok: false, reason: `ticket bound to another ${field}` };
        // Redeemed before the verdict leaves: a replay of the same child or ticket is refused.
        spent.add(ticketId);
        options.onRedeem?.({ binding: structuredClone(binding), redeemedAt: now(), ticketId });
        return { ok: true };
      };
      return { ticket, ticketId, verify };
    },
    redeemed: () => [...spent],
    restore(ticketIds) {
      for (const id of ticketIds) spent.add(id);
    },
  };
}
