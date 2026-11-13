# M27: план нативных контролов Claude

Предложение к [спецификации](M27-claude-native-controls.md).
Рекомендован sequential: общий native host, очередь и зависимые контракты/DOM;
все work-задачи parallelSafe:false. T001 — proof/visual gate до реализации.
QUALITY/DOCS добавляет Kit; DOCS должен завершиться до доставки.
После scope:propose — перекрёстное ревью штатной панелью, затем выбор режима/старт.
Этот файл — снимок входа предложения; активный план меняют только scripts/workflow.

## Поведение на ОС

| macOS | Linux | Windows x64/ARM64 |
| --- | --- | --- |
| expect/Node, local probes и пользователь | expect/Node, CI | ConPTY/Node, CI и отдельный проверяющий |

## Вход scope:propose

```json
{
  "id": "m27-claude-native-controls",
  "objective": "Управлять моделью, усилием, скоростью и режимом доступа той же нативной беседы Claude из диалога Workflow Kit с родным интерфейсом и подтверждённым эффектом",
  "approval": "Пользователь: «А теперь давай разберемся и сделаем то же самое для Claude!»; в панели выбраны спецификация и план с ревью.",
  "spec": "docs/planning/M27-claude-native-controls.md",
  "acceptance": [
    "Доказаны native setters/read-back/persistence одной Claude-сессии и сохранены эталоны; без этого реализация не начинается.",
    "Модель/effort/fast/native mode меняются по доступности и политике; Ultracode отделён от effort; чужие defaults, история, ввод и процессы не меняются.",
    "Оформление и сценарии соответствуют Claude; обе темы, клавиатура/touch/настоящий thumb drag проверены, quiet success сохранён, visual QA passed.",
    "ChatGPT/Kimi и Stop/send/очередь/statusline/лимиты не регрессировали; контракты и матрица трёх ОС согласованы.",
    "0.13.0 установлена и проверена, CI точного SHA зелёная на macOS/Linux/Windows x64/ARM64; пользовательская приёмка отдельно."
  ],
  "context": [
    {
      "path": "docs/design/M27-claude-controls-facts.md",
      "required": false
    },
    {
      "path": "docs/design/M27-claude-control-contract.md",
      "required": false
    }
  ],
  "decisions": [
    "Спецификация и план с перекрёстным ревью, выполнение ещё не начинать.",
    "Эталон — Claude Code/Remote Control; модель и усилие действуют в выбранной беседе, не в её SDK-копии.",
    "T001 — обязательные native proof и PNG до кода; отсутствие доказательств блокирует дальнейшую реализацию.",
    "Plan — native permission mode, Ultracode — отдельная настройка; нет зелёного служебного подстрочника.",
    "Все work-задачи parallelSafe:false; рекомендовано последовательное выполнение.",
    "Локальная поставка, CI exact SHA, пользовательская приёмка/закрытие и main publication — отдельные этапы."
  ],
  "execution": {
    "strategy": "sequential",
    "maxWorkers": 1
  },
  "tasks": [
    {
      "id": "T001",
      "kind": "work",
      "title": "Доказать управление сессией Claude и зафиксировать нативные эталоны",
      "why": "Доказать управление сессией Claude и зафиксировать нативные эталоны",
      "commitMessage": "docs: verify Claude native parameter controls",
      "files": [
        "docs/planning/M27-claude-native-controls.md",
        "docs/design/M27-claude-controls-facts.md",
        "docs/design/M27-claude-control-contract.md",
        "docs/design/M27",
        "docs/evidence/M27-claude-native-controls.md",
        "docs/evidence/M27"
      ],
      "dependencies": [],
      "acceptance": [
        "На временных собственных native-сессиях заполнена таблица model/effort/fast/mode/видимого Ultracode: канал, каталоги, read-back, момент действия и область сохранения; та же local история, обратная смена из Claude.",
        "Есть PNG composer и всех меню, версия/тема/DPR и замеры; не полученный экран не подменён текстом docs. Нет эталона или основного session-local setter — конкретный блокер scope до T002.",
        "SDK streaming не выдан за attach к живому PTY; не изменены defaults/рабочие сессии/авторизация, нет платной генерации ради metadata; свои процессы и папки убраны.",
        "Выбран один доказанный native канал, обновлены факты, спецификация и контракт перед функциональным кодом."
      ],
      "parallelSafe": false,
      "context": [
        {
          "path": "docs/design/M27-claude-controls-facts.md",
          "required": true,
          "heading": "3. Обязательные доказательства T001"
        }
      ]
    },
    {
      "id": "T002",
      "kind": "work",
      "title": "Реализовать подтверждённый native control и арбитраж send/Stop",
      "why": "Реализовать подтверждённый native control и арбитраж send/Stop",
      "commitMessage": "feat(claude): add verified native parameter control",
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host",
        "tools/platform-guard/allowlist.json",
        "docs/design/M27-claude-control-contract.md",
        "docs/architecture/OVERVIEW.md",
        "docs/architecture/CONTRACTS.md",
        "docs/evidence/M27-claude-native-controls.md",
        "docs/evidence/M27"
      ],
      "dependencies": [
        "T001"
      ],
      "acceptance": [
        "Использован только канал, доказанный T001; запросы типизированы, UUID/epoch/deadline и read-back не допускают optimistic echo или повторной команды.",
        "Пустой idle проверяется перед записью; busy/черновик/диалог/unknown отказывают; команда не становится LLM-репликой и не меняет барьеры канала через hooks.",
        "Parameters/send/Stop используют один native арбитр; сообщение не теряется/не попадает в меню, Stop не нажимает Esc в чужом диалоге; сбой не делает kill/restart.",
        "Общий контроллер подключён к expect на macOS/Linux и ConPTY на Windows; injected linux/win32, concurrency и негативные сценарии проверены, контракты/allowlist/OS matrix обновлены."
      ],
      "parallelSafe": false,
      "context": [
        {
          "path": "docs/design/M27-claude-control-contract.md",
          "required": true,
          "heading": "2.5. Native control и конкурентность"
        }
      ]
    },
    {
      "id": "T003",
      "kind": "work",
      "title": "Подключить каталоги, эффективный state и HTTP изменения Claude",
      "why": "Подключить каталоги, эффективный state и HTTP изменения Claude",
      "commitMessage": "feat(parameters): expose effective Claude session controls",
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "docs/design/M27-claude-control-contract.md",
        "docs/architecture/OVERVIEW.md",
        "docs/architecture/CONTRACTS.md",
        "docs/evidence/M27-claude-native-controls.md",
        "docs/evidence/M27"
      ],
      "dependencies": [
        "T002"
      ],
      "acceptance": [
        "readParameters выдаёт фактические model/effort/fast/mode и отдельный Ultracode при наличии; GET не запускает программ/меню, stale и старые host дают честные причины.",
        "updateParameters меняет одно поле одной сессии, проверяет native доступность/confirmed, перечитывает весь набор и сохраняет unrelated поля/defaults; аудит effective old/new.",
        "Presentation union claude-controls обратно совместим с effort-card/access; обращения к access защищены layout guard, ultracode on/off валидируется и не принимается чужим провайдером.",
        "400/409/503/504 явно отображаются HTTP-слоем, ownership/очередь и busy/stale/timeout/запреты покрыты тестами; statusline wrapper, контракты и три ОС согласованы."
      ],
      "parallelSafe": false,
      "context": [
        {
          "path": "docs/design/M27-claude-control-contract.md",
          "required": true,
          "heading": "2.4. Общий контракт и HTTP"
        }
      ]
    },
    {
      "id": "T004",
      "kind": "work",
      "title": "Добавить нативные контролы Claude в composer",
      "why": "Добавить нативные контролы Claude в composer",
      "commitMessage": "feat(panel): add Claude native parameter controls",
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "docs/architecture/OVERVIEW.md",
        "docs/architecture/CONTRACTS.md",
        "docs/evidence/M27-claude-native-controls.md",
        "docs/evidence/M27"
      ],
      "dependencies": [
        "T003"
      ],
      "acceptance": [
        "Презентация выбирается по layout, PNG T001 задают геометрию и сценарии модели/усилия/скорости/доступа; Plan не дублируется независимым режимом, Ultracode не шестая точка.",
        "Один popup, причины недоступности/подтверждения/ошибки видны; quiet success без технических notes, контекст/лимиты и рабочий composer сохранены.",
        "Настоящий thumb drag, keyboard, touch44, visualViewport и переносы работают; polling/POST/stale не теряют draft/focus и не откатывают state.",
        "ChatGPT M26/R2 и Kimi fallback сохранены, общий ES/CSS для трёх ОС, контракты и OS matrix обновлены."
      ],
      "parallelSafe": false,
      "context": [
        {
          "path": "docs/planning/M27-claude-native-controls.md",
          "required": true,
          "heading": "2.3. Контролы в composer"
        }
      ]
    },
    {
      "id": "T005",
      "kind": "work",
      "title": "Проверить native round trip, браузерные сценарии и визуальное совпадение",
      "why": "Проверить native round trip, браузерные сценарии и визуальное совпадение",
      "commitMessage": "test(claude): verify native controls and visual fidelity",
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "design-qa.md",
        "docs/design/M27-claude-control-contract.md",
        "docs/architecture/OVERVIEW.md",
        "docs/architecture/CONTRACTS.md",
        "docs/evidence/M27-claude-native-controls.md",
        "docs/evidence/M27"
      ],
      "dependencies": [
        "T004"
      ],
      "acceptance": [
        "Доказаны запись/новый native state/обратная смена из Claude/следующий безопасный ход той же беседы; старые/external host и запреты не обходятся.",
        "Browser regression проверяет все поля, ошибки/подтверждения/quiet success, focus/draft, реальный drag из thumb центра до и после polling, cancel/выход за дорожку и touch.",
        "Обе темы, пять размеров, 200% CSS-эквивалент и клавиатура проверены; нативный PNG и рендер открыты совместно с нормализацией плотности, P0/P1/P2 исправлены, design-qa.md passed.",
        "Нет регрессий ChatGPT/Kimi/send/Stop/statusline/лимитов; полный профиль проверок прошёл, evidence и исполнители живой приёмки по ОС записаны честно."
      ],
      "parallelSafe": false,
      "context": [
        {
          "path": "docs/planning/M27-claude-native-controls.md",
          "required": true,
          "heading": "4. Проверка и критерии готовности"
        }
      ]
    },
    {
      "id": "T006",
      "kind": "delivery",
      "title": "Собрать и установить локальную поставку 0.13.0",
      "why": "Собрать и установить локальную поставку 0.13.0",
      "commitMessage": "chore(release): install Workflow Kit 0.13.0 locally",
      "files": [
        "package.json",
        "package-lock.json",
        "README.md",
        "CHANGELOG.md",
        "docs/usage.md",
        "docs/installation.md",
        "docs/changelog",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M27-claude-native-controls.md",
        "docs/evidence/M27"
      ],
      "dependencies": [
        "T005"
      ],
      "acceptance": [
        "После DOCS и подтверждения пользователя версии/CHANGELOG/руководства согласованы, штатная0.13.0 установлена и doctor installed ok; лимиты документов соблюдены без потери истории.",
        "Проверены настоящий API/панель и установленный ES/CSS, новый/возобновлённый управляемый host и read-only старого; рабочий Claude/ревьюер не перезапущен ради теста.",
        "Evidence содержит команды/результаты/границы, коммит T006 — SHA поставки; задача не делает push, CI ещё ожидается."
      ]
    },
    {
      "id": "T007",
      "kind": "delivery",
      "title": "Зафиксировать зелёную CI четырёх платформ на SHA поставки",
      "why": "Зафиксировать зелёную CI четырёх платформ на SHA поставки",
      "commitMessage": "docs: record green CI for Claude native controls",
      "files": [
        "docs/evidence/M27-claude-native-controls.md"
      ],
      "dependencies": [
        "T006"
      ],
      "acceptance": [
        "До task:start проверены headSha T006 и success macOS/Linux/Windows x64/ARM64; ci/m27-claude-native-controls отправлена вне задач по прямой команде пользователя.",
        "Записаны SHA/URL/четыре результата CI; нет функциональных изменений или push из задачи, пользовательская приёмка/закрытие отдельно."
      ]
    }
  ]
}
```
