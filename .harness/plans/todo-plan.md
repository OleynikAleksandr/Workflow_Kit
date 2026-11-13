# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-12T18:46:52.163Z",
    "scopeId": "m23-kit-tests-windows"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 776,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "panel-shell: sessionSidebar, resize/drawer, viewport и сохранение состояния слотов.",
          "session-chat: Enter/Stop, очередь, IME, SessionInfo.model, ревизия черновика, stale без скрытого повтора.",
          "Provider: capability interruptTurn, interruptAvailability/interruptTurn, stopped только с подтверждением.",
          "cli/channel: POST interrupt, channel.interruptions, поколения, pending, барьер и waiting без Stop hook.",
          "Claude: свежий marker+idle без диалогов; Codex: точный native turn; Kimi: свой сервер, prompt и idle/замок.",
          "autopilot/cross-review: пауза владельца, барьер доставки, прерванное ревью не считается ответом."
        ],
        "decisions": [
          "Сохранены порядок карточек и правила решений; узкий экран использует drawer.",
          "Working показывает Stop; Enter/очередь сохраняют M18 и IME, черновики защищены ревизией.",
          "Плюс и микрофон отключены; параметры только из публичных данных, без новой телеметрии.",
          "Подтверждение Stop относится к своему поколению; барьер запрещает автопродолжение.",
          "T008/T009 исправили HTTP 504; старый макет исторический, точная сверка со скриншотом не выполнена.",
          "Локальная поставка отдельно; живые проверки/CI не заявлены. Push после приёмки и закрытия."
        ],
        "references": [
          "docs/planning/M24-interface-polish.md",
          "docs/design/M24-turn-interruption.md",
          "docs/design/M24-browser-verification.md",
          "docs/evidence/M24-acceptance.md",
          "docs/architecture/CONTRACTS.md",
          "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md"
        ],
        "result": "M24 реализована в исходниках: карточки слева, resize/drawer, диалог в viewport, компактный ввод и действующий Stop трёх провайдеров. Тесты и Chromium с fixtures прошли. Поставка 0.10.0 и живая приёмка впереди."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "CLOSED",
      "title": "Implementation"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "План, вопросы, выбор, подтверждение выпуска, ревью и активность выбранной сессии находятся под деревом проектов и сессий слева, без копий справа и без изменения правил действий.",
      "Ширина левого сайдбара меняется мышью, touch и клавиатурой, ограничивается размерами окна и сохраняется на устройстве; узкий экран использует раскрываемый сайдбар.",
      "Ответвления дерева попадают в вертикальный центр карточек любой высоты; последнее скруглено и заканчивается на карточке, без хвоста вниз.",
      "Лента прокручивается внутри диалога; поле ввода, параметры и кнопки помещаются в доступную область на desktop и iPad, включая многострочный текст, ошибки и экранную клавиатуру.",
      "Ввод по второму скриншоту: плюс, текст, Enter/Stop, микрофон и фактические параметры; holding/waiting показывают Enter, working — Stop, прежняя очередь доступна Ctrl/Cmd+Enter и действием для touch.",
      "Stop прерывает текущий ответ управляемой сессии каждого из трёх провайдеров и удерживает автоматическое продолжение; неподдерживаемая сессия показывает причину, история и черновик сохраняются.",
      "Контракты, матрица ОС и доказательства обновлены; локальная поставка 0.10.0 подготовлена после подтверждения, без push; живые проверки и CI не приписаны локальным тестам."
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-13T08:02:31.685Z",
      "text": "Пользователь: «В этой сессии я прошу тебя сделать скоп по полировке интерфейса… Нужно перенести и план, и карточки требующие внимания и выбора пользователя в левый сайдбар… мышкой можно было менять ширину… Всю зону диалог нужно сделать всегда помещающейся… Когда агент отвечает… Enter становится… Stop». Уточнение: «Перенести внешний вид; данные показывать, если доступны; новые функции подключить позже». Выбран план с ревью. Дополнение пользователя: ответвления дерева по центру карточек, последнее скруглено без хвоста вниз. | Execution mode chosen by the user: sequential: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
    },
    "baselineCommit": "1f7a052f3918b5c8ffa0d137413580e590d7fe8e",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M24-interface-polish.md",
        "required": true
      },
      {
        "path": "docs/design/M24-turn-interruption.md",
        "required": true
      },
      {
        "path": "docs/design/M24-browser-verification.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-13T08:02:31.685Z",
        "text": "Визуальные источники: Screenshot 2026-11-13 at 07.50.10.png и Screenshot 2026-11-13 at 07.56.24.png; описание закреплено в M24."
      },
      {
        "at": "2026-11-13T08:02:31.685Z",
        "text": "Плюс, микрофон, модель, усилие, режим и контекст — внешний вид и существующие данные, без подключения новых функций."
      },
      {
        "at": "2026-11-13T08:02:31.685Z",
        "text": "Enter/Stop — действующее управление; Stop прерывает ответ, не завершает процесс и не подтверждает задачу или план."
      },
      {
        "at": "2026-11-13T08:02:31.685Z",
        "text": "Последовательное выполнение рекомендовано из-за общего каркаса, контрактов состояния и связанной проверки переходов."
      },
      {
        "at": "2026-11-13T08:02:31.685Z",
        "text": "Публикация GitHub — вне scope после приёмки и закрытия по просьбе пользователя; delivery устанавливает только локальный релиз."
      },
      {
        "at": "2026-11-13T08:02:31.685Z",
        "text": "Уточнение по третьему скриншоту 08.06.08: центрировать ответвления дерева, последнее скруглить и убрать свободный хвост."
      },
      {
        "at": "2026-11-13T08:02:31.685Z",
        "text": "По ревью R1 сохранены очередь M18 и порядок карточек; неизвестная активность не угадывается, модель читается в session-chat прямо из state."
      },
      {
        "at": "2026-11-13T08:02:31.685Z",
        "text": "По ревью R1 подтверждённый interruptTurn завершает запись канала без Stop hook; поколение и барьер охватывают все пути, отдельные адаптеры Claude → Kimi → Codex."
      },
      {
        "at": "2026-11-13T08:02:31.685Z",
        "text": "Проверка раскладки выполняется в T001 через доступный Playwright MCP и полностью подставной API; реальные сессии пользователя не затрагиваются."
      }
    ],
    "delivery": "READY_FOR_ACCEPTANCE",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": "01a1d3ac-d295-7992-a65e-b522efe4bf4e",
      "strategy": "sequential"
    },
    "id": "m24-interface-polish",
    "objective": "Полировка интерфейса Workflow Kit: карточки и план слева, изменяемая ширина сайдбара, диалог в границах окна, ввод по образцу и действующий Enter/Stop.",
    "spec": "docs/planning/M24-interface-polish.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "По разделам 2.1–2.3 M24 новый sessionSidebar содержит все карточки актуальной сессии; прежние правила моделей и доступность действий сохранены.",
        "Разделитель ограничивает ширину, сохраняет её, работает мышью/touch/клавиатурой; drawer на узком экране имеет закрытие и управление фокусом.",
        "Ограничение высоты и независимая прокрутка диалога не ломают настройки, архив и мастер; состояние полей/фокуса/журнала переживает опрос и resize.",
        "Проверены модель размеров, размещение слотов и переключение сессий; контракты обоих модулей, их ОС-разделы и матрица OVERVIEW обновлены.",
        "По разделу 2.1.1 M24 ответвления дерева центрированы на карточках любой высоты; последнее скруглено без хвоста вниз, одна сессия и пустое дерево обработаны.",
        "Браузерная проверка по M24-browser-verification выполнена до коммита T001: Playwright MCP, временный статический сервер, подставной /api/state и переписка, все согласованные состояния карточек; реальные сессии и служба не затронуты.",
        "В evidence и скриншотах подтверждены размеры, темы, resize/drawer/фокус, центры линий, прокрутка мастера/архива/настроек и доступность ввода; дефекты раскладки исправлены до завершения T001.",
        "Общие CONTRACTS.md и web-panel/cluster.md обновлены в этом же коммите; мастер получает контейнер прокрутки оболочки без обрезки."
      ],
      "checks": [],
      "commitMessage": "feat(panel): move workflow cards into a resizable sidebar",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M24-interface-polish.md",
          "required": true
        },
        {
          "path": "docs/design/M24-turn-interruption.md",
          "required": true
        },
        {
          "path": "docs/design/M24-browser-verification.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "product-parts/control-panel/clusters/web-panel/modules/session-view",
        "docs/architecture/OVERVIEW.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "product-parts/control-panel/clusters/web-panel/cluster.md",
        "docs/architecture/CONTRACTS.md",
        "docs/evidence/M24-acceptance.md",
        "docs/evidence/M24",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/chat-model.test.ts",
        "docs/evidence/M24/T001-browser-results.json",
        "docs/evidence/M24/T001-desktop-dark.png",
        "docs/evidence/M24/T001-desktop-light.png",
        "docs/evidence/M24/T001-mobile-dialog.png",
        "docs/evidence/M24/T001-mobile-sidebar.png",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/files.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/index.html",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/layout-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/layout.css",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/panel-layout.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/session-screen.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/sidebar-slots.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/sidebar.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/slots.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/tree.css",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/viewport.css",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/layout-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/sidebar-view.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Сайдбар с планом, изменяемая ширина и диалог в области окна",
      "why": "Сайдбар с планом, изменяемая ширина и диалог в области окна"
    },
    {
      "acceptance": [
        "Раздел 1 M24-turn-interruption реализован: точные типы InterruptTarget/InterruptResult/InterruptAvailability, необязательные методы Provider, capability и channel.interruptions с состоянием каждой известной сессии, включая unknown после рестарта.",
        "Поколение учитывает prompt, ack block (очередь/continue/напоминание), принятую direct/detached отправку и подтверждённое прерывание; собственный echo-prompt не удваивает поколение, старые события не завершают новый ход.",
        "POST interrupt проверяет принадлежность/архив/поддержку, затем ставит барьер даже при already-idle/stale; идемпотентность и 10-секундный тайм-аут реализованы, stale возвращает актуальное состояние и не прерывает новый ход.",
        "Подтверждённый stopped:true сам переводит канал в waiting и инвалидирует старый ход без зависимости от Stop hook, освобождая следующую явную отправку.",
        "Барьер блокирует все фоновые продолжения и сохраняет очередь; штатная пауза применяется только к плану владельца; назначения Kit не отменяются, состояние native-подагентов не гарантируется.",
        "Ревью не засчитывает прерванный ход; ошибки и поздние события покрыты тестами. Реестр/канал/cli не требуют расширения в задачах адаптеров T003–T005; контракты и общие документы обновлены."
      ],
      "checks": [],
      "commitMessage": "feat(session): add guarded turn interruption and continuation barrier",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M24-interface-polish.md",
          "required": true
        },
        {
          "path": "docs/design/M24-turn-interruption.md",
          "required": true
        },
        {
          "path": "docs/design/M24-browser-verification.md",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/direct-message.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/turn-interruption.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/turn-interruption.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/interrupt.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/registry.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/detached.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/slots.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/turn-control.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/turn-state.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/types.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/turn-lifecycle.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/interrupt.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/interrupt.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/contract.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/texts.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/interruption.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Контракт прерывания ответа, API и барьер автопродолжения",
      "why": "Контракт прерывания ответа, API и барьер автопродолжения"
    },
    {
      "acceptance": [
        "Раздел T003 M24-turn-interruption реализован через существующий управляющий pty/ConPTY без kill/stopSession и с подтверждением прерывания, а не записью Esc.",
        "Диалоги/неизвестный экран делают Stop недоступным; свежая классификация в host перед отправкой исключает отказ разрешения через Esc, в том числе после устаревшего опроса.",
        "Проверены свежий/старый маркер, idle, отсутствие Stop hook, ошибка/тайм-аут, следующий промпт; linux/win32 ветки — injected platform, программы ОС учтены guard.",
        "Почти полный module.md предварительно разделён на краткий контракт со ссылкой и полный связанный документ; прежние требования сохранены, лимиты 28000 байт/400 строк соблюдены; ОС-матрица и evidence обновлены."
      ],
      "checks": [],
      "commitMessage": "feat(claude): interrupt managed turns with explicit confirmation",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M24-interface-polish.md",
          "required": true
        },
        {
          "path": "docs/design/M24-turn-interruption.md",
          "required": true
        },
        {
          "path": "docs/design/M24-browser-verification.md",
          "required": true
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M24-acceptance.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host",
        "tools/platform-guard/allowlist.json",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/interrupt.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/sessions.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/interrupt.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/programs.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-control.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-worker.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt.tcl",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/runtime.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/fixtures/fake-claude.mjs",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/interrupt-control.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/interrupt-host.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/interrupt.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/screen.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/test/screen.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Stop Claude: pty/ConPTY, диалоги и подтверждение",
      "why": "Stop Claude: pty/ConPTY, диалоги и подтверждение"
    },
    {
      "acceptance": [
        "ProviderError interrupt-timeout возвращается как HTTP 504 interrupt-timeout с подсказкой; общий лимит 10 с и барьер сохранены.",
        "Прочие ошибки адаптера остаются HTTP 502 interrupt-failed, недоступность и stale сохраняют штатные ответы; покрыты тестами и обновлён контракт cli."
      ],
      "checks": [],
      "commitMessage": "fix(session): preserve adapter interruption timeouts",
      "confirmation": null,
      "context": [
        {
          "path": "docs/design/M24-turn-interruption.md",
          "required": true
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M24-acceptance.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/turn-interruption.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/turn-interruption.test.ts"
      ],
      "fixes": "T002",
      "id": "T008",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Корректная передача ошибок адаптера Stop в HTTP API",
      "why": "При подключении Claude обнаружено: ProviderError interrupt-timeout с status 504 общий API ошибочно превращает в 502; завершённая T002 не редактируется."
    },
    {
      "acceptance": [
        "Раздел T004 M24-turn-interruption реализован на сервере Kit через :abort; подтверждение aborted:true и idle либо относящийся к ходу Interrupt и idle; takeover не используется.",
        "Проверены чужой владелец, stale/новый ход, ошибка/тайм-аут, отсутствие автопродолжения и следующая явная реплика; поведение macOS/Linux/Windows одинаково.",
        "Module.md разделён до превышения лимита 28000 байт, полный прежний контракт сохранён в связанном документе; контракт Stop, раздел ОС, матрица и evidence обновлены."
      ],
      "checks": [],
      "commitMessage": "feat(kimi): abort managed turns with idle confirmation",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M24-interface-polish.md",
          "required": true
        },
        {
          "path": "docs/design/M24-turn-interruption.md",
          "required": true
        },
        {
          "path": "docs/design/M24-browser-verification.md",
          "required": true
        }
      ],
      "dependencies": [
        "T003",
        "T008"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M24-acceptance.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/hooks.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/interrupt.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/client.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/interrupt.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/messages.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/turn-gate.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/turn-lock.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/client.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/fake-sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/interrupt.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/turn-gate.test.ts"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Stop Kimi: abort с подтверждением idle",
      "why": "Stop Kimi: abort с подтверждением idle"
    },
    {
      "acceptance": [
        "Раздел T005 M24-turn-interruption реализован после подтверждения локальной схемы turn/interrupt и turn/completed; цель — конкретный native turn id из хука/события/thread/read.",
        "Остановка подтверждается interrupted-событием либо терминальным состоянием именно этого id; естественное завершение даёт already-idle, а успешный пустой RPC не выдаётся за остановку.",
        "Проверены stale/поздние события, следующий ход, неподдерживаемое управление, ошибка и тайм-аут на существующих транспортах, включая Windows proxy; тред/демон не удаляются, общий доступ не меняется.",
        "Контракт, ОС-раздел, матрица и evidence обновлены; неподтверждённый обязательный протокол не объявлен выполненным."
      ],
      "checks": [],
      "commitMessage": "feat(codex): interrupt the expected active turn",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M24-interface-polish.md",
          "required": true
        },
        {
          "path": "docs/design/M24-turn-interruption.md",
          "required": true
        },
        {
          "path": "docs/design/M24-browser-verification.md",
          "required": true
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M24-acceptance.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/chat.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/interrupt.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/chat.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/interrupt.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/turn-snapshot.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fixtures/fake-proxy.mjs",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/interrupt-transport.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/interrupt-world.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/interrupt.test.ts"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Stop ChatGPT/Codex: прерывание конкретного native turn",
      "why": "Stop ChatGPT/Codex: прерывание конкретного native turn"
    },
    {
      "acceptance": [
        "Клиент Kimi сохраняет типизированное происхождение timeout/abort транспорта; Stop переводит его в ProviderError interrupt-timeout (504) независимо от сравнения часов, сетевые ошибки остаются 502.",
        "Регрессионные тесты детерминированно проверяют HTTP timeout до общего дедлайна и обыкновенный transport error; запрет replay abort, deadline и барьер сохранены.",
        "Контракты, матрица ОС и evidence обновлены; при достижении лимита evidence прежние разделы вынесены без потери текста в связанные документы M24."
      ],
      "checks": [],
      "commitMessage": "fix(kimi): preserve transport timeout classification",
      "confirmation": null,
      "context": [
        {
          "path": "docs/design/M24-turn-interruption.md",
          "required": true
        }
      ],
      "dependencies": [
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M24-acceptance.md",
        "docs/evidence/M24",
        "docs/evidence/M24/history-before-T009.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/interrupt.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/client.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/interrupt.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/client.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/interrupt.test.ts"
      ],
      "fixes": "T004",
      "id": "T009",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Надёжная классификация HTTP-тайм-аута Stop Kimi",
      "why": "Полная проверка T005 выявила: HTTP timeout Kimi иногда становится interrupt-failed до срабатывания проверки Date.now; необходим типизированный признак тайм-аута клиента, без зависимости от текста ошибки/гонки часов."
    },
    {
      "acceptance": [
        "Раздел 2.4 M24 реализован: компактный ввод, плюс, Enter/Stop, микрофон и строка параметров; модель читается напрямую из существующего state выбранной сессии без расширения panel-shell/view-model.js.",
        "Плюс/микрофон пока недоступны с пояснениями, параметры информационные; отсутствующие данные без выдуманных значений, обе темы и touch-targets сохранены.",
        "Holding/waiting показывают Enter, working — Stop; Ctrl/Cmd+Enter во время работы и touch-действие В очередь сохраняют доставку M18, ordinary Enter не нажимает Stop, локальный pending не выдаётся за working.",
        "IME/Safari compositionend → Enter и keyCode229 покрыты моделью; намеренный следующий Enter не теряется. Отправка защищена от дублей, ошибка/Stop сохраняют более новый черновик.",
        "Stop использует channel.interruptions T002 и адаптеры T003–T005: pending до подтверждения, stale автоматического продолжения обновляет цель без красной ошибки и скрытого повторного прерывания.",
        "Playwright MCP по M24-browser-verification проверил ввод и итоговую интеграцию на подставном API; evidence/скриншоты обновлены. Дефект завершённой задачи оформляется отдельным fixes-раундом.",
        "Автоматические проверки прошли; контракт/ОС-матрица обновлены; живые проверки macOS/iPad, Windows и CI Linux указаны отдельно."
      ],
      "checks": [],
      "commitMessage": "feat(chat): add compact composer with enter and stop controls",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M24-interface-polish.md",
          "required": true
        },
        {
          "path": "docs/design/M24-turn-interruption.md",
          "required": true
        },
        {
          "path": "docs/design/M24-browser-verification.md",
          "required": true
        }
      ],
      "dependencies": [
        "T005",
        "T009"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M24-acceptance.md",
        "docs/evidence/M24",
        "docs/evidence/M24/T006-browser-results.json",
        "docs/evidence/M24/T006-design-qa.md",
        "docs/evidence/M24/T006-desktop-dark-1920x1080.png",
        "docs/evidence/M24/T006-desktop-light-1280x800.png",
        "docs/evidence/M24/T006-landscape-light-768x400.png",
        "docs/evidence/M24/T006-mobile-dark-375x667.png",
        "docs/evidence/M24/T006-zoom-equivalent-640x400.png",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/LICENSE",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/circle.svg",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/corner-down-left.svg",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/mic.svg",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/plus.svg",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/square.svg",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/composer-model.test.ts"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Поле ввода по образцу, Enter/Stop и визуальная проверка",
      "why": "Поле ввода по образцу, Enter/Stop и визуальная проверка"
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
        "T008",
        "T004",
        "T005",
        "T009",
        "T006"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M24-interface-polish.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "product-parts/control-panel/clusters/web-panel/cluster.md",
        "docs/architecture/CONTRACTS.md",
        "docs/evidence/M24-acceptance.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/files.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/interrupt.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/sessions.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/hooks.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/interrupt.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md"
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
        "После отдельного подтверждения пользователя и DOCS штатным способом подготовлен и установлен локальный релиз 0.10.0; wfk doctor --installed подтверждает установку.",
        "Версия согласована в package.json, README.md, installation, OVERVIEW, usage и CHANGELOG/архиве; evidence содержит команды, результаты и SHA; живая приёмка не объявляется автоматически.",
        "Push не выполнялся; CI четырёх платформ до разрешённой публикации помечена не запускавшейся и подлежит проверке на опубликованном SHA."
      ],
      "checks": [],
      "commitMessage": "chore(release): install Workflow Kit 0.10.0 locally",
      "confirmation": "Подтверждаю",
      "context": [
        {
          "path": "docs/planning/M24-interface-polish.md",
          "required": true
        },
        {
          "path": "docs/design/M24-turn-interruption.md",
          "required": true
        },
        {
          "path": "docs/design/M24-browser-verification.md",
          "required": true
        }
      ],
      "dependencies": [
        "T006",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "README.md",
        "docs/installation.md",
        "docs/architecture/OVERVIEW.md",
        "docs/architecture/CONTRACTS.md",
        "docs/usage.md",
        "docs/planning/M24-interface-polish.md",
        "docs/changelog",
        "docs/evidence/M24-acceptance.md",
        "docs/installation",
        "docs/installation/development.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Локальная поставка Workflow Kit 0.10.0",
      "why": "Локальная поставка Workflow Kit 0.10.0"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m24-interface-polish (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 10/10
- Revision: 776

## Objective

Полировка интерфейса Workflow Kit: карточки и план слева, изменяемая ширина сайдбара, диалог в границах окна, ввод по образцу и действующий Enter/Stop.

## Acceptance

- План, вопросы, выбор, подтверждение выпуска, ревью и активность выбранной сессии находятся под деревом проектов и сессий слева, без копий справа и без изменения правил действий.
- Ширина левого сайдбара меняется мышью, touch и клавиатурой, ограничивается размерами окна и сохраняется на устройстве; узкий экран использует раскрываемый сайдбар.
- Ответвления дерева попадают в вертикальный центр карточек любой высоты; последнее скруглено и заканчивается на карточке, без хвоста вниз.
- Лента прокручивается внутри диалога; поле ввода, параметры и кнопки помещаются в доступную область на desktop и iPad, включая многострочный текст, ошибки и экранную клавиатуру.
- Ввод по второму скриншоту: плюс, текст, Enter/Stop, микрофон и фактические параметры; holding/waiting показывают Enter, working — Stop, прежняя очередь доступна Ctrl/Cmd+Enter и действием для touch.
- Stop прерывает текущий ответ управляемой сессии каждого из трёх провайдеров и удерживает автоматическое продолжение; неподдерживаемая сессия показывает причину, история и черновик сохраняются.
- Контракты, матрица ОС и доказательства обновлены; локальная поставка 0.10.0 подготовлена после подтверждения, без push; живые проверки и CI не приписаны локальным тестам.

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Сайдбар с планом, изменяемая ширина и диалог в области окна (work)
  - Commit: feat(panel): move workflow cards into a resizable sidebar
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell, product-parts/control-panel/clusters/web-panel/modules/session-view, docs/architecture/OVERVIEW.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, product-parts/control-panel/clusters/web-panel/cluster.md, docs/architecture/CONTRACTS.md, docs/evidence/M24-acceptance.md, docs/evidence/M24, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/chat-model.test.ts, docs/evidence/M24/T001-browser-results.json, docs/evidence/M24/T001-desktop-dark.png, docs/evidence/M24/T001-desktop-light.png, docs/evidence/M24/T001-mobile-dialog.png, docs/evidence/M24/T001-mobile-sidebar.png, product-parts/control-panel/clusters/web-panel/modules/panel-shell/files.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/index.html, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/layout-model.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/layout.css, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/panel-layout.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/session-screen.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/sidebar-slots.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/sidebar.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/slots.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/tree.css, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/viewport.css, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/layout-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.css, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/sidebar-view.js, product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts
- [DONE] T002 — Контракт прерывания ответа, API и барьер автопродолжения (work)
  - Commit: feat(session): add guarded turn interruption and continuation barrier
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/workflow-engine/clusters/session-loop/modules/cross-review, product-parts/backend-core/clusters/runtime/modules/cli, docs/architecture/CONTRACTS.md, docs/architecture/OVERVIEW.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/direct-message.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/turn-interruption.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/turn-interruption.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/interrupt.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/registry.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/detached.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/slots.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/turn-control.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/turn-state.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/types.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/turn-lifecycle.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/interrupt.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/interrupt.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/contract.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/texts.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/interruption.test.ts
  - Depends on: T001
- [DONE] T003 — Stop Claude: pty/ConPTY, диалоги и подтверждение (work)
  - Commit: feat(claude): interrupt managed turns with explicit confirmation
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, docs/architecture/OVERVIEW.md, docs/evidence/M24-acceptance.md, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host, tools/platform-guard/allowlist.json, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/interrupt.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/sessions.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/interrupt.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/programs.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-control.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-worker.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt.tcl, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/runtime.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/fixtures/fake-claude.mjs, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/interrupt-control.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/interrupt-host.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/interrupt.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/screen.ts, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/test/screen.test.ts
  - Depends on: T002
- [DONE] T008 — Корректная передача ошибок адаптера Stop в HTTP API (work)
  - Commit: fix(session): preserve adapter interruption timeouts
  - Files: product-parts/backend-core/clusters/runtime/modules/cli, docs/architecture/OVERVIEW.md, docs/evidence/M24-acceptance.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/turn-interruption.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/turn-interruption.test.ts
  - Depends on: T003
  - Fixes: T002
- [DONE] T004 — Stop Kimi: abort с подтверждением idle (work)
  - Commit: feat(kimi): abort managed turns with idle confirmation
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi, docs/architecture/OVERVIEW.md, docs/evidence/M24-acceptance.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/hooks.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/interrupt.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/client.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/interrupt.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/messages.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/turn-gate.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/turn-lock.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/client.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/fake-sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/interrupt.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/turn-gate.test.ts
  - Depends on: T003, T008
- [DONE] T005 — Stop ChatGPT/Codex: прерывание конкретного native turn (work)
  - Commit: feat(codex): interrupt the expected active turn
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, docs/architecture/OVERVIEW.md, docs/evidence/M24-acceptance.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/chat.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/interrupt.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/chat.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/interrupt.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/turn-snapshot.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fixtures/fake-proxy.mjs, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/interrupt-transport.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/interrupt-world.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/interrupt.test.ts
  - Depends on: T004
- [DONE] T009 — Надёжная классификация HTTP-тайм-аута Stop Kimi (work)
  - Commit: fix(kimi): preserve transport timeout classification
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi, docs/architecture/OVERVIEW.md, docs/evidence/M24-acceptance.md, docs/evidence/M24, docs/evidence/M24/history-before-T009.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/interrupt.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/client.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/interrupt.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/client.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/interrupt.test.ts
  - Depends on: T005
  - Fixes: T004
- [DONE] T006 — Поле ввода по образцу, Enter/Stop и визуальная проверка (work)
  - Commit: feat(chat): add compact composer with enter and stop controls
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat, docs/architecture/OVERVIEW.md, docs/evidence/M24-acceptance.md, docs/evidence/M24, docs/evidence/M24/T006-browser-results.json, docs/evidence/M24/T006-design-qa.md, docs/evidence/M24/T006-desktop-dark-1920x1080.png, docs/evidence/M24/T006-desktop-light-1280x800.png, docs/evidence/M24/T006-landscape-light-768x400.png, docs/evidence/M24/T006-mobile-dark-375x667.png, docs/evidence/M24/T006-zoom-equivalent-640x400.png, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer-model.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/LICENSE, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/circle.svg, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/corner-down-left.svg, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/mic.svg, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/plus.svg, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/square.svg, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/composer-model.test.ts
  - Depends on: T005, T009
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M24-interface-polish.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, product-parts/control-panel/clusters/web-panel/cluster.md, docs/architecture/CONTRACTS.md, docs/evidence/M24-acceptance.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/files.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/interrupt.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/sessions.md, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/hooks.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/interrupt.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md
  - Depends on: T001, T002, T003, T008, T004, T005, T009, T006
- [DONE] T007 — Локальная поставка Workflow Kit 0.10.0 (delivery)
  - Commit: chore(release): install Workflow Kit 0.10.0 locally
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/installation.md, docs/architecture/OVERVIEW.md, docs/architecture/CONTRACTS.md, docs/usage.md, docs/planning/M24-interface-polish.md, docs/changelog, docs/evidence/M24-acceptance.md, docs/installation, docs/installation/development.md
  - Depends on: T006, DOCS-R1

Digest: M24 реализована в исходниках: карточки слева, resize/drawer, диалог в viewport, компактный ввод и действующий Stop трёх провайдеров. Тесты и Chromium с fixtures прошли. Поставка 0.10.0 и живая приёмка впереди.

State changes only through `scripts/workflow` commands. History lives in Git.
