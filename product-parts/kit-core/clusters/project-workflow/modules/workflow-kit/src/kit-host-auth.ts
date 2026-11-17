// Host authority of the autopilot operations (M39): the Kit process asks its
// direct parent over the Node IPC channel of `child_process.fork` to verify
// and redeem the one-time ticket of this operation before any write. No
// address, file, flag or environment variable replaces the channel.
import { createHash, randomUUID } from "node:crypto";
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";

/** The operations only the host may run. */
export type HostOperation =
  | "accept"
  | "autopilot:authorize"
  | "autopilot:revoke"
  | "close"
  | "quality:apply"
  | "scope:choose"
  | "task:start"
  | "task:unblock";

/** What the ticket is bound to; the parent compares every field. */
export interface HostRequest {
  /** The decision request a user decision applies (M40); absent on M39 run operations. */
  decisionId?: string;
  expectedRevision: number;
  inputDigest: string;
  operation: HostOperation;
  ownerSession: string | null;
  root: string;
  /** The autopilot run; null for a decision of the user outside a run (M40). */
  runId: string | null;
  scopeId: string;
}

/** The parent end as the Kit process sees it (`process` with an IPC channel). */
export interface HostChannel {
  off(event: "disconnect" | "message", listener: (...args: unknown[]) => void): void;
  on(event: "disconnect" | "message", listener: (...args: unknown[]) => void): void;
  send(message: unknown): void;
}

export const HOST_PROTOCOL = "wfk-host/1";
export const HOST_TIMEOUT_MS = 10_000;

interface HostMessage {
  ok?: unknown;
  protocol?: unknown;
  reason?: unknown;
  requestId?: unknown;
  ticket?: unknown;
  type?: unknown;
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

/** sha256 of the canonical JSON (sorted keys). */
export function hostDigest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value) ?? null))
    .digest("hex");
}

/** The IPC channel of this process, or null when it was not forked with one. */
export function processHostChannel(): HostChannel | null {
  if (typeof process.send !== "function" || !process.connected) {
    return null;
  }
  return {
    off: (event, listener) => {
      process.off(event, listener);
    },
    on: (event, listener) => {
      process.on(event, listener);
    },
    send: (message) => {
      process.send?.(message);
    },
  };
}

function invalid(reason: string): Error {
  try {
    ensure(
      false,
      "HOST_AUTH_INVALID",
      `The host did not confirm this operation: ${reason}.`,
      { reason },
      "Only the Workflow Kit app runs this step; finish your task and end the turn."
    );
  } catch (error) {
    return error as Error;
  }
  return new Error(reason);
}

/**
 * Hello → ticket → verify → verdict on the parent channel, with one
 * request id. Messages of another request id are ignored; a refusal, a
 * timeout or a disconnect fails with HOST_AUTH_INVALID. Without a channel
 * the call fails with HOST_AUTH_REQUIRED before anything else.
 */
export function verifyHost(
  channel: HostChannel | null,
  request: HostRequest,
  timeoutMs = HOST_TIMEOUT_MS
): Promise<void> {
  ensure(
    channel !== null,
    "HOST_AUTH_REQUIRED",
    `${request.operation} ${request.decisionId ? "as a user decision" : "with an autopilot run"} is performed only by the Workflow Kit app.`,
    { operation: request.operation },
    "Finish your task and end the turn; the app performs the authorized step."
  );
  const requestId = randomUUID();
  const payloadDigest = hostDigest(request);
  return new Promise<void>((resolve, reject) => {
    let ticketSeen = false;
    const finish = (error: Error | null): void => {
      clearTimeout(timer);
      channel.off("message", onMessage);
      channel.off("disconnect", onDisconnect);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const onDisconnect = (): void => finish(invalid("the host disconnected"));
    const onMessage = (raw: unknown): void => {
      const message = (raw ?? {}) as HostMessage;
      if (
        message.protocol !== HOST_PROTOCOL ||
        message.requestId !== requestId
      ) {
        return;
      }
      if (message.type === "wfk-host-ticket" && !ticketSeen) {
        ticketSeen = true;
        if (typeof message.ticket !== "string" || message.ticket === "") {
          finish(invalid("the host sent no ticket"));
          return;
        }
        channel.send({
          payload: request,
          payloadDigest,
          protocol: HOST_PROTOCOL,
          requestId,
          ticket: message.ticket,
          type: "wfk-host-verify",
        });
        return;
      }
      if (message.type === "wfk-host-verdict" && ticketSeen) {
        finish(
          message.ok === true
            ? null
            : invalid(
                typeof message.reason === "string"
                  ? message.reason
                  : "the ticket was refused"
              )
        );
      }
    };
    const timer = setTimeout(
      () => finish(invalid("no answer in time")),
      timeoutMs
    );
    channel.on("message", onMessage);
    channel.on("disconnect", onDisconnect);
    channel.send({
      operation: request.operation,
      protocol: HOST_PROTOCOL,
      requestId,
      type: "wfk-host-hello",
    });
  });
}
