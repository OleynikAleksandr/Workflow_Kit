# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-18T08:40:14.929Z",
    "scopeId": "M43-codex-remote-owner",
    "decision": {
      "at": "2026-11-18T08:40:14.891Z",
      "decisionId": "dec-6c8a506de0f7",
      "kind": "close",
      "source": {
        "kind": "button",
        "messageId": null,
        "runId": null,
        "session": "ffc970ed-20a1-499c-9d2c-47dff30c41a0"
      },
      "text": "close: Пользователь закрыл план в панели Workflow Kit"
    }
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 1329,
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
      "Полный автопилот с выключенным ревью и выбором во время хода владельца получает разрешение (квитанции authorize и start); отказ разрешения пишется в журнал службы, повторяется и даёт blocked с причиной; «Продолжить» запуска без разрешения записывает его",
      "Новая сессия получает строку Workflow Kit autopilot с режимом, ревью и состоянием запуска (или unknown без службы); смена настроек и состояния запуска доходит до агента следующим хуком без дублей; ветки win32 и linux покрыты тестами",
      "Тексты хуков об автопилоте только при живом разрешении Kit; панель показывает «Автопилот не получил разрешения Kit» с «Повторить»",
      "Выпуск 0.20.0 установлен, CI четырёх платформ зелёный для точного SHA на ci/M44-autopilot-grant; результаты в docs/evidence/M44-acceptance.md",
      "Живая проверка пользователя на Mac: строка режима в новой сессии, переключение режима доходит к следующему ходу, следующий план под полным автопилотом проходит поставку, приёмку и закрытие без кнопок"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-18T08:53:35.860Z",
      "text": "Пользователь 18.11.2026: «как агент узнает о том, что в Workflow Kit выбрана опция автопилота? … при старте каждой сессии проверка этих установок … должна происходить, и агент об этом должен получать четкую информацию. Также это должно … доходить до агента в момент любых изменений»; на предложение: «Да, готовь, пожалуйста, спецификацию и план.» | Execution mode chosen by the user: sequential: Автоматический выбор по поручению run-grGmd5VPjbzn: sequential (recommended by the plan; ревью: skipped-by-setting)"
    },
    "automation": {
      "acceptance": [
        {
          "criterion": 0,
          "kind": "automatic",
          "checks": [
            "typecheck",
            "test",
            "platform-guard"
          ],
          "evidence": [
            "docs/evidence/M44-acceptance.md"
          ]
        },
        {
          "criterion": 1,
          "kind": "automatic",
          "checks": [
            "typecheck",
            "test",
            "platform-guard"
          ],
          "evidence": [
            "docs/evidence/M44-acceptance.md"
          ]
        },
        {
          "criterion": 2,
          "kind": "automatic",
          "checks": [
            "typecheck",
            "test"
          ],
          "evidence": [
            "docs/evidence/M44-acceptance.md"
          ]
        },
        {
          "criterion": 3,
          "kind": "automatic",
          "checks": [
            "typecheck",
            "test",
            "kit:doc-size",
            "kit:md-links"
          ],
          "evidence": [
            "docs/evidence/M44-acceptance.md"
          ]
        },
        {
          "criterion": 4,
          "kind": "manual",
          "checks": [],
          "evidence": [
            "docs/evidence/M44-acceptance.md"
          ]
        }
      ],
      "ci": {
        "remote": "origin",
        "branch": "ci/M44-autopilot-grant",
        "requiredChecks": [
          "macOS ARM64",
          "Linux x64",
          "Windows x64",
          "Windows ARM64"
        ],
        "exactSha": true,
        "task": "T007"
      },
      "delivery": [
        {
          "taskId": "T006",
          "effects": [
            "npm ci",
            "node bin/wfk.mjs install: установка Workflow Kit 0.20.0 в Application Support и перезапуск службы"
          ]
        },
        {
          "taskId": "T007",
          "effects": [
            "push ci/M44-autopilot-grant в origin и ожидание CI четырёх платформ"
          ]
        }
      ],
      "publication": {
        "branch": "main",
        "upstream": "origin/main"
      }
    },
    "baselineCommit": "437fecd9f27d245c430180a879818ab6ee5b5778",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M44-autopilot-grant-and-agent-state.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-18T08:53:35.860Z",
        "text": "Источник правды о запуске для агента и панели — разрешение в плане Kit, а не только журнал службы"
      },
      {
        "at": "2026-11-18T08:53:35.860Z",
        "text": "Строка состояния автопилота при старте сессии добавляется службой сверх пакета Kit; пакет Kit не меняется"
      },
      {
        "at": "2026-11-18T08:53:35.860Z",
        "text": "Изменения настроек и запуска доставляются очередью без пробуждения — хуком UserPromptSubmit или Stop"
      },
      {
        "at": "2026-11-18T08:53:35.860Z",
        "text": "Сообщения агенту — по-английски, ASCII, одна строка на факт"
      },
      {
        "at": "2026-11-18T08:53:35.851Z",
        "decisionId": "dec-bc86330ec6b0",
        "kind": "choose",
        "source": {
          "kind": "grant",
          "messageId": null,
          "runId": "run-grGmd5VPjbzn",
          "session": null,
          "authorization": null
        },
        "text": "choose: Автоматический выбор по поручению run-grGmd5VPjbzn: sequential (recommended by the plan; ревью: skipped-by-setting)"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "ffc970ed-20a1-499c-9d2c-47dff30c41a0",
      "strategy": "sequential"
    },
    "id": "M44-autopilot-grant",
    "objective": "Запуск полного автопилота получает разрешение Kit или явно сообщает причину и повторяет попытку; агент знает режим и состояние автопилота с начала сессии и получает изменения не позже следующего хука; панель и сообщения не говорят «автопилот» без разрешения Kit",
    "spec": "docs/planning/M44-autopilot-grant-and-agent-state.md",
    "status": "ACTIVE",
    "proposal": {
      "digest": "b6bd3498d68fa5ef083a6d090081ed0bdd1fc3f417a916cea17bed134c93bad0",
      "generation": 1
    }
  },
  "tasks": [
    {
      "acceptance": [
        "Причина M43 установлена: Kit 2.4.5 отказывает autopilot:authorize полного автопилота с ручным критерием (AUTOPILOT_MANUAL_REQUIRED, правило M39), хотя служба по M41 ждёт приёмки пользователя; описано в «Уточнениях реализации» спецификации",
        "Kit 2.4.6: authorize допускает mode full с ручным критерием при accept=false и acceptancePolicy manual; accept=true или policy automatic с ручным критерием по-прежнему AUTOPILOT_MANUAL_REQUIRED; бандл пересобран, версия 2.4.6 в payload, bundle-meta, vendor и PROVENANCE; тесты kit-core",
        "Реальный сценарий на bundle 2.4.6: полный автопилот, ревью выключено, ручной критерий — квитанции review, choose, authorize, start; поставки подтверждаются запуском, запуск ждёт приёмки пользователя, после неё сам закрывает",
        "Каждый выход start() и grant() пишет строку autopiloting: <run> start/grant с исходом; повторный block не затирает pausedFrom и причину; resume запуска без authority записывает разрешение, отказ — blocked с причиной",
        "Нет разрешения и нет квитанции start — следующий reconcile повторяет старт; квитанция start без разрешения — до 3 попыток, затем blocked authorization-missing: <код Kit>; autopiloting.md, module.md и OS-MATRIX.md обновлены"
      ],
      "checks": [],
      "commitMessage": "fix: authorize full autopilot runs reliably and log every start outcome",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M44-autopilot-grant-and-agent-state.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "docs/architecture/OS-MATRIX.md",
        "docs/planning/M44-autopilot-grant-and-agent-state.md",
        "docs/evidence/M44-acceptance.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/authorization.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-authorization-input.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-authorization.test.mjs",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle-meta.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.4.5.mjs.gz",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.4.6.mjs.gz",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/grant.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-prepare.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m44-manual-full-real.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/prepare-retry.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/runs-grant.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Разрешение запуска: воспроизведение, исправление, журнал, повтор",
      "why": "В M43 запуск выбрал способ, но так и не получил разрешения Kit — всё шло по кнопкам"
    },
    {
      "acceptance": [
        "wfk hook session-start печатает для Claude, ChatGPT и Kimi строку Workflow Kit autopilot: mode, review, run (authorized, NOT authorized с причиной, paused, blocked, none) в формате контекста каждого клиента, в бюджете хука",
        "Служба недоступна — строка unknown (service not reachable); HTTP-маршрут описан в HTTP-CONTRACTS.md",
        "Тесты: каждый клиент, недоступная служба, ветки win32 и linux с подставленной платформой; OS-MATRIX.md и module.md обновлены"
      ],
      "checks": [],
      "commitMessage": "feat: tell every new session the autopilot mode and run state",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M44-autopilot-grant-and-agent-state.md",
          "required": true,
          "heading": "3.2. Состояние автопилота при старте сессии (`cli`: `hook.ts`, `hook-service.ts`; `agent-channel`)"
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "docs/architecture/HTTP-CONTRACTS.md",
        "docs/architecture/OS-MATRIX.md",
        "docs/evidence/M44-acceptance.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/commands.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/autopilot-line.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/hook.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-start-line.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/hook-link.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/session-start-line.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/hook-input.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/session-start-route.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Строка состояния автопилота при старте сессии",
      "why": "Агент не знает режим автопилота и состояние запуска с начала сессии"
    },
    {
      "acceptance": [
        "Смена режима или ревью ставит в очередь сессий-владельцев и сессий проектов с открытым планом строку settings changed без пробуждения; доставка хуком prompt или stop, без дублей",
        "Смена состояния запуска (разрешение, отказ, пауза, остановка, конец) — строка autopilot run <id>: <состояние> в очередь владельца",
        "Тексты хуков об автопилоте — только при живом разрешении Kit; без него — ручные тексты; тесты на всё перечисленное"
      ],
      "checks": [],
      "commitMessage": "feat: queue autopilot settings and run changes for the agent",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M44-autopilot-grant-and-agent-state.md",
          "required": true
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "docs/evidence/M44-acceptance.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Изменения настроек и запуска доходят до агента; тексты только при разрешении",
      "why": "Смена режима в Settings и судьба запуска агенту не сообщаются; служба говорит «autopilot» без разрешения Kit"
    },
    {
      "acceptance": [
        "Модель панели: запуск executing или delivering без живого разрешения — «Автопилот не получил разрешения Kit», причина и кнопка «Повторить» (beginExecution); тест модели и браузерный тест"
      ],
      "checks": [],
      "commitMessage": "feat: show an unauthorized autopilot run with a retry in the panel",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M44-autopilot-grant-and-agent-state.md",
          "required": true,
          "heading": "3.4. Один источник правды (`autopilot`, `session-view`)"
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-view",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "docs/evidence/M44-acceptance.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Панель: автопилот без разрешения Kit",
      "why": "Панель показывала «Выполняет задачи» при запуске без разрешения"
    },
    {
      "acceptance": [
        "Сквозные сценарии с реальным bundle Kit 2.4.5: полный автопилот без ревью проходит до публикации без кнопок; строка SessionStart и сообщения об изменениях доходят до агента; результаты в docs/evidence/M44-acceptance.md"
      ],
      "checks": [],
      "commitMessage": "test: verify M44 autopilot grant and agent state end to end",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M44-autopilot-grant-and-agent-state.md",
          "required": true,
          "heading": "5. Проверка"
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test",
        "product-parts/backend-core/clusters/runtime/modules/cli/test",
        "docs/evidence/M44-acceptance.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Сквозные сценарии и доказательства",
      "why": "Проверить весь путь полного автопилота без кнопок и доставку состояния агенту"
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
        "docs/planning/M44-autopilot-grant-and-agent-state.md",
        "docs/evidence/M44-acceptance.md",
        "docs/architecture/HTTP-CONTRACTS.md",
        "docs/architecture/OS-MATRIX.md"
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
        "Версия 0.20.0 установлена через node bin/wfk.mjs install, doctor --installed — всё в порядке, результат в evidence; CHANGELOG и README называют 0.20.0"
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: release Workflow Kit 0.20.0",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M44-autopilot-grant-and-agent-state.md",
          "required": true,
          "heading": "5. Проверка"
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
        "CHANGELOG.md",
        "README.md",
        "docs/evidence/M44-acceptance.md"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Поставка 0.20.0",
      "why": "Пользователь получает надёжный полный автопилот"
    },
    {
      "acceptance": [
        "CI на ci/M44-autopilot-grant успешен для точного SHA на macOS ARM64, Linux x64, Windows x64 и Windows ARM64; ссылка в evidence"
      ],
      "checks": [],
      "commitMessage": "test: verify M44 on four CI platforms",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M44-autopilot-grant-and-agent-state.md",
          "required": true,
          "heading": "5. Проверка"
        }
      ],
      "dependencies": [
        "T006",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M44-acceptance.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "CI четырёх платформ",
      "why": "Изменения в хуках и службе: нужна зелёная CI macOS, Linux и Windows x64/ARM64"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: M44-autopilot-grant (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Automation: 4 automatic, 1 manual criteria; CI origin ci/M44-autopilot-grant (4 checks); publication main → origin/main
- Current task: none
- Progress: 2/8
- Revision: 1329

## Objective

Запуск полного автопилота получает разрешение Kit или явно сообщает причину и повторяет попытку; агент знает режим и состояние автопилота с начала сессии и получает изменения не позже следующего хука; панель и сообщения не говорят «автопилот» без разрешения Kit

## Acceptance

- Полный автопилот с выключенным ревью и выбором во время хода владельца получает разрешение (квитанции authorize и start); отказ разрешения пишется в журнал службы, повторяется и даёт blocked с причиной; «Продолжить» запуска без разрешения записывает его
- Новая сессия получает строку Workflow Kit autopilot с режимом, ревью и состоянием запуска (или unknown без службы); смена настроек и состояния запуска доходит до агента следующим хуком без дублей; ветки win32 и linux покрыты тестами
- Тексты хуков об автопилоте только при живом разрешении Kit; панель показывает «Автопилот не получил разрешения Kit» с «Повторить»
- Выпуск 0.20.0 установлен, CI четырёх платформ зелёный для точного SHA на ci/M44-autopilot-grant; результаты в docs/evidence/M44-acceptance.md
- Живая проверка пользователя на Mac: строка режима в новой сессии, переключение режима доходит к следующему ходу, следующий план под полным автопилотом проходит поставку, приёмку и закрытие без кнопок

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Разрешение запуска: воспроизведение, исправление, журнал, повтор (work)
  - Commit: fix: authorize full autopilot runs reliably and log every start outcome
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle, product-parts/workflow-engine/clusters/kit-host/modules/kit-update, product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, docs/architecture/OS-MATRIX.md, docs/planning/M44-autopilot-grant-and-agent-state.md, docs/evidence/M44-acceptance.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/authorization.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-authorization-input.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test/workflow-plan-authorization.test.mjs, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle-meta.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.4.5.mjs.gz, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.4.6.mjs.gz, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/grant.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-prepare.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m44-manual-full-real.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/prepare-retry.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/runs-grant.test.ts
- [DONE] T002 — Строка состояния автопилота при старте сессии (work)
  - Commit: feat: tell every new session the autopilot mode and run state
  - Files: product-parts/backend-core/clusters/runtime/modules/cli, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, docs/architecture/HTTP-CONTRACTS.md, docs/architecture/OS-MATRIX.md, docs/evidence/M44-acceptance.md, product-parts/backend-core/clusters/runtime/modules/cli/commands.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/autopilot-line.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/hook.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-start-line.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/hook-link.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/session-start-line.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/hook-input.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/session-start-route.test.ts
  - Depends on: T001
- [TODO] T003 — Изменения настроек и запуска доходят до агента; тексты только при разрешении (work)
  - Commit: feat: queue autopilot settings and run changes for the agent
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/backend-core/clusters/runtime/modules/cli, docs/evidence/M44-acceptance.md
  - Depends on: T002
- [TODO] T004 — Панель: автопилот без разрешения Kit (work)
  - Commit: feat: show an unauthorized autopilot run with a retry in the panel
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-view, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, docs/evidence/M44-acceptance.md
  - Depends on: T003
- [TODO] T005 — Сквозные сценарии и доказательства (work)
  - Commit: test: verify M44 autopilot grant and agent state end to end
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test, product-parts/backend-core/clusters/runtime/modules/cli/test, docs/evidence/M44-acceptance.md
  - Depends on: T004
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M44-autopilot-grant-and-agent-state.md, docs/evidence/M44-acceptance.md, docs/architecture/HTTP-CONTRACTS.md, docs/architecture/OS-MATRIX.md
  - Depends on: T001, T002, T003, T004, T005
- [TODO] T006 — Поставка 0.20.0 (delivery)
  - Commit: chore: release Workflow Kit 0.20.0
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/evidence/M44-acceptance.md
  - Depends on: T005, DOCS-R1
- [TODO] T007 — CI четырёх платформ (delivery)
  - Commit: test: verify M44 on four CI platforms
  - Files: docs/evidence/M44-acceptance.md
  - Depends on: T006, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
