# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 2,
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
      "Сценарий визуальной приёмки из раздела 11 спецификации пройден пользователем на Mac и iPad",
      "Бэкенд установлен установщиком и стартует после входа в систему и по значку без ручного запуска",
      "Обязательные проверки качества (типы, тесты) проходят"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-05T15:03:00.800Z",
      "text": "Пользователь: «Согласен с твоим предложением, но важно, чтобы по каждой вехе я мог что-то тестировать визуально. Для меня важно, чтобы бэкэнд мог работать на любой операционной системе, разворачиваться. И чтобы он стартовал при старте компьютера или при старте самого интерфейса кита. У нас независимый совершенно проект, поэтому переносим все абсолютно в наш проект, формируем его по новой и строим инсталлятор бэкэнда.» | Execution mode chosen by the user: orchestrated: Согласен с планом, прошу тебя его показывать как виджет и отмечать его выполнение. А также в тех местах, в которых ты мог бы запустить процессы параллельно, запускай сабагентов. Жду первый релиз."
    },
    "baselineCommit": "4ec2edc62005983d0455d69078bcd50c5f74c178",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M1-orchestrator-core.md",
        "required": true
      },
      {
        "path": "docs/planning/M1-providers.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Веха 1 в урезанном объёме: сканер доверия, раскладка окон и авторизация панели — веха 2"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Каждая задача даёт видимый в панели результат; веха принимается визуально на Mac и iPad"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Бэкенд кроссплатформенный (macOS, Linux, Windows), разворачивается установщиком, стартует после входа в систему и при запуске интерфейса Kit"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Проект независим от harness-ai: структура Kit и установщик пишутся заново"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Стек: Node 24 + TypeScript (type stripping) без runtime-зависимостей; панель без сборки"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "QUALITY: стек node задаётся явно; создаются package.json (скрипты typecheck, test) и tsconfig.json (noEmit, allowImportingTsExtensions, erasableSyntaxOnly, verbatimModuleSyntax, checkJs для src/panel); typecheck с appliesTo **/*.ts и **/*.js; test — node --test \"test/**/*.test.ts\"; policy.maxFileLines 400; docs.contracts: src/{module}/** → docs/architecture/modules/{module}.md, bin/** → docs/architecture/modules/cli.md"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "QUALITY заводит проверку installed на этапе delivery: node bin/wfk.mjs doctor --installed, evidence «установленная служба отвечает на /api/health после перезагрузки и входа»"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Документы docs/planning/** удаляются после приёмки вехи (accept), не в DOCS раунда"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Реальная установка службы на Mac пользователя — только в задаче выпуска с подтверждением пользователя"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Пользователь разрешил QUALITY поставить через npm dev-зависимости typescript и @types/node («Да, ставить»)"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Автозапуск — после входа пользователя в систему; значок «Workflow Kit» и команда wfk поднимают службу и открывают панель уже в вехе 1 (ответ пользователя: «После входа + значок»)"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Windows и Linux в вехе 1 проверяются только тестами; приёмка на устройствах — Mac и iPad (ответ пользователя: «Тестов достаточно»)"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "cfa00ffe-c414-4ae6-9953-e3d2906b3705",
      "strategy": "orchestrated"
    },
    "id": "m1-orchestrator-core",
    "objective": "Веха 1: бэкенд-служба Workflow Kit (любая ОС, установщик, автозапуск, запускатель), проекты, собственная структура Kit, провайдеры Claude и Codex с общим контрактом и веб-панель для Mac и iPad",
    "spec": "docs/planning/M1-orchestrator-core.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Project stacks are detected or chosen from the architecture",
        "Quality checks are applied with `quality:apply` and the profile is CONFIGURED"
      ],
      "checks": [],
      "commitMessage": "chore: configure the project quality profile",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": null,
      "files": [],
      "fixes": null,
      "id": "QUALITY",
      "iteration": 1,
      "kind": "quality",
      "roundId": "R1",
      "status": "TODO",
      "title": "Configure the project quality profile",
      "why": "Functional code needs a configured quality profile before its first commit."
    },
    {
      "acceptance": [
        "bin/wfk.mjs проверяет Node >= 24 и загружает src/cli/main.ts; команды serve, open, install, uninstall, service, doctor, link, hook маршрутизируются (нереализованные отвечают «не реализовано»; заглушка службы — src/service/index.ts)",
        "Каталоги данных выбираются по ОС (macOS, Linux с XDG, Windows %LOCALAPPDATA%) и создаются с правами 0700; WFK_DATA_DIR и WFK_PORT переопределяют их; тесты на три ОС",
        "Помощник атомарной записи JSON (tmp + rename) с тестом",
        "Фильтр доступа по D8: адрес клиента и локальный адрес сокета — loopback или Tailscale (IPv4 и IPv6), Host из списка, Origin изменяющих запросов совпадает с Host, тело JSON; иначе 403; тесты",
        "GET /api/health и GET /api/state (раздел «Система»: версия, ОС, каталог данных, статус службы из заглушки); / отдаёт панель с опросом раз в 3 с"
      ],
      "checks": [
        "Визуально: node bin/wfk.mjs serve; панель на http://127.0.0.1:4747/ и с iPad по адресу Tailscale без правки конфига; карточка «Система» показывает версию, ОС и каталог данных"
      ],
      "commitMessage": "feat: add backend skeleton with access filter and panel shell",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true
        }
      ],
      "dependencies": [
        "QUALITY"
      ],
      "docsWaiver": null,
      "files": [
        "bin",
        "src/cli",
        "src/core",
        "src/server",
        "src/panel",
        "src/service/index.ts",
        "test/cli",
        "test/core",
        "test/server",
        ".gitignore",
        "docs/architecture/modules/cli.md",
        "docs/architecture/modules/core.md",
        "docs/architecture/modules/server.md",
        "docs/architecture/modules/panel.md",
        "docs/architecture/modules/service.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Каркас бэкенда, фильтр доступа и панель-оболочка",
      "why": "Точка входа, HTTP-сервер с безопасным доступом с Mac и iPad и пустая панель, на которой наращиваются видимые функции"
    },
    {
      "acceptance": [
        "Проект создаётся в корне проектов из config.json; имя проверяется по разделу 6 (без /, \\, .., ведущего -, зарезервированных имён Windows; NFC); тесты",
        "Открыть можно только папку внутри домашней по realpath (на Windows без учёта регистра); выход через .. и симлинки отклоняется; тесты",
        "GET /api/folders отдаёт подкаталоги; ошибка доступа (macOS TCC) показывается с подсказкой; поля ввода с autocapitalize=off и autocorrect=off",
        "DELETE убирает проект только из списка, папка остаётся",
        "projects.json пишется атомарно; события пишутся в events.jsonl с ротацией по 5 МБ"
      ],
      "checks": [
        "Визуально: создать проект и открыть существующую папку выбором из списка на Mac и iPad; после перезапуска serve проекты на месте"
      ],
      "commitMessage": "feat: add project registry and folder picker",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "src/core",
        "src/server",
        "src/panel",
        "test/core",
        "test/server",
        "docs/architecture/modules/core.md",
        "docs/architecture/modules/server.md",
        "docs/architecture/modules/panel.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Реестр проектов и выбор папки",
      "why": "Проект — основная единица навигации панели"
    },
    {
      "acceptance": [
        "Установка пишет раздел AGENTS.md между <!-- wfk:begin --> и <!-- wfk:end -->, CLAUDE.md (если нет), записи хука в .claude/settings.json и в конец .codex/hooks.json, блок .gitignore и манифест с хешами управляемых фрагментов; повтор идемпотентен",
        "Чужие разделы и маркеры (в том числе workflow-kit:begin/end Harness) и текст вне своих маркеров не меняются; тест на AGENTS.md и .codex/hooks.json с разделами Harness",
        "Проверка возвращает ok, missing, modified, outdated, newer; правка вне раздела Kit не меняет статус; невалидный JSON — отказ без перезаписи; CLAUDE.md без @AGENTS.md — предупреждение",
        "wfk hook session-start --client <c> ничего не печатает в stdout, находит проект по $CLAUDE_PROJECT_DIR или вверх от cwd, дописывает одну строку в .workflow-kit/local/sessions.jsonl с меткой WFK_SERVICE_SESSION, выходит с кодом 0 за 2 с; тест с подставным stdin",
        "wfk link ставит запускатель ~/.local/bin/wfk на текущий клон (разработка); тест на подставном HOME"
      ],
      "checks": [
        "Визуально: карточка структуры «нет» → «Установить» → «ok»; правка внутри раздела Kit в AGENTS.md → «modified». Пользователь выполняет wfk link, начинает сессию Claude в папке проекта — строка появляется в журнале"
      ],
      "commitMessage": "feat: add kit structure installer and session start hook",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true,
          "heading": "7. Структура Kit в папке проекта (v1)"
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "src/kit-structure",
        "src/cli",
        "src/core",
        "src/server",
        "src/panel",
        "test/kit-structure",
        "test/cli",
        "test/server",
        "docs/architecture/modules/kit-structure.md",
        "docs/architecture/modules/cli.md",
        "docs/architecture/modules/core.md",
        "docs/architecture/modules/server.md",
        "docs/architecture/modules/panel.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Структура Kit v1, приём хука и wfk link",
      "why": "Kit записывает в папку свою структуру и узнаёт о сессиях через хук SessionStart"
    },
    {
      "acceptance": [
        "Контракт раздела 1 документа провайдеров описан типами; реестр по строковому id содержит claude и codex (заглушки со статусом «не реализовано»)",
        "Помощник readHookSessions(project, client) читает журнал хука; итоговый список строит провайдер, сервер не фильтрует",
        "Маршруты раздела 10 (предпросмотр и доверие по токену, одобрение хука по команде и хешу, сессии, особые действия, refresh) работают через контракт; тесты с подставным провайдером",
        "Мьютекс на проект и провайдера; долгие действия — операции с operationId и состоянием в /api/state; повторный запуск того же действия во время операции не создаёт второе",
        "Утилиты процессов по D5 и D9: отдельная группа, вывод в файл, очистка CLAUDE*, запись pid, времени старта, командной строки и boot id; остановка TERM → ожидание → проверка → KILL только после сверки; тесты",
        "Действия провайдеров (доверие, одобрение, создание) пишутся в events.jsonl"
      ],
      "checks": [
        "Визуально: в «Системе» и в проекте видны провайдеры claude и codex со статусом «не реализовано»; сессии Claude, начатые в Desktop в папке проекта, видны в /api/state по журналу хука"
      ],
      "commitMessage": "feat: add provider contract, registry, operations and process utilities",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-providers.md",
          "required": true,
          "heading": "1. Контракт провайдера"
        },
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "src/providers",
        "src/core",
        "src/server",
        "src/provider-claude/index.ts",
        "src/provider-codex/index.ts",
        "test/providers",
        "test/core",
        "test/server",
        "docs/architecture/modules/providers.md",
        "docs/architecture/modules/core.md",
        "docs/architecture/modules/server.md",
        "docs/architecture/modules/provider-claude.md",
        "docs/architecture/modules/provider-codex.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Контракт провайдера, API, операции и утилиты процессов",
      "why": "Общий контракт и общие механизмы позволяют реализовать провайдеров без правок сервера и панели"
    },
    {
      "acceptance": [
        "Карточка провайдера: статус и версии CLI, доверие с предпросмотром (ключи и точки автозапуска) и подтверждением по токену, хуки Kit и чужие с командой и хешем, кнопка одобрения передаёт команду и хеш, список сессий, особые действия",
        "Недоступное показано с причиной; идущие операции блокируют свою кнопку и показывают ход",
        "Ссылка сессии выбирается по устройству: mobile при navigator.maxTouchPoints > 1, иначе desktop, web — запасная; сессия без ссылки показывает note",
        "Логика выбора ссылки и отображения состояний покрыта тестами node --test"
      ],
      "checks": [
        "Визуально: на Mac и iPad в проекте две карточки (Claude, ChatGPT) с заглушками; сессии Claude из журнала хука видны в списке; на iPad вёрстка не ломается"
      ],
      "commitMessage": "feat: add generic provider cards to the panel",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-providers.md",
          "required": true,
          "heading": "1. Контракт провайдера"
        },
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true,
          "heading": "10. HTTP API"
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "src/panel",
        "test/panel",
        "docs/architecture/modules/panel.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Общий интерфейс провайдеров в панели",
      "why": "Панель рисует любого провайдера из контракта, без кода под провайдера"
    },
    {
      "acceptance": [
        "Возможности учитывают ОС, наличие expect и версию claude; status только читает (кэш по mtime ~/.claude.json)",
        "previewTrust перечисляет ключи и точки автозапуска папки; grantTrust проходит диалог под pty с WFK_SERVICE_SESSION=trust, копией ~/.claude.json до и проверкой после",
        "createSession: session.exp печатает SESSION_URL и pid дочернего claude; debug-файл — запасной источник; запись в sessions/claude.json по D9; имя «<проект> · <время>»",
        "Сессии из хука получают remoteId отложенно по bridge-session в transcript_path; без него — без ссылки с note; служебные сессии скрыты",
        "resumeSession поднимает тот же session id; stopSession останавливает только свой процесс по D9",
        "Особое действие проекта «Окружение папки» (запуск и остановка claude remote-control --spawn=same-dir) по D5 и D9",
        "Ссылки claude://claude.ai/code/session_<id> и https://claude.ai/code/session_<id>; тесты на подставном claude и фикстурах транскриптов"
      ],
      "checks": [
        "Визуально: предпросмотр → «Доверять» → «доверено»; «Создать сессию» → открывается в Claude Desktop на Mac и в приложении Claude на iPad; после перезапуска serve сессия жива; окружение папки запускается и видно с iPad"
      ],
      "commitMessage": "feat: implement claude provider",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-providers.md",
          "required": true,
          "heading": "2. Claude"
        },
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true,
          "heading": "3. Решения"
        }
      ],
      "dependencies": [
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "src/provider-claude",
        "test/provider-claude",
        "docs/architecture/modules/provider-claude.md"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "TODO",
      "title": "Провайдер Claude",
      "why": "Доверие, сессии Remote Control и окружение папки Claude из панели"
    },
    {
      "acceptance": [
        "status только читает: pid-файл и initialize по сокету демона с кэшем; ошибка токена — с подсказкой «выполните codex login»; запуск демона — особое действие",
        "previewTrust показывает trust_level и чужие хуки; запись через codex app-server с копией ~/.codex/config.toml до и проверкой после",
        "approveHooks одобряет только хук Kit при точном совпадении команды и хеша; чужие хуки не одобряются; тест",
        "createSession: thread/start, thread/name/set, служебный turn/start с безопасными sandbox и approval (параметры проверены на устройстве и записаны в контракт модуля); запись в sessions/codex.json",
        "listSessions: журнал хука + записи панели, названия из session_index.jsonl; неодобренный хук — note «список неполон»; ссылка codex://threads/<id>",
        "Windows — возможности недоступны с причиной; тесты на подставном JSON-RPC сервере и фикстурах"
      ],
      "checks": [
        "Визуально: статус демона; доверие с предпросмотром; «Одобрить хук» с командой и хешем; «Создать сессию» → открывается в ChatGPT на Mac и на iPad"
      ],
      "commitMessage": "feat: implement codex provider",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-providers.md",
          "required": true,
          "heading": "3. Codex"
        },
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true
        }
      ],
      "dependencies": [
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "src/provider-codex",
        "test/provider-codex",
        "docs/architecture/modules/provider-codex.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "TODO",
      "title": "Провайдер Codex",
      "why": "Демон, доверие, одобрение хука Kit и сессии Codex из панели"
    },
    {
      "acceptance": [
        "install копирует bin, src, package.json в app/<версия>, пишет app/current.json, сохраняет пути node, claude, codex, expect и PATH login-shell, ставит запускатель wfk и значок, регистрирует автозапуск и запускает службу; повтор обновляет; uninstall снимает всё, кроме данных",
        "macOS: LaunchAgent с RunAtLoad, KeepAlive, AbandonProcessGroup, PATH и абсолютным node; Linux: systemd user unit с KillMode=process, без systemd — XDG autostart; Windows: ключ HKCU Run со скрытым окном; тесты проверяют файлы и команды для трёх ОС на подставном HOME",
        "service start, stop, status; статус службы и автозапуска отдаётся в «Систему» через src/service/index.ts",
        "open: проверяет /api/health, при необходимости запускает службу, ждёт готовности и открывает панель в окне приложения (Chrome/Edge --app, иначе браузер); значок вызывает open",
        "doctor --installed проверяет установленную службу и /api/health"
      ],
      "checks": [
        "Визуально (на dev-экземпляре с WFK_DATA_DIR и WFK_PORT, без регистрации автозапуска на Mac): карточка «Система» показывает службу, способ автозапуска и пути программ; open открывает панель в окне без вкладок"
      ],
      "commitMessage": "feat: add backend installer, autostart and launcher",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true
        }
      ],
      "dependencies": [
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "src/service",
        "test/service",
        "docs/architecture/modules/service.md"
      ],
      "fixes": null,
      "id": "T008",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "TODO",
      "title": "Установщик, автозапуск, запускатель и значок",
      "why": "Бэкенд разворачивается на любой ОС и стартует сам после входа в систему или при запуске интерфейса"
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
        "QUALITY",
        "T001",
        "T002",
        "T003",
        "T004",
        "T005",
        "T006",
        "T007",
        "T008"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M1-orchestrator-core.md",
        "docs/architecture/modules/cli.md",
        "docs/architecture/modules/core.md",
        "docs/architecture/modules/server.md",
        "docs/architecture/modules/panel.md",
        "docs/architecture/modules/service.md",
        "docs/architecture/modules/kit-structure.md",
        "docs/architecture/modules/providers.md",
        "docs/architecture/modules/provider-claude.md",
        "docs/architecture/modules/provider-codex.md"
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
        "Бэкенд установлен на Mac пользователя командой node bin/wfk.mjs install после его подтверждения; после перезагрузки и входа служба работает",
        "Сценарий раздела 11 пройден с пользователем на Mac и iPad; результат каждого шага записан в docs/evidence/M1-acceptance.md"
      ],
      "checks": [
        "Пользователь проходит сценарий раздела 11 спецификации"
      ],
      "commitMessage": "docs: record milestone 1 acceptance",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true
        }
      ],
      "dependencies": [
        "T006",
        "T007",
        "T008",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M1-acceptance.md"
      ],
      "fixes": null,
      "id": "T009",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Установка на Mac и приёмка вехи 1",
      "why": "Пользователь проверяет веху визуально на своём Mac и iPad"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m1-orchestrator-core (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: orchestrated (max 3 workers, owner cfa00ffe-c414-4ae6-9953-e3d2906b3705)
- Current task: none
- Progress: 0/11
- Revision: 2

## Objective

Веха 1: бэкенд-служба Workflow Kit (любая ОС, установщик, автозапуск, запускатель), проекты, собственная структура Kit, провайдеры Claude и Codex с общим контрактом и веб-панель для Mac и iPad

## Acceptance

- Сценарий визуальной приёмки из раздела 11 спецификации пройден пользователем на Mac и iPad
- Бэкенд установлен установщиком и стартует после входа в систему и по значку без ручного запуска
- Обязательные проверки качества (типы, тесты) проходят

## Rounds

### R1 — Implementation (implementation, OPEN)

- [TODO] QUALITY — Configure the project quality profile (quality)
  - Commit: chore: configure the project quality profile
- [TODO] T001 — Каркас бэкенда, фильтр доступа и панель-оболочка (work)
  - Commit: feat: add backend skeleton with access filter and panel shell
  - Files: bin, src/cli, src/core, src/server, src/panel, src/service/index.ts, test/cli, test/core, test/server, .gitignore, docs/architecture/modules/cli.md, docs/architecture/modules/core.md, docs/architecture/modules/server.md, docs/architecture/modules/panel.md, docs/architecture/modules/service.md
  - Depends on: QUALITY
- [TODO] T002 — Реестр проектов и выбор папки (work)
  - Commit: feat: add project registry and folder picker
  - Files: src/core, src/server, src/panel, test/core, test/server, docs/architecture/modules/core.md, docs/architecture/modules/server.md, docs/architecture/modules/panel.md
  - Depends on: T001
- [TODO] T003 — Структура Kit v1, приём хука и wfk link (work)
  - Commit: feat: add kit structure installer and session start hook
  - Files: src/kit-structure, src/cli, src/core, src/server, src/panel, test/kit-structure, test/cli, test/server, docs/architecture/modules/kit-structure.md, docs/architecture/modules/cli.md, docs/architecture/modules/core.md, docs/architecture/modules/server.md, docs/architecture/modules/panel.md
  - Depends on: T002
- [TODO] T004 — Контракт провайдера, API, операции и утилиты процессов (work)
  - Commit: feat: add provider contract, registry, operations and process utilities
  - Files: src/providers, src/core, src/server, src/provider-claude/index.ts, src/provider-codex/index.ts, test/providers, test/core, test/server, docs/architecture/modules/providers.md, docs/architecture/modules/core.md, docs/architecture/modules/server.md, docs/architecture/modules/provider-claude.md, docs/architecture/modules/provider-codex.md
  - Depends on: T003
- [TODO] T005 — Общий интерфейс провайдеров в панели (work)
  - Commit: feat: add generic provider cards to the panel
  - Files: src/panel, test/panel, docs/architecture/modules/panel.md
  - Depends on: T004
- [TODO] T006 — Провайдер Claude (work, parallel-safe)
  - Commit: feat: implement claude provider
  - Files: src/provider-claude, test/provider-claude, docs/architecture/modules/provider-claude.md
  - Depends on: T005
- [TODO] T007 — Провайдер Codex (work, parallel-safe)
  - Commit: feat: implement codex provider
  - Files: src/provider-codex, test/provider-codex, docs/architecture/modules/provider-codex.md
  - Depends on: T005
- [TODO] T008 — Установщик, автозапуск, запускатель и значок (work, parallel-safe)
  - Commit: feat: add backend installer, autostart and launcher
  - Files: src/service, test/service, docs/architecture/modules/service.md
  - Depends on: T005
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M1-orchestrator-core.md, docs/architecture/modules/cli.md, docs/architecture/modules/core.md, docs/architecture/modules/server.md, docs/architecture/modules/panel.md, docs/architecture/modules/service.md, docs/architecture/modules/kit-structure.md, docs/architecture/modules/providers.md, docs/architecture/modules/provider-claude.md, docs/architecture/modules/provider-codex.md
  - Depends on: QUALITY, T001, T002, T003, T004, T005, T006, T007, T008
- [TODO] T009 — Установка на Mac и приёмка вехи 1 (delivery)
  - Commit: docs: record milestone 1 acceptance
  - Files: docs/evidence/M1-acceptance.md
  - Depends on: T006, T007, T008, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
