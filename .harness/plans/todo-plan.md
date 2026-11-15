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
  "revision": 1026,
  "rounds": [
    {
      "digest": null,
      "id": "R1",
      "kind": "implementation",
      "status": "OPEN",
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
    "delivery": "IN_PROGRESS",
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
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R1",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M32-codex-history-recovery.md"
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
        "Разрешён только push ci/M32-codex-history-recovery без force; чужие remote изменения сохраняются, main не публикуется.",
        "Для точного SHA T006 зелёные macOS/Linux/Windows x64/ARM64, evidence содержит SHA/URL/results; падение CI не объявляется DONE.",
        "Собственный evidence/plan commit T007 не отправляется после DONE: его CI проводится при отдельной публикации main после приёмки и закрытия; здесь требуется CI поставляемого SHA T006. Функциональные дефекты — fixes round."
      ],
      "checks": [],
      "commitMessage": "docs: record Codex history recovery cross-platform CI",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M32-codex-history-recovery.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Проверить поставляемый SHA в CI на четырёх платформах",
      "why": "Проверить поставляемый SHA в CI на четырёх платформах"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: M32-codex-history-recovery-fix (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 0/2
- Revision: 1026

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

### R1 — Carried over (implementation, OPEN)

- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M32-codex-history-recovery.md
- [TODO] T007 — Проверить поставляемый SHA в CI на четырёх платформах (delivery)
  - Commit: docs: record Codex history recovery cross-platform CI
  - Files: docs/evidence/M32-codex-history-recovery.md
  - Depends on: DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
