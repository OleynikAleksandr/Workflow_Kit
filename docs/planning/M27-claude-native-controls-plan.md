# M27: план нативных контролов Claude

Вторая редакция после REVIEW: CHANGES, круг1. Спецификация —
[M27](M27-claude-native-controls.md), приложения обязательны в соответствующих required contexts.
Sequential/maxWorkers1, все work parallelSafe:false. T001 BLOCKED не коммитится,
автопилот останавливает task:block. T002 refactor send/Stop, T003 setters/hooks.
Kit добавляет DOCS между T006 и T007; DOCS полностью перечитывает README.

## Поведение на ОС

| macOS | Linux | Windows x64/ARM64 |
| --- | --- | --- |
| expect/Node, probes и пользователь | expect/Node, CI | ConPTY/Node, CI; live проверяющий отдельно |

## Вход scope:propose

```json
{
  "id": "m27-claude-native-controls",
  "objective": "Управлять моделью, усилием, скоростью и режимом доступа той же нативной беседы Claude из диалога Workflow Kit с родным интерфейсом и подтверждённым эффектом",
  "approval": "Пользователь: «А теперь давай разберемся и сделаем то же самое для Claude!»; в панели выбраны спецификация и план с ревью.",
  "spec": "docs/planning/M27-claude-native-controls.md",
  "acceptance": [
    "T001 доказала session-local model И effort и все native-доступные опции; таблица/хуки/эталон заполнены. Иначе task:block без commit T001; урезание scope только по решению пользователя.",
    "Модель/effort/fast/mode и представление ultra/Ultracode соответствуют доказательствам T001; native запреты не обходятся, остальные сессии/defaults/история/ввод сохраняются.",
    "Controls соответствуют тёмному RC-эталону Claude Desktop; light проверена по токенам, обе темы/раскладка/keyboard/touch/thumb drag и quiet success проверены, visual QA passed без заявления неподтверждённой светлой pixel fidelity.",
    "ChatGPT/Kimi и Stop/send/очередь/statusline/лимиты не регрессировали; контракты и матрица трёх ОС согласованы.",
    "0.13.0 установлена и проверена, CI точного SHA зелёная на macOS/Linux/Windows x64/ARM64; пользовательская приёмка отдельно."
  ],
  "context": [
    {
      "path": "docs/design/M27-claude-controls-facts.md",
      "required": true,
      "heading": "4. Таблица управления (заполняет T001)"
    },
    {
      "path": "docs/design/M27-claude-control-contract.md",
      "required": true,
      "heading": "Обязательные гарантии"
    }
  ],
  "decisions": [
    "Спецификация и план с ревью; задачи не запускать до решения панели.",
    "Session-local model И effort обязательны; native-доступный speed/mode/Ultracode без доказанного канала — блокер, не отключаемая недоработка.",
    "При блокере T001: task:block без commit; продолжение после устранения пользователем и task:unblock либо согласованного пересмотра.",
    "T001 сначала проверяет канал/defaults/hooks в штатном временном Kit-проекте, потом запрашивает ручные PNG/обратную смену; scoped trust и cleanup явно разрешены только ему.",
    "Первичный визуальный эталон — тёмное Remote Control-представление тестовой беседы в Claude Desktop Code; светлая тема без PNG проверяется только по токенам.",
    "Ultracode/raw ultra/base effort и UI устанавливает T001; не подменять наблюдение предположением о шестой позиции или boolean.",
    "T002 только переносит send/Stop под общий арбитр без изменения поведения, T003 добавляет setter и защищённую корреляцию hooks.",
    "Все обязательные контексты имеют required:true; DOCS полностью перечитывает README и сверяет README/setup/usage/installation.",
    "Бюджет inference: максимум 2 Sonnet fast=false хода T001 и 2 суммарно T006/T007, включая bootstrap; требуется прямое применимое разрешение пользователя, metadata fast без генерации.",
    "Допуск по минимальной версии и распознанным capabilities/frame, не точному 2.1.323; неизвестная форма отказывает. Windows CI отдельно от живой приёмки.",
    "Все work parallelSafe:false, sequential/maxWorkers1; local delivery, CI exact SHA, приёмка/закрытие и main publication разделены."
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
      "commitMessage": "docs: verify Claude native parameter controls",
      "files": [
        "docs/planning/M27-claude-native-controls.md",
        "docs/design/M27-claude-controls-facts.md",
        "docs/design/M27-claude-control-contract.md",
        "docs/design/M27",
        "docs/evidence/M27-claude-native-controls.md",
        "docs/evidence/M27",
        "docs/design/M27/claude-visual-reference.md"
      ],
      "dependencies": [],
      "acceptance": [
        "Сначала дешёвые probes model И effort и всех native-доступных опций: та же session-local история, native read-back/persistence, capability floor/signature и raw ultra/base effort; модель/effort обязаны PASS, остальные PASS либо доказанное NATIVE_UNAVAILABLE.",
        "Любой BLOCKED/PENDING обязательной строки или противоречие native UI/state: task:block --reason без commit T001; продолжение только после решения пользователя и task:unblock либо пересмотра scope.",
        "Пробы через public provider.createSession/startSessionProcess в уникальном Kit-проекте с настоящими hooks, expect/ConPTY, --settings и Remote Control; записаны реальные hooks каждой команды и эффект на sentinel queue/autopilot.",
        "Допустимы штатные trust/hooks только пробного проекта; archive/stop/purge убирают собственные локальные данные/trust/process. Серверные RC-карточки архивируются отдельно нативно с подтверждением; чужие записи/defaults/авторизация не меняются.",
        "После канального proof получены composer/model/effort/fast/mode/disabled dark PNG основной RC-поверхности с версиями/DPR/замерами; при недоступном read-only захвате нужны действия пользователя и несколько ходов. Light без PNG только token QA.",
        "Заполнены адресуемые facts §4/§5 и visual contract, включая ultra и minimum-version+signature. Inference только по facts §6: Sonnet fast=false, максимум2 хода с bootstrap и применимым прямым согласием; нет платной fast/Fable генерации."
      ],
      "parallelSafe": false,
      "context": [
        {
          "path": "docs/design/M27-claude-controls-facts.md",
          "required": true
        },
        {
          "path": "docs/design/M27/claude-visual-reference.md",
          "required": true,
          "heading": "Визуальный контракт (заполняет T001)"
        },
        {
          "path": "docs/design/M27-claude-control-contract.md",
          "required": true,
          "heading": "Обязательные гарантии"
        }
      ]
    },
    {
      "id": "T002",
      "kind": "work",
      "title": "Объединить существующие send и Stop общим арбитром",
      "commitMessage": "refactor(claude): share native send and interrupt arbitration",
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host",
        "docs/design/M27-claude-control-contract.md",
        "docs/architecture/OVERVIEW.md",
        "docs/architecture/CONTRACTS.md",
        "docs/evidence/M27-claude-native-controls.md",
        "docs/evidence/M27"
      ],
      "dependencies": [
        "T001"
      ],
      "parallelSafe": false,
      "context": [
        {
          "path": "docs/design/M27-claude-controls-facts.md",
          "required": true,
          "heading": "4. Таблица управления (заполняет T001)"
        },
        {
          "path": "docs/design/M27-claude-control-contract.md",
          "required": true,
          "heading": "2.5. Native control и конкурентность"
        }
      ],
      "acceptance": [
        "Единый арбитр существующего native host управляет send/Stop; новых parameter setters и изменений пользовательского поведения в этой задаче нет.",
        "Существующие interrupt*/direct тесты проходят без ослабления assertions, deadlines и гарантий; race send/Stop не теряет, не дублирует сообщение и не нарушает барьер.",
        "Проверены expect macOS/Linux и ConPTY injected win32, отмена/выход/ошибки host; контракты/OS matrix обновлены."
      ]
    },
    {
      "id": "T003",
      "kind": "work",
      "title": "Добавить native setters и корреляцию служебных hooks",
      "commitMessage": "feat(claude): add verified native parameter transactions",
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host",
        "tools/platform-guard/allowlist.json",
        "docs/design/M27-claude-control-contract.md",
        "docs/architecture/OVERVIEW.md",
        "docs/architecture/CONTRACTS.md",
        "docs/evidence/M27-claude-native-controls.md",
        "docs/evidence/M27",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/backend-core/clusters/runtime/modules/cli"
      ],
      "dependencies": [
        "T002"
      ],
      "acceptance": [
        "Только канал T001, UUID/session/epoch/deadline и независимый native read-back; minimum-version+совместимая сигнатура допускают новый patch, неизвестная форма/старый floor отказывают.",
        "До записи подтверждены пустой idle и отсутствие чужого диалога/транзакции; busy/draft/stale/unknown отказывают, нет LLM-подмены, kill/restart или retries.",
        "Для реально наблюдённых T001 hooks введена проверенная корреляция pending control, не только префикс prompt. Не вызываются beginTurn/autopilot, не забираются queue/ack и не снимается барьер; похожая обычная реплика не получает привилегию.",
        "Sentinel сообщение, поставленное до/во время control, сохраняется и после операции доставляется ровно один раз. Race parameters/send/Stop и interrupt*/direct тесты проходят без ослабления.",
        "Общий контроллер работает через expect macOS/Linux и ConPTY Windows, injected linux/win32 и ошибки покрыты, source invariants/hooks/backend contract/allowlist/OS matrix согласованы."
      ],
      "parallelSafe": false,
      "context": [
        {
          "path": "docs/design/M27-claude-controls-facts.md",
          "required": true,
          "heading": "4. Таблица управления (заполняет T001)"
        },
        {
          "path": "docs/design/M27-claude-control-contract.md",
          "required": true,
          "heading": "2.5. Native control и конкурентность"
        }
      ]
    },
    {
      "id": "T004",
      "kind": "work",
      "title": "Подключить каталоги, эффективный state и HTTP изменения Claude",
      "commitMessage": "feat(parameters): expose effective Claude session controls",
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
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
        "T003"
      ],
      "acceptance": [
        "Reader/catalog/state соответствуют facts §4 и raw ultra mapping: базовый effort не угадывается, неизвестность явно объяснена. GET без программ/меню, stale/старые host с причиной.",
        "updateParameters меняет одно поле одной сессии, проверяет native доступность/confirmed, перечитывает весь набор и сохраняет unrelated поля/defaults; аудит effective old/new.",
        "claude-controls и условная схема Ultracode следуют proof T001; effort-card/access обратно совместимы с layout guards. Codex отклоняет чужой ultracode также в mixed запросе, не игнорирует его.",
        "400/409/503/504 явно отображаются HTTP-слоем, ownership/очередь и busy/stale/timeout/запреты покрыты тестами; statusline wrapper, контракты и три ОС согласованы."
      ],
      "parallelSafe": false,
      "context": [
        {
          "path": "docs/design/M27-claude-controls-facts.md",
          "required": true,
          "heading": "4. Таблица управления (заполняет T001)"
        },
        {
          "path": "docs/design/M27-claude-control-contract.md",
          "required": true,
          "heading": "2.4. Общий контракт и HTTP"
        }
      ]
    },
    {
      "id": "T005",
      "kind": "work",
      "title": "Добавить нативные контролы Claude в composer",
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
        "T004"
      ],
      "acceptance": [
        "Presentation выбирается по layout; геометрия/сценарии/положение ultra/Ultracode строго как в заполненном native эталоне T001. Несогласованность с state — блокер, не выбор дизайна. Plan не дублируется независимым режимом.",
        "Один popup, причины недоступности/подтверждения/ошибки видны; quiet success без технических notes, контекст/лимиты и рабочий composer сохранены.",
        "Настоящий thumb drag, keyboard, touch44, visualViewport и переносы работают; polling/POST/stale не теряют draft/focus и не откатывают state.",
        "ChatGPT M26/R2 и Kimi fallback сохранены, общий ES/CSS для трёх ОС, контракты и OS matrix обновлены."
      ],
      "parallelSafe": false,
      "context": [
        {
          "path": "docs/design/M27-claude-controls-facts.md",
          "required": true,
          "heading": "4. Таблица управления (заполняет T001)"
        },
        {
          "path": "docs/design/M27/claude-visual-reference.md",
          "required": true,
          "heading": "Визуальный контракт (заполняет T001)"
        },
        {
          "path": "docs/planning/M27-claude-native-controls.md",
          "required": true,
          "heading": "2.3. Контролы в composer"
        }
      ]
    },
    {
      "id": "T006",
      "kind": "work",
      "title": "Проверить native round trip, браузерные сценарии и визуальное совпадение",
      "commitMessage": "test(claude): verify native controls and visual fidelity",
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "design-qa.md",
        "docs/design/M27-claude-control-contract.md",
        "docs/architecture/OVERVIEW.md",
        "docs/architecture/CONTRACTS.md",
        "docs/evidence/M27-claude-native-controls.md",
        "docs/evidence/M27",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host",
        "docs/design/M27/claude-visual-reference.md",
        "docs/design/M27-claude-controls-facts.md"
      ],
      "dependencies": [
        "T005"
      ],
      "acceptance": [
        "Подтверждены read-back/обратная смена/сохранение identity и defaults. Для нового хода: только Sonnet fast=false по facts §6, максимум2 хода суммарно T006/T007 и прямое разрешение; fast/Fable только metadata.",
        "Browser regression проверяет все поля, ошибки/подтверждения/quiet success, focus/draft, реальный drag из thumb центра до и после polling, cancel/выход за дорожку и touch.",
        "Раскладка Kit в dark/light на пяти размерах и200% проверена отдельно от pixel QA: только тёмный RC-эталон в том же размере/состоянии/DPR, совместное сравнение, P0/P1/P2 исправлены, design-qa.md passed; light без native PNG не заявлена совпадающей.",
        "Полный профиль и прежние interrupt*/direct/channel/autopilot/ChatGPT/Kimi проходят без ослабления. Windows — CI+ожидаемый live tester; нераспознанный ConPTY frame всегда отказывает. Артефакты и границы приёмки записаны."
      ],
      "parallelSafe": false,
      "context": [
        {
          "path": "docs/design/M27-claude-controls-facts.md",
          "required": true
        },
        {
          "path": "docs/design/M27/claude-visual-reference.md",
          "required": true,
          "heading": "Визуальный контракт (заполняет T001)"
        },
        {
          "path": "docs/planning/M27-claude-native-controls.md",
          "required": true,
          "heading": "4. Проверка и критерии готовности"
        }
      ]
    },
    {
      "id": "T007",
      "kind": "delivery",
      "title": "Собрать и установить локальную поставку 0.13.0",
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
        "docs/evidence/M27",
        "docs/setup.md"
      ],
      "dependencies": [
        "T006"
      ],
      "acceptance": [
        "После DOCS, полностью перечитавшей README и сверившей README/setup/usage/installation, и подтверждения пользователя версии/CHANGELOG согласованы; штатная0.13.0 установлена, doctor installed ok, история документов не потеряна.",
        "Настоящий API/панель/установленный ES/CSS, новый/возобновлённый host и read-only старого проверены без рестарта рабочих/ревьюера. Native smoke без генерации либо остаток общего бюджета2 T006/T007 с согласия по facts §6.",
        "Evidence содержит команды/результаты/границы, коммит T007 — SHA поставки; задача не делает push, CI ожидается."
      ],
      "context": [
        {
          "path": "README.md",
          "required": true
        },
        {
          "path": "docs/design/M27-claude-controls-facts.md",
          "required": true,
          "heading": "6. Бюджет генерации и согласие"
        }
      ]
    },
    {
      "id": "T008",
      "kind": "delivery",
      "title": "Зафиксировать зелёную CI четырёх платформ на SHA поставки",
      "commitMessage": "docs: record green CI for Claude native controls",
      "files": [
        "docs/evidence/M27-claude-native-controls.md"
      ],
      "dependencies": [
        "T007"
      ],
      "acceptance": [
        "До task:start проверены headSha T007 и success macOS/Linux/Windows x64/ARM64; ci/m27-claude-native-controls отправлена вне задач по прямой команде пользователя.",
        "Записаны SHA/URL/четыре результата CI; нет функциональных изменений или push из задачи, пользовательская приёмка/закрытие отдельно."
      ]
    }
  ]
}
```
