// Public interface of the project-registry module; other modules import only from here (#project-registry).
export type { ProjectErrorCode } from './errors.ts';
export { PROJECT_ERROR_STATUS, ProjectError, accessHint } from './errors.ts';
export type { NameCheck } from './names.ts';
export { MAX_PROJECT_NAME_LENGTH, checkProjectName } from './names.ts';
export type { HomeScope, RegistryFs } from './home-paths.ts';
export { isInside, nodeFs, samePath } from './home-paths.ts';
export type { AllowedRoot, RootRules } from './roots.ts';
export { DRIVE_PROBE_TIMEOUT_MS, allowedRoots, resolveInsideRoots } from './roots.ts';
export type { FolderEntry, FolderListing, ListFoldersOptions } from './folders.ts';
export { FOLDER_LIST_LIMIT, listFolders } from './folders.ts';
export type { Project, ProjectRegistry, ProjectRegistryOptions, ProjectView, ProjectsSection, RemoveGuard, RemovedHook, ArchivedHook, BeforeDeleteHook } from './registry.ts';
export { PROJECTS_FILE_VERSION, createProjectRegistry, expandHome, projectsFile } from './registry.ts';
export { registerProjectRoutes } from './routes.ts';
