// Public interface of the project-wizard module (#project-wizard): where its panel files live and
// how the backend mounts them. The panel shell loads project-wizard.js as an extension.
import { fileURLToPath } from 'node:url';

/** URL prefix of the wizard files; panel-shell app.js and index.html refer to it. */
export const PROJECT_WIZARD_PREFIX = '/project-wizard/';

/** Absolute directory with the wizard files. */
export const PROJECT_WIZARD_ASSETS_DIR: string = fileURLToPath(new URL('.', import.meta.url));

/** Static mount of the wizard for the http-server module. */
export function projectWizardMount(): { prefix: string; dir: string } {
  return { prefix: PROJECT_WIZARD_PREFIX, dir: PROJECT_WIZARD_ASSETS_DIR };
}
