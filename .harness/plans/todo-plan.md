# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-15T11:42:11.263Z",
    "scopeId": "M32-codex-history-recovery-retry1"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 1037,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "provider-codex module.md: порядок байтов после рукопожатия (M32 F001), одинаково на всех ОС.",
          "OS-MATRIX: строка M32 F001."
        ],
        "decisions": [
          "Пользователь выбрал «carryover M32, Kit потом»: T007 перенесена в новый scope как TODO; исправление Kit (fixes round при начатой delivery-задаче) — отдельным планом.",
          "Kit ставит T007 раньше F002, поэтому T007 — сборка 0.13.7, F002 — CI её SHA на ci/M32-codex-history-recovery без force."
        ],
        "references": [
          "docs/planning/M32-codex-history-recovery.md",
          "docs/evidence/M32-codex-history-recovery.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md"
        ],
        "result": "F001: WebSocket-клиент Codex декодирует байты из ответа рукопожатия и следующие куски сокета строго по порядку прихода; дефект найден CI run 43708900530 (Linux x64) на 0d04a7db, закрыт детерминированным тестом. Документы проекта согласованы; поставка 0.13.7 и CI — T007 и F002."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "CLOSED",
      "title": "Carried over"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "История суммарно более 16 МиБ читается порциями; новые реплики появляются без повторного полного обхода; большой отдельный элемент имеет явный ограниченный путь обработки.",
      "После возврата сокета чтение ленты и параметров восстанавливается без reload; сообщения, черновик, фокус и очередь сохраняются.",
      "Автоматический retry не повторяет turn/start, turn/interrupt и изменение параметров; Stop подтверждает только конкретный nativeTurnId без полной истории.",
      "Проверены совместимость paginated/legacy и пределы памяти/страниц/deadline; неподдерживаемые случаи документированы без скрытого full-history fallback.",
      "Обязательные проверки и CI точного поставляемого SHA зелёные на macOS, Linux, Windows x64/ARM64; живая приёмка пользователя и Windows-тестера отдельно подтверждается, pending не выдаётся за passed.",
      "Контракты и OS-MATRIX согласованы; локальная сборка установлена и проверена; опубликована только разрешённая CI-ветка, main не публикуется."
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-15T11:42:11.263Z",
      "text": "Пользователь 15.11.2026 выбрал «carryover M32, Kit потом»: перенести незавершённую T007 в новый scope, добавить исправление ws.ts (F001), сборку и установку 0.13.7 (F002) и повторный CI на ci/M32-codex-history-recovery без force; исправление Kit — отдельным планом. Прежние разрешения: «Да: установка и CI до приёмки»; «завершай те 007 выполняя его собирай новый релиз если он не собран»."
    },
    "baselineCommit": "0d04a7dbe0b9565c896343b1975166cf4a12b7ba",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M32-codex-history-recovery.md",
        "required": true
      },
      {
        "path": "docs/planning/M32-codex-validation.md",
        "required": true
      },
      {
        "path": "docs/planning/M32-codex-protocol-plan.md",
        "required": true
      },
      {
        "path": "docs/planning/M32-codex-connection.md",
        "required": true
      },
      {
        "path": "docs/planning/M32-document-split.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-15T11:42:11.263Z",
        "text": "Carried over unfinished tasks from scope M32-codex-history-recovery-retry1."
      }
    ],
    "delivery": "READY_FOR_ACCEPTANCE",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": "3967748e-6627-496f-9f10-fb2fa729caac",
      "strategy": "sequential"
    },
    "id": "M32-codex-history-recovery-fix",
    "objective": "Порционная загрузка длинного диалога Codex и автоматическое восстановление чтения после исчезновения сокета без повторных действий пользователя",
    "spec": "docs/planning/M32-codex-history-recovery.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Байты, пришедшие в куске рукопожатия и в следующих кусках до первого обработанного кадра, декодируются строго в порядке поступления; обработчик сообщений подключается до первого сообщения, как прежде.",
        "Детерминированный тест на memory peer: рукопожатие с началом кадра в одном куске и остаток кадра синхронно следом дают одно целое сообщение без protocol-error; тест падает на прежнем коде.",
        "Тест реального WebSocket 16 МиБ проходит локально; module.md (OS-раздел или транспорт) и OS-MATRIX описывают исправление для macOS, Linux и Windows; поведение одинаково на всех ОС."
      ],
      "checks": [],
      "commitMessage": "fix: keep WebSocket bytes in order after the Codex handshake",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M32-codex-validation.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/ws.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/ws-rpc.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "F001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Сохранить порядок байтов после рукопожатия WebSocket Codex",
      "why": "CI Linux x64 run 43708900530 на SHA 0d04a7db: начало кадра в куске рукопожатия обрабатывается через setImmediate, следующий кусок сокета успевает раньше — protocol-error «continuation without a message» (дефект T002a/db08ada прежнего scope M32-codex-history-recovery-retry1)"
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
        "F001"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M32-codex-history-recovery.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "docs/architecture/OS-MATRIX.md"
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
        "Patch-версия поднята 0.13.6→0.13.7 синхронно в package.json, package-lock.json, CHANGELOG.md, README.md, docs/installation.md и docs/usage.md.",
        "Сборка установлена штатно, wfk doctor --installed без ошибок, служба 0.13.7; smoke ленты Codex без прерывания хода пользователя; результат в docs/evidence/M32/local-delivery.md.",
        "Main не публикуется; живые проверки macOS/iPad/Windows остаются pending, если не проведены."
      ],
      "checks": [],
      "commitMessage": "chore: deliver Codex WebSocket ordering fix",
      "confirmation": "Подтверждаю.",
      "context": [
        {
          "path": "docs/planning/M32-codex-validation.md",
          "required": true
        }
      ],
      "dependencies": [
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
        "docs/evidence/M32/local-delivery.md",
        "docs/evidence/M32-codex-history-recovery.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Собрать и установить 0.13.7 с исправлением транспорта",
      "why": "Повторная поставка после F001: T006 прежнего scope поставил 0.13.6 с дефектом ws.ts"
    },
    {
      "acceptance": [
        "Разрешён только push ci/M32-codex-history-recovery без force (fast-forward от 0d04a7db); чужие remote изменения сохраняются, main не публикуется.",
        "Для точного SHA T007 зелёные macOS/Linux/Windows x64/ARM64; evidence содержит SHA/URL/results, а также неудачный run 43708900530 на 0d04a7db с причиной; падение CI не объявляется DONE.",
        "Собственный evidence/plan commit F002 не отправляется после DONE: его CI проводится при отдельной публикации main после приёмки и закрытия; здесь требуется CI поставляемого SHA T007. Функциональные дефекты — fixes round."
      ],
      "checks": [],
      "commitMessage": "docs: record Codex history recovery cross-platform CI",
      "confirmation": "Подтверждаю.",
      "context": [
        {
          "path": "docs/planning/M32-codex-validation.md",
          "required": true
        }
      ],
      "dependencies": [
        "DOCS-R1",
        "T007"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M32-codex-history-recovery.md"
      ],
      "fixes": null,
      "id": "F002",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Проверить поставляемый SHA T007 в CI на четырёх платформах",
      "why": "CI run 43708900530 на SHA 0d04a7db (T006 прежнего scope) упал на Linux x64 из-за дефекта ws.ts; после F001 и T007 проверяется новый поставляемый SHA"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: M32-codex-history-recovery-fix (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 4/4
- Revision: 1037

## Objective

Порционная загрузка длинного диалога Codex и автоматическое восстановление чтения после исчезновения сокета без повторных действий пользователя

## Acceptance

- История суммарно более 16 МиБ читается порциями; новые реплики появляются без повторного полного обхода; большой отдельный элемент имеет явный ограниченный путь обработки.
- После возврата сокета чтение ленты и параметров восстанавливается без reload; сообщения, черновик, фокус и очередь сохраняются.
- Автоматический retry не повторяет turn/start, turn/interrupt и изменение параметров; Stop подтверждает только конкретный nativeTurnId без полной истории.
- Проверены совместимость paginated/legacy и пределы памяти/страниц/deadline; неподдерживаемые случаи документированы без скрытого full-history fallback.
- Обязательные проверки и CI точного поставляемого SHA зелёные на macOS, Linux, Windows x64/ARM64; живая приёмка пользователя и Windows-тестера отдельно подтверждается, pending не выдаётся за passed.
- Контракты и OS-MATRIX согласованы; локальная сборка установлена и проверена; опубликована только разрешённая CI-ветка, main не публикуется.

## Rounds

### R1 — Carried over (implementation, CLOSED)

- [DONE] F001 — Сохранить порядок байтов после рукопожатия WebSocket Codex (work)
  - Commit: fix: keep WebSocket bytes in order after the Codex handshake
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/ws.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/ws-rpc.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, docs/architecture/OS-MATRIX.md
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M32-codex-history-recovery.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, docs/architecture/OS-MATRIX.md
  - Depends on: F001
- [DONE] T007 — Собрать и установить 0.13.7 с исправлением транспорта (delivery)
  - Commit: chore: deliver Codex WebSocket ordering fix
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/installation.md, docs/usage.md, docs/evidence/M32/local-delivery.md, docs/evidence/M32-codex-history-recovery.md
  - Depends on: DOCS-R1
- [DONE] F002 — Проверить поставляемый SHA T007 в CI на четырёх платформах (delivery)
  - Commit: docs: record Codex history recovery cross-platform CI
  - Files: docs/evidence/M32-codex-history-recovery.md
  - Depends on: DOCS-R1, T007

Digest: F001: WebSocket-клиент Codex декодирует байты из ответа рукопожатия и следующие куски сокета строго по порядку прихода; дефект найден CI run 43708900530 (Linux x64) на 0d04a7db, закрыт детерминированным тестом. Документы проекта согласованы; поставка 0.13.7 и CI — T007 и F002.

State changes only through `scripts/workflow` commands. History lives in Git.
