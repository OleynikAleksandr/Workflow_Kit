// Kit version of a project and its update (spec M22 section 2.6): the state comes from `inspect`
// with the app's bundle, the update is `install --update`, and after it the Kit hooks of a provider
// that only records an approval (Codex) are approved when the folder is trusted. Kit itself writes
// the project; this module only runs its commands and keeps their outcome.
import type { KitInspect } from '#kit-runner';
import type { Project, Provider } from '#provider-registry';

/** What the panel offers: `update` when the project's Kit is older than the app's bundle. */
export type KitUpdateAction = 'update' | 'none';

/** A Kit failure of the last update, shown on the card with Kit's next step. */
export interface KitUpdateError {
  code: string;
  message: string;
  nextAction: string | null;
  at: string;
}

/** Outcome of the last successful update. */
export interface KitUpdateLast {
  from: string | null;
  to: string;
  /** SHA of Kit's commit, or null when nothing had to be committed. */
  commit: string | null;
  /** What happened to the hooks of each provider that approves them (one line per provider). */
  hooks: string[];
  at: string;
}

/** The kitUpdate entry of one project in /api/state. */
export interface KitUpdateState {
  /** Kit version installed in the project, or null without a Kit. */
  installed: string | null;
  /** Kit version of the app's bundle. */
  bundled: string;
  /** Folder state from `inspect` (KIT_OK, KIT_OUTDATED, GIT_NO_KIT…), or null when inspect failed. */
  state: string | null;
  action: KitUpdateAction;
  running: boolean;
  error?: KitUpdateError;
  last?: KitUpdateLast;
  /** Why the state is unknown (inspect failed), or absent. */
  note?: string;
  checkedAt: string | null;
}

/** States of a folder whose Kit is installed. */
export const KIT_INSTALLED_STATES: ReadonlySet<string> = new Set(['KIT_OK', 'KIT_OUTDATED', 'KIT_DAMAGED']);

/** Compares dotted versions; negative when `left` is older (the rule of Kit's installer). */
export function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return Number.isNaN(difference) ? 0 : difference;
  }
  return 0;
}

/**
 * `update` for an older Kit only: KIT_OUTDATED, or an installed Kit whose version is older than the
 * bundle. A newer Kit is never replaced by an older one (Kit itself has no downgrade guard).
 */
export function kitAction(inspect: Pick<KitInspect, 'state' | 'version'>, bundled: string): KitUpdateAction {
  if (inspect.state === 'KIT_OUTDATED') return 'update';
  if (KIT_INSTALLED_STATES.has(inspect.state) && inspect.version !== null && compareVersions(inspect.version, bundled) < 0) return 'update';
  return 'none';
}

export interface HookApprovalOptions {
  /** Pause between reads while the provider has not listed the new hooks yet (default 1 s). */
  pollMs?: number;
  /** Reads before giving up (default 15). */
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The provider's short name ("ChatGPT"), as on its buttons. */
export function providerLabel(provider: Pick<Provider, 'label' | 'title'>): string {
  return provider.label ?? provider.title;
}

/**
 * Approves the Kit hooks of one provider after an update, with no confirmation of the user: the
 * button «Обновить Kit» is the consent (spec M22 section 2.6). Only a provider that records an
 * approval (Codex: approveHooks without `writes`) in a trusted folder takes part; the provider
 * itself approves only the Kit templates and the Harness hook with the exact command (M21), so a
 * foreign hook is never approved. The command and hash are the ones the provider reports now, on
 * Windows its commandWindows. Returns a line for the user, or null when the provider has nothing to
 * approve. A failure of the provider becomes a line, never an exception.
 */
export async function approveKitHooks(provider: Provider, project: Project, options: HookApprovalOptions = {}): Promise<string | null> {
  if (!provider.approveHooks) return null;
  const label = providerLabel(provider);
  const sleep = options.sleep ?? pause;
  const attempts = options.attempts ?? 15;
  const failed = (error: unknown): string => `${label}: хуки Kit не одобрены — ${error instanceof Error ? error.message : String(error)}`;
  try {
    const trust = await provider.trust(project);
    if (trust.trusted !== true) return `${label}: папка не доверена — хуки Kit не одобрялись`;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await sleep(options.pollMs ?? 1000);
      const state = await provider.hooks(project);
      // An approval that writes a file (Kimi) is made only as shown in the wizard, not here.
      if (state.writes !== undefined) return null;
      const kit = state.kitHook;
      // A read made before the provider listed the new hooks has no hash yet.
      if (!kit?.hash) continue;
      try {
        // Called even when the hook looks approved: the provider checks against a fresh list.
        const after = await provider.approveHooks(project, { command: kit.command, hash: kit.hash });
        if (after.kitHook?.status === 'approved') return `${label}: хуки Kit одобрены`;
      } catch (error) {
        // The list read above was older than the update: read again.
        if ((error as { code?: unknown }).code !== 'hash-changed') return failed(error);
      }
    }
    return `${label}: хуки Kit не одобрены — ${label} не показал их хеш; одобрите в «Настройках»`;
  } catch (error) {
    return failed(error);
  }
}
