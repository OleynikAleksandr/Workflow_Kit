// GET/POST /api/settings/autopiloting and the "autopiloting" section of /api/state (spec M39
// runtime section 1). The section holds the settings and a brief of each project's last run,
// never the quotes of the user's words.
import { HttpError } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import type { Runs } from './runs.ts';
import { SettingsError } from './settings.ts';
import type { SettingsStore } from './settings.ts';

export function registerAutopilotingRoutes(options: { router: Router; state: StateRegistry; settings: SettingsStore; runs: Runs }): void {
  const { router, settings, runs } = options;
  router.get('/api/settings/autopiloting', async () => {
    const view = await settings.read();
    return { ...view.settings, error: view.error };
  });
  router.post('/api/settings/autopiloting', async ({ body }) => {
    try {
      return await settings.write(body);
    } catch (error) {
      if (error instanceof SettingsError) throw new HttpError(error.status, error.code, error.message, error.current ? { current: error.current } : undefined);
      throw error;
    }
  });
  options.state.add('autopiloting', async () => {
    const view = await settings.read();
    return { settings: view.settings, error: view.error, ...(await runs.section()) };
  });
}
