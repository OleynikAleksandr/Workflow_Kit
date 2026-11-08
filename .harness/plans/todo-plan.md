# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-07T18:15:01.786Z",
    "scopeId": "m3-fixes"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 242,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "Provider.autostart?(); registry.autostart()",
          "Claude resumeInterrupted поднимает и окружение ('environment')",
          "cli: AUTOSTART_ATTEMPTS, AUTOSTART_PAUSE_MS"
        ],
        "decisions": [
          "Демон Codex запускается при каждом старте службы без подтверждения",
          "Подключённый или подключающийся демон не трогается"
        ],
        "references": [
          "docs/planning/M3-autostart.md"
        ],
        "result": "При старте службы демон Codex запускается сам (3 попытки по 30 с), прерванные окружения Claude поднимаются; остановка службы их не трогает."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "CLOSED",
      "title": "Implementation"
    },
    {
      "digest": {
        "contracts": [
          "DaemonState.remoteOwner 'app'; APP_OWNER_REASON; lastRemoteWarning, ALREADY_ONLINE"
        ],
        "decisions": [
          "Признак — предупреждение процесса демона в logs_<N>.sqlite Codex, только чтение"
        ],
        "references": [
          "docs/planning/M3-autostart.md#4"
        ],
        "result": "Соединение удалённого управления, занятое приложением ChatGPT (409 already online), — рабочее состояние: ChatGPT готов, сессии создаются."
      },
      "id": "R2",
      "kind": "fixes",
      "status": "CLOSED",
      "title": "Удалённое управление у приложения ChatGPT"
    },
    {
      "digest": {
        "contracts": [
          "provider-codex createSession: проверка соединения учитывает remoteOwner"
        ],
        "decisions": [
          "createSession отказывает codex-login только без remoteOwner app"
        ],
        "references": [
          "docs/planning/M3-autostart.md#5"
        ],
        "result": "Сессия ChatGPT создаётся и тогда, когда удалённое управление держит приложение ChatGPT."
      },
      "id": "R3",
      "kind": "fixes",
      "status": "CLOSED",
      "title": "Создание сессии при соединении у приложения ChatGPT"
    },
    {
      "digest": {
        "contracts": [
          "panel-shell: chatStatus(session, link); sessionStatus для всех провайдеров"
        ],
        "decisions": [
          "Чат открывается только щелчком по карточке, не при открытии экрана по адресу"
        ],
        "references": [
          "docs/planning/M3-autostart.md#6"
        ],
        "result": "Щелчок по карточке сессии ChatGPT открывает её чат; «Открыть чат» убран с экрана и из меню, в заголовке — строка состояния."
      },
      "id": "R4",
      "kind": "fixes",
      "status": "CLOSED",
      "title": "Щелчок по сессии ChatGPT открывает чат"
    },
    {
      "digest": {
        "contracts": [
          "POST /api/open-link (loopback, macOS, codex://threads)",
          "SlotContext.openSession; arrivedSession, ARRIVAL_WAIT_MS",
          "addBeforeDeleteHook; Provider.deleteSessions?; registry.deleteSessions"
        ],
        "decisions": [
          "Чат новой сессии на Mac открывает служба (open), окно без щелчка может ссылку не открыть",
          "Уборка проекта только из списка треды не трогает"
        ],
        "references": [
          "docs/planning/M3-autostart.md#7"
        ],
        "result": "Новая сессия открывается сама, у ChatGPT — с чатом в приложении (на Mac ссылку открывает служба); удаление проекта с диска удаляет его треды ChatGPT."
      },
      "id": "R5",
      "kind": "fixes",
      "status": "CLOSED",
      "title": "Новая сессия открывается сама; удаление тредов ChatGPT"
    },
    {
      "digest": {
        "contracts": [
          "Provider.retryDeletes?; registry.retryDeletes; DELETE_RETRY_MS; deleting.ts THREAD_GONE, DELETE_KEEP_MS"
        ],
        "decisions": [
          "Очередь — sessions/codex-deleting.json, срок попыток 7 дней"
        ],
        "references": [
          "docs/planning/M3-autostart.md#8"
        ],
        "result": "Тред ChatGPT, который приложение держит открытым, ждёт в очереди удаления и удаляется повтором раз в минуту; «no rollout found» считается удалением."
      },
      "id": "R6",
      "kind": "fixes",
      "status": "CLOSED",
      "title": "Отложенное удаление тредов ChatGPT"
    },
    {
      "digest": {
        "contracts": [
          "provider-codex app-catalog.ts: forgetInAppCatalog, CATALOG_TABLES, CATALOG_BACKUPS_KEPT",
          "provider-claude purge.ts: deleteSessions → claude purge <папка> -y"
        ],
        "decisions": [
          "Отдельные папки настроек ChatGPT/Claude на проект отклонены",
          "Запись в codex.db приложения — с согласия пользователя, копия до записи, 5 последних копий"
        ],
        "references": [
          "docs/planning/M3-autostart.md#9"
        ],
        "result": "Удаление проекта с диска убирает тред и из каталога приложения ChatGPT (codex.db, с копией и проверкой) и стирает данные проекта Claude Code через claude purge."
      },
      "id": "R7",
      "kind": "fixes",
      "status": "CLOSED",
      "title": "Следы проекта в ChatGPT и Claude"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "После перезагрузки Mac ChatGPT активен без кнопки «Запустить демон»",
      "Новый релиз установлен, wfk doctor --installed — всё в порядке"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-07T18:32:59.445Z",
      "text": "Ну, тогда все в порядке. Раз при инсталляции Workflow Kit мы ставим эту службу в автоматический запуск при старте операционной системы, то я проблем не вижу. | Execution mode chosen by the user: sequential: Выбрал последовательный"
    },
    "baselineCommit": "4c1f22b35564a21e0e05bf0dce1450c42e27b126",
    "blockedReason": null,
    "context": [],
    "decisions": [
      {
        "at": "2026-11-07T18:32:59.445Z",
        "text": "Демон Codex запускается при каждом старте службы без согласий; при остановке службы не останавливается"
      }
    ],
    "delivery": "READY_FOR_ACCEPTANCE",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "cb3d513d-4c3d-4df1-87cc-0504037096d6",
      "strategy": "sequential"
    },
    "id": "m3-autostart",
    "objective": "При старте службы Workflow Kit сам поднимает демон Codex и прерванные окружения Claude; новый релиз",
    "spec": "docs/planning/M3-autostart.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "При старте службы демон Codex запускается, если не работает или не подключён; 3 попытки с паузой",
        "Подключённый или подключающийся демон не трогается",
        "Прерванное окружение Claude поднимается при старте, остановленное намеренно и архивное — нет"
      ],
      "checks": [],
      "commitMessage": "feat: start the Codex daemon and interrupted Claude environments with the service",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-autostart.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/environment.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/registry.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/routes.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/fake-provider.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/provider-lifecycle.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/providers.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Автозапуск демона Codex и окружений Claude",
      "why": "Автозапуск демона Codex и окружений Claude"
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
        "docs/planning/M3-autostart.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
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
        "Версия 0.3.7",
        "install ставит app/0.3.7, wfk doctor --installed — всё в порядке"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.3.7",
      "confirmation": "Ну, тогда все в порядке. Раз при инсталляции Workflow Kit мы ставим эту службу в автоматический запуск при старте операционной системы, то я проблем не вижу.",
      "context": [],
      "dependencies": [
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "docs/evidence/M3-acceptance.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Релиз 0.3.7",
      "why": "Релиз 0.3.7"
    },
    {
      "acceptance": [
        "409 «Remote app server already online» у демона читается как remoteOwner app, а не ошибка входа",
        "Индикатор ChatGPT готов, создание сессий доступно, действия демона нет",
        "Автозапуск в этом состоянии ничего не делает"
      ],
      "checks": [],
      "commitMessage": "fix: treat the remote control held by the ChatGPT app as a working state",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-autostart.md",
          "heading": "4. Раунд 2: удалённое управление держит приложение ChatGPT",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/codex-files.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/helpers.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "DONE",
      "title": "Соединение, занятое приложением ChatGPT, — рабочее состояние",
      "why": "Соединение, занятое приложением ChatGPT, — рабочее состояние"
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
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md"
      ],
      "fixes": null,
      "id": "DOCS-R2",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R2",
      "status": "DONE",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "Версия 0.3.8",
        "install ставит app/0.3.8, wfk doctor --installed — всё в порядке, ChatGPT готов"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.3.8",
      "confirmation": "Ну, тогда все в порядке. Раз при инсталляции Workflow Kit мы ставим эту службу в автоматический запуск при старте операционной системы, то я проблем не вижу.",
      "context": [],
      "dependencies": [
        "DOCS-R2"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "docs/evidence/M3-acceptance.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R2",
      "status": "DONE",
      "title": "Релиз 0.3.8",
      "why": "Релиз 0.3.8"
    },
    {
      "acceptance": [
        "При remoteOwner app createSession не отказывает codex-login",
        "Ошибка входа без remoteOwner app по-прежнему отказывает"
      ],
      "checks": [],
      "commitMessage": "fix: create Codex sessions while the ChatGPT app holds remote control",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-autostart.md",
          "heading": "5. Раунд 3: создание сессии при соединении у приложения ChatGPT",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md"
      ],
      "fixes": "T003",
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R3",
      "status": "DONE",
      "title": "Сессия создаётся, когда соединение держит приложение ChatGPT",
      "why": "Сессия создаётся, когда соединение держит приложение ChatGPT"
    },
    {
      "acceptance": [
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R3",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md"
      ],
      "fixes": null,
      "id": "DOCS-R3",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R3",
      "status": "DONE",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "Версия 0.3.9",
        "install ставит app/0.3.9, wfk doctor --installed — всё в порядке"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.3.9",
      "confirmation": "Проверяю, да. Типа запустился демон, но получили другую проблему. Смотри на скриншот.",
      "context": [],
      "dependencies": [
        "DOCS-R3"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "docs/evidence/M3-acceptance.md"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R3",
      "status": "DONE",
      "title": "Релиз 0.3.9",
      "why": "Релиз 0.3.9"
    },
    {
      "acceptance": [
        "Щелчок по карточке сессии ChatGPT открывает её чат и экран сессии",
        "«Открыть чат» нет ни на экране сессии, ни в меню; в заголовке — строка состояния",
        "Открытие экрана сессии без щелчка чат не открывает"
      ],
      "checks": [],
      "commitMessage": "feat: a click on a ChatGPT session card opens its chat",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-autostart.md",
          "heading": "6. Раунд 4: щелчок по карточке сессии ChatGPT открывает чат",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/sidebar.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/actions.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/screens.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/view-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "work",
      "roundId": "R4",
      "status": "DONE",
      "title": "Карточка сессии ChatGPT открывает чат",
      "why": "Карточка сессии ChatGPT открывает чат"
    },
    {
      "acceptance": [
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R4",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T007"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md"
      ],
      "fixes": null,
      "id": "DOCS-R4",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R4",
      "status": "DONE",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "Версия 0.3.10",
        "install ставит app/0.3.10, wfk doctor --installed — всё в порядке"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.3.10",
      "confirmation": "Нужно, чтобы эта кнопка была на самой карточке сессии.",
      "context": [],
      "dependencies": [
        "DOCS-R4"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "docs/evidence/M3-acceptance.md"
      ],
      "fixes": null,
      "id": "T008",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R4",
      "status": "DONE",
      "title": "Релиз 0.3.10",
      "why": "Релиз 0.3.10"
    },
    {
      "acceptance": [
        "Сессия из мастера и из «Новая сессия» открывается сама, когда появилась в дереве",
        "У ChatGPT при этом открывается её чат в приложении",
        "Ожидание новой сессии кончается через 3 минуты"
      ],
      "checks": [],
      "commitMessage": "feat: a new session opens by itself, a ChatGPT one with its chat",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-autostart.md",
          "heading": "7. Раунд 5: новая сессия открывается сама; удаление проекта удаляет треды ChatGPT",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/actions.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/slots.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/sidebar.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/view-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/project-wizard.js",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/open-link.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/open-link.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
      ],
      "fixes": null,
      "id": "T009",
      "iteration": 1,
      "kind": "work",
      "roundId": "R5",
      "status": "DONE",
      "title": "Новая сессия открывается сама",
      "why": "Новая сессия открывается сама"
    },
    {
      "acceptance": [
        "Перед удалением папки каждому треду ChatGPT проекта уходит thread/delete",
        "Неудача удаления треда пишется в журнал и не отменяет удаление проекта",
        "Уборка проекта только из списка треды не трогает"
      ],
      "checks": [],
      "commitMessage": "feat: deleting a project from disk deletes its ChatGPT threads",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-autostart.md",
          "heading": "7. Раунд 5: новая сессия открывается сама; удаление проекта удаляет треды ChatGPT",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/projects/modules/project-registry/src/registry.ts",
        "product-parts/backend-core/clusters/projects/modules/project-registry/src/index.ts",
        "product-parts/backend-core/clusters/projects/modules/project-registry/test/registry.test.ts",
        "product-parts/backend-core/clusters/projects/modules/project-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/registry.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/routes.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/fake-provider.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/provider-lifecycle.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/providers.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
      ],
      "fixes": null,
      "id": "T010",
      "iteration": 1,
      "kind": "work",
      "roundId": "R5",
      "status": "DONE",
      "title": "Удаление проекта с диска удаляет треды ChatGPT",
      "why": "Удаление проекта с диска удаляет треды ChatGPT"
    },
    {
      "acceptance": [
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R5",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T009",
        "T010"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md",
        "product-parts/backend-core/clusters/projects/modules/project-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
      ],
      "fixes": null,
      "id": "DOCS-R5",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R5",
      "status": "DONE",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "Версия 0.3.11",
        "install ставит app/0.3.11, wfk doctor --installed — всё в порядке"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.3.11",
      "confirmation": "Да, все работает, только я бы этот щелчок сделал бы тоже автоматизированным. И попробуй найти способ при удалении проекта с сессий ChatGPT чтобы в самом ChatGPT она тоже удалялась.",
      "context": [],
      "dependencies": [
        "DOCS-R5"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "docs/evidence/M3-acceptance.md"
      ],
      "fixes": null,
      "id": "T011",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R5",
      "status": "DONE",
      "title": "Релиз 0.3.11",
      "why": "Релиз 0.3.11"
    },
    {
      "acceptance": [
        "«no rollout found» считается удалением",
        "Тред с отказом попадает в очередь и удаляется повтором раз в минуту и при старте",
        "Через 7 дней тред уходит из очереди со строкой в журнале"
      ],
      "checks": [],
      "commitMessage": "fix: retry deleting ChatGPT threads the app still holds",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-autostart.md",
          "heading": "8. Раунд 6: тред, занятый приложением ChatGPT, удаляется позже",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/deleting.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/registry.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/routes.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/fake-provider.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/provider-lifecycle.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/providers.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
      ],
      "fixes": "T010",
      "id": "T012",
      "iteration": 1,
      "kind": "work",
      "roundId": "R6",
      "status": "DONE",
      "title": "Очередь удаления тредов ChatGPT",
      "why": "Очередь удаления тредов ChatGPT"
    },
    {
      "acceptance": [
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R6",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T012"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
      ],
      "fixes": null,
      "id": "DOCS-R6",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R6",
      "status": "DONE",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "Версия 0.3.12",
        "install ставит app/0.3.12, wfk doctor --installed — всё в порядке"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.3.12",
      "confirmation": "Но вот удаление готового проекта из архива и из диска не удаляет сессию, которая фигурирует в чат GPT десктопе.",
      "context": [],
      "dependencies": [
        "DOCS-R6"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "docs/evidence/M3-acceptance.md"
      ],
      "fixes": null,
      "id": "T013",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R6",
      "status": "DONE",
      "title": "Релиз 0.3.12",
      "why": "Релиз 0.3.12"
    },
    {
      "acceptance": [
        "Удалённый тред убирается из трёх таблиц codex.db приложения с копией базы и проверкой",
        "Без базы или записей ничего не пишется; ошибка не мешает удалению проекта",
        "Хранятся 5 последних копий"
      ],
      "checks": [],
      "commitMessage": "feat: remove deleted threads from the ChatGPT app catalog",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-autostart.md",
          "heading": "9. Раунд 7: удаление проекта убирает его следы в ChatGPT и Claude на Mac",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/app-catalog.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/deleting.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/app-catalog.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/catalog-fixture.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md"
      ],
      "fixes": "T012",
      "id": "T014",
      "iteration": 1,
      "kind": "work",
      "roundId": "R7",
      "status": "DONE",
      "title": "Тред уходит из каталога приложения ChatGPT",
      "why": "Тред уходит из каталога приложения ChatGPT"
    },
    {
      "acceptance": [
        "Удаление проекта с диска выполняет claude purge <папка> -y",
        "Ошибка purge пишется в журнал и не мешает удалению"
      ],
      "checks": [],
      "commitMessage": "feat: purge the Claude Code data of a project deleted from disk",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-autostart.md",
          "heading": "9. Раунд 7: удаление проекта убирает его следы в ChatGPT и Claude на Mac",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/purge.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/fixtures/fake-claude.mjs",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md"
      ],
      "fixes": null,
      "id": "T015",
      "iteration": 1,
      "kind": "work",
      "roundId": "R7",
      "status": "DONE",
      "title": "claude purge при удалении проекта",
      "why": "claude purge при удалении проекта"
    },
    {
      "acceptance": [
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R7",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T014",
        "T015"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md"
      ],
      "fixes": null,
      "id": "DOCS-R7",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R7",
      "status": "DONE",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "Версия 0.3.13",
        "install ставит app/0.3.13, wfk doctor --installed — всё в порядке"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.3.13",
      "confirmation": "Понял, хорошо. Делай тогда так. Как предлагаешь. Собери новый релиз, будем тестировать.",
      "context": [],
      "dependencies": [
        "DOCS-R7"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "docs/evidence/M3-acceptance.md"
      ],
      "fixes": null,
      "id": "T016",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R7",
      "status": "DONE",
      "title": "Релиз 0.3.13",
      "why": "Релиз 0.3.13"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m3-autostart (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 23/23
- Revision: 242

## Objective

При старте службы Workflow Kit сам поднимает демон Codex и прерванные окружения Claude; новый релиз

## Acceptance

- После перезагрузки Mac ChatGPT активен без кнопки «Запустить демон»
- Новый релиз установлен, wfk doctor --installed — всё в порядке

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Автозапуск демона Codex и окружений Claude (work)
  - Commit: feat: start the Codex daemon and interrupted Claude environments with the service
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/environment.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/registry.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/routes.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/fake-provider.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/provider-lifecycle.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/providers.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M3-autostart.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md
  - Depends on: T001
- [DONE] T002 — Релиз 0.3.7 (delivery)
  - Commit: chore: release 0.3.7
  - Files: package.json, package-lock.json, docs/evidence/M3-acceptance.md
  - Depends on: DOCS-R1

Digest: При старте службы демон Codex запускается сам (3 попытки по 30 с), прерванные окружения Claude поднимаются; остановка службы их не трогает.

### R2 — Удалённое управление у приложения ChatGPT (fixes, CLOSED)

- [DONE] T003 — Соединение, занятое приложением ChatGPT, — рабочее состояние (work)
  - Commit: fix: treat the remote control held by the ChatGPT app as a working state
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/codex-files.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/helpers.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts
- [DONE] DOCS-R2 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R2
  - Files: README.md, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md
  - Depends on: T003
- [DONE] T004 — Релиз 0.3.8 (delivery)
  - Commit: chore: release 0.3.8
  - Files: package.json, package-lock.json, docs/evidence/M3-acceptance.md
  - Depends on: DOCS-R2

Digest: Соединение удалённого управления, занятое приложением ChatGPT (409 already online), — рабочее состояние: ChatGPT готов, сессии создаются.

### R3 — Создание сессии при соединении у приложения ChatGPT (fixes, CLOSED)

- [DONE] T005 — Сессия создаётся, когда соединение держит приложение ChatGPT (work)
  - Commit: fix: create Codex sessions while the ChatGPT app holds remote control
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md
  - Fixes: T003
- [DONE] DOCS-R3 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R3
  - Files: README.md, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md
  - Depends on: T005
- [DONE] T006 — Релиз 0.3.9 (delivery)
  - Commit: chore: release 0.3.9
  - Files: package.json, package-lock.json, docs/evidence/M3-acceptance.md
  - Depends on: DOCS-R3

Digest: Сессия ChatGPT создаётся и тогда, когда удалённое управление держит приложение ChatGPT.

### R4 — Щелчок по сессии ChatGPT открывает чат (fixes, CLOSED)

- [DONE] T007 — Карточка сессии ChatGPT открывает чат (work)
  - Commit: feat: a click on a ChatGPT session card opens its chat
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/sidebar.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/actions.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/screens.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/view-model.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md
- [DONE] DOCS-R4 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R4
  - Files: README.md, docs/architecture/OVERVIEW.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md
  - Depends on: T007
- [DONE] T008 — Релиз 0.3.10 (delivery)
  - Commit: chore: release 0.3.10
  - Files: package.json, package-lock.json, docs/evidence/M3-acceptance.md
  - Depends on: DOCS-R4

Digest: Щелчок по карточке сессии ChatGPT открывает её чат; «Открыть чат» убран с экрана и из меню, в заголовке — строка состояния.

### R5 — Новая сессия открывается сама; удаление тредов ChatGPT (fixes, CLOSED)

- [DONE] T009 — Новая сессия открывается сама (work)
  - Commit: feat: a new session opens by itself, a ChatGPT one with its chat
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/actions.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/slots.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/sidebar.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/view-model.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/project-wizard.js, product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/open-link.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/open-link.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md
- [DONE] T010 — Удаление проекта с диска удаляет треды ChatGPT (work)
  - Commit: feat: deleting a project from disk deletes its ChatGPT threads
  - Files: product-parts/backend-core/clusters/projects/modules/project-registry/src/registry.ts, product-parts/backend-core/clusters/projects/modules/project-registry/src/index.ts, product-parts/backend-core/clusters/projects/modules/project-registry/test/registry.test.ts, product-parts/backend-core/clusters/projects/modules/project-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/registry.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/routes.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/fake-provider.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/provider-lifecycle.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/providers.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md
- [DONE] DOCS-R5 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R5
  - Files: README.md, docs/architecture/OVERVIEW.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md, product-parts/backend-core/clusters/projects/modules/project-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md
  - Depends on: T009, T010
- [DONE] T011 — Релиз 0.3.11 (delivery)
  - Commit: chore: release 0.3.11
  - Files: package.json, package-lock.json, docs/evidence/M3-acceptance.md
  - Depends on: DOCS-R5

Digest: Новая сессия открывается сама, у ChatGPT — с чатом в приложении (на Mac ссылку открывает служба); удаление проекта с диска удаляет его треды ChatGPT.

### R6 — Отложенное удаление тредов ChatGPT (fixes, CLOSED)

- [DONE] T012 — Очередь удаления тредов ChatGPT (work)
  - Commit: fix: retry deleting ChatGPT threads the app still holds
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/deleting.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/registry.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/routes.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/fake-provider.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/provider-lifecycle.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/providers.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md
  - Fixes: T010
- [DONE] DOCS-R6 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R6
  - Files: README.md, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md
  - Depends on: T012
- [DONE] T013 — Релиз 0.3.12 (delivery)
  - Commit: chore: release 0.3.12
  - Files: package.json, package-lock.json, docs/evidence/M3-acceptance.md
  - Depends on: DOCS-R6

Digest: Тред ChatGPT, который приложение держит открытым, ждёт в очереди удаления и удаляется повтором раз в минуту; «no rollout found» считается удалением.

### R7 — Следы проекта в ChatGPT и Claude (fixes, CLOSED)

- [DONE] T014 — Тред уходит из каталога приложения ChatGPT (work)
  - Commit: feat: remove deleted threads from the ChatGPT app catalog
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/app-catalog.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/deleting.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/app-catalog.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/catalog-fixture.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md
  - Fixes: T012
- [DONE] T015 — claude purge при удалении проекта (work)
  - Commit: feat: purge the Claude Code data of a project deleted from disk
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/purge.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/fixtures/fake-claude.mjs, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md
- [DONE] DOCS-R7 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R7
  - Files: README.md, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md
  - Depends on: T014, T015
- [DONE] T016 — Релиз 0.3.13 (delivery)
  - Commit: chore: release 0.3.13
  - Files: package.json, package-lock.json, docs/evidence/M3-acceptance.md
  - Depends on: DOCS-R7

Digest: Удаление проекта с диска убирает тред и из каталога приложения ChatGPT (codex.db, с копией и проверкой) и стирает данные проекта Claude Code через claude purge.

State changes only through `scripts/workflow` commands. History lives in Git.
