# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-11T16:01:57.135Z",
    "scopeId": "m14-windows-fixes"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 629,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "provider-claude: виды диалога onboarding и promo, маркер PROMO_DECLINED, PtyMarkers.offersDeclined",
          "provider-claude: ошибка onboarding-dialog, DIALOG_HINTS",
          "dialogs.tcl: handle_dialog вместо stop_on_dialog; screen.ts: notNowKeys, offerQuestion"
        ],
        "decisions": [
          "Kit отвечает только на «Try the new …?» / «Would you like to try …?» с вариантом «Not now», не больше 3 раз за запуск; повтор — незнакомый диалог",
          "Выбор темы и вход Claude Kit не проходит сам, а называет причину",
          "Номер варианта «Not now» — цифра прямо перед текстом; курсор ❯/›/>, без курсора — вариант 1"
        ],
        "references": [
          "docs/planning/M15-claude-promo-dialogs.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/dialogs.md"
        ],
        "result": "Первая сессия Claude больше не падает на предложениях новых функций: Kit отвечает «Not now» и ждёт ссылку дальше (macOS, Linux, Windows). Экран первого запуска Claude сразу даёт понятную ошибку, подсказка незнакомого диалога ведёт в терминал, а не в предпросмотр доверия."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "CLOSED",
      "title": "Implementation"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "На предложение «Try the new …?» с вариантом «Not now» Kit выбирает «Not now» и сессия создаётся (macOS, Linux, Windows)",
      "На доверие, импорты и незнакомые диалоги Kit по-прежнему клавиш не нажимает",
      "Экран выбора темы или входа Claude сразу даёт ошибку «Claude не завершил первый запуск» с подсказкой",
      "Подсказка незнакомого диалога не отправляет в предпросмотр доверия",
      "Выпуск 0.8.2; CI зелёный на macOS, Linux, Windows x64 и ARM64"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-11T16:31:20.636Z",
      "text": "Пользователь, 2026-11-11: «Отлично, это подходит. Делай исправление.» — Kit сам отвечает «Not now» на предложения новых функций Claude | Execution mode chosen by the user: sequential: Да, последовательно"
    },
    "baselineCommit": "d51e3d6370a69d90dbddae1deea0e2cc8f762681",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M15-claude-promo-dialogs.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-11T16:31:20.636Z",
        "text": "Kit отвечает только на предложения новых функций и только «Not now», не больше 3 за запуск"
      },
      {
        "at": "2026-11-11T16:31:20.636Z",
        "text": "Выбор темы и вход Claude Kit не проходит сам, а называет причину"
      },
      {
        "at": "2026-11-11T16:31:20.636Z",
        "text": "Выпуск 0.8.2"
      }
    ],
    "delivery": "READY_FOR_ACCEPTANCE",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "e9c04a9c-cd7c-4f6c-b4f7-f6b07802530e",
      "strategy": "sequential"
    },
    "id": "m15-claude-promo-dialogs",
    "objective": "Первая сессия Claude не падает на предложениях новых функций (Kit отвечает «Not now»), а незавершённый первый запуск Claude сразу назван с понятной подсказкой",
    "spec": "docs/planning/M15-claude-promo-dialogs.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Виды диалога promo и onboarding в screen.ts",
        "host.ts отвечает «Not now» стрелками и Enter, печатает PROMO_DECLINED и ждёт ссылку дальше; не больше 3 раз; повтор — unknown",
        "Тесты с подставным терминалом; module.md провайдера обновлён"
      ],
      "checks": [],
      "commitMessage": "feat: decline Claude feature offers in the Windows pty host",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M15-claude-promo-dialogs.md",
          "heading": "2.2. Ответ «Not now»",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/screen.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/dialogs.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/windows.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Предложения и первый запуск в хосте Windows",
      "why": "Сессия Claude на Windows падала на «Try the new fullscreen renderer?» и ждала 2 минуты на выборе темы"
    },
    {
      "acceptance": [
        "dialogs.tcl распознаёт promo и onboarding и отвечает «Not now»; session.exp и environment.exp продолжают ждать ссылку",
        "Сквозной тест с поддельным claude под expect; module.md обновлён"
      ],
      "checks": [],
      "commitMessage": "feat: decline Claude feature offers in the expect scripts",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M15-claude-promo-dialogs.md",
          "heading": "2.2. Ответ «Not now»",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/dialogs.tcl",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/environment.exp",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/dialogs.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/fixtures/fake-claude.mjs",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/trust.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Предложения и первый запуск в expect-скриптах",
      "why": "Те же экраны Claude на macOS и Linux"
    },
    {
      "acceptance": [
        "dialogError: onboarding-dialog с подсказкой про claude в терминале; unknown — без предпросмотра доверия",
        "Тесты текстов; module.md обновлён"
      ],
      "checks": [],
      "commitMessage": "fix: explain Claude's first run and unknown dialogs",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M15-claude-promo-dialogs.md",
          "heading": "2.3. Тексты ошибок (`pty.ts`, `dialogError`)",
          "required": true
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/dialogs.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parts.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/trust.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Тексты ошибок первого запуска и незнакомого диалога",
      "why": "Подсказка отправляла в предпросмотр доверия, где такого вопроса нет"
    },
    {
      "acceptance": [
        "README «Если что-то не так»: первый запуск Claude и claude вне PATH на Windows",
        "docs/installation.md: неполадки Claude"
      ],
      "checks": [],
      "commitMessage": "docs: describe Claude's first run and feature offers",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/installation.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "README и руководство: неполадки Claude",
      "why": "Пользователь должен знать про первый запуск Claude и PATH"
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
        "T003",
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M15-claude-promo-dialogs.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "docs/installation.md"
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
        "Версия 0.8.2, CHANGELOG, документ приёмки M15",
        "CI зелёный на macOS, Linux, Windows x64 и ARM64 на ветке ci/m15-claude-promo-dialogs",
        "Служба переустановлена на macOS"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.8.2",
      "confirmation": "И сразу закрывай скоп и заливай на GitHub новый релиз.",
      "context": [],
      "dependencies": [
        "T004",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "docs/evidence/M15-acceptance.md",
        "README.md",
        "docs/installation.md",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Выпуск 0.8.2",
      "why": "Выпустить исправление для проверки на Windows"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m15-claude-promo-dialogs (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 6/6
- Revision: 629

## Objective

Первая сессия Claude не падает на предложениях новых функций (Kit отвечает «Not now»), а незавершённый первый запуск Claude сразу назван с понятной подсказкой

## Acceptance

- На предложение «Try the new …?» с вариантом «Not now» Kit выбирает «Not now» и сессия создаётся (macOS, Linux, Windows)
- На доверие, импорты и незнакомые диалоги Kit по-прежнему клавиш не нажимает
- Экран выбора темы или входа Claude сразу даёт ошибку «Claude не завершил первый запуск» с подсказкой
- Подсказка незнакомого диалога не отправляет в предпросмотр доверия
- Выпуск 0.8.2; CI зелёный на macOS, Linux, Windows x64 и ARM64

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Предложения и первый запуск в хосте Windows (work)
  - Commit: feat: decline Claude feature offers in the Windows pty host
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/screen.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/dialogs.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/windows.test.ts
- [DONE] T002 — Предложения и первый запуск в expect-скриптах (work)
  - Commit: feat: decline Claude feature offers in the expect scripts
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/dialogs.tcl, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/environment.exp, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/dialogs.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/fixtures/fake-claude.mjs, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/trust.test.ts
  - Depends on: T001
- [DONE] T003 — Тексты ошибок первого запуска и незнакомого диалога (work)
  - Commit: fix: explain Claude's first run and unknown dialogs
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/dialogs.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parts.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/trust.test.ts
  - Depends on: T002
- [DONE] T004 — README и руководство: неполадки Claude (work)
  - Commit: docs: describe Claude's first run and feature offers
  - Files: README.md, docs/installation.md
  - Depends on: T003
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M15-claude-promo-dialogs.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, docs/installation.md
  - Depends on: T001, T002, T003, T004
- [DONE] T005 — Выпуск 0.8.2 (delivery)
  - Commit: chore: release 0.8.2
  - Files: package.json, package-lock.json, CHANGELOG.md, docs/evidence/M15-acceptance.md, README.md, docs/installation.md, docs/architecture/OVERVIEW.md
  - Depends on: T004, DOCS-R1

Digest: Первая сессия Claude больше не падает на предложениях новых функций: Kit отвечает «Not now» и ждёт ссылку дальше (macOS, Linux, Windows). Экран первого запуска Claude сразу даёт понятную ошибку, подсказка незнакомого диалога ведёт в терминал, а не в предпросмотр доверия.

State changes only through `scripts/workflow` commands. History lives in Git.
