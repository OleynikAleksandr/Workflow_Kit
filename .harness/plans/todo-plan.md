# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-15T21:02:55.034Z",
    "scopeId": "M34-codex-async-answer"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 1096,
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
      "После npm test на macOS и Linux в корне репозитория не появляются записи с wfk-acw- и \\var в имени.",
      "Вариант win32 теста auto-compact-context выполняется полностью на Windows, варианты darwin и linux — вне Windows; ветка win32 resolveAutoCompactWindow по-прежнему проверяется на всех ОС.",
      "Код службы и панели не меняется; typecheck, platform-guard и все тесты проходят.",
      "0.14.2 собрана и установлена на macOS, CI точного SHA поставки зелёная на macOS, Linux, Windows x64 и ARM64; пользовательская приёмка отдельно."
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-15T23:05:35.489Z",
      "text": "Пользователь, 15.11.2026: «Можешь поправить тест?»; «без ревьювера, готов спецификацию, план, выполняй вплоть до сборки нового релиза и публикации его на GitHub». | Execution mode chosen by the user: sequential: Пользователь в чате, 16.11.2026: «Выбираю последовательно. Приступай.»"
    },
    "baselineCommit": "eb8e2491cb4a9075a1709192bd62fb1a98244f5c",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M35-test-stray-folders.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-15T23:05:35.489Z",
        "text": "Меняется только тест: каждый вариант auto-compact-context выполняется на своём семействе ОС; win32 — только на Windows (CI x64 и ARM64)."
      },
      {
        "at": "2026-11-15T23:05:35.489Z",
        "text": "Защита от повтора — проверка в том же файле: в текущей папке процесса нет записей с wfk-acw- в имени; общая проверка чистоты корня для всех тестов не входит."
      },
      {
        "at": "2026-11-15T23:05:35.489Z",
        "text": "Поставка 0.14.2 без живой проверки в панели: код службы и панели не меняется."
      },
      {
        "at": "2026-11-15T23:05:35.489Z",
        "text": "Публикация на GitHub — после приёмки и закрытия scope, каждое по команде пользователя (кнопка панели или wfk project publish)."
      },
      {
        "at": "2026-11-15T23:05:35.489Z",
        "text": "Рекомендован sequential: одна рабочая задача в одном файле, затем поставка и CI."
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": "e93021a5-9717-4ec2-833d-db51b48373f3",
      "strategy": "sequential"
    },
    "id": "M35-test-stray-folders",
    "objective": "Тест порога автосжатия не оставляет пустых папок \\var\\folders\\… в корне репозитория, поставка 0.14.2",
    "spec": "docs/planning/M35-test-stray-folders.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "skipOn симметричен: вариант win32 пропущен вне Windows с причиной «Windows paths of a POSIX temp folder», darwin и linux пропущены на Windows с прежней причиной; ранний выход варианта win32 вне Windows удалён.",
        "Тест в том же файле после вариантов проверяет, что в текущей папке процесса нет записей с wfk-acw- в имени; при временно снятом пропуске варианта win32 он падает на macOS (снятие не коммитится).",
        "npm run typecheck, npm run check:platforms и npm test проходят; после npm test в корне репозитория нет записей с wfk-acw- и \\var в имени."
      ],
      "checks": [],
      "commitMessage": "test(cli): keep the win32 auto-compact variant from creating folders off Windows",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M35-test-stray-folders.md",
          "required": true,
          "heading": "2. Решение"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/runtime/modules/cli/test/auto-compact-context.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Тест auto-compact-context: варианты на своём семействе ОС и проверка чистоты текущей папки",
      "why": "Вариант win32 на macOS и Linux создаёт папки \\var\\folders\\… в корне репозитория при каждом npm test"
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
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M35-test-stray-folders.md"
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
        "Версия 0.14.2 в package.json и package-lock.json, запись CHANGELOG «[0.14.2] - 2026-11-15» в разделе Fixed.",
        "npm run typecheck, npm run check:platforms, npm test и npm run build:kit пройдены; после npm test в корне нет записей с wfk-acw-; node bin/wfk.mjs install поставил 0.14.2; wfk doctor --installed — всё в порядке; /api/health показывает 0.14.2.",
        "Результат записан в docs/evidence/M35-acceptance.md со списком проверок по ОС: macOS — агент, приёмка — пользователь; Linux и Windows — CI; проверка поставки отделена от пользовательской приёмки.",
        "Работающие сессии пользователя не перезапущены: установка перезапускает только службу."
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: deliver the test stray folders fix",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M35-test-stray-folders.md",
          "required": true,
          "heading": "4. Проверка"
        }
      ],
      "dependencies": [
        "T001",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "docs/evidence/M35-acceptance.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Поставка 0.14.2: версия, CHANGELOG, сборка Kit, установка и doctor",
      "why": "Пользователь просил довести исправление до нового релиза"
    },
    {
      "acceptance": [
        "Точный SHA задачи T002 отправлен в ветку ci/M35-test-stray-folders; CI зелёная на macOS, Linux, Windows x64 и ARM64; ссылка на прогон и SHA записаны в docs/evidence/M35-acceptance.md.",
        "Ветка main не публикуется: публикация — после приёмки и закрытия scope по команде пользователя."
      ],
      "checks": [],
      "commitMessage": "docs: record test stray folders fix cross-platform CI",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M35-test-stray-folders.md",
          "required": true,
          "heading": "4. Проверка"
        }
      ],
      "dependencies": [
        "T002",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M35-acceptance.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "CI точного SHA поставки на четырёх платформах",
      "why": "Поставка не готова, пока CI не зелёная на всех ОС"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: M35-test-stray-folders (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 1/4
- Revision: 1096

## Objective

Тест порога автосжатия не оставляет пустых папок \var\folders\… в корне репозитория, поставка 0.14.2

## Acceptance

- После npm test на macOS и Linux в корне репозитория не появляются записи с wfk-acw- и \var в имени.
- Вариант win32 теста auto-compact-context выполняется полностью на Windows, варианты darwin и linux — вне Windows; ветка win32 resolveAutoCompactWindow по-прежнему проверяется на всех ОС.
- Код службы и панели не меняется; typecheck, platform-guard и все тесты проходят.
- 0.14.2 собрана и установлена на macOS, CI точного SHA поставки зелёная на macOS, Linux, Windows x64 и ARM64; пользовательская приёмка отдельно.

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Тест auto-compact-context: варианты на своём семействе ОС и проверка чистоты текущей папки (work, parallel-safe)
  - Commit: test(cli): keep the win32 auto-compact variant from creating folders off Windows
  - Files: product-parts/backend-core/clusters/runtime/modules/cli/test/auto-compact-context.test.ts
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M35-test-stray-folders.md
  - Depends on: T001
- [TODO] T002 — Поставка 0.14.2: версия, CHANGELOG, сборка Kit, установка и doctor (delivery)
  - Commit: chore: deliver the test stray folders fix
  - Files: package.json, package-lock.json, CHANGELOG.md, docs/evidence/M35-acceptance.md
  - Depends on: T001, DOCS-R1
- [TODO] T003 — CI точного SHA поставки на четырёх платформах (delivery)
  - Commit: docs: record test stray folders fix cross-platform CI
  - Files: docs/evidence/M35-acceptance.md
  - Depends on: T002, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
