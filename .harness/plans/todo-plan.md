# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": "T004",
  "lastClosed": {
    "closedAt": "2026-11-16T08:55:12.078Z",
    "scopeId": "M36-plan-question-stale"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 1129,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "autopilot: accept/close(projectId, note?, session?), tidy(projectId, session?) → { owner, paths }; POST /api/projects/:id/workflow/tidy; отказы 409 dirty-tree, no-scope, not-finished, clean, no-owner, owner-unavailable.",
          "autopilot: AutopilotReason и STOP_LABELS += accepted, closed; createPlanEnd (src/acceptance.ts); тексты acceptedMessage, closedMessage, tidyMessage, tidyNote, dirtyTreeText, CLEAN_TEXTS.",
          "plan-view: KitStatus.changes?, PlanView.dirty — пути вне коммитов в фазах acceptance и accepted.",
          "session-view: planView.dirty, plan-dirty.js (dirtyBlock, dirtyText), crossReviewView.current, showsReview, REASON_LABELS accepted/closed.",
          "Kit 2.2.6: .harness/inputs/ в .gitignore и секции AGENTS.md, строка схемы, next с путями, DIRTY_TREE с путями в сообщении и nextAction."
        ],
        "decisions": [
          "Приёмка и закрытие из панели не зависят от агента: владельца нет или он вне процесса Kit — команда Kit выполняется, сообщение не ставится.",
          "Служба сама не удаляет и не коммитит файлы проекта: это делает агент по сообщению tidy или пользователь.",
          "Метки accepted и closed не обещают закрытия; decide() поправляет устаревшую метку и после приёмки или закрытия словами в чате.",
          "Законченное ревью показывается основной сессии, только пока его scope — открытое предложение или активный scope.",
          "tidy не включает автопилот; будущий полный автопилот (M33) сможет вызывать его перед close."
        ],
        "references": [
          "docs/planning/M37-plan-close-flow.md",
          "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
          "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
          "docs/architecture/OS-MATRIX.md"
        ],
        "result": "Kit 2.2.6 называет папку входных JSON .harness/inputs/ и пути вне коммитов в next и отказе close. Служба после «Принять план» и «Закрыть план» сообщает сессии-владельцу, tidy просит её убрать файлы. Панель показывает файлы вне коммитов и скрывает ревью закрытого плана."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "OPEN",
      "title": "Implementation"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "Kit 2.2.6: секция AGENTS.md и схемы называют папку .harness/inputs/ (git-ignored) для входных JSON; строка next при READY_FOR_ACCEPTANCE и ACCEPTED называет пути вне коммитов; отказ close перечисляет пути.",
      "После «Принять план» и «Закрыть план» сессия-владелец получает сообщение Workflow Kit и отвечает одной-двумя фразами; удержанный Stop с причиной ready-for-acceptance отпускается; метка активности — «План принят» и «План закрыт» (без обещания закрытия).",
      "Карточка плана в фазах acceptance и accepted показывает файлы вне коммитов и кнопку «Попросить агента убрать»; отказ закрытия — по-русски, с именами файлов; tidy отказывает понятным текстом, когда владельца нет или он не получает сообщений.",
      "Законченное ревью закрытого или заменённого scope не показывается в боковой панели основной сессии; идущее ревью и карточка ревьюера — как раньше.",
      "Контракты модулей, OS-MATRIX и документы Kit согласованы с кодом; typecheck, platform-guard и все тесты проходят.",
      "0.14.4 установлена на macOS, CI точного SHA поставки зелёная на macOS, Linux, Windows x64 и ARM64; живая проверка Windows записана за проверяющим на Windows (до проведения — «не проверено вживую на Windows»); пользовательская приёмка отдельно."
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-16T10:39:03.046Z",
      "text": "Пользователь, 16.11.2026: на предложенный состав из трёх задач — «Да, я согласен с таким составом. Сделай спецификацию и план.» Workflow Kit: пользователь выбрал спецификацию и план с ревью. Ревью плана, круг 1 (ChatGPT): замечания 2–4 приняты, механизм CI уточнён. | Execution mode chosen by the user: sequential: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
    },
    "baselineCommit": "7439b9ebf93ff0991a2dfb0ea3d5befb7d550150",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M37-plan-close-flow.md",
        "required": true
      },
      {
        "path": "docs/planning/M37-plan-close-facts.md",
        "required": false
      },
      {
        "path": "docs/planning/M33-full-autopilot.md",
        "required": false
      }
    ],
    "decisions": [
      {
        "at": "2026-11-16T10:39:03.046Z",
        "text": "Входные JSON команд Kit (--input, --digest) агент кладёт в .harness/inputs/ — папка в управляемой секции .gitignore; служба и Kit файлы проекта сами не удаляют и не коммитят."
      },
      {
        "at": "2026-11-16T10:39:03.046Z",
        "text": "accept и коммиты задач по-прежнему не требуют чистого дерева; close требует. Предупреждение о файлах вне коммитов показывается заранее, в фазах acceptance и accepted."
      },
      {
        "at": "2026-11-16T10:39:03.046Z",
        "text": "Сообщения о приёмке и закрытии уходят только при действиях в панели; при приёмке и закрытии словами в чате меняется только метка активности."
      },
      {
        "at": "2026-11-16T10:39:03.046Z",
        "text": "tidy — метод службы и маршрут POST /api/projects/:id/workflow/tidy: единая точка, которую будущий полный автопилот сможет вызвать перед close."
      },
      {
        "at": "2026-11-16T10:39:03.046Z",
        "text": "Законченное ревью видно основной сессии, только пока его scopeId равен открытому предложению или активному scope; строка «Ревью плана: да» остаётся (решение действует для следующих планов), меняется её текст."
      },
      {
        "at": "2026-11-16T10:39:03.046Z",
        "text": "Служба 0.14.4 работает с Kit 2.2.5 и 2.2.6: status 2.2.5 уже отдаёт changes, отказ DIRTY_TREE уже несёт details.paths."
      },
      {
        "at": "2026-11-16T10:39:03.046Z",
        "text": "Рекомендован sequential: три небольшие задачи, каждая дополняет общий docs/architecture/OS-MATRIX.md, T003 опирается на T002; живая проверка требует участия пользователя."
      },
      {
        "at": "2026-11-16T10:39:03.046Z",
        "text": "Место в OVERVIEW.md и design-qa.md освобождено до плана отдельным docs:commit ad53c26 (дословный перенос двух разделов)."
      },
      {
        "at": "2026-11-16T10:39:03.046Z",
        "text": "Метка accepted — нейтральная «План принят»: мешают ли закрытию файлы вне коммитов, говорит предупреждение карточки плана; ответ tidy clean различается по фазе (acceptance — можно принимать, accepted — можно закрыть)."
      },
      {
        "at": "2026-11-16T10:39:03.046Z",
        "text": "tidy отказывает no-owner и owner-unavailable (владелец вышел из процесса Kit, channel.excluded); сессия в процессе Kit, которую сейчас нельзя разбудить, — не отказ, сообщение ждёт в очереди. accept и close при недоступном владельце выполняются без сообщения."
      },
      {
        "at": "2026-11-16T10:39:03.046Z",
        "text": "CI до приёмки — по правилу проекта «Three operating systems» (AGENTS.md): T005 отправляет только точный SHA T004 в ветку ci/M37-plan-close-flow без --force; main не отправляется, правило «GitHub publication» касается публикации main после приёмки и закрытия."
      },
      {
        "at": "2026-11-16T10:39:03.046Z",
        "text": "Живую проверку Windows проводит проверяющий на Windows; до неё в документе приёмки — «не проверено вживую на Windows» (pending), CI её не заменяет."
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 2,
      "ownerSession": "da6065c6-a99c-4b9f-bd95-2a6d6be687dc",
      "strategy": "sequential"
    },
    "id": "M37-plan-close-flow",
    "objective": "Приёмка и закрытие плана из панели: агент узнаёт о них и отвечает, файлы вне коммитов видны заранее и убираются одной кнопкой, Kit называет папку для входных JSON, карточка ревью закрытого плана не показывается",
    "spec": "docs/planning/M37-plan-close-flow.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Блок «Inputs and documents» секции AGENTS.md называет .harness/inputs/ для --input и --digest; gitignoreSection() содержит .harness/inputs/; файл в этой папке не попадает в changes и не мешает close (тест на временном репозитории).",
        "schemaText добавляет общую строку о .harness/inputs/ к правилам каждой схемы; её видят schema <command> --format text и раздел schema пакета восстановления.",
        "Строка next при READY_FOR_ACCEPTANCE и ACCEPTED с путями вне коммитов — тексты раздела 2.1; без таких путей тексты прежние.",
        "Отказ close: код DIRTY_TREE, сообщение называет до пяти путей и «and N more», nextAction про docs:commit, details.paths — полный список.",
        "KIT_VERSION 2.2.6, бандл пересобран npm run build:kit (vendor, bundle-meta.ts, PROVENANCE); упоминания текущей версии Kit в перечисленных документах обновлены; WorkflowKitInstallation.md остаётся не больше 28 000 байт.",
        "module.md workflow-installer, workflow-recovery, workflow-kit и kit-bundle, документы Kit и строка OS-MATRIX обновлены в том же коммите; npm run typecheck, npm run check:platforms и npm test проходят; файлы не длиннее 400 строк, документы не больше 28 000 байт."
      ],
      "checks": [],
      "commitMessage": "feat(kit): name the input folder and the uncommitted paths before close",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M37-plan-close-flow.md",
          "required": true,
          "heading": "2.1. Kit 2.2.6 (`kit-core`)"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-texts.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-schema.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-sections.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-scope.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle-meta.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/test",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/test/kit-update.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/kit-card.test.ts",
        "product-parts/backend-core/clusters/projects/cluster.md",
        "product-parts/backend-core/clusters/projects/modules/project-setup/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md",
        "docs/architecture/workflow-kit/WorkflowKitInstallation.md",
        "docs/architecture/workflow-kit/WorkflowKitCommands.md",
        "docs/architecture/workflow-kit/WorkflowKitRecovery.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-lifecycle.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-packet.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-schema.test.mjs",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.5.mjs.gz",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.6.mjs.gz"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Kit 2.2.6: папка входных файлов, подсказка next и понятный отказ close",
      "why": "Агент Codex оставил входной JSON в папке проекта, и close отказал без имени файла; Kit должен предупреждать причину и называть её"
    },
    {
      "acceptance": [
        "accept(): после команды Kit владелец получает acceptedMessage (с tidyNote при путях вне коммитов и без него), удержанный Stop ready-for-acceptance отпускается, другие держатели будятся, метка — accepted («План принят»); владелец не найден или вышел из процесса Kit (channel.excluded) — команда Kit выполнена, запись в журнале, сообщение не ставится.",
        "close(): отказ DIRTY_TREE становится dirty-tree (409) с русским текстом и до пяти путей; после успеха владелец получает closedMessage, метка — closed («План закрыт»); ключ владельца определяется до команды Kit; недоступный владелец — как у accept().",
        "tidy() и POST /api/projects/:id/workflow/tidy — шесть исходов раздела 2.3 по порядку: no-scope, not-finished, clean (текст по фазе: acceptance — «можно принимать результат», accepted — «план можно закрыть»), no-owner, owner-unavailable (channel.excluded), отправка tidyMessage владельцу с ответом { owner, paths }; сессия в процессе Kit, которую нельзя разбудить, получает сообщение в очередь; автопилот не включается.",
        "decide() поправляет устаревшую метку ready-for-acceptance или accepted по autopilot:status; после сообщений о приёмке и закрытии ход не продолжается.",
        "KitStatus.changes необязателен; PlanView.dirty — пути в фазах acceptance и accepted, иначе пустой список; статус Kit без changes даёт пустой список.",
        "Тесты покрывают сочетания acceptance/accepted × чистое/грязное дерево (метка, текст clean, acceptedMessage, PlanView.dirty), отсутствующего и исключённого владельца у accept, close и tidy.",
        "Новый код — в autopilot/src/acceptance.ts; module.md autopilot и plan-view и строка OS-MATRIX обновлены в том же коммите; npm run typecheck, npm run check:platforms и npm test проходят; файлы не длиннее 400 строк, документы не больше 28 000 байт."
      ],
      "checks": [],
      "commitMessage": "feat(autopilot): tell the agent about acceptance and closing of the plan",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M37-plan-close-flow.md",
          "required": true,
          "heading": "2. Решение"
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/acceptance.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/texts.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/kit-types.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/plan-view.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/index.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/test",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/test",
        "product-parts/backend-core/clusters/runtime/modules/cli/test",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/test/plan-view.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/acceptance.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/flow.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Служба: сообщения агенту о приёмке и закрытии, tidy, файлы вне коммитов в модели плана",
      "why": "Кнопки «Принять план» и «Закрыть план» ничего не сообщают агенту и не отпускают удержанную сессию; отказ закрытия теряет имена файлов"
    },
    {
      "acceptance": [
        "planView отдаёт dirty; карточка плана в фазах acceptance и accepted при непустом dirty показывает предупреждение (до пяти путей, «и ещё N») и кнопку «Попросить агента убрать» (workflow/tidy), при пустом — нет; кнопки «Принять план» и «Закрыть план» остаются активными; отрисовка — в новом src/plan-dirty.js.",
        "crossReviewView.current: true для ревью открытого предложения и активного scope, false для закрытого scope и другого предложения; законченное ревью основной сессии показывается только при !plan && current; идущее ревью и карточка ревьюера — как раньше.",
        "Текст решения о ревью при «да» — «Следующий план этой сессии проверит ревьюер — так решено ответом на вопрос о плане.»; REASON_LABELS получает accepted («План принят») и closed («План закрыт») — те же тексты, что STOP_LABELS.",
        "Модельные тесты покрывают перечисленное; раздел M37 в design-qa.md описывает поверхность (вид проверяется в живой проверке поставки).",
        "module.md session-view и строка OS-MATRIX обновлены в том же коммите; npm run typecheck, npm run check:platforms и npm test проходят; файлы не длиннее 400 строк, документы не больше 28 000 байт."
      ],
      "checks": [],
      "commitMessage": "feat(panel): warn about uncommitted files and hide the review of a closed plan",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M37-plan-close-flow.md",
          "required": true,
          "heading": "2.4. Панель (`session-view`)"
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/plan-cards.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/plan-dirty.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/sidebar-view.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/activity-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/index.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test",
        "design-qa.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/plan-close.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Панель: предупреждение о файлах вне коммитов, карточка ревью закрытого плана, тексты",
      "why": "Пользователь не видит, что мешает закрыть план, а после закрытия видит карточку ревью уже закрытого scope"
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
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M37-plan-close-flow.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md",
        "product-parts/backend-core/clusters/projects/cluster.md",
        "product-parts/backend-core/clusters/projects/modules/project-setup/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md",
        "docs/architecture/workflow-kit/WorkflowKitInstallation.md",
        "docs/architecture/workflow-kit/WorkflowKitCommands.md",
        "docs/architecture/workflow-kit/WorkflowKitRecovery.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "design-qa.md",
        "docs/usage.md",
        "docs/architecture/CONTRACTS.md"
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
        "Версия 0.14.4 в package.json и package-lock.json (только поля версии), запись CHANGELOG.",
        "npm run typecheck, npm run check:platforms, npm test и npm run build:kit пройдены; node bin/wfk.mjs install поставил 0.14.4; wfk doctor --installed — всё в порядке; /api/health показывает 0.14.4.",
        "С согласия пользователя (до 6 ходов агентов) на установленной 0.14.4 (macOS): Codex_01 — предупреждение с именем файла, «Попросить агента убрать», затем «Закрыть план» с ответом агента; Claude_01 — карточки «Ревью плана» нет; новый маленький план после «Обновить Kit» — входной JSON в .harness/inputs/, ответы агента и метки «План принят» и «План закрыт». Без согласия — «не проверено вживую», покрыто тестами.",
        "Результат и хронология записаны в docs/evidence/M37-acceptance.md со списком живых проверок по ОС и ответственными: macOS — агент и пользователь; Windows (x64 или ARM64) — проверяющий на Windows, проверки из раздела 4 спецификации, до их проведения итог pending и «не проверено вживую на Windows»; Linux — CI. Проверка поставки отделена от пользовательской приёмки; работающие сессии не перезапущены без согласия пользователя."
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: deliver the plan acceptance and closing flow",
      "confirmation": "Подтверждаю",
      "context": [
        {
          "path": "docs/planning/M37-plan-close-flow.md",
          "required": true,
          "heading": "4. Проверка"
        }
      ],
      "dependencies": [
        "T001",
        "T002",
        "T003",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "docs/evidence/M37-acceptance.md",
        "README.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "IN_PROGRESS",
      "title": "Поставка 0.14.4, установка и живая проверка установленной версии",
      "why": "Исправления проверяются на настоящей панели и тестовых проектах Codex_01 и Claude_01"
    },
    {
      "acceptance": [
        "По правилу проекта «Three operating systems» (AGENTS.md) точный SHA задачи T004 отправлен в служебную ветку: git push origin <sha>:refs/heads/ci/M37-plan-close-flow, без --force; задача начата с подтверждения пользователя (task:start --confirmed).",
        "CI зелёная на macOS, Linux, Windows x64 и ARM64; ссылка на прогон и SHA записаны в docs/evidence/M37-acceptance.md; при красной CI задача блокируется (task:block) и решение принимает пользователь.",
        "Ветка main не отправляется и релиз не публикуется: публикация — после приёмки и закрытия scope по команде пользователя (правило «GitHub publication»)."
      ],
      "checks": [],
      "commitMessage": "docs: record plan closing flow cross-platform CI",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M37-plan-close-flow.md",
          "required": true,
          "heading": "4. Проверка"
        }
      ],
      "dependencies": [
        "T004",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M37-acceptance.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "CI точного SHA поставки на четырёх платформах",
      "why": "Поставка не готова, пока CI не зелёная на всех ОС"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: M37-plan-close-flow (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: T004
- Progress: 4/6
- Revision: 1129

## Objective

Приёмка и закрытие плана из панели: агент узнаёт о них и отвечает, файлы вне коммитов видны заранее и убираются одной кнопкой, Kit называет папку для входных JSON, карточка ревью закрытого плана не показывается

## Acceptance

- Kit 2.2.6: секция AGENTS.md и схемы называют папку .harness/inputs/ (git-ignored) для входных JSON; строка next при READY_FOR_ACCEPTANCE и ACCEPTED называет пути вне коммитов; отказ close перечисляет пути.
- После «Принять план» и «Закрыть план» сессия-владелец получает сообщение Workflow Kit и отвечает одной-двумя фразами; удержанный Stop с причиной ready-for-acceptance отпускается; метка активности — «План принят» и «План закрыт» (без обещания закрытия).
- Карточка плана в фазах acceptance и accepted показывает файлы вне коммитов и кнопку «Попросить агента убрать»; отказ закрытия — по-русски, с именами файлов; tidy отказывает понятным текстом, когда владельца нет или он не получает сообщений.
- Законченное ревью закрытого или заменённого scope не показывается в боковой панели основной сессии; идущее ревью и карточка ревьюера — как раньше.
- Контракты модулей, OS-MATRIX и документы Kit согласованы с кодом; typecheck, platform-guard и все тесты проходят.
- 0.14.4 установлена на macOS, CI точного SHA поставки зелёная на macOS, Linux, Windows x64 и ARM64; живая проверка Windows записана за проверяющим на Windows (до проведения — «не проверено вживую на Windows»); пользовательская приёмка отдельно.

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Kit 2.2.6: папка входных файлов, подсказка next и понятный отказ close (work)
  - Commit: feat(kit): name the input folder and the uncommitted paths before close
  - Files: product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-texts.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-schema.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-sections.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-scope.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle-meta.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/test, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/test/kit-update.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/kit-card.test.ts, product-parts/backend-core/clusters/projects/cluster.md, product-parts/backend-core/clusters/projects/modules/project-setup/module.md, product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md, docs/architecture/workflow-kit/WorkflowKitInstallation.md, docs/architecture/workflow-kit/WorkflowKitCommands.md, docs/architecture/workflow-kit/WorkflowKitRecovery.md, docs/architecture/OS-MATRIX.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-lifecycle.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-packet.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-schema.test.mjs, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.5.mjs.gz, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.6.mjs.gz
- [DONE] T002 — Служба: сообщения агенту о приёмке и закрытии, tidy, файлы вне коммитов в модели плана (work)
  - Commit: feat(autopilot): tell the agent about acceptance and closing of the plan
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/acceptance.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/texts.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/kit-types.ts, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/plan-view.ts, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/index.ts, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/test, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/test, product-parts/backend-core/clusters/runtime/modules/cli/test, docs/architecture/OS-MATRIX.md, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/test/plan-view.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/acceptance.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/flow.test.ts
  - Depends on: T001
- [DONE] T003 — Панель: предупреждение о файлах вне коммитов, карточка ревью закрытого плана, тексты (work)
  - Commit: feat(panel): warn about uncommitted files and hide the review of a closed plan
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/plan-cards.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/plan-dirty.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/sidebar-view.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/activity-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.css, product-parts/control-panel/clusters/web-panel/modules/session-view/src/index.ts, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/test, design-qa.md, docs/architecture/OS-MATRIX.md, product-parts/control-panel/clusters/web-panel/modules/session-view/test/plan-close.test.ts
  - Depends on: T002
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M37-plan-close-flow.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md, product-parts/backend-core/clusters/projects/cluster.md, product-parts/backend-core/clusters/projects/modules/project-setup/module.md, product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md, docs/architecture/workflow-kit/WorkflowKitInstallation.md, docs/architecture/workflow-kit/WorkflowKitCommands.md, docs/architecture/workflow-kit/WorkflowKitRecovery.md, docs/architecture/OS-MATRIX.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, design-qa.md, docs/usage.md, docs/architecture/CONTRACTS.md
  - Depends on: T001, T002, T003
- [IN_PROGRESS] T004 — Поставка 0.14.4, установка и живая проверка установленной версии (delivery)
  - Commit: chore: deliver the plan acceptance and closing flow
  - Files: package.json, package-lock.json, CHANGELOG.md, docs/evidence/M37-acceptance.md, README.md
  - Depends on: T001, T002, T003, DOCS-R1
- [TODO] T005 — CI точного SHA поставки на четырёх платформах (delivery)
  - Commit: docs: record plan closing flow cross-platform CI
  - Files: docs/evidence/M37-acceptance.md
  - Depends on: T004, DOCS-R1

Digest: Kit 2.2.6 называет папку входных JSON .harness/inputs/ и пути вне коммитов в next и отказе close. Служба после «Принять план» и «Закрыть план» сообщает сессии-владельцу, tidy просит её убрать файлы. Панель показывает файлы вне коммитов и скрывает ревью закрытого плана.

State changes only through `scripts/workflow` commands. History lives in Git.
