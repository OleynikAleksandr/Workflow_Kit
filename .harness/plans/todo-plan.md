# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-19T19:02:47.878Z",
    "scopeId": "M47-paste-confirm-host-build",
    "decision": {
      "at": "2026-11-19T19:02:47.846Z",
      "decisionId": "dec-96fead0718d6",
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
  "revision": 1433,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "autopilot session-settings: <project>/.workflow-kit/local/autopiloting/sessions/<client>.<id>.json; GET/POST /api/projects/:id/sessions/:sid/autopiloting -> { settings, stage, effect, reviewState }.",
          "autopilot kit-waits: plan, decision and run buttons answer 202 { pending, wait } on Kit LOCKED; state section kitWaits.",
          "autopilot run brief: local (completed without publication), grant { accept, close, publish }, returned; RunCompletion.local.",
          "session-view: sessionAutopilotView, autopilotPresses, kitWaitsView; panel-shell DEFAULTS_HINT and no publish button under a publishing run."
        ],
        "decisions": [
          "Settings only seed a session when it begins; a running session never changes when Settings change (no more pause or notice on Settings change).",
          "Switching a session off pauses its run (settings-off) and switching it on resumes the same run; a started plan without automation stays manual and the card says so.",
          "The session review is one value with the plan question answer; it changes until the mode is chosen, turning it off during a review cancels the review.",
          "A press refused with LOCKED is retried every 2 s for up to 15 minutes; the same decision pressed again joins the wait, so it is applied once.",
          "The panel hides a button only while the run goes on and its grant covers the step; paused, blocked or stopped runs give the buttons back."
        ],
        "references": [
          "docs/planning/M48-session-autopilot.md",
          "docs/evidence/M48-acceptance.md",
          "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/session-settings.md",
          "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/session-switch.md",
          "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/kit-waits.md",
          "product-parts/control-panel/clusters/web-panel/modules/session-view/session-autopilot.md",
          "docs/usage-autopiloting.md"
        ],
        "result": "Each session has its own autopilot mode and review, changed on its card at any stage; Settings are the defaults of new sessions. The panel hides the buttons a running autopilot presses itself. A plan without publication ends completed (local result) instead of no-upstream. A user press refused with Kit LOCKED waits and is applied once. Verified end to end on a real service with the real Kit."
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
      "Настройки сессии: при начале сессии — значения Settings, сессия-владелец активного запуска берёт его режим и ревью, все точки решения и ответ хука SessionStart читают настройки сессии; смена Settings не меняет уже начатые сессии",
      "Автопилот сессии включается и выключается на любом этапе по таблице 3.2 спецификации (вопрос о плане закрывается с инструкцией полного запуска, предложение без automation возвращается агенту, план без описания — честная строка), выключение — пауза запуска; ревью сессии меняется до карточки плана, идущее ревью отменяется",
      "План с publication: null завершается completed «результат остаётся локальным»; нажатие пользователя, на которое Kit ответил LOCKED, ждёт до 15 минут и применяется один раз",
      "Панель: карточка автопилота под сессией, текст Settings о значениях для новых сессий; при автопилоте сессии нет карточки выбора способа, «Начать выполнение плана» (полный), «Подтвердить выпуск», «Принять план» (кроме ручной приёмки), «Закрыть план», «Опубликовать»; у завершённого запуска — итог без кнопок управления",
      "Выпуск 0.21.0 установлен, CI четырёх платформ зелёный для точного SHA на ci/M48-session-autopilot; результаты в docs/evidence/M48-acceptance.md",
      "Живая проверка пользователя на Mac: новый проект с выключенными Settings — карточка сессии «Выкл», включение полного автопилота и ревью посреди подготовки плана, план без кнопок, которые нажимает автопилот, проект без удалённого репозитория завершается «результат локальный»"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-20T09:03:53.621Z",
      "text": "Пользователь 20.11.2026: «Настройки Settings считать дефолтными и их изменение применяется только если они были сделаны до начала формирования какой-либо сессии… изменение этих параметров для конкретной сессии… делать в карточке автопилота… самой сессии»; «Если план появился и при этом включен автопилот, то там не будет и никакой кнопки начать выполнение»; затем «Отлично, значит, мы сейчас одинаково понимаем, какие правки в коде нужно сделать. Согласен? И до кучи… ещё на один баг» (B001 no-upstream) | Execution mode chosen by the user: sequential: Автоматический выбор по поручению run-F5nJ3wbBuTxd: sequential (recommended by the plan; ревью: skipped-by-setting)"
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
            "docs/evidence/M48-acceptance.md"
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
            "docs/evidence/M48-acceptance.md"
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
            "docs/evidence/M48-acceptance.md"
          ]
        },
        {
          "criterion": 3,
          "kind": "automatic",
          "checks": [
            "typecheck",
            "test",
            "platform-guard"
          ],
          "evidence": [
            "docs/evidence/M48-acceptance.md"
          ]
        },
        {
          "criterion": 4,
          "kind": "automatic",
          "checks": [
            "typecheck",
            "test",
            "kit:doc-size",
            "kit:md-links"
          ],
          "evidence": [
            "docs/evidence/M48-acceptance.md"
          ]
        },
        {
          "criterion": 5,
          "kind": "manual",
          "checks": [],
          "evidence": [
            "docs/evidence/M48-acceptance.md"
          ]
        }
      ],
      "ci": {
        "remote": "origin",
        "branch": "ci/M48-session-autopilot",
        "requiredChecks": [
          "macOS ARM64",
          "Linux x64",
          "Windows x64",
          "Windows ARM64"
        ],
        "exactSha": true,
        "task": "T008"
      },
      "delivery": [
        {
          "taskId": "T007",
          "effects": [
            "npm ci",
            "node bin/wfk.mjs install: установка Workflow Kit 0.21.0 в Application Support и перезапуск службы"
          ]
        },
        {
          "taskId": "T008",
          "effects": [
            "push ci/M48-session-autopilot в origin и ожидание CI четырёх платформ"
          ]
        }
      ],
      "publication": {
        "branch": "main",
        "upstream": "origin/main"
      }
    },
    "baselineCommit": "0af2ea778ccff6c3312402a18ecb619a63ca7654",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M48-session-autopilot.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-20T09:03:53.621Z",
        "text": "Settings — значения по умолчанию: новая сессия берёт их в момент начала, дальше на неё не влияют"
      },
      {
        "at": "2026-11-20T09:03:53.621Z",
        "text": "Режим и ревью сессии меняются на её карточке на любом этапе; выключение — пауза запуска сессии"
      },
      {
        "at": "2026-11-20T09:03:53.621Z",
        "text": "Ревью сессии меняется, пока не появилась карточка плана; идущее ревью можно отменить"
      },
      {
        "at": "2026-11-20T09:03:53.621Z",
        "text": "При автопилоте сессии панель не показывает кнопки, которые нажимает автопилот; ручные появляются при выключении или остановке"
      },
      {
        "at": "2026-11-20T09:03:53.621Z",
        "text": "План без публикации (publication: null) — нормальное завершение completed"
      },
      {
        "at": "2026-11-20T09:03:53.621Z",
        "text": "Нажатие при занятом Kit (LOCKED) ждёт до 15 минут и применяется один раз"
      },
      {
        "at": "2026-11-20T09:03:53.621Z",
        "text": "Описание для автопилота в уже начатом плане не добавляется: такой план доводит пользователь"
      },
      {
        "at": "2026-11-20T09:03:53.612Z",
        "decisionId": "dec-ba39b3ce3f7c",
        "kind": "choose",
        "source": {
          "kind": "grant",
          "messageId": null,
          "runId": "run-F5nJ3wbBuTxd",
          "session": null,
          "authorization": null
        },
        "text": "choose: Автоматический выбор по поручению run-F5nJ3wbBuTxd: sequential (recommended by the plan; ревью: skipped-by-setting)"
      },
      {
        "at": "2026-11-20T10:19:26.935Z",
        "kind": "confirm-delivery",
        "source": {
          "authorization": "a2fa989a85ec014230e38de82e56e36cbc5c653d01711bef19e6031f74cae7fb",
          "kind": "grant",
          "runId": "run-F5nJ3wbBuTxd"
        },
        "text": "Delivery T007 started by the advance instruction of run run-F5nJ3wbBuTxd"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": "ffc970ed-20a1-499c-9d2c-47dff30c41a0",
      "strategy": "sequential"
    },
    "id": "M48-session-autopilot",
    "objective": "У каждой сессии своя карточка автопилота с режимом и ревью, Settings — значения по умолчанию для новых сессий; при автопилоте сессии панель не показывает кнопки, которые нажимает автопилот; план без публикации завершается без ошибки; нажатие при занятом Kit ждёт и применяется",
    "spec": "docs/planning/M48-session-autopilot.md",
    "status": "ACTIVE",
    "proposal": {
      "digest": "66a78c69d5413e469fd804a5b2b1767eb8b79c9113e0467e2cc1347e2f77fdf9",
      "generation": 1
    },
    "authorization": {
      "accept": false,
      "acceptancePolicy": "manual",
      "at": "2026-11-20T09:03:55.487Z",
      "ci": {
        "remote": "origin",
        "branch": "ci/M48-session-autopilot",
        "requiredChecks": [
          "macOS ARM64",
          "Linux x64",
          "Windows x64",
          "Windows ARM64"
        ],
        "exactSha": true,
        "task": "T008"
      },
      "close": true,
      "delivery": [
        {
          "taskId": "T007",
          "effects": [
            "npm ci",
            "node bin/wfk.mjs install: установка Workflow Kit 0.21.0 в Application Support и перезапуск службы"
          ]
        },
        {
          "taskId": "T008",
          "effects": [
            "push ci/M48-session-autopilot в origin и ожидание CI четырёх платформ"
          ]
        }
      ],
      "mode": "full",
      "note": "Full autopilot run run-F5nJ3wbBuTxd: the user's direct instruction «Отлично, значит, мы сейчас одинаково понимаем, какие правки в коде нужно сделать. Согласен? И до кучи в этом же контексте смотри еще на один баг, который я снял скриншотом. То есть в диалоге четко вид» (2026-11-20T08:59:06.082Z) to prepare and carry out the plan",
      "ownerSession": "ffc970ed-20a1-499c-9d2c-47dff30c41a0",
      "proposalDigest": "66a78c69d5413e469fd804a5b2b1767eb8b79c9113e0467e2cc1347e2f77fdf9",
      "publication": {
        "branch": "main",
        "upstream": "origin/main"
      },
      "revision": 1,
      "revoked": null,
      "runId": "run-F5nJ3wbBuTxd",
      "source": "user-command"
    }
  },
  "tasks": [
    {
      "acceptance": [
        "Файл настроек сессии (имя без «:»), значения Settings при создании сессии панелью и при первом SessionStart, переход: владелец активного запуска берёт его режим и ревью; тест имени с win32",
        "authorizePreparation, planDecision, beginExecution и ответ хука SessionStart читают настройки сессии; смена Settings не ставит запуски на паузу и не шлёт «settings changed»",
        "Маршруты GET/POST /api/projects/:id/sessions/:sid/autopiloting (expectedRevision, settings-stale) и раздел autopiloting.sessions; module.md, HTTP-CONTRACTS.md, OS-MATRIX.md и OS-MATRIX-M48.md обновлены"
      ],
      "checks": [],
      "commitMessage": "feat: keep autopilot mode and review per session, Settings as defaults",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M48-session-autopilot.md",
          "heading": "3. Решение",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles",
        "docs/architecture/HTTP-CONTRACTS.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OS-MATRIX.md",
        "docs/architecture/OS-MATRIX-M48.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/autopilot-line.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/autopiloting.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/m44-agent-state.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/grant.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/session-settings.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/agent-notices.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs-routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/session-pause.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/session-settings.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/settings.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/agent-notices.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m48-session-settings.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/runs-real.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/runs.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Настройки автопилота сессии",
      "why": "Settings читались в момент решения: смена посреди задания давала разное поведение в зависимости от этапа"
    },
    {
      "acceptance": [
        "Полный автопилот сессии по таблице 3.2: открытый вопрос о плане закрывается и агент получает инструкцию полного запуска; во время подготовки — та же инструкция сообщением; предложение без automation возвращается агенту; план с automation продолжает запуск; без — effect «доводите вы»",
        "Ответ на карточку вопроса о плане при полном автопилоте сессии приходит агенту с инструкцией полного запуска; выключение — пауза, повторное включение — продолжение того же запуска; запуск записан нажатием (source session-card)",
        "Тесты каждого этапа; module.md модулей и HTTP-CONTRACTS.md обновлены"
      ],
      "checks": [],
      "commitMessage": "feat: switch the autopilot of a session at any stage of its task",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M48-session-autopilot.md",
          "heading": "3. Решение",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "docs/architecture/HTTP-CONTRACTS.md",
        "docs/architecture/OS-MATRIX-M48.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/session-settings.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/session-switch.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-journal.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-texts.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs-routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/session-settings.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/session-switch.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m48-session-switch-real.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m48-session-switch.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/run-end.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Включение и выключение автопилота сессии на любом этапе",
      "why": "Автопилот можно было только остановить; включённый посреди задания он молча не применялся"
    },
    {
      "acceptance": [
        "Ревью сессии и ответ «С ревью / Без ревью» — одно значение; меняется, пока способ выполнения не выбран; включение при непроверенном предложении запускает ревью; во время ревью — отмена; затем review-closed",
        "Тесты; module.md plan-review, cross-review и autopilot обновлены"
      ],
      "checks": [],
      "commitMessage": "feat: switch the review of a session until its plan card appears",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M48-session-autopilot.md",
          "heading": "3. Решение",
          "required": true
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "docs/architecture/OS-MATRIX-M48.md",
        "docs/architecture/HTTP-CONTRACTS.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-review.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/m48-session-review.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/session-switch.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs-routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/session-settings.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/session-switch.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/settings.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m48-session-settings.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m48-session-switch.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Ревью сессии до карточки плана",
      "why": "Ревью из Settings после ответа на вопрос о плане не применялось, а отменить идущее было нельзя с карточки"
    },
    {
      "acceptance": [
        "publication: null — completed, published null, строка «Результат остаётся локальным: публикация в плане не предусмотрена»; no-upstream — только для плана с публикацией",
        "Решение пользователя с ответом Kit LOCKED повторяется каждые 2 с до 15 мин, состояние ожидания видно панели, повтор того же решения не применяет его дважды; по истечении — причина и «Повторить»",
        "Тесты; module.md autopilot, run-end.md и HTTP-CONTRACTS.md обновлены"
      ],
      "checks": [],
      "commitMessage": "fix: complete a local-only run and wait out a busy Kit for user decisions",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M48-session-autopilot.md",
          "heading": "3. Решение",
          "required": true
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "docs/architecture/HTTP-CONTRACTS.md",
        "docs/architecture/OS-MATRIX-M48.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting-completion.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/kit-waits.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/run-end.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/agent-notices.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/decision-commands.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/kit-waits.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-brief.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-complete.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-journal.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs-routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/complete.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m48-kit-waits.test.ts"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Конец запуска без публикации и нажатия при занятом Kit",
      "why": "B001: план без публикации блокировался no-upstream; нажатие «Подтвердить выпуск» во время команды агента пропадало (LOCKED)"
    },
    {
      "acceptance": [
        "Карточка автопилота под основной сессией: режим, ревью пока меняется, строка effect, состояние запуска; Settings — текст о значениях для новых сессий",
        "При автопилоте сессии скрыты карточка выбора способа (строка состояния), «Начать выполнение плана» (полный), «Подтвердить выпуск», «Принять план» (кроме ручной приёмки), «Закрыть план», «Опубликовать»; без автопилота, на паузе и после остановки — как раньше",
        "Завершённый запуск — итог без «Пауза», «Остановить», «Продолжить»; тесты моделей; module.md session-view и panel-shell, usage-autopiloting.md обновлены"
      ],
      "checks": [],
      "commitMessage": "feat: show the session autopilot card and hide the buttons the autopilot presses",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M48-session-autopilot.md",
          "heading": "3.5. Панель (`session-view`, `panel-shell`)",
          "required": true
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-view",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "docs/usage-autopiloting.md",
        "docs/architecture/OS-MATRIX-M48.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "docs/architecture/HTTP-CONTRACTS.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/autopiloting-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/autopiloting-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/publication.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/autopiloting.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/session-autopilot.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/plan-cards.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/run-card.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/run-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/run-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-autopilot-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-autopilot-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/sidebar-view.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/m48-session-autopilot.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/m48-session-card.browser.mjs",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/session-settings.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-brief.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs-routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/complete.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m48-session-settings.test.ts"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Панель: карточка сессии и ручные кнопки только без автопилота",
      "why": "Панель показывала ручные кнопки, которые затем нажимал автопилот, и «Остановить автопилот» у законченного запуска"
    },
    {
      "acceptance": [
        "Настоящая служба: A001 (предложение без automation — без ручной карточки), B001 (publication null — completed), включение полного автопилота при открытом вопросе о плане, «Подтвердить выпуск» при LOCKED",
        "docs/evidence/M48-acceptance.md: причины, коммиты, проверки, живые проверки по ОС"
      ],
      "checks": [],
      "commitMessage": "test: verify M48 end to end",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M48-session-autopilot.md",
          "heading": "5. Проверка",
          "required": true
        }
      ],
      "dependencies": [
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/runtime/modules/cli/test",
        "docs/evidence/M48-acceptance.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/m48-session-autopilot-e2e.test.ts"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Сквозные сценарии и доказательства",
      "why": "Случаи A001, B001 и M47 воспроизводятся на настоящей службе до выпуска"
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
        "T006"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M48-session-autopilot.md",
        "docs/architecture/HTTP-CONTRACTS.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OS-MATRIX.md",
        "docs/architecture/OS-MATRIX-M48.md",
        "docs/usage-autopiloting.md",
        "docs/evidence/M48-acceptance.md"
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
        "Версия 0.21.0 установлена через node bin/wfk.mjs install, doctor --installed — всё в порядке, живой прогон агента на установленной службе, результат в evidence; CHANGELOG и README называют 0.21.0"
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: release Workflow Kit 0.21.0",
      "confirmation": "Autopilot run run-F5nJ3wbBuTxd (authorization 1, user-command, 2026-11-20T09:03:55.487Z): Full autopilot run run-F5nJ3wbBuTxd: the user's direct instruction «Отлично, значит, мы сейчас одинаково понимаем, какие правки в коде нужно сделать. Согласен? И до кучи в этом же контексте смотри еще на один баг, который я снял скриншотом. То есть в диалоге четко вид» (2026-11-20T08:59:06.082Z) to prepare and carry out the plan | effects: npm ci; node bin/wfk.mjs install: установка Workflow Kit 0.21.0 в Application Support и перезапуск службы",
      "context": [
        {
          "path": "docs/planning/M48-session-autopilot.md",
          "heading": "5. Проверка",
          "required": true
        }
      ],
      "dependencies": [
        "T006",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "README.md",
        "docs/evidence/M48-acceptance.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Поставка 0.21.0",
      "why": "Пользователь получает автопилот сессии"
    },
    {
      "acceptance": [
        "CI на ci/M48-session-autopilot успешен для точного SHA на macOS ARM64, Linux x64, Windows x64 и Windows ARM64; ссылка в evidence"
      ],
      "checks": [],
      "commitMessage": "test: verify M48 on four CI platforms",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M48-session-autopilot.md",
          "heading": "5. Проверка",
          "required": true
        }
      ],
      "dependencies": [
        "T007",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M48-acceptance.md"
      ],
      "fixes": null,
      "id": "T008",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "CI четырёх платформ",
      "why": "Изменения в службе и панели: нужна зелёная CI macOS, Linux и Windows x64/ARM64"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: M48-session-autopilot (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Automation: 5 automatic, 1 manual criteria; CI origin ci/M48-session-autopilot (4 checks); publication main → origin/main
- Current task: none
- Progress: 8/9
- Revision: 1433

## Objective

У каждой сессии своя карточка автопилота с режимом и ревью, Settings — значения по умолчанию для новых сессий; при автопилоте сессии панель не показывает кнопки, которые нажимает автопилот; план без публикации завершается без ошибки; нажатие при занятом Kit ждёт и применяется

## Acceptance

- Настройки сессии: при начале сессии — значения Settings, сессия-владелец активного запуска берёт его режим и ревью, все точки решения и ответ хука SessionStart читают настройки сессии; смена Settings не меняет уже начатые сессии
- Автопилот сессии включается и выключается на любом этапе по таблице 3.2 спецификации (вопрос о плане закрывается с инструкцией полного запуска, предложение без automation возвращается агенту, план без описания — честная строка), выключение — пауза запуска; ревью сессии меняется до карточки плана, идущее ревью отменяется
- План с publication: null завершается completed «результат остаётся локальным»; нажатие пользователя, на которое Kit ответил LOCKED, ждёт до 15 минут и применяется один раз
- Панель: карточка автопилота под сессией, текст Settings о значениях для новых сессий; при автопилоте сессии нет карточки выбора способа, «Начать выполнение плана» (полный), «Подтвердить выпуск», «Принять план» (кроме ручной приёмки), «Закрыть план», «Опубликовать»; у завершённого запуска — итог без кнопок управления
- Выпуск 0.21.0 установлен, CI четырёх платформ зелёный для точного SHA на ci/M48-session-autopilot; результаты в docs/evidence/M48-acceptance.md
- Живая проверка пользователя на Mac: новый проект с выключенными Settings — карточка сессии «Выкл», включение полного автопилота и ревью посреди подготовки плана, план без кнопок, которые нажимает автопилот, проект без удалённого репозитория завершается «результат локальный»

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Настройки автопилота сессии (work)
  - Commit: feat: keep autopilot mode and review per session, Settings as defaults
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, product-parts/workflow-engine/clusters/session-loop/modules/session-titles, docs/architecture/HTTP-CONTRACTS.md, docs/architecture/CONTRACTS.md, docs/architecture/OS-MATRIX.md, docs/architecture/OS-MATRIX-M48.md, product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/autopilot-line.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/autopiloting.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/m44-agent-state.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/grant.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/session-settings.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/agent-notices.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs-routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/session-pause.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/session-settings.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/settings.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/agent-notices.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m48-session-settings.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/runs-real.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/runs.test.ts
- [DONE] T002 — Включение и выключение автопилота сессии на любом этапе (work)
  - Commit: feat: switch the autopilot of a session at any stage of its task
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/workflow-engine/clusters/session-loop/modules/plan-review, product-parts/workflow-engine/clusters/session-loop/modules/cross-review, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, docs/architecture/HTTP-CONTRACTS.md, docs/architecture/OS-MATRIX-M48.md, product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/session-settings.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/session-switch.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-journal.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-texts.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs-routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/session-settings.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/session-switch.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m48-session-switch-real.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m48-session-switch.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/run-end.test.ts
  - Depends on: T001
- [DONE] T003 — Ревью сессии до карточки плана (work)
  - Commit: feat: switch the review of a session until its plan card appears
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/plan-review, product-parts/workflow-engine/clusters/session-loop/modules/cross-review, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/backend-core/clusters/runtime/modules/cli, docs/architecture/OS-MATRIX-M48.md, docs/architecture/HTTP-CONTRACTS.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-review.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/m48-session-review.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/session-switch.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs-routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/session-settings.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/session-switch.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/settings.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m48-session-settings.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m48-session-switch.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md
  - Depends on: T002
- [DONE] T004 — Конец запуска без публикации и нажатия при занятом Kit (work)
  - Commit: fix: complete a local-only run and wait out a busy Kit for user decisions
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/backend-core/clusters/runtime/modules/cli, docs/architecture/HTTP-CONTRACTS.md, docs/architecture/OS-MATRIX-M48.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/autopiloting-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting-completion.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/kit-waits.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/run-end.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/agent-notices.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/decision-commands.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/kit-waits.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-brief.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-complete.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-journal.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs-routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/complete.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m48-kit-waits.test.ts
  - Depends on: T003
- [DONE] T005 — Панель: карточка сессии и ручные кнопки только без автопилота (work)
  - Commit: feat: show the session autopilot card and hide the buttons the autopilot presses
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-view, product-parts/control-panel/clusters/web-panel/modules/panel-shell, docs/usage-autopiloting.md, docs/architecture/OS-MATRIX-M48.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, docs/architecture/HTTP-CONTRACTS.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/autopiloting-card.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/autopiloting-model.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/publication.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-view/autopiloting.md, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/session-autopilot.md, product-parts/control-panel/clusters/web-panel/modules/session-view/src/plan-cards.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/run-card.css, product-parts/control-panel/clusters/web-panel/modules/session-view/src/run-card.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/run-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-autopilot-card.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-autopilot-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/sidebar-view.js, product-parts/control-panel/clusters/web-panel/modules/session-view/test/m48-session-autopilot.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-view/test/m48-session-card.browser.mjs, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/session-settings.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-brief.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/runs-routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/complete.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m48-session-settings.test.ts
  - Depends on: T004
- [DONE] T006 — Сквозные сценарии и доказательства (work)
  - Commit: test: verify M48 end to end
  - Files: product-parts/backend-core/clusters/runtime/modules/cli/test, docs/evidence/M48-acceptance.md, product-parts/backend-core/clusters/runtime/modules/cli/test/m48-session-autopilot-e2e.test.ts
  - Depends on: T005
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M48-session-autopilot.md, docs/architecture/HTTP-CONTRACTS.md, docs/architecture/CONTRACTS.md, docs/architecture/OS-MATRIX.md, docs/architecture/OS-MATRIX-M48.md, docs/usage-autopiloting.md, docs/evidence/M48-acceptance.md
  - Depends on: T001, T002, T003, T004, T005, T006
- [DONE] T007 — Поставка 0.21.0 (delivery)
  - Commit: chore: release Workflow Kit 0.21.0
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/evidence/M48-acceptance.md
  - Depends on: T006, DOCS-R1
- [TODO] T008 — CI четырёх платформ (delivery)
  - Commit: test: verify M48 on four CI platforms
  - Files: docs/evidence/M48-acceptance.md
  - Depends on: T007, DOCS-R1

Digest: Each session has its own autopilot mode and review, changed on its card at any stage; Settings are the defaults of new sessions. The panel hides the buttons a running autopilot presses itself. A plan without publication ends completed (local result) instead of no-upstream. A user press refused with Kit LOCKED waits and is applied once. Verified end to end on a real service with the real Kit.

State changes only through `scripts/workflow` commands. History lives in Git.
