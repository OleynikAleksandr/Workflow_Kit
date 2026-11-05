// wfk open (and the icon): make sure the backend answers, then open the panel in an app
// window of Chrome or Edge (--app=), otherwise in the default browser.
import { cleanEnv } from '#process-supervisor';
import { startService } from './control.ts';
import type { StartResult } from './control.ts';
import { readCurrent, servicePort } from './deploy.ts';
import { pathApi } from './fs.ts';
import { layoutOf } from './install.ts';
import { envPath, findProgram } from './programs.ts';
import type { ResolvedDeps } from './types.ts';

/** How the panel is opened. */
export interface BrowserPlan {
  command: string;
  args: string[];
  /** Started in the background (browsers that keep running) instead of waited for. */
  detached: boolean;
  kind: 'app-window' | 'browser';
}

/** Inputs of browserPlan; exists and findInPath are injected for tests. */
export interface BrowserPlanInput {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  homedir: string;
  url: string;
  profileDir: string;
  exists: (file: string) => boolean;
  findInPath: (name: string) => string | null;
}

/** Chromium-style flags of an app window with its own profile (works while the browser runs). */
export function appWindowArgs(url: string, profileDir: string): string[] {
  return [`--app=${url}`, `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check'];
}

/** Linux browsers that support --app, in order of preference. */
export const LINUX_APP_BROWSERS: readonly string[] = [
  'google-chrome',
  'google-chrome-stable',
  'microsoft-edge',
  'microsoft-edge-stable',
  'chromium',
  'chromium-browser',
];

/** Chooses the browser and the command that opens the panel. Pure. */
export function browserPlan(input: BrowserPlanInput): BrowserPlan {
  const args = appWindowArgs(input.url, input.profileDir);
  if (input.platform === 'darwin') {
    const p = pathApi('darwin');
    const apps = ['Google Chrome.app', 'Microsoft Edge.app', 'Chromium.app'].flatMap((name) => [
      p.join('/Applications', name),
      p.join(input.homedir, 'Applications', name),
    ]);
    const app = apps.find((candidate) => input.exists(candidate));
    if (app) return { command: '/usr/bin/open', args: ['-na', app, '--args', ...args], detached: false, kind: 'app-window' };
    return { command: '/usr/bin/open', args: [input.url], detached: false, kind: 'browser' };
  }
  if (input.platform === 'win32') {
    const p = pathApi('win32');
    const env = input.env;
    const roots = [env['ProgramFiles(x86)'], env['ProgramFiles'], env['LOCALAPPDATA']].filter((root): root is string => Boolean(root));
    const candidates = [
      ...roots.map((root) => p.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
      ...roots.map((root) => p.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')),
    ];
    const exe = candidates.find((candidate) => input.exists(candidate));
    if (exe) return { command: exe, args, detached: true, kind: 'app-window' };
    const systemRoot = env['SystemRoot'] || env['SYSTEMROOT'] || 'C:\\Windows';
    return { command: `${systemRoot}\\System32\\rundll32.exe`, args: ['url.dll,FileProtocolHandler', input.url], detached: true, kind: 'browser' };
  }
  for (const name of LINUX_APP_BROWSERS) {
    const found = input.findInPath(name);
    if (found) return { command: found, args, detached: true, kind: 'app-window' };
  }
  return { command: input.findInPath('xdg-open') ?? 'xdg-open', args: [input.url], detached: true, kind: 'browser' };
}

/** Result of openPanel. */
export interface OpenResult {
  url: string;
  start: StartResult;
  plan: BrowserPlan;
}

/** Starts the backend when it does not answer, waits for it and opens the panel window. */
export async function openPanel(deps: ResolvedDeps): Promise<OpenResult> {
  const layout = layoutOf(deps);
  const current = await readCurrent(deps.fs, layout);
  const port = await servicePort(deps.fs, layout, deps.env);
  const start = await startService(deps, { layout, current, port });
  const url = `http://127.0.0.1:${port}/`;
  const plan = browserPlan({
    platform: deps.platform,
    env: deps.env,
    homedir: deps.homedir,
    url,
    profileDir: layout.browserProfile,
    exists: (file) => deps.fs.existsSync(file),
    findInPath: (name) => findProgram(name, envPath(deps.env), { platform: deps.platform, env: deps.env, isExecutable: (file) => deps.fs.isExecutable(file) }),
  });
  const env = cleanEnv(deps.env, { platform: deps.platform });
  if (plan.detached) {
    await deps.spawnDetached(plan.command, plan.args, { env });
  } else {
    const result = await deps.run(plan.command, plan.args, { env });
    if (result.code !== 0) {
      throw new Error(`не удалось открыть панель (${plan.command}): ${(result.stderr || result.startError || '').trim()}; адрес ${url}`);
    }
  }
  return { url, start, plan };
}
