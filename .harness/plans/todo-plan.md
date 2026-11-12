# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-12T15:04:13.877Z",
    "scopeId": "m21-recovery-one-turn"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 709,
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
      "12 модулей Kit и документы Kit лежат в Workflow Kit, их тесты идут в npm test на всех ОС",
      "npm run build:kit собирает бандл из исходников этого репозитория; тест не пропускает исходники без пересборки",
      "Приложение ставит и обновляет в проектах Kit 2.2.4",
      "Экран проекта показывает версию Kit; для устаревшего Kit «Обновить Kit» обновляет его без мастера и без новой сессии, хук Codex одобряется сам",
      "CI зелёный на macOS, Linux, Windows x64 и ARM64"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-12T15:49:59.859Z",
      "text": "Пользователь, 2026-11-12: «Давай переезжать со всем этим бэкэндом в наш проект Workflow Kit и с китом, и с харнесом… скопировать все необходимые модули, которые используются в Workflow Kit из Harness AI в сам код Workflow Kit»; в панели выбрано «спецификация и план без ревью». | Execution mode chosen by the user: sequential: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
    },
    "baselineCommit": "fdd46e200f0de455460f1e103d3d53763d7c740c",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M22-kit-source.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-12T15:49:59.859Z",
        "text": "Модули Kit копируются из Harness AI (коммит 94a9d457, код Kit 2.2.3) с теми же именами и файлами; правки переноса записываются в product-part.md"
      },
      {
        "at": "2026-11-12T15:49:59.859Z",
        "text": "Harness AI не меняется; синхронизация — по отдельной просьбе пользователя"
      },
      {
        "at": "2026-11-12T15:49:59.859Z",
        "text": "Версии Kit идут своей линией; первый бандл, собранный здесь, — 2.2.4"
      },
      {
        "at": "2026-11-12T15:49:59.859Z",
        "text": "Бандл собирает esbuild 0.25.12 (devDependency); установка — только с согласием пользователя"
      },
      {
        "at": "2026-11-12T15:49:59.859Z",
        "text": "Kit этого репозитория обновляется до 2.2.4 после закрытия scope"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "8ed2f99f-7296-4ad6-ae41-6fec13ee5fdb",
      "strategy": "sequential"
    },
    "id": "m22-kit-source",
    "objective": "Исходники Kit — модули Workflow Kit: бандл Kit 2.2.4 собирается здесь, экран проекта показывает версию Kit и обновляет устаревший Kit одной кнопкой, выпуск Workflow Kit 0.9.3.",
    "spec": "docs/planning/M22-kit-source.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Сессия в архиве или убранная из списка не попадает в раздел channel, её хуки получают пустой ответ без удержания, доставки и продолжения",
        "Её очередь очищается, новое сообщение из панели получает 409 session-archived; при архивации запись канала удаляется сразу",
        "Автопилот и ревью не выбирают её ни основной, ни рецензентом; карточка выбора пути её не ждёт",
        "Сессия, возвращённая из архива, снова участвует в процессе",
        "Тесты покрывают архивную, убранную и возвращённую сессию"
      ],
      "checks": [],
      "commitMessage": "fix(agent-channel): leave archived and removed sessions out of the Kit process",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M22-kit-source.md",
          "heading": "2.8. Архивные и убранные сессии не участвуют в процессе",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review",
        "product-parts/control-panel/clusters/web-panel/modules/session-view",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/session-excluded.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/detached.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/slots.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/types.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/excluded.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/titles.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/types.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/test/titles.test.ts"
      ],
      "fixes": null,
      "id": "T000",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Архивные и убранные сессии выходят из процесса Kit",
      "why": "Сессия, убранная пользователем из списка, не должна прятать карточку выбора и участвовать в работе"
    },
    {
      "acceptance": [
        "12 модулей из Harness AI 94a9d457 лежат в product-parts/kit-core/clusters/project-workflow/modules, тесты и помощники тестов — в test/",
        "product-part.md и cluster.md описывают часть, вход модулей (facade) и раздел «Происхождение и синхронизация» со списком правок",
        "Документы docs/architecture/workflow-kit/*.md перенесены",
        "Платформа передаётся параметром в installer-doctor, installer-install и platform-paths; ветки win32 и linux покрыты тестами; powershell и cmd.exe записаны в allowlist",
        "esbuild 0.25.12 и шаблон product-parts/**/test/*.test.mjs внесены через quality:apply с согласием пользователя",
        "Проверка типов, platform-guard и все тесты, включая 51 тест Kit, проходят"
      ],
      "checks": [],
      "commitMessage": "feat(kit-core): import the Workflow Kit sources from Harness AI",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M22-kit-source.md",
          "heading": "2. Решение",
          "required": true
        }
      ],
      "dependencies": [
        "T000"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/kit-core",
        "docs/architecture/workflow-kit",
        "tools/platform-guard/allowlist.json",
        "package.json",
        "package-lock.json",
        "docs/architecture/OVERVIEW.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/workflow-kit/WorkflowKit.md",
        "docs/architecture/workflow-kit/WorkflowKitCommands.md",
        "docs/architecture/workflow-kit/WorkflowKitCoreRpc.md",
        "docs/architecture/workflow-kit/WorkflowKitExecutionModes.md",
        "docs/architecture/workflow-kit/WorkflowKitInstallation.md",
        "docs/architecture/workflow-kit/WorkflowKitOrchestration.md",
        "docs/architecture/workflow-kit/WorkflowKitPlanMigration.md",
        "docs/architecture/workflow-kit/WorkflowKitProcess.md",
        "docs/architecture/workflow-kit/WorkflowKitQuality.md",
        "docs/architecture/workflow-kit/WorkflowKitRecovery.md",
        "product-parts/kit-core/clusters/project-workflow/cluster.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-attach.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-cancel.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-cleanup.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-guard.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-records.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-schedule.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-setup.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/workflow-assignment-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/test/workflow-assignment-cancel.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/test/workflow-assignment-facade.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/src/autopilot-decision.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/src/autopilot-model.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/src/workflow-autopilot-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/test/workflow-autopilot-decision.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/test/workflow-autopilot-pause.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-execution-mode/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-execution-mode/src/workflow-execution-mode-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-execution-mode/test/workflow-execution-mode-facade.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-history.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-identity.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-journal.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-references.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-repair.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-runner.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-staging.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-task-files.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-transaction.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/workflow-git-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/test/workflow-git-history.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/test/workflow-git-identity.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/test/workflow-git-repair.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/test/workflow-git-test-repo.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/test/workflow-git-transaction.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-host/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-host/src/host-resolve.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-host/src/host-runner.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-host/src/workflow-host-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-host/test/workflow-host-facade.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-doctor-checks.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-doctor.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-inspect.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-install.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-legacy-plan.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-migrate.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-provider-hooks.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-sections.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-texts.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/workflow-installer-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-doctor.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-existing.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-install-support.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-install.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-migrate.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-platform.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/src/integration-journal.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/src/integration-merge.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/src/integration-phases.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/src/integration-proof.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/src/workflow-integration-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/orchestration-scenario-planning.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/orchestration-scenario-support.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/orchestration-scenario.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/workflow-integration-facade.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/workflow-integration-merge-support.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/workflow-integration-merge.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-assignment.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-args.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-assignment.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-context.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-execution.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-hook.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-identity.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-integration.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-pause.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-schema.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-scope.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-text.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-context-budget.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-context.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-executor.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-facade-base.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-hooks.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-integration.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-pause.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-quality.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-scope-create.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-scope.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-status.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-task.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-cli.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-assignment.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-cli.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-context-command.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-context.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-execution-mode.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-executor.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-hooks.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-ignored-commit.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-lifecycle.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-pause.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-plan-checks.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-schema.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-status.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-support.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-worktree.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-document.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-execution.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-field-checks.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-input-checks.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-input-schema-fields.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-input-schema.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-model.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-rounds.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-scope-completion.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-service-tasks.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-transitions.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-validation.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/workflow-plan-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-document.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-execution.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-input-schema.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-rounds.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-transitions.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-validation.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/platform-fs.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/platform-launchers.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/platform-paths.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/platform-process.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/platform-runtime.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/workflow-error.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/workflow-platform-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/test/workflow-platform-facade.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/test/workflow-platform-process.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/test/workflow-test-build.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-apply.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-builtins.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-catalog.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-config.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-detect.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-globs.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-input-schema.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-proposal.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-runner.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/workflow-quality-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/test/workflow-quality-apply.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/test/workflow-quality-config.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/test/workflow-quality-detect.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/test/workflow-quality-input-schema.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/test/workflow-quality-runner-support.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/test/workflow-quality-runner.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-budget.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-commands.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-documents.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-gather.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-model.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-parts.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-roles.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-schema.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-sections.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/workflow-recovery-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-documents.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-packet.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-parts.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-project.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-roles.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-schema.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-worktree.test.mjs",
        "product-parts/kit-core/product-part.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Исходники Kit в Workflow Kit",
      "why": "Kit правится и проверяется в том же репозитории, что и приложение"
    },
    {
      "acceptance": [
        "npm run build:kit собирает workflow.mjs esbuild-ом, отказывает при импорте не node:*, проходит help, status, validate, install, validate и doctor установленного проекта",
        "Сборка пишет vendor/workflow-kit-2.2.4.mjs.gz, PROVENANCE и src/bundle-meta.ts, gzip 2.2.3 удалён",
        "Тест tools/kit-build проверяет дайджест исходников и sha256 пересборки по PROVENANCE",
        "KIT_VERSION Kit — 2.2.4; мастер предлагает проекту с Kit 2.2.3 обновление до 2.2.4",
        "tools/kit-build/README.md описывает сборку и проверку"
      ],
      "checks": [],
      "commitMessage": "feat(kit-build): build the Kit bundle from the local sources",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M22-kit-source.md",
          "heading": "2. Решение",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "tools/kit-build",
        "package.json",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md",
        "product-parts/kit-core/product-part.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/test",
        "product-parts/backend-core/clusters/projects/modules/project-setup/test",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-host/test",
        "product-parts/backend-core/clusters/projects/modules/project-setup/test/setup.test.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-host/test/workflow-host-facade.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle-meta.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/index.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/test/bundle.test.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.3.mjs.gz",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.4.mjs.gz",
        "tools/kit-build/README.md",
        "tools/kit-build/build.ts",
        "tools/kit-build/kit-build.ts",
        "tools/kit-build/test/kit-build.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Сборка бандла Kit 2.2.4 здесь",
      "why": "Исправление Kit попадает в приложение без второго репозитория"
    },
    {
      "acceptance": [
        "Раздел kitUpdate в /api/state даёт для проекта installed, bundled, state, action, running и ошибку или итог последнего обновления",
        "POST /api/projects/:id/kit/update обновляет Kit через kit-runner; повторный запуск во время работы — 409 busy; ошибка Kit сохраняется с nextAction",
        "После обновления хук Kit в Codex одобряется сам, если папка доверена; чужие хуки не одобряются",
        "Тесты покрывают раздел, маршрут, одобрение хука (в том числе команду win32) и ошибки"
      ],
      "checks": [],
      "commitMessage": "feat(kit-update): report the project Kit version and update it",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M22-kit-source.md",
          "heading": "2. Решение",
          "required": true
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update",
        "product-parts/workflow-engine/clusters/kit-host/cluster.md",
        "product-parts/workflow-engine/product-part.md",
        "package.json",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Служба: версия Kit проекта и его обновление",
      "why": "Устаревший Kit открытого проекта обновляется без мастера"
    },
    {
      "acceptance": [
        "Экран проекта показывает «Kit <версия>» или «Kit не установлен» со ссылкой на мастер",
        "Для устаревшего Kit — карточка «Kit 2.2.3 → 2.2.4» с кнопкой «Обновить Kit», состоянием работы, итогом и ошибкой Kit",
        "Модель карточки покрыта тестами"
      ],
      "checks": [],
      "commitMessage": "feat(panel-shell): show the project Kit version and the update card",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M22-kit-source.md",
          "heading": "2. Решение",
          "required": true
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Панель: версия Kit и карточка «Обновить Kit»",
      "why": "Пользователь видит версию Kit и обновляет его на экране проекта"
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
        "T000",
        "T001",
        "T002",
        "T003",
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M22-kit-source.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md",
        "product-parts/kit-core/product-part.md",
        "product-parts/workflow-engine/clusters/kit-host/cluster.md",
        "product-parts/workflow-engine/product-part.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md"
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
        "Версия 0.9.3, CHANGELOG, README и руководства обновлены",
        "M22-acceptance.md перечисляет живые проверки по ОС и кто их делает",
        "CI зелёный на ветке ci/m22-kit-source на macOS, Linux, Windows x64 и ARM64",
        "Служба 0.9.3 установлена, wfk doctor --installed — всё в порядке"
      ],
      "checks": [],
      "commitMessage": "chore: release Workflow Kit 0.9.3 with Kit 2.2.4",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T004",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "README.md",
        "docs/installation.md",
        "docs/usage.md",
        "docs/evidence/M22-acceptance.md",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Выпуск Workflow Kit 0.9.3",
      "why": "Пользователи получают Kit 2.2.4 и карточку обновления"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m22-kit-source (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 3/7
- Revision: 709

## Objective

Исходники Kit — модули Workflow Kit: бандл Kit 2.2.4 собирается здесь, экран проекта показывает версию Kit и обновляет устаревший Kit одной кнопкой, выпуск Workflow Kit 0.9.3.

## Acceptance

- 12 модулей Kit и документы Kit лежат в Workflow Kit, их тесты идут в npm test на всех ОС
- npm run build:kit собирает бандл из исходников этого репозитория; тест не пропускает исходники без пересборки
- Приложение ставит и обновляет в проектах Kit 2.2.4
- Экран проекта показывает версию Kit; для устаревшего Kit «Обновить Kit» обновляет его без мастера и без новой сессии, хук Codex одобряется сам
- CI зелёный на macOS, Linux, Windows x64 и ARM64

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T000 — Архивные и убранные сессии выходят из процесса Kit (work)
  - Commit: fix(agent-channel): leave archived and removed sessions out of the Kit process
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, product-parts/workflow-engine/clusters/session-loop/modules/session-titles, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/workflow-engine/clusters/session-loop/modules/plan-review, product-parts/workflow-engine/clusters/session-loop/modules/cross-review, product-parts/control-panel/clusters/web-panel/modules/session-view, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/test, product-parts/backend-core/clusters/runtime/modules/cli/module.md, docs/architecture/OVERVIEW.md, product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md, product-parts/backend-core/clusters/runtime/modules/cli/test/session-excluded.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/detached.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/slots.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/types.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/excluded.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/titles.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/types.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/test/titles.test.ts
- [DONE] T001 — Исходники Kit в Workflow Kit (work)
  - Commit: feat(kit-core): import the Workflow Kit sources from Harness AI
  - Files: product-parts/kit-core, docs/architecture/workflow-kit, tools/platform-guard/allowlist.json, package.json, package-lock.json, docs/architecture/OVERVIEW.md, docs/architecture/CONTRACTS.md, docs/architecture/workflow-kit/WorkflowKit.md, docs/architecture/workflow-kit/WorkflowKitCommands.md, docs/architecture/workflow-kit/WorkflowKitCoreRpc.md, docs/architecture/workflow-kit/WorkflowKitExecutionModes.md, docs/architecture/workflow-kit/WorkflowKitInstallation.md, docs/architecture/workflow-kit/WorkflowKitOrchestration.md, docs/architecture/workflow-kit/WorkflowKitPlanMigration.md, docs/architecture/workflow-kit/WorkflowKitProcess.md, docs/architecture/workflow-kit/WorkflowKitQuality.md, docs/architecture/workflow-kit/WorkflowKitRecovery.md, product-parts/kit-core/clusters/project-workflow/cluster.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-attach.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-cancel.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-cleanup.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-guard.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-records.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-schedule.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/assignment-setup.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/src/workflow-assignment-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/test/workflow-assignment-cancel.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/test/workflow-assignment-facade.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/src/autopilot-decision.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/src/autopilot-model.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/src/workflow-autopilot-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/test/workflow-autopilot-decision.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-autopilot/test/workflow-autopilot-pause.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-execution-mode/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-execution-mode/src/workflow-execution-mode-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-execution-mode/test/workflow-execution-mode-facade.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-history.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-identity.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-journal.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-references.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-repair.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-runner.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-staging.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-task-files.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/git-transaction.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/src/workflow-git-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/test/workflow-git-history.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/test/workflow-git-identity.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/test/workflow-git-repair.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/test/workflow-git-test-repo.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/test/workflow-git-transaction.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-host/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-host/src/host-resolve.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-host/src/host-runner.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-host/src/workflow-host-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-host/test/workflow-host-facade.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-doctor-checks.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-doctor.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-inspect.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-install.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-legacy-plan.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-migrate.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-provider-hooks.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-sections.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-texts.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/workflow-installer-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-doctor.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-existing.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-install-support.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-install.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-migrate.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-platform.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/src/integration-journal.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/src/integration-merge.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/src/integration-phases.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/src/integration-proof.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/src/workflow-integration-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/orchestration-scenario-planning.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/orchestration-scenario-support.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/orchestration-scenario.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/workflow-integration-facade.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/workflow-integration-merge-support.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/workflow-integration-merge.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-assignment.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-args.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-assignment.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-context.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-execution.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-hook.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-identity.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-integration.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-pause.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-schema.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-scope.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-text.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-context-budget.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-context.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-executor.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-facade-base.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-hooks.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-integration.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-pause.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-quality.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-scope-create.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-scope.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-status.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-task.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-cli.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-assignment.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-cli.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-context-command.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-context.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-execution-mode.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-executor.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-hooks.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-ignored-commit.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-lifecycle.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-pause.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-plan-checks.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-schema.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-status.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-support.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-worktree.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-document.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-execution.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-field-checks.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-input-checks.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-input-schema-fields.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-input-schema.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-model.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-rounds.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-scope-completion.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-service-tasks.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-transitions.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-validation.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/workflow-plan-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-document.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-execution.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-input-schema.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-rounds.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-transitions.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-validation.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/platform-fs.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/platform-launchers.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/platform-paths.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/platform-process.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/platform-runtime.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/workflow-error.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/src/workflow-platform-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/test/workflow-platform-facade.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/test/workflow-platform-process.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-platform/test/workflow-test-build.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-apply.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-builtins.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-catalog.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-config.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-detect.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-globs.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-input-schema.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-proposal.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-runner.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/workflow-quality-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/test/workflow-quality-apply.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/test/workflow-quality-config.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/test/workflow-quality-detect.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/test/workflow-quality-input-schema.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/test/workflow-quality-runner-support.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/test/workflow-quality-runner.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-budget.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-commands.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-documents.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-gather.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-model.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-parts.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-roles.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-schema.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/recovery-sections.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/src/workflow-recovery-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-documents.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-packet.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-parts.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-project.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-roles.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-schema.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-worktree.test.mjs, product-parts/kit-core/product-part.md
  - Depends on: T000
- [DONE] T002 — Сборка бандла Kit 2.2.4 здесь (work)
  - Commit: feat(kit-build): build the Kit bundle from the local sources
  - Files: tools/kit-build, package.json, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md, product-parts/kit-core/product-part.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/test, product-parts/backend-core/clusters/projects/modules/project-setup/test, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test, product-parts/kit-core/clusters/project-workflow/modules/workflow-host/test, product-parts/backend-core/clusters/projects/modules/project-setup/test/setup.test.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-host/test/workflow-host-facade.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle-meta.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/index.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/test/bundle.test.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.3.mjs.gz, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.4.mjs.gz, tools/kit-build/README.md, tools/kit-build/build.ts, tools/kit-build/kit-build.ts, tools/kit-build/test/kit-build.test.ts
  - Depends on: T001
- [TODO] T003 — Служба: версия Kit проекта и его обновление (work)
  - Commit: feat(kit-update): report the project Kit version and update it
  - Files: product-parts/workflow-engine/clusters/kit-host/modules/kit-update, product-parts/workflow-engine/clusters/kit-host/cluster.md, product-parts/workflow-engine/product-part.md, package.json, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md
  - Depends on: T002
- [TODO] T004 — Панель: версия Kit и карточка «Обновить Kit» (work)
  - Commit: feat(panel-shell): show the project Kit version and the update card
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell/src, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md
  - Depends on: T003
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M22-kit-source.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md, product-parts/kit-core/product-part.md, product-parts/workflow-engine/clusters/kit-host/cluster.md, product-parts/workflow-engine/product-part.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md
  - Depends on: T000, T001, T002, T003, T004
- [TODO] T005 — Выпуск Workflow Kit 0.9.3 (delivery)
  - Commit: chore: release Workflow Kit 0.9.3 with Kit 2.2.4
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/installation.md, docs/usage.md, docs/evidence/M22-acceptance.md, docs/architecture/OVERVIEW.md
  - Depends on: T004, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
