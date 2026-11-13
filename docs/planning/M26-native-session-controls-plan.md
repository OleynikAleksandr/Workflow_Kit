# M26: вход предложения плана

Спецификация — [M26-native-session-controls.md](M26-native-session-controls.md).
Рекомендация: последовательно; семь задач, DOCS добавляет Kit. Ревью не запрошено.

Первый scope:propose вернул SCOPE_EXISTS из-за открытого M25. Пользователь затем
поручил закрыть предыдущий план и открыть новый для обсуждённого рефакторинга.

## Вход scope:propose

Содержимое блока передаётся командой через --input; это исходник предложения,
а не ручное изменение управляемого плана.

```json
{
  "id": "m26-native-session-controls",
  "objective": "Повторить нативный интерфейс и сценарий изменения модели, усилия, скорости и доступа ChatGPT в диалоге Workflow Kit",
  "spec": "docs/planning/M26-native-session-controls.md",
  "approval": "Пользователь: «Ты не мог бы повторить полностью то, как это сделано в родном десктопе?»; в панели выбраны спецификация и план без ревью.",
  "acceptance": [
    "Компактная карточка усилия, вложенный выбор модели, скорость и отдельное меню доступа повторяют нативные эталоны; длинного общего списка нет.",
    "Все пресеты соответствуют доказанной нативной семантике, изменения действуют со следующего хода, полный доступ требует подтверждения; Kit не одобряет запросы собственной логикой.",
    "Обе темы, клавиатура и touch проверены; visual QA passed, контракты и OS-матрица согласованы; Claude/Kimi и рабочий ввод сохранены.",
    "Локальная 0.12.0 установлена, CI четырёх платформ зелёная на её SHA; живая проверка устройств и приёмка отмечены отдельно."
  ],
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
    "Визуальный эталон — два нативных PNG пользователя от 13.11.2026; без ревью.",
    "Сначала проверка точной семантики доступа; при недоказанном соответствии scope блокируется.",
    "Последовательное выполнение: общий контракт, общий DOM и одна установленная служба.",
    "T006 локальная установка без push; T007 фиксирует зелёную CI SHA после отдельной отправки ветки вне задач."
  ],
  "execution": {
    "strategy": "sequential",
    "maxWorkers": 1
  },
  "tasks": [
    {
      "id": "T001",
      "title": "Проверить нативные пресеты, сброс и визуальные эталоны",
      "why": "Нативные варианты доступа не равны трём filesystem-профилям M25; полное соответствие нельзя выдумывать",
      "files": [
        "docs/planning/M26-native-session-controls.md",
        "docs/design/M26-native-controls-reference.md",
        "docs/design/M26",
        "docs/evidence/M26-native-controls.md",
        "docs/evidence/M26"
      ],
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
      "acceptance": [
        "Три исходных PNG сохранены без изменений с SHA-256 и замерами Retina 2×; источники и состояния различены.",
        "Для трёх нативных пресетов зафиксированы проверенные RPC, read-back полного набора permissions/approval/reviewer, ограничения allowed и распознавание текущего состояния; рабочий чат не менялся.",
        "Проверены сброс усилия, вложенный выбор модели, цель Подробнее и данные ускорения. При недоказанной полной семантике доступа записан исход и scope заблокирован, без ложных названий или самостоятельного одобрения запросов."
      ],
      "commitMessage": "docs: verify native session control behavior",
      "parallelSafe": false
    },
    {
      "id": "T002",
      "title": "Презентация контролов и настоящие пресеты доступа Codex",
      "why": "Общий UI должен получить подписи и семантику от провайдера",
      "files": [
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M26-native-controls.md"
      ],
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
      "acceptance": [
        "Обратно совместимые presentation и access проверяются общим API; смешанный access/legacy permissions отклоняется; очередь и ownership сохранены.",
        "Codex формирует default усилия, speedHint и access по T001; пресет меняется штатным RPC, все затронутые настройки перечитываются, прочие поля и идущий ход сохраняются.",
        "Полный доступ требует confirmed true; запрещённые/неизвестные пресеты не отправляются; неизвестное сочетание не отмечается стандартным; legacy API и Claude/Kimi сохранены.",
        "Тесты injected darwin/linux/win32, контракты модулей, общие контракты и OS-матрица обновлены и проходят проверки."
      ],
      "commitMessage": "feat(parameters): expose native control presentation and access presets",
      "parallelSafe": false,
      "dependencies": [
        "T001"
      ]
    },
    {
      "id": "T003",
      "title": "Компактная карточка усилия, модель, скорость и сброс",
      "why": "Заменить длинный список компактным нативным сценарием",
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M26-native-controls.md"
      ],
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
      "acceptance": [
        "Настольная карточка повторяет эталон 255×97 CSS px: молния, усилие, сброс, модель и дискретный ползунок; общего списка всех секций нет.",
        "Модель выбирается во вложенном экране с возвратом; усилия и default идут из каталога; один POST на законченный жест/клавиатурное действие, отмена ничего не пишет.",
        "Скорость переключается молнией, подсказка показывает данные выбранной модели; обычный/плановый режим остаётся доступным в компактном вложенном разделе.",
        "Неизвестные/недоступные значения не подменяются, partial catalog не блокирует рабочие контролы; unit tests, module contract и OS-матрица обновлены."
      ],
      "commitMessage": "feat(panel): add native effort card and model picker",
      "parallelSafe": false,
      "dependencies": [
        "T002"
      ]
    },
    {
      "id": "T004",
      "title": "Нативное меню доступа и отдельные контролы в composer",
      "why": "Доступ должен быть виден отдельно от выбора модели и усилия",
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M26-native-controls.md"
      ],
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
      "acceptance": [
        "Плашка доступа находится слева у плюса; кольцо/скорость/модель/усилие справа; разрешения не дублируются в правой строке.",
        "Меню повторяет вопрос, Подробнее, иконки, три пресета с описаниями и отметкой; полный доступ оранжевый и требует явного подтверждения до POST.",
        "Поповеры помещаются в visualViewport; touch-цели минимум 44 px; клавиатура, focus, draft, polling и блокировка POST работают; legacy providers и Enter/Stop/очередь сохранены.",
        "Контракт модуля и OS-матрица обновлены вместе с кодом; проверки проходят."
      ],
      "commitMessage": "feat(panel): separate native access menu from effort controls",
      "parallelSafe": false,
      "dependencies": [
        "T003"
      ]
    },
    {
      "id": "T005",
      "title": "Сравнить с эталонами и проверить сценарии в браузере",
      "why": "Наличие работающих кнопок не доказывает совпадение интерфейса",
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "design-qa.md",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M26-native-controls.md",
        "docs/evidence/M26"
      ],
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
      "acceptance": [
        "Эталон и рендер сравнены совместно в одинаковом состоянии/теме/DPR; design-qa.md фиксирует замеры, исправления P0/P1/P2 и final result: passed.",
        "В браузере проверены реальные ползунок, точки, сброс, вложенная модель, скорость, доступ, подтверждение, отмена, режим, причины отказа, ошибки, draft/focus и stale; ошибок JavaScript нет.",
        "Проверены обе темы, 100 %/200 %, размеры 1920×1080,1280×800,1024×768,768×400,375×667; touch и экранная клавиатура эмулированы с честным указанием границ; overflow/обрезки нет.",
        "Артефакты и список живых проверок с исполнителями macOS/iPad, Windows и Linux CI записаны; при исправлении кода обновлены module contract и OS-матрица."
      ],
      "commitMessage": "test(panel): verify native controls against visual references",
      "parallelSafe": false,
      "dependencies": [
        "T004"
      ]
    },
    {
      "id": "T006",
      "kind": "delivery",
      "title": "Установить локальную поставку 0.12.0",
      "why": "Проверить новую реализацию в установленной службе",
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
      "acceptance": [
        "После DOCS и подтверждения пользователя версии согласованы, штатная 0.12.0 установлена; doctor installed и чтение параметров установленного API проходят.",
        "Браузер установленной панели проверен; результаты, команды и границы живой приёмки записаны; git push задача не выполняет.",
        "Коммит T006 является SHA поставки; до отдельной отправки ci/m26-native-session-controls CI отмечена ожидающей. Точный SHA и зелёный прогон фиксирует T007."
      ],
      "commitMessage": "chore(release): install Workflow Kit 0.12.0 locally",
      "dependencies": [
        "T005"
      ]
    },
    {
      "id": "T007",
      "kind": "delivery",
      "title": "Зафиксировать CI четырёх платформ на SHA поставки",
      "why": "Поставка не готова к приёмке без проверки точного коммита на всех ОС",
      "files": [
        "docs/evidence/M26-native-controls.md"
      ],
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
      "acceptance": [
        "До task:start проверены headSha и зелёные jobs macOS, Linux, Windows x64 и Windows ARM64; задача начинается с подтверждением пользователя.",
        "В доказательствах указан точный SHA T006, URL прогона и четыре результата; задача не меняет функциональные файлы и не выполняет git push.",
        "Ветка ci/m26-native-session-controls отправлена вне задач по прямой команде пользователя; пользовательская приёмка и закрытие не подменены CI."
      ],
      "commitMessage": "docs: record green CI for native session controls",
      "dependencies": [
        "T006"
      ]
    }
  ]
}
```
