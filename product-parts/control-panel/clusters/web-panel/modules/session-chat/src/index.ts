// Public interface of the session-chat module (#session-chat): where its panel files live and how
// the backend mounts them. The panel shell loads session-chat.js as an extension.
import { fileURLToPath } from 'node:url';

/** URL prefix of the session chat files; panel-shell app.js and index.html refer to it. */
export const SESSION_CHAT_PREFIX = '/session-chat/';

/** Absolute directory with the session chat files. */
export const SESSION_CHAT_ASSETS_DIR: string = fileURLToPath(new URL('.', import.meta.url));

/** Static mount of the session chat for the http-server module. */
export function sessionChatMount(): { prefix: string; dir: string } {
  return { prefix: SESSION_CHAT_PREFIX, dir: SESSION_CHAT_ASSETS_DIR };
}
