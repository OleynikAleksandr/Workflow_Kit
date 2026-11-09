// Public interface of the kit-structure module; other modules import only from here (#kit-structure).
export type { FragmentId, FragmentKind } from './fragments.ts';
export { FRAGMENTS, sha256 } from './fragments.ts';
export {
  HOOK_EVENT,
  PROMPT_HOOK_TIMEOUT_S,
  STOP_HOOK_TIMEOUT_S,
  expectedKitHooksText,
  findKitHook,
  isKitEventCommand,
  isKitHookCommand,
  isKitHookEntry,
  kitHookEntry,
  kitHooksText,
  normalizeHook,
  withKitHook,
  withKitHooks,
} from './hook-config.ts';
export type { HookHost } from './hook-host.ts';
export { WINDOWS_HOOK_LAUNCHER, defaultHookHost, forwardSlashes, hookText, powershellHookCommand } from './hook-host.ts';
export { findMarkedSection } from './markers.ts';
export type { StructureEntry, StructureRoutesOptions, StructureSection } from './routes.ts';
export { registerStructureRoutes } from './routes.ts';
export type { SessionStartInput, SessionStartRecord, SessionStartResult } from './session-hook.ts';
export { SERVICE_SESSION_ENV, SESSIONS_JOURNAL_PATH, findProjectRoot, recordSessionStart } from './session-hook.ts';
export type { FragmentReport, InstallResult, StructureReport, StructureStatus } from './structure.ts';
export { MANIFEST_PATH, StructureError, checkStructure, installStructure } from './structure.ts';
export type { HookClient, KitHookEvent } from './templates.ts';
export {
  AGENTS_BEGIN,
  AGENTS_END,
  GITIGNORE_BEGIN,
  GITIGNORE_END,
  HOOK_CLIENTS,
  KIT_HOOK_EVENTS,
  STRUCTURE_VERSION,
  hookCommand,
} from './templates.ts';
