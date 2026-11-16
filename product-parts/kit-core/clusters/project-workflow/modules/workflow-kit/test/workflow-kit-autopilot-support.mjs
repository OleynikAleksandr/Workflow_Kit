import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { write } from "./workflow-kit-support.mjs";

// Shared fixtures of the M39 autopilot tests: a project with a committed CI
// configuration and a chosen scope with an automation block.

export const CI = `name: CI
on:
  push:
jobs:
  test:
    name: \${{ matrix.name }}
    runs-on: \${{ matrix.os }}
    strategy:
      matrix:
        include:
          - name: Linux x64
            os: ubuntu-latest
    steps:
      - run: npm test
`;

/** Commits files with plain git (the test projects have no Kit hooks). */
export function gitCommit(root, env, files, message) {
  const run = (args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", env });
  run(["add", "--", ...files]);
  run(["commit", "-q", "-m", message]);
  return run(["rev-parse", "HEAD"]).trim();
}

/** The scope with one docs work task N, delivery D1 and the automation block. */
export function automatedScope(id = "auto") {
  return {
    acceptance: ["The note explains the feature"],
    approval: "User approved the automated scope",
    automation: {
      acceptance: [
        {
          checks: ["unit"],
          criterion: 0,
          evidence: ["docs/evidence/result.md"],
          kind: "automatic",
        },
      ],
      ci: {
        branch: "ci/auto",
        exactSha: true,
        remote: "origin",
        requiredChecks: ["Linux x64"],
      },
      delivery: [{ effects: ["write the release note"], taskId: "D1" }],
      publication: { branch: "main", upstream: "origin/main" },
    },
    id,
    objective: "Explain the feature",
    spec: "docs/spec.md",
    tasks: [
      {
        acceptance: ["note written"],
        commitMessage: "docs: write the note",
        files: ["docs/note.md"],
        id: "N",
        title: "Note",
      },
      {
        acceptance: ["release note written"],
        commitMessage: "chore: release note",
        dependencies: ["N"],
        files: ["docs/release.md"],
        id: "D1",
        kind: "delivery",
        title: "Release",
      },
    ],
  };
}

/** A project with CI and spec committed and the scope chosen by session s-1. */
export function chosenProject({ env, kit, project }) {
  const root = project(null);
  write(root, ".github/workflows/ci.yml", CI);
  write(root, "docs/spec.md", "# Spec\n");
  const ciCommit = gitCommit(
    root,
    env,
    [".github/workflows/ci.yml", "docs/spec.md"],
    "chore: add CI"
  );
  kit.proposeScope(root, automatedScope(), "sequential", "One note and one release task");
  const chosen = kit.chooseScope(root, {
    generation: 1,
    note: "User chose sequential",
    option: "sequential",
    session: "s-1",
  });
  return { ciCommit, digest: chosen.proposalDigest, root };
}

/** The authorize input of run `runId` for the chosen scope. */
export function grantInput(digest, fields = {}) {
  return {
    accept: true,
    acceptancePolicy: "automatic",
    ci: automatedScope().automation.ci,
    close: true,
    deliveryTaskIds: ["D1"],
    mode: "after-start",
    note: "User started the plan with the after-start autopilot",
    ownerSession: "s-1",
    proposalDigest: digest,
    publication: { branch: "main", upstream: "origin/main" },
    runId: "run-1",
    scopeId: "auto",
    source: "panel-start",
    ...fields,
  };
}

/** Writes a passed verification record of `check` for `commit`. */
export function passedRecord(root, commit, check) {
  const dir = path.join(root, ".harness", "workflow", "local", "verification");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, `${commit}.json`),
    JSON.stringify({
      commit,
      reports: [
        {
          finishedAt: "2026-11-16T10:00:00.000Z",
          ok: true,
          results: [{ id: check, output: "ok", status: "passed" }],
          stage: "commit",
          startedAt: "2026-11-16T10:00:00.000Z",
        },
      ],
      transaction: "t",
    })
  );
}
