# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-10T14:57:48.636Z",
    "scopeId": "m11-plan-start"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 568,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "provider-registry: Provider.sharedAccess (SharedAccess: state, cached, preview, apply, remove, open) и Provider.reviewBrief",
          "routes: GET/POST /api/providers/:p/shared-access[/recheck|/preview|/apply|/remove|/open]",
          "provider-codex: createSharedAccess, createSharedMode, sharedThreadLinks, wakeThread; status.details.sharedAccess",
          "cli: briefByQueue(provider) по reviewBrief; OPENABLE_LINK принимает ?hostId=remote-ssh-discovered%3A<alias>",
          "service-installer: doctor — строка «ChatGPT: общий доступ к чатам» (deps.sharedAccess)"
        ],
        "decisions": [
          "Режим только на macOS; Linux и Windows — unsupported",
          "Kit пишет ключ, authorized_keys (from=127.0.0.1,::1), блок Host wfk-local и блок профиля после предпросмотра; «Удалённый вход» и переключатель wfk-local в ChatGPT — пользователь",
          "Подключение открывается ссылкой codex://settings/connections/ssh: добавить его ссылкой нельзя (проба 2026-11-11)",
          "Профиль: zsh — ~/.zshenv, bash — первый login-профиль; приложение запускает $SHELL -l -i -c",
          "Ревьюер ChatGPT получает задание первым сообщением (reviewBrief), его чат предлагается только при active",
          "Сбой проверки (в т.ч. второй app-server) переводит в broken и возвращает прежнее поведение"
        ],
        "references": [
          "docs/planning/M12-codex-shared-daemon.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/shared-access.md",
          "docs/installation.md#общий-доступ-к-чатам-chatgpt-macos"
        ],
        "result": "macOS: Kit сам настраивает SSH-доступ ChatGPT к своему демону Codex (карточка «Общий доступ к чатам», маршруты shared-access, строка wfk doctor). В режиме общего демона чаты Kit (и ревьюера) открываются в ChatGPT на Mac, iPad и из Kit одновременно: ссылка с hostId, без выгрузки, wakeSession, управление у демона, самопроверка с откатом. Linux и Windows — unsupported, поведение 0.6.4."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "CLOSED",
      "title": "Implementation"
    },
    {
      "digest": null,
      "id": "R2",
      "kind": "fixes",
      "status": "OPEN",
      "title": "CI Windows: права файлов в тесте общего доступа"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "На macOS блок «Общий доступ к чатам» в панели настраивает SSH-доступ после предпросмотра, без команд в терминале; вручную остаются только «Удалённый вход» и подтверждение подключения в ChatGPT",
      "В режиме общего демона новая сессия ChatGPT открывается ссылкой с hostId и работает одновременно на Mac, на iPad и из Kit; чат ревьюера ChatGPT виден в приложениях и открывается с карточки ревью",
      "Kit будит простаивающую сессию ChatGPT и доставляет «Сообщение агенту» без ожидания следующего хода",
      "При сбое схемы и на Linux и Windows ChatGPT работает как в 0.6.4, блок показывает причину",
      "README и docs/installation.md описывают настройку общего доступа и её удаление",
      "CI зелёный на macOS, Linux, Windows x64 и ARM64; живая проверка на macOS записана в документе приёмки"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-11T09:29:02.850Z",
      "text": "Пользователь, 2026-11-11: «Пиши спецификацию и to-do plan, и не забудь, пожалуйста, вписать в спецификацию изменение README файла касающегося настройки Workflow Kit. Поскольку ChatGPT для нормальной работы через SSH нужно ж настраивать. Или мы можем это сделать из Workflow Kit, если можем, значит должны это делать мы. Приступай.» | Execution mode chosen by the user: sequential: Пользователь в чате на вопрос «Выберете sequential на карточке плана?»: «Выбрал»; ранее: «Приступая к выполнению плана и созданию нового релиза для моей проверки. Если что-то пойдет не так, откатимся.»"
    },
    "baselineCommit": "67812bc57e5a6ffaf7b0cbde121a4a50d877c29b",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M12-codex-shared-daemon.md",
        "required": true
      },
      {
        "path": "docs/architecture/OVERVIEW.md",
        "required": false,
        "heading": "Матрица ОС"
      }
    ],
    "decisions": [
      {
        "at": "2026-11-11T09:29:02.850Z",
        "text": "Режим общего демона только на macOS; Linux и Windows — unsupported, поведение 0.6.4"
      },
      {
        "at": "2026-11-11T09:29:02.850Z",
        "text": "Всё, что Kit может настроить сам, настраивает Kit после предпросмотра; «Удалённый вход» и подключение в ChatGPT включает пользователь"
      },
      {
        "at": "2026-11-11T09:29:02.850Z",
        "text": "Ключ Kit в authorized_keys принимается только с 127.0.0.1 и ::1"
      },
      {
        "at": "2026-11-11T09:29:02.850Z",
        "text": "Ревьюер ChatGPT по-прежнему получает задание первым сообщением и скрыт в дереве проекта; на карточке ревью появляется ссылка на его чат"
      },
      {
        "at": "2026-11-11T09:29:02.850Z",
        "text": "При сбое схемы Kit сам возвращается к прежнему поведению"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "e9c04a9c-cd7c-4f6c-b4f7-f6b07802530e",
      "strategy": "sequential"
    },
    "id": "m12-codex-shared-daemon",
    "objective": "ChatGPT на macOS работает через один демон Codex: чаты Kit (включая ревьюера) одновременно доступны в Kit, в приложении ChatGPT и на iPad/телефоне; настройку SSH-доступа выполняет сам Kit",
    "spec": "docs/planning/M12-codex-shared-daemon.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "sharedAccess провайдера Codex отдаёт состояния unsupported, not-configured, needs-remote-login, needs-connection, active, broken по разделу 2.2",
        "Предпросмотр с токеном перечисляет все записи; применение делает копии, идемпотентно, заменяет ручной блок пробы; удаление убирает всё записанное",
        "Проверка после записи: порт 22, ssh BatchMode с codex и переменной, подключение приложения по списку процессов",
        "Живая проба установила вид ссылки добавления подключения или подтвердила запасную инструкцию; результат записан в module.md",
        "Маршруты /api/providers/:p/shared-access и строка в wfk doctor; на linux и win32 — unsupported, тесты с подставленной платформой",
        "module.md модулей обновлены в том же коммите"
      ],
      "checks": [],
      "commitMessage": "feat: set up the shared Codex daemon access from Kit",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M12-codex-shared-daemon.md",
          "required": true,
          "heading": "2. Решение"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/system-service/clusters/deployment/modules/service-installer",
        "tools/platform-guard/allowlist.json",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/handover.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/shared-access.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/handover.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-access.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-files.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-access.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/routes.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/shared-access-routes.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/shared-access.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/routes.test.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/module.md",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/context.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/doctor.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/types.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/control.test.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/fakes.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Настройка общего доступа к чатам ChatGPT",
      "why": "Пользователь не должен настраивать SSH руками"
    },
    {
      "acceptance": [
        "В режиме ссылка desktop содержит hostId, создание сессии не выгружает чат; вне режима поведение 0.6.4",
        "wakeSession Codex: thread/resume при необходимости и turn/start; вне режима отвечает false",
        "Способ доставки задания ревьюеру — явное свойство провайдера; ревьюер ChatGPT получает задание первым сообщением",
        "Удалённое управление остаётся у демона; если его держит приложение, статус объясняет, что сделать",
        "Самопроверка в maintain переводит режим в broken и обратно; open-link принимает только ссылку с hostId=remote-ssh-discovered%3A<alias>",
        "Тесты с подставленной платформой linux и win32; module.md и матрица ОС в OVERVIEW.md обновлены в том же коммите"
      ],
      "checks": [],
      "commitMessage": "feat: run ChatGPT sessions through the shared Codex daemon",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M12-codex-shared-daemon.md",
          "required": true,
          "heading": "2. Решение"
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/open-link.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/open-link.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/review.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/handover.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/shared-access.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/handover.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-access.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-mode.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/thread-ops.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-mode.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-sessions.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Сессии ChatGPT в режиме общего демона",
      "why": "Чаты Kit должны работать в приложении, на телефоне и из Kit одновременно"
    },
    {
      "acceptance": [
        "Блок «Общий доступ к чатам» показывает каждое состояние раздела 2.2 с его кнопками, предпросмотр и подтверждение записи и удаления",
        "На карточке «Ревью плана» есть «Открыть чат ревьюера», когда у ревьюера рабочая ссылка; в дереве проекта ревьюер скрыт",
        "Тесты моделей панели; module.md обновлены в том же коммите"
      ],
      "checks": [],
      "commitMessage": "feat: show the shared access setup and the reviewer chat link in the panel",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M12-codex-shared-daemon.md",
          "required": true,
          "heading": "2. Решение"
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "product-parts/control-panel/clusters/web-panel/modules/session-view",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/shared-access-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/shared-access-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/shared-access-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Панель: блок общего доступа и чат ревьюера",
      "why": "Настройка и состояние режима должны быть видны и управляемы из панели"
    },
    {
      "acceptance": [
        "Шаг 4 README содержит пункт «Общий доступ к чатам (macOS)»: зачем, Удалённый вход, «Настроить» в панели, подключение, перезапуск ChatGPT, удаление",
        "«Особенности провайдеров в работе» и таблица шага 1 говорят, что даёт режим и что без него",
        "docs/installation.md: создаваемые файлы и раздел неполадок по разделу 2.4"
      ],
      "checks": [],
      "commitMessage": "docs: describe the shared chat access setup for ChatGPT",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M12-codex-shared-daemon.md",
          "required": true,
          "heading": "2. Решение"
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/installation.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "README и инструкция по установке",
      "why": "Пользователь просил описать настройку ChatGPT в README"
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
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M12-codex-shared-daemon.md",
        "docs/installation.md"
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
        "Версия 0.7.0, CHANGELOG, документ приёмки с живыми проверками по ОС и известными рисками",
        "CI зелёный на macOS, Linux, Windows x64 и ARM64 на ветке ci/m12-codex-shared-daemon",
        "Служба переустановлена, живая проверка раздела 4 пройдена пользователем на macOS"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.7.0",
      "confirmation": "Пользователь, 2026-11-11: «Приступая к выполнению плана и созданию нового релиза для моей проверки. Если что-то пойдет не так, откатимся.»; затем: «Двигайся дальше… не останавливайся только в том случае, если у тебя есть ко мне вопросы.»",
      "context": [],
      "dependencies": [
        "T004",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "docs/evidence/M12-acceptance.md",
        "README.md",
        "docs/installation.md",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Релиз 0.7.0",
      "why": "Релиз 0.7.0"
    },
    {
      "acceptance": [
        "Проверка прав 0600 в тесте настройки идёт только на хостах с POSIX-правами (не Windows)",
        "Остальные проверки теста идут на всех ОС"
      ],
      "checks": [],
      "commitMessage": "test: skip the POSIX file mode check of the shared access test on Windows hosts",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": "меняется только тест, контракт модуля не меняется",
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-access.test.ts"
      ],
      "fixes": "T001",
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "DONE",
      "title": "Тест общего доступа без проверки POSIX-прав на Windows",
      "why": "CI 42999966626: на Windows x64 и ARM64 тест ждёт права 0600, а файловая система Windows отдаёт 0666; продукт на Windows эти файлы не пишет"
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
        "T006"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "DOCS-R2",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R2",
      "status": "TODO",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "CI зелёный на macOS, Linux, Windows x64 и ARM64 на ветке ci/m12-codex-shared-daemon",
        "Документ приёмки записывает запуск CI и падение первого запуска",
        "Служба 0.7.0 установлена, wfk doctor --installed — всё в порядке"
      ],
      "checks": [],
      "commitMessage": "chore: record the green CI of release 0.7.0",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T006",
        "DOCS-R2"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M12-acceptance.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R2",
      "status": "TODO",
      "title": "Выпуск 0.7.0 с зелёным CI",
      "why": "Выпуск 0.7.0 с зелёным CI"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m12-codex-shared-daemon (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 7/9
- Revision: 568

## Objective

ChatGPT на macOS работает через один демон Codex: чаты Kit (включая ревьюера) одновременно доступны в Kit, в приложении ChatGPT и на iPad/телефоне; настройку SSH-доступа выполняет сам Kit

## Acceptance

- На macOS блок «Общий доступ к чатам» в панели настраивает SSH-доступ после предпросмотра, без команд в терминале; вручную остаются только «Удалённый вход» и подтверждение подключения в ChatGPT
- В режиме общего демона новая сессия ChatGPT открывается ссылкой с hostId и работает одновременно на Mac, на iPad и из Kit; чат ревьюера ChatGPT виден в приложениях и открывается с карточки ревью
- Kit будит простаивающую сессию ChatGPT и доставляет «Сообщение агенту» без ожидания следующего хода
- При сбое схемы и на Linux и Windows ChatGPT работает как в 0.6.4, блок показывает причину
- README и docs/installation.md описывают настройку общего доступа и её удаление
- CI зелёный на macOS, Linux, Windows x64 и ARM64; живая проверка на macOS записана в документе приёмки

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Настройка общего доступа к чатам ChatGPT (work)
  - Commit: feat: set up the shared Codex daemon access from Kit
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/system-service/clusters/deployment/modules/service-installer, tools/platform-guard/allowlist.json, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/handover.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/shared-access.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/handover.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-access.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-files.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-access.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/routes.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/shared-access-routes.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/shared-access.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/routes.test.ts, product-parts/system-service/clusters/deployment/modules/service-installer/module.md, product-parts/system-service/clusters/deployment/modules/service-installer/src/context.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/doctor.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/types.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/control.test.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/fakes.ts
- [DONE] T002 — Сессии ChatGPT в режиме общего демона (work)
  - Commit: feat: run ChatGPT sessions through the shared Codex daemon
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/open-link.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/open-link.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/review.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/handover.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/shared-access.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/handover.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-access.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-mode.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/thread-ops.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-mode.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-sessions.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts
  - Depends on: T001
- [DONE] T003 — Панель: блок общего доступа и чат ревьюера (work)
  - Commit: feat: show the shared access setup and the reviewer chat link in the panel
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell, product-parts/control-panel/clusters/web-panel/modules/session-view, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/shared-access-card.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/shared-access-model.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/shared-access-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js, product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts
  - Depends on: T002
- [DONE] T004 — README и инструкция по установке (work)
  - Commit: docs: describe the shared chat access setup for ChatGPT
  - Files: README.md, docs/installation.md
  - Depends on: T003
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M12-codex-shared-daemon.md, docs/installation.md
  - Depends on: T001, T002, T003, T004
- [DONE] T005 — Релиз 0.7.0 (delivery)
  - Commit: chore: release 0.7.0
  - Files: package.json, package-lock.json, CHANGELOG.md, docs/evidence/M12-acceptance.md, README.md, docs/installation.md, docs/architecture/OVERVIEW.md
  - Depends on: T004, DOCS-R1

Digest: macOS: Kit сам настраивает SSH-доступ ChatGPT к своему демону Codex (карточка «Общий доступ к чатам», маршруты shared-access, строка wfk doctor). В режиме общего демона чаты Kit (и ревьюера) открываются в ChatGPT на Mac, iPad и из Kit одновременно: ссылка с hostId, без выгрузки, wakeSession, управление у демона, самопроверка с откатом. Linux и Windows — unsupported, поведение 0.6.4.

### R2 — CI Windows: права файлов в тесте общего доступа (fixes, OPEN)

- [DONE] T006 — Тест общего доступа без проверки POSIX-прав на Windows (work)
  - Commit: test: skip the POSIX file mode check of the shared access test on Windows hosts
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-access.test.ts
  - Fixes: T001
- [TODO] DOCS-R2 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R2
  - Files: README.md, docs/architecture/OVERVIEW.md
  - Depends on: T006
- [TODO] T007 — Выпуск 0.7.0 с зелёным CI (delivery)
  - Commit: chore: record the green CI of release 0.7.0
  - Files: docs/evidence/M12-acceptance.md
  - Depends on: T006, DOCS-R2

State changes only through `scripts/workflow` commands. History lives in Git.
