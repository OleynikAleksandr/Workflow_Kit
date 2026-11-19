# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-19T14:46:56.872Z",
    "scopeId": "M45-claude-terminal-delivery",
    "decision": {
      "at": "2026-11-19T14:46:56.838Z",
      "decisionId": "dec-12214a2a08e6",
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
  "revision": 1385,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "Provider.sendDirect -> boolean | DirectRefusal { refused: string } (provider-registry chat.ts)",
          "agent-channel DirectAnswer = boolean | 'unconfirmed' | { refused }; route answers { sent: false, undelivered: { reason } } for refused",
          "provider-claude TERMINAL_BUSY_REASON; parameter-screen MODEL_FOOTER"
        ],
        "decisions": [
          "The /model menu is recognized by Select model, no input row and a footer of 2.1.325 or 2.1.328 (MODEL_FOOTER); hidden rows by «… +N models» or «↓ N more»",
          "A paste refused because the terminal is not free is undelivered with the host's reason, never queued; false (no direct path, busy session) still queues",
          "M28 rules stay: the host closes only its own menu"
        ],
        "references": [
          "docs/planning/M46-claude-2-1-328-menu.md",
          "docs/evidence/M46-acceptance.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md",
          "docs/architecture/HTTP-CONTRACTS.md",
          "docs/architecture/OS-MATRIX-M46.md"
        ],
        "result": "Claude 2.1.328 works again with the panel: the parameter host recognizes its /model menu (footer «s to use this session only · Enter to save», scroll marker «↓ N more»), reads the whole catalog and closes its menu; a panel message to a terminal that is not free is answered undelivered with the reason at once instead of a queue a waiting session never takes."
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
      "Кадр меню /model Claude 2.1.328 (подсказка «s to use this session only · Enter to save · Esc to cancel») распознаётся как model со строками моделей и уровнем; транзакция уровня и чтение каталога на кадрах 2.1.328 заканчиваются пустым полем; кадры 2.1.325 — как раньше; хост ConPTY покрыт тестом",
      "sendDirect при несвободном терминале возвращает { refused: причина }; маршрут сообщения отвечает { sent: false, undelivered: { reason } } и ничего не кладёт в очередь; без прямого пути — очередь, как раньше",
      "Выпуск 0.20.2 установлен, CI четырёх платформ зелёный для точного SHA на ci/M46-claude-2-1-328-menu; результаты в docs/evidence/M46-acceptance.md",
      "Живая проверка пользователя на Mac с Claude 2.1.328: смена уровня и модели из панели не оставляет меню, следующее сообщение панели доходит, панель показывает модели"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-19T14:56:28.611Z",
      "text": "Пользователь 19.11.2026 после первого теста 0.20.1 в проекте S_001: «Ну и прямо сразу ничего не работает.» (снимок: сообщение «в очереди» и «Сообщение не дошло до Claude»); план запрошен через wfk session plan, полный автопилот run-2dURYOtIflz8 | Execution mode chosen by the user: sequential: Автоматический выбор по поручению run-2dURYOtIflz8: sequential (recommended by the plan; ревью: skipped-by-setting)"
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
            "docs/evidence/M46-acceptance.md"
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
            "docs/evidence/M46-acceptance.md"
          ]
        },
        {
          "criterion": 2,
          "kind": "automatic",
          "checks": [
            "typecheck",
            "test",
            "kit:doc-size",
            "kit:md-links"
          ],
          "evidence": [
            "docs/evidence/M46-acceptance.md"
          ]
        },
        {
          "criterion": 3,
          "kind": "manual",
          "checks": [],
          "evidence": [
            "docs/evidence/M46-acceptance.md"
          ]
        }
      ],
      "ci": {
        "remote": "origin",
        "branch": "ci/M46-claude-2-1-328-menu",
        "requiredChecks": [
          "macOS ARM64",
          "Linux x64",
          "Windows x64",
          "Windows ARM64"
        ],
        "exactSha": true,
        "task": "T005"
      },
      "delivery": [
        {
          "taskId": "T004",
          "effects": [
            "npm ci",
            "node bin/wfk.mjs install: установка Workflow Kit 0.20.2 в Application Support и перезапуск службы"
          ]
        },
        {
          "taskId": "T005",
          "effects": [
            "push ci/M46-claude-2-1-328-menu в origin и ожидание CI четырёх платформ"
          ]
        }
      ],
      "publication": {
        "branch": "main",
        "upstream": "origin/main"
      }
    },
    "baselineCommit": "c497b79695e894ed5a0801964754502c082c0080",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M46-claude-2-1-328-menu.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-19T14:56:28.611Z",
        "text": "Меню /model узнаётся по заголовку Select model и Esc to cancel плюс подсказке любой из версий 2.1.325 и 2.1.328"
      },
      {
        "at": "2026-11-19T14:56:28.611Z",
        "text": "Несвободный терминал — отказ с причиной (undelivered), не очередь: ждущая сессия очередь не заберёт"
      },
      {
        "at": "2026-11-19T14:56:28.611Z",
        "text": "Правила M28 остаются: чужие окна Claude хост не закрывает"
      },
      {
        "at": "2026-11-19T14:56:28.602Z",
        "decisionId": "dec-ec58430b6d1d",
        "kind": "choose",
        "source": {
          "kind": "grant",
          "messageId": null,
          "runId": "run-2dURYOtIflz8",
          "session": null,
          "authorization": null
        },
        "text": "choose: Автоматический выбор по поручению run-2dURYOtIflz8: sequential (recommended by the plan; ревью: skipped-by-setting)"
      },
      {
        "at": "2026-11-19T15:26:41.332Z",
        "kind": "confirm-delivery",
        "source": {
          "authorization": "2b8e7a173bbeafa7980373133c72081106db15902a9edcd4c0691e189c1f8b27",
          "kind": "grant",
          "runId": "run-2dURYOtIflz8"
        },
        "text": "Delivery T004 started by the advance instruction of run run-2dURYOtIflz8"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": "ffc970ed-20a1-499c-9d2c-47dff30c41a0",
      "strategy": "sequential"
    },
    "id": "M46-claude-2-1-328-menu",
    "objective": "Хост параметров узнаёт меню /model Claude 2.1.328 и закрывает его за собой, каталог моделей читается; сообщение панели, которое нельзя вставить, сразу показано «не дошло» с причиной и «Повторить», без очереди",
    "spec": "docs/planning/M46-claude-2-1-328-menu.md",
    "status": "ACTIVE",
    "proposal": {
      "digest": "e310e49a756be380a8bd21fe196a119233aa5e6477a34806af9f579781f30b0f",
      "generation": 1
    },
    "authorization": {
      "accept": false,
      "acceptancePolicy": "manual",
      "at": "2026-11-19T14:56:30.376Z",
      "ci": {
        "remote": "origin",
        "branch": "ci/M46-claude-2-1-328-menu",
        "requiredChecks": [
          "macOS ARM64",
          "Linux x64",
          "Windows x64",
          "Windows ARM64"
        ],
        "exactSha": true,
        "task": "T005"
      },
      "close": true,
      "delivery": [
        {
          "taskId": "T004",
          "effects": [
            "npm ci",
            "node bin/wfk.mjs install: установка Workflow Kit 0.20.2 в Application Support и перезапуск службы"
          ]
        },
        {
          "taskId": "T005",
          "effects": [
            "push ci/M46-claude-2-1-328-menu в origin и ожидание CI четырёх платформ"
          ]
        }
      ],
      "mode": "full",
      "note": "Full autopilot run run-2dURYOtIflz8: the user's direct instruction «Ну и прямо сразу ничего не работает.» (2026-11-19T14:51:03.745Z) to prepare and carry out the plan",
      "ownerSession": "ffc970ed-20a1-499c-9d2c-47dff30c41a0",
      "proposalDigest": "e310e49a756be380a8bd21fe196a119233aa5e6477a34806af9f579781f30b0f",
      "publication": {
        "branch": "main",
        "upstream": "origin/main"
      },
      "revision": 1,
      "revoked": null,
      "runId": "run-2dURYOtIflz8",
      "source": "user-command"
    }
  },
  "tasks": [
    {
      "acceptance": [
        "parameterFrame узнаёт меню 2.1.328 (Select model, Esc to cancel, подсказка s to use this session only или Enter to save) и 2.1.325; строки, More models и уровень усилия разбираются",
        "Транзакция уровня (s) и чтение каталога на записанных кадрах 2.1.328 заканчиваются idle с пустым полем; хост ConPTY с тем же кадром",
        "module.md, native-parameters.md и OS-MATRIX-M46.md обновлены"
      ],
      "checks": [],
      "commitMessage": "fix: recognize the /model menu of Claude 2.1.328",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M46-claude-2-1-328-menu.md",
          "heading": "3. Решение",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "docs/architecture/OS-MATRIX.md",
        "docs/architecture/OS-MATRIX-M46.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-screen.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/claude-2-1-328.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/m46-menu.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Меню /model Claude 2.1.328",
      "why": "Хост принимал своё меню за чужое окно и оставлял его открытым, терминал Claude блокировался"
    },
    {
      "acceptance": [
        "Контракт sendDirect: true | false | { refused: string }; provider-claude возвращает refused с причиной состояния хоста",
        "Маршрут: refused — { sent: false, undelivered: { reason } }, очередь пуста, строка журнала; false — очередь, как было",
        "Тесты direct.ts, маршрута и cli; HTTP-CONTRACTS.md, CONTRACTS.md и module.md обновлены"
      ],
      "checks": [],
      "commitMessage": "fix: answer undelivered when Claude's terminal is not free",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M46-claude-2-1-328-menu.md",
          "heading": "3. Решение",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "docs/architecture/HTTP-CONTRACTS.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OS-MATRIX-M46.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/direct-message.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/m46-direct-refused.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/sessions.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/m45-direct.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/chat.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/m46-direct-refused.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Отказ вставки — «не дошло», без очереди",
      "why": "Сообщение в несвободный терминал ждущей сессии лежало в очереди, которую никто не забирал"
    },
    {
      "acceptance": [
        "Сценарий S_001: смена уровня из панели на кадрах 2.1.328 — меню закрыто, следующее сообщение панели вставлено; несвободный терминал на настоящей службе — undelivered без очереди",
        "docs/evidence/M46-acceptance.md: причина, воспроизведение, коммиты, проверки, живые проверки по ОС"
      ],
      "checks": [],
      "commitMessage": "test: verify M46 end to end",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M46-claude-2-1-328-menu.md",
          "heading": "5. Проверка",
          "required": true
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test",
        "product-parts/backend-core/clusters/runtime/modules/cli/test",
        "docs/evidence/M46-acceptance.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/m46-refused-e2e.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/m46-scenarios.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Сквозные сценарии и доказательства",
      "why": "Случай S_001 воспроизводится тестами до выпуска"
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
        "docs/planning/M46-claude-2-1-328-menu.md",
        "docs/architecture/OS-MATRIX.md",
        "docs/architecture/OS-MATRIX-M46.md",
        "docs/architecture/HTTP-CONTRACTS.md",
        "docs/architecture/CONTRACTS.md",
        "docs/evidence/M46-acceptance.md"
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
        "Версия 0.20.2 установлена через node bin/wfk.mjs install, doctor --installed — всё в порядке, результат в evidence; CHANGELOG и README называют 0.20.2"
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: release Workflow Kit 0.20.2",
      "confirmation": "Autopilot run run-2dURYOtIflz8 (authorization 1, user-command, 2026-11-19T14:56:30.376Z): Full autopilot run run-2dURYOtIflz8: the user's direct instruction «Ну и прямо сразу ничего не работает.» (2026-11-19T14:51:03.745Z) to prepare and carry out the plan | effects: npm ci; node bin/wfk.mjs install: установка Workflow Kit 0.20.2 в Application Support и перезапуск службы",
      "context": [
        {
          "path": "docs/planning/M46-claude-2-1-328-menu.md",
          "heading": "5. Проверка",
          "required": true
        }
      ],
      "dependencies": [
        "T003",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "README.md",
        "docs/evidence/M46-acceptance.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Поставка 0.20.2",
      "why": "Пользователь получает рабочую доставку на Claude 2.1.328"
    },
    {
      "acceptance": [
        "CI на ci/M46-claude-2-1-328-menu успешен для точного SHA на macOS ARM64, Linux x64, Windows x64 и Windows ARM64; ссылка в evidence"
      ],
      "checks": [],
      "commitMessage": "test: verify M46 on four CI platforms",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M46-claude-2-1-328-menu.md",
          "heading": "5. Проверка",
          "required": true
        }
      ],
      "dependencies": [
        "T004",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M46-acceptance.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "CI четырёх платформ",
      "why": "Изменения в хосте терминала и службе: нужна зелёная CI macOS, Linux и Windows x64/ARM64"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: M46-claude-2-1-328-menu (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Automation: 3 automatic, 1 manual criteria; CI origin ci/M46-claude-2-1-328-menu (4 checks); publication main → origin/main
- Current task: none
- Progress: 5/6
- Revision: 1385

## Objective

Хост параметров узнаёт меню /model Claude 2.1.328 и закрывает его за собой, каталог моделей читается; сообщение панели, которое нельзя вставить, сразу показано «не дошло» с причиной и «Повторить», без очереди

## Acceptance

- Кадр меню /model Claude 2.1.328 (подсказка «s to use this session only · Enter to save · Esc to cancel») распознаётся как model со строками моделей и уровнем; транзакция уровня и чтение каталога на кадрах 2.1.328 заканчиваются пустым полем; кадры 2.1.325 — как раньше; хост ConPTY покрыт тестом
- sendDirect при несвободном терминале возвращает { refused: причина }; маршрут сообщения отвечает { sent: false, undelivered: { reason } } и ничего не кладёт в очередь; без прямого пути — очередь, как раньше
- Выпуск 0.20.2 установлен, CI четырёх платформ зелёный для точного SHA на ci/M46-claude-2-1-328-menu; результаты в docs/evidence/M46-acceptance.md
- Живая проверка пользователя на Mac с Claude 2.1.328: смена уровня и модели из панели не оставляет меню, следующее сообщение панели доходит, панель показывает модели

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Меню /model Claude 2.1.328 (work)
  - Commit: fix: recognize the /model menu of Claude 2.1.328
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, docs/architecture/OS-MATRIX.md, docs/architecture/OS-MATRIX-M46.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-screen.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/claude-2-1-328.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/m46-menu.test.ts
- [DONE] T002 — Отказ вставки — «не дошло», без очереди (work)
  - Commit: fix: answer undelivered when Claude's terminal is not free
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, product-parts/backend-core/clusters/runtime/modules/cli, docs/architecture/HTTP-CONTRACTS.md, docs/architecture/CONTRACTS.md, docs/architecture/OS-MATRIX-M46.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/direct-message.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/m46-direct-refused.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/sessions.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/m45-direct.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/chat.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/m46-direct-refused.test.ts
  - Depends on: T001
- [DONE] T003 — Сквозные сценарии и доказательства (work)
  - Commit: test: verify M46 end to end
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test, product-parts/backend-core/clusters/runtime/modules/cli/test, docs/evidence/M46-acceptance.md, product-parts/backend-core/clusters/runtime/modules/cli/test/m46-refused-e2e.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/m46-scenarios.test.ts
  - Depends on: T002
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M46-claude-2-1-328-menu.md, docs/architecture/OS-MATRIX.md, docs/architecture/OS-MATRIX-M46.md, docs/architecture/HTTP-CONTRACTS.md, docs/architecture/CONTRACTS.md, docs/evidence/M46-acceptance.md
  - Depends on: T001, T002, T003
- [DONE] T004 — Поставка 0.20.2 (delivery)
  - Commit: chore: release Workflow Kit 0.20.2
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/evidence/M46-acceptance.md
  - Depends on: T003, DOCS-R1
- [TODO] T005 — CI четырёх платформ (delivery)
  - Commit: test: verify M46 on four CI platforms
  - Files: docs/evidence/M46-acceptance.md
  - Depends on: T004, DOCS-R1

Digest: Claude 2.1.328 works again with the panel: the parameter host recognizes its /model menu (footer «s to use this session only · Enter to save», scroll marker «↓ N more»), reads the whole catalog and closes its menu; a panel message to a terminal that is not free is answered undelivered with the reason at once instead of a queue a waiting session never takes.

State changes only through `scripts/workflow` commands. History lives in Git.
