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
  "revision": 1207,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "Kit 2.3.3: scope.automation, scope:proposal --digest, autopilot:authorize/revoke, accept/close --autopilot-run (host), task:defer-delivery",
          "autopilot: настройки, RunRecord (wait, retries, completion), createRuns/Preparation/RunTurns/RunControl/RunWaits/RunCompletion, RunBrief",
          "HTTP: /api/settings/autopiloting, autopiloting/pause|resume|stop|policy, /api/sessions/progress|run; раздел autopiloting",
          "git-publish: publish с ExpectedPublication, stageCi, createPublisher, GitHubCi (gh), push-auth",
          "CLI: wfk session plan --authorized, wfk session progress --input, wfk session run pause|stop",
          "Панель: карточка «Автопилотирование», collapsible-карточки, runView/runCard, policyLine"
        ],
        "decisions": [
          "Kit 2.3.3 установлен в Workflow_Kit между T004 и T005 по согласию пользователя «Установить и разрешить следующие»",
          "Приёмку, закрытие и публикацию выполняет служба через host-тикеты; агенту они не поручаются",
          "Доказательство CI хранится в журнале запуска вне git: коммит доказательства не создаёт новый SHA",
          "Кнопка «Опубликовать» и запуски используют один publisher под мьютексом project:<id>",
          "T009 расширен на модуль autopilot (task:update): сводка запуска обновляется после любой записи журнала",
          "Дефект T007 найден сквозным тестом T010 и исправлен отдельной fixes-задачей F001",
          "Защита старта M11 в автопилоте оставлена как есть; своя блокировка — решение пользователя"
        ],
        "references": [
          "docs/planning/M39-autopiloting.md",
          "docs/planning/M39-autopiloting-validation.md",
          "docs/evidence/M39-acceptance.md",
          "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md",
          "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting-completion.md",
          "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/autopilot.md",
          "docs/architecture/HTTP-CONTRACTS.md",
          "docs/usage.md#автопилотирование"
        ],
        "result": "M39 R1: Kit 2.3.3 (automation, host-тикеты, defer-delivery); служба — настройки, журнал запусков, подготовка с ревью версии, ходы без предела 40, пауза/стоп, ожидания CI и вопросов, восстановление, приёмка, закрытие, stageCi и проверенная публикация; панель — «Автопилотирование», свёрнутые карточки, карточка запуска; сквозные тесты; F001."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "CLOSED",
      "title": "Implementation"
    },
    {
      "digest": {
        "contracts": [
          "autopilot: realRoot, rootKey, sameRoot (src/root-path.ts); createHostTickets({ platform? })"
        ],
        "decisions": [
          "T012 отложена по процедуре красного CI (task:defer-delivery, попытка 1), исправление вынесено в fixes round R2",
          "Приложение меняется — новая поставка D002 (0.15.1); T012 зависит от D002",
          "Сравнение корня делает служба; Kit присылает свой корень без изменений, ядро не меняется"
        ],
        "references": [
          "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
          "docs/architecture/OS-MATRIX.md",
          "docs/evidence/M39-acceptance.md"
        ],
        "result": "R2 исправил дефект Windows, найденный CI d1ffd1b: host-тикет сравнивает корень проекта через realpathSync.native и с учётом платформы (8.3, регистр, слеши, префикс \\\\?\\). На Windows x64 и ARM64 host-команды автопилота больше не отвергаются как «ticket bound to another root»."
      },
      "id": "R2",
      "kind": "fixes",
      "status": "OPEN",
      "title": "Windows: host-тикет и корень проекта"
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
      },
      {
        "at": "2026-11-16T18:08:56.790Z",
        "text": "Owner session moved from 01a1e55e-7184-7ab3-a3ff-d5e3a7e77b2a to 25cedd72-7908-49d9-9f21-79cfca178443: The user started the plan from this session in the Workflow Kit panel"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": "25cedd72-7908-49d9-9f21-79cfca178443",
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
        "docs/architecture/OS-MATRIX.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-execution-mode/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-execution-mode/src/workflow-execution-mode-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-execution-mode/test/workflow-execution-mode-facade.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/operations.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-automation.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-ci-config.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-args.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-execution.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-scope-create.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-status.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-automation.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-execution-mode.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/automation.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-automation.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-document.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-input-schema-automation.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-input-schema.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-model.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-scope-completion.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-transitions.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-validation.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/workflow-plan-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-automation.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-sections.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-objective.test.mjs",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle-meta.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.7.mjs.gz",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.3.0.mjs.gz"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
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
        "docs/architecture/HTTP-CONTRACTS.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-journal.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/autopilot.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/operations.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-autopilot-status.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-autopilot.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-autopilot.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-scope.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-text.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-facade-base.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-host-auth.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-scope.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-status.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-task.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-cli.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-autopilot-grant.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-autopilot-support.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-host-ipc.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/authorization.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-authorization-input.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-authorization.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-autopilot-completion.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-model.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-scope-completion.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-transitions.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-validation.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/workflow-plan-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-authorization.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-sections.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle-meta.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.3.0.mjs.gz",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.3.1.mjs.gz",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/src/host-run.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/src/index.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/src/runner.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/test/host-run.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/host-ticket.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/host-ticket.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
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
        "docs/architecture/OS-MATRIX.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-journal.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/operations.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-scope.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-delivery-defer.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-facade-base.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-delivery-defer.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-delivery-defer.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-model.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-validation.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/workflow-plan-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-delivery-defer.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-sections.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle-meta.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/test/delivery-defer.test.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.3.1.mjs.gz",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.3.2.mjs.gz"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
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
        "docs/architecture/OS-MATRIX.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-autopilot-status.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/autopilot.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-autopilot-grant.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/module.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/templates.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/test/question-hook.test.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/src/autopilot-decision.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/src/autopilot-model.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/test/workflow-autopilot-authority.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-texts.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-autopilot.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-roles.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-sections.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-autopilot.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-roles.test.mjs",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle-meta.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.3.2.mjs.gz",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.3.3.mjs.gz",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/test/host-run.test.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/test/kit-update-instructions.test.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/autopilot-support.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/index.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/test/autopilot-support.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/texts.ts"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
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
        "docs/architecture/HTTP-CONTRACTS.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/commands.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-command.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/autopiloting.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/types.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/user-words.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/user-words.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot-types.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/decide-model.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/decide-orchestration.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/decide.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-journal.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-kit.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-texts.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs-routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/settings.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/runs-real.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/runs.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/settings.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/start.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/routes.ts"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
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
        "docs/architecture/HTTP-CONTRACTS.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-links.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/autopiloting.test.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/src/runner.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/index.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/kit-types.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot-types.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-kit.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-prepare.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-texts.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/prepare-real.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/prepare.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/runs.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/contract.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/rounds.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/store.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/version.test.ts"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
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
        "docs/architecture/HTTP-CONTRACTS.md",
        "product-parts/backend-core/clusters/projects/modules/git-publish/module.md",
        "product-parts/backend-core/clusters/projects/modules/git-publish/src/github-ci.ts",
        "product-parts/backend-core/clusters/projects/modules/git-publish/src/index.ts",
        "product-parts/backend-core/clusters/projects/modules/git-publish/test/github-ci.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/commands.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-links.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-command.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-run-command.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/autopiloting.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot-types.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/decide-model.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/decide-orchestration.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/decide.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-control.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-journal.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-kit.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-turns.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-waits.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs-routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/texts.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/decide-matrix.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/run-control.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/run-turns.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/runs-ci-real.test.ts"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
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
        "docs/architecture/HTTP-CONTRACTS.md",
        "product-parts/backend-core/clusters/projects/modules/git-publish/module.md",
        "product-parts/backend-core/clusters/projects/modules/git-publish/src/index.ts",
        "product-parts/backend-core/clusters/projects/modules/git-publish/src/publication.ts",
        "product-parts/backend-core/clusters/projects/modules/git-publish/src/routes.ts",
        "product-parts/backend-core/clusters/projects/modules/git-publish/test/publish-expected.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting-completion.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-complete.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-journal.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-kit.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-waits.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/complete-real.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/complete.test.ts"
      ],
      "fixes": null,
      "id": "T008",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
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
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "docs/usage.md",
        "design-qa.md",
        "docs/architecture/OS-MATRIX.md",
        "docs/architecture/HTTP-CONTRACTS.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/files.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/api.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/autopiloting-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/autopiloting-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/card-grid.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/cards.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/controls.css",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/index.html",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/settings.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/shared-access-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/system-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/autopiloting-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/plan-cards.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/run-card.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/run-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/run-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/sidebar-view.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/run-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-brief.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-complete.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-journal.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs-routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/runs.test.ts"
      ],
      "fixes": null,
      "id": "T009",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
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
        "docs/architecture/OS-MATRIX.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/lifecycle-real.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/orchestrated-real.test.ts"
      ],
      "fixes": null,
      "id": "T010",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Сквозные проверки полной связки и регрессии управления",
      "why": "Сквозные проверки полной связки и регрессии управления"
    },
    {
      "acceptance": [
        "«Продолжить» идущего (не приостановленного) запуска возвращает его runId и не меняет запуск",
        "Пока владелец работает или у него в очереди уже есть продолжение запуска, «Продолжить» не ставит второе сообщение",
        "Повторный старт во время отправки возвращает runId того же запуска",
        "Сквозной тест на настоящем бандле проверяет: перезапуск службы и «Продолжить» дают одно сообщение"
      ],
      "checks": [],
      "commitMessage": "fix: keep one message when a running autopilot run is resumed",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M39-autopiloting-validation.md",
          "required": true,
          "heading": "1.3. Выполнение и восстановление — T007"
        }
      ],
      "dependencies": [
        "T010"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/lifecycle-real.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/run-turns.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/runs.test.ts"
      ],
      "fixes": "T007",
      "id": "F001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "«Продолжить» идущего запуска без второго сообщения",
      "why": "T010 нашёл на настоящем бандле: runs.resume возвращает null для идущего запуска, поэтому autopilot.resume не видит запуск и ставит второе сообщение (RESUME_MESSAGE) рядом с продолжением после перезапуска или ходом владельца; повторный старт отвечает без runId"
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
        "T010",
        "F001"
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
        "docs/evidence/M39-acceptance.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-execution-mode/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/operations.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/automation.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/autopilot.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/authorization.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/module.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/commands.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting-completion.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/files.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md"
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
        "Версия приложения свободна; CHANGELOG/evidence фиксируют фактический итоговый KIT_VERSION, source SHA и digest бандла, одинакового номера с разным содержимым нет.",
        "Сборка и установка выполнены штатно, wfk doctor --installed и installed-service успешны для поставленного релиза.",
        "Настройки мигрируют с mode=off; инструкции актуальны. Kit проекта обновлён между T004/T005 и после позднейших изменений ядра по отдельно согласованной процедуре; runtime руками не меняется.",
        "В evidence отдельно записаны проверки установленного приложения и оставшиеся live-проверки пользователя."
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: deliver Workflow Kit 0.15.0 autopiloting",
      "confirmation": "Подтверждаю",
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
        "README.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "docs/evidence/M39-acceptance.md",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T011",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Поставка Workflow Kit 0.15.0 и проверка установленной службы",
      "why": "Поставка Workflow Kit 0.15.0 и проверка установленной службы"
    },
    {
      "acceptance": [
        "Тикет принимает корень проекта, который Kit называет иначе, чем служба: короткое имя 8.3, другой регистр и прямые слеши на Windows",
        "Сравнение корня зависит от платформы, переданной параметром; ветки win32 и linux покрыты тестами с инъекцией платформы",
        "Другой проект по-прежнему отвергается с причиной root",
        "Тесты на настоящем бандле (runs-real, runs-ci-real, complete-real, prepare-real, lifecycle-real, orchestrated-real, host-run) проходят в CI на Windows x64 и ARM64"
      ],
      "checks": [],
      "commitMessage": "fix: match the project root of a host ticket on Windows",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M39-autopiloting-validation.md",
          "required": true,
          "heading": "1.0. Ядро и генерируемые инструкции — T001–T004"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/host-ticket.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/root-path.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-kit.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/root-path.test.ts"
      ],
      "fixes": "T002",
      "id": "F002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "DONE",
      "title": "Host-тикет узнаёт корень проекта на Windows",
      "why": "CI d1ffd1b (run 43996726304): на Windows x64 и ARM64 все host-команды отвергнуты «ticket bound to another root» — служба привязывает тикет к пути проекта в виде, отличном от пути Kit (короткое имя 8.3, регистр, разделители); автопилот на Windows не работает"
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
        "F002"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/architecture/OS-MATRIX.md"
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
        "Версия 0.15.1 свободна; CHANGELOG и evidence фиксируют KIT_VERSION, source SHA и digest бандла",
        "Сборка и установка штатные, wfk doctor --installed и installed-service успешны для 0.15.1",
        "Evidence называет причину красного CI d1ffd1b и исправление F002"
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: deliver Workflow Kit 0.15.1",
      "confirmation": "я принимаю доп задачи - выполняй без пауз все",
      "context": [],
      "dependencies": [
        "F002",
        "DOCS-R2"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "README.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "docs/evidence/M39-acceptance.md",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "D002",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R2",
      "status": "DONE",
      "title": "Поставка Workflow Kit 0.15.1 и проверка установленной службы",
      "why": "Исправление F002 меняет приложение: нужна следующая patch-версия, штатная переустановка и installed-service"
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
        "DOCS-R2",
        "D002"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M39-acceptance.md",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T012",
      "iteration": 2,
      "kind": "delivery",
      "roundId": "R2",
      "status": "TODO",
      "title": "Четыре платформы CI и факты сквозных прогонов",
      "why": "Четыре платформы CI и факты сквозных прогонов",
      "deferrals": [
        {
          "at": "2026-11-17T01:42:03.397Z",
          "confirmation": "Подтверждая",
          "iteration": 1,
          "outcome": null,
          "reason": "CI failed on Windows x64 and ARM64 for d1ffd1b (host ticket: ticket bound to another root, 11 tests): https://github.com/OleynikAleksandr/Workflow_Kit/actions/runs/43996726304"
        }
      ]
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
- Progress: 16/17
- Revision: 1207

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

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Kit: схема automation и CI, digest предложения, recovery (work)
  - Commit: feat: add reviewed automation schema and proposal digest
  - Files: product-parts/kit-core/clusters/project-workflow/modules/workflow-plan, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery, product-parts/kit-core/clusters/project-workflow/modules/workflow-execution-mode, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle, tools/kit-build, docs/architecture/workflow-kit/WorkflowKitCommands.md, docs/architecture/workflow-kit/WorkflowKitRecovery.md, docs/architecture/OS-MATRIX.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-execution-mode/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-execution-mode/src/workflow-execution-mode-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-execution-mode/test/workflow-execution-mode-facade.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/operations.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-automation.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-ci-config.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-args.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-execution.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-scope-create.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-status.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-automation.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-execution-mode.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/automation.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-automation.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-document.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-input-schema-automation.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-input-schema.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-model.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-scope-completion.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-transitions.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-validation.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/workflow-plan-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-automation.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-sections.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-objective.test.mjs, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle-meta.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.7.mjs.gz, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.3.0.mjs.gz
- [DONE] T002 — Kit: host-разрешения и проверяемые переходы поставки и приёмки (work)
  - Commit: feat: require host authority for autopilot transitions
  - Files: product-parts/kit-core/clusters/project-workflow/modules/workflow-plan, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery, product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot, product-parts/kit-core/clusters/project-workflow/modules/workflow-git, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/backend-core/clusters/runtime/modules/cli, docs/architecture/workflow-kit/WorkflowKitCommands.md, docs/architecture/CONTRACTS.md, docs/architecture/OS-MATRIX.md, docs/architecture/HTTP-CONTRACTS.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-journal.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/autopilot.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/operations.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-autopilot-status.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-autopilot.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-autopilot.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-scope.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-text.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-facade-base.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-host-auth.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-scope.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-status.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-task.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-cli.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-autopilot-grant.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-autopilot-support.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-host-ipc.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/authorization.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-authorization-input.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-authorization.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-autopilot-completion.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-model.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-scope-completion.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-transitions.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-validation.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/workflow-plan-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-authorization.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-sections.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle-meta.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.3.0.mjs.gz, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.3.1.mjs.gz, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/src/host-run.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/src/index.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/src/runner.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/test/host-run.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/host-ticket.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/host-ticket.test.ts
  - Depends on: T001
- [DONE] T003 — Kit: откладывание начатой delivery и исправления после красного CI (work)
  - Commit: feat: defer unfinished delivery for fixes rounds
  - Files: product-parts/kit-core/clusters/project-workflow/modules/workflow-plan, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit, product-parts/kit-core/clusters/project-workflow/modules/workflow-git, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle, docs/architecture/workflow-kit/WorkflowKitCommands.md, docs/architecture/workflow-kit/WorkflowKitProcess.md, docs/architecture/OS-MATRIX.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-journal.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/operations.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-scope.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-delivery-defer.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-facade-base.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-delivery-defer.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-delivery-defer.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-model.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-validation.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/workflow-plan-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-delivery-defer.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-sections.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle-meta.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/test/delivery-defer.test.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.3.1.mjs.gz, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.3.2.mjs.gz
  - Depends on: T002
- [DONE] T004 — Единые инструкции Kit и wfk, capability и обновление проекта (work)
  - Commit: feat: align Kit instructions with authorized autopiloting
  - Files: product-parts/kit-core/clusters/project-workflow/modules/workflow-installer, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery, product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner, product-parts/workflow-engine/clusters/kit-host/modules/kit-update, product-parts/workflow-engine/clusters/kit-host/modules/plan-view, product-parts/backend-core/clusters/projects/modules/kit-structure, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, docs/architecture/workflow-kit/WorkflowKitProcess.md, docs/architecture/workflow-kit/WorkflowKitExecutionModes.md, docs/architecture/workflow-kit/WorkflowKitInstallation.md, docs/architecture/workflow-kit/WorkflowKitHost.md, docs/architecture/workflow-kit/WorkflowKitHostInstallation.md, docs/architecture/OS-MATRIX.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-autopilot-status.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/autopilot.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-autopilot-grant.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md, product-parts/backend-core/clusters/projects/modules/kit-structure/module.md, product-parts/backend-core/clusters/projects/modules/kit-structure/src/templates.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/test/question-hook.test.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/src/autopilot-decision.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/src/autopilot-model.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/test/workflow-autopilot-authority.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-texts.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-autopilot.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-roles.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-sections.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-autopilot.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-roles.test.mjs, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle-meta.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.3.2.mjs.gz, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.3.3.mjs.gz, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/test/host-run.test.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/test/kit-update-instructions.test.ts, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/autopilot-support.ts, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/index.ts, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/test/autopilot-support.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/texts.ts
  - Depends on: T003
- [DONE] T005 — Разделение autopilot, настройки, журнал запусков и источник команды (work)
  - Commit: feat: persist autopiloting settings and authorized runs
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, product-parts/workflow-engine/clusters/session-loop/modules/plan-review, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/backend-core/clusters/runtime/modules/data-store, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner, docs/architecture/OS-MATRIX.md, docs/architecture/CONTRACTS.md, docs/architecture/HTTP-CONTRACTS.md, product-parts/backend-core/clusters/runtime/modules/cli/commands.md, product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-command.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/autopiloting.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/types.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/user-words.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/user-words.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot-types.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/decide-model.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/decide-orchestration.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/decide.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-journal.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-kit.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-texts.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs-routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/settings.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/runs-real.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/runs.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/settings.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/start.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/routes.ts
  - Depends on: T004
- [DONE] T006 — Полный цикл подготовки, ревью окончательной версии и автоматический старт (work)
  - Commit: feat: start fully automatic plans after version-bound review
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/plan-review, product-parts/workflow-engine/clusters/session-loop/modules/cross-review, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner, product-parts/workflow-engine/clusters/kit-host/modules/plan-view, docs/architecture/OS-MATRIX.md, docs/architecture/CONTRACTS.md, docs/architecture/HTTP-CONTRACTS.md, product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-links.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/autopiloting.test.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/src/runner.ts, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/index.ts, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/kit-types.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot-types.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-kit.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-prepare.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-texts.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/prepare-real.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/prepare.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/runs.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/contract.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/rounds.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/store.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/version.test.ts
  - Depends on: T005
- [DONE] T007 — Продолжение задач, ожидание CI и восстановление после перезапуска (work)
  - Commit: feat: reconcile autopilot progress across pauses and restarts
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/backend-core/clusters/projects/modules/git-publish, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner, product-parts/workflow-engine/clusters/kit-host/modules/plan-view, docs/architecture/OS-MATRIX.md, docs/architecture/CONTRACTS.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, docs/architecture/HTTP-CONTRACTS.md, product-parts/backend-core/clusters/projects/modules/git-publish/module.md, product-parts/backend-core/clusters/projects/modules/git-publish/src/github-ci.ts, product-parts/backend-core/clusters/projects/modules/git-publish/src/index.ts, product-parts/backend-core/clusters/projects/modules/git-publish/test/github-ci.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/commands.md, product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-links.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-command.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-run-command.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/autopiloting.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot-types.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/decide-model.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/decide-orchestration.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/decide.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-control.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-journal.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-kit.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-turns.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-waits.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs-routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/texts.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/decide-matrix.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/run-control.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/run-turns.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/runs-ci-real.test.ts
  - Depends on: T006
- [DONE] T008 — Автоматическая приёмка, закрытие и проверенная публикация (work)
  - Commit: feat: finish authorized runs through verified publication
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/backend-core/clusters/projects/modules/git-publish, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner, product-parts/workflow-engine/clusters/kit-host/modules/plan-view, docs/architecture/OS-MATRIX.md, docs/architecture/CONTRACTS.md, docs/architecture/HTTP-CONTRACTS.md, product-parts/backend-core/clusters/projects/modules/git-publish/module.md, product-parts/backend-core/clusters/projects/modules/git-publish/src/index.ts, product-parts/backend-core/clusters/projects/modules/git-publish/src/publication.ts, product-parts/backend-core/clusters/projects/modules/git-publish/src/routes.ts, product-parts/backend-core/clusters/projects/modules/git-publish/test/publish-expected.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting-completion.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-complete.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-journal.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-kit.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-waits.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/complete-real.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/complete.test.ts
  - Depends on: T007
- [DONE] T009 — Settings: режимы, перенос ревью и свёрнутые служебные карточки (work)
  - Commit: feat: add autopiloting settings and collapsible service cards
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell, product-parts/control-panel/clusters/web-panel/modules/session-view, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, docs/usage.md, design-qa.md, docs/architecture/OS-MATRIX.md, docs/architecture/HTTP-CONTRACTS.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/files.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/api.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/autopiloting-card.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/autopiloting-model.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/card-grid.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/cards.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/controls.css, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/index.html, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/settings.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/shared-access-card.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/system-card.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/autopiloting-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/src/plan-cards.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/run-card.css, product-parts/control-panel/clusters/web-panel/modules/session-view/src/run-card.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/run-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/sidebar-view.js, product-parts/control-panel/clusters/web-panel/modules/session-view/test/run-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-brief.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-complete.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-journal.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs-routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/runs.test.ts
  - Depends on: T008
- [DONE] T010 — Сквозные проверки полной связки и регрессии управления (work)
  - Commit: test: cover complete autopiloting lifecycle and controls
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/backend-core/clusters/runtime/modules/cli/test, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/projects/modules/git-publish/test, product-parts/backend-core/clusters/projects/modules/git-publish/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/test, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, docs/evidence/M39-acceptance.md, docs/architecture/OS-MATRIX.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/lifecycle-real.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/orchestrated-real.test.ts
  - Depends on: T009
- [DONE] F001 — «Продолжить» идущего запуска без второго сообщения (work)
  - Commit: fix: keep one message when a running autopilot run is resumed
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot, docs/architecture/OS-MATRIX.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/lifecycle-real.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/run-turns.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/runs.test.ts
  - Depends on: T010
  - Fixes: T007
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M39-autopiloting.md, docs/architecture/workflow-kit/WorkflowKitCommands.md, docs/architecture/workflow-kit/WorkflowKitRecovery.md, docs/architecture/OS-MATRIX.md, docs/architecture/CONTRACTS.md, docs/architecture/HTTP-CONTRACTS.md, docs/architecture/workflow-kit/WorkflowKitProcess.md, docs/architecture/workflow-kit/WorkflowKitExecutionModes.md, docs/architecture/workflow-kit/WorkflowKitInstallation.md, docs/architecture/workflow-kit/WorkflowKitHost.md, docs/architecture/workflow-kit/WorkflowKitHostInstallation.md, docs/usage.md, design-qa.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/projects/modules/git-publish/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, docs/evidence/M39-acceptance.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-execution-mode/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/operations.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/automation.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/autopilot.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/authorization.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/module.md, product-parts/backend-core/clusters/projects/modules/kit-structure/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/module.md, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md, product-parts/backend-core/clusters/runtime/modules/cli/commands.md, product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting-completion.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/files.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md
  - Depends on: T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, F001
- [DONE] T011 — Поставка Workflow Kit 0.15.0 и проверка установленной службы (delivery)
  - Commit: chore: deliver Workflow Kit 0.15.0 autopiloting
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, docs/evidence/M39-acceptance.md, docs/architecture/OS-MATRIX.md
  - Depends on: T010, DOCS-R1

Digest: M39 R1: Kit 2.3.3 (automation, host-тикеты, defer-delivery); служба — настройки, журнал запусков, подготовка с ревью версии, ходы без предела 40, пауза/стоп, ожидания CI и вопросов, восстановление, приёмка, закрытие, stageCi и проверенная публикация; панель — «Автопилотирование», свёрнутые карточки, карточка запуска; сквозные тесты; F001.

### R2 — Windows: host-тикет и корень проекта (fixes, OPEN)

- [DONE] F002 — Host-тикет узнаёт корень проекта на Windows (work)
  - Commit: fix: match the project root of a host ticket on Windows
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot, docs/architecture/OS-MATRIX.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/host-ticket.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/root-path.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-kit.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/root-path.test.ts
  - Fixes: T002
- [DONE] DOCS-R2 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R2
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/architecture/OS-MATRIX.md
  - Depends on: F002
- [DONE] D002 — Поставка Workflow Kit 0.15.1 и проверка установленной службы (delivery)
  - Commit: chore: deliver Workflow Kit 0.15.1
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, docs/evidence/M39-acceptance.md, docs/architecture/OS-MATRIX.md
  - Depends on: F002, DOCS-R2
- [TODO] T012 — Четыре платформы CI и факты сквозных прогонов (delivery)
  - Commit: test: verify M39 cross-platform delivery and live evidence
  - Files: docs/evidence/M39-acceptance.md, docs/architecture/OS-MATRIX.md
  - Depends on: T011, DOCS-R2, D002

Digest: R2 исправил дефект Windows, найденный CI d1ffd1b: host-тикет сравнивает корень проекта через realpathSync.native и с учётом платформы (8.3, регистр, слеши, префикс \\?\). На Windows x64 и ARM64 host-команды автопилота больше не отвергаются как «ticket bound to another root».

State changes only through `scripts/workflow` commands. History lives in Git.
