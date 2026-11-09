# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-08T17:17:34.035Z",
    "scopeId": "m4-plan-review"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 349,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "Функциональные API не менялись; уточнены текущие ограничения платформ.",
          "README — быстрый старт; docs/installation.md — подробная установка и диагностика.",
          "Отчёт разделяет подготовку документов и подтверждённую публикацию."
        ],
        "decisions": [
          "Версия остаётся 0.4.6; изменения документации описаны в Unreleased.",
          "CHANGELOG отслеживается; локальные стартовые материалы исключены общим gitignore.",
          "Историю сохраняем, включая прежние node_modules; force push не использовать.",
          "Push разрешён пользователем; приёмка и закрытие scope отдельно."
        ],
        "references": [
          "README.md",
          "docs/installation.md",
          "CHANGELOG.md",
          "docs/architecture/OVERVIEW.md",
          "docs/planning/github-publication.md",
          "docs/evidence/github-publication.md"
        ],
        "result": "Подготовлены README, установка по ОС, CHANGELOG и правила Git. Документы согласованы; публикация и проверка удалённого SHA остаются задачей T002."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "OPEN",
      "title": "Implementation"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "README объясняет работу приложения и установку с нуля, включая скачивание репозитория и переход в его папку",
      "Инструкция установки описывает macOS, Linux и Windows с фактическими ограничениями и способами автозапуска",
      "CHANGELOG.md содержит подтверждённую историю версий, включён в git и связан с README",
      "Проверены правила исключения, состав файлов и история, предназначенные для публикации",
      "main опубликована в OleynikAleksandr/Workflow_Kit, её SHA совпадает с локальным, документы доступны на GitHub"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-09T07:54:02.377Z",
      "text": "Пользователь: «сделай тогда, пожалуйста маленький короткий scope для подготовки локального репозитория к публикации на GitHub»; «всю необходимую информацию, как работает данное приложение, как его проинсталлировать, добавь в нужные документы»; «лучше сделать стандартный файл change log»; «подготовь и опубликуй этот репозиторий на GitHub — https://github.com/OleynikAleksandr/Workflow_Kit». | Execution mode chosen by the user: sequential: Пользователь: Хорошо, выполняем последовательно. Подготовь документы и опубликуй репозиторий на GitHub."
    },
    "baselineCommit": "be2cc8a4443be737bc8097c11bd6b4f4448e5400",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/github-publication.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-09T07:54:02.377Z",
        "text": "Публикация разрешена пользователем; целевой репозиторий уже публичный, видимость не менять"
      },
      {
        "at": "2026-11-09T07:54:02.377Z",
        "text": "Сохранить версию 0.4.6; сборка установочных пакетов и доработка платформ не входят в scope"
      },
      {
        "at": "2026-11-09T07:54:02.377Z",
        "text": "Сохранить удалённую историю; не использовать force push"
      },
      {
        "at": "2026-11-09T07:54:02.377Z",
        "text": "CHANGELOG.md является публикуемым документом и не должен игнорироваться"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "01a1bf43-d699-7e33-9fc4-b3d0406733ca",
      "strategy": "sequential"
    },
    "id": "github-publication",
    "objective": "Подготовить документацию и состав Workflow Kit 0.4.6 для нового пользователя и опубликовать репозиторий на GitHub",
    "spec": "docs/planning/github-publication.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Документы покрывают раздел 1 спецификации, включая clone/ZIP, cd, требования, install/serve/open, обновление и удаление",
        "Ограничения Windows/Linux сформулированы явно и согласованы с кодом; успешные живые проверки не выдуманы",
        "CHANGELOG основан на документах приёмки и истории Kit, не игнорируется и добавлен в git",
        "Правила gitignore сохраняют необходимые исходники и исключают локальные материалы; проверены отслеживаемые файлы и отправляемая история",
        "Относительные ссылки и кириллица проверены; результаты проверки состава записаны в документе публикации"
      ],
      "checks": [],
      "commitMessage": "docs: prepare installation guide and changelog for GitHub publication",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "README.md",
        "CHANGELOG.md",
        "docs/installation.md",
        "docs/architecture/OVERVIEW.md",
        ".gitignore",
        "docs/evidence/github-publication.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Подготовить README, инструкцию установки, CHANGELOG и состав файлов",
      "why": "Подготовить README, инструкцию установки, CHANGELOG и состав файлов"
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
        "docs/planning/github-publication.md",
        "CHANGELOG.md",
        "docs/installation.md",
        "docs/evidence/github-publication.md"
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
        "Настроенные проверки Kit пройдены; запуск из временной копии проверен без изменения установленной службы",
        "Удалённая main проверена, существующие изменения сохранены, origin указывает на указанный пользователем репозиторий",
        "Выполнен push без force; после последнего коммита задачи локальная и удалённая main имеют одинаковый SHA",
        "На GitHub доступны README.md, CHANGELOG.md и docs/installation.md; результат проверки отражён в отчёте"
      ],
      "checks": [],
      "commitMessage": "chore: record GitHub publication verification",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T001",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/github-publication.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Проверить подготовленный репозиторий и опубликовать main на GitHub",
      "why": "Проверить подготовленный репозиторий и опубликовать main на GitHub"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: github-publication (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 2/3
- Revision: 349

## Objective

Подготовить документацию и состав Workflow Kit 0.4.6 для нового пользователя и опубликовать репозиторий на GitHub

## Acceptance

- README объясняет работу приложения и установку с нуля, включая скачивание репозитория и переход в его папку
- Инструкция установки описывает macOS, Linux и Windows с фактическими ограничениями и способами автозапуска
- CHANGELOG.md содержит подтверждённую историю версий, включён в git и связан с README
- Проверены правила исключения, состав файлов и история, предназначенные для публикации
- main опубликована в OleynikAleksandr/Workflow_Kit, её SHA совпадает с локальным, документы доступны на GitHub

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Подготовить README, инструкцию установки, CHANGELOG и состав файлов (work)
  - Commit: docs: prepare installation guide and changelog for GitHub publication
  - Files: README.md, CHANGELOG.md, docs/installation.md, docs/architecture/OVERVIEW.md, .gitignore, docs/evidence/github-publication.md
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/github-publication.md, CHANGELOG.md, docs/installation.md, docs/evidence/github-publication.md
  - Depends on: T001
- [TODO] T002 — Проверить подготовленный репозиторий и опубликовать main на GitHub (delivery)
  - Commit: chore: record GitHub publication verification
  - Files: docs/evidence/github-publication.md
  - Depends on: T001, DOCS-R1

Digest: Подготовлены README, установка по ОС, CHANGELOG и правила Git. Документы согласованы; публикация и проверка удалённого SHA остаются задачей T002.

State changes only through `scripts/workflow` commands. History lives in Git.
