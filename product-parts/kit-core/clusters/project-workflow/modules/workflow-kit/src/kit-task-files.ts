// The task files barrier of `commit --task` (M40, spec 3.3): a task with a
// `files` list commits only paths that equal an entry or are nested in it.
import {
  isDocumentationPath,
  type WorkflowTask,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  ensure,
  type WorkflowPlatform,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";

/** Git paths differ only by case on win32 and darwin name one file. */
function comparable(value: string, platform: WorkflowPlatform): string {
  return platform === "linux" ? value : value.toLowerCase();
}

/** True when `file` equals a `files` entry or lies below it (by segment). */
export function inTaskFiles(
  files: readonly string[],
  file: string,
  platform: WorkflowPlatform = workflowPlatformFacade.platform
): boolean {
  const value = comparable(file, platform);
  return files.some((entry) => {
    const base = comparable(entry, platform);
    return value === base || value.startsWith(`${base}/`);
  });
}

/**
 * The selected paths of a task commit that are outside its `files`. A task
 * without a list is not limited. The DOCS task of a round reconciles shared
 * documents, so its documentation paths are never outside; its list is made
 * by the Kit, not by the plan author.
 */
export function outsideTaskFiles(
  task: Pick<WorkflowTask, "files" | "kind">,
  selected: readonly string[],
  platform: WorkflowPlatform = workflowPlatformFacade.platform
): string[] {
  if (task.files.length === 0) {
    return [];
  }
  return selected.filter(
    (file) =>
      !(
        inTaskFiles(task.files, file, platform) ||
        (task.kind === "docs" && isDocumentationPath(file))
      )
  );
}

/** TASK_FILES_OUTSIDE with the paths; nothing is committed. */
export function ensureTaskFiles(
  task: Pick<WorkflowTask, "files" | "id" | "kind">,
  selected: readonly string[],
  platform?: WorkflowPlatform
): void {
  const paths = outsideTaskFiles(task, selected, platform);
  ensure(
    paths.length === 0,
    "TASK_FILES_OUTSIDE",
    `These changed paths are outside the files of ${task.id}: ${paths.join(", ")}.`,
    { files: task.files, paths },
    `Revert what does not belong to ${task.id}, or extend the task: \`scripts/workflow task:update ${task.id} --input <patch.json>\` with the full \`files\` list; then repeat the commit.`
  );
}
