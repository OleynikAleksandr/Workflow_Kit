// The "workflow" section of /api/state: per project, the cached Kit status and proposal with the
// plan and choice card models. Kit commands run only when the project's plan files change
// (.harness/plans, .harness/workflow/local; 300 ms of quiet), on start and on explicit refresh;
// reading the section never runs a command.
import { watch as fsWatch } from 'node:fs';
import path from 'node:path';
import { buildChoiceCard, buildPlanView } from '#plan-view';
import type { ChoiceCard, KitExecution, KitProposal, KitScope, KitStatus, PlanView } from '#plan-view';
import type { KitRunner } from './runner.ts';

export const WORKFLOW_DEBOUNCE_MS = 300;
/** How often the project list is compared with the watched projects (no Kit commands). */
export const WORKFLOW_SYNC_MS = 10_000;

/** A closable watcher; the listener gets the changed path relative to the watched folder. */
export interface Watcher {
  close(): void;
}
export type WatchFactory = (
  folder: string,
  options: { recursive: boolean },
  listener: (filename: string | null) => void,
) => Watcher | null;

/** Default watch: fs.watch; a missing folder or an unsupported platform gives null. */
export const nodeWatch: WatchFactory = (folder, options, listener) => {
  try {
    const watcher = fsWatch(folder, { recursive: options.recursive, persistent: false }, (_event, filename) =>
      listener(filename === null ? null : String(filename)),
    );
    watcher.on('error', () => watcher.close());
    return watcher;
  } catch {
    return null;
  }
};

/** Workflow state of one project. */
export interface ProjectWorkflow {
  projectId: string;
  installed: boolean;
  revision: number | null;
  scope: KitScope | null;
  execution: KitExecution | null;
  paused: boolean;
  proposal: KitProposal | null;
  plan: PlanView | null;
  choice: ChoiceCard | null;
  error: { code: string; message: string; nextAction: string | null } | null;
  updatedAt: string | null;
  refreshing: boolean;
}

export interface WorkflowSection {
  projects: Record<string, ProjectWorkflow>;
}

export interface WorkflowProjectRef {
  id: string;
  path: string;
}

export interface WorkflowStateOptions {
  runner: KitRunner;
  listProjects: () => Promise<WorkflowProjectRef[]>;
  watch?: WatchFactory;
  debounceMs?: number;
  syncMs?: number;
  now?: () => Date;
  log?: (line: string) => void;
  /** Called after a project's state changed (for example to notify the panel). */
  onChange?: (projectId: string) => void;
}

export interface WorkflowState {
  /** Watches the registered projects and reads their state once. */
  start(): Promise<void>;
  /** Compares the project list with the watched projects; new ones are read once. */
  sync(): Promise<void>;
  /** Runs status (and scope:proposal) now; concurrent calls share one run. */
  refresh(projectId: string): Promise<ProjectWorkflow | undefined>;
  get(projectId: string): ProjectWorkflow | undefined;
  /** Status of the last successful read (for the session loop), or undefined. */
  status(projectId: string): KitStatus | undefined;
  section(): WorkflowSection;
  /**
   * Closes the watchers of a project and forgets it until the next sync lists it again. Windows
   * keeps a watched folder busy, so the folder is released before it is deleted.
   */
  release(projectId: string): void;
  stop(): void;
}

interface Entry {
  ref: WorkflowProjectRef;
  view: ProjectWorkflow;
  status: KitStatus | undefined;
  rootWatcher: Watcher | null;
  harnessWatcher: Watcher | null;
  timer: NodeJS.Timeout | null;
  running: Promise<void> | null;
  dirty: boolean;
}

function emptyView(projectId: string): ProjectWorkflow {
  return {
    projectId,
    installed: false,
    revision: null,
    scope: null,
    execution: null,
    paused: false,
    proposal: null,
    plan: null,
    choice: null,
    error: null,
    updatedAt: null,
    refreshing: false,
  };
}

/** True for a change below .harness that matters to the plan. */
export function isPlanChange(filename: string | null): boolean {
  if (filename === null) return true;
  const normalized = filename.split(path.sep).join('/');
  return normalized === 'plans' || normalized.startsWith('plans/') || normalized === 'workflow/local' || normalized.startsWith('workflow/local/');
}

