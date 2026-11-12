# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-11T18:25:23.387Z",
    "scopeId": "m17-wfk-on-agent-path"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 661,
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
      "На экране сессии Claude, ChatGPT и Kimi виден диалог: реплики пользователя и агента, новые появляются без перезагрузки",
      "Сообщение из панели ждущему агенту Claude (сессия панели) и ChatGPT (общий доступ к чатам) видно в родном чате репликой пользователя; иначе оно уходит в очередь и приходит агенту с ближайшим хуком",
      "Сессии по-прежнему открываются и ведутся в родных приложениях; автопилот, ревью и выбор пути работают как раньше",
      "Тесты, проверка типов и check:platforms зелёные локально и в CI на macOS, Linux, Windows x64 и ARM64; выпущена версия 0.9.0"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-12T07:23:53.416Z",
      "text": "Пользователь, 2026-11-12: «сделать возможным показывать диалоги любой сессии… и диалоговая сессия с полем ввода пользователя в самом Workflow Kit. Какой именно интерфейс… решить самому, важно, чтобы это заработало… Подготовь план таким образом, чтобы ты его мог реализовывать через сабагентов с другой моделью. С Opus 5.5 Medium. Если все понятно и проблем с моей просьбой нет, переходи к спецификации.» Выбор в панели: спецификация и план без ревью. | Execution mode chosen by the user: orchestrated: Выбор пользователя в панели Workflow Kit: оркестрация с исполнителями"
    },
    "baselineCommit": "d9bb1e09cb139a9d577495e2619be2a91089520a",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M18-session-chat.md",
        "required": true
      },
      {
        "path": "docs/architecture/OVERVIEW.md",
        "required": false,
        "heading": "Части, кластеры, модули"
      }
    ],
    "decisions": [
      {
        "at": "2026-11-12T07:23:53.416Z",
        "text": "Исполнители — субагенты Claude на модели Opus 5.5 с усилием medium, каждый в своём worktree; оркестратор ведёт интеграцию, QUALITY и выпуск"
      },
      {
        "at": "2026-11-12T07:23:53.416Z",
        "text": "Интерфейс диалога — рабочий минимум, выбран исполнителем; полировка — отдельной работой"
      },
      {
        "at": "2026-11-12T07:23:53.416Z",
        "text": "Прямая отправка — только ждущему агенту; во время хода и при удержанном Stop сообщение идёт очередью канала"
      },
      {
        "at": "2026-11-12T07:23:53.416Z",
        "text": "turn/steer, режим полного доступа, ограничение родных приложений и замена Tailscale в scope не входят"
      },
      {
        "at": "2026-11-12T07:23:53.416Z",
        "text": "Документы у предела 28000 байт (OVERVIEW, README, module.md провайдеров и cli): подробности выносятся в отдельные документы со ссылкой"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 4,
      "ownerSession": "0c355c88-f324-49fe-909c-fe5617d16288",
      "strategy": "orchestrated"
    },
    "id": "m18-session-chat",
    "objective": "Экран любой сессии в панели Workflow Kit показывает её диалог и поле ввода: сообщение из панели приходит агенту Claude, ChatGPT и Kimi, а работа в родных приложениях не меняется",
    "spec": "docs/planning/M18-session-chat.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Контракт провайдера имеет ChatMessage, ChatPage, необязательные readMessages и sendDirect, CHAT_PAGE_LIMIT 100 и CHAT_TEXT_MAX_CHARS 20000, как в разделе 2.1",
        "GET /api/projects/:id/providers/:p/sessions/:sid/messages отвечает supported false без метода, страницей сообщений, 404 unknown-session для чужой сессии и 502 с кодом и текстом ProviderError",
        "Маршрут обрезает тексты длиннее CHAT_TEXT_MAX_CHARS с пометкой; тесты покрывают все ответы маршрута; fake-provider имеет оба метода",
        "Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md",
        "Тест публикации git-publish не наследует GIT_DIR, GIT_INDEX_FILE и GIT_WORK_TREE от хука коммита: коммит задачи из worktree не трогает индекс и настройки основного репозитория"
      ],
      "checks": [],
      "commitMessage": "feat: add the session chat contract and the messages route",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M18-session-chat.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/chat.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/chat-routes.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/routes.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/chat-routes.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/fake-provider.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/chat.md",
        "product-parts/backend-core/clusters/projects/modules/git-publish/test/publication.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Контракт диалога сессии и маршрут чтения",
      "why": "Провайдеры и панель должны опираться на один контракт чтения и прямой отправки",
      "integration": {
        "operationId": "d6a87843-2065-48e0-8a2f-18800ee3ae8e",
        "sourceCommit": "4f8d54cc939045f84daec3dffa22b7c3994d435e"
      }
    },
    {
      "acceptance": [
        "readMessages читает транскрипт по пути из журнала хука инкрементно и отдаёт последние сообщения по правилам раздела 2.2 (реплики строкой и частями; без tool_result, isMeta, isSidechain, служебных тегов, thinking и tool_use)",
        "sendDirect пишет управляющий файл вида text и очищенный текст, идёт по очереди на сессию, возвращает false для сессии не под управлением панели и когда файл не забрали за 5 с",
        "session.exp и pty/host.ts печатают текст вставкой ESC[200~ … ESC[201~, затем Enter и строку MESSAGE_SENT; содержимое wake даёт прежнюю служебную фразу",
        "Тесты покрывают разбор строк, дозапись, разорванную строку, замену файла, предел страницы, очистку текста и host.ts с подставленной платформой win32",
        "Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md"
      ],
      "checks": [],
      "commitMessage": "feat: read the Claude transcript as a chat and paste panel messages",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M18-session-chat.md",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/chat.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/runtime.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/screen.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/chat.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/direct.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/windows.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/harness.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "TODO",
      "title": "Claude: лента из транскрипта и вставка текста в терминал",
      "why": "Диалог и прямая отправка для сессий Claude"
    },
    {
      "acceptance": [
        "readMessages берёт userMessage и agentMessage из thread/read с includeTurns, время — startedAtMs элемента; незагруженный чат читается и не загружается; отказ демона — chat-unavailable",
        "sendDirect без общего демона возвращает false; при статусе idle или notLoaded начинает ход самим текстом; при active возвращает false и не зовёт turn/start",
        "Тесты на подставном демоне покрывают чтение, время элемента, все ветки sendDirect и транспорт Windows",
        "Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md"
      ],
      "checks": [],
      "commitMessage": "feat: read Codex threads as a chat and start turns with panel messages",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M18-session-chat.md",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/chat.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/thread-ops.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/chat.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/helpers.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/chat.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "TODO",
      "title": "ChatGPT: лента через thread/read и прямой ход",
      "why": "Диалог и прямая отправка для сессий ChatGPT"
    },
    {
      "acceptance": [
        "readMessages отдаёт одну страницу сообщений от старых к новым: реплики пользователя с origin user и непустые ответы агента; truncated равен has_more; время — из сообщения, если сервер его отдаёт",
        "Недоступный сервер даёт chat-unavailable с причиной; sendMessage и lastAnswer работают как раньше",
        "Тесты покрывают разворот страницы, фильтр вставок, truncated, время и ошибку сервера",
        "Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md"
      ],
      "checks": [],
      "commitMessage": "feat: read Kimi session messages as a chat",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M18-session-chat.md",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/chat.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/messages.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/shapes.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/chat.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/shapes.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/fake-sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/helpers.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/chat.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "TODO",
      "title": "Kimi: страница сообщений сессии",
      "why": "Диалог для сессий Kimi"
    },
    {
      "acceptance": [
        "POST …/sessions/:sid/message принимает до 20000 знаков; опция direct вернула true — ответ { sent: true } без очереди; false, ошибка или нет опции — { queued }",
        "Служба зовёт sendDirect только для сессии в состоянии waiting или неизвестной каналу, не зовёт для working, holding и провайдера с sendMessage; ошибка sendDirect пишется в журнал и ведёт в очередь",
        "Тесты покрывают маршрут и правило выбора пути; автопилот и ревью получают сообщения прежним путём",
        "Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md"
      ],
      "checks": [],
      "commitMessage": "feat: send panel messages directly when the provider can take them",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M18-session-chat.md",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/routes.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/direct-message.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/direct-message.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "TODO",
      "title": "Отправка из панели: прямой путь и предел 20000",
      "why": "Задание из панели должно приходить агенту репликой пользователя, а не служебной фразой"
    },
    {
      "acceptance": [
        "Модуль session-chat имеет index.ts с sessionChatMount, чистую модель chat-model.js, расширение session-chat.js со слотом sessionChat и стили, как в разделе 2.6",
        "Карточка «Диалог» показывает ленту, строку об обрезке, состояние supported false и ошибку чтения, поле ввода с кнопкой «Отправить» и отправкой по Ctrl+Enter и ⌘+Enter; текст в DOM — только через textContent",
        "Опрос идёт при открытии экрана сессии и раз в 3 с, пока экран открыт и вкладка видима, не больше одного запроса на сессию; введённый текст и прокрутка переживают опрос",
        "Тесты покрывают mergePage, sendOutcome, адреса запросов и подписи; module.md описывает модуль и раздел «Поведение на ОС»"
      ],
      "checks": [],
      "commitMessage": "feat: add the session chat panel module",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M18-session-chat.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/index.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/chat-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/chat-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "TODO",
      "title": "Модуль панели session-chat: лента и поле ввода",
      "why": "Экрану сессии нужна карточка диалога"
    },
    {
      "acceptance": [
        "panel-shell имеет слот sessionChat и рисует его на экране сессии под sessionBody, перерисовывая только при изменении данных; расширение и стили session-chat подключены",
        "Служба раздаёт /session-chat/ и имеет алиас #session-chat; на экране любой сессии запущенной из исходников службы видна карточка «Диалог»",
        "Тесты panel-shell и cli покрывают слот и монтирование; module.md затронутых модулей, cluster.md и product-part.md обновлены",
        "Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md"
      ],
      "checks": [],
      "commitMessage": "feat: show the session chat on the session screen",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M18-session-chat.md",
          "required": true
        }
      ],
      "dependencies": [
        "T005",
        "T006"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/slots.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/session-screen.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/index.html",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/layout.css",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/app.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md",
        "package.json",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/control-panel/clusters/web-panel/cluster.md",
        "product-parts/control-panel/product-part.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Подключение диалога к панели и службе",
      "why": "Модуль диалога должен появиться на экране сессии установленной службы"
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
        "T004",
        "T005",
        "T006",
        "T007"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M18-session-chat.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/chat.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/chat.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/chat.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/control-panel/clusters/web-panel/cluster.md",
        "product-parts/control-panel/product-part.md"
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
        "Версия 0.9.0 в package.json и package-lock.json; CHANGELOG, README, OVERVIEW (матрица ОС и известные ограничения: панель без авторизации отдаёт переписку) и docs/installation.md обновлены",
        "wfk install обновил службу до 0.9.0, wfk doctor --installed без замечаний",
        "CI ветки ci/m18-session-chat зелёный на macOS, Linux, Windows x64 и Windows ARM64 для коммита выпуска",
        "docs/evidence/M18-acceptance.md перечисляет проверки выпуска и живые проверки по ОС: macOS — пользователь, Windows — проверяющий на Windows, Linux — CI"
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: release 0.9.0",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M18-session-chat.md",
          "required": true
        }
      ],
      "dependencies": [
        "T007",
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
        "docs/evidence/M18-acceptance.md",
        "docs/changelog/CHANGELOG-0.5-0.8.md"
      ],
      "fixes": null,
      "id": "T008",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Выпуск 0.9.0",
      "why": "Пользователь проверяет диалог в установленной службе"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m18-session-chat (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: orchestrated (max 4 workers, owner 0c355c88-f324-49fe-909c-fe5617d16288)
- Current task: none
- Progress: 1/9
- Revision: 661

## Objective

Экран любой сессии в панели Workflow Kit показывает её диалог и поле ввода: сообщение из панели приходит агенту Claude, ChatGPT и Kimi, а работа в родных приложениях не меняется

## Acceptance

- На экране сессии Claude, ChatGPT и Kimi виден диалог: реплики пользователя и агента, новые появляются без перезагрузки
- Сообщение из панели ждущему агенту Claude (сессия панели) и ChatGPT (общий доступ к чатам) видно в родном чате репликой пользователя; иначе оно уходит в очередь и приходит агенту с ближайшим хуком
- Сессии по-прежнему открываются и ведутся в родных приложениях; автопилот, ревью и выбор пути работают как раньше
- Тесты, проверка типов и check:platforms зелёные локально и в CI на macOS, Linux, Windows x64 и ARM64; выпущена версия 0.9.0

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Контракт диалога сессии и маршрут чтения (work)
  - Commit: feat: add the session chat contract and the messages route
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/chat.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/chat-routes.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/routes.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/chat-routes.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/fake-provider.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/chat.md, product-parts/backend-core/clusters/projects/modules/git-publish/test/publication.test.ts
- [TODO] T002 — Claude: лента из транскрипта и вставка текста в терминал (work, parallel-safe)
  - Commit: feat: read the Claude transcript as a chat and paste panel messages
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/chat.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/runtime.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/screen.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/chat.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/direct.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/windows.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/harness.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md
  - Depends on: T001
- [TODO] T003 — ChatGPT: лента через thread/read и прямой ход (work, parallel-safe)
  - Commit: feat: read Codex threads as a chat and start turns with panel messages
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/chat.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/thread-ops.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/chat.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/helpers.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/chat.md
  - Depends on: T001
- [TODO] T004 — Kimi: страница сообщений сессии (work, parallel-safe)
  - Commit: feat: read Kimi session messages as a chat
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/chat.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/messages.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/shapes.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/chat.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/shapes.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/fake-sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/helpers.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/chat.md
  - Depends on: T001
- [TODO] T005 — Отправка из панели: прямой путь и предел 20000 (work, parallel-safe)
  - Commit: feat: send panel messages directly when the provider can take them
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/routes.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/direct-message.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/direct-message.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md
  - Depends on: T001
- [TODO] T006 — Модуль панели session-chat: лента и поле ввода (work, parallel-safe)
  - Commit: feat: add the session chat panel module
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat/src/index.ts, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/chat-model.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/chat-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md
- [TODO] T007 — Подключение диалога к панели и службе (work)
  - Commit: feat: show the session chat on the session screen
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/slots.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/session-screen.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/index.html, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/layout.css, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/app.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md, package.json, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/cluster.md, product-parts/control-panel/product-part.md
  - Depends on: T005, T006
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M18-session-chat.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/chat.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/chat.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/chat.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/cluster.md, product-parts/control-panel/product-part.md
  - Depends on: T001, T002, T003, T004, T005, T006, T007
- [TODO] T008 — Выпуск 0.9.0 (delivery)
  - Commit: chore: release 0.9.0
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/architecture/OVERVIEW.md, docs/installation.md, docs/evidence/M18-acceptance.md, docs/changelog/CHANGELOG-0.5-0.8.md
  - Depends on: T007, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
