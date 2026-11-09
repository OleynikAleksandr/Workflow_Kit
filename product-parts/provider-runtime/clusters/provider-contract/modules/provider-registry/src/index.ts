// Public interface of the provider-registry module; other modules import only from here (#provider-registry).
export type {
  AutorunPoint,
  Capabilities,
  Capability,
  HookDialect,
  HookEntry,
  HookState,
  Project,
  ProjectProviderState,
  Provider,
  ProviderAction,
  ProviderContext,
  ProviderErrorInfo,
  ProviderFactory,
  ProviderId,
  ProviderState,
  ProviderStatus,
  RenameResult,
  SessionInfo,
  SessionLinks,
  TrustChoice,
  TrustChoiceOption,
  TrustChoices,
  TrustInherited,
  TrustPreview,
  TrustState,
  TrustWrite,
} from './contract.ts';
export { ProviderError, providerCapability, providerLogsDir, providerSessionsFile } from './contract.ts';
export type { HookSession, ReadHookSessionsOptions } from './hook-sessions.ts';
export {
  HOOK_JOURNAL_MAX_BYTES,
  clearHookSessionsCache,
  hookJournalFile,
  hookSessionInfo,
  isHelperFork,
  parseHookJournal,
  readHookSessions,
} from './hook-sessions.ts';
export type { IssuedToken, TokenStore } from './tokens.ts';
export { PREVIEW_TOKEN_TTL_MS, createTokenStore } from './tokens.ts';
export type { StubProviderOptions } from './stub.ts';
export { NOT_IMPLEMENTED_LABEL, STUB_CAPABILITIES, createStubProvider } from './stub.ts';
export type { ProviderRegistry, ProviderSummary, ProvidersSection } from './registry.ts';
export { STATE_READ_TIMEOUT_MS, createProviderRegistry, errorInfo } from './registry.ts';
export type { ProviderRoutes, ProviderRoutesOptions } from './routes.ts';
export { OPERATION_EVENTS, defaultSessionTitle, registerProviderRoutes } from './routes.ts';
