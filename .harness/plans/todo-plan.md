# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-16T15:16:10.108Z",
    "scopeId": "M37-plan-close-flow-fix"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 1163,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "workflow-installer: install(path, {update, with}) — USAGE без update, WITH_NOT_MANAGED, итог with; сообщение chore: update the Workflow Kit structure.",
          "kit-runner: install(root, {with}) → --with <JSON>; KitInstall.with.",
          "kit-update: опции structure и kit.status; kitUpdate.structure, structureNote; last.structure, last.structureNote; журнал kit: structure …",
          "panel-shell kit-card: заголовки со структурой, kept, итог и карточка «Структура Kit не обновлена».",
          "KIT_VERSION 2.2.7."
        ],
        "decisions": [
          "Файлы структуры коммитит Kit (install --update --with) в той же транзакции kit-update; служба сама git не вызывает.",
          "Пути --with — только .workflow-kit/manifest.json и его fragments.*.path, иначе WITH_NOT_MANAGED до любой записи.",
          "Файлы структуры с изменениями вне коммитов (status.changes) не перезаписываются: структура пропускается, Kit обновляется.",
          "Отказ или исключение Kit возвращает прежний текст файлов структуры; после успеха Kit возврата нет.",
          "Kit Workflow_Kit обновляется до 2.2.7 кнопкой после закрытия scope."
        ],
        "references": [
          "docs/planning/M38-kit-structure-update.md",
          "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/module.md",
          "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md",
          "docs/usage.md"
        ],
        "result": "«Обновить Kit» обновляет и структуру Kit (wfk) одним коммитом: kit-update пишет устаревшие фрагменты и передаёт их Kit 2.2.7 опцией install --update --with; карточка Kit показывает «Структура Kit 3 → 4», изменённые вручную файлы и итог; docs/usage.md исправлен. Структура 4 этого репозитория закоммичена (F001)."
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
      "Структура Kit 4 этого репозитория закоммичена (T001), служба показывает status ok.",
      "Kit 2.2.7: install --update --with коммитит файлы структуры wfk вместе с файлами Kit одной транзакцией kit-update; пути вне .workflow-kit/manifest.json отклоняются WITH_NOT_MANAGED.",
      "«Обновить Kit» записывает устаревшую структуру и коммитит её вместе с Kit; карточка появляется и ради одной структуры; изменённые и не закоммиченные файлы структуры не перезаписываются и не коммитятся; при отказе Kit файлы структуры возвращаются.",
      "Карточка Kit и docs/usage.md описывают обновление структуры и то, что новые хуки получают только сессии, начатые после обновления.",
      "Контракты модулей, OS-MATRIX и документы Kit согласованы с кодом; typecheck, platform-guard и все тесты проходят.",
      "0.14.5 установлена на macOS, CI точного SHA поставки зелёная на macOS, Linux, Windows x64 и ARM64; живая проверка Windows записана за проверяющим на Windows (до проведения — «не проверено вживую на Windows»); пользовательская приёмка отдельно."
    ],
    "acceptanceNote": {
      "at": "2026-11-16T17:16:41.564Z",
      "text": "Пользователь принял план в панели Workflow Kit"
    },
    "approval": {
      "at": "2026-11-16T16:20:34.435Z",
      "text": "Пользователь 16.11.2026: «Делай и 1 и 2.» — на предложение: 1) обход: структура 4 в Workflow_Kit; 2) «Обновить Kit» обновляет и структуру wfk одним коммитом, панель показывает устаревшую структуру, исправление docs/usage.md, коммит структуры 4 этого репозитория. В панели выбраны спецификация и план без ревью. | Execution mode chosen by the user: sequential: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
    },
    "baselineCommit": "882d130f0ec398fc9c526a1d498539fc4b6f57ba",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M38-kit-structure-update.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-16T16:20:34.435Z",
        "text": "Файлы структуры коммитит Kit (install --update --with) в той же транзакции kit-update, а не служба через git."
      },
      {
        "at": "2026-11-16T16:20:34.435Z",
        "text": "Пути --with ограничены манифестом .workflow-kit/manifest.json (сам манифест и fragments.*.path)."
      },
      {
        "at": "2026-11-16T16:20:34.435Z",
        "text": "Изменённые и не закоммиченные файлы структуры служба не перезаписывает и не коммитит: структура пропускается с причиной."
      },
      {
        "at": "2026-11-16T16:20:34.435Z",
        "text": "Kit самого Workflow_Kit обновляется до 2.2.7 кнопкой после закрытия scope, не в задачах."
      },
      {
        "at": "2026-11-16T16:20:34.435Z",
        "text": "Ревью плана не проводится (выбор пользователя в панели 16.11.2026)."
      }
    ],
    "delivery": "ACCEPTED",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "44f051db-d949-42ed-9d82-7c6737f9a848",
      "strategy": "sequential"
    },
    "id": "M38-kit-structure-update",
    "objective": "«Обновить Kit» обновляет Kit проекта и структуру Kit (хуки вопроса Claude) одним коммитом, карточка показывает устаревшую структуру, документы описывают это верно; структура 4 этого репозитория закоммичена",
    "spec": "docs/planning/M38-kit-structure-update.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Коммит содержит только три файла, записанные installStructure 16.11: группы PreToolUse и PermissionRequest с matcher AskUserQuestion в .claude/settings.json, строку управляемого раздела wfk в AGENTS.md и записи версии 4 в .workflow-kit/manifest.json; других правок нет.",
        "После коммита GET /api/projects/<id Workflow_Kit>/structure — status ok, installedVersion 4; эти три файла больше не числятся вне коммитов."
      ],
      "checks": [],
      "commitMessage": "chore: commit the Workflow Kit structure 4 of this repository",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M38-kit-structure-update.md",
          "required": true,
          "heading": "1. Факты"
        }
      ],
      "dependencies": [],
      "docsWaiver": "Файлы управляемой структуры wfk этого репозитория, записанные службой; кода модулей и их контрактов задача не меняет.",
      "files": [
        ".claude/settings.json",
        ".workflow-kit/manifest.json",
        "AGENTS.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Коммит структуры Kit 4 этого репозитория",
      "why": "Обход 16.11: структура 4 записана маршрутом службы, а вне задачи её не закоммитить (docs:commit берёт только Markdown)"
    },
    {
      "acceptance": [
        "Коммит, сделанный commit --task F001 с явным --files, содержит три файла, записанные installStructure 16.11: группы PreToolUse и PermissionRequest с matcher AskUserQuestion в .claude/settings.json, строку управляемого раздела wfk в AGENTS.md и записи версии 4 в .workflow-kit/manifest.json; других правок нет.",
        "После коммита GET /api/projects/<id Workflow_Kit>/structure — status ok, installedVersion 4; эти три файла больше не числятся вне коммитов."
      ],
      "checks": [],
      "commitMessage": "chore: commit the Workflow Kit structure 4 of this repository",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M38-kit-structure-update.md",
          "required": true,
          "heading": "1. Факты"
        }
      ],
      "dependencies": [],
      "docsWaiver": "Файлы управляемой структуры wfk этого репозитория, записанные службой; кода модулей и их контрактов задача не меняет.",
      "files": [
        ".claude/settings.json",
        ".workflow-kit/manifest.json",
        "AGENTS.md"
      ],
      "fixes": "T001",
      "id": "F001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Коммит структуры Kit 4 этого репозитория (исправление T001)",
      "why": "Коммит T001 4cdfcad содержит только план: три файла были изменены до task:start, и Kit без --files оставил их вне коммита"
    },
    {
      "acceptance": [
        "install --update --with <json|a,b> коммитит файлы Kit и пути --with одной транзакцией роли kit-update; хук pre-commit проекта её пропускает (тест на временном git-репозитории с настоящим Kit).",
        "Записаны только пути --with — сообщение «chore: update the Workflow Kit structure»; Kit записал свои файлы — «chore: update workflow kit to 2.2.7»; нечего коммитить — commit: null.",
        "Путь не из .workflow-kit/manifest.json (сам манифест или fragments.*.path), отсутствующий или нечитаемый манифест — отказ WITH_NOT_MANAGED с именем пути, ничего не записано; --with без --update — USAGE «--with needs --update.»; путь без изменений выпадает; excluded без путей --with; итог содержит with.",
        "KIT_VERSION 2.2.7, бандл пересобран npm run build:kit (vendor, bundle-meta.ts, PROVENANCE); упоминания текущей версии Kit в документах из files обновлены, упоминания функций прошлых версий не меняются; WorkflowKitInstallation.md не больше 28 000 байт.",
        "module.md workflow-installer, workflow-kit и kit-bundle, WorkflowKitCommands.md и строка OS-MATRIX (раздел 3 спецификации) согласованы с кодом; npm run typecheck, npm run check:platforms и тесты затронутых модулей проходят."
      ],
      "checks": [],
      "commitMessage": "feat(kit): commit the app's managed structure files with the Kit update",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M38-kit-structure-update.md",
          "required": true,
          "heading": "2.1. Kit 2.2.7: `install --update --with <files>` (`kit-core`)"
        }
      ],
      "dependencies": [
        "T001",
        "F001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src",
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
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-install.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-with.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-with.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-cli.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-cli.test.mjs",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.6.mjs.gz",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.7.mjs.gz"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Kit 2.2.7: install --update --with для файлов структуры",
      "why": "Файлы структуры wfk в проекте под управлением Kit можно закоммитить только транзакцией Kit"
    },
    {
      "acceptance": [
        "Раздел kitUpdate: поле structure ({ status, installed, version, installable, kept } или null, structureNote при ошибке проверки); action update и тогда, когда Kit свежий, а структура installable (тест).",
        "update: status проекта → запись структуры → kit.install({ update: true, with }) — один коммит Kit и структуры; связка с настоящими kit-structure и бандлом на временном репозитории даёт структуру 4, один коммит и чистое дерево.",
        "Файлы структуры в changes — структура не пишется, причина в last.structureNote (до пяти путей и «и ещё N»); отказ status — пропуск с причиной «Kit не сообщил файлы вне коммитов»; отказ или падение Kit — файлы структуры возвращены к прежнему содержимому, созданные удалены (тесты).",
        "last.structure и last.structureNote, строки журнала «kit: structure …» и «kit: structure skipped …»; cli передаёт structure и kit.run.",
        "module.md kit-update, kit-runner и kit-structure (если меняется публичный вход), connected-modules.md, CONTRACTS.md и строка OS-MATRIX согласованы; npm run typecheck, npm run check:platforms и тесты затронутых модулей проходят."
      ],
      "checks": [],
      "commitMessage": "feat(kit-update): update the Kit structure together with the Kit",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M38-kit-structure-update.md",
          "required": true,
          "heading": "2.2. Служба: `kit-update`, `kit-runner`, `cli`"
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/src",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/test",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/src",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/test",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/module.md",
        "product-parts/workflow-engine/clusters/kit-host/cluster.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/test",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/index.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/module.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/src/runner.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/test/runner.test.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/src/index.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/src/routes.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/src/structure.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/src/update.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/test/kit-update-real.test.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/test/kit-update-structure.test.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/test/kit-update.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Служба: структура Kit в kitUpdate и обновление одним коммитом",
      "why": "Кнопка «Обновить Kit» должна обновлять и структуру wfk, а служба — видеть её устаревание"
    },
    {
      "acceptance": [
        "Заголовки, тексты и строки карточки — по разделу 2.3 спецификации: «Kit 2.2.6 → 2.2.7, структура 3 → 4», «Структура Kit 3 → 4», строка kept, итог «Kit обновлён до 2.2.7» или «Структура Kit обновлена до 4» и строки структуры (тесты kit-card).",
        "KIT_UPDATE_TEXT и раздел «Версия Kit проекта» в docs/usage.md говорят, что кнопка обновляет и структуру, что новые хуки получают сессии, начатые после обновления, и что вопрос Claude в сессии без хуков вопроса виден в панели только закрытым.",
        "design-qa.md: раздел M38 с тремя состояниями карточки; module.md panel-shell и строка OS-MATRIX согласованы; npm run typecheck, npm run check:platforms и тесты panel-shell проходят."
      ],
      "checks": [],
      "commitMessage": "feat(panel): show the Kit structure on the Kit card",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M38-kit-structure-update.md",
          "required": true,
          "heading": "2.3. Панель: карточка Kit (`panel-shell`)"
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/kit-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/screens.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/kit-card.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "docs/usage.md",
        "design-qa.md",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Панель: карточка Kit со структурой, docs/usage.md",
      "why": "Пользователь должен видеть устаревшую структуру и знать, что обновит кнопка"
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
        "F001",
        "T002",
        "T003",
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M38-kit-structure-update.md",
        "AGENTS.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md",
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
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/module.md",
        "product-parts/workflow-engine/clusters/kit-host/cluster.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/module.md",
        "docs/architecture/CONTRACTS.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "docs/usage.md",
        "design-qa.md"
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
        "Версия 0.14.5 в package.json и package-lock.json (только поля версии), запись CHANGELOG.",
        "npm run typecheck, npm run check:platforms, npm test и npm run build:kit пройдены; node bin/wfk.mjs install поставил 0.14.5; wfk doctor --installed — всё в порядке; /api/health показывает 0.14.5.",
        "С согласия пользователя на установленной 0.14.5 (macOS): одноразовый проект со структурой 3 и Kit 2.2.6 показывает «Kit 2.2.6 → 2.2.7, структура 3 → 4», «Обновить Kit» даёт один коммит, структура ok, дерево чистое; новая сессия Claude в Workflow_Kit показывает ожидающий AskUserQuestion в диалоге панели и принимает ответ из панели. Без согласия — «не проверено вживую», покрыто тестами.",
        "Результат и хронология — в docs/evidence/M38-acceptance.md со списком живых проверок по ОС: macOS — агент и пользователь; Windows (x64 или ARM64) — проверяющий на Windows, до проведения «не проверено вживую на Windows»; Linux — CI. Проверка поставки отделена от пользовательской приёмки; работающие сессии без согласия пользователя не перезапускаются."
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: deliver the Kit structure update",
      "confirmation": "Выполняй весь план задача за задачей без пауз - даю тебе на это своё согласие.",
      "context": [
        {
          "path": "docs/planning/M38-kit-structure-update.md",
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
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "docs/evidence/M38-acceptance.md",
        "README.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Поставка 0.14.5, установка и живая проверка установленной версии",
      "why": "Исправление должно дойти до установленного приложения и быть проверено вживую"
    },
    {
      "acceptance": [
        "По правилу «Three operating systems» (AGENTS.md) точный SHA последнего коммита перед T006 отправлен в служебную ветку: git push origin <sha>:refs/heads/ci/M38-kit-structure-update, без --force.",
        "CI зелёная на macOS, Linux, Windows x64 и ARM64, ссылка на прогон и SHA записаны в docs/evidence/M38-acceptance.md; при красной CI задача блокируется (task:block) и решение принимает пользователь.",
        "Ветка main не отправляется и релиз не публикуется: публикация — после приёмки и закрытия scope по команде пользователя."
      ],
      "checks": [],
      "commitMessage": "docs: record the Kit structure update cross-platform CI",
      "confirmation": "Выполняй весь план задача за задачей без пауз - даю тебе на это своё согласие.",
      "context": [
        {
          "path": "docs/planning/M38-kit-structure-update.md",
          "required": true,
          "heading": "4. Проверка"
        }
      ],
      "dependencies": [
        "T005",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M38-acceptance.md"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "CI точного SHA поставки на четырёх платформах",
      "why": "Поставка не готова, пока CI не зелёная на всех ОС"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: M38-kit-structure-update (ACTIVE)
- Delivery: ACCEPTED
- Execution: sequential
- Current task: none
- Progress: 8/8
- Revision: 1163

## Objective

«Обновить Kit» обновляет Kit проекта и структуру Kit (хуки вопроса Claude) одним коммитом, карточка показывает устаревшую структуру, документы описывают это верно; структура 4 этого репозитория закоммичена

## Acceptance

- Структура Kit 4 этого репозитория закоммичена (T001), служба показывает status ok.
- Kit 2.2.7: install --update --with коммитит файлы структуры wfk вместе с файлами Kit одной транзакцией kit-update; пути вне .workflow-kit/manifest.json отклоняются WITH_NOT_MANAGED.
- «Обновить Kit» записывает устаревшую структуру и коммитит её вместе с Kit; карточка появляется и ради одной структуры; изменённые и не закоммиченные файлы структуры не перезаписываются и не коммитятся; при отказе Kit файлы структуры возвращаются.
- Карточка Kit и docs/usage.md описывают обновление структуры и то, что новые хуки получают только сессии, начатые после обновления.
- Контракты модулей, OS-MATRIX и документы Kit согласованы с кодом; typecheck, platform-guard и все тесты проходят.
- 0.14.5 установлена на macOS, CI точного SHA поставки зелёная на macOS, Linux, Windows x64 и ARM64; живая проверка Windows записана за проверяющим на Windows (до проведения — «не проверено вживую на Windows»); пользовательская приёмка отдельно.

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Коммит структуры Kit 4 этого репозитория (work)
  - Commit: chore: commit the Workflow Kit structure 4 of this repository
  - Files: .claude/settings.json, .workflow-kit/manifest.json, AGENTS.md
- [DONE] F001 — Коммит структуры Kit 4 этого репозитория (исправление T001) (work)
  - Commit: chore: commit the Workflow Kit structure 4 of this repository
  - Files: .claude/settings.json, .workflow-kit/manifest.json, AGENTS.md
  - Fixes: T001
- [DONE] T002 — Kit 2.2.7: install --update --with для файлов структуры (work)
  - Commit: feat(kit): commit the app's managed structure files with the Kit update
  - Files: product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle-meta.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/test, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/test/kit-update.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/kit-card.test.ts, product-parts/backend-core/clusters/projects/cluster.md, product-parts/backend-core/clusters/projects/modules/project-setup/module.md, product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md, docs/architecture/workflow-kit/WorkflowKitInstallation.md, docs/architecture/workflow-kit/WorkflowKitCommands.md, docs/architecture/workflow-kit/WorkflowKitRecovery.md, docs/architecture/OS-MATRIX.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-install.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-with.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-with.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-cli.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-cli.test.mjs, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.6.mjs.gz, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.7.mjs.gz
  - Depends on: T001, F001
- [DONE] T003 — Служба: структура Kit в kitUpdate и обновление одним коммитом (work)
  - Commit: feat(kit-update): update the Kit structure together with the Kit
  - Files: product-parts/workflow-engine/clusters/kit-host/modules/kit-update/src, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/test, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/src, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/test, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/module.md, product-parts/workflow-engine/clusters/kit-host/cluster.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/test, product-parts/backend-core/clusters/projects/modules/kit-structure/src/index.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/module.md, docs/architecture/CONTRACTS.md, docs/architecture/OS-MATRIX.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/src/runner.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/test/runner.test.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/src/index.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/src/routes.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/src/structure.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/src/update.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/test/kit-update-real.test.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/test/kit-update-structure.test.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/test/kit-update.test.ts
  - Depends on: T002
- [DONE] T004 — Панель: карточка Kit со структурой, docs/usage.md (work)
  - Commit: feat(panel): show the Kit structure on the Kit card
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/kit-card.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/screens.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/kit-card.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, docs/usage.md, design-qa.md, docs/architecture/OS-MATRIX.md
  - Depends on: T003
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M38-kit-structure-update.md, AGENTS.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md, product-parts/backend-core/clusters/projects/cluster.md, product-parts/backend-core/clusters/projects/modules/project-setup/module.md, product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md, docs/architecture/workflow-kit/WorkflowKitInstallation.md, docs/architecture/workflow-kit/WorkflowKitCommands.md, docs/architecture/workflow-kit/WorkflowKitRecovery.md, docs/architecture/OS-MATRIX.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/module.md, product-parts/workflow-engine/clusters/kit-host/cluster.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/projects/modules/kit-structure/module.md, docs/architecture/CONTRACTS.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, docs/usage.md, design-qa.md
  - Depends on: T001, F001, T002, T003, T004
- [DONE] T005 — Поставка 0.14.5, установка и живая проверка установленной версии (delivery)
  - Commit: chore: deliver the Kit structure update
  - Files: package.json, package-lock.json, CHANGELOG.md, docs/evidence/M38-acceptance.md, README.md
  - Depends on: T004, DOCS-R1
- [DONE] T006 — CI точного SHA поставки на четырёх платформах (delivery)
  - Commit: docs: record the Kit structure update cross-platform CI
  - Files: docs/evidence/M38-acceptance.md
  - Depends on: T005, DOCS-R1

Digest: «Обновить Kit» обновляет и структуру Kit (wfk) одним коммитом: kit-update пишет устаревшие фрагменты и передаёт их Kit 2.2.7 опцией install --update --with; карточка Kit показывает «Структура Kit 3 → 4», изменённые вручную файлы и итог; docs/usage.md исправлен. Структура 4 этого репозитория закоммичена (F001).

State changes only through `scripts/workflow` commands. History lives in Git.
