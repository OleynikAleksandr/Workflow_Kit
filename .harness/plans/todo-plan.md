# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": "T009",
  "lastClosed": {
    "closedAt": "2026-11-13T15:14:42.535Z",
    "scopeId": "m25-session-parameters"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 855,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "SessionParameters.presentation: effort-card, speedHint, access; ParameterChange.access.",
          "POST access проверяет ограничения и confirmed; read-back по полному набору полей.",
          "Один POST на жест, preview/focus/draft сохраняются; desktop255×97, access644×162, touch44."
        ],
        "decisions": [
          "Сброс и Подробнее исключены; модели отдельным списком под вводом.",
          "Пресеты используют штатные policy/reviewer Codex, без одобрения силами Kit.",
          "Поставка 0.12.0 и CI точного SHA выполняются отдельно от живой приёмки."
        ],
        "references": [
          "docs/planning/M26-native-session-controls.md",
          "docs/design/M26/access-preset-contract.md",
          "docs/evidence/M26-native-controls.md",
          "design-qa.md"
        ],
        "result": "Реализованы нативные контролы ChatGPT, реальные пресеты доступа; визуальная и браузерная проверка passed."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "CLOSED",
      "title": "Implementation"
    },
    {
      "digest": {
        "contracts": [
          "Один POST на завершённый drag; cancel/lostcapture/blur/Esc не записывают.",
          "Polling не переписывает неизменённые max/disabled; preview и draft сохраняются."
        ],
        "decisions": [
          "Успех смены параметров молчит, ошибки видны.",
          "Захват thumb принадлежит native range; document listeners завершают жест вне дорожки.",
          "0.12.1 и CI точного SHA идут отдельно от пользовательской приёмки."
        ],
        "references": [
          "docs/planning/M26-native-session-controls.md",
          "docs/evidence/M26-native-controls.md",
          "design-qa.md",
          "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/native-controls.browser.js"
        ],
        "result": "Исправлены захват бегунка и служебный подстрочник; обязательные проверки и browser-регрессия прошли."
      },
      "id": "R2",
      "kind": "fixes",
      "status": "OPEN",
      "title": "Замечания пользователя: тихая смена параметров и drag бегунка"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "Компактная карточка усилия, вложенный выбор модели, скорость и отдельное меню доступа повторяют нативные эталоны; длинного общего списка нет.",
      "Все пресеты соответствуют доказанной нативной семантике, изменения действуют со следующего хода, полный доступ требует подтверждения; Kit не одобряет запросы собственной логикой.",
      "Обе темы, клавиатура и touch проверены; visual QA passed, контракты и OS-матрица согласованы; Claude/Kimi и рабочий ввод сохранены.",
      "Локальная 0.12.0 установлена, CI четырёх платформ зелёная на её SHA; живая проверка устройств и приёмка отмечены отдельно."
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-13T15:15:13.014Z",
      "text": "Пользователь: «Ты не мог бы повторить полностью то, как это сделано в родном десктопе?»; в панели выбраны спецификация и план без ревью. | Execution mode chosen by the user: sequential: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
    },
    "baselineCommit": "6f7c7ef5fdf5120354b457852f019aaa1fc89e76",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M26-native-session-controls.md",
        "heading": "Цель и согласование",
        "required": true
      },
      {
        "path": "docs/design/M26-native-controls-reference.md",
        "required": false
      }
    ],
    "decisions": [
      {
        "at": "2026-11-13T15:15:13.014Z",
        "text": "Визуальный эталон — два нативных PNG пользователя от 13.11.2026; без ревью."
      },
      {
        "at": "2026-11-13T15:15:13.014Z",
        "text": "Сначала проверка точной семантики доступа; при недоказанном соответствии scope блокируется."
      },
      {
        "at": "2026-11-13T15:15:13.014Z",
        "text": "Последовательное выполнение: общий контракт, общий DOM и одна установленная служба."
      },
      {
        "at": "2026-11-13T15:15:13.014Z",
        "text": "T006 локальная установка без push; T007 фиксирует зелёную CI SHA после отдельной отправки ветки вне задач."
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": "01a1d50b-6999-7022-81c9-9f604ceea169",
      "strategy": "sequential"
    },
    "id": "m26-native-session-controls",
    "objective": "Повторить нативный интерфейс и сценарий изменения модели, усилия, скорости и доступа ChatGPT в диалоге Workflow Kit",
    "spec": "docs/planning/M26-native-session-controls.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Три исходных PNG сохранены без изменений с SHA-256 и замерами Retina 2×; источники и состояния различены.",
        "Для трёх нативных пресетов зафиксированы проверенные RPC, read-back полного набора permissions/approval/reviewer, ограничения allowed и распознавание текущего состояния; рабочий чат не менялся.",
        "Зафиксированы отдельный список моделей под полем ввода и данные ускорения. Круговая стрелка и Подробнее исключены прямым указанием пользователя. При недоказанной полной семантике доступа записан исход и scope заблокирован, без ложных названий или самостоятельного одобрения запросов."
      ],
      "checks": [],
      "commitMessage": "docs: verify native session control behavior",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M26-native-session-controls.md",
          "heading": "2.1. Первый этап: зафиксировать соответствие нативному поведению",
          "required": true
        },
        {
          "path": "docs/design/M26-native-controls-reference.md",
          "required": false
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "docs/planning/M26-native-session-controls.md",
        "docs/design/M26-native-controls-reference.md",
        "docs/design/M26",
        "docs/evidence/M26-native-controls.md",
        "docs/evidence/M26",
        "docs/planning/M26-native-session-controls-plan.md",
        "docs/design/M26/access-preset-contract.md",
        "docs/design/M26/native-access-menu.png",
        "docs/design/M26/native-effort-card.png",
        "docs/design/M26/workflow-kit-before.png",
        "docs/evidence/M26/access-ephemeral-roundtrip.json",
        "docs/evidence/M26/access-fresh-connection.json",
        "docs/evidence/M26/access-persistent-roundtrip.json",
        "docs/evidence/M26/access-proof-unload-not-observed.json",
        "docs/evidence/M26/access-start-catalog-probe.json",
        "docs/evidence/M26/catalogs.json",
        "docs/evidence/M26/cleanup.json"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Проверить нативные пресеты, сброс и визуальные эталоны",
      "why": "Нативные варианты доступа не равны трём filesystem-профилям M25; полное соответствие нельзя выдумывать"
    },
    {
      "acceptance": [
        "Обратно совместимые presentation и access проверяются общим API; смешанный access/legacy permissions отклоняется; очередь и ownership сохранены.",
        "Codex формирует default усилия, speedHint и access по T001; пресет меняется штатным RPC, все затронутые настройки перечитываются, прочие поля и идущий ход сохраняются.",
        "Полный доступ требует confirmed true; запрещённые/неизвестные пресеты не отправляются; неизвестное сочетание не отмечается стандартным; legacy API и Claude/Kimi сохранены.",
        "Тесты injected darwin/linux/win32, контракты модулей, общие контракты и OS-матрица обновлены и проходят проверки."
      ],
      "checks": [],
      "commitMessage": "feat(parameters): expose native control presentation and access presets",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M26-native-session-controls.md",
          "heading": "2.6. Контракт и сервер",
          "required": true
        },
        {
          "path": "docs/design/M26-native-controls-reference.md",
          "required": false
        },
        {
          "path": "docs/design/M26/access-preset-contract.md",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M26-native-controls.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/parameters.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/parameter-access.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/parameter-update.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/parameters.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/access-harness.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/parameter-access.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/parameters.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/parameters.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameter-routes.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameters.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/parameters.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Презентация контролов и настоящие пресеты доступа Codex",
      "why": "Общий UI должен получить подписи и семантику от провайдера"
    },
    {
      "acceptance": [
        "Настольная карточка повторяет эталон 255×97 CSS px с согласованным исключением круговой стрелки: молния, усилие, модель и дискретный ползунок; общего списка всех секций нет.",
        "При нажатии названия модели появляется отдельный список под полем ввода, а не экран внутри карточки; поддерживаемые усилия идут из каталога; один POST на законченный жест/клавиатурное действие, отмена ничего не пишет.",
        "Скорость переключается молнией, подсказка показывает данные выбранной модели; обычный/плановый режим остаётся доступным в компактном разделе списка моделей.",
        "Неизвестные/недоступные значения не подменяются, partial catalog не блокирует рабочие контролы; unit tests, module contract и OS-матрица обновлены."
      ],
      "checks": [],
      "commitMessage": "feat(panel): add native effort card and model picker",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M26-native-session-controls.md",
          "heading": "2.3. Карточка усилия",
          "required": true
        },
        {
          "path": "docs/design/M26-native-controls-reference.md",
          "required": true
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M26-native-controls.md",
        "package.json",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/effort-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/effort-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/chevron-right.svg",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/effort-model.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Компактная карточка усилия, выбор модели и скорость",
      "why": "Заменить длинный список компактным нативным сценарием"
    },
    {
      "acceptance": [
        "Плашка доступа находится слева у плюса; кольцо/скорость/модель/усилие справа; разрешения не дублируются в правой строке.",
        "Меню повторяет вопрос, иконки, три пресета с описаниями и отметкой; Подробнее отсутствует; полный доступ оранжевый и требует явного подтверждения до POST.",
        "Поповеры помещаются в visualViewport; touch-цели минимум 44 px; клавиатура, focus, draft, polling и блокировка POST работают; legacy providers и Enter/Stop/очередь сохранены.",
        "Контракт модуля и OS-матрица обновлены вместе с кодом; проверки проходят."
      ],
      "checks": [],
      "commitMessage": "feat(panel): separate native access menu from effort controls",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M26-native-session-controls.md",
          "heading": "2.5. Доступ",
          "required": true
        },
        {
          "path": "docs/design/M26-native-controls-reference.md",
          "required": true
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M26-native-controls.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/access-menu.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/hand.svg",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/shield-alert.svg",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/shield-check.svg",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Нативное меню доступа и отдельные контролы в composer",
      "why": "Доступ должен быть виден отдельно от выбора модели и усилия"
    },
    {
      "acceptance": [
        "Эталон и рендер сравнены совместно в одинаковом состоянии/теме/DPR; design-qa.md фиксирует замеры, исправления P0/P1/P2 и final result: passed.",
        "В браузере проверены ползунок, точки, отдельный список моделей под вводом, скорость, доступ, подтверждение, отмена, режим, причины отказа, ошибки, draft/focus и stale; круговой стрелки и Подробнее нет; ошибок JavaScript нет.",
        "Проверены обе темы, 100 %/200 %, размеры 1920×1080,1280×800,1024×768,768×400,375×667; touch и экранная клавиатура эмулированы с честным указанием границ; overflow/обрезки нет.",
        "Артефакты и список живых проверок с исполнителями macOS/iPad, Windows и Linux CI записаны; при исправлении кода обновлены module contract и OS-матрица."
      ],
      "checks": [],
      "commitMessage": "test(panel): verify native controls against visual references",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M26-native-session-controls.md",
          "heading": "4. Проверка и критерии готовности",
          "required": true
        },
        {
          "path": "docs/design/M26-native-controls-reference.md",
          "required": true
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "design-qa.md",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M26-native-controls.md",
        "docs/evidence/M26",
        "docs/evidence/M26/access-before-qa.png",
        "docs/evidence/M26/access-dark.png",
        "docs/evidence/M26/access-light.png",
        "docs/evidence/M26/effort-before-qa.png",
        "docs/evidence/M26/effort-context.png",
        "docs/evidence/M26/effort-dark.png",
        "docs/evidence/M26/effort-light.png",
        "docs/evidence/M26/panel-dark-375.png",
        "docs/evidence/M26/panel-dark-768.png",
        "docs/evidence/M26/panel-dark.png",
        "docs/evidence/M26/panel-light-375.png",
        "docs/evidence/M26/panel-light-768.png",
        "docs/evidence/M26/touch-access.png",
        "docs/evidence/M26/touch-effort.png",
        "docs/evidence/M26/zoom-200-equivalent.png",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/effort-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/zap.svg",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Сравнить с эталонами и проверить сценарии в браузере",
      "why": "Наличие работающих кнопок не доказывает совпадение интерфейса"
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
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M26-native-session-controls.md",
        "docs/design/M26-native-controls-reference.md",
        "docs/evidence/M26-native-controls.md",
        "docs/architecture/CONTRACTS.md",
        "design-qa.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/parameters.md"
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
        "После DOCS и подтверждения пользователя версии согласованы, штатная 0.12.0 установлена; doctor installed и чтение параметров установленного API проходят.",
        "Браузер установленной панели проверен; результаты, команды и границы живой приёмки записаны; git push задача не выполняет.",
        "Коммит T006 является SHA поставки; до отдельной отправки ci/m26-native-session-controls CI отмечена ожидающей. Точный SHA и зелёный прогон фиксирует T007."
      ],
      "checks": [],
      "commitMessage": "chore(release): install Workflow Kit 0.12.0 locally",
      "confirmation": "Выполни весь план полностью, без паузы и собери, пожалуйста, новый релиз.",
      "context": [
        {
          "path": "docs/planning/M26-native-session-controls.md",
          "heading": "5. Границы и поставка",
          "required": true
        },
        {
          "path": "docs/design/M26-native-controls-reference.md",
          "required": false
        }
      ],
      "dependencies": [
        "T005",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "README.md",
        "CHANGELOG.md",
        "docs/usage.md",
        "docs/installation.md",
        "docs/architecture/OVERVIEW.md",
        "docs/changelog",
        "docs/evidence/M26-native-controls.md",
        "docs/evidence/M26",
        "docs/evidence/M26/installed-access.png",
        "docs/evidence/M26/installed-composer.png",
        "docs/evidence/M26/installed-effort.png",
        "docs/evidence/M26/installed-parameters.json",
        "docs/evidence/M26/local-delivery.md"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Установить локальную поставку 0.12.0",
      "why": "Проверить новую реализацию в установленной службе"
    },
    {
      "acceptance": [
        "До task:start проверены headSha и зелёные jobs macOS, Linux, Windows x64 и Windows ARM64; задача начинается с подтверждением пользователя.",
        "В доказательствах указан точный SHA T006, URL прогона и четыре результата; задача не меняет функциональные файлы и не выполняет git push.",
        "Ветка ci/m26-native-session-controls отправлена вне задач по прямой команде пользователя; пользовательская приёмка и закрытие не подменены CI."
      ],
      "checks": [],
      "commitMessage": "docs: record green CI for native session controls",
      "confirmation": "Выполни весь план полностью, без паузы и собери, пожалуйста, новый релиз.",
      "context": [
        {
          "path": "docs/planning/M26-native-session-controls.md",
          "heading": "5. Границы и поставка",
          "required": true
        },
        {
          "path": "docs/design/M26-native-controls-reference.md",
          "required": false
        }
      ],
      "dependencies": [
        "T006",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M26-native-controls.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Зафиксировать CI четырёх платформ на SHA поставки",
      "why": "Поставка не готова к приёмке без проверки точного коммита на всех ОС"
    },
    {
      "acceptance": [
        "Успешная смена параметров не выводит зелёный текст, policy/reviewer или прогресс под вводом; ошибки остаются видимыми.",
        "Можно схватить текущий бегунок мышью и вести в обе стороны; preview движется до отпускания, один POST после отпускания, Esc/pointercancel/lost capture ничего не записывают.",
        "Клики, клавиатура, touch, polling и draft сохранены; проверены именно drag от центра бегунка, обе темы и отключённые варианты; контракт/OS-матрица обновлены."
      ],
      "checks": [],
      "commitMessage": "fix(panel): support thumb dragging and silence parameter success notices",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M26-native-session-controls.md",
        "docs/evidence/M26-native-controls.md",
        "docs/evidence/M26",
        "design-qa.md",
        "docs/evidence/M26/fixes-composer-touch.png",
        "docs/evidence/M26/fixes-composer.png",
        "docs/evidence/M26/user-fixes-reference.png",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/parameters.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/effort-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/native-controls.browser.js"
      ],
      "fixes": "T003",
      "id": "T008",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "DONE",
      "title": "Убрать служебный подстрочник и исправить захват бегунка",
      "why": "Убрать служебный подстрочник и исправить захват бегунка"
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
        "T008"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M26-native-session-controls.md",
        "docs/evidence/M26-native-controls.md",
        "design-qa.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/parameters.md"
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
        "Версии и руководства согласованы, штатная 0.12.1 установлена, doctor installed и реальная панель/API проверены.",
        "Сохранены результаты проверки; коммит T009 — SHA поставки; push выполняется вне задач."
      ],
      "checks": [],
      "commitMessage": "chore(release): install Workflow Kit 0.12.1",
      "confirmation": "Выполни весь план полностью, без паузы и собери, пожалуйста, новый релиз; исправь оба замечания пользователя.",
      "context": [],
      "dependencies": [
        "T008",
        "DOCS-R2"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "README.md",
        "CHANGELOG.md",
        "docs/usage.md",
        "docs/installation.md",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M26-native-controls.md",
        "docs/evidence/M26",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/native-controls.browser.js"
      ],
      "fixes": null,
      "id": "T009",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R2",
      "status": "IN_PROGRESS",
      "title": "Собрать и установить исправления 0.12.1",
      "why": "Собрать и установить исправления 0.12.1"
    },
    {
      "acceptance": [
        "До старта задачи проверены точный SHA T009 и четыре успешных jobs macOS/Linux/Windows x64/ARM64.",
        "Записаны SHA и URL CI; задача не выполняет push и не подменяет пользовательскую приёмку."
      ],
      "checks": [],
      "commitMessage": "docs: record green CI for native controls fixes",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T009",
        "DOCS-R2"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M26-native-controls.md"
      ],
      "fixes": null,
      "id": "T010",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R2",
      "status": "TODO",
      "title": "Зафиксировать CI исправлений на четырёх платформах",
      "why": "Зафиксировать CI исправлений на четырёх платформах"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m26-native-session-controls (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: T009
- Progress: 10/12
- Revision: 855

## Objective

Повторить нативный интерфейс и сценарий изменения модели, усилия, скорости и доступа ChatGPT в диалоге Workflow Kit

## Acceptance

- Компактная карточка усилия, вложенный выбор модели, скорость и отдельное меню доступа повторяют нативные эталоны; длинного общего списка нет.
- Все пресеты соответствуют доказанной нативной семантике, изменения действуют со следующего хода, полный доступ требует подтверждения; Kit не одобряет запросы собственной логикой.
- Обе темы, клавиатура и touch проверены; visual QA passed, контракты и OS-матрица согласованы; Claude/Kimi и рабочий ввод сохранены.
- Локальная 0.12.0 установлена, CI четырёх платформ зелёная на её SHA; живая проверка устройств и приёмка отмечены отдельно.

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Проверить нативные пресеты, сброс и визуальные эталоны (work)
  - Commit: docs: verify native session control behavior
  - Files: docs/planning/M26-native-session-controls.md, docs/design/M26-native-controls-reference.md, docs/design/M26, docs/evidence/M26-native-controls.md, docs/evidence/M26, docs/planning/M26-native-session-controls-plan.md, docs/design/M26/access-preset-contract.md, docs/design/M26/native-access-menu.png, docs/design/M26/native-effort-card.png, docs/design/M26/workflow-kit-before.png, docs/evidence/M26/access-ephemeral-roundtrip.json, docs/evidence/M26/access-fresh-connection.json, docs/evidence/M26/access-persistent-roundtrip.json, docs/evidence/M26/access-proof-unload-not-observed.json, docs/evidence/M26/access-start-catalog-probe.json, docs/evidence/M26/catalogs.json, docs/evidence/M26/cleanup.json
- [DONE] T002 — Презентация контролов и настоящие пресеты доступа Codex (work)
  - Commit: feat(parameters): expose native control presentation and access presets
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, docs/architecture/CONTRACTS.md, docs/architecture/OVERVIEW.md, docs/evidence/M26-native-controls.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/parameters.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/parameter-access.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/parameter-update.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/parameters.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/access-harness.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/parameter-access.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/parameters.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/parameters.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameter-routes.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameters.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/parameters.test.ts
  - Depends on: T001
- [DONE] T003 — Компактная карточка усилия, выбор модели и скорость (work)
  - Commit: feat(panel): add native effort card and model picker
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat, docs/architecture/OVERVIEW.md, docs/evidence/M26-native-controls.md, package.json, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/effort-card.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/effort-model.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/chevron-right.svg, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.css, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/effort-model.test.ts
  - Depends on: T002
- [DONE] T004 — Нативное меню доступа и отдельные контролы в composer (work)
  - Commit: feat(panel): separate native access menu from effort controls
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat, docs/architecture/OVERVIEW.md, docs/evidence/M26-native-controls.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/access-menu.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/hand.svg, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/shield-alert.svg, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/shield-check.svg, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.css, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js
  - Depends on: T003
- [DONE] T005 — Сравнить с эталонами и проверить сценарии в браузере (work)
  - Commit: test(panel): verify native controls against visual references
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat, design-qa.md, docs/architecture/OVERVIEW.md, docs/evidence/M26-native-controls.md, docs/evidence/M26, docs/evidence/M26/access-before-qa.png, docs/evidence/M26/access-dark.png, docs/evidence/M26/access-light.png, docs/evidence/M26/effort-before-qa.png, docs/evidence/M26/effort-context.png, docs/evidence/M26/effort-dark.png, docs/evidence/M26/effort-light.png, docs/evidence/M26/panel-dark-375.png, docs/evidence/M26/panel-dark-768.png, docs/evidence/M26/panel-dark.png, docs/evidence/M26/panel-light-375.png, docs/evidence/M26/panel-light-768.png, docs/evidence/M26/touch-access.png, docs/evidence/M26/touch-effort.png, docs/evidence/M26/zoom-200-equivalent.png, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/effort-card.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/zap.svg, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.css, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js
  - Depends on: T004
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M26-native-session-controls.md, docs/design/M26-native-controls-reference.md, docs/evidence/M26-native-controls.md, docs/architecture/CONTRACTS.md, design-qa.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/parameters.md
  - Depends on: T001, T002, T003, T004, T005
- [DONE] T006 — Установить локальную поставку 0.12.0 (delivery)
  - Commit: chore(release): install Workflow Kit 0.12.0 locally
  - Files: package.json, package-lock.json, README.md, CHANGELOG.md, docs/usage.md, docs/installation.md, docs/architecture/OVERVIEW.md, docs/changelog, docs/evidence/M26-native-controls.md, docs/evidence/M26, docs/evidence/M26/installed-access.png, docs/evidence/M26/installed-composer.png, docs/evidence/M26/installed-effort.png, docs/evidence/M26/installed-parameters.json, docs/evidence/M26/local-delivery.md
  - Depends on: T005, DOCS-R1
- [DONE] T007 — Зафиксировать CI четырёх платформ на SHA поставки (delivery)
  - Commit: docs: record green CI for native session controls
  - Files: docs/evidence/M26-native-controls.md
  - Depends on: T006, DOCS-R1

Digest: Реализованы нативные контролы ChatGPT, реальные пресеты доступа; визуальная и браузерная проверка passed.

### R2 — Замечания пользователя: тихая смена параметров и drag бегунка (fixes, OPEN)

- [DONE] T008 — Убрать служебный подстрочник и исправить захват бегунка (work)
  - Commit: fix(panel): support thumb dragging and silence parameter success notices
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat, docs/architecture/OVERVIEW.md, docs/planning/M26-native-session-controls.md, docs/evidence/M26-native-controls.md, docs/evidence/M26, design-qa.md, docs/evidence/M26/fixes-composer-touch.png, docs/evidence/M26/fixes-composer.png, docs/evidence/M26/user-fixes-reference.png, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/parameters.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/effort-card.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/native-controls.browser.js
  - Fixes: T003
- [DONE] DOCS-R2 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R2
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M26-native-session-controls.md, docs/evidence/M26-native-controls.md, design-qa.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/parameters.md
  - Depends on: T008
- [IN_PROGRESS] T009 — Собрать и установить исправления 0.12.1 (delivery)
  - Commit: chore(release): install Workflow Kit 0.12.1
  - Files: package.json, package-lock.json, README.md, CHANGELOG.md, docs/usage.md, docs/installation.md, docs/architecture/OVERVIEW.md, docs/evidence/M26-native-controls.md, docs/evidence/M26, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/native-controls.browser.js
  - Depends on: T008, DOCS-R2
- [TODO] T010 — Зафиксировать CI исправлений на четырёх платформах (delivery)
  - Commit: docs: record green CI for native controls fixes
  - Files: docs/evidence/M26-native-controls.md
  - Depends on: T009, DOCS-R2

Digest: Исправлены захват бегунка и служебный подстрочник; обязательные проверки и browser-регрессия прошли.

State changes only through `scripts/workflow` commands. History lives in Git.
