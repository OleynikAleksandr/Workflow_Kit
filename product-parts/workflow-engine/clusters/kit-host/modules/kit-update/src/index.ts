// Public interface of kit-update (spec M22 section 2.6); other modules import only from here.
export type { HookApprovalOptions, KitUpdateAction, KitUpdateError, KitUpdateLast, KitUpdateState } from './update.ts';
export { KIT_INSTALLED_STATES, approveKitHooks, compareVersions, kitAction, providerLabel } from './update.ts';
export type { KitUpdate, KitUpdateOptions, KitUpdateSection } from './routes.ts';
export { registerKitUpdateRoutes } from './routes.ts';
