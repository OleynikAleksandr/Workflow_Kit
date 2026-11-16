# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-16T17:16:45.868Z",
    "scopeId": "M38-kit-structure-update"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 1165,
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
      "После ручного запуска Плана проходит весь согласованный цикл до удалённого SHA без промежуточных подтверждений.",
      "Полный автопилот начинает подготовку только по прямой команде пользователя и автоматически проводит ревью при включённой настройке, выбор режима и запуск.",
      "Неуспешное/устаревшее ревью, обязательный CI или ручной критерий не обходятся; история честно различает автоматическую и пользовательскую приёмку.",
      "Состояние переживает перезапуск, не повторяет завершённые действия; явные pause/stop/off имеют приоритет.",
      "Settings содержат точные названия режимов и review; обе служебные карточки свёрнуты по умолчанию и используют согласованные скругления.",
      "Инструкции, recovery, проверки backend и оба решателя согласованы; старые проекты получают корректный upgrade path.",
      "Обязательные проверки и CI четырёх платформ пройдены; доказательства реальных прогонов и непроверенных live-сценариев явно разделены."
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-16T18:08:07.036Z",
      "text": "Пользователь: «Да, согласен» с режимами «После ручного запуска Плана» и «Полный автопилот», карточкой «Автопилотирование», переносом ревью и свёрнутыми карточками Settings. Workflow Kit: пользователь выбрал спецификацию и план с ревью. | Execution mode chosen by the user: sequential: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
    },
    "baselineCommit": "e93dca1357de6b5f6b415ceab5dabe14f3a9cece",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M39-autopiloting.md",
        "required": false
      },
      {
        "path": "docs/planning/M39-autopiloting-runtime.md",
        "required": false
      },
      {
        "path": "docs/planning/M39-autopiloting-kit.md",
        "required": false
      },
      {
        "path": "docs/planning/M39-autopiloting-ui.md",
        "required": false
      },
      {
        "path": "docs/planning/M39-autopiloting-completion.md",
        "required": false
      },
      {
        "path": "docs/planning/M39-autopiloting-validation.md",
        "required": false
      },
      {
        "path": "docs/planning/M39-autopiloting-controls.md",
        "required": false
      },
      {
        "path": "docs/planning/M39-autopiloting-preparation.md",
        "required": false
      }
    ],
    "decisions": [
      {
        "at": "2026-11-16T18:08:07.036Z",
        "text": "Названия пользователя: «После ручного запуска Плана» и «Полный автопилот»; третье состояние — «Выключено»."
      },
      {
        "at": "2026-11-16T18:08:07.036Z",
        "text": "Настройки общие для службы, но поручение привязано к конкретному запуску; после обновления mode=off."
      },
      {
        "at": "2026-11-16T18:08:07.036Z",
        "text": "Full не требует второго вопроса о плане после прямого поручения; review проходит до автоматического scope:choose/start."
      },
      {
        "at": "2026-11-16T18:08:07.036Z",
        "text": "Публикация остаётся после закрытия scope и включает служебные коммиты; автоматика не выдаёт себя за личную приёмку пользователя."
      },
      {
        "at": "2026-11-16T18:08:07.036Z",
        "text": "Для самого M39 сохраняются текущие ручные команды поставки, приёмки, закрытия и публикации."
      },
      {
        "at": "2026-11-16T18:08:07.036Z",
        "text": "Все work-задачи parallelSafe=false из-за общих модулей и документов; рекомендуемый режим sequential."
      },
      {
        "at": "2026-11-16T18:08:07.036Z",
        "text": "Ревью R1: ядро первым четырьмя work-задачами с обязательной генерацией vendor в том же коммите; только T011/T012 являются delivery."
      },
      {
        "at": "2026-11-16T18:08:07.036Z",
        "text": "Одноразовые host tickets защищают выдачу разрешения и auto-finalization; progress не определяет обязательные CI jobs."
      },
      {
        "at": "2026-11-16T18:08:07.036Z",
        "text": "До задач выполняются отдельные docs:commit по таблице. Предлагается исключение из M38: после T004 установить новый Kit в текущий открытый scope. Нужно отдельное прямое подтверждение перед установкой с версиями/SHA и риском до CI; сейчас его нет. Без него T005 не запускается."
      },
      {
        "at": "2026-11-16T18:08:07.036Z",
        "text": "Ревью R2: verifier — IPC родителя runHost/fork без адреса и регистрации; отсутствие канала/ответа запрещает host-мутацию."
      },
      {
        "at": "2026-11-16T18:08:07.036Z",
        "text": "Каждый коммит изменения исходников kit-core повышает KIT_VERSION и пересобирает vendor. После первой установки каждое обновление ядра ставится той же согласованной процедурой между задачами; сбой Kit после установки останавливает M39 до решения пользователя."
      },
      {
        "at": "2026-11-16T18:08:07.036Z",
        "text": "Исправление поставленного приложения — новая delivery в том же fixes round со следующей свободной patch-версией (обычно 0.15.1), затем CI; DONE T011/T012 не меняются."
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": "01a1e55e-7184-7ab3-a3ff-d5e3a7e77b2a",
      "strategy": "sequential"
    },
    "id": "M39-autopiloting",
    "objective": "Два включаемых режима автопилотирования до проверенной публикации: после ручного запуска плана и от прямого поручения подготовить спецификацию; новая карточка Settings и свёрнутые служебные карточки.",
    "spec": "docs/planning/M39-autopiloting.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Automation/CI валидируются и совместимы со старым планом; CI-политика входит в согласуемый digest.",
        "scope:proposal --digest доступен до scope; expected-digest защищает выбор от устаревшего ревью; module/context bytes учитываются.",
        "Настоящий bundle пересобран в том же work-коммите; tests schema/digest/migration/recovery и freshness успешны.",
        "До task:start разделён workflow-kit/module.md по таблице подготовки, без изменения функциональных файлов.",
        "KIT_VERSION повышен относительно прошлого core-коммита; новый vendor с уникальной версией и метаданные включены в тот же коммит, freshness проходит."
      ],
      "checks": [],
      "commitMessage": "feat: add reviewed automation schema and proposal digest",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M39-autopiloting-kit.md",
          "required": true
        },
        {
          "path": "docs/planning/M39-autopiloting-preparation.md",
          "required": true,
          "heading": "1. Документальные разделения до task:start"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-execution-mode",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle",
        "tools/kit-build",
        "docs/architecture/workflow-kit/WorkflowKitCommands.md",
        "docs/architecture/workflow-kit/WorkflowKitRecovery.md",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Kit: схема automation и CI, digest предложения, recovery",
      "why": "Kit: схема automation и CI, digest предложения, recovery"
    },
    {
      "acceptance": [
        "Authorize/revoke и auto-accept/close доступны только runHost через fork IPC родителя; обычный CLI без IPC получает HOST_AUTH_REQUIRED до записи.",
        "Host ticket связан с реальным source/operation/root/run/scope/revision/input; wrong/expired/replayed ticket отвергается и не попадает в env агентов/логи.",
        "Delivery task и evidence проверяются по grant; CI frozen; manual acceptance в after-start использует accept=false; off/resume и final stop различаются.",
        "Ручные команды совместимы; пересобранный настоящий bundle и тесты разрешений/обоих решателей проходят.",
        "Host-ticket helper добавлен отдельными файлами; предельные autopilot.ts/decide.ts не расширяются до T005; cli/HTTP docs разделены до task:start.",
        "KIT_VERSION повышен относительно прошлого core-коммита; новый vendor с уникальной версией и метаданные включены в тот же коммит, freshness проходит.",
        "Настоящий IPC и отказы timeout/disconnect/requestId/env подмены проверены; адрес/регистрация verifier отсутствуют; одинаковый протокол на трёх ОС."
      ],
      "checks": [],
      "commitMessage": "feat: require host authority for autopilot transitions",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M39-autopiloting-kit.md",
          "required": true
        },
        {
          "path": "docs/planning/M39-autopiloting-controls.md",
          "required": true,
          "heading": "3. after-start и неполный план"
        },
        {
          "path": "docs/planning/M39-autopiloting-validation.md",
          "required": true,
          "heading": "1.0. Ядро и генерируемые инструкции — T001–T004"
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "docs/architecture/workflow-kit/WorkflowKitCommands.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OS-MATRIX.md",
        "docs/architecture/HTTP-CONTRACTS.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Kit: host-разрешения и проверяемые переходы поставки и приёмки",
      "why": "Kit: host-разрешения и проверяемые переходы поставки и приёмки"
    },
    {
      "acceptance": [
        "task:defer-delivery переводит только текущую незакоммиченную IN_PROGRESS delivery в TODO при чистом дереве и без транзакций/назначений.",
        "Сохраняются причина и история попытки; DONE SHA не меняются; затем plan:extend new работает без ROUND_OPEN.",
        "Отказы для DONE/dirty/stale revision/wrong task безопасны; полный failed CI → defer → fixes → DOCS → повтор delivery проверен новым бандлом.",
        "На временном старом активном scope проверено штатное обновление Kit, сохранение задач/owner/истории и доступность новой команды.",
        "KIT_VERSION повышен относительно прошлого core-коммита; новый vendor с уникальной версией и метаданные включены в тот же коммит, freshness проходит.",
        "Настоящим бандлом проверен defer T012 → plan:extend new с fixes и новой delivery D002 → task:update зависимости T012 от D002: порядок fixes/DOCS/D002/T012, нет TASK_ORDER или ROUND_OPEN, T012 не стартует до D002, DONE SHA неизменны."
      ],
      "checks": [],
      "commitMessage": "feat: defer unfinished delivery for fixes rounds",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M39-autopiloting-kit.md",
          "required": true
        },
        {
          "path": "docs/planning/M39-autopiloting-preparation.md",
          "required": true,
          "heading": "3. Проверяемый bootstrap Kit для самого M39"
        },
        {
          "path": "docs/planning/M39-autopiloting-validation.md",
          "required": true,
          "heading": "2. Поставка и проверки коммитов"
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle",
        "docs/architecture/workflow-kit/WorkflowKitCommands.md",
        "docs/architecture/workflow-kit/WorkflowKitProcess.md",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Kit: откладывание начатой delivery и исправления после красного CI",
      "why": "Kit: откладывание начатой delivery и исправления после красного CI"
    },
    {
      "acceptance": [
        "Installer/wfk templates/recovery/start/next согласованы: прежние барьеры в off, разрешённые переходы M39 без переспроса, publish после close.",
        "Agent-facing тексты не предлагают self-authorize/auto-accept/close; права исполнителя ограничены задачей; capability не определяется только номером версии.",
        "Узкая оговорка для генерации vendor-бандла в core work-коммите явно отражена; release build/install остаются delivery.",
        "Новый bundle и managed snapshot проверены на временном проекте; последовательные версии видны обновлению. Для самого M39 установка до T005 возможна только после отдельного подтверждения и записи версий/SHA; отказ команд после установки требует остановки и решения пользователя.",
        "KIT_VERSION повышен относительно прошлого core-коммита; новый vendor с уникальной версией и метаданные включены в тот же коммит, freshness проходит."
      ],
      "checks": [],
      "commitMessage": "feat: align Kit instructions with authorized autopiloting",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M39-autopiloting-kit.md",
          "required": true,
          "heading": "Инструкции и recovery"
        },
        {
          "path": "docs/planning/M39-autopiloting-preparation.md",
          "required": true
        },
        {
          "path": "docs/planning/M39-autopiloting.md",
          "required": true,
          "heading": "3. Архитектура и инструкции"
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view",
        "product-parts/backend-core/clusters/projects/modules/kit-structure",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "docs/architecture/workflow-kit/WorkflowKitProcess.md",
        "docs/architecture/workflow-kit/WorkflowKitExecutionModes.md",
        "docs/architecture/workflow-kit/WorkflowKitInstallation.md",
        "docs/architecture/workflow-kit/WorkflowKitHost.md",
        "docs/architecture/workflow-kit/WorkflowKitHostInstallation.md",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Единые инструкции Kit и wfk, capability и обновление проекта",
      "why": "Единые инструкции Kit и wfk, capability и обновление проекта"
    },
    {
      "acceptance": [
        "Settings off/after-start/full и review атомарно сохраняются с revision; миграция не запускает старые планы.",
        "Run привязан к проекту, владельцу и реальной пользовательской команде; review/reminder/сервисное сообщение не создаёт поручение.",
        "wfk session plan --authorized и ручной start идемпотентны; обычное обсуждение не запускается; off останавливает будущие автоматические действия.",
        "Старый Kit сообщает отсутствие capability; контракты и OS-MATRIX обновлены; проходят тесты раздела 1.1.",
        "Первым шагом выделены части autopilot.ts/decide.ts с сохранением API и прежних тестов; все файлы в лимите.",
        "Настоящий bundle проверяет выданное службой разрешение; after-start legacy/manual policy видна и протестирована; fake не заменяет real Kit.",
        "До task:start отдельно подтверждена и штатно выполнена установка Kit текущего проекта; версия/digest/capability проверены. При сбое Kit после установки задачи останавливаются до решения пользователя."
      ],
      "checks": [],
      "commitMessage": "feat: persist autopiloting settings and authorized runs",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M39-autopiloting-runtime.md",
          "required": true,
          "heading": "1. Настройки и журнал запуска"
        },
        {
          "path": "docs/planning/M39-autopiloting-controls.md",
          "required": true,
          "heading": "3. after-start и неполный план"
        },
        {
          "path": "docs/planning/M39-autopiloting-preparation.md",
          "required": true
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/backend-core/clusters/runtime/modules/data-store",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner",
        "docs/architecture/OS-MATRIX.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/HTTP-CONTRACTS.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Разделение autopilot, настройки, журнал запусков и источник команды",
      "why": "Настройки автопилотирования, журнал запусков и источник разрешения"
    },
    {
      "acceptance": [
        "Full после прямого поручения готовит предложение и выбирает/запускает его без дополнительной карточки; after-start ждёт ручного запуска.",
        "Review snapshot применяется к заданию; согласие связано с generation и digest документов; изменение спецификации отменяет допуск.",
        "Failed/disagreed/cancelled и недоступный reviewer не разрешают start; конкурирующие и поздние события не запускают второй план.",
        "Рекомендованный режим проверяется по capability; тесты раздела 1.2 и прежние review-сценарии проходят.",
        "Digest/expected-digest получены публичной командой настоящего нового Kit; интеграция не основана только на fake."
      ],
      "checks": [],
      "commitMessage": "feat: start fully automatic plans after version-bound review",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M39-autopiloting-runtime.md",
          "required": true,
          "heading": "3. Ревью и выбор способа выполнения"
        },
        {
          "path": "docs/planning/M39-autopiloting.md",
          "required": true,
          "heading": "1. Пользовательский контракт"
        },
        {
          "path": "docs/planning/M39-autopiloting-validation.md",
          "required": true,
          "heading": "1.2. Полный автопилот и ревью — T006"
        }
      ],
      "dependencies": [
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view",
        "docs/architecture/OS-MATRIX.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/HTTP-CONTRACTS.md"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Полный цикл подготовки, ревью окончательной версии и автоматический старт",
      "why": "Полный цикл подготовки, ревью окончательной версии и автоматический старт"
    },
    {
      "acceptance": [
        "Сохранённый reconciler выполняет по одному действию; intent/receipt и message id исключают повторы после рестарта.",
        "Более 40 полезных переходов допустимы; повторы ограничены по причине, pending CI и работающие executors отображаются как ожидание.",
        "GitHubCi независимо проверяет exact SHA и обязательные jobs через настроенный gh; отсутствие доступа даёт capability blocker без установки.",
        "Статус-вопрос не отменяет запуск, stop/pause/off и поздние callbacks соблюдают барьер; новый progress CLI не объявляет успех проверок.",
        "Проходят sequential/orchestrated, recovery и OS-сценарии раздела 1.3; контракты обновлены.",
        "Таблица старых/новых действий реализована, единственный отправитель reconciler; одновременные resume/Stop дают один turn.",
        "Question/permission ждёт без расхода попыток; истёкший hook даёт Нужны данные, поздний ответ после stop не продолжает run.",
        "Progress ссылается только на frozen automation.ci; уменьшение requiredChecks или смена policy отвергается; CI failure начатой delivery использует defer."
      ],
      "checks": [],
      "commitMessage": "feat: reconcile autopilot progress across pauses and restarts",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M39-autopiloting-runtime.md",
          "required": true,
          "heading": "5. Продолжение, ожидания и восстановление"
        },
        {
          "path": "docs/planning/M39-autopiloting-controls.md",
          "required": true
        },
        {
          "path": "docs/planning/M39-autopiloting-validation.md",
          "required": true,
          "heading": "1.3. Выполнение и восстановление — T007"
        }
      ],
      "dependencies": [
        "T006"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/backend-core/clusters/projects/modules/git-publish",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view",
        "docs/architecture/OS-MATRIX.md",
        "docs/architecture/CONTRACTS.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "docs/architecture/HTTP-CONTRACTS.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Продолжение задач, ожидание CI и восстановление после перезапуска",
      "why": "Продолжение задач, ожидание CI и восстановление после перезапуска"
    },
    {
      "acceptance": [
        "Служба вызывает общие операции accept/close с source=autopilot и доказательствами, без ложного пользовательского live.",
        "Publishing сохраняется после scope NONE; перезапуск после accept/close/push восстанавливается по фактам.",
        "Scope/owner/branch/upstream/dirty проверки и общий мьютекс защищают от публикации другого результата; кнопка и autopilot используют один сервис.",
        "Публикация завершается после fetch и совпадения ожидаемого SHA; финальный CI не создаёт бесконечные evidence-коммиты.",
        "Настоящий новый Kit проходит раздел 1.4 на временном git-проекте и bare remote; проверки не отложены до delivery.",
        "После close сервис stageCi без хода агента публикует разрешённый SHA на CI-ветку frozen grant; затем выполняет exact-SHA CI и main publish."
      ],
      "checks": [],
      "commitMessage": "feat: finish authorized runs through verified publication",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M39-autopiloting-completion.md",
          "required": true
        },
        {
          "path": "docs/planning/M39-autopiloting-kit.md",
          "required": true,
          "heading": "4. Контракт Kit 2.3.x"
        },
        {
          "path": "docs/planning/M39-autopiloting-validation.md",
          "required": true,
          "heading": "1.4. Завершение и публикация — T008 и T010"
        }
      ],
      "dependencies": [
        "T007"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/backend-core/clusters/projects/modules/git-publish",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view",
        "docs/architecture/OS-MATRIX.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/HTTP-CONTRACTS.md"
      ],
      "fixes": null,
      "id": "T008",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Автоматическая приёмка, закрытие и проверенная публикация",
      "why": "Автоматическая приёмка, закрытие и проверенная публикация"
    },
    {
      "acceptance": [
        "Карточка Автопилотирование показывает точные режимы и review, сохраняет настройки через backend и корректно разрешает гонки revision.",
        "Переключатель review перенесён из sidebar; фактические результаты и действия ревью остаются.",
        "Система и Общий доступ к чатам ChatGPT закрыты по умолчанию до отдельных строк, раскрываются клавиатурой и имеют общий panel radius.",
        "Polling/навигация сохраняют раскрытие; desktop/iPad и обе темы проверены, после close видна стадия публикации.",
        "Тесты раздела 1.5 и контракт доступности пройдены; design-qa и OS-MATRIX обновлены.",
        "До start видна effective legacy/manual-acceptance policy; вопрос/истёкший hook и точки остановки показываются по фактам."
      ],
      "checks": [],
      "commitMessage": "feat: add autopiloting settings and collapsible service cards",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M39-autopiloting-ui.md",
          "required": true
        },
        {
          "path": "docs/planning/M39-autopiloting.md",
          "required": true,
          "heading": "1. Пользовательский контракт"
        },
        {
          "path": "docs/planning/M39-autopiloting-validation.md",
          "required": true,
          "heading": "1.5. Панель — T009"
        }
      ],
      "dependencies": [
        "T008"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "product-parts/control-panel/clusters/web-panel/modules/session-view",
        "docs/usage.md",
        "design-qa.md",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T009",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Settings: режимы, перенос ревью и свёрнутые служебные карточки",
      "why": "Settings: режимы, перенос ревью и свёрнутые служебные карточки"
    },
    {
      "acceptance": [
        "Настоящий bundle/служба/канал проверены на полной матрице режимов/review/sequential/orchestrated, включая вопросы, после-close CI и restart.",
        "Source→grant→реальный переход→remote SHA прослеживаются отдельно; Stop + кнопки + поздние callbacks не дублируют действия.",
        "Дефекты DONE-задач оформляются отдельными fixes-задачами через plan:extend, не исправляются скрыто в тестовой задаче.",
        "Evidence честно разделяет тестовые адаптеры, реальные провайдеры и непроведённый пользовательский live."
      ],
      "checks": [],
      "commitMessage": "test: cover complete autopiloting lifecycle and controls",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M39-autopiloting-validation.md",
          "required": true
        },
        {
          "path": "docs/planning/M39-autopiloting-completion.md",
          "required": true
        }
      ],
      "dependencies": [
        "T009"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/test",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/projects/modules/git-publish/test",
        "product-parts/backend-core/clusters/projects/modules/git-publish/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "docs/evidence/M39-acceptance.md",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T010",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Сквозные проверки полной связки и регрессии управления",
      "why": "Сквозные проверки полной связки и регрессии управления"
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
        "T008",
        "T009",
        "T010"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M39-autopiloting.md",
        "docs/architecture/workflow-kit/WorkflowKitCommands.md",
        "docs/architecture/workflow-kit/WorkflowKitRecovery.md",
        "docs/architecture/OS-MATRIX.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/HTTP-CONTRACTS.md",
        "docs/architecture/workflow-kit/WorkflowKitProcess.md",
        "docs/architecture/workflow-kit/WorkflowKitExecutionModes.md",
        "docs/architecture/workflow-kit/WorkflowKitInstallation.md",
        "docs/architecture/workflow-kit/WorkflowKitHost.md",
        "docs/architecture/workflow-kit/WorkflowKitHostInstallation.md",
        "docs/usage.md",
        "design-qa.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/projects/modules/git-publish/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "docs/evidence/M39-acceptance.md"
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
        "Версия приложения свободна; CHANGELOG/evidence фиксируют фактический итоговый KIT_VERSION, source SHA и digest бандла, одинакового номера с разным содержимым нет.",
        "Сборка и установка выполнены штатно, wfk doctor --installed и installed-service успешны для поставленного релиза.",
        "Настройки мигрируют с mode=off; инструкции актуальны. Kit проекта обновлён между T004/T005 и после позднейших изменений ядра по отдельно согласованной процедуре; runtime руками не меняется.",
        "В evidence отдельно записаны проверки установленного приложения и оставшиеся live-проверки пользователя."
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: deliver Workflow Kit 0.15.0 autopiloting",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M39-autopiloting-validation.md",
          "required": true,
          "heading": "2. Поставка и проверки коммитов"
        },
        {
          "path": "docs/planning/M39-autopiloting-preparation.md",
          "required": true,
          "heading": "3. Проверяемый bootstrap Kit для самого M39"
        },
        {
          "path": "docs/planning/M39-autopiloting-ui.md",
          "required": true
        }
      ],
      "dependencies": [
        "T010",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "docs/evidence/M39-acceptance.md",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T011",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Поставка Workflow Kit 0.15.0 и проверка установленной службы",
      "why": "Поставка Workflow Kit 0.15.0 и проверка установленной службы"
    },
    {
      "acceptance": [
        "CI для точного pushed SHA на ci/M39-autopiloting успешен на macOS, Linux, Windows x64 и ARM64; последний проверенный SHA назван явно.",
        "Проверены одноразовые end-to-end сценарии доступных провайдеров; отдельно записаны реальные и fake результаты, repo/remote SHA и число подтверждений.",
        "Пользовательская macOS и Windows-приёмка имеют фактический статус и владельца; непроведённые проверки не отмечены успешными.",
        "M39 готов к пользовательской приёмке; автоматической самоприёмки, закрытия и push main внутри этой задачи нет.",
        "Красный CI начатой T012: defer и fixes round; при изменении артефакта новая delivery D002 со следующим patch (обычно 0.15.1), installed-service и зависимостью T012 от D002. После DONE создаётся новая CI-задача; DONE не меняются."
      ],
      "checks": [],
      "commitMessage": "test: verify M39 cross-platform delivery and live evidence",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M39-autopiloting-validation.md",
          "required": true
        },
        {
          "path": "docs/planning/M39-autopiloting-preparation.md",
          "required": true,
          "heading": "4. Версии ядра и повторная поставка"
        }
      ],
      "dependencies": [
        "T011",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M39-acceptance.md",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T012",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Четыре платформы CI и факты сквозных прогонов",
      "why": "Четыре платформы CI и факты сквозных прогонов"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: M39-autopiloting (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 0/13
- Revision: 1165

## Objective

Два включаемых режима автопилотирования до проверенной публикации: после ручного запуска плана и от прямого поручения подготовить спецификацию; новая карточка Settings и свёрнутые служебные карточки.

## Acceptance

- После ручного запуска Плана проходит весь согласованный цикл до удалённого SHA без промежуточных подтверждений.
- Полный автопилот начинает подготовку только по прямой команде пользователя и автоматически проводит ревью при включённой настройке, выбор режима и запуск.
- Неуспешное/устаревшее ревью, обязательный CI или ручной критерий не обходятся; история честно различает автоматическую и пользовательскую приёмку.
- Состояние переживает перезапуск, не повторяет завершённые действия; явные pause/stop/off имеют приоритет.
- Settings содержат точные названия режимов и review; обе служебные карточки свёрнуты по умолчанию и используют согласованные скругления.
- Инструкции, recovery, проверки backend и оба решателя согласованы; старые проекты получают корректный upgrade path.
- Обязательные проверки и CI четырёх платформ пройдены; доказательства реальных прогонов и непроверенных live-сценариев явно разделены.

## Rounds

### R1 — Implementation (implementation, OPEN)

- [TODO] T001 — Kit: схема automation и CI, digest предложения, recovery (work)
  - Commit: feat: add reviewed automation schema and proposal digest
  - Files: product-parts/kit-core/clusters/project-workflow/modules/workflow-plan, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery, product-parts/kit-core/clusters/project-workflow/modules/workflow-execution-mode, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle, tools/kit-build, docs/architecture/workflow-kit/WorkflowKitCommands.md, docs/architecture/workflow-kit/WorkflowKitRecovery.md, docs/architecture/OS-MATRIX.md
- [TODO] T002 — Kit: host-разрешения и проверяемые переходы поставки и приёмки (work)
  - Commit: feat: require host authority for autopilot transitions
  - Files: product-parts/kit-core/clusters/project-workflow/modules/workflow-plan, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery, product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot, product-parts/kit-core/clusters/project-workflow/modules/workflow-git, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/backend-core/clusters/runtime/modules/cli, docs/architecture/workflow-kit/WorkflowKitCommands.md, docs/architecture/CONTRACTS.md, docs/architecture/OS-MATRIX.md, docs/architecture/HTTP-CONTRACTS.md
  - Depends on: T001
- [TODO] T003 — Kit: откладывание начатой delivery и исправления после красного CI (work)
  - Commit: feat: defer unfinished delivery for fixes rounds
  - Files: product-parts/kit-core/clusters/project-workflow/modules/workflow-plan, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit, product-parts/kit-core/clusters/project-workflow/modules/workflow-git, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle, docs/architecture/workflow-kit/WorkflowKitCommands.md, docs/architecture/workflow-kit/WorkflowKitProcess.md, docs/architecture/OS-MATRIX.md
  - Depends on: T002
- [TODO] T004 — Единые инструкции Kit и wfk, capability и обновление проекта (work)
  - Commit: feat: align Kit instructions with authorized autopiloting
  - Files: product-parts/kit-core/clusters/project-workflow/modules/workflow-installer, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery, product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner, product-parts/workflow-engine/clusters/kit-host/modules/kit-update, product-parts/workflow-engine/clusters/kit-host/modules/plan-view, product-parts/backend-core/clusters/projects/modules/kit-structure, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, docs/architecture/workflow-kit/WorkflowKitProcess.md, docs/architecture/workflow-kit/WorkflowKitExecutionModes.md, docs/architecture/workflow-kit/WorkflowKitInstallation.md, docs/architecture/workflow-kit/WorkflowKitHost.md, docs/architecture/workflow-kit/WorkflowKitHostInstallation.md, docs/architecture/OS-MATRIX.md
  - Depends on: T003
- [TODO] T005 — Разделение autopilot, настройки, журнал запусков и источник команды (work)
  - Commit: feat: persist autopiloting settings and authorized runs
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, product-parts/workflow-engine/clusters/session-loop/modules/plan-review, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/backend-core/clusters/runtime/modules/data-store, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner, docs/architecture/OS-MATRIX.md, docs/architecture/CONTRACTS.md, docs/architecture/HTTP-CONTRACTS.md
  - Depends on: T004
- [TODO] T006 — Полный цикл подготовки, ревью окончательной версии и автоматический старт (work)
  - Commit: feat: start fully automatic plans after version-bound review
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/plan-review, product-parts/workflow-engine/clusters/session-loop/modules/cross-review, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner, product-parts/workflow-engine/clusters/kit-host/modules/plan-view, docs/architecture/OS-MATRIX.md, docs/architecture/CONTRACTS.md, docs/architecture/HTTP-CONTRACTS.md
  - Depends on: T005
- [TODO] T007 — Продолжение задач, ожидание CI и восстановление после перезапуска (work)
  - Commit: feat: reconcile autopilot progress across pauses and restarts
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/backend-core/clusters/projects/modules/git-publish, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner, product-parts/workflow-engine/clusters/kit-host/modules/plan-view, docs/architecture/OS-MATRIX.md, docs/architecture/CONTRACTS.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, docs/architecture/HTTP-CONTRACTS.md
  - Depends on: T006
- [TODO] T008 — Автоматическая приёмка, закрытие и проверенная публикация (work)
  - Commit: feat: finish authorized runs through verified publication
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/backend-core/clusters/projects/modules/git-publish, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner, product-parts/workflow-engine/clusters/kit-host/modules/plan-view, docs/architecture/OS-MATRIX.md, docs/architecture/CONTRACTS.md, docs/architecture/HTTP-CONTRACTS.md
  - Depends on: T007
- [TODO] T009 — Settings: режимы, перенос ревью и свёрнутые служебные карточки (work)
  - Commit: feat: add autopiloting settings and collapsible service cards
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell, product-parts/control-panel/clusters/web-panel/modules/session-view, docs/usage.md, design-qa.md, docs/architecture/OS-MATRIX.md
  - Depends on: T008
- [TODO] T010 — Сквозные проверки полной связки и регрессии управления (work)
  - Commit: test: cover complete autopiloting lifecycle and controls
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/backend-core/clusters/runtime/modules/cli/test, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/projects/modules/git-publish/test, product-parts/backend-core/clusters/projects/modules/git-publish/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/test, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, docs/evidence/M39-acceptance.md, docs/architecture/OS-MATRIX.md
  - Depends on: T009
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M39-autopiloting.md, docs/architecture/workflow-kit/WorkflowKitCommands.md, docs/architecture/workflow-kit/WorkflowKitRecovery.md, docs/architecture/OS-MATRIX.md, docs/architecture/CONTRACTS.md, docs/architecture/HTTP-CONTRACTS.md, docs/architecture/workflow-kit/WorkflowKitProcess.md, docs/architecture/workflow-kit/WorkflowKitExecutionModes.md, docs/architecture/workflow-kit/WorkflowKitInstallation.md, docs/architecture/workflow-kit/WorkflowKitHost.md, docs/architecture/workflow-kit/WorkflowKitHostInstallation.md, docs/usage.md, design-qa.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/projects/modules/git-publish/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, docs/evidence/M39-acceptance.md
  - Depends on: T001, T002, T003, T004, T005, T006, T007, T008, T009, T010
- [TODO] T011 — Поставка Workflow Kit 0.15.0 и проверка установленной службы (delivery)
  - Commit: chore: deliver Workflow Kit 0.15.0 autopiloting
  - Files: package.json, package-lock.json, CHANGELOG.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, docs/evidence/M39-acceptance.md, docs/architecture/OS-MATRIX.md
  - Depends on: T010, DOCS-R1
- [TODO] T012 — Четыре платформы CI и факты сквозных прогонов (delivery)
  - Commit: test: verify M39 cross-platform delivery and live evidence
  - Files: docs/evidence/M39-acceptance.md, docs/architecture/OS-MATRIX.md
  - Depends on: T011, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
