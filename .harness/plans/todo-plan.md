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
  "revision": 419,
  "rounds": [
    {
      "digest": null,
      "id": "R1",
      "kind": "implementation",
      "status": "OPEN",
      "title": "Implementation"
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
      "status": "TODO",
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
      "status": "TODO",
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
      "status": "TODO",
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
      "confirmation": null,
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
        "docs/evidence/M6-acceptance.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Release 0.5.1 and CI on branch ci/m6-cross-platform",
      "why": "The user asked for a new release number; CI results on real OSes are needed before acceptance without publishing main"
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
- Progress: 1/5
- Revision: 419

## Objective

Every further change to Workflow Kit covers macOS, Linux and Windows 11: CI on all three OSes, a platform-guard commit check and three-OS rules for agents

## Acceptance

- CI passes on macOS, Linux, Windows x64 and Windows ARM64 for the pushed commit
- The platform-guard check refuses a commit with a direct process.platform comparison, an undescribed OS program or a new spec without the OS section
- AGENTS.md has the three-OS rules outside the Kit managed block
- docs/evidence/M6-acceptance.md records the CI result per OS
- Version 0.5.1 is installed locally and published to main after acceptance and close

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — platform-guard check (work, parallel-safe)
  - Commit: feat: add platform-guard check for three-OS code
  - Files: tools/platform-guard/check.ts, tools/platform-guard/allowlist.json, tools/platform-guard/README.md, tools/platform-guard/test/check.test.ts, package.json, tsconfig.json
- [TODO] T002 — CI on three OSes and LF line endings (work, parallel-safe)
  - Commit: ci: run typecheck, tests and platform-guard on macOS, Linux and Windows
  - Files: .github/workflows/ci.yml, .gitattributes
- [TODO] T003 — Three-OS rules for agents (work, parallel-safe)
  - Commit: docs: add three-OS rules and spec template
  - Files: AGENTS.md, docs/planning/TEMPLATE.md, README.md
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M6-cross-platform.md, tools/platform-guard/README.md, AGENTS.md, docs/planning/TEMPLATE.md
  - Depends on: T001, T002, T003
- [TODO] T004 — Release 0.5.1 and CI on branch ci/m6-cross-platform (delivery)
  - Commit: chore: release 0.5.1
  - Files: package.json, package-lock.json, docs/evidence/M6-acceptance.md
  - Depends on: T001, T002, T003, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
