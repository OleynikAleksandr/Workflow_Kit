// Whether a project's Kit supports the M39 autopilot, read from the capability its own
// `autopilot:status` reports (spec M39 T004): features, never the version number. A Kit without
// the field (2.2.x, 2.3.0) or with an incomplete one keeps the manual and legacy flow; the panel
// says «Обновите Kit проекта».

/** `capability` of `autopilot:status` (Kit 2.3.1+; `deferDelivery`, `instructions` since 2.3.2/2.3.3). */
export interface KitAutopilotCapability {
  authorization: boolean;
  automation: boolean;
  complete: boolean;
  deferDelivery?: boolean;
  hostProtocol: string;
  instructions?: boolean;
}

/** The host ticket protocol this app speaks (kit-runner `HOST_PROTOCOL`). */
export const SUPPORTED_HOST_PROTOCOL = 'wfk-host/1';

export type AutopilotSupport = { ready: true } | { ready: false; missing: string[]; text: string };

export const UPDATE_KIT_TEXT = 'Обновите Kit проекта: его версия не поддерживает автопилотирование.';

const FEATURES = ['automation', 'authorization', 'deferDelivery', 'instructions', 'complete'] as const;

/** Reads `status.capability`; anything unknown or missing means «update the Kit». */
export function autopilotSupport(status: unknown): AutopilotSupport {
  const capability =
    status && typeof status === 'object' ? (status as { capability?: unknown }).capability : undefined;
  if (!capability || typeof capability !== 'object') {
    return { ready: false, missing: ['capability'], text: UPDATE_KIT_TEXT };
  }
  const given = capability as Record<string, unknown>;
  const missing: string[] = FEATURES.filter((name) => given[name] !== true);
  if (given['hostProtocol'] !== SUPPORTED_HOST_PROTOCOL) missing.push('hostProtocol');
  return missing.length === 0 ? { ready: true } : { ready: false, missing, text: UPDATE_KIT_TEXT };
}
