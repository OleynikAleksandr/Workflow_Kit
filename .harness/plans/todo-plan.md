# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-06T17:23:09.352Z",
    "scopeId": "m2-interface-and-process"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 162,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "provider-codex: renameSession всегда thread/name/set; RENAME_LATER_NOTE удалён",
          "agent-channel: HookInput.sessionTitle из session_title",
          "session-titles: appTitle(key, current), CLAUDE_NEXT_NOTE, synced для Claude",
          "cli: ответ prompt сессии Claude несёт hookSpecificOutput.sessionTitle"
        ],
        "decisions": [
          "Codex: проверка «тред загружен» перед thread/name/set убрана (проверено на демоне: тред не загружается)",
          "Claude: имя передаёт хук Kit, а не агент (/rename — команда пользователя); одно имя отправляется один раз за работу службы, чтобы не перебивать переименование в приложении"
        ],
        "references": [
          "docs/planning/M3-fixes.md"
        ],
        "result": "Имена сессий Workflow Kit уходят в приложения: Codex — thread/name/set демона для любого треда без загрузки; Claude — hookSpecificOutput.sessionTitle в ответе хука UserPromptSubmit, один раз на имя."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "CLOSED",
      "title": "Implementation"
    },
    {
      "digest": {
        "contracts": [
          "session-titles: load() отправляет неотправленные имена Codex через rename"
        ],
        "decisions": [
          "Повтор при load() идёт в фоне и не задерживает запуск службы; забытые сессии пропускаются"
        ],
        "references": [
          "docs/planning/M3-fixes.md",
          "docs/evidence/M3-acceptance.md"
        ],
        "result": "Имена Codex, не дошедшие до ChatGPT (synced не true), отправляются заново при запуске службы, а не при следующем ходе сессии."
      },
      "id": "R2",
      "kind": "fixes",
      "status": "CLOSED",
      "title": "Fixes"
    },
    {
      "digest": {
        "contracts": [
          "provider-claude: renameSession, RENAME_WAIT_MS, RENAME_BY_HOOK_NOTE; session.exp читает <debug>.rename и печатает RENAMED",
          "session-titles: onStop(key); имена Claude через rename вне хода",
          "cli: обёртка канала вызывает titles.onStop на хуке stop",
          "panel-shell: без выбранного проекта дерево пусто"
        ],
        "decisions": [
          "/rename вводится только вне хода (канал не working) или на Stop: ввод во время хода мог бы ответить на диалог разрешения",
          "Хук UserPromptSubmit с sessionTitle остаётся запасным путём для сессий, начатых не панелью",
          "Записи файла имени сессии сериализуются; поздний отказ не перезаписывает подтверждённое имя"
        ],
        "references": [
          "docs/planning/M3-fixes.md#7. Раунд 3: имя Claude через /rename"
        ],
        "result": "Имя сессии Claude из Kit уходит в приложение командой /rename, которую session.exp вводит в терминал сессии вне хода (сразу или на Stop). Карточка «Проектов пока нет» убрана из боковой панели."
      },
      "id": "R3",
      "kind": "fixes",
      "status": "CLOSED",
      "title": "Fixes"
    },
    {
      "digest": {
        "contracts": [
          "panel-shell: homeScreen() без параметров — только приветствие"
        ],
        "decisions": [
          "Каждый релиз повышает версию package.json; веха 3 начинается с 0.3.0"
        ],
        "references": [
          "docs/planning/M3-fixes.md#8. Раунд 4: версия релиза и главный экран"
        ],
        "result": "Главный экран без карточки «Начните с проекта» (создание и выбор проекта — в меню «Ваши проекты»); принято правило: каждый релиз повышает версию, веха 3 — 0.3.x."
      },
      "id": "R4",
      "kind": "fixes",
      "status": "CLOSED",
      "title": "Fixes"
    },
    {
      "digest": {
        "contracts": [
          "provider-codex: CONNECTING_REASON, STATUS_WAIT_MS; действие «Подключить к ChatGPT» у работающего демона с выключенной связью",
          "project-wizard: PREVIEW_RECHECK_MS, refreshPreview, action-disabled без ошибки"
        ],
        "decisions": [
          "Неизвестный статус связи демона не означает «не подключён»: остаётся последний известный у того же процесса",
          "Действие демона предлагается, только когда пользователю есть что сделать"
        ],
        "references": [
          "docs/planning/M3-fixes.md#9. Раунд 5: состояние демона Codex в мастере"
        ],
        "result": "Состояние демона Codex согласовано: статус связи ждётся до 3 с и не затирается неизвестным; «подключается» — ждать без действия; «Подключить к ChatGPT» только при выключенной связи. Мастер перечитывает предпросмотр, пока провайдер не готов, и не показывает ошибкой отказ ненужного действия."
      },
      "id": "R5",
      "kind": "fixes",
      "status": "CLOSED",
      "title": "Fixes"
    },
    {
      "digest": {
        "contracts": [
          "provider-codex: DaemonState.staleLogin, STALE_LOGIN_REASON, действие «Перезапустить демон»",
          "session-titles: setServiceTurn, код service-turn; project-setup: SERVICE_MESSAGE_MARK",
          "provider-registry: Provider.wakeSession?; provider-claude: wakeSession, session.exp <debug>.message",
          "autopilot: ready-for-acceptance в удерживаемых причинах"
        ],
        "decisions": [
          "Устаревший вход: 401 в журнале демона и auth.json новее старта — «Перезапустить демон», не codex login",
          "Тема в служебном ходе отклоняется (service-turn)",
          "ready-for-acceptance удерживает Stop, после принятия — нет",
          "Спящий чат ChatGPT снаружи не будится: панель предупреждает"
        ],
        "references": [
          "docs/planning/M3-fixes.md#10. Раунд 6: устаревший вход демона и тема служебного хода"
        ],
        "result": "Демон Codex с устаревшим входом распознаётся и перезапускается кнопкой; тема сессии не задаётся по служебному приветствию; при ожидании приёмки Stop удерживается, и «Нужны исправления» доходит сразу; спящая сессия Claude панели будится сообщением панели."
      },
      "id": "R6",
      "kind": "fixes",
      "status": "CLOSED",
      "title": "Fixes"
    },
    {
      "digest": {
        "contracts": [
          "plan-view: ChoiceOptionView без claudeOnly; choiceOptionsFor отдаёт все варианты",
          "autopilot: executorHowto, CLAUDE_EXECUTOR_HOWTO, CODEX_EXECUTOR_HOWTO; orchestrated-claude-only снят",
          "kit-structure: раздел «Orchestration with your app's subagents» в AGENTS.md"
        ],
        "decisions": [
          "Kit 2.2.2 не создаёт рабочую копию исполнителю; оркестратор Codex создаёт её сам в .workflow-kit/local/worktrees/<id> от baseCommit (проверено пробой)",
          "Оркестрация силами Workflow Kit с любым CLI-подагентом — следующий этап"
        ],
        "references": [
          "docs/planning/M3-orchestration.md"
        ],
        "result": "Оркестрация встроенными подагентами доступна сессиям Claude и ChatGPT: оркестратор раздаёт назначения Kit подагентам своего приложения (Claude — Agent с worktree, Codex — свой git worktree и spawn_agent) и интегрирует их коммиты."
      },
      "id": "R7",
      "kind": "implementation",
      "status": "CLOSED",
      "title": "Orchestration with built-in subagents"
    },
    {
      "digest": null,
      "id": "R8",
      "kind": "fixes",
      "status": "OPEN",
      "title": "Мастер с чистого листа и сообщение агенту из панели"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "Имя сессии, заданное в Workflow Kit, видно в ChatGPT и в Claude",
      "Новый релиз установлен, wfk doctor --installed — всё в порядке"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-06T17:27:53.577Z",
      "text": "Пользователь: «И открыть следующий по дальнейшим исправлениям, корректировкам, дополнениям. … возможность переименования в самих десктопах. Сессий. … разберись, сделай, и собери новый релиз.» | Execution mode chosen by the user: sequential: Последовательно"
    },
    "baselineCommit": "ae5d1e7f4368c673e6dc54e75c8b4d4f661e83ba",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M3-fixes.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-06T17:27:53.577Z",
        "text": "Codex: thread/name/set без проверки загрузки треда"
      },
      {
        "at": "2026-11-06T17:27:53.577Z",
        "text": "Claude: имя передаёт хук UserPromptSubmit полем hookSpecificOutput.sessionTitle"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "cfa00ffe-c414-4ae6-9953-e3d2906b3705",
      "strategy": "sequential"
    },
    "id": "m3-fixes",
    "objective": "Исправления и дополнения после вехи 2; раунд 1 — имена сессий Workflow Kit видны в приложениях Claude и ChatGPT, новый релиз",
    "spec": "docs/planning/M3-fixes.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "renameSession вызывает thread/name/set для незагруженного треда и возвращает synced: true",
        "Отказ демона — synced: false с причиной и повтор при следующем ходе",
        "Тред не загружается ради имени (нет thread/resume)"
      ],
      "checks": [],
      "commitMessage": "fix: rename Codex threads that the daemon does not hold",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-fixes.md",
          "heading": "4. Раунд 1: имена сессий в приложениях",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/release.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Имя сессии Codex в ChatGPT",
      "why": "Имя не доходило до ChatGPT: служба отказывалась, пока тред не загружен"
    },
    {
      "acceptance": [
        "Вход хука читает session_title",
        "Ответ на UserPromptSubmit сессии Claude несёт hookSpecificOutput.sessionTitle, пока имя в Claude отличается от имени Kit",
        "После совпадения имени поле не отправляется и synced: true",
        "additionalContext очереди сообщений сохраняется в том же ответе"
      ],
      "checks": [],
      "commitMessage": "feat: send the Kit session name to Claude through the prompt hook",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-fixes.md",
          "heading": "4. Раунд 1: имена сессий в приложениях",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/hook-input.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/titles.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/test/titles.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Имя сессии Claude через хук",
      "why": "Агент не может переименовать сессию Claude; хук Kit может"
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
        "docs/planning/M3-fixes.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md",
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
        "node bin/wfk.mjs install и wfk doctor --installed — всё в порядке",
        "Имя из панели видно в ChatGPT и в Claude; результат записан в docs/evidence/M3-acceptance.md"
      ],
      "checks": [],
      "commitMessage": "chore: install the M3 round 1 release",
      "confirmation": "разберись, сделай, и собери новый релиз",
      "context": [],
      "dependencies": [
        "T001",
        "T002",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M3-acceptance.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Релиз раунда 1",
      "why": "Релиз раунда 1"
    },
    {
      "acceptance": [
        "load() отправляет имена Codex с synced: false (ручное имя или тема) через rename",
        "Имя с synced: true повторно не отправляется"
      ],
      "checks": [],
      "commitMessage": "fix: retry unsynced Codex names when the service starts",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-fixes.md",
          "heading": "4. Раунд 1: имена сессий в приложениях",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/titles.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/test/titles.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md"
      ],
      "fixes": "T001",
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "DONE",
      "title": "Повтор неотправленных имён Codex при запуске службы",
      "why": "После перезапуска службы имя со synced: false ждало хода в этой сессии и не доходило до ChatGPT"
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
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md"
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
        "node bin/wfk.mjs install и wfk doctor --installed — всё в порядке",
        "Имена сессий видны в ChatGPT и в Claude; результат записан в docs/evidence/M3-acceptance.md"
      ],
      "checks": [],
      "commitMessage": "chore: install the M3 round 2 release",
      "confirmation": "разберись, сделай, и собери новый релиз",
      "context": [],
      "dependencies": [
        "T004",
        "DOCS-R2"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M3-acceptance.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R2",
      "status": "DONE",
      "title": "Релиз раунда 2",
      "why": "Релиз раунда 2"
    },
    {
      "acceptance": [
        "session.exp после ссылки раз в секунду проверяет файл <debug>.rename и вводит /rename <имя>, печатает RENAMED",
        "renameSession провайдера Claude пишет файл для работающей сессии Kit и ждёт RENAMED; без процесса Kit — synced: false с заметкой",
        "session-titles отправляет имя Claude через rename, только когда сессия не в ходе (не working); в ходе — повтор на Stop",
        "Хук UserPromptSubmit остаётся запасным путём для сессий, начатых не Kit"
      ],
      "checks": [],
      "commitMessage": "feat: rename Claude Remote Control sessions with /rename in their terminal",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-fixes.md",
          "heading": "7. Раунд 3: имя Claude через /rename",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parts.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/harness.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/fixtures",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/titles.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/test/titles.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "roundId": "R3",
      "status": "DONE",
      "title": "Имя сессии Claude через /rename",
      "why": "Имя из хука UserPromptSubmit ждёт сообщения пользователя, а автопилот идёт через Stop; приложение Claude показывает имя проекта"
    },
    {
      "acceptance": [
        "Без выбранного проекта под «Ваши проекты» нет пунктирной карточки",
        "Меню «Ваши проекты» по-прежнему показывает «Проектов пока нет» и действия создания"
      ],
      "checks": [],
      "commitMessage": "fix: drop the empty projects card from the sidebar",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-fixes.md",
          "heading": "7. Раунд 3: имя Claude через /rename",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/sidebar.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/tree.css",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "work",
      "roundId": "R3",
      "status": "DONE",
      "title": "Убрать карточку «Проектов пока нет» из боковой панели",
      "why": "Карточка повторяет меню «Ваши проекты»"
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
        "T006",
        "T007"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md"
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
        "node bin/wfk.mjs install и wfk doctor --installed — всё в порядке",
        "Имя сессии Claude из Kit видно в приложении Claude; результат в docs/evidence/M3-acceptance.md"
      ],
      "checks": [],
      "commitMessage": "chore: install the M3 round 3 release",
      "confirmation": "разберись, сделай, и собери новый релиз",
      "context": [],
      "dependencies": [
        "T006",
        "T007",
        "DOCS-R3"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M3-acceptance.md"
      ],
      "fixes": null,
      "id": "T008",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R3",
      "status": "DONE",
      "title": "Релиз раунда 3",
      "why": "Релиз раунда 3"
    },
    {
      "acceptance": [
        "Главный экран без проекта — заголовок и строка о Kit, без карточки и кнопок",
        "Создание и открытие проекта остаются в меню «Ваши проекты»"
      ],
      "checks": [],
      "commitMessage": "fix: drop the start card from the home screen",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-fixes.md",
          "heading": "8. Раунд 4: версия релиза и главный экран",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/screens.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts"
      ],
      "fixes": "T007",
      "id": "T009",
      "iteration": 1,
      "kind": "work",
      "roundId": "R4",
      "status": "DONE",
      "title": "Главный экран без карточки «Начните с проекта»",
      "why": "Карточка повторяет меню «Ваши проекты»; раунд 3 убрал не ту карточку"
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
        "T009"
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
        "package.json и package-lock.json — версия 0.3.0",
        "node bin/wfk.mjs install ставит app/0.3.0, wfk doctor --installed — всё в порядке, панель показывает 0.3.0"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.3.0",
      "confirmation": "что значит новый релиз установлен? Если я вижу маркировку Workflow Kit 0.1.0",
      "context": [],
      "dependencies": [
        "T009",
        "DOCS-R4"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "docs/evidence/M3-acceptance.md"
      ],
      "fixes": null,
      "id": "T010",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R4",
      "status": "DONE",
      "title": "Релиз 0.3.0",
      "why": "Релиз 0.3.0"
    },
    {
      "acceptance": [
        "Опрос ждёт статус до 3 с; неизвестный статус не затирает известный у того же pid",
        "connecting или неизвестно — причина «ChatGPT подключается к демону — подождите несколько секунд», действия нет",
        "disabled/errored без ошибки входа — действие «Подключить к ChatGPT»; не запущен — «Запустить демон»; подключён — действия нет"
      ],
      "checks": [],
      "commitMessage": "fix: report the Codex daemon connection consistently",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-fixes.md",
          "heading": "9. Раунд 5: состояние демона Codex в мастере",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/helpers.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md"
      ],
      "fixes": "T001",
      "id": "T011",
      "iteration": 1,
      "kind": "work",
      "roundId": "R5",
      "status": "DONE",
      "title": "Согласованное состояние демона Codex",
      "why": "Короткое ожидание статуса связи давало «не подключён» и включало «Запустить демон» при работающем демоне"
    },
    {
      "acceptance": [
        "Пока кнопка провайдера выключена, предпросмотр перечитывается раз в 5 с",
        "Отказ action-disabled не показывается ошибкой, мастер перечитывает предпросмотр"
      ],
      "checks": [],
      "commitMessage": "fix: keep provider readiness fresh in the project wizard",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-fixes.md",
          "heading": "9. Раунд 5: состояние демона Codex в мастере",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/wizard-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/project-wizard.css",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/project-wizard.js",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/index.ts",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/test/wizard-model.test.ts"
      ],
      "fixes": null,
      "id": "T012",
      "iteration": 1,
      "kind": "work",
      "roundId": "R5",
      "status": "DONE",
      "title": "Мастер перечитывает готовность провайдера",
      "why": "Причина у кнопки провайдера и список действий были из разных моментов"
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
        "T011",
        "T012"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md"
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
        "Версия 0.3.1 в package.json и package-lock.json",
        "install ставит app/0.3.1, wfk doctor --installed — всё в порядке"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.3.1",
      "confirmation": "Объясни мне, пожалуйста, вот эти противоречивые надписи… все это создает полное непонимание пользователя, что ему делать.",
      "context": [],
      "dependencies": [
        "T011",
        "T012",
        "DOCS-R5"
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
      "roundId": "R5",
      "status": "DONE",
      "title": "Релиз 0.3.1",
      "why": "Релиз 0.3.1"
    },
    {
      "acceptance": [
        "401 в журнале и auth.json новее старта демона — состояние «демон держит устаревший вход», причина у создания сессии",
        "Действие «Перезапустить демон»: codex remote-control stop, затем start",
        "Строки rmcp:: не считаются ошибкой входа"
      ],
      "checks": [],
      "commitMessage": "fix: detect a Codex daemon holding a stale login and restart it",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-fixes.md",
          "heading": "10. Раунд 6: устаревший вход демона и тема служебного хода",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/codex-files.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/files-hooks.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/helpers.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fixtures/fake-codex.mjs",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md"
      ],
      "fixes": "T011",
      "id": "T014",
      "iteration": 1,
      "kind": "work",
      "roundId": "R6",
      "status": "DONE",
      "title": "Перезапуск демона с устаревшим входом",
      "why": "После обновления входа приложением ChatGPT демон держит старый токен; подсказка codex login неверна"
    },
    {
      "acceptance": [
        "Инструкция агенту: служебное первое сообщение не задаёт тему",
        "wfk session title во время служебного хода отклоняется с объяснением service-turn",
        "После хода с задачей тема задаётся как раньше"
      ],
      "checks": [],
      "commitMessage": "fix: refuse the session topic during the Workflow Kit service turn",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-fixes.md",
          "heading": "10. Раунд 6: устаревший вход демона и тема служебного хода",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/templates.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/module.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/test",
        "product-parts/backend-core/clusters/projects/modules/project-setup/src/setup.ts",
        "product-parts/backend-core/clusters/projects/modules/project-setup/src/index.ts",
        "product-parts/backend-core/clusters/projects/modules/project-setup/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/titles.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/test/titles.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
      ],
      "fixes": null,
      "id": "T015",
      "iteration": 1,
      "kind": "work",
      "roundId": "R6",
      "status": "DONE",
      "title": "Тема сессии не задаётся в служебном ходе",
      "why": "Агент назвал сессию по служебному приветствию, а не по задаче"
    },
    {
      "acceptance": [
        "ready-for-acceptance удерживает Stop, как выбор пути",
        "Панель у очереди спящего агента пишет, что сообщение уйдёт со следующим сообщением в чате"
      ],
      "checks": [],
      "commitMessage": "fix: hold the Stop while the result waits for acceptance",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-fixes.md",
          "heading": "10.1 Сообщения панели спящему агенту",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/flow.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/decide.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts"
      ],
      "fixes": null,
      "id": "T017",
      "iteration": 1,
      "kind": "work",
      "roundId": "R6",
      "status": "DONE",
      "title": "Удержание Stop при ожидании приёмки",
      "why": "«Нужны исправления» оставалось в очереди: при приёмке Stop отпускался"
    },
    {
      "acceptance": [
        "session.exp по файлу <debug>.message вводит «Workflow Kit: новое сообщение из панели.»",
        "Очередь сессии Claude в состоянии waiting будит её через wakeSession провайдера",
        "Сессии в ходе и Codex не будятся"
      ],
      "checks": [],
      "commitMessage": "feat: wake an idle panel Claude session when the panel queues a message",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-fixes.md",
          "heading": "10.1 Сообщения панели спящему агенту",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
      ],
      "fixes": null,
      "id": "T018",
      "iteration": 1,
      "kind": "work",
      "roundId": "R6",
      "status": "DONE",
      "title": "Будить спящую сессию Claude сообщением панели",
      "why": "После удержания Stop агент спит и не видит очередь"
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
        "T014",
        "T015",
        "T017",
        "T018"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/module.md",
        "product-parts/backend-core/clusters/projects/modules/project-setup/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md"
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
        "Версия 0.3.2",
        "install ставит app/0.3.2, wfk doctor --installed — всё в порядке"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.3.2",
      "confirmation": "Еще один баг… И последнее замечание… (исправить и собрать релиз)",
      "context": [],
      "dependencies": [
        "T014",
        "T015",
        "DOCS-R6"
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
      "roundId": "R6",
      "status": "DONE",
      "title": "Релиз 0.3.2",
      "why": "Релиз 0.3.2"
    },
    {
      "acceptance": [
        "Карточка выбора показывает «Оркестрация с исполнителями» и сессиям Codex",
        "Служба принимает выбор orchestrated от сессии Codex",
        "Сообщение старта и продолжения оркестрации — своя процедура для Claude и для Codex"
      ],
      "checks": [],
      "commitMessage": "feat: offer orchestration with built-in subagents to ChatGPT sessions",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-orchestration.md",
          "heading": "3. Решение",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/texts.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/decide.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/decide.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/flow.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/index.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/kit-types.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/plan-view.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/test/plan-view.test.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md"
      ],
      "fixes": null,
      "id": "T019",
      "iteration": 1,
      "kind": "work",
      "roundId": "R7",
      "status": "DONE",
      "title": "Оркестрация доступна сессиям ChatGPT",
      "why": "Пользователь: оркестрация встроенными подагентами и у Claude, и у ChatGPT"
    },
    {
      "acceptance": [
        "Фрагмент agents-section описывает оркестратора Claude (Agent, isolation worktree) и Codex (git worktree add, spawn_agent, workdir, wait_agent)"
      ],
      "checks": [],
      "commitMessage": "docs: describe the orchestrator procedure for Claude and Codex in the Kit section",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-orchestration.md",
          "heading": "3. Решение",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/templates.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/module.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/test/markers.test.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/test/structure.test.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/test/session-hook.test.ts"
      ],
      "fixes": null,
      "id": "T020",
      "iteration": 1,
      "kind": "work",
      "roundId": "R7",
      "status": "DONE",
      "title": "Процедуры оркестратора в AGENTS.md",
      "why": "Агент должен знать, как раздавать назначения встроенным подагентам своего приложения"
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
        "T019",
        "T020"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/module.md"
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
        "Версия 0.3.3",
        "install ставит app/0.3.3, wfk doctor --installed — всё в порядке"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.3.3",
      "confirmation": "Сразу вносить все исправления, необходимые для обсужденной оркестрации и у Cloud, и у ChatGPT, выпускать релиз 0.3.3",
      "context": [],
      "dependencies": [
        "T019",
        "T020",
        "DOCS-R7"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "docs/evidence/M3-acceptance.md"
      ],
      "fixes": null,
      "id": "T021",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R7",
      "status": "DONE",
      "title": "Релиз 0.3.3",
      "why": "Релиз 0.3.3"
    },
    {
      "acceptance": [
        "При повторном входе в мастер поле имени пустое",
        "После создания второго проекта панель открывает экран его сессии"
      ],
      "checks": [],
      "commitMessage": "fix: start the project wizard from a clean state",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-orchestration.md",
          "required": true,
          "heading": "4. Проверка на тестовых проектах (2026-11-07) и раунд R8"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/project-wizard.js",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md"
      ],
      "fixes": null,
      "id": "T022",
      "iteration": 1,
      "kind": "work",
      "roundId": "R8",
      "status": "DONE",
      "title": "Мастер нового проекта начинает с чистого листа",
      "why": "Мастер нового проекта начинает с чистого листа"
    },
    {
      "acceptance": [
        "На экране сессии есть поле «Сообщение агенту» и кнопка «Отправить агенту»",
        "POST /api/projects/:id/sessions/:sid/message кладёт текст в очередь сессии; ожидающая сессия Claude будится",
        "Пустой текст, длинный текст и чужая или неизвестная сессия отклоняются"
      ],
      "checks": [],
      "commitMessage": "feat: send a message to the session agent from the panel",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-orchestration.md",
          "required": true,
          "heading": "4. Проверка на тестовых проектах (2026-11-07) и раунд R8"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md"
      ],
      "fixes": null,
      "id": "T023",
      "iteration": 1,
      "kind": "work",
      "roundId": "R8",
      "status": "TODO",
      "title": "Сообщение агенту из экрана сессии",
      "why": "Сообщение агенту из экрана сессии"
    },
    {
      "acceptance": [
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R8",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T022",
        "T023"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md"
      ],
      "fixes": null,
      "id": "DOCS-R8",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R8",
      "status": "TODO",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "Версия 0.3.4",
        "install ставит app/0.3.4, wfk doctor --installed — всё в порядке"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.3.4",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "DOCS-R8"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "docs/evidence/M3-acceptance.md"
      ],
      "fixes": null,
      "id": "T024",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R8",
      "status": "TODO",
      "title": "Релиз 0.3.4",
      "why": "Релиз 0.3.4"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m3-fixes (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 29/32
- Revision: 162

## Objective

Исправления и дополнения после вехи 2; раунд 1 — имена сессий Workflow Kit видны в приложениях Claude и ChatGPT, новый релиз

## Acceptance

- Имя сессии, заданное в Workflow Kit, видно в ChatGPT и в Claude
- Новый релиз установлен, wfk doctor --installed — всё в порядке

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Имя сессии Codex в ChatGPT (work, parallel-safe)
  - Commit: fix: rename Codex threads that the daemon does not hold
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/release.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md
- [DONE] T002 — Имя сессии Claude через хук (work, parallel-safe)
  - Commit: feat: send the Kit session name to Claude through the prompt hook
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/hook-input.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/titles.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/test/titles.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M3-fixes.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md
  - Depends on: T001, T002
- [DONE] T003 — Релиз раунда 1 (delivery)
  - Commit: chore: install the M3 round 1 release
  - Files: docs/evidence/M3-acceptance.md
  - Depends on: T001, T002, DOCS-R1

Digest: Имена сессий Workflow Kit уходят в приложения: Codex — thread/name/set демона для любого треда без загрузки; Claude — hookSpecificOutput.sessionTitle в ответе хука UserPromptSubmit, один раз на имя.

### R2 — Fixes (fixes, CLOSED)

- [DONE] T004 — Повтор неотправленных имён Codex при запуске службы (work)
  - Commit: fix: retry unsynced Codex names when the service starts
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/titles.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/test/titles.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md
  - Fixes: T001
- [DONE] DOCS-R2 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R2
  - Files: README.md, docs/architecture/OVERVIEW.md, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md
  - Depends on: T004
- [DONE] T005 — Релиз раунда 2 (delivery)
  - Commit: chore: install the M3 round 2 release
  - Files: docs/evidence/M3-acceptance.md
  - Depends on: T004, DOCS-R2

Digest: Имена Codex, не дошедшие до ChatGPT (synced не true), отправляются заново при запуске службы, а не при следующем ходе сессии.

### R3 — Fixes (fixes, CLOSED)

- [DONE] T006 — Имя сессии Claude через /rename (work)
  - Commit: feat: rename Claude Remote Control sessions with /rename in their terminal
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parts.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/harness.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/fixtures, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/titles.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/test/titles.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md
- [DONE] T007 — Убрать карточку «Проектов пока нет» из боковой панели (work)
  - Commit: fix: drop the empty projects card from the sidebar
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/sidebar.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/tree.css, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts
- [DONE] DOCS-R3 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R3
  - Files: README.md, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md
  - Depends on: T006, T007
- [DONE] T008 — Релиз раунда 3 (delivery)
  - Commit: chore: install the M3 round 3 release
  - Files: docs/evidence/M3-acceptance.md
  - Depends on: T006, T007, DOCS-R3

Digest: Имя сессии Claude из Kit уходит в приложение командой /rename, которую session.exp вводит в терминал сессии вне хода (сразу или на Stop). Карточка «Проектов пока нет» убрана из боковой панели.

### R4 — Fixes (fixes, CLOSED)

- [DONE] T009 — Главный экран без карточки «Начните с проекта» (work)
  - Commit: fix: drop the start card from the home screen
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/screens.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts
  - Fixes: T007
- [DONE] DOCS-R4 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R4
  - Files: README.md, docs/architecture/OVERVIEW.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md
  - Depends on: T009
- [DONE] T010 — Релиз 0.3.0 (delivery)
  - Commit: chore: release 0.3.0
  - Files: package.json, package-lock.json, docs/evidence/M3-acceptance.md
  - Depends on: T009, DOCS-R4

Digest: Главный экран без карточки «Начните с проекта» (создание и выбор проекта — в меню «Ваши проекты»); принято правило: каждый релиз повышает версию, веха 3 — 0.3.x.

### R5 — Fixes (fixes, CLOSED)

- [DONE] T011 — Согласованное состояние демона Codex (work)
  - Commit: fix: report the Codex daemon connection consistently
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/helpers.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md
  - Fixes: T001
- [DONE] T012 — Мастер перечитывает готовность провайдера (work)
  - Commit: fix: keep provider readiness fresh in the project wizard
  - Files: product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/wizard-model.js, product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/project-wizard.css, product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/project-wizard.js, product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/index.ts, product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md, product-parts/control-panel/clusters/web-panel/modules/project-wizard/test/wizard-model.test.ts
- [DONE] DOCS-R5 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R5
  - Files: README.md, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md
  - Depends on: T011, T012
- [DONE] T013 — Релиз 0.3.1 (delivery)
  - Commit: chore: release 0.3.1
  - Files: package.json, package-lock.json, docs/evidence/M3-acceptance.md
  - Depends on: T011, T012, DOCS-R5

Digest: Состояние демона Codex согласовано: статус связи ждётся до 3 с и не затирается неизвестным; «подключается» — ждать без действия; «Подключить к ChatGPT» только при выключенной связи. Мастер перечитывает предпросмотр, пока провайдер не готов, и не показывает ошибкой отказ ненужного действия.

### R6 — Fixes (fixes, CLOSED)

- [DONE] T014 — Перезапуск демона с устаревшим входом (work)
  - Commit: fix: detect a Codex daemon holding a stale login and restart it
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/codex-files.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/files-hooks.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/helpers.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fixtures/fake-codex.mjs, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md
  - Fixes: T011
- [DONE] T015 — Тема сессии не задаётся в служебном ходе (work)
  - Commit: fix: refuse the session topic during the Workflow Kit service turn
  - Files: product-parts/backend-core/clusters/projects/modules/kit-structure/src/templates.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/module.md, product-parts/backend-core/clusters/projects/modules/kit-structure/test, product-parts/backend-core/clusters/projects/modules/project-setup/src/setup.ts, product-parts/backend-core/clusters/projects/modules/project-setup/src/index.ts, product-parts/backend-core/clusters/projects/modules/project-setup/module.md, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/titles.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/test/titles.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md
- [DONE] T017 — Удержание Stop при ожидании приёмки (work)
  - Commit: fix: hold the Stop while the result waits for acceptance
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/flow.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/decide.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts
- [DONE] T018 — Будить спящую сессию Claude сообщением панели (work)
  - Commit: feat: wake an idle panel Claude session when the panel queues a message
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md
- [DONE] DOCS-R6 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R6
  - Files: README.md, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/backend-core/clusters/projects/modules/kit-structure/module.md, product-parts/backend-core/clusters/projects/modules/project-setup/module.md, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md
  - Depends on: T014, T015, T017, T018
- [DONE] T016 — Релиз 0.3.2 (delivery)
  - Commit: chore: release 0.3.2
  - Files: package.json, package-lock.json, docs/evidence/M3-acceptance.md
  - Depends on: T014, T015, DOCS-R6

Digest: Демон Codex с устаревшим входом распознаётся и перезапускается кнопкой; тема сессии не задаётся по служебному приветствию; при ожидании приёмки Stop удерживается, и «Нужны исправления» доходит сразу; спящая сессия Claude панели будится сообщением панели.

### R7 — Orchestration with built-in subagents (implementation, CLOSED)

- [DONE] T019 — Оркестрация доступна сессиям ChatGPT (work)
  - Commit: feat: offer orchestration with built-in subagents to ChatGPT sessions
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/texts.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/decide.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/decide.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/flow.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/index.ts, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/kit-types.ts, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/plan-view.ts, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/test/plan-view.test.ts, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md
- [DONE] T020 — Процедуры оркестратора в AGENTS.md (work)
  - Commit: docs: describe the orchestrator procedure for Claude and Codex in the Kit section
  - Files: product-parts/backend-core/clusters/projects/modules/kit-structure/src/templates.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/module.md, product-parts/backend-core/clusters/projects/modules/kit-structure/test/markers.test.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/test/structure.test.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/test/session-hook.test.ts
- [DONE] DOCS-R7 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R7
  - Files: README.md, docs/architecture/OVERVIEW.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/backend-core/clusters/projects/modules/kit-structure/module.md
  - Depends on: T019, T020
- [DONE] T021 — Релиз 0.3.3 (delivery)
  - Commit: chore: release 0.3.3
  - Files: package.json, package-lock.json, docs/evidence/M3-acceptance.md
  - Depends on: T019, T020, DOCS-R7

Digest: Оркестрация встроенными подагентами доступна сессиям Claude и ChatGPT: оркестратор раздаёт назначения Kit подагентам своего приложения (Claude — Agent с worktree, Codex — свой git worktree и spawn_agent) и интегрирует их коммиты.

### R8 — Мастер с чистого листа и сообщение агенту из панели (fixes, OPEN)

- [DONE] T022 — Мастер нового проекта начинает с чистого листа (work)
  - Commit: fix: start the project wizard from a clean state
  - Files: product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/project-wizard.js, product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md
- [TODO] T023 — Сообщение агенту из экрана сессии (work)
  - Commit: feat: send a message to the session agent from the panel
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.css, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md
- [TODO] DOCS-R8 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R8
  - Files: README.md, docs/architecture/OVERVIEW.md, product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md
  - Depends on: T022, T023
- [TODO] T024 — Релиз 0.3.4 (delivery)
  - Commit: chore: release 0.3.4
  - Files: package.json, package-lock.json, docs/evidence/M3-acceptance.md
  - Depends on: DOCS-R8

State changes only through `scripts/workflow` commands. History lives in Git.
