# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-18T18:38:40.143Z",
    "scopeId": "M44-autopilot-grant",
    "decision": {
      "at": "2026-11-18T18:38:40.109Z",
      "decisionId": "dec-dd9864cb177b",
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
  "revision": 1367,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "POST /api/projects/:id/sessions/:sid/message -> { sent: true } | { queued } | { sent: false, undelivered: { reason } } (DIRECT_CONFIRM_MS 8 s)",
          "AgentChannel.directTurn(key, projectId, text, send, confirmMs?) -> boolean | 'unconfirmed'",
          "ParameterFiles size/slice and IngressWatch (pty/remote-ingress.ts); NativeCatalog.failed; DRAFT_REASON, UNSAFE_REASON",
          "session-chat undeliveredNote(response), RETRY_LABEL; session-view deliveryWaits(state, projectId, plan)"
        ],
        "decisions": [
          "M28 cleanup rules stay: only the host's own menu gets Esc and only its exact command is cleared; the user's text waits while the terminal is unclean (up to 10 s) instead",
          "A paste counts as delivered only when its prompt hook took the turn reservation; an unconfirmed paste is not queued",
          "Confirmation is awaited only for a session whose hooks the channel has seen",
          "The delivery card of a host project follows Kit state (next task a delivery in TODO, no granted run), not the session autopilot turn decision"
        ],
        "references": [
          "docs/planning/M45-claude-terminal-delivery.md",
          "docs/evidence/M45-acceptance.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md",
          "docs/architecture/HTTP-CONTRACTS.md",
          "docs/architecture/OS-MATRIX-M45.md"
        ],
        "result": "Panel messages to Claude are no longer lost: the parameter host yields to Remote Control messages (Ingress line of Claude's debug log), closes its idle /model menu after 10 s, keeps a failed catalog discovery per CLI version and settles a wanted value Claude already has; sendDirect pastes only into a free terminal and the route confirms the paste by its UserPromptSubmit hook within 8 s, else undelivered; the panel shows «Сообщение не дошло до Claude» with «Повторить» and the delivery card without the session autopilot."
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
      "Хост параметров после отмены закрывает своё меню и очищает набранную команду, уступает сообщению Remote Control (строка Ingress в логе Claude) и закрывает меню без шага через 10 с; неудачное чтение каталога не повторяется после рестарта хоста; действующее пожелание снимается; ветки win32 и linux покрыты тестами",
      "Сообщение панели не вставляется в занятый терминал или непустое поле (идёт в очередь); вставленное подтверждается хуком UserPromptSubmit с тем же текстом до 8 с, иначе маршрут отвечает undelivered с причиной",
      "Панель показывает «Сообщение не дошло до Claude» с причиной, сохраняет текст и даёт «Повторить»; карточка «Подтвердить выпуск» в проекте decisions host видна при выключенном автопилоте сессии",
      "Выпуск 0.20.1 установлен, CI четырёх платформ зелёный для точного SHA на ci/M45-claude-terminal-delivery; результаты в docs/evidence/M45-acceptance.md",
      "Живая проверка пользователя на Mac: после возобновления сессии из панели сообщения панели и десктопа доходят сразу, смена режима не мигает, поставка без автопилота сессии показывает карточку"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-19T10:01:09.483Z",
      "text": "Пользователь 19.11.2026: «Ну вот опять я отправил в диалог workflow кит нашей сессии поручение составить спецификацию и план, и оно никуда к тебе не пришло. Пишу теперь в десктопе то же самое.» — в ответ на предложение исправить доставку сообщений панели, уборку /model хостом параметров, мигание режима и карточки при выключенном автопилоте | Execution mode chosen by the user: sequential: Автоматический выбор по поручению run-FaBBeFOCW1rL: sequential (recommended by the plan; ревью: skipped-by-setting)"
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
            "docs/evidence/M45-acceptance.md"
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
            "docs/evidence/M45-acceptance.md"
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
            "docs/evidence/M45-acceptance.md"
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
            "docs/evidence/M45-acceptance.md"
          ]
        },
        {
          "criterion": 4,
          "kind": "manual",
          "checks": [],
          "evidence": [
            "docs/evidence/M45-acceptance.md"
          ]
        }
      ],
      "ci": {
        "remote": "origin",
        "branch": "ci/M45-claude-terminal-delivery",
        "requiredChecks": [
          "macOS ARM64",
          "Linux x64",
          "Windows x64",
          "Windows ARM64"
        ],
        "exactSha": true,
        "task": "T006"
      },
      "delivery": [
        {
          "taskId": "T005",
          "effects": [
            "npm ci",
            "node bin/wfk.mjs install: установка Workflow Kit 0.20.1 в Application Support и перезапуск службы"
          ]
        },
        {
          "taskId": "T006",
          "effects": [
            "push ci/M45-claude-terminal-delivery в origin и ожидание CI четырёх платформ"
          ]
        }
      ],
      "publication": {
        "branch": "main",
        "upstream": "origin/main"
      }
    },
    "baselineCommit": "8468254dfcfb5b7fda969171a67783bfe330cf1d",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M45-claude-terminal-delivery.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-19T10:01:09.483Z",
        "text": "Хост панели пишет в терминал Claude только при свободном терминале с пустым полем и возвращает его в такое состояние"
      },
      {
        "at": "2026-11-19T10:01:09.483Z",
        "text": "Сообщение панели доставлено, только когда хук UserPromptSubmit принёс его текст; иначе undelivered, текст остаётся в панели"
      },
      {
        "at": "2026-11-19T10:01:09.483Z",
        "text": "Сообщения Remote Control хост узнаёт по строке Ingress в логе Claude (--debug-file), запасной путь — предел меню 10 с"
      },
      {
        "at": "2026-11-19T10:01:09.483Z",
        "text": "Медленный хук SessionStart на macOS CI и причина пустого каталога CLI 2.1.328 — вне плана"
      },
      {
        "at": "2026-11-19T10:01:09.474Z",
        "decisionId": "dec-3d81c6f0b2ef",
        "kind": "choose",
        "source": {
          "kind": "grant",
          "messageId": null,
          "runId": "run-FaBBeFOCW1rL",
          "session": null,
          "authorization": null
        },
        "text": "choose: Автоматический выбор по поручению run-FaBBeFOCW1rL: sequential (recommended by the plan; ревью: skipped-by-setting)"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": "ffc970ed-20a1-499c-9d2c-47dff30c41a0",
      "strategy": "sequential"
    },
    "id": "M45-claude-terminal-delivery",
    "objective": "Сообщение из панели доходит до Claude или явно помечено «не доставлено» с сохранённым текстом; смена параметров не оставляет в терминале меню или набранную команду и уступает сообщениям десктопа; режим не мигает, когда он уже стоит; карточка поставки видна и без автопилота сессии",
    "spec": "docs/planning/M45-claude-terminal-delivery.md",
    "status": "ACTIVE",
    "proposal": {
      "digest": "d8150187f44d110906b379f5e7e610a8c1598ee75fab59625d0ad7dba477b9bd",
      "generation": 1
    },
    "authorization": {
      "accept": false,
      "acceptancePolicy": "manual",
      "at": "2026-11-19T10:01:11.310Z",
      "ci": {
        "remote": "origin",
        "branch": "ci/M45-claude-terminal-delivery",
        "requiredChecks": [
          "macOS ARM64",
          "Linux x64",
          "Windows x64",
          "Windows ARM64"
        ],
        "exactSha": true,
        "task": "T006"
      },
      "close": true,
      "delivery": [
        {
          "taskId": "T005",
          "effects": [
            "npm ci",
            "node bin/wfk.mjs install: установка Workflow Kit 0.20.1 в Application Support и перезапуск службы"
          ]
        },
        {
          "taskId": "T006",
          "effects": [
            "push ci/M45-claude-terminal-delivery в origin и ожидание CI четырёх платформ"
          ]
        }
      ],
      "mode": "full",
      "note": "Full autopilot run run-FaBBeFOCW1rL: the user's direct instruction «Ну вот опять я отправил в диалог workflow кит нашей сессии поручение составить спецификацию и план, и оно никуда к тебе не пришло. Пишу теперь в десктопе то же самое.» (2026-11-19T09:57:22.326Z) to prepare and carry out the plan",
      "ownerSession": "ffc970ed-20a1-499c-9d2c-47dff30c41a0",
      "proposalDigest": "d8150187f44d110906b379f5e7e610a8c1598ee75fab59625d0ad7dba477b9bd",
      "publication": {
        "branch": "main",
        "upstream": "origin/main"
      },
      "revision": 1,
      "revoked": null,
      "runId": "run-FaBBeFOCW1rL",
      "source": "user-command"
    }
  },
  "tasks": [
    {
      "acceptance": [
        "После отмены транзакции хост закрывает Escape только своё меню того же вида и очищает только поле, где ровно его набранная команда (правила M28: чужой ввод, чужой диалог и чужое меню не трогаются); не больше трёх клавиш уборки, клавиша без изменения экрана не ждётся дольше 1 с; терминал, не вернувшийся к пустому полю, — unsafe с причиной в состоянии хоста",
        "Текст пользователя (.text, .message, .rename) ждёт, пока транзакция убирает за собой и пока терминал unsafe с непустым полем (до 10 с), и не вставляется в меню или за набранную команду",
        "Строка [bridge:repl] Ingress message type=user в логе Claude отменяет транзакцию как ввод пользователя; после ввода 3 с без обнаружения; меню хоста без шага дольше 10 с закрывается",
        "Неудачное чтение каталога на той же версии CLI и модели не повторяется после рестарта хоста (failed в каталоге, слияние в службе)",
        "Пожелание параметра, равное текущему значению Claude, снимается сразу, и при занятом терминале",
        "Тесты движка и хоста на записанных кадрах, хост ConPTY (Windows) с путём C:; module.md, native-parameters.md, OS-MATRIX-M45.md и уточнения спецификации обновлены"
      ],
      "checks": [],
      "commitMessage": "fix: clean up Claude parameter transactions and yield to remote messages",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M45-claude-terminal-delivery.md",
          "heading": "3. Решение",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "docs/architecture/OS-MATRIX.md",
        "docs/architecture/OS-MATRIX-M45.md",
        "docs/planning/M45-claude-terminal-delivery.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/native-wanted.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-worker.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-files.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-protocol.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/remote-ingress.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/m45-parameter-host.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Хост параметров убирает за собой",
      "why": "Набранный /model и открытое меню хоста съедают сообщения панели и держат сообщения десктопа"
    },
    {
      "acceptance": [
        "sendDirect не вставляет текст при состоянии хоста не idle или непустом поле: сообщение идёт в очередь канала",
        "Маршрут POST /api/projects/:id/sessions/:sid/message после вставки ждёт хук UserPromptSubmit той же сессии с тем же текстом до 8 с: есть — { sent: true }, нет — { sent: false, undelivered: { reason } } и строка журнала службы; сессия не помечается working",
        "Тесты маршрута и direct.ts; HTTP-CONTRACTS.md и module.md обновлены"
      ],
      "checks": [],
      "commitMessage": "fix: confirm a panel message to Claude by its prompt hook",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M45-claude-terminal-delivery.md",
          "heading": "3. Решение",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "docs/architecture/HTTP-CONTRACTS.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OS-MATRIX-M45.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/direct-message.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/m45-direct-message.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/sessions.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/native-parameters.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-protocol.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/m45-direct.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/turn-control.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/turn-state.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/m45-direct-confirm.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Подтверждённая доставка сообщения панели",
      "why": "Сообщение панели считалось доставленным, даже когда ход не начался"
    },
    {
      "acceptance": [
        "Ответ undelivered: под полем ввода «Сообщение не дошло до Claude: <причина>», текст остаётся в поле, кнопка «Повторить»",
        "Карточка «Подтвердить выпуск» в проекте decisions host видна, когда следующая задача плана — поставка в TODO без живого разрешения запуска, при любом состоянии автопилота сессии",
        "Тесты моделей и браузерная проверка карточек в тёмной и светлой теме на 1280 и 390 px; module.md обновлены (design-qa.md у лимита размера — проверка описана в module.md и evidence)"
      ],
      "checks": [],
      "commitMessage": "feat: show an undelivered panel message and the delivery card without autopilot",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M45-claude-terminal-delivery.md",
          "heading": "3. Решение",
          "required": true
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "product-parts/control-panel/clusters/web-panel/modules/session-view",
        "design-qa.md",
        "docs/architecture/OS-MATRIX-M45.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/composer-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/plan-cards.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/m45-cards.browser.mjs",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/m45-delivery-card.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Панель: «не доставлено» и карточка поставки",
      "why": "Пользователь не видит потерянное сообщение и не может подтвердить поставку без автопилота"
    },
    {
      "acceptance": [
        "Сценарии: транзакция /model отменена сообщением панели — текст доходит, поле чисто; сообщение Remote Control во время чтения каталога — меню закрыто сразу; вставка без хука — undelivered; карточка поставки без автопилота",
        "docs/evidence/M45-acceptance.md: причина, коммиты, проверки, живые проверки по ОС"
      ],
      "checks": [],
      "commitMessage": "test: verify M45 Claude terminal delivery end to end",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M45-claude-terminal-delivery.md",
          "heading": "5. Проверка",
          "required": true
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test",
        "product-parts/backend-core/clusters/runtime/modules/cli/test",
        "docs/evidence/M45-acceptance.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/m45-undelivered-e2e.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/m45-scenarios.test.ts"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Сквозные сценарии и доказательства",
      "why": "Сценарии 19.11 воспроизводятся тестами до выпуска"
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
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M45-claude-terminal-delivery.md",
        "docs/architecture/OS-MATRIX.md",
        "docs/architecture/OS-MATRIX-M45.md",
        "docs/architecture/HTTP-CONTRACTS.md",
        "design-qa.md",
        "docs/evidence/M45-acceptance.md"
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
        "Версия 0.20.1 установлена через node bin/wfk.mjs install, doctor --installed — всё в порядке, результат в evidence; CHANGELOG и README называют 0.20.1"
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: release Workflow Kit 0.20.1",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M45-claude-terminal-delivery.md",
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
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "README.md",
        "docs/evidence/M45-acceptance.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Поставка 0.20.1",
      "why": "Пользователь получает надёжную доставку сообщений"
    },
    {
      "acceptance": [
        "CI на ci/M45-claude-terminal-delivery успешен для точного SHA на macOS ARM64, Linux x64, Windows x64 и Windows ARM64; ссылка в evidence"
      ],
      "checks": [],
      "commitMessage": "test: verify M45 on four CI platforms",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M45-claude-terminal-delivery.md",
          "heading": "5. Проверка",
          "required": true
        }
      ],
      "dependencies": [
        "T005",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M45-acceptance.md"
      ],
      "fixes": null,
      "id": "T006",
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

