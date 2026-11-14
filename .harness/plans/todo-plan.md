# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-14T07:04:08.120Z",
    "scopeId": "m27-claude-native-controls"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 911,
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
      "Кольцо и подсказка контекста Claude совпадают с /context приложения Claude при заданном autoCompactWindow; без порога — окно модели, как прежде.",
      "Stop активен весь ход Claude и останавливает ответ одним Esc, в том числе в диалоге разрешения; сессия вне терминала Kit получает одну строку с действием.",
      "Сообщение свободному агенту и ответ на вопрос о плане доходят сразу; сообщение во время хода видно пузырём «в очереди» и доставляется в Stop этого хода.",
      "Под полем ввода нет служебных строк ни у одного провайдера; ошибки после действия пользователя остаются.",
      "Движок параметров не печатает в терминал во время хода и не теряет хуки; гарантии M24–M27, ChatGPT и Kimi не регрессировали; контракты и матрица трёх ОС согласованы.",
      "0.13.1 установлена и проверена, CI точного SHA зелёная на macOS, Linux, Windows x64 и ARM64; пользовательская приёмка отдельно."
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-14T07:55:41.752Z",
      "text": "Пользователь 14.11.2026: «Да, согласен. Теперь можешь сделать скоп и план для найденных проблем и исправить их. Не забудь по поводу контекстного окна.» В панели выбраны спецификация и план без ревью. | Execution mode chosen by the user: sequential: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
    },
    "baselineCommit": "d4a9be01ce6383a83f5eb04af657dd01b88b15c5",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M28-claude-controls-fixes.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-14T07:55:41.752Z",
        "text": "Кольцо и процент контекста Claude — от порога автосжатия autoCompactWindow; окно модели — второй строкой подсказки («Да, подходит»)."
      },
      {
        "at": "2026-11-14T07:55:41.752Z",
        "text": "Stop активен всё время, пока агент отвечает, как в приложении Claude; заранее экран не проверяется."
      },
      {
        "at": "2026-11-14T07:55:41.752Z",
        "text": "Под полем ввода нет служебных строк; только ошибки после действия пользователя с действием; сообщение в очереди — пузырём «в очереди» в ленте («Да, согласен»)."
      },
      {
        "at": "2026-11-14T07:55:41.752Z",
        "text": "Сообщения пользователя и ответы панели не ждут следующего сообщения пользователя: при свободном агенте уходят сразу."
      },
      {
        "at": "2026-11-14T07:55:41.752Z",
        "text": "Границы хода — по хукам UserPromptSubmit/Stop; нераспознанный экран не считается idle; Stop-хук никогда не проглатывается."
      },
      {
        "at": "2026-11-14T07:55:41.752Z",
        "text": "Настройки Claude пользователя Kit только читает; серверный кэш порогов Claude не читается."
      },
      {
        "at": "2026-11-14T07:55:41.752Z",
        "text": "Живые ходы: не больше 6 коротких на самой дешёвой модели каталога, в своём временном проекте Kit с очисткой (T001 ≤ 3, T007 ≤ 3)."
      },
      {
        "at": "2026-11-14T07:55:41.752Z",
        "text": "Отправка ветки ci/m28-claude-controls-fixes — только по прямой команде пользователя; main публикуется после приёмки и закрытия."
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": "92b77570-773b-4173-8244-c327d009daa3",
      "strategy": "sequential"
    },
    "id": "m28-claude-controls-fixes",
    "objective": "Исправить нативные контролы Claude в диалоге Workflow Kit: окно контекста по порогу автосжатия, Stop активен весь ход, сообщения и ответы панели доходят без ожидания, под полем ввода нет служебных строк, очередь видна в ленте.",
    "spec": "docs/planning/M28-claude-controls-fixes.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "В своём временном проекте Kit сняты кадры Claude 2.1.325: работа, свободен, диалог разрешения, после Esc; они сохранены фикстурами без текста переписки пользователя.",
        "Подтверждены порядок порога автосжатия (переменная окружения и слои настроек), пути managed на трёх ОС по документации, Stop-хук после slash-команды и остановка хода Esc в диалоге разрешения.",
        "Воспроизведена потеря доставки (транзакция параметров во время хода, проглоченный хук, пропуск файлов хоста); израсходовано не больше 3 коротких ходов, проект и процессы очищены, настройки пользователя не тронуты.",
        "Расхождения с §3 спецификации внесены в спецификацию; противоречие, меняющее решение пользователя, блокирует задачу."
      ],
      "checks": [],
      "commitMessage": "docs: record Claude 2.1.325 facts for controls fixes",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M28-claude-controls-fixes.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "docs/design/M28-claude-fixes-facts.md",
        "docs/evidence/M28-claude-controls-fixes.md",
        "docs/evidence/M28",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/fixtures/m28",
        "docs/planning/M28-claude-controls-fixes.md",
        "docs/evidence/M28/probe-harness.md",
        "docs/evidence/M28/t001-context-matrix.json",
        "docs/evidence/M28/t001-observations.json",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/fixtures/m28/claude-2.1.325-frames.json"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Снять кадры Claude 2.1.325 и проверить факты для исправлений",
      "why": "Причина смены экрана 2.1.325, порядок порога и поведение Esc не проверены на устройстве."
    },
    {
      "acceptance": [
        "wfk statusline пишет в снимок порог и его источник по порядку T001; ошибка чтения означает «порога нет», вывод statusline пользователя и код 0 не меняются.",
        "Процент и знаменатель считаются от порога; подсказка «Контекст: 78 451 из 500 000 (16 %)» и вторая строка «Окно модели: 1 000 000 · автосжатие: 500 000»; без порога — прежняя одна строка.",
        "Тесты покрывают слои, модельный и общий порог, auto, диапазон, ветки win32 и linux с подставленной платформой; Codex не меняется; контракты и OVERVIEW обновлены."
      ],
      "checks": [],
      "commitMessage": "fix(claude): measure context against the auto-compact window",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M28-claude-controls-fixes.md",
          "required": true,
          "heading": "3.1. Окно контекста (`cli`, `provider-claude`, `provider-registry`, `session-chat`)"
        },
        {
          "path": "docs/design/M28-claude-fixes-facts.md",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/runtime/modules/cli/src/statusline.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/auto-compact-window.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/statusline.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/auto-compact-window.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameters.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameters.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/parameters.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameters.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/parameters.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/parameters-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/index.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Считать окно контекста Claude от порога автосжатия",
      "why": "Считать окно контекста Claude от порога автосжатия"
    },
    {
      "acceptance": [
        "Prompt- и Stop-хуки сессии панели пишут атомарный <debug>.turn; хост читает его; экран 2.1.325 распознаётся по фикстурам T001, нераспознанный кадр — unknown.",
        "Движок параметров не начинает транзакцию и discovery во время хода или на нераспознанном экране; запрос получает busy «Claude отвечает».",
        "Своим считается только prompt-хук с набранной командой шага; любой другой хук отменяет транзакцию и проходит в канал; Stop-хук не проглатывается; unsafe снимается не позже 10 с.",
        "Регрессионные тесты воспроизводят сценарий T001; ветки win32 и linux покрыты; контракты обновлены."
      ],
      "checks": [],
      "commitMessage": "fix(claude): track turns by hooks and never swallow real hooks",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M28-claude-controls-fixes.md",
          "required": true,
          "heading": "3.2. Границы хода и экран (`provider-claude`, `pty`)"
        },
        {
          "path": "docs/design/M28-claude-fixes-facts.md",
          "required": true
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/native-parameters.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/turn-state.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/parameters.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/interrupt.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-control.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-files.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-screen.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/turn-file.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/fixtures/m28/claude-2.1.325-frames.json",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/native-parameters.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/turns.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Определять границы хода Claude по хукам и не терять хуки",
      "why": "Определять границы хода Claude по хукам и не терять хуки"
    },
    {
      "acceptance": [
        "Хост обрабатывает .text, .message и .rename при любом состоянии движка: файл отменяет транзакцию, очистка до 2 с, затем вставка; ничего не ждёт следующего сообщения пользователя.",
        "Сообщение свободному агенту уходит сразу; в очередь — только во время хода, с выдачей в Stop этого хода; ответ на вопрос о плане доходит в удерживаемый Stop и пробуждением после него.",
        "Неподтверждённая за 10 с доставка возвращает текст в поле ввода и показывает «Сообщение не дошло до Claude. Отправьте ещё раз»; тесты на win32 и linux; контракты обновлены."
      ],
      "checks": [],
      "commitMessage": "fix(claude): deliver panel messages and answers without waiting",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M28-claude-controls-fixes.md",
          "required": true,
          "heading": "3.3. Доставка сообщений и ответов панели (`pty`, `provider-claude`, `cli`)"
        },
        {
          "path": "docs/design/M28-claude-fixes-facts.md",
          "required": true
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-files.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/sessions.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/direct-message.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/test",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/chat-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/composer-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/chat-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/native-parameters.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/turn-reconcile.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-worker.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/turns.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Доставлять сообщения и ответы панели свободному Claude сразу",
      "why": "Доставлять сообщения и ответы панели свободному Claude сразу"
    },
    {
      "acceptance": [
        "Stop активен, пока агент отвечает по данным канала, без предварительной проверки экрана и кэша 3,5 с.",
        "Нажатие отменяет свою транзакцию, отправляет одно Esc и подтверждает остановку меткой прерывания (включая for tool use) или Stop-хуком до 5 с; второй Esc не отправляется.",
        "Сессия вне терминала Kit и неподтверждённая остановка дают одну строку «Остановите ответ в приложении Claude»; тесты, включая win-host; контракты обновлены."
      ],
      "checks": [],
      "commitMessage": "fix(claude): keep Stop available for the whole turn",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M28-claude-controls-fixes.md",
          "required": true,
          "heading": "3.4. Stop (`cli`, `provider-claude`, `session-chat`)"
        },
        {
          "path": "docs/design/M28-claude-fixes-facts.md",
          "required": true
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/runtime/modules/cli/src/turn-interruption.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/turn-interruption.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/interrupt.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-control.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-worker.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt.tcl",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/interrupt.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/composer-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/direct.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/interrupt-control.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/interrupt-host.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/interrupt.test.ts"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Сделать Stop активным весь ход Claude",
      "why": "Сделать Stop активным весь ход Claude"
    },
    {
      "acceptance": [
        "Нет строки sc-availability и текстов «Отправляю…», «Отправлено агенту», «В очереди…», «Останавливаю…», «Ответ остановлен», «Ответ уже завершён», «Ход сменился…»; ошибки после действия пользователя остаются у всех провайдеров.",
        "Канал отдаёт queued (только сообщения пользователя из панели, до 20, текст до 4000 знаков); лента показывает их пузырями «в очереди», пузырь пропадает после выдачи агенту.",
        "Опрос не сбрасывает черновик, фокус и пузыри; тесты модели и канала; контракты обновлены."
      ],
      "checks": [],
      "commitMessage": "fix(panel): drop composer notices and show queued messages",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M28-claude-controls-fixes.md",
          "required": true,
          "heading": "3.5. Под полем ввода и очередь (`session-chat`, `agent-channel`)"
        }
      ],
      "dependencies": [
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/types.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/slots.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/chat-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/chat-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/composer-model.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Убрать служебные строки под вводом и показать очередь в ленте",
      "why": "Убрать служебные строки под вводом и показать очередь в ленте"
    },
    {
      "acceptance": [
        "Браузерные проверки 375, 768 и 1280 px в светлой и тёмной темах: под вводом нет служебных строк, Stop активен весь ход, пузыри очереди; design-qa.md обновлён.",
        "ChatGPT и Kimi в браузерном сценарии: отправка, очередь и Stop не регрессировали.",
        "Живой прогон на Mac в своём временном проекте Kit выполнен в пределах бюджета (не больше 3 ходов) с очисткой; найденные дефекты записаны в evidence с причинами по коду, их исправление и повторная живая проверка вынесены в задачи T010 и T011."
      ],
      "checks": [],
      "commitMessage": "test(claude): verify controls fixes live and in the browser",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M28-claude-controls-fixes.md",
          "required": true,
          "heading": "5. Проверка"
        },
        {
          "path": "docs/design/M28-claude-fixes-facts.md",
          "required": true
        }
      ],
      "dependencies": [
        "T006"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M28-claude-controls-fixes.md",
        "docs/evidence/M28",
        "design-qa.md",
        "docs/design/M28-claude-fixes-facts.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test",
        "docs/evidence/M28/composer-claude-dark-1280.png",
        "docs/evidence/M28/composer-claude-dark-375.png",
        "docs/evidence/M28/composer-claude-dark-768.png",
        "docs/evidence/M28/composer-claude-light-1280.png",
        "docs/evidence/M28/composer-claude-light-375.png",
        "docs/evidence/M28/composer-claude-light-768.png",
        "docs/evidence/M28/t007-browser.json",
        "docs/evidence/M28/t007-harness.md",
        "docs/evidence/M28/t007-live.json",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/m28-composer.browser.js"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Проверить исправления на живом Claude и в браузере",
      "why": "Проверить исправления на живом Claude и в браузере"
    },
    {
      "acceptance": [
        "Stop подтверждается по новой строке «Interrupted · …» или метке прерывания в кадре TerminalScreen; сырой поток терминала не обязателен; тест на потоке с управляющими кодами между словами.",
        "Ход, прерывание которого хост записал в .turn, завершается в канале и после неподтверждённого Stop (барьер не держит working); автоматическое продолжение по барьеру по-прежнему не запускается, а сообщение пользователя уходит сразу.",
        "Доступность Stop для сессии терминала Kit не зависит от того, прочитан ли список сессий: в первые секунды хода нет причины «Остановите ответ в приложении Claude».",
        "Тесты с подставленными платформами darwin, linux и win32; контракты и матрица ОС обновлены."
      ],
      "checks": [],
      "commitMessage": "fix(claude): confirm Stop by the screen and end the interrupted turn",
      "confirmation": null,
      "context": [
        {
          "path": "docs/evidence/M28-claude-controls-fixes.md",
          "required": true,
          "heading": "T007: браузер и живая проверка"
        },
        {
          "path": "docs/planning/M28-claude-controls-fixes.md",
          "required": true,
          "heading": "3.4. Stop (`cli`, `provider-claude`, `session-chat`)"
        }
      ],
      "dependencies": [
        "T007"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-control.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-worker.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/interrupt.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/interrupt.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/turn-interruption.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/turn-control.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/turn-state.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/turn-interruption.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/turn-reconcile.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/interrupt-control.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/interrupt.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/windows.test.ts"
      ],
      "fixes": "T005",
      "id": "T010",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Подтверждать Stop по кадру Claude и завершать ход после прерывания",
      "why": "Живая проверка T007: одно Esc остановило Claude, но Kit ответил interrupt-timeout, канал остался в working, очередь и сообщения свободному агенту не уходили"
    },
    {
      "acceptance": [
        "Живой сценарий после T010 на Mac в своём временном проекте Kit с очисткой, не больше 3 коротких ходов Haiku: результат каждого шага записан; найденный дефект подтверждён диагностикой без генерации и передан в задачу исправления с повторной проверкой.",
        "Evidence содержит команды, результаты, израсходованные ходы (всего по M28 не больше 6) и границы: ответ на вопрос о плане и Stop из приложения Claude."
      ],
      "checks": [],
      "commitMessage": "test(claude): repeat the live Stop and delivery check",
      "confirmation": null,
      "context": [
        {
          "path": "docs/evidence/M28/t007-harness.md",
          "required": true
        }
      ],
      "dependencies": [
        "T010"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M28-claude-controls-fixes.md",
        "docs/evidence/M28",
        "docs/design/M28-claude-fixes-facts.md",
        "design-qa.md",
        "docs/evidence/M28/t011-harness.md",
        "docs/evidence/M28/t011-live.json"
      ],
      "fixes": null,
      "id": "T011",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Повторить живую проверку Stop и доставки на Claude",
      "why": "Живой сценарий T007 не прошёл из-за дефекта; его надо повторить после T010"
    },
    {
      "acceptance": [
        "Запрос Stop и ожидание его подтверждения обрабатываются на каждом шаге хоста при любой занятости движка параметров (флаг unsafe, discovery); активная транзакция только отменяется и получает свою короткую очистку, без ожидания unsafe.",
        "Состояние экрана .interrupt-state пишется на каждом шаге и при занятом движке.",
        "Регрессионные тесты: Stop во время discovery и при unsafe подтверждается в пределах interruptWaitMs для рабочего процесса expect (подставленные darwin и linux) и ConPTY-хоста (win32); гарантии M24–M27 и тесты параметров не ослаблены; контракты и матрица ОС обновлены."
      ],
      "checks": [],
      "commitMessage": "fix(claude): handle Stop before a busy parameter engine",
      "confirmation": null,
      "context": [
        {
          "path": "docs/evidence/M28-claude-controls-fixes.md",
          "required": true,
          "heading": "T011: повторная живая проверка после T010"
        }
      ],
      "dependencies": [
        "T011"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-control.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-worker.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-files.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/interrupt.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/parameters.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/stop-priority.test.ts"
      ],
      "fixes": "T010",
      "id": "T012",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Обрабатывать Stop раньше занятости движка параметров",
      "why": "Живая проверка T011: пока движок параметров занят (discovery, флаг unsafe до 10 с), хост не читает запрос Stop и не пишет состояние экрана; Stop получает 504, Esc уходит после тайм-аута"
    },
    {
      "acceptance": [
        "Живой сценарий на Mac в своём временном проекте Kit с очисткой, не больше 2 коротких ходов Haiku (всего по M28 не больше 6): Stop в диалоге разрешения и во время генерации подтверждается, канал выходит из working, сообщение свободному агенту получает sent и начинает ход.",
        "Evidence содержит команды, результаты, израсходованные ходы и границы: выдача очереди после прерывания (покрыта тестами, живьём требует третьего хода), ответ на вопрос о плане, Stop из приложения Claude."
      ],
      "checks": [],
      "commitMessage": "test(claude): verify Stop and delivery live after the host fix",
      "confirmation": null,
      "context": [
        {
          "path": "docs/evidence/M28/t011-harness.md",
          "required": true
        }
      ],
      "dependencies": [
        "T012"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M28-claude-controls-fixes.md",
        "docs/evidence/M28",
        "docs/design/M28-claude-fixes-facts.md"
      ],
      "fixes": null,
      "id": "T013",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Живая проверка Stop и доставки после T012",
      "why": "Живые прогоны T007 и T011 не прошли; после T012 сценарий надо повторить в остатке бюджета"
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
        "T007",
        "T010",
        "T011",
        "T012",
        "T013"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M28-claude-controls-fixes.md",
        "docs/design/M28-claude-fixes-facts.md",
        "docs/evidence/M28-claude-controls-fixes.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/parameters.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/parameters.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "docs/architecture/CONTRACTS.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/interrupt.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/sessions.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "design-qa.md",
        "docs/evidence/M28/probe-harness.md",
        "docs/evidence/M28/t007-harness.md",
        "docs/evidence/M28/t011-harness.md"
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
        "После DOCS и подтверждения пользователя версии и CHANGELOG согласованы; 0.13.1 установлена штатно, doctor installed ok, работающие сессии не перезапущены.",
        "Установленная панель проверена: окно контекста, Stop, доставка, строки под вводом, очередь; живые ходы — только остаток бюджета T007.",
        "Evidence содержит команды и результаты; коммит T008 — SHA поставки; задача не делает push."
      ],
      "checks": [],
      "commitMessage": "chore(release): install Workflow Kit 0.13.1 locally",
      "confirmation": null,
      "context": [
        {
          "path": "README.md",
          "required": true
        },
        {
          "path": "docs/planning/M28-claude-controls-fixes.md",
          "required": true,
          "heading": "5. Проверка"
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
        "README.md",
        "CHANGELOG.md",
        "docs/usage.md",
        "docs/installation.md",
        "docs/setup.md",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M28-claude-controls-fixes.md",
        "docs/evidence/M28"
      ],
      "fixes": null,
      "id": "T008",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Собрать и установить локальную поставку 0.13.1",
      "why": "Собрать и установить локальную поставку 0.13.1"
    },
    {
      "acceptance": [
        "До task:start проверены headSha T008 и success на macOS, Linux, Windows x64 и ARM64; ветка ci/m28-claude-controls-fixes отправлена вне задач по прямой команде пользователя.",
        "Записаны SHA, URL и четыре результата CI; без функциональных изменений и push из задачи; приёмка и закрытие — отдельно."
      ],
      "checks": [],
      "commitMessage": "docs: record green CI for Claude controls fixes",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T008",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M28-claude-controls-fixes.md"
      ],
      "fixes": null,
      "id": "T009",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Зафиксировать зелёную CI четырёх платформ на SHA поставки",
      "why": "Зафиксировать зелёную CI четырёх платформ на SHA поставки"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m28-claude-controls-fixes (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 10/14
- Revision: 911

## Objective

Исправить нативные контролы Claude в диалоге Workflow Kit: окно контекста по порогу автосжатия, Stop активен весь ход, сообщения и ответы панели доходят без ожидания, под полем ввода нет служебных строк, очередь видна в ленте.

## Acceptance

- Кольцо и подсказка контекста Claude совпадают с /context приложения Claude при заданном autoCompactWindow; без порога — окно модели, как прежде.
- Stop активен весь ход Claude и останавливает ответ одним Esc, в том числе в диалоге разрешения; сессия вне терминала Kit получает одну строку с действием.
- Сообщение свободному агенту и ответ на вопрос о плане доходят сразу; сообщение во время хода видно пузырём «в очереди» и доставляется в Stop этого хода.
- Под полем ввода нет служебных строк ни у одного провайдера; ошибки после действия пользователя остаются.
- Движок параметров не печатает в терминал во время хода и не теряет хуки; гарантии M24–M27, ChatGPT и Kimi не регрессировали; контракты и матрица трёх ОС согласованы.
- 0.13.1 установлена и проверена, CI точного SHA зелёная на macOS, Linux, Windows x64 и ARM64; пользовательская приёмка отдельно.

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Снять кадры Claude 2.1.325 и проверить факты для исправлений (work)
  - Commit: docs: record Claude 2.1.325 facts for controls fixes
  - Files: docs/design/M28-claude-fixes-facts.md, docs/evidence/M28-claude-controls-fixes.md, docs/evidence/M28, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/fixtures/m28, docs/planning/M28-claude-controls-fixes.md, docs/evidence/M28/probe-harness.md, docs/evidence/M28/t001-context-matrix.json, docs/evidence/M28/t001-observations.json, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/fixtures/m28/claude-2.1.325-frames.json
- [DONE] T002 — Считать окно контекста Claude от порога автосжатия (work)
  - Commit: fix(claude): measure context against the auto-compact window
  - Files: product-parts/backend-core/clusters/runtime/modules/cli/src/statusline.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/auto-compact-window.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/statusline.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/auto-compact-window.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameters.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameters.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/parameters.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameters.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/parameters.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters-model.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/parameters-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, docs/architecture/CONTRACTS.md, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/index.ts
  - Depends on: T001
- [DONE] T003 — Определять границы хода Claude по хукам и не терять хуки (work)
  - Commit: fix(claude): track turns by hooks and never swallow real hooks
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/native-parameters.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/turn-state.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/parameters.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/interrupt.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/test, product-parts/backend-core/clusters/runtime/modules/cli/module.md, docs/architecture/CONTRACTS.md, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-control.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-files.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-screen.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/turn-file.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/fixtures/m28/claude-2.1.325-frames.json, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/native-parameters.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/turns.test.ts
  - Depends on: T002
- [DONE] T004 — Доставлять сообщения и ответы панели свободному Claude сразу (work)
  - Commit: fix(claude): deliver panel messages and answers without waiting
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-files.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/sessions.md, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/direct-message.ts, product-parts/backend-core/clusters/runtime/modules/cli/test, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/test, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer-model.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/chat-model.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/composer-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/chat-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, docs/architecture/CONTRACTS.md, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/native-parameters.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/turn-reconcile.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-worker.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/turns.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts
  - Depends on: T003
- [DONE] T005 — Сделать Stop активным весь ход Claude (work)
  - Commit: fix(claude): keep Stop available for the whole turn
  - Files: product-parts/backend-core/clusters/runtime/modules/cli/src/turn-interruption.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/turn-interruption.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/interrupt.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-control.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-worker.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt.tcl, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/interrupt.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer-model.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/composer-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, docs/architecture/CONTRACTS.md, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/direct.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/interrupt-control.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/interrupt-host.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/interrupt.test.ts
  - Depends on: T004
- [DONE] T006 — Убрать служебные строки под вводом и показать очередь в ленте (work)
  - Commit: fix(panel): drop composer notices and show queued messages
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat/src, product-parts/control-panel/clusters/web-panel/modules/session-chat/test, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/types.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/slots.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, docs/architecture/CONTRACTS.md, docs/architecture/OVERVIEW.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/chat-model.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer-model.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/chat-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/composer-model.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts
  - Depends on: T005
- [DONE] T007 — Проверить исправления на живом Claude и в браузере (work)
  - Commit: test(claude): verify controls fixes live and in the browser
  - Files: docs/evidence/M28-claude-controls-fixes.md, docs/evidence/M28, design-qa.md, docs/design/M28-claude-fixes-facts.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/test, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test, docs/evidence/M28/composer-claude-dark-1280.png, docs/evidence/M28/composer-claude-dark-375.png, docs/evidence/M28/composer-claude-dark-768.png, docs/evidence/M28/composer-claude-light-1280.png, docs/evidence/M28/composer-claude-light-375.png, docs/evidence/M28/composer-claude-light-768.png, docs/evidence/M28/t007-browser.json, docs/evidence/M28/t007-harness.md, docs/evidence/M28/t007-live.json, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/m28-composer.browser.js
  - Depends on: T006
- [DONE] T010 — Подтверждать Stop по кадру Claude и завершать ход после прерывания (work)
  - Commit: fix(claude): confirm Stop by the screen and end the interrupted turn
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-control.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-worker.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/interrupt.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/interrupt.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/turn-interruption.ts, product-parts/backend-core/clusters/runtime/modules/cli/test, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/turn-control.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/turn-state.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, docs/architecture/CONTRACTS.md, docs/architecture/OVERVIEW.md, product-parts/backend-core/clusters/runtime/modules/cli/test/turn-interruption.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/turn-reconcile.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/interrupt-control.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/interrupt.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/windows.test.ts
  - Depends on: T007
  - Fixes: T005
- [DONE] T011 — Повторить живую проверку Stop и доставки на Claude (work)
  - Commit: test(claude): repeat the live Stop and delivery check
  - Files: docs/evidence/M28-claude-controls-fixes.md, docs/evidence/M28, docs/design/M28-claude-fixes-facts.md, design-qa.md, docs/evidence/M28/t011-harness.md, docs/evidence/M28/t011-live.json
  - Depends on: T010
- [DONE] T012 — Обрабатывать Stop раньше занятости движка параметров (work)
  - Commit: fix(claude): handle Stop before a busy parameter engine
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-control.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-worker.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-files.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/interrupt.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/parameters.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, docs/architecture/CONTRACTS.md, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/stop-priority.test.ts
  - Depends on: T011
  - Fixes: T010
- [TODO] T013 — Живая проверка Stop и доставки после T012 (work)
  - Commit: test(claude): verify Stop and delivery live after the host fix
  - Files: docs/evidence/M28-claude-controls-fixes.md, docs/evidence/M28, docs/design/M28-claude-fixes-facts.md
  - Depends on: T012
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M28-claude-controls-fixes.md, docs/design/M28-claude-fixes-facts.md, docs/evidence/M28-claude-controls-fixes.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/parameters.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/parameters.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, docs/architecture/CONTRACTS.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/interrupt.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/sessions.md, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, design-qa.md, docs/evidence/M28/probe-harness.md, docs/evidence/M28/t007-harness.md, docs/evidence/M28/t011-harness.md
  - Depends on: T001, T002, T003, T004, T005, T006, T007, T010, T011, T012, T013
- [TODO] T008 — Собрать и установить локальную поставку 0.13.1 (delivery)
  - Commit: chore(release): install Workflow Kit 0.13.1 locally
  - Files: package.json, package-lock.json, README.md, CHANGELOG.md, docs/usage.md, docs/installation.md, docs/setup.md, docs/architecture/OVERVIEW.md, docs/evidence/M28-claude-controls-fixes.md, docs/evidence/M28
  - Depends on: T007, DOCS-R1
- [TODO] T009 — Зафиксировать зелёную CI четырёх платформ на SHA поставки (delivery)
  - Commit: docs: record green CI for Claude controls fixes
  - Files: docs/evidence/M28-claude-controls-fixes.md
  - Depends on: T008, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
