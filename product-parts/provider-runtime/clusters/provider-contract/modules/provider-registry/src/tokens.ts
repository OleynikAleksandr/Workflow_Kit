// One-time preview tokens (D7): previewTrust issues a token bound to a scope (provider + project)
// and to a fingerprint of what it showed; grantTrust consumes it and compares the fingerprint, so a
// change between the preview and the write is refused.
import { randomBytes } from 'node:crypto';

/** Default lifetime of a preview token. */
export const PREVIEW_TOKEN_TTL_MS = 10 * 60 * 1000;

/** An issued token. */
export interface IssuedToken {
  token: string;
  expiresAt: string;
}

/** Store of preview tokens kept in memory. */
export interface TokenStore {
  /** Issues a token for scope; an older token of the same scope stops working. */
  issue(scope: string, fingerprint: string): IssuedToken;
  /** Consumes the token: the fingerprint when it is valid for scope, undefined otherwise (also when expired). */
  consume(scope: string, token: string): string | undefined;
}

/** Creates a token store; the clock and the token source are injectable for tests. */
export function createTokenStore(options: { ttlMs?: number; now?: () => Date; newToken?: () => string } = {}): TokenStore {
  const ttlMs = options.ttlMs ?? PREVIEW_TOKEN_TTL_MS;
  const now = options.now ?? (() => new Date());
  const newToken = options.newToken ?? (() => randomBytes(18).toString('base64url'));
  const tokens = new Map<string, { token: string; fingerprint: string; expires: number }>();
  return {
    issue(scope, fingerprint) {
      const expires = now().getTime() + ttlMs;
      const token = newToken();
      tokens.set(scope, { token, fingerprint, expires });
      return { token, expiresAt: new Date(expires).toISOString() };
    },
    consume(scope, token) {
      const entry = tokens.get(scope);
      if (!entry || entry.token !== token) return undefined;
      tokens.delete(scope);
      return entry.expires >= now().getTime() ? entry.fingerprint : undefined;
    },
  };
}
