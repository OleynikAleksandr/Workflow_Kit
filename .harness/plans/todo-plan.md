# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-12T11:30:06.905Z",
    "scopeId": "m19-session-chat-fixes"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 695,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "provider-codex/module.md, hooks.md: HARNESS_CODEX_HOOK_COMMAND, isKitApprovable; approveHooks подтверждает хук Harness, kitHook approved только вместе с ним.",
          "kit-bundle/module.md: KIT_VERSION 2.2.3, KIT_SHA256 8891de2f…497e, KIT_SOURCE_COMMIT 7afe27ad.",
          "project-setup/module.md: kit.action по inspect — KIT_OUTDATED или другая версия KIT_OK → update; зависимость #kit-bundle."
        ],
        "decisions": [
          "Kit остаётся отдельным проектом harness-ai, здесь — его бандл 2.2.3 (vendor/workflow-kit-2.2.3.mjs.gz, PROVENANCE 7afe27ad).",
          "Пользователь ничего не подтверждает: хук Harness с точной командой scripts/workflow hook session-start --client codex Kit подтверждает тем же путём, что свои хуки.",
          "Claude Code режет вывод каждого хука на 10 000 символов без настройки — пакет идёт частями; Codex поднимает лимит полем записи (в токенах, байты/4).",
          "KIT_OUTDATED в мастере — update; версия сравнивается с KIT_VERSION бандла, а не со строкой в коде.",
          "Описание доверия и хуков provider-codex вынесено в hooks.md, чтобы module.md оставался в пределе размера."
        ],
        "references": [
          "docs/planning/M21-recovery-one-turn.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/hooks.md",
          "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md",
          "product-parts/backend-core/clusters/projects/modules/project-setup/module.md"
        ],
        "result": "Пакет восстановления Kit приходит агенту целиком за один ход: приложение ставит Kit 2.2.3 (шесть хуков SessionStart Claude по части пакета до 9 500 символов, одна запись Codex с additionalContextLimit 65536), Kit сам подтверждает в Codex хук Harness вместе со своими хуками, мастер обновляет проекты со старым Kit (KIT_OUTDATED) вместо повторной установки."
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
      "Новая сессия Claude из панели получает пакет целиком: все части inline, без <persisted-output>",
      "Новая сессия Codex из панели получает пакет без обрезки, хук Harness подтверждён без действий пользователя",
      "Kit подтверждает в Codex только хуки Kit и хук Harness с точной командой",
      "Приложение ставит и обновляет в проектах Kit 2.2.3",
      "CI зелёный на macOS, Linux, Windows x64 и ARM64"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-12T13:08:03.255Z",
      "text": "Пользователь 2026-11-12: «Давай исправим Claude и Codex, а с кими будем разбираться потом. Подготовь спецификацию и план… И выполни и пересобери новый релиз… Harness AI, а потом и нашего Workflow Kit»; в панели выбраны спецификация и план без ревью. | Execution mode chosen by the user: sequential: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
    },
    "baselineCommit": "ef84395eceefac07d0229e240da2bfe544b67146",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M21-recovery-one-turn.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-12T13:08:03.255Z",
        "text": "Kit остаётся отдельным проектом harness-ai, здесь лежит его бандл («пока ставим все как есть»)"
      },
      {
        "at": "2026-11-12T13:08:03.255Z",
        "text": "Пользователь ничего не подтверждает: хуки Codex подтверждает Kit"
      },
      {
        "at": "2026-11-12T13:08:03.255Z",
        "text": "Kimi в работу не входит"
      },
      {
        "at": "2026-11-12T13:08:03.255Z",
        "text": "Claude: 6 частей по 9 500 символов; Codex: одна запись с additionalContextLimit 65536"
      }
    ],
    "delivery": "READY_FOR_ACCEPTANCE",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "8ed2f99f-7296-4ad6-ae41-6fec13ee5fdb",
      "strategy": "sequential"
    },
    "id": "m21-recovery-one-turn",
    "objective": "Пакет восстановления Kit приходит агенту целиком за один ход в Claude и Codex: Kit подтверждает хук Harness в Codex, приложение получает бандл Kit 2.2.3 с пакетом частями для Claude и поднятым лимитом для Codex, выпуск новой версии Workflow Kit.",
    "spec": "docs/planning/M21-recovery-one-turn.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "approveHooks подтверждает хук SessionStart с командой scripts/workflow hook session-start --client codex вместе с хуками Kit, хеш из hooks/list",
        "Хуки с другими командами не подтверждаются",
        "Статус kitHook approved только при подтверждённом хуке Harness, если он есть в .codex/hooks.json",
        "Тесты, включая ветку win32 для ключей с подставленной платформой",
        "module.md provider-codex описывает правило"
      ],
      "checks": [],
      "commitMessage": "feat(provider-codex): approve the Harness SessionStart hook with the Kit hooks",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M21-recovery-one-turn.md",
          "heading": "3.2 Workflow Kit (этот репозиторий)",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/hooks.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/trust.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/hooks.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/files-hooks.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/harness-hook.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/windows.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Codex: Kit подтверждает хук Harness",
      "why": "Без подтверждения Codex не запускает хук Harness, и у пользователя без Harness AI пакета нет"
    },
    {
      "acceptance": [
        "Начинается только после выпуска бандла Kit 2.2.3 в harness-ai (раздел 7 спецификации)",
        "vendor/workflow-kit-2.2.3.mjs.gz и PROVENANCE с коммитом harness-ai; KIT_VERSION, KIT_SHA256, KIT_SOURCE_COMMIT обновлены",
        "Упоминания 2.2.2 в коде, тестах и документах заменены на 2.2.3",
        "Установка в новый проект пишет 6 записей Claude с --part K/6 и запись Codex с additionalContextLimit; «Обновить процесс» переводит проект с 2.2.2"
      ],
      "checks": [],
      "commitMessage": "feat(kit-bundle): vendor Harness Workflow Kit 2.2.3",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M21-recovery-one-turn.md",
          "heading": "3.2 Workflow Kit (этот репозиторий)",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle",
        "product-parts/workflow-engine/product-part.md",
        "product-parts/workflow-engine/clusters/kit-host/cluster.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/kit-types.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/test/kit-project.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/flow.test.ts",
        "product-parts/backend-core/clusters/projects/cluster.md",
        "product-parts/backend-core/clusters/projects/modules/project-setup/module.md",
        "product-parts/backend-core/clusters/projects/modules/project-setup/src/setup.ts",
        "product-parts/backend-core/clusters/projects/modules/project-setup/src/preview.ts",
        "product-parts/backend-core/clusters/projects/modules/project-setup/test/setup.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/test/bundle.test.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.2.mjs.gz",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.3.mjs.gz"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Бандл Kit 2.2.3",
      "why": "Части пакета для Claude и лимит для Codex реализованы в Kit 2.2.3 (harness-ai)"
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
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M21-recovery-one-turn.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/workflow-engine/product-part.md",
        "product-parts/workflow-engine/clusters/kit-host/cluster.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md",
        "product-parts/backend-core/clusters/projects/cluster.md",
        "product-parts/backend-core/clusters/projects/modules/project-setup/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
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
        "Версия, CHANGELOG, README и руководства обновлены",
        "docs/evidence/M21-acceptance.md с живыми проверками по ОС и тем, кто их проводит",
        "CI на ветке ci/m21-recovery-one-turn зелёный на macOS, Linux, Windows x64 и ARM64",
        "Живая проверка на macOS: новые сессии Claude и Codex из панели получают пакет целиком"
      ],
      "checks": [],
      "commitMessage": "chore: release Workflow Kit with Kit 2.2.3",
      "confirmation": "Пользователь 2026-11-12: «И выполни и пересобери новый релиз… Harness AI, а потом и нашего Workflow Kit»; «Я все принимаю. Дальше делай все как положено.»",
      "context": [],
      "dependencies": [
        "T002",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "README.md",
        "docs/installation.md",
        "docs/usage.md",
        "docs/setup.md",
        "docs/evidence/M21-acceptance.md",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Выпуск Workflow Kit",
      "why": "Пользователи получают исправление вместе с бандлом 2.2.3"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m21-recovery-one-turn (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 4/4
- Revision: 695

## Objective

Пакет восстановления Kit приходит агенту целиком за один ход в Claude и Codex: Kit подтверждает хук Harness в Codex, приложение получает бандл Kit 2.2.3 с пакетом частями для Claude и поднятым лимитом для Codex, выпуск новой версии Workflow Kit.

## Acceptance

- Новая сессия Claude из панели получает пакет целиком: все части inline, без <persisted-output>
- Новая сессия Codex из панели получает пакет без обрезки, хук Harness подтверждён без действий пользователя
- Kit подтверждает в Codex только хуки Kit и хук Harness с точной командой
- Приложение ставит и обновляет в проектах Kit 2.2.3
- CI зелёный на macOS, Linux, Windows x64 и ARM64

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Codex: Kit подтверждает хук Harness (work)
  - Commit: feat(provider-codex): approve the Harness SessionStart hook with the Kit hooks
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/hooks.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/trust.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/hooks.md, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/files-hooks.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/harness-hook.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/windows.test.ts
- [DONE] T002 — Бандл Kit 2.2.3 (work)
  - Commit: feat(kit-bundle): vendor Harness Workflow Kit 2.2.3
  - Files: product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle, product-parts/workflow-engine/product-part.md, product-parts/workflow-engine/clusters/kit-host/cluster.md, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/kit-types.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/test/kit-project.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/flow.test.ts, product-parts/backend-core/clusters/projects/cluster.md, product-parts/backend-core/clusters/projects/modules/project-setup/module.md, product-parts/backend-core/clusters/projects/modules/project-setup/src/setup.ts, product-parts/backend-core/clusters/projects/modules/project-setup/src/preview.ts, product-parts/backend-core/clusters/projects/modules/project-setup/test/setup.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, docs/architecture/OVERVIEW.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/test/bundle.test.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.2.mjs.gz, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.3.mjs.gz
  - Depends on: T001
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M21-recovery-one-turn.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/workflow-engine/product-part.md, product-parts/workflow-engine/clusters/kit-host/cluster.md, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md, product-parts/backend-core/clusters/projects/cluster.md, product-parts/backend-core/clusters/projects/modules/project-setup/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md
  - Depends on: T001, T002
- [DONE] T003 — Выпуск Workflow Kit (delivery)
  - Commit: chore: release Workflow Kit with Kit 2.2.3
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/installation.md, docs/usage.md, docs/setup.md, docs/evidence/M21-acceptance.md, docs/architecture/OVERVIEW.md
  - Depends on: T002, DOCS-R1

Digest: Пакет восстановления Kit приходит агенту целиком за один ход: приложение ставит Kit 2.2.3 (шесть хуков SessionStart Claude по части пакета до 9 500 символов, одна запись Codex с additionalContextLimit 65536), Kit сам подтверждает в Codex хук Harness вместе со своими хуками, мастер обновляет проекты со старым Kit (KIT_OUTDATED) вместо повторной установки.

State changes only through `scripts/workflow` commands. History lives in Git.
