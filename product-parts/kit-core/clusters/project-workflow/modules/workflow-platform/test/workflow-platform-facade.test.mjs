import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "./workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-platform"],
  "workflow-platform"
);
const workspace = mkdtempSync(path.join(tmpdir(), "workflow-platform-"));
try {
  const { WorkflowPlatformFacade, WorkflowPathError, WorkflowLockError } =
    await build.load("workflow-platform", "workflow-platform-facade.js");
  const posix = new WorkflowPlatformFacade("linux");
  const windows = new WorkflowPlatformFacade("win32");

  assert.equal(posix.normalizeRelative("./src//main.ts"), "src/main.ts");
  assert.equal(posix.normalizeRelative("src\\lib\\a.ts"), "src/lib/a.ts");
  assert.equal(posix.normalizeRelative("docs/"), "docs");
  for (const unsafe of [
    "/etc/passwd",
    "C:\\x",
    "../a",
    "a/../b",
    "",
    "a/./b",
  ]) {
    assert.throws(
      () => posix.normalizeRelative(unsafe),
      WorkflowPathError,
      unsafe
    );
  }
  assert.equal(posix.isWithin("src/a/b.ts", "src/a"), true);
  assert.equal(posix.isWithin("src/ab.ts", "src/a"), false);
  assert.equal(windows.samePath("C:\\Repo\\A", "c:/repo/a/"), true);
  assert.equal(posix.samePath("/Repo/A", "/repo/a"), false);

  const nested = posix.resolveInside(workspace, "a/b.txt");
  assert.equal(nested, path.join(workspace, "a", "b.txt"));
  assert.equal(posix.relativeFromRoot(workspace, nested), "a/b.txt");
  assert.throws(
    () => posix.relativeFromRoot(workspace, tmpdir()),
    WorkflowPathError
  );

  posix.writeFileAtomic(nested, "first");
  posix.writeFileAtomic(nested, "second");
  assert.equal(readFileSync(nested, "utf8"), "second");
  assert.equal(posix.readTextIfExists(path.join(workspace, "missing")), null);

  const lockPath = path.join(workspace, "local", "operation.lock");
  const value = posix.withLock(lockPath, () => {
    assert.throws(() => posix.withLock(lockPath, () => 1), WorkflowLockError);
    return 42;
  });
  assert.equal(value, 42);
  assert.equal(existsSync(lockPath), false);

  writeFileSync(lockPath, JSON.stringify({ pid: 999_999_999 }));
  assert.equal(
    posix.withLock(lockPath, () => "reclaimed"),
    "reclaimed"
  );
  console.log("workflow-platform facade tests passed");
} finally {
  rmSync(workspace, { force: true, recursive: true });
  await build.cleanup();
}