- Scope: M45-claude-terminal-delivery (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Automation: 4 automatic, 1 manual criteria; CI origin ci/M45-claude-terminal-delivery (4 checks); publication main → origin/main
- Current task: none
- Progress: 5/7
- Revision: 1367

## Objective

Сообщение из панели доходит до Claude или явно помечено «не доставлено» с сохранённым текстом; смена параметров не оставляет в терминале меню или набранную команду и уступает сообщениям десктопа; режим не мигает, когда он уже стоит; карточка поставки видна и без автопилота сессии

## Acceptance

- Хост параметров после отмены закрывает своё меню и очищает набранную команду, уступает сообщению Remote Control (строка Ingress в логе Claude) и закрывает меню без шага через 10 с; неудачное чтение каталога не повторяется после рестарта хоста; действующее пожелание снимается; ветки win32 и linux покрыты тестами
- Сообщение панели не вставляется в занятый терминал или непустое поле (идёт в очередь); вставленное подтверждается хуком UserPromptSubmit с тем же текстом до 8 с, иначе маршрут отвечает undelivered с причиной
- Панель показывает «Сообщение не дошло до Claude» с причиной, сохраняет текст и даёт «Повторить»; карточка «Подтвердить выпуск» в проекте decisions host видна при выключенном автопилоте сессии
- Выпуск 0.20.1 установлен, CI четырёх платформ зелёный для точного SHA на ci/M45-claude-terminal-delivery; результаты в docs/evidence/M45-acceptance.md
- Живая проверка пользователя на Mac: после возобновления сессии из панели сообщения панели и десктопа доходят сразу, смена режима не мигает, поставка без автопилота сессии показывает карточку

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Хост параметров убирает за собой (work)
  - Commit: fix: clean up Claude parameter transactions and yield to remote messages
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, docs/architecture/OS-MATRIX.md, docs/architecture/OS-MATRIX-M45.md, docs/planning/M45-claude-terminal-delivery.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/native-wanted.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-worker.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-files.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-protocol.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/remote-ingress.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/m45-parameter-host.test.ts
- [DONE] T002 — Подтверждённая доставка сообщения панели (work)
  - Commit: fix: confirm a panel message to Claude by its prompt hook
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, product-parts/backend-core/clusters/runtime/modules/cli, docs/architecture/HTTP-CONTRACTS.md, docs/architecture/CONTRACTS.md, docs/architecture/OS-MATRIX-M45.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/direct-message.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/m45-direct-message.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/sessions.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/native-parameters.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-protocol.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/m45-direct.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/turn-control.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/turn-state.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/m45-direct-confirm.test.ts
  - Depends on: T001
- [DONE] T003 — Панель: «не доставлено» и карточка поставки (work)
  - Commit: feat: show an undelivered panel message and the delivery card without autopilot
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat, product-parts/control-panel/clusters/web-panel/modules/session-view, design-qa.md, docs/architecture/OS-MATRIX-M45.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer-model.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/composer-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/src/plan-cards.js, product-parts/control-panel/clusters/web-panel/modules/session-view/test/m45-cards.browser.mjs, product-parts/control-panel/clusters/web-panel/modules/session-view/test/m45-delivery-card.test.ts
  - Depends on: T002
- [DONE] T004 — Сквозные сценарии и доказательства (work)
  - Commit: test: verify M45 Claude terminal delivery end to end
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test, product-parts/backend-core/clusters/runtime/modules/cli/test, docs/evidence/M45-acceptance.md, product-parts/backend-core/clusters/runtime/modules/cli/test/m45-undelivered-e2e.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/m45-scenarios.test.ts
  - Depends on: T003
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M45-claude-terminal-delivery.md, docs/architecture/OS-MATRIX.md, docs/architecture/OS-MATRIX-M45.md, docs/architecture/HTTP-CONTRACTS.md, design-qa.md, docs/evidence/M45-acceptance.md
  - Depends on: T001, T002, T003, T004
- [TODO] T005 — Поставка 0.20.1 (delivery)
  - Commit: chore: release Workflow Kit 0.20.1
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/evidence/M45-acceptance.md
  - Depends on: T004, DOCS-R1
- [TODO] T006 — CI четырёх платформ (delivery)
  - Commit: test: verify M45 on four CI platforms
  - Files: docs/evidence/M45-acceptance.md
  - Depends on: T005, DOCS-R1

Digest: Panel messages to Claude are no longer lost: the parameter host yields to Remote Control messages (Ingress line of Claude's debug log), closes its idle /model menu after 10 s, keeps a failed catalog discovery per CLI version and settles a wanted value Claude already has; sendDirect pastes only into a free terminal and the route confirms the paste by its UserPromptSubmit hook within 8 s, else undelivered; the panel shows «Сообщение не дошло до Claude» with «Повторить» and the delivery card without the session autopilot.

State changes only through `scripts/workflow` commands. History lives in Git.
