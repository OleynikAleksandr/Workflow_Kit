# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "autopilotRun": "run-2dURYOtIflz8",
    "closedAt": "2026-11-19T16:58:16.490Z",
    "finalCommit": "672428d51bbb7d539143a837632197239f6d134b",
    "scopeId": "M46-claude-2-1-328-menu",
    "decision": {
      "at": "2026-11-19T16:58:16.496Z",
      "kind": "close",
      "source": {
        "authorization": "2b8e7a173bbeafa7980373133c72081106db15902a9edcd4c0691e189c1f8b27",
        "kind": "grant",
        "runId": "run-2dURYOtIflz8"
      },
      "text": "Automatic close by the advance instruction of run run-2dURYOtIflz8"
    }
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 1401,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "agent-channel Reservation.direct; ownPrompt -> 'own' | 'order' | 'late' | null; log 'confirmed the pasted message by order'",
          "provider-claude unwrapPasted (chat.ts); hostBuild, HOST_OUTSIDE_PTY (pty/host-build.ts); NativeParameterState.hostBuild; HOST_OUTDATED (parameter-controls.ts)",
          "pty-host PTY_HOST_SRC, listSources, sourceDigest"
        ],
        "decisions": [
          "A direct paste is confirmed by the first prompt hook of the session while it is sent and confirmed (slot.sending), not by equal text; a differing text is logged by lengths only",
          "The pasted_content wrapper is removed by the provider-claude transcript reader (unwrapPasted), the channel does not know it",
          "An outdated host is told by the build label (digest of the host sources), not the Kit version: a release without host changes marks no session",
          "No automatic restart of outdated sessions: the panel names the reason and the user's action"
        ],
        "references": [
          "docs/planning/M47-paste-confirm-host-build.md",
          "docs/evidence/M47-acceptance.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md",
          "docs/architecture/HTTP-CONTRACTS.md",
          "docs/architecture/OS-MATRIX-M47.md"
        ],
        "result": "A panel message Claude began a turn with is shown sent whatever text its UserPromptSubmit hook carries (Claude 2.1.328 wraps a paste of more than 6 lines in <pasted_content id>); the conversation shows it without the wrapper; a session whose terminal host runs an older build of Kit says its model and effort control is outdated and how to get it back."
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
      "Прямая отправка: первый хук UserPromptSubmit сессии в окне подтверждения даёт { sent: true } и при тексте хука в обёртке pasted_content (запись живого Claude 2.1.328), расхождение текста пишется в журнал; без хука — undelivered, как раньше; резервирования доставки сравнивают текст, как были",
      "Лента диалога показывает сообщение пользователя из транскрипта без пары меток pasted_content; текст без пары не меняется",
      "Хост пишет метку сборки в состояние; при другой метке или без неё параметры сессии не редактируются и названа причина HOST_OUTDATED, при той же метке — как раньше; хост ConPTY покрыт тестом",
      "Выпуск 0.20.3 установлен, CI четырёх платформ зелёный для точного SHA на ci/M47-paste-confirm-host-build; результаты в docs/evidence/M47-acceptance.md",
      "Живая проверка пользователя на Mac с Claude 2.1.328: многострочное сообщение из панели — поле очищено, ошибки нет, в ленте один раз и без обёртки; сессия, запущенная до 0.20.3, показывает причину, после остановки и возобновления модель и уровень меняются"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-19T17:38:51.329Z",
      "text": "Пользователь 19.11.2026 после теста 0.20.2 в проекте S02: «агент получил мое сообщение, при этом оно осталось как будто бы не отправленным в поле ввода пользователя, и высветилась все равно ошибка. Проверь.»; затем: «Давай делать два плана по очереди. Сначала первый проверяем, смотрим на результат.» и «сессия диалог Workflow Kit потеряла полностью контакт и контроль за моделью»; в панели выбраны спецификация и план без ревью | Execution mode chosen by the user: sequential: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
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
            "docs/evidence/M47-acceptance.md"
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
            "docs/evidence/M47-acceptance.md"
          ]
        },
        {
          "criterion": 2,
          "kind": "automatic",
          "checks": [
            "typecheck",
            "test",
            "platform-guard"
          ],
          "evidence": [
            "docs/evidence/M47-acceptance.md"
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
            "docs/evidence/M47-acceptance.md"
          ]
        },
        {
          "criterion": 4,
          "kind": "manual",
          "checks": [],
          "evidence": [
            "docs/evidence/M47-acceptance.md"
          ]
        }
      ],
      "ci": {
        "remote": "origin",
        "branch": "ci/M47-paste-confirm-host-build",
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
            "node bin/wfk.mjs install: установка Workflow Kit 0.20.3 в Application Support и перезапуск службы"
          ]
        },
        {
          "taskId": "T005",
          "effects": [
            "push ci/M47-paste-confirm-host-build в origin и ожидание CI четырёх платформ"
          ]
        }
      ],
      "publication": {
        "branch": "main",
        "upstream": "origin/main"
      }
    },
    "baselineCommit": "68ad3c0c84b750c5dd4077541416f950cef9c47f",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M47-paste-confirm-host-build.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-19T17:38:51.329Z",
        "text": "Прямую отправку подтверждает первый хук UserPromptSubmit сессии в окне подтверждения, а не равенство текста; расхождение текста пишется в журнал"
      },
      {
        "at": "2026-11-19T17:38:51.329Z",
        "text": "Обёртку pasted_content убирает чтение транскрипта provider-claude; канал о ней не знает"
      },
      {
        "at": "2026-11-19T17:38:51.329Z",
        "text": "Устаревший хост определяется меткой сборки (дайджест исходников хоста), а не версией Kit: выпуск без изменений хоста сессии не помечает"
      },
      {
        "at": "2026-11-19T17:38:51.329Z",
        "text": "Автоматического перезапуска устаревших сессий нет: панель называет причину и действие пользователя"
      },
      {
        "at": "2026-11-19T17:38:51.319Z",
        "decisionId": "dec-6207fa5b44f1",
        "kind": "choose",
        "source": {
          "kind": "button",
          "messageId": null,
          "runId": null,
          "session": "ffc970ed-20a1-499c-9d2c-47dff30c41a0"
        },
        "text": "choose: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": "ffc970ed-20a1-499c-9d2c-47dff30c41a0",
      "strategy": "sequential"
    },
    "id": "M47-paste-confirm-host-build",
    "objective": "Сообщение панели, с которым Claude начал ход, показано отправленным при любом виде текста в хуке; лента показывает его без обёртки pasted_content; сессия с хостом прежней сборки Kit называет причину и способ вернуть управление моделью и уровнем",
    "spec": "docs/planning/M47-paste-confirm-host-build.md",
    "status": "ACTIVE",
    "proposal": {
      "digest": "bc63e5e567e4771e62804d2db8a42b1312b83aa9601b540fd3ba8cad02b893d3",
      "generation": 1
    }
  },
  "tasks": [
    {
      "acceptance": [
        "Запись живого Claude 2.1.328 (ввод хука UserPromptSubmit для многострочной и однострочной вставки bracketed paste) сохранена как данные тестов; настройки пользователя не изменены",
        "directTurn: первый хук сессии в окне подтверждения забирает прямое резервирование при любом тексте, источник решения — текст сообщения панели; при расхождении — строка журнала без текстов; нет хука — unconfirmed; резервирования доставки сравнивают текст",
        "Тест настоящей службы: хук с записанным текстом — { sent: true }; module.md модулей и HTTP-CONTRACTS.md обновлены"
      ],
      "checks": [],
      "commitMessage": "fix: confirm a pasted panel message by its prompt hook, not by equal text",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M47-paste-confirm-host-build.md",
          "heading": "3. Решение",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "docs/architecture/HTTP-CONTRACTS.md",
        "docs/evidence/M47-acceptance.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/m47-paste-order-e2e.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/turn-control.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/turn-state.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/m47-paste-order.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Подтверждение прямой отправки по порядку хука",
      "why": "Claude 2.1.328 оборачивает вставленный текст, равенства с хуком нет: доставленное сообщение панель показывала как «не дошло» и предлагала повтор"
    },
    {
      "acceptance": [
        "chat.ts убирает пару меток pasted_content с одним id из текста пользователя на записанной строке транскрипта Claude 2.1.328; текст без пары и непарные метки не меняются",
        "chat.md и module.md обновлены"
      ],
      "checks": [],
      "commitMessage": "fix: show a pasted user message without the pasted_content wrapper",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M47-paste-confirm-host-build.md",
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
        "docs/evidence/M47-acceptance.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/trust.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Лента без обёртки pasted_content",
      "why": "Сообщение панели в ленте показано со служебными метками Claude и не совпадает с отправленным текстом"
    },
    {
      "acceptance": [
        "src/chat.ts (unwrapPasted), test/m47-pasted-content.test.ts, chat.md, sessions.md, module.md provider-claude и evidence T002 закоммичены; тесты проходят"
      ],
      "checks": [],
      "commitMessage": "fix: show a pasted user message without the pasted_content wrapper (commit the T002 work)",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M47-paste-confirm-host-build.md",
          "heading": "3. Решение",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/chat.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/m47-pasted-content.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/sessions.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "docs/evidence/M47-acceptance.md"
      ],
      "fixes": "T002",
      "id": "F001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Код T002 в git",
      "why": "Коммит T002 взял только trust.md: пути --files были переданы через пробел, а не через запятую; код и тест снятия обёртки остались вне git"
    },
    {
      "acceptance": [
        "pty-host считает дайджест исходников хоста (LF, относительные пути с /); хост macOS/Linux и хост ConPTY пишут hostBuild в состояние; тест-сторож списка файлов метки",
        "Состояние с другой меткой или без неё: editable false и причина HOST_OUTDATED; с той же меткой — как раньше; сообщения и прерывание не затронуты",
        "module.md обоих модулей, native-parameters.md, OS-MATRIX.md и OS-MATRIX-M47.md обновлены; docs/evidence/M47-acceptance.md: причины, записи живого Claude, коммиты, проверки, живые проверки по ОС"
      ],
      "checks": [],
      "commitMessage": "feat: mark sessions whose terminal host predates the installed build",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M47-paste-confirm-host-build.md",
          "heading": "3. Решение",
          "required": true
        }
      ],
      "dependencies": [
        "T002",
        "F001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "docs/architecture/OS-MATRIX.md",
        "docs/architecture/OS-MATRIX-M47.md",
        "docs/evidence/M47-acceptance.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameter-controls.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host-build.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-worker.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-files.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-protocol.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/m47-host-build.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-controls.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/source-digest.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/test/source-digest.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Метка сборки хоста и причина устаревшей сессии",
      "why": "Хост живой сессии остаётся от версии Kit, которая её запустила: после обновления панель вечно ждёт каталог моделей и не объясняет почему"
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
        "F001",
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M47-paste-confirm-host-build.md",
        "docs/architecture/HTTP-CONTRACTS.md",
        "docs/evidence/M47-acceptance.md",
        "docs/architecture/OS-MATRIX.md",
        "docs/architecture/OS-MATRIX-M47.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/trust.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/sessions.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md"
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
        "Версия 0.20.3 установлена через node bin/wfk.mjs install, doctor --installed — всё в порядке, результат в evidence; CHANGELOG и README называют 0.20.3"
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: release Workflow Kit 0.20.3",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M47-paste-confirm-host-build.md",
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
        "docs/evidence/M47-acceptance.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Поставка 0.20.3",
      "why": "Пользователь получает исправление ложного «не дошло» и понятную причину у устаревших сессий"
    },
    {
      "acceptance": [
        "CI на ci/M47-paste-confirm-host-build успешен для точного SHA на macOS ARM64, Linux x64, Windows x64 и Windows ARM64; ссылка в evidence"
      ],
      "checks": [],
      "commitMessage": "test: verify M47 on four CI platforms",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M47-paste-confirm-host-build.md",
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
        "docs/evidence/M47-acceptance.md"
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

- Scope: M47-paste-confirm-host-build (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Automation: 4 automatic, 1 manual criteria; CI origin ci/M47-paste-confirm-host-build (4 checks); publication main → origin/main
- Current task: none
- Progress: 5/7
- Revision: 1401

## Objective

Сообщение панели, с которым Claude начал ход, показано отправленным при любом виде текста в хуке; лента показывает его без обёртки pasted_content; сессия с хостом прежней сборки Kit называет причину и способ вернуть управление моделью и уровнем

## Acceptance

- Прямая отправка: первый хук UserPromptSubmit сессии в окне подтверждения даёт { sent: true } и при тексте хука в обёртке pasted_content (запись живого Claude 2.1.328), расхождение текста пишется в журнал; без хука — undelivered, как раньше; резервирования доставки сравнивают текст, как были
- Лента диалога показывает сообщение пользователя из транскрипта без пары меток pasted_content; текст без пары не меняется
- Хост пишет метку сборки в состояние; при другой метке или без неё параметры сессии не редактируются и названа причина HOST_OUTDATED, при той же метке — как раньше; хост ConPTY покрыт тестом
- Выпуск 0.20.3 установлен, CI четырёх платформ зелёный для точного SHA на ci/M47-paste-confirm-host-build; результаты в docs/evidence/M47-acceptance.md
- Живая проверка пользователя на Mac с Claude 2.1.328: многострочное сообщение из панели — поле очищено, ошибки нет, в ленте один раз и без обёртки; сессия, запущенная до 0.20.3, показывает причину, после остановки и возобновления модель и уровень меняются

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Подтверждение прямой отправки по порядку хука (work)
  - Commit: fix: confirm a pasted panel message by its prompt hook, not by equal text
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, product-parts/backend-core/clusters/runtime/modules/cli, docs/architecture/HTTP-CONTRACTS.md, docs/evidence/M47-acceptance.md, product-parts/backend-core/clusters/runtime/modules/cli/test/m47-paste-order-e2e.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/turn-control.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/turn-state.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/m47-paste-order.test.ts
- [DONE] T002 — Лента без обёртки pasted_content (work)
  - Commit: fix: show a pasted user message without the pasted_content wrapper
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, docs/evidence/M47-acceptance.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/trust.md
  - Depends on: T001
- [DONE] F001 — Код T002 в git (work)
  - Commit: fix: show a pasted user message without the pasted_content wrapper (commit the T002 work)
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/chat.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/m47-pasted-content.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/sessions.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, docs/evidence/M47-acceptance.md
  - Fixes: T002
- [DONE] T003 — Метка сборки хоста и причина устаревшей сессии (work)
  - Commit: feat: mark sessions whose terminal host predates the installed build
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/pty-host, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, docs/architecture/OS-MATRIX.md, docs/architecture/OS-MATRIX-M47.md, docs/evidence/M47-acceptance.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameter-controls.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host-build.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-worker.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-files.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-protocol.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/m47-host-build.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-controls.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/source-digest.ts, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/test/source-digest.test.ts
  - Depends on: T002, F001
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M47-paste-confirm-host-build.md, docs/architecture/HTTP-CONTRACTS.md, docs/evidence/M47-acceptance.md, docs/architecture/OS-MATRIX.md, docs/architecture/OS-MATRIX-M47.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/trust.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/sessions.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md
  - Depends on: T001, T002, F001, T003
- [TODO] T004 — Поставка 0.20.3 (delivery)
  - Commit: chore: release Workflow Kit 0.20.3
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/evidence/M47-acceptance.md
  - Depends on: T003, DOCS-R1
- [TODO] T005 — CI четырёх платформ (delivery)
  - Commit: test: verify M47 on four CI platforms
  - Files: docs/evidence/M47-acceptance.md
  - Depends on: T004, DOCS-R1

Digest: A panel message Claude began a turn with is shown sent whatever text its UserPromptSubmit hook carries (Claude 2.1.328 wraps a paste of more than 6 lines in <pasted_content id>); the conversation shows it without the wrapper; a session whose terminal host runs an older build of Kit says its model and effort control is outdated and how to get it back.

State changes only through `scripts/workflow` commands. History lives in Git.
