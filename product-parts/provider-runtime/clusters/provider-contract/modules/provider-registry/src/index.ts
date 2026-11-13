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
export type { ChatMessage, ChatPage } from './chat.ts';
export type { InterruptTarget, InterruptResult, InterruptAvailability } from './interrupt.ts';
export { INTERRUPT_TIMEOUT_MS } from './interrupt.ts';
export { CHAT_PAGE_LIMIT, CHAT_TEXT_CUT_NOTE, CHAT_TEXT_MAX_CHARS, cutChatText } from './chat.ts';
export type { ChatMessagesAnswer } from './chat-routes.ts';
export type { SharedAccess, SharedAccessAdminStep, SharedAccessPreview, SharedAccessState, SharedAccessStateName, SharedAccessTarget } from './shared-access.ts';
export { ProviderError, providerCapability, providerLabel, providerLogsDir, providerMark, providerSessionsFile } from './contract.ts';
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
export type { CachedProviderProject, ProviderRegistry, ProviderSummary, ProvidersSection } from './registry.ts';
export { STATE_READ_TIMEOUT_MS, createProviderRegistry, errorInfo } from './registry.ts';
export type { ProviderRoutes, ProviderRoutesOptions } from './routes.ts';
export { OPERATION_EVENTS, defaultSessionTitle, registerProviderRoutes } from './routes.ts';
export type { ParameterId, ParameterOption, ParameterItem, ContextUsage, LimitWindow, ParameterStyle, SessionParameters, ParameterChange, AccessOption, AccessPresentation, ParameterPresentation } from './parameters.ts';
export { PARAMETER_IDS, PARAMETER_CHANGE_IDS } from './parameters.ts';
export { snapshotFile, limitsFile, readSnapshot, writeSnapshot } from './parameter-snapshots.ts';
export { createJsonlTail, JSONL_BLOCK_BYTES, JSONL_MAX_BYTES } from './jsonl-tail.ts';
export type { JsonlSelectors } from './jsonl-tail.ts';
export type { SnapshotWriteOptions } from './parameter-snapshots.ts';
