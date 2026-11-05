// @ts-check
// JSON API helpers of the panel. Mutating requests send JSON (the backend access filter requires
// Content-Type application/json and a same-origin Origin header, which the browser adds itself).

/** Error answer of the backend: { error: { code, message, hint?, blockers? } }. */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    /** @type {string | undefined} */
    this.hint = typeof details['hint'] === 'string' ? details['hint'] : undefined;
    /** @type {string[]} */
    this.blockers = Array.isArray(details['blockers']) ? details['blockers'].map(String) : [];
  }
}

/** A request slower than this is aborted. */
const TIMEOUT_MS = 15000;

/**
 * Sends a request and returns the parsed JSON; non-2xx answers throw ApiError.
 * @param {string} method
 * @param {string} url
 * @param {unknown} [body]
 * @returns {Promise<any>}
 */
export async function api(method, url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  /** @type {RequestInit} */
  const init = { method, cache: 'no-store', signal: controller.signal };
  if (method !== 'GET' && method !== 'HEAD') {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body ?? {});
  }
  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    throw new ApiError(0, 'network', aborted ? 'Бэкенд не ответил вовремя' : 'Нет связи с бэкендом');
  } finally {
    clearTimeout(timer);
  }
  /** @type {any} */
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = data && typeof data === 'object' ? data.error : undefined;
    const details = error && typeof error === 'object' ? error : {};
    throw new ApiError(
      response.status,
      typeof details.code === 'string' ? details.code : 'http',
      typeof details.message === 'string' ? details.message : `HTTP ${response.status}`,
      details,
    );
  }
  return data;
}

/**
 * GET helper.
 * @param {string} url
 * @returns {Promise<any>}
 */
export function apiGet(url) {
  return api('GET', url);
}
