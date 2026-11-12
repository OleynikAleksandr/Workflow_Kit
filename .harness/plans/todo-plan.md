# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-12T08:20:28.142Z",
    "scopeId": "m18-session-chat"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 673,
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
      "Сообщение из панели в сессию под сценарием старой версии не теряется: оно уходит в очередь",
      "Сообщение из панели в сессию Claude, которую ведёт приложение вне панели, идёт в очередь и приходит в чат приложения с ближайшим хуком; панель не печатает в свою копию и не запускает её сама",
      "Сессия, которую ведёт процесс панели, получает сообщение сразу, как в 0.9.0; ChatGPT, Kimi, автопилот и ревью работают как раньше",
      "Тесты, проверка типов и check:platforms зелёные локально и в CI на macOS, Linux, Windows x64 и ARM64; выпущена версия 0.9.1"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-12T10:04:53.216Z",
      "text": "Пользователь, 2026-11-12: на вопрос «Открыть scope исправлений для этих двух дефектов?» — «Да, открывай»; в панели выбрано: спецификация и план без ревью | Execution mode chosen by the user: orchestrated: Выбор пользователя в панели Workflow Kit: оркестрация с исполнителями"
    },
    "baselineCommit": "930fb97bc712684058544510e9709cb81ca985ab",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M19-session-chat-fixes.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-12T10:04:53.216Z",
        "text": "Текст сообщения идёт через отдельный файл <debug>.text; <debug>.message остаётся только для пробуждения"
      },
      {
        "at": "2026-11-12T10:04:53.216Z",
        "text": "Процесс панели помечает свои хуки переменной WFK_PANEL_SESSION=1; сессия с последним хуком без метки считается внешней"
      },
      {
        "at": "2026-11-12T10:04:53.216Z",
        "text": "Внешнюю сессию панель не возобновляет сама; кнопка «Продолжить» остаётся"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 2,
      "ownerSession": "0c355c88-f324-49fe-909c-fe5617d16288",
      "strategy": "orchestrated"
    },
    "id": "m19-session-chat-fixes",
    "objective": "Сообщение из карточки «Диалог» не теряется и приходит тому процессу Claude, в котором пользователь ведёт сессию; выпущена версия 0.9.1",
    "spec": "docs/planning/M19-session-chat-fixes.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "sendDirect пишет очищенный текст в <debug>.text через .partial; файл, не забранный за directWaitMs, удаляется, результат false",
        "session.exp и pty/host.ts вставляют <debug>.text как bracketed paste с меткой MESSAGE_SENT; <debug>.message всегда означает пробуждение",
        "wakeSession не пишет <debug>.message, пока ждёт <debug>.text",
        "session.exp и pty/host.ts запускают claude с WFK_PANEL_SESSION=1; у провайдера Claude marksPanelProcess: true, поле описано в контракте Provider",
        "readMessages пропускает записи транскрипта с isCompactSummary: true",
        "Тесты покрывают оба файла на macOS/Linux и Windows (платформа подставлена); module.md и chat.md обновлены"
      ],
      "checks": [],
      "commitMessage": "fix: send panel text through its own control file and mark the panel process",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M19-session-chat-fixes.md",
          "required": true,
          "heading": "2. Решение"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/chat.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/screen.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/direct.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/chat.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/windows.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parts.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/harness.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "TODO",
      "title": "Claude: файл <debug>.text, метка процесса панели, лента без сводки сжатия",
      "why": "Старый сценарий принимал текст за просьбу разбудить, и сообщение терялось"
    },
    {
      "acceptance": [
        "wfk hook stop|prompt|turn-end передаёт panelProcess: true при WFK_PANEL_SESSION=1, иначе false",
        "HookInput.panelProcess и SessionActivity.external (true, когда последний хук сессии пришёл без метки) есть в канале и в /api/state",
        "Для провайдера с marksPanelProcess и внешней сессии createDirectMessage не вызывает sendDirect, wakeIdle и пробуждение для ревью не вызывают wakeSession; сообщение остаётся в очереди",
        "Для провайдера без marksPanelProcess (ChatGPT, Kimi) и для сессии с меткой поведение как в 0.9.0 — проверено тестами",
        "module.md обоих модулей и cli/session-chat.md обновлены"
      ],
      "checks": [],
      "commitMessage": "fix: queue panel messages for a session another process runs",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M19-session-chat-fixes.md",
          "required": true,
          "heading": "2. Решение"
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/hook-input.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/types.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/slots.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/routes.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/hook-service.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/direct-message.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/direct-message.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/hook-turn-end.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/review.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "TODO",
      "title": "Хук и канал: внешняя сессия получает сообщения только из очереди",
      "why": "Прямая вставка и пробуждение печатали в копию сессии, а не в чат приложения"
    },
    {
      "acceptance": [
        "Строка сессии в модели панели несёт external из активности канала (state.channel) для провайдера, который возобновляет сессии",
        "reviveSession не отправляет resume для внешней сессии; для остальных работает как раньше",
        "На экране внешней сессии строка состояния «Сессию ведёт приложение Claude вне панели; сообщения придут агенту с ближайшим хуком», кнопка «Продолжить» доступна",
        "Тесты панели покрывают оба случая; module.md обновлён"
      ],
      "checks": [],
      "commitMessage": "fix: do not resume a session another process runs when its screen opens",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M19-session-chat-fixes.md",
          "required": true,
          "heading": "2. Решение"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/actions.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/view-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/session-screen.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/activity-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "TODO",
      "title": "Панель: внешнюю сессию не возобновлять при открытии экрана",
      "why": "Открытие экрана сессии запускало второй процесс Claude с тем же идентификатором"
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
        "docs/planning/M19-session-chat-fixes.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md"
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
        "Версия 0.9.1 в package.json и package-lock.json; CHANGELOG, README, OVERVIEW и docs/installation.md обновлены",
        "wfk install обновил службу до 0.9.1, wfk doctor --installed без замечаний",
        "CI ветки ci/m19-session-chat-fixes зелёный на macOS, Linux, Windows x64 и Windows ARM64 для коммита выпуска",
        "docs/evidence/M19-acceptance.md перечисляет проверки выпуска и живые проверки по ОС: macOS — пользователь, Windows — проверяющий на Windows, Linux — CI"
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: release 0.9.1",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M19-session-chat-fixes.md",
          "required": true
        }
      ],
      "dependencies": [
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
        "docs/architecture/OVERVIEW.md",
        "docs/installation.md",
        "docs/evidence/M19-acceptance.md",
        "docs/changelog/CHANGELOG-0.5-0.8.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Выпуск 0.9.1",
      "why": "Пользователь проверяет исправления в установленной службе"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m19-session-chat-fixes (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: orchestrated (max 2 workers, owner 0c355c88-f324-49fe-909c-fe5617d16288)
- Current task: none
- Progress: 0/5
- Revision: 673

## Objective

Сообщение из карточки «Диалог» не теряется и приходит тому процессу Claude, в котором пользователь ведёт сессию; выпущена версия 0.9.1

## Acceptance

- Сообщение из панели в сессию под сценарием старой версии не теряется: оно уходит в очередь
- Сообщение из панели в сессию Claude, которую ведёт приложение вне панели, идёт в очередь и приходит в чат приложения с ближайшим хуком; панель не печатает в свою копию и не запускает её сама
- Сессия, которую ведёт процесс панели, получает сообщение сразу, как в 0.9.0; ChatGPT, Kimi, автопилот и ревью работают как раньше
- Тесты, проверка типов и check:platforms зелёные локально и в CI на macOS, Linux, Windows x64 и ARM64; выпущена версия 0.9.1

## Rounds

### R1 — Implementation (implementation, OPEN)

- [TODO] T001 — Claude: файл <debug>.text, метка процесса панели, лента без сводки сжатия (work, parallel-safe)
  - Commit: fix: send panel text through its own control file and mark the panel process
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/chat.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/screen.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/direct.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/chat.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/windows.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parts.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/harness.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md
- [TODO] T002 — Хук и канал: внешняя сессия получает сообщения только из очереди (work, parallel-safe)
  - Commit: fix: queue panel messages for a session another process runs
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/hook-input.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/types.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/slots.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/routes.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/hook-service.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/direct-message.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/direct-message.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/hook-turn-end.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/review.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md
  - Depends on: T001
- [TODO] T003 — Панель: внешнюю сессию не возобновлять при открытии экрана (work, parallel-safe)
  - Commit: fix: do not resume a session another process runs when its screen opens
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/actions.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/view-model.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/session-screen.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/activity-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M19-session-chat-fixes.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md
  - Depends on: T001, T002, T003
- [TODO] T004 — Выпуск 0.9.1 (delivery)
  - Commit: chore: release 0.9.1
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/architecture/OVERVIEW.md, docs/installation.md, docs/evidence/M19-acceptance.md, docs/changelog/CHANGELOG-0.5-0.8.md
  - Depends on: T002, T003, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