export function createWorkflowState(options: WorkflowStateOptions): WorkflowState {
  const watch = options.watch ?? nodeWatch;
  const debounceMs = options.debounceMs ?? WORKFLOW_DEBOUNCE_MS;
  const now = options.now ?? (() => new Date());
  const log = options.log ?? (() => undefined);
  const entries = new Map<string, Entry>();
  let syncTimer: NodeJS.Timeout | null = null;
  let stopped = false;

  function schedule(entry: Entry): void {
    if (stopped) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void refreshEntry(entry);
    }, debounceMs);
    entry.timer.unref?.();
  }

  function armHarness(entry: Entry): void {
    entry.harnessWatcher?.close();
    entry.harnessWatcher = watch(path.join(entry.ref.path, '.harness'), { recursive: true }, (filename) => {
      if (isPlanChange(filename)) schedule(entry);
    });
  }

  function arm(entry: Entry): void {
    entry.rootWatcher = watch(entry.ref.path, { recursive: false }, (filename) => {
      if (filename !== null && filename !== '.harness') return;
      armHarness(entry);
      schedule(entry);
    });
    armHarness(entry);
  }

  function disarm(entry: Entry): void {
    entry.rootWatcher?.close();
    entry.harnessWatcher?.close();
    entry.rootWatcher = null;
    entry.harnessWatcher = null;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
  }

  async function read(entry: Entry): Promise<void> {
    const root = entry.ref.path;
    const view = entry.view;
    if (!options.runner.installed(root)) {
      Object.assign(view, emptyView(view.projectId), { updatedAt: now().toISOString(), refreshing: true });
      entry.status = undefined;
      return;
    }
    const status = await options.runner.status(root);
    if (!status.ok) {
      view.installed = true;
      view.error = { code: status.code, message: status.message, nextAction: status.nextAction };
      view.updatedAt = now().toISOString();
      return;
    }
    const kit = status.result;
    let proposal: KitProposal | null = null;
    let error: ProjectWorkflow['error'] = null;
    if (kit.scopeProposal) {
      const outcome = await options.runner.proposal(root);
      if (outcome.ok) proposal = outcome.result;
      else error = { code: outcome.code, message: outcome.message, nextAction: outcome.nextAction };
    }
    entry.status = kit;
    Object.assign(view, {
      installed: kit.installed,
      revision: kit.revision,
      scope: kit.scope,
      execution: kit.execution,
      paused: kit.paused,
      proposal,
      plan: buildPlanView(kit),
      choice: buildChoiceCard(proposal),
      error,
      updatedAt: now().toISOString(),
    });
  }

  function refreshEntry(entry: Entry): Promise<void> {
    if (entry.running) {
      entry.dirty = true;
      return entry.running;
    }
    entry.view.refreshing = true;
    entry.running = (async () => {
      try {
        do {
          entry.dirty = false;
          try {
            await read(entry);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            entry.view.error = { code: 'KIT_OUTPUT', message, nextAction: null };
            log(`workflow: ${entry.ref.id}: ${message}`);
          }
        } while (entry.dirty && !stopped);
      } finally {
        entry.view.refreshing = false;
        entry.running = null;
        options.onChange?.(entry.ref.id);
      }
    })();
    return entry.running;
  }

  async function sync(): Promise<void> {
    if (stopped) return;
    let projects: WorkflowProjectRef[];
    try {
      projects = await options.listProjects();
    } catch (error) {
      log(`workflow: project list: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const seen = new Set<string>();
    const fresh: Entry[] = [];
    for (const ref of projects) {
      seen.add(ref.id);
      const existing = entries.get(ref.id);
      if (existing && existing.ref.path === ref.path) continue;
      if (existing) disarm(existing);
      const entry: Entry = {
        ref,
        view: emptyView(ref.id),
        status: undefined,
        rootWatcher: null,
        harnessWatcher: null,
        timer: null,
        running: null,
        dirty: false,
      };
      entries.set(ref.id, entry);
      arm(entry);
      fresh.push(entry);
    }
    for (const [id, entry] of entries) {
      if (!seen.has(id)) {
        disarm(entry);
        entries.delete(id);
      }
    }
    await Promise.all(fresh.map((entry) => refreshEntry(entry)));
  }

  return {
    async start() {
      stopped = false;
      await sync();
      const every = options.syncMs ?? WORKFLOW_SYNC_MS;
      if (every > 0) {
        syncTimer = setInterval(() => void sync(), every);
        syncTimer.unref?.();
      }
    },
    sync,
    async refresh(projectId) {
      let entry = entries.get(projectId);
      if (!entry) {
        await sync();
        entry = entries.get(projectId);
        if (!entry) return undefined;
      }
      await refreshEntry(entry);
      return entry.view;
    },
    get: (projectId) => entries.get(projectId)?.view,
    status: (projectId) => entries.get(projectId)?.status,
    section() {
      const projects: Record<string, ProjectWorkflow> = {};
      for (const [id, entry] of entries) projects[id] = { ...entry.view };
      return { projects };
    },
    release(projectId) {
      const entry = entries.get(projectId);
      if (!entry) return;
      disarm(entry);
      entries.delete(projectId);
    },
    stop() {
      stopped = true;
      if (syncTimer) clearInterval(syncTimer);
      syncTimer = null;
      for (const entry of entries.values()) disarm(entry);
    },
  };
}
