import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import { gitCommit } from "./workflow-kit-autopilot-support.mjs";
import { failure, lintProfile, openKit, write } from "./workflow-kit-support.mjs";

// M40 T003: `commit --task` in main refuses changed paths outside the task
// files (TASK_FILES_OUTSIDE), and `--input` / `--digest` files of the project
// must live in `.harness/inputs/` (INPUT_LOCATION, before the file is read).
const build = await buildWorkflowModules(["workflow-kit"], "workflow-kit-file-barriers");
const roots = [];

const note = (id, files, fields = {}) => ({
  acceptance: [`${id} written`],
  commitMessage: `docs: write ${id}`,
  files,
  id,
  title: `Note ${id}`,
  ...fields,
});
const scope = (id, tasks) => ({
  acceptance: ["The notes exist"],
  approval: "User approved the notes scope",
  id,
  objective: "Write notes",
  ...(tasks.length > 1 ? { spec: "docs/spec.md" } : {}),
  tasks,
});

try {
  const { cli, env, git, kit, plans, project } = await openKit(build, { clock: "18:00", prefix: "workflow-files-", roots });
  const { inTaskFiles, outsideTaskFiles } = await build.load("workflow-kit", "kit-task-files.js");
  const { ensureInputLocation, insideProject } = await build.load("workflow-kit", "kit-input-location.js");
  const envelope = (cwd, argv) => JSON.parse(cli(cwd, argv).stdout);
  const taskOf = (root, id) => plans.read(root).tasks.find((task) => task.id === id);

  // ── the task files of `commit --task` in main.
  const root = project();
  write(root, "docs/spec.md", "# Spec\n");
  gitCommit(root, env, ["docs/spec.md"], "docs: add the specification");
  kit.createScope(
    root,
    scope("files", [
      note("N1", ["docs/note.md"]),
      note("N2", ["docs/guide"], { dependencies: ["N1"] }),
      note("N3", [], { dependencies: ["N2"] }),
    ])
  );
  // N3 has no files list, so it may hold code: the round starts with QUALITY.
  kit.startTask(root, "QUALITY");
  kit.qualityApply(root, lintProfile());
  // A change made before task:start stays out and is not a refusal.
  write(root, "scratch.md", "earlier\n");
  assert.deepEqual(kit.startTask(root, "N1").preexisting, ["scratch.md"]);
  write(root, "docs/note.md", "# Note\n");
  write(root, "docs/other.md", "# Other\n");
  write(root, "docs/more/deep.md", "# Deep\n");
  const head = git.head(root);
  const refused = failure(() => kit.commitTask(root, "N1"));
  assert.equal(refused.code, "TASK_FILES_OUTSIDE");
  assert.deepEqual(refused.details, { files: ["docs/note.md"], paths: ["docs/more/deep.md", "docs/other.md"] });
  assert.match(refused.nextAction, /task:update N1 --input/u);
  // Nothing was committed or added to the task.
  assert.equal(git.head(root), head);
  assert.equal(taskOf(root, "N1").status, "IN_PROGRESS");
  assert.deepEqual(taskOf(root, "N1").files, ["docs/note.md"]);
  // The command line reports the same refusal; an explicit list is checked too.
  const text = envelope(root, ["commit", "--task", "N1"]);
  assert.equal(text.code, "TASK_FILES_OUTSIDE");
  assert.deepEqual(text.details.paths, ["docs/more/deep.md", "docs/other.md"]);
  assert.equal(envelope(root, ["commit", "--task", "N1", "--files", "docs/note.md,scratch.md"]).code, "TASK_FILES_OUTSIDE");
  // Reverting one path and extending the task with the other lifts the refusal.
  rmSync(path.join(root, "docs", "more"), { force: true, maxRetries: 5, recursive: true });
  const updated = kit.updateTask(root, "N1", { files: ["docs/note.md", "docs/other.md"] });
  assert.equal(git.history(root, head).at(-1).trailers["Workflow-Role"][0], "scope-plan");
  assert.equal(updated.revision, plans.read(root).revision);
  const done = kit.commitTask(root, "N1");
  assert.deepEqual(done.commit.excluded, ["scratch.md"]);
  assert.deepEqual(git.commitPaths(root, done.commit.sha).sort(), [".harness/plans/todo-plan.md", "docs/note.md", "docs/other.md"]);

  // An entry that is a folder covers the paths below it, by whole segments.
  kit.startTask(root, "N2");
  write(root, "docs/guide/start.md", "# Start\n");
  write(root, "docs/guide/deep/more.md", "# More\n");
  write(root, "docs/guide2/start.md", "# Other guide\n");
  assert.deepEqual(failure(() => kit.commitTask(root, "N2")).details.paths, ["docs/guide2/start.md"]);
  // A subset given with --files inside the task passes; the rest stays in the tree.
  const subset = kit.commitTask(root, "N2", { files: ["docs/guide/start.md", "docs/guide/deep/more.md"] });
  assert.deepEqual(subset.commit.excluded.sort(), ["docs/guide2/start.md", "scratch.md"]);

  // A task without a files list is not limited.
  kit.startTask(root, "N3");
  write(root, "anywhere/free.md", "# Free\n");
  const free = kit.commitTask(root, "N3");
  assert.ok(git.commitPaths(root, free.commit.sha).includes("anywhere/free.md"));

  // The pure rule; the case is ignored on win32 and darwin only.
  assert.equal(inTaskFiles(["docs/guide"], "docs/guide", "linux"), true);
  assert.equal(inTaskFiles(["docs/guide"], "docs/guidebook.md", "linux"), false);
  assert.equal(inTaskFiles(["Docs/Guide.md"], "docs/guide.md", "win32"), true);
  assert.equal(inTaskFiles(["Docs/Guide.md"], "docs/guide.md", "darwin"), true);
  assert.equal(inTaskFiles(["Docs/Guide.md"], "docs/guide.md", "linux"), false);
  assert.deepEqual(outsideTaskFiles({ files: [], kind: "work" }, ["a.ts"], "linux"), []);
  assert.deepEqual(outsideTaskFiles({ files: ["src"], kind: "work" }, ["src/a.ts", "lib/b.ts", "README.md"], "linux"), ["lib/b.ts", "README.md"]);
  // The DOCS task reconciles shared documents: only its code paths are outside.
  assert.deepEqual(outsideTaskFiles({ files: ["README.md"], kind: "docs" }, ["CHANGELOG.md", "docs/x.md", "src/a.ts"], "linux"), ["src/a.ts"]);

  // ── INPUT_LOCATION on win32 with paths that exist on no OS.
  const project32 = "C:\\Work\\Kit Project";
  const real32 = new Map([
    ["c:\\work\\kitpro~1", project32],
    ["c:\\work\\kit project\\.harness\\inputs\\link.json", `${project32}\\src\\secret.json`],
  ]);
  const folders32 = new Set(["c:\\", "c:\\work", "c:\\work\\kit project", "c:\\work\\kit project\\docs", "c:\\work\\kit project\\.harness", "c:\\work\\kit project\\.harness\\inputs", "d:\\", "d:\\other"]);
  const win = {
    platform: "win32",
    realpath: (file) => {
      const key = file.toLowerCase();
      if (real32.has(key)) {
        return real32.get(key);
      }
      if (folders32.has(key)) {
        return file;
      }
      throw new Error(`ENOENT: ${file}`);
    },
  };
  const located = (rootPath, cwd, file, options) => failure(() => ensureInputLocation(rootPath, cwd, file, options))?.code ?? "OK";
  assert.equal(located(project32, project32, "plan.json", win), "INPUT_LOCATION");
  assert.equal(located(project32, project32, "docs\\plan.json", win), "INPUT_LOCATION");
  assert.equal(located(project32, project32, ".harness\\inputs\\plan.json", win), "OK");
  // Another case, forward slashes and a relative path from a subfolder.
  assert.equal(located(project32, project32, "c:/work/KIT PROJECT/.Harness/Inputs/plan.json", win), "OK");
  assert.equal(located(project32, `${project32}\\docs`, "..\\.harness\\inputs\\plan.json", win), "OK");
  assert.equal(located(project32, `${project32}\\docs`, "../plan.json", win), "INPUT_LOCATION");
  // An 8.3 short name of the project folder is the same project.
  assert.equal(located(project32, project32, "C:\\Work\\KITPRO~1\\plan.json", win), "INPUT_LOCATION");
  assert.equal(located(project32, project32, "C:\\Work\\KITPRO~1\\.harness\\inputs\\plan.json", win), "OK");
  assert.equal(located("C:\\Work\\KITPRO~1", project32, "plan.json", win), "INPUT_LOCATION");
  // Near misses of the folder, and a link in it that leads back into the project.
  assert.equal(located(project32, project32, ".harness\\plan.json", win), "INPUT_LOCATION");
  assert.equal(located(project32, project32, ".harness\\inputs2\\plan.json", win), "INPUT_LOCATION");
  assert.equal(located(project32, project32, ".harness\\inputs", win), "INPUT_LOCATION");
  assert.equal(located(project32, project32, ".harness\\inputs\\link.json", win), "INPUT_LOCATION");
  // Outside the project: another drive and a folder whose name only starts the same.
  assert.equal(located(project32, project32, "D:\\Other\\plan.json", win), "OK");
  assert.equal(located(project32, project32, "C:\\Work\\Kit Project Two\\plan.json", win), "OK");
  assert.equal(located(project32, project32, "..\\plan.json", win), "OK");
  assert.deepEqual(insideProject(project32, "C:\\WORK\\kit project\\Docs\\a.json", win), ["docs", "a.json"]);
  assert.equal(insideProject(project32, project32, win), null);

  // linux compares the case; darwin does not.
  const plain = (platform) => ({ platform, realpath: (file) => file });
  assert.equal(located("/srv/kit-project", "/srv/kit-project", "plan.json", plain("linux")), "INPUT_LOCATION");
  assert.equal(located("/srv/kit-project", "/srv/kit-project", ".harness/inputs/plan.json", plain("linux")), "OK");
  assert.equal(located("/srv/kit-project", "/srv/kit-project", ".harness/Inputs/plan.json", plain("linux")), "INPUT_LOCATION");
  assert.equal(located("/srv/kit-project", "/srv", "Kit-Project/plan.json", plain("linux")), "OK");
  assert.equal(located("/Users/dev/Kit", "/Users/dev/Kit", ".HARNESS/inputs/plan.json", plain("darwin")), "OK");
  assert.equal(located("/Users/dev/Kit", "/Users/dev", "kit/plan.json", plain("darwin")), "INPUT_LOCATION");

  // ── the command line on this OS: the refusal comes before the file is read.
  const live = project();
  const input = JSON.stringify(scope("inputs", [note("N", ["docs/note.md"])]));
  write(live, "plan.json", "{ this is not JSON");
  const early = envelope(live, ["scope:create", "--input", "plan.json"]);
  assert.equal(early.code, "INPUT_LOCATION");
  assert.deepEqual(early.details, { path: "plan.json" });
  assert.match(early.nextAction, /\.harness\/inputs\//u);
  assert.equal(envelope(live, ["scope:create", "--input", "docs/missing.json"]).code, "INPUT_LOCATION");
  assert.equal(envelope(path.join(live, ".harness"), ["scope:create", "--input", "../plan.json"]).code, "INPUT_LOCATION");
  rmSync(path.join(live, "plan.json"));
  // In `.harness/inputs/` the file is read (here: not JSON); outside the project it passes.
  write(live, ".harness/inputs/broken.json", "{ this is not JSON");
  assert.equal(envelope(live, ["scope:create", "--input", ".harness/inputs/broken.json"]).code, "INPUT_JSON");
  const outsideFolder = mkdtempSync(path.join(tmpdir(), "workflow-files-outside-"));
  roots.push(outsideFolder);
  write(outsideFolder, "plan.json", input);
  try {
    symlinkSync(path.join(outsideFolder, "plan.json"), path.join(live, ".harness", "inputs", "link.json"));
    // A link in the inputs folder to a file outside the project is outside as well.
    assert.equal(insideProject(live, path.join(live, ".harness", "inputs", "link.json")), null);
    rmSync(path.join(live, ".harness", "inputs", "link.json"));
  } catch (error) {
    // Windows without the symlink privilege: the win32 case above covers links.
    assert.equal(error.code, "EPERM");
  }
  const created = envelope(live, ["scope:create", "--input", path.join(outsideFolder, "plan.json")]);
  assert.equal(created.ok, true, JSON.stringify(created));
  // `task:update --input` and `commit --digest` follow the same rule.
  write(live, "patch.json", JSON.stringify({ why: "A patch in the wrong place" }));
  assert.equal(envelope(live, ["task:update", "N", "--input", "patch.json"]).code, "INPUT_LOCATION");
  rmSync(path.join(live, "patch.json"));
  write(live, ".harness/inputs/patch.json", JSON.stringify({ why: "The note is needed" }));
  assert.equal(envelope(live, ["task:update", "N", "--input", ".harness/inputs/patch.json"]).ok, true);
  assert.equal(envelope(live, ["task:start", "N"]).ok, true);
  write(live, "docs/note.md", "# Note\n");
  write(live, "docs/digest.json", "{}");
  const digest = envelope(live, ["commit", "--task", "N", "--digest", "docs/digest.json"]);
  assert.equal(digest.code, "INPUT_LOCATION");
  assert.equal(taskOf(live, "N").status, "IN_PROGRESS");
  console.log("workflow-kit file barriers tests passed");
} finally {
  for (const root of roots) {
    rmSync(root, { force: true, maxRetries: 5, recursive: true });
  }
  await build.cleanup();
}
