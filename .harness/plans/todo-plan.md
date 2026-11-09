# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-09T10:12:56.251Z",
    "scopeId": "m5-windows"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 430,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "tools/platform-guard/README.md: rules platform-injected, os-program, spec-os-section, allowlist",
          "Quality profile: required commit check platform-guard; test check also runs tools/**/test/*.test.ts",
          "Docs contract: tools/{tool}/*.ts changes with tools/{tool}/README.md"
        ],
        "decisions": [
          "platform-guard checks the whole tree; exceptions live in tools/platform-guard/allowlist.json with all three OSes described",
          "CI runs before acceptance on branch ci/<scope>; main is pushed only after acceptance and close",
          "Linux opening of chats is recorded as unsupported in the allowlist, a known parity gap"
        ],
        "references": [
          "docs/planning/M6-cross-platform.md",
          "docs/planning/TEMPLATE.md",
          ".github/workflows/ci.yml",
          "AGENTS.md#Three operating systems"
        ],
        "result": "R1 of m6-cross-platform: the platform-guard commit check (rules A, B, C), CI on macOS, Linux, Windows x64 and ARM64, LF line endings and the three-OS rules for agents in AGENTS.md with a spec template."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "CLOSED",
      "title": "Implementation"
    },
    {
      "digest": null,
      "id": "R2",
      "kind": "fixes",
      "status": "OPEN",
      "title": "Windows and macOS CI fixes"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "CI passes on macOS, Linux, Windows x64 and Windows ARM64 for the pushed commit",
      "The platform-guard check refuses a commit with a direct process.platform comparison, an undescribed OS program or a new spec without the OS section",
      "AGENTS.md has the three-OS rules outside the Kit managed block",
      "docs/evidence/M6-acceptance.md records the CI result per OS",
      "Version 0.5.1 is installed locally and published to main after acceptance and close"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-09T14:54:50.840Z",
      "text": "User: «как сделать так, чтобы все последующие доработки касались всех трех операционных систем?» and, on the proposal of CI on three OSes, a platform guard check and rules in the instructions: «Да, готовь scope»; then «Выполни план и собери новый релиз. Все-таки номер релиза должен быть другой. И после приемки зальешь его на GitHub» | Execution mode chosen by the user: sequential: Пользователь в чате: «Выполни план и собери новый релиз»; рекомендованный режим — последовательно"
    },
    "baselineCommit": "1a86e55e9b2f4e6b5a23ea749381fb9cc98d66b0",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M6-cross-platform.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-09T14:54:50.840Z",
        "text": "CI matrix: macos-latest, ubuntu-latest, windows-latest, windows-11-arm with Node 24"
      },
      {
        "at": "2026-11-09T14:54:50.840Z",
        "text": "CI runs before acceptance on branch ci/m6-cross-platform; main is published only after acceptance and close"
      },
      {
        "at": "2026-11-09T14:54:50.840Z",
        "text": "platform-guard checks the whole tree with an allowlist; it is added to the quality profile via quality:apply"
      },
      {
        "at": "2026-11-09T14:54:50.840Z",
        "text": "The release gets version 0.5.1; app behaviour does not change"
      },
      {
        "at": "2026-11-09T14:54:50.840Z",
        "text": "After acceptance and close, main with 0.5.1 is pushed to GitHub"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "cb3d513d-4c3d-4df1-87cc-0504037096d6",
      "strategy": "sequential"
    },
    "id": "m6-cross-platform",
    "objective": "Every further change to Workflow Kit covers macOS, Linux and Windows 11: CI on all three OSes, a platform-guard commit check and three-OS rules for agents",
    "spec": "docs/planning/M6-cross-platform.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Rule A: a process.platform comparison or switch outside allowlist.directPlatform is an error; default-value forms are allowed",
        "Rule B: an OS program literal from programNames needs an allowlist entry for its file with non-empty darwin, linux and win32; stale entries are errors",
        "Rule C: a docs/planning spec outside legacySpecs needs a level-2 section with «Поведение на ОС» mentioning macOS, Linux and Windows",
        "The initial allowlist describes every current OS program use on all three OSes and the guard passes on the repository",
        "Tests cover each rule with temporary trees, including Windows-style paths",
        "npm test includes tools/**/test/*.test.ts, npm run check:platforms runs the guard, tsconfig includes tools/**/*.ts",
        "quality:status lists the required commit check platform-guard and the test check runs the tools tests"
      ],
      "checks": [],
      "commitMessage": "feat: add platform-guard check for three-OS code",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M6-cross-platform.md",
          "required": true,
          "heading": "3. Защитная проверка `platform-guard`"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "tools/platform-guard/check.ts",
        "tools/platform-guard/allowlist.json",
        "tools/platform-guard/README.md",
        "tools/platform-guard/test/check.test.ts",
        "package.json",
        "tsconfig.json"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "platform-guard check",
      "why": "New code must stay testable for win32 and linux and must not use one OS's programs without an answer for the others"
    },
    {
      "acceptance": [
        "ci.yml runs on push to main and ci/**, pull_request and workflow_dispatch with read-only permissions and concurrency",
        "The matrix is macos-latest, ubuntu-latest, windows-latest, windows-11-arm with fail-fast false and Node 24",
        "Steps: checkout@v5, setup-node@v5 with npm cache, npm ci, typecheck, npm test, npm run check:platforms",
        ".gitattributes sets text=auto eol=lf and binary types above the workflow-kit block, which stays unchanged"
      ],
      "checks": [],
      "commitMessage": "ci: run typecheck, tests and platform-guard on macOS, Linux and Windows",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M6-cross-platform.md",
          "required": true,
          "heading": "2. CI на трёх ОС"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        ".github/workflows/ci.yml",
        ".gitattributes"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "CI on three OSes and LF line endings",
      "why": "Tests must run on real Windows and Linux, not only on the Mac"
    },
    {
      "acceptance": [
        "AGENTS.md has a «Three OSes» section in English outside the Kit managed block with the rules of spec section 4",
        "docs/planning/TEMPLATE.md has the sections of a spec including «Поведение на ОС» with macOS, Linux and Windows columns",
        "README names CI and npm run check:platforms in the development section"
      ],
      "checks": [],
      "commitMessage": "docs: add three-OS rules and spec template",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M6-cross-platform.md",
          "required": true,
          "heading": "4. Правила для агентов"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "AGENTS.md",
        "docs/planning/TEMPLATE.md",
        "README.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Three-OS rules for agents",
      "why": "Claude and Codex agents must plan and test every change for all three OSes"
    },
    {
      "acceptance": [
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R1",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T001",
        "T002",
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M6-cross-platform.md",
        "tools/platform-guard/README.md",
        "AGENTS.md",
        "docs/planning/TEMPLATE.md"
      ],
      "fixes": null,
      "id": "DOCS-R1",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R1",
      "status": "DONE",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "package.json and package-lock.json have version 0.5.1",
        "The service is reinstalled with node bin/wfk.mjs install and wfk doctor --installed reports 0.5.1",
        "HEAD is pushed to refs/heads/ci/m6-cross-platform only, main is not pushed",
        "docs/evidence/M6-acceptance.md records the result of each of the four CI jobs with the run link",
        "Red jobs are recorded with their failing tests for a fixes round"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.5.1",
      "confirmation": "Не останавливайся, выполни весь план до самого конца и собери новый релиз.",
      "context": [
        {
          "path": "docs/planning/M6-cross-platform.md",
          "required": true,
          "heading": "5. Выпуск: запуск CI до приёмки"
        }
      ],
      "dependencies": [
        "T001",
        "T002",
        "T003",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "README.md",
        "docs/installation.md",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M6-acceptance.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Release 0.5.1 and CI on branch ci/m6-cross-platform",
      "why": "The user asked for a new release number; CI results on real OSes are needed before acceptance without publishing main"
    },
    {
      "acceptance": [
        "writeFileAtomic retries rename on EPERM, EBUSY and EACCES on Windows like the Claude config writer",
        "data-store tests pass on Windows: concurrent writes and the events path",
        "module.md describes the retry"
      ],
      "checks": [],
      "commitMessage": "fix: retry atomic renames on Windows and fix data-store tests",
      "confirmation": null,
      "context": [
        {
          "path": "docs/evidence/M6-acceptance.md",
          "required": true,
          "heading": "CI, раунд R1"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/runtime/modules/data-store"
      ],
      "fixes": "T002",
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "TODO",
      "title": "Atomic writes on Windows",
      "why": "CI on Windows: concurrent writeFileAtomic fails with EPERM on rename; events test mixes POSIX platform with Windows paths"
    },
    {
      "acceptance": [
        "kit-structure tests inject the hook host or platform and pass on every OS",
        "project-registry access-denied test passes on Windows",
        "project-setup tests clean up without EBUSY on Windows",
        "cli open-link tests build data paths for the host OS and pass on Windows",
        "A product defect found here is fixed with a test, not hidden"
      ],
      "checks": [],
      "commitMessage": "test: make kit-structure, registry, setup and cli tests pass on Windows",
      "confirmation": null,
      "context": [
        {
          "path": "docs/evidence/M6-acceptance.md",
          "required": true,
          "heading": "CI, раунд R1"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/projects/modules/kit-structure",
        "product-parts/backend-core/clusters/projects/modules/project-registry",
        "product-parts/backend-core/clusters/projects/modules/project-setup",
        "product-parts/backend-core/clusters/runtime/modules/cli"
      ],
      "fixes": "T002",
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "TODO",
      "title": "Backend tests on Windows",
      "why": "CI on Windows: tests use the host platform for hooks, POSIX platforms with Windows paths and leave folders busy"
    },
    {
      "acceptance": [
        "config, parts and windows tests pass on Windows x64 and ARM64",
        "Paths in assertions are compared for the OS under test",
        "A product defect found here is fixed with a test, not hidden"
      ],
      "checks": [],
      "commitMessage": "test: make provider-claude tests pass on Windows",
      "confirmation": null,
      "context": [
        {
          "path": "docs/evidence/M6-acceptance.md",
          "required": true,
          "heading": "CI, раунд R1"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude"
      ],
      "fixes": "T002",
      "id": "T007",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "TODO",
      "title": "Claude adapter tests on Windows",
      "why": "CI on Windows: memory import scan, file mode, folder trust, program lookup and host timing tests fail"
    },
    {
      "acceptance": [
        "The fake daemon listens on a named pipe on Windows and a Unix socket elsewhere",
        "release, provider, ws-rpc and files-hooks tests pass on Windows without hanging",
        "A product defect found here is fixed with a test, not hidden"
      ],
      "checks": [],
      "commitMessage": "test: run the fake Codex daemon on a named pipe on Windows",
      "confirmation": null,
      "context": [
        {
          "path": "docs/evidence/M6-acceptance.md",
          "required": true,
          "heading": "CI, раунд R1"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex"
      ],
      "fixes": "T002",
      "id": "T008",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "TODO",
      "title": "Codex adapter tests on Windows",
      "why": "CI on Windows: the fake daemon listens on a Unix socket in the temp folder (EACCES) and provider tests hang"
    },
    {
      "acceptance": [
        "The cause of COMMIT_FAILED in the orchestrated test is found and removed",
        "The test passes repeatedly on macOS and in CI"
      ],
      "checks": [],
      "commitMessage": "test: stabilize the orchestrated kit-project test",
      "confirmation": null,
      "context": [
        {
          "path": "docs/evidence/M6-acceptance.md",
          "required": true,
          "heading": "CI, раунд R1"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner"
      ],
      "fixes": "T002",
      "id": "T009",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "TODO",
      "title": "Stable orchestrated commit test",
      "why": "CI on macOS: kit-project.test.ts:158 got COMMIT_FAILED once"
    },
    {
      "acceptance": [
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R2",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T005",
        "T006",
        "T007",
        "T008",
        "T009"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "DOCS-R2",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R2",
      "status": "TODO",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "The service is reinstalled as 0.5.1 and wfk doctor --installed is ok",
        "HEAD is pushed to refs/heads/ci/m6-cross-platform only",
        "CI is green on macOS, Linux, Windows x64 and Windows ARM64; the evidence records the run",
        "CHANGELOG 0.5.1 lists the Windows fixes"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.5.1 with green CI",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M6-cross-platform.md",
          "required": true,
          "heading": "5. Выпуск: запуск CI до приёмки"
        }
      ],
      "dependencies": [
        "T005",
        "T006",
        "T007",
        "T008",
        "T009",
        "DOCS-R2"
      ],
      "docsWaiver": null,
      "files": [
        "CHANGELOG.md",
        "docs/evidence/M6-acceptance.md"
      ],
      "fixes": "T004",
      "id": "T010",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R2",
      "status": "TODO",
      "title": "Release 0.5.1 with green CI",
      "why": "The release must pass CI on all four platforms before acceptance"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m6-cross-platform (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 5/12
- Revision: 430

## Objective

Every further change to Workflow Kit covers macOS, Linux and Windows 11: CI on all three OSes, a platform-guard commit check and three-OS rules for agents

## Acceptance

- CI passes on macOS, Linux, Windows x64 and Windows ARM64 for the pushed commit
- The platform-guard check refuses a commit with a direct process.platform comparison, an undescribed OS program or a new spec without the OS section
- AGENTS.md has the three-OS rules outside the Kit managed block
- docs/evidence/M6-acceptance.md records the CI result per OS
- Version 0.5.1 is installed locally and published to main after acceptance and close

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — platform-guard check (work, parallel-safe)
  - Commit: feat: add platform-guard check for three-OS code
  - Files: tools/platform-guard/check.ts, tools/platform-guard/allowlist.json, tools/platform-guard/README.md, tools/platform-guard/test/check.test.ts, package.json, tsconfig.json
- [DONE] T002 — CI on three OSes and LF line endings (work, parallel-safe)
  - Commit: ci: run typecheck, tests and platform-guard on macOS, Linux and Windows
  - Files: .github/workflows/ci.yml, .gitattributes
- [DONE] T003 — Three-OS rules for agents (work, parallel-safe)
  - Commit: docs: add three-OS rules and spec template
  - Files: AGENTS.md, docs/planning/TEMPLATE.md, README.md
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M6-cross-platform.md, tools/platform-guard/README.md, AGENTS.md, docs/planning/TEMPLATE.md
  - Depends on: T001, T002, T003
- [DONE] T004 — Release 0.5.1 and CI on branch ci/m6-cross-platform (delivery)
  - Commit: chore: release 0.5.1
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/installation.md, docs/architecture/OVERVIEW.md, docs/evidence/M6-acceptance.md
  - Depends on: T001, T002, T003, DOCS-R1

Digest: R1 of m6-cross-platform: the platform-guard commit check (rules A, B, C), CI on macOS, Linux, Windows x64 and ARM64, LF line endings and the three-OS rules for agents in AGENTS.md with a spec template.

### R2 — Windows and macOS CI fixes (fixes, OPEN)

- [TODO] T005 — Atomic writes on Windows (work)
  - Commit: fix: retry atomic renames on Windows and fix data-store tests
  - Files: product-parts/backend-core/clusters/runtime/modules/data-store
  - Fixes: T002
- [TODO] T006 — Backend tests on Windows (work)
  - Commit: test: make kit-structure, registry, setup and cli tests pass on Windows
  - Files: product-parts/backend-core/clusters/projects/modules/kit-structure, product-parts/backend-core/clusters/projects/modules/project-registry, product-parts/backend-core/clusters/projects/modules/project-setup, product-parts/backend-core/clusters/runtime/modules/cli
  - Fixes: T002
- [TODO] T007 — Claude adapter tests on Windows (work)
  - Commit: test: make provider-claude tests pass on Windows
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude
  - Fixes: T002
- [TODO] T008 — Codex adapter tests on Windows (work)
  - Commit: test: run the fake Codex daemon on a named pipe on Windows
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex
  - Fixes: T002
- [TODO] T009 — Stable orchestrated commit test (work)
  - Commit: test: stabilize the orchestrated kit-project test
  - Files: product-parts/workflow-engine/clusters/kit-host/modules/kit-runner
  - Fixes: T002
- [TODO] DOCS-R2 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R2
  - Files: README.md, docs/architecture/OVERVIEW.md
  - Depends on: T005, T006, T007, T008, T009
- [TODO] T010 — Release 0.5.1 with green CI (delivery)
  - Commit: chore: release 0.5.1 with green CI
  - Files: CHANGELOG.md, docs/evidence/M6-acceptance.md
  - Depends on: T005, T006, T007, T008, T009, DOCS-R2
  - Fixes: T004

State changes only through `scripts/workflow` commands. History lives in Git.
