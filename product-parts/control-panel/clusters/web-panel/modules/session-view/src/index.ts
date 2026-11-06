// Public interface of the session-view module (#session-view): where its panel files live and how
// the backend mounts them. The panel shell loads session-view.js as an extension.
import { fileURLToPath } from 'node:url';

/** URL prefix of the session view files; panel-shell app.js and index.html refer to it. */
export const SESSION_VIEW_PREFIX = '/session-view/';

/** Absolute directory with the session view files. */
export const SESSION_VIEW_ASSETS_DIR: string = fileURLToPath(new URL('.', import.meta.url));

/** Static mount of the session view for the http-server module. */
export function sessionViewMount(): { prefix: string; dir: string } {
  return { prefix: SESSION_VIEW_PREFIX, dir: SESSION_VIEW_ASSETS_DIR };
}
