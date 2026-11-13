// Public, provider-neutral turn interruption contract (M24). No session/process shutdown.
export interface InterruptTarget { turnRef: string; nativeTurnId: string | null }
export type InterruptResult =
  | { status: 'interrupted' | 'already-idle'; stopped: true; proof: 'provider-event' | 'provider-state' | 'pty-marker'; nativeTurnId: string | null }
  | { status: 'unavailable'; stopped: false; reason: string }
  | { status: 'stale'; stopped: false };
export interface InterruptAvailability { available: boolean; reason: string | null }
export const INTERRUPT_TIMEOUT_MS = 10_000;
