// Public interface of the provider-cards module (#provider-cards): where its panel files live and
// how the backend mounts them. The panel shell loads provider-cards.js as an extension.
import { fileURLToPath } from 'node:url';

/** URL prefix of the provider cards files; panel-shell app.js and index.html refer to it. */
export const PROVIDER_CARDS_PREFIX = '/provider-cards/';

/** Absolute directory with the provider cards files (provider-cards.js, model.js, CSS). */
export const PROVIDER_CARDS_ASSETS_DIR: string = fileURLToPath(new URL('.', import.meta.url));

/** Static mount of the provider cards for the http-server module. */
export function providerCardsMount(): { prefix: string; dir: string } {
  return { prefix: PROVIDER_CARDS_PREFIX, dir: PROVIDER_CARDS_ASSETS_DIR };
}
