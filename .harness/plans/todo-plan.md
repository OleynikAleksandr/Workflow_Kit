# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-17T17:12:16.369Z",
    "scopeId": "speech-integration",
    "decision": {
      "at": "2026-11-17T17:12:16.333Z",
      "decisionId": "dec-7a4b9cd48435",
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
  "revision": 1302,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/module.md",
          "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/operations.md",
          "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/autopilot.md",
          "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting-completion.md",
          "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/module.md",
          "docs/architecture/HTTP-CONTRACTS.md"
        ],
        "decisions": [
          "Missing acceptance evidence turns the run into a wait for the user's acceptance (phase accepting with manualAcceptance), never a stop",
          "Kit runs at the commit of a delivery task only the delivery-stage checks it names; required unnamed ones never run",
          "The recording rule reuses the runner's selectChecks; push never records, appliesTo must fit the task files",
          "The Kit update is deferred, the exactSha rule is not weakened"
        ],
        "references": [
          "docs/planning/M41-autopilot-acceptance.md",
          "docs/evidence/M41-acceptance.md",
          "docs/usage-autopiloting.md"
        ],
        "result": "M41 R1: Kit 2.4.5 records the delivery checks a delivery task names and refuses automation criteria no task can record (AUTOMATION_CHECK_UNRECORDED), autopilot:status reports checksPending/checksUnreachable; the service waits for the user's acceptance instead of stopping the run, then closes and publishes, and warns early; «Обновить Kit» waits for the close of the plan and the publication of the run (409 scope-open/run-active, re-checked under the project lock); end-to-end scenarios pass on the real bundle."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "CLOSED",
      "title": "Implementation"
    },
    {
      "digest": null,
      "id": "R2",
      "kind": "fixes",
      "status": "OPEN",
      "title": "CI limits"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "Kit 2.4.5 записывает назначенные задаче поставки проверки стадии delivery, отклоняет критерии automation без возможной записи (AUTOMATION_CHECK_UNRECORDED) и сообщает checksPending и checksUnreachable",
      "При нехватке доказательств запуск полного автопилота ждёт приёмки пользователя («Ждёт вашей приёмки»), а не останавливается; после приёмки сам закрывает план и публикует; недостижимые проверки предупреждаются заранее",
      "«Обновить Kit» отклоняется, пока план открыт (409 scope-open) или запуск автопилота ещё не опубликовал результат (409 run-active), и в панели выключено с причиной",
      "Сквозные сценарии с bundle 2.4.5, выпуск 0.18.0 и CI четырёх платформ пройдены; доказательства в docs/evidence/M41-acceptance.md"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-17T17:27:10.457Z",
      "text": "Пользователь 17.11.2026: «Автопилот должен автоматически сам заканчиваться сниматься при выполнении полного плана или не влиять на приёмку чтобы не возникало этой ошибки предложи лучший вариант»; на предложение из четырёх пунктов: «Окей согласен подготовь новый (спецификацию todo Plan).» | Execution mode chosen by the user: sequential: Автоматический выбор по поручению run-eX36hZQS5Jh3: sequential (recommended by the plan; ревью: agreed)"
    },
    "automation": {
      "acceptance": [
        {
          "criterion": 0,
          "kind": "automatic",
          "checks": [
            "typecheck",
            "test",
            "platform-guard",
            "kit:doc-size",
            "kit:md-links"
          ],
          "evidence": [
            "docs/evidence/M41-acceptance.md"
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
            "docs/evidence/M41-acceptance.md"
          ]
        },
        {
          "criterion": 2,
          "kind": "automatic",
          "checks": [
            "typecheck",
            "test",
            "platform-guard",
            "kit:doc-size",
            "kit:md-links"
          ],
          "evidence": [
            "docs/evidence/M41-acceptance.md"
          ]
        },
        {
          "criterion": 3,
          "kind": "automatic",
          "checks": [
            "typecheck",
            "test",
            "platform-guard",
            "kit:doc-size",
            "kit:md-links"
          ],
          "evidence": [
            "docs/evidence/M41-acceptance.md"
          ]
        }
      ],
      "ci": {
        "remote": "origin",
        "branch": "ci/M41-autopilot-acceptance",
        "requiredChecks": [
          "macOS ARM64",
          "Linux x64",
          "Windows x64",
          "Windows ARM64"
        ],
        "exactSha": true
      },
      "delivery": [
        {
          "taskId": "T005",
          "effects": [
            "npm ci",
            "node bin/wfk.mjs install: установка Workflow Kit 0.18.0 в Application Support и перезапуск службы"
          ]
        },
        {
          "taskId": "T006",
          "effects": [
            "push ci/M41-autopilot-acceptance в origin и ожидание CI четырёх платформ"
          ]
        }
      ],
      "publication": {
        "branch": "main",
        "upstream": "origin/main"
      }
    },
    "baselineCommit": "33a40bf1a47f17032a0f4480140db3383a590dfb",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M41-autopilot-acceptance.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-17T17:27:10.457Z",
        "text": "Нехватка доказательств переводит запуск в ожидание приёмки пользователя, а не в остановку; после приёмки запуск сам закрывает и публикует"
      },
      {
        "at": "2026-11-17T17:27:10.457Z",
        "text": "Kit запускает при коммите задачи поставки только назначенные ей проверки стадии delivery"
      },
      {
        "at": "2026-11-17T17:27:10.457Z",
        "text": "«Обновить Kit» откладывается до закрытия плана, правило exactSha не ослабляется"
      },
      {
        "at": "2026-11-17T17:27:10.457Z",
        "text": "В критериях automation этого scope только проверки стадии commit: проект остаётся на Kit 2.4.4 до закрытия"
      },
      {
        "at": "2026-11-17T17:27:10.448Z",
        "decisionId": "dec-4fb610d03dc3",
        "kind": "choose",
        "source": {
          "kind": "grant",
          "messageId": null,
          "runId": "run-eX36hZQS5Jh3",
          "session": null,
          "authorization": null
        },
        "text": "choose: Автоматический выбор по поручению run-eX36hZQS5Jh3: sequential (recommended by the plan; ревью: agreed)"
      },
      {
        "at": "2026-11-17T18:08:57.687Z",
        "kind": "confirm-delivery",
        "source": {
          "authorization": "7141c48e462750bb3fd696490d5bf11f0ba46712f0a400e70fed9cd356ce7e64",
          "kind": "grant",
          "runId": "run-eX36hZQS5Jh3"
        },
        "text": "Delivery T005 started by the advance instruction of run run-eX36hZQS5Jh3"
      },
      {
        "at": "2026-11-17T18:12:09.769Z",
        "kind": "confirm-delivery",
        "source": {
          "authorization": "7141c48e462750bb3fd696490d5bf11f0ba46712f0a400e70fed9cd356ce7e64",
          "kind": "grant",
          "runId": "run-eX36hZQS5Jh3"
        },
        "text": "Delivery T006 started by the advance instruction of run run-eX36hZQS5Jh3"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "25cedd72-7908-49d9-9f21-79cfca178443",
      "strategy": "sequential"
    },
    "id": "M41-autopilot-acceptance",
    "objective": "Полный автопилот не останавливается тупиком на приёмке: Kit записывает проверки поставки и отклоняет невыполнимые критерии, служба при нехватке доказательств ждёт приёмки пользователя и затем сама закрывает и публикует, «Обновить Kit» откладывается до закрытия плана.",
    "spec": "docs/planning/M41-autopilot-acceptance.md",
    "status": "ACTIVE",
    "proposal": {
      "digest": "7cc672b22d4f746cde4c70fde0aeedc9a99600a8edde529ceeb21a6d35952c62",
      "generation": 3
    },
    "authorization": {
      "accept": true,
      "acceptancePolicy": "automatic",
      "at": "2026-11-17T17:27:11.983Z",
      "ci": {
        "remote": "origin",
        "branch": "ci/M41-autopilot-acceptance",
        "requiredChecks": [
          "macOS ARM64",
          "Linux x64",
          "Windows x64",
          "Windows ARM64"
        ],
        "exactSha": true
      },
      "close": true,
      "delivery": [
        {
          "taskId": "T005",
          "effects": [
            "npm ci",
            "node bin/wfk.mjs install: установка Workflow Kit 0.18.0 в Application Support и перезапуск службы"
          ]
        },
        {
          "taskId": "T006",
          "effects": [
            "push ci/M41-autopilot-acceptance в origin и ожидание CI четырёх платформ"
          ]
        }
      ],
      "mode": "full",
      "note": "Full autopilot run run-eX36hZQS5Jh3: the user's direct instruction «Окей согласен подготовь новый (спецификацию todo Plan).» (2026-11-17T17:15:06.625Z) to prepare and carry out the plan",
      "ownerSession": "25cedd72-7908-49d9-9f21-79cfca178443",
      "proposalDigest": "7cc672b22d4f746cde4c70fde0aeedc9a99600a8edde529ceeb21a6d35952c62",
      "publication": {
        "branch": "main",
        "upstream": "origin/main"
      },
      "revision": 1,
      "revoked": null,
      "runId": "run-eX36hZQS5Jh3",
      "source": "user-command"
    }
  },
  "tasks": [
    {
      "acceptance": [
        "pre-commit задачи вида delivery запускает назначенные ей проверки стадии delivery и записывает их в доказательства коммита; обязательные неназначенные не запускаются; провал откатывает коммит",
        "Общее правило canRecord считается тем же выбором, что у раннера (selectChecks): commit и prepare — обязательная или назначенная, delivery — назначенная задаче поставки, push — никогда, сервисные задачи — только DOCUMENTATION_BUILTINS; appliesTo совместим с files задачи (skipped — не запись)",
        "scope:propose и scope:create отклоняют AUTOMATION_CHECK_UNRECORDED (reason stage-push, delivery-unassigned, not-assigned, applies-to); до CONFIGURED профиля будущие id допускаются; schema называет код",
        "autopilot:status даёт checksPending и checksUnreachable по canRecord; типы plan-view необязательны",
        "Тесты kit-core: запись delivery, отказы включая appliesTo src/** при files docs/**, приёмка по сохранённому отчёту prepare, новый проект до и после QUALITY, kit:file-lines без записи при оставшейся только DOCS — checksUnreachable; версия Kit 2.4.5 в payload, bundle-meta, vendor и PROVENANCE"
      ],
      "checks": [],
      "commitMessage": "feat: record delivery checks and refuse unrecordable automation checks in Kit 2.4.5",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M41-autopilot-acceptance.md",
          "required": true,
          "heading": "2.1. Kit 2.4.5 (`kit-core`, бандл приложения)"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/kit-core",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/autopilot.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/operations.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-automation.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-autopilot-status.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-hooks.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-scope-create.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-autopilot-grant.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-delivery-checks.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/automation.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-input-schema-automation.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-input-schema.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-recording.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-runner.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/workflow-quality-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/test/workflow-quality-recording.test.mjs",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle-meta.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.4.4.mjs.gz",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.4.5.mjs.gz"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Kit 2.4.5: проверки поставки и выполнимые критерии",
      "why": "installed-service назначалась задаче поставки, но Kit её не запускал, а план с ней принял"
    },
    {
      "acceptance": [
        "accept() для evidenceMissing, AUTOPILOT_EVIDENCE_REQUIRED (кроме постановки CI для HEAD) и AUTOPILOT_MANUAL_REQUIRED записывает manualAcceptance и nextAction вместо blocked",
        "При том же HEAD Kit повторно не вызывается, при новом HEAD — автоматическая попытка; после приёмки пользователя запуск закрывает план и публикует",
        "checksUnreachable в executing и delivering даёт однократный notice без остановки; Kit без поля — без предупреждения",
        "Карточка запуска: «Ждёт вашей приёмки» с причиной и notice; модульные тесты службы и модели панели"
      ],
      "checks": [],
      "commitMessage": "feat: wait for the user's acceptance instead of stopping the autopilot run",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M41-autopilot-acceptance.md",
          "required": true,
          "heading": "2.2. Служба: приёмка пользователя вместо остановки (`autopilot`)"
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting-completion.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/run-end.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/complete.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/manual-acceptance.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-view",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/run-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/run-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/run-model.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-brief.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-complete.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-journal.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-kit.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Служба: приёмка пользователя вместо остановки",
      "why": "Нехватка доказательств превращала запуск в тупик «Остановлен»"
    },
    {
      "acceptance": [
        "POST /api/projects/:id/kit/update отвечает 409 scope-open при открытом scope и 409 run-active, пока запуск автопилота проекта не в конечной фазе; ничего не меняет; без них — как раньше",
        "Свежая проверка запрета — в начале фонового обновления под блокировкой project:<id> до первой записи; под ней же подготовка структуры, kit.install и восстановление; cli передаёт deferral и mutex",
        "Раздел kit даёт deferred { code, scopeId, runId }; карточка «Обновить Kit» выключена с подписью по причине; тесты маршрута, модели карточки и гонки: запуск появился между запросом и блокировкой — ни файлов структуры, ни HEAD не изменено"
      ],
      "checks": [],
      "commitMessage": "feat: defer the Kit update while a plan is open",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M41-autopilot-acceptance.md",
          "required": true,
          "heading": "2.3. «Обновить Kit» откладывается, пока план открыт (`kit-update`)"
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "docs/architecture/HTTP-CONTRACTS.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/kit-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/kit-card.test.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/src/deferral.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/src/index.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/src/routes.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/src/update.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update/test/kit-update-deferral.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "«Обновить Kit» после закрытия плана и публикации",
      "why": "Коммит Kit после зелёного CI сделал доказательство приёмки непригодным"
    },
    {
      "acceptance": [
        "С bundle 2.4.5: проверка delivery задачи поставки в критерии — полный автопилот принимает, закрывает и публикует сам",
        "Критерий без возможной записи (push, delivery без задачи, appliesTo вне files) — scope:propose отклоняет AUTOMATION_CHECK_UNRECORDED",
        "Файла доказательств нет при чистом дереве — запуск ждёт приёмки, ни разу не blocked; «Принять план» — закрытие, CI именно SHA закрытия, публикация этого SHA",
        "Незакоммиченный файл доказательств — ожидание приёмки, затем закрытие запуском получает DIRTY_TREE и останавливается с подсказкой, файл сохранён",
        "«Обновить Kit»: открытый план — 409 scope-open; scope закрыт и запуск ждёт CI финального SHA — 409 run-active без изменений HEAD и Kit; после публикации — 202; результаты в docs/evidence/M41-acceptance.md"
      ],
      "checks": [],
      "commitMessage": "test: verify M41 autopilot acceptance end to end",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M41-autopilot-acceptance.md",
          "required": true,
          "heading": "4. Проверка"
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m41-acceptance-real.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m41-kit-update-real.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m40-world.ts",
        "docs/evidence/M41-acceptance.md",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Сквозные сценарии M41",
      "why": "Изменения Kit и службы проверяются вместе на настоящем bundle"
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
        "docs/planning/M41-autopilot-acceptance.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting-completion.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/run-end.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "docs/architecture/HTTP-CONTRACTS.md",
        "docs/evidence/M41-acceptance.md",
        "docs/usage-autopiloting.md",
        "docs/architecture/workflow-kit/WorkflowKitCommands.md"
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
        "Версия 0.18.0 установлена через node bin/wfk.mjs install, doctor --installed — всё в порядке, результат в evidence; CHANGELOG и README называют 0.18.0"
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: release Workflow Kit 0.18.0",
      "confirmation": "Autopilot run run-eX36hZQS5Jh3 (authorization 1, user-command, 2026-11-17T17:27:11.983Z): Full autopilot run run-eX36hZQS5Jh3: the user's direct instruction «Окей согласен подготовь новый (спецификацию todo Plan).» (2026-11-17T17:15:06.625Z) to prepare and carry out the plan | effects: npm ci; node bin/wfk.mjs install: установка Workflow Kit 0.18.0 в Application Support и перезапуск службы",
      "context": [
        {
          "path": "docs/planning/M41-autopilot-acceptance.md",
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
        "README.md",
        "docs/evidence/M41-acceptance.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Поставка 0.18.0",
      "why": "Пользователь получает автоприёмку без тупиков"
    },
    {
      "acceptance": [
        "CI на ci/M41-autopilot-acceptance успешен для точного SHA на macOS ARM64, Linux x64, Windows x64 и Windows ARM64"
      ],
      "checks": [],
      "commitMessage": "test: verify M41 on four CI platforms",
      "confirmation": "Autopilot run run-eX36hZQS5Jh3 (authorization 1, user-command, 2026-11-17T17:27:11.983Z): Full autopilot run run-eX36hZQS5Jh3: the user's direct instruction «Окей согласен подготовь новый (спецификацию todo Plan).» (2026-11-17T17:15:06.625Z) to prepare and carry out the plan | effects: push ci/M41-autopilot-acceptance в origin и ожидание CI четырёх платформ",
      "context": [
        {
          "path": "docs/planning/M41-autopilot-acceptance.md",
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
        "docs/evidence/M41-acceptance.md"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "CI четырёх платформ",
      "why": "Изменения должны работать на macOS, Linux и Windows"
    },
    {
      "acceptance": [
        "timeout-minutes заданий CI позволяет Windows ARM64 пройти полный npm test с запасом",
        "Причины красного CI 44145356489 и исправление записаны в docs/evidence/M41-acceptance.md"
      ],
      "checks": [],
      "commitMessage": "ci: give the four-platform jobs room for the M41 end-to-end tests",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M41-autopilot-acceptance.md",
          "required": true,
          "heading": "4. Проверка"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        ".github/workflows/ci.yml",
        "docs/evidence/M41-acceptance.md"
      ],
      "fixes": "T004",
      "id": "F001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "DONE",
      "title": "Лимит времени заданий CI",
      "why": "CI кандидата M41: Windows ARM64 превысил timeout-minutes 20 (прошлый прогон 19 мин 22 с, сквозные тесты M41 добавили минуты); на macOS ARM64 один Kit-вызов теста M40 не ответил за 60 с под нагрузкой"
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
        "F001"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M41-acceptance.md"
      ],
      "fixes": null,
      "id": "DOCS-R2",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R2",
      "status": "TODO",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: M41-autopilot-acceptance (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Automation: 4 automatic, 0 manual criteria; CI origin ci/M41-autopilot-acceptance (4 checks); publication main → origin/main
- Current task: none
- Progress: 8/9
- Revision: 1302

## Objective

Полный автопилот не останавливается тупиком на приёмке: Kit записывает проверки поставки и отклоняет невыполнимые критерии, служба при нехватке доказательств ждёт приёмки пользователя и затем сама закрывает и публикует, «Обновить Kit» откладывается до закрытия плана.

## Acceptance

- Kit 2.4.5 записывает назначенные задаче поставки проверки стадии delivery, отклоняет критерии automation без возможной записи (AUTOMATION_CHECK_UNRECORDED) и сообщает checksPending и checksUnreachable
- При нехватке доказательств запуск полного автопилота ждёт приёмки пользователя («Ждёт вашей приёмки»), а не останавливается; после приёмки сам закрывает план и публикует; недостижимые проверки предупреждаются заранее
- «Обновить Kit» отклоняется, пока план открыт (409 scope-open) или запуск автопилота ещё не опубликовал результат (409 run-active), и в панели выключено с причиной
- Сквозные сценарии с bundle 2.4.5, выпуск 0.18.0 и CI четырёх платформ пройдены; доказательства в docs/evidence/M41-acceptance.md

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Kit 2.4.5: проверки поставки и выполнимые критерии (work)
  - Commit: feat: record delivery checks and refuse unrecordable automation checks in Kit 2.4.5
  - Files: product-parts/kit-core, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle, product-parts/workflow-engine/clusters/kit-host/modules/plan-view, docs/architecture/OS-MATRIX.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/autopilot.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/operations.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-automation.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-autopilot-status.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-hooks.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-scope-create.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-autopilot-grant.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-delivery-checks.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/automation.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-input-schema-automation.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-input-schema.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-recording.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/quality-runner.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/src/workflow-quality-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-quality/test/workflow-quality-recording.test.mjs, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle-meta.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.4.4.mjs.gz, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.4.5.mjs.gz
- [DONE] T002 — Служба: приёмка пользователя вместо остановки (work)
  - Commit: feat: wait for the user's acceptance instead of stopping the autopilot run
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting-completion.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/run-end.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/complete.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/manual-acceptance.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-view, docs/architecture/OS-MATRIX.md, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/src/run-card.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/run-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/test/run-model.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-brief.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-complete.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-journal.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/run-kit.ts
  - Depends on: T001
- [DONE] T003 — «Обновить Kit» после закрытия плана и публикации (work)
  - Commit: feat: defer the Kit update while a plan is open
  - Files: product-parts/workflow-engine/clusters/kit-host/modules/kit-update, product-parts/control-panel/clusters/web-panel/modules/panel-shell, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, docs/architecture/HTTP-CONTRACTS.md, docs/architecture/OS-MATRIX.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/kit-card.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/kit-card.test.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/src/deferral.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/src/index.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/src/routes.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/src/update.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-update/test/kit-update-deferral.test.ts
  - Depends on: T002
- [DONE] T004 — Сквозные сценарии M41 (work)
  - Commit: test: verify M41 autopilot acceptance end to end
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m41-acceptance-real.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m41-kit-update-real.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m40-world.ts, docs/evidence/M41-acceptance.md, docs/architecture/OS-MATRIX.md
  - Depends on: T003
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M41-autopilot-acceptance.md, docs/architecture/OS-MATRIX.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting-completion.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/run-end.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, docs/architecture/HTTP-CONTRACTS.md, docs/evidence/M41-acceptance.md, docs/usage-autopiloting.md, docs/architecture/workflow-kit/WorkflowKitCommands.md
  - Depends on: T001, T002, T003, T004
- [DONE] T005 — Поставка 0.18.0 (delivery)
  - Commit: chore: release Workflow Kit 0.18.0
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/evidence/M41-acceptance.md
  - Depends on: T004, DOCS-R1
- [DONE] T006 — CI четырёх платформ (delivery)
  - Commit: test: verify M41 on four CI platforms
  - Files: docs/evidence/M41-acceptance.md
  - Depends on: T005, DOCS-R1

Digest: M41 R1: Kit 2.4.5 records the delivery checks a delivery task names and refuses automation criteria no task can record (AUTOMATION_CHECK_UNRECORDED), autopilot:status reports checksPending/checksUnreachable; the service waits for the user's acceptance instead of stopping the run, then closes and publishes, and warns early; «Обновить Kit» waits for the close of the plan and the publication of the run (409 scope-open/run-active, re-checked under the project lock); end-to-end scenarios pass on the real bundle.

### R2 — CI limits (fixes, OPEN)

- [DONE] F001 — Лимит времени заданий CI (work)
  - Commit: ci: give the four-platform jobs room for the M41 end-to-end tests
  - Files: .github/workflows/ci.yml, docs/evidence/M41-acceptance.md
  - Fixes: T004
- [TODO] DOCS-R2 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R2
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/evidence/M41-acceptance.md
  - Depends on: F001

State changes only through `scripts/workflow` commands. History lives in Git.
