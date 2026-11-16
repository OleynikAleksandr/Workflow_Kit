// Public interface of git-publish (spec publication-order); other modules import only from here.
export type { GitResult, GitRunner } from './git.ts';
export { gitExecOptions, runGit } from './git.ts';
export type { ExpectedPublication, PublicationState, PublicationStatus, Published, Publisher, PublishRefusal, PushFailure } from './publication.ts';
export { PublishError, REFUSALS, createPublisher, publish, readPublication, refusal, stageCi } from './publication.ts';
export type { Publication, PublicationOptions } from './routes.ts';
export { registerPublicationRoutes } from './routes.ts';
export type { CiJob, CiPolicy, CiVerdict, GhRunner, GitHubCi } from './github-ci.ts';
export { createGitHubCi, githubRepo, runGh } from './github-ci.ts';
