// Remote Control ids and links. `cse_X` (debug file, transcript) and `session_X` (claude.ai link)
// name the same session; links use the session_ form.
import type { SessionLinks } from '#provider-registry';

const REMOTE_ID = /^(?:cse|session)_([A-Za-z0-9]+)$/;

/** Normalizes `cse_X` or `session_X` to `session_X`; null for anything else. */
export function normalizeRemoteId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = REMOTE_ID.exec(value.trim());
  return match ? `session_${match[1]}` : null;
}

/**
 * Links of a Remote Control session: Claude Desktop on the Mac (`claude://`), the Claude app on
 * iPad and the web (`https://`, opens the app when it is installed).
 */
export function sessionLinks(remoteId: string): SessionLinks {
  const id = normalizeRemoteId(remoteId);
  if (!id) return {};
  return {
    desktop: `claude://claude.ai/code/${id}`,
    mobile: `https://claude.ai/code/${id}`,
    web: `https://claude.ai/code/${id}`,
  };
}
