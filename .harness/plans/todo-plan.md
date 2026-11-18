# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-17T18:40:08.766Z",
    "scopeId": "M41-autopilot-acceptance",
    "decision": {
      "at": "2026-11-17T18:40:08.733Z",
      "decisionId": "dec-bd4193251658",
      "kind": "close",
      "source": {
        "kind": "button",
        "messageId": null,
        "runId": null,
        "session": "25cedd72-7908-49d9-9f21-79cfca178443"
      },
      "text": "close: Пользователь закрыл план в панели Workflow Kit"
    }
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 1313,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "provider-codex: createReclaim, reclaimAction, appOwnerNote(platform, remoteOwner), RECLAIM_ACTION reclaim-remote, CodexDeps.reclaim (ReclaimSystem)",
          "Статус провайдера: label «возвращает управление Kit» с RECLAIM_REASON; APP_OWNER_NOTE вместо SHARED_APP_OWNER_REASON; HANDOVER_REASON и codex-handover удалены"
        ],
        "decisions": [
          "Владелец удалённого управления — демон Kit в обоих режимах; передача M7 приложению удалена",
          "Выход ChatGPT: osascript quit, при отказе Apple Events — SIGTERM главному процессу; никогда KILL",
          "Не больше 3 автоматических попыток за час; после app-kept — до нового pid, после not-connected — до подключённого демона",
          "open не внесён в programNames platform-guard: ложные совпадения с обычными строками"
        ],
        "references": [
          "docs/planning/M43-codex-remote-owner.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/reclaim.md",
          "docs/evidence/M43-acceptance.md"
        ],
        "result": "Удалённое управление ChatGPT у демона Kit: reclaim.ts вместо передачи M7; на macOS при remoteOwner app Kit закрывает ChatGPT штатно, толкает демон, ждёт connected и открывает ChatGPT снова — после создания сессии и раз в минуту; действие «Вернуть управление Kit»; Windows — подсказка, Linux — ничего. Документы и руководства обновлены."
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
      "macOS: при remoteOwner app Kit сам закрывает и снова открывает ChatGPT, толкает демон и ждёт connected — после создания сессии и в минутной самопроверке; лимит попыток, app-kept и not-connected обработаны; передачи M7 нет; тесты reclaim и provider",
      "Ветки win32 и linux покрыты тестами с подставленной платформой; OS-MATRIX, module.md, reclaim.md, shared-access.md и allowlist обновлены",
      "Выпуск 0.19.0 установлен, CI четырёх платформ зелёный для точного SHA на ci/M43-codex-remote-owner; результаты в docs/evidence/M43-acceptance.md",
      "Живая проверка пользователя на Mac и iPad: ChatGPT держал управление, после создания сессии ChatGPT перезапустился, статус «демон подключён», чат Kit открывается и пишется на iPad"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-18T07:18:37.417Z",
      "text": "Пользователь 18.11.2026: «нужно эту проблему решить каким-то административным путем, чтобы при создании сессии новой проверялось, кто держит демон. Если его держит ChatGPT десктоп, то гасить его принудительно. В общем, разберись, как сделать так, чтобы всегда сессия принадлежала Workflow Kit, а не какому-то из ChatGPT, десктоп, мобайл» | Execution mode chosen by the user: sequential: Автоматический выбор по поручению run-khg6_dmzVg8_: sequential (recommended by the plan; ревью: skipped-by-setting)"
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
            "docs/evidence/M43-acceptance.md"
          ]
        },
        {
          "criterion": 1,
          "kind": "automatic",
          "checks": [
            "typecheck",
            "test",
            "platform-guard",
            "kit:doc-size",
            "kit:md-links"
          ],
          "evidence": [
            "docs/evidence/M43-acceptance.md"
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
            "docs/evidence/M43-acceptance.md"
          ]
        },
        {
          "criterion": 3,
          "kind": "manual",
          "checks": [],
          "evidence": [
            "docs/evidence/M43-acceptance.md"
          ]
        }
      ],
      "ci": {
        "remote": "origin",
        "branch": "ci/M43-codex-remote-owner",
        "requiredChecks": [
          "macOS ARM64",
          "Linux x64",
          "Windows x64",
          "Windows ARM64"
        ],
        "exactSha": true,
        "task": "T003"
      },
      "delivery": [
        {
          "taskId": "T002",
          "effects": [
            "npm ci",
            "node bin/wfk.mjs install: установка Workflow Kit 0.19.0 в Application Support и перезапуск службы"
          ]
        },
        {
          "taskId": "T003",
          "effects": [
            "push ci/M43-codex-remote-owner в origin и ожидание CI четырёх платформ"
          ]
        }
      ],
      "publication": {
        "branch": "main",
        "upstream": "origin/main"
      }
    },
    "baselineCommit": "9901dbb6aabf839ef6c4bdc84bacdbce479c3a12",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M43-codex-remote-owner.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-18T07:18:37.417Z",
        "text": "Владелец удалённого управления — демон Kit в обоих режимах; передача M7 приложению удаляется"
      },
      {
        "at": "2026-11-18T07:18:37.417Z",
        "text": "Возврат — штатный выход ChatGPT (osascript quit) и новый запуск в фоне (open -g -b), без KILL; демон не останавливается"
      },
      {
        "at": "2026-11-18T07:18:37.417Z",
        "text": "Не больше 3 автоматических попыток за 60 минут; ручное действие «Вернуть управление Kit» с подтверждением"
      },
      {
        "at": "2026-11-18T07:18:37.417Z",
        "text": "Windows и Linux: автоматического возврата нет (Windows — подсказка закрыть вручную, Linux — приложения нет)"
      },
      {
        "at": "2026-11-18T07:18:37.408Z",
        "decisionId": "dec-74b2e443c46a",
        "kind": "choose",
        "source": {
          "kind": "grant",
          "messageId": null,
          "runId": "run-khg6_dmzVg8_",
          "session": null,
          "authorization": null
        },
        "text": "choose: Автоматический выбор по поручению run-khg6_dmzVg8_: sequential (recommended by the plan; ревью: skipped-by-setting)"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "ffc970ed-20a1-499c-9d2c-47dff30c41a0",
      "strategy": "sequential"
    },
    "id": "M43-codex-remote-owner",
    "objective": "Удалённое управление ChatGPT на этом компьютере всегда у демона Kit: Kit сам возвращает его при создании сессии и в самопроверке, чаты Kit открываются на телефоне и iPad",
    "spec": "docs/planning/M43-codex-remote-owner.md",
    "status": "ACTIVE",
    "proposal": {
      "digest": "ad4b0139ae3a2bcb0af9ebf8337eecef1adb216b74f266c8e88d535a471d4929",
      "generation": 1
    }
  },
  "tasks": [
    {
      "acceptance": [
        "src/reclaim.ts: createReclaim с active, lastResult, request и maintain; шаги osascript quit, ожидание выхода 30 с, codex remote-control start --json, ожидание connected 90 с, open -g -b com.openai.codex; результаты reclaimed, app-kept, not-connected, failed",
        "Защита: один возврат одновременно, не больше 3 автоматических попыток за 60 минут, после app-kept и not-connected — до нового pid приложения; ручное действие reclaim-remote сбрасывает лимит",
        "provider.ts: createSession при remoteOwner app вызывает request без ожидания; maintain зовёт reclaim; статус «возвращает управление Kit» с RECLAIM_REASON; APP_OWNER_NOTE в обоих режимах; HANDOVER_REASON и handover.ts удалены",
        "Тесты reclaim.test.ts и provider.test.ts: darwin — успех, app-kept, not-connected, лимит, сброс, без параллельного возврата, без приложения; win32 и linux с подставленной платформой — ни одной команды, нужные note и состояние действия",
        "Документы: reclaim.md вместо handover.md, module.md, shared-access.md, OS-MATRIX.md, allowlist (open), начало docs/evidence/M43-acceptance.md с командами и результатами тестов"
      ],
      "checks": [],
      "commitMessage": "feat: keep ChatGPT remote control with the Kit daemon",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M43-codex-remote-owner.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/reclaim.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/handover.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-mode.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-access.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/reclaim.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider-reclaim.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/handover.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-mode.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-sessions.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/handover.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/reclaim.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/shared-access.md",
        "docs/architecture/OS-MATRIX.md",
        "tools/platform-guard/allowlist.json",
        "docs/evidence/M43-acceptance.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Возврат удалённого управления демону Kit",
      "why": "Чат Kit не открывается на телефоне, когда слот удалённого управления держит встроенный сервер ChatGPT"
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
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M43-codex-remote-owner.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/handover.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/reclaim.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/shared-access.md",
        "docs/architecture/OS-MATRIX.md",
        "docs/evidence/M43-acceptance.md",
        "docs/setup.md",
        "docs/installation.md"
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
        "Версия 0.19.0 установлена через node bin/wfk.mjs install, doctor --installed — всё в порядке, результат в evidence; CHANGELOG и README называют 0.19.0"
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: release Workflow Kit 0.19.0",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M43-codex-remote-owner.md",
          "required": true,
          "heading": "5. Проверка"
        }
      ],
      "dependencies": [
        "T001",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "README.md",
        "docs/evidence/M43-acceptance.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Поставка 0.19.0",
      "why": "Пользователь получает автоматический возврат удалённого управления"
    },
    {
      "acceptance": [
        "CI на ci/M43-codex-remote-owner успешен для точного SHA на macOS ARM64, Linux x64, Windows x64 и Windows ARM64; ссылка на запуск в evidence"
      ],
      "checks": [],
      "commitMessage": "test: verify M43 on four CI platforms",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M43-codex-remote-owner.md",
          "required": true,
          "heading": "5. Проверка"
        }
      ],
      "dependencies": [
        "T002",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M43-acceptance.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "CI четырёх платформ",
      "why": "Изменение трогает процессы ОС: нужна зелёная CI macOS, Linux и Windows x64/ARM64"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: M43-codex-remote-owner (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Automation: 3 automatic, 1 manual criteria; CI origin ci/M43-codex-remote-owner (4 checks); publication main → origin/main
- Current task: none
- Progress: 2/4
- Revision: 1313

## Objective

Удалённое управление ChatGPT на этом компьютере всегда у демона Kit: Kit сам возвращает его при создании сессии и в самопроверке, чаты Kit открываются на телефоне и iPad

## Acceptance

- macOS: при remoteOwner app Kit сам закрывает и снова открывает ChatGPT, толкает демон и ждёт connected — после создания сессии и в минутной самопроверке; лимит попыток, app-kept и not-connected обработаны; передачи M7 нет; тесты reclaim и provider
- Ветки win32 и linux покрыты тестами с подставленной платформой; OS-MATRIX, module.md, reclaim.md, shared-access.md и allowlist обновлены
- Выпуск 0.19.0 установлен, CI четырёх платформ зелёный для точного SHA на ci/M43-codex-remote-owner; результаты в docs/evidence/M43-acceptance.md
- Живая проверка пользователя на Mac и iPad: ChatGPT держал управление, после создания сессии ChatGPT перезапустился, статус «демон подключён», чат Kit открывается и пишется на iPad

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Возврат удалённого управления демону Kit (work)
  - Commit: feat: keep ChatGPT remote control with the Kit daemon
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/reclaim.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/handover.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-mode.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-access.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/reclaim.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider-reclaim.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/handover.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-mode.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-sessions.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/handover.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/reclaim.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/shared-access.md, docs/architecture/OS-MATRIX.md, tools/platform-guard/allowlist.json, docs/evidence/M43-acceptance.md
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M43-codex-remote-owner.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/handover.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/reclaim.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/shared-access.md, docs/architecture/OS-MATRIX.md, docs/evidence/M43-acceptance.md, docs/setup.md, docs/installation.md
  - Depends on: T001
- [TODO] T002 — Поставка 0.19.0 (delivery)
  - Commit: chore: release Workflow Kit 0.19.0
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/evidence/M43-acceptance.md
  - Depends on: T001, DOCS-R1
- [TODO] T003 — CI четырёх платформ (delivery)
  - Commit: test: verify M43 on four CI platforms
  - Files: docs/evidence/M43-acceptance.md
  - Depends on: T002, DOCS-R1

Digest: Удалённое управление ChatGPT у демона Kit: reclaim.ts вместо передачи M7; на macOS при remoteOwner app Kit закрывает ChatGPT штатно, толкает демон, ждёт connected и открывает ChatGPT снова — после создания сессии и раз в минуту; действие «Вернуть управление Kit»; Windows — подсказка, Linux — ничего. Документы и руководства обновлены.

State changes only through `scripts/workflow` commands. History lives in Git.
