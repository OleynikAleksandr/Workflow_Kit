// Public interface of project-setup (the project wizard).
export type { HookPreview, KitAction, PreviewDeps, PreviewInput, ProviderButton, SetupAction, SetupPreview, SetupProvider } from './preview.ts';
export { IDENTITY_COMMANDS, KIT_INSTALL_FILES, PREVIEW_TTL_MS, SetupError, buildPreview, draftProject, realFolder, resolveTarget } from './preview.ts';
export type { ApplyInput, ProjectSetup, SetupDeps, SetupRun, SetupStep, StepId, StepStatus } from './setup.ts';
export { SERVICE_MESSAGE_MARK, createProjectSetup, firstMessage } from './setup.ts';
export { registerSetupRoutes } from './routes.ts';
