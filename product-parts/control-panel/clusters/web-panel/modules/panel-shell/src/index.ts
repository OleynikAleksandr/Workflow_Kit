// Public interface of the panel-shell module (#panel-shell): where the panel files live.
import { fileURLToPath } from 'node:url';

/** Absolute directory with the panel files (index.html, app.js, styles.css, cards). */
export const PANEL_ASSETS_DIR: string = fileURLToPath(new URL('.', import.meta.url));

/** Static mount of the panel shell at the site root, for the http-server module. */
export function panelShellMount(): { prefix: string; dir: string } {
  return { prefix: '/', dir: PANEL_ASSETS_DIR };
}

/** Polling interval of /api/state in the panel, milliseconds (D3). */
export const STATE_POLL_MS = 3000;
