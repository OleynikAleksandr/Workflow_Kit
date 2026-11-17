// Public interface of kit-update (spec M22 section 2.6); other modules import only from here.
export type { HookApprovalOptions, KitUpdateAction, KitUpdateError, KitUpdateLast, KitUpdateState } from './update.ts';
export { HOST_DECISIONS_SINCE, KIT_INSTALLED_STATES, approveKitHooks, compareVersions, decisionsOption, kitAction, providerLabel } from './update.ts';
export type { KitUpdate, KitUpdateOptions, KitUpdateSection } from './routes.ts';
export { registerKitUpdateRoutes } from './routes.ts';
export type { KitStructureLast, KitStructureState, StructureAccess } from './structure.ts';
export type { DeferralSources, KitDeferral, KitDeferralCode } from './deferral.ts';
export { deferralText, kitDeferral } from './deferral.ts';
