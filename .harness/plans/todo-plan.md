# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": "T001",
  "lastClosed": {
    "closedAt": "2026-11-13T15:14:42.535Z",
    "scopeId": "m25-session-parameters"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 826,
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
        "docs/planning/M26-native-session-controls-plan.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "IN_PROGRESS",
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
        "docs/evidence/M26-native-controls.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
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
          "required": false
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M26-native-controls.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
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
          "required": false
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M26-native-controls.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
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
          "required": false
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
        "docs/evidence/M26"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
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
        "design-qa.md"
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
        "После DOCS и подтверждения пользователя версии согласованы, штатная 0.12.0 установлена; doctor installed и чтение параметров установленного API проходят.",
        "Браузер установленной панели проверен; результаты, команды и границы живой приёмки записаны; git push задача не выполняет.",
        "Коммит T006 является SHA поставки; до отдельной отправки ci/m26-native-session-controls CI отмечена ожидающей. Точный SHA и зелёный прогон фиксирует T007."
      ],
      "checks": [],
      "commitMessage": "chore(release): install Workflow Kit 0.12.0 locally",
      "confirmation": null,
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
        "docs/evidence/M26"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
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
      "confirmation": null,
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
      "status": "TODO",
      "title": "Зафиксировать CI четырёх платформ на SHA поставки",
      "why": "Поставка не готова к приёмке без проверки точного коммита на всех ОС"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m26-native-session-controls (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: T001
- Progress: 0/8
- Revision: 826

## Objective

Повторить нативный интерфейс и сценарий изменения модели, усилия, скорости и доступа ChatGPT в диалоге Workflow Kit

## Acceptance

- Компактная карточка усилия, вложенный выбор модели, скорость и отдельное меню доступа повторяют нативные эталоны; длинного общего списка нет.
- Все пресеты соответствуют доказанной нативной семантике, изменения действуют со следующего хода, полный доступ требует подтверждения; Kit не одобряет запросы собственной логикой.
- Обе темы, клавиатура и touch проверены; visual QA passed, контракты и OS-матрица согласованы; Claude/Kimi и рабочий ввод сохранены.
- Локальная 0.12.0 установлена, CI четырёх платформ зелёная на её SHA; живая проверка устройств и приёмка отмечены отдельно.

## Rounds

### R1 — Implementation (implementation, OPEN)

- [IN_PROGRESS] T001 — Проверить нативные пресеты, сброс и визуальные эталоны (work)
  - Commit: docs: verify native session control behavior
  - Files: docs/planning/M26-native-session-controls.md, docs/design/M26-native-controls-reference.md, docs/design/M26, docs/evidence/M26-native-controls.md, docs/evidence/M26, docs/planning/M26-native-session-controls-plan.md
- [TODO] T002 — Презентация контролов и настоящие пресеты доступа Codex (work)
  - Commit: feat(parameters): expose native control presentation and access presets
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, docs/architecture/CONTRACTS.md, docs/architecture/OVERVIEW.md, docs/evidence/M26-native-controls.md
  - Depends on: T001
- [TODO] T003 — Компактная карточка усилия, выбор модели и скорость (work)
  - Commit: feat(panel): add native effort card and model picker
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat, docs/architecture/OVERVIEW.md, docs/evidence/M26-native-controls.md
  - Depends on: T002
- [TODO] T004 — Нативное меню доступа и отдельные контролы в composer (work)
  - Commit: feat(panel): separate native access menu from effort controls
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat, docs/architecture/OVERVIEW.md, docs/evidence/M26-native-controls.md
  - Depends on: T003
- [TODO] T005 — Сравнить с эталонами и проверить сценарии в браузере (work)
  - Commit: test(panel): verify native controls against visual references
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat, design-qa.md, docs/architecture/OVERVIEW.md, docs/evidence/M26-native-controls.md, docs/evidence/M26
  - Depends on: T004
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M26-native-session-controls.md, docs/design/M26-native-controls-reference.md, docs/evidence/M26-native-controls.md, docs/architecture/CONTRACTS.md, design-qa.md
  - Depends on: T001, T002, T003, T004, T005
- [TODO] T006 — Установить локальную поставку 0.12.0 (delivery)
  - Commit: chore(release): install Workflow Kit 0.12.0 locally
  - Files: package.json, package-lock.json, README.md, CHANGELOG.md, docs/usage.md, docs/installation.md, docs/architecture/OVERVIEW.md, docs/changelog, docs/evidence/M26-native-controls.md, docs/evidence/M26
  - Depends on: T005, DOCS-R1
- [TODO] T007 — Зафиксировать CI четырёх платформ на SHA поставки (delivery)
  - Commit: docs: record green CI for native session controls
  - Files: docs/evidence/M26-native-controls.md
  - Depends on: T006, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
