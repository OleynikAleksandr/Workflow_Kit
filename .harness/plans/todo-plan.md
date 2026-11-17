# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-17T05:47:18.191Z",
    "scopeId": "M39-autopiloting"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 1230,
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
      "В полном автопилоте прямое поручение пользователя запускает подготовку без карточки вопроса; служба решает сама по Settings и сообщению пользователя",
      "В режиме decisions host решения пользователя записываются только операциями хоста по кнопке панели или сообщению пользователя; ручные формы агента отклоняются",
      "Подтверждение поставки стартует задачу службой; стоп и пауза в чате останавливают запуск без участия агента",
      "Push ветки публикации при открытом scope, push ci-ветки вне delivery, внешние коммиты, файлы вне задачи и файлы входа вне .harness/inputs отклоняются Kit",
      "Инструкции и recovery режима host не поручают агенту передавать решения пользователя; проекты на Kit 2.3.x и без приложения работают как раньше",
      "Сквозные сценарии с настоящим bundle и службой и CI четырёх платформ пройдены; доказательства в docs/evidence/M40-acceptance.md"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-17T07:16:11.953Z",
      "text": "Пользователь 17.11.2026: «Проверь внимательно все места, где мы поручаем агенту лишние ненужные задачи… И это все надо исправить.»; «Сделай так, как предложил - разбей на два скопе. И я включил автопилот полный.» | Execution mode chosen by the user: sequential: Автоматический выбор по поручению run-ccWhaP7vmQJZ: sequential (recommended by the plan; ревью: agreed)"
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
            "docs/evidence/M40-acceptance.md"
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
            "docs/evidence/M40-acceptance.md"
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
            "docs/evidence/M40-acceptance.md"
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
            "docs/evidence/M40-acceptance.md"
          ]
        },
        {
          "criterion": 4,
          "kind": "automatic",
          "checks": [
            "typecheck",
            "test",
            "platform-guard",
            "kit:doc-size",
            "kit:md-links"
          ],
          "evidence": [
            "docs/evidence/M40-acceptance.md"
          ]
        },
        {
          "criterion": 5,
          "kind": "automatic",
          "checks": [
            "typecheck",
            "test",
            "platform-guard",
            "kit:doc-size",
            "kit:md-links"
          ],
          "evidence": [
            "docs/evidence/M40-acceptance.md"
          ]
        }
      ],
      "ci": {
        "remote": "origin",
        "branch": "ci/M40-user-decisions",
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
          "taskId": "T010",
          "effects": [
            "npm run build",
            "установка Workflow Kit 0.16.0 в Application Support и перезапуск службы"
          ]
        },
        {
          "taskId": "T011",
          "effects": [
            "push ci/M40-user-decisions в origin и ожидание CI четырёх платформ"
          ]
        }
      ],
      "publication": {
        "branch": "main",
        "upstream": "origin/main"
      }
    },
    "baselineCommit": "d67b712db07502ce17886b3a6e9de61e10384168",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M40-user-decisions.md",
        "required": true
      },
      {
        "path": "docs/planning/M40-user-decisions-contract.md",
        "required": true
      },
      {
        "path": "docs/planning/M40-user-decisions-validation.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-17T07:16:11.953Z",
        "text": "Работа разбита на два scope: M40 решения и барьеры, M41 механика и тексты"
      },
      {
        "at": "2026-11-17T07:16:11.953Z",
        "text": "Workflow_Kit остаётся на Kit 2.3.3 в M40; переход на 2.4.x штатным Обновить Kit после M40"
      },
      {
        "at": "2026-11-17T07:16:11.953Z",
        "text": "Режим decisions host включается ключом конфигурации, который ставит приложение"
      },
      {
        "at": "2026-11-17T07:16:11.953Z",
        "text": "Запрос решения — типизированная запись Kit; канал к панели — состояние Kit (status), а не пересказ агента"
      },
      {
        "at": "2026-11-17T07:16:11.953Z",
        "text": "Решения по разрешению запуска автопилота имеют источник grant и не потребляют сообщение пользователя; стоп и пауза исполняются при получении сообщения"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "25cedd72-7908-49d9-9f21-79cfca178443",
      "strategy": "sequential"
    },
    "id": "M40-user-decisions",
    "objective": "Решения пользователя и барьеры записывает и проверяет Kit, а не агент: вопрос о плане в полном автопилоте, подтверждения, приёмка, закрытие, стоп и пауза, push, внешние коммиты, файлы задачи.",
    "spec": "docs/planning/M40-user-decisions.md",
    "status": "ACTIVE",
    "proposal": {
      "digest": "6d767260db504dd8d70ff25faa7709c51d5a202681dbc36c6f9e0d2342761690",
      "generation": 3
    },
    "authorization": {
      "accept": true,
      "acceptancePolicy": "automatic",
      "at": "2026-11-17T07:16:13.439Z",
      "ci": {
        "remote": "origin",
        "branch": "ci/M40-user-decisions",
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
          "taskId": "T010",
          "effects": [
            "npm run build",
            "установка Workflow Kit 0.16.0 в Application Support и перезапуск службы"
          ]
        },
        {
          "taskId": "T011",
          "effects": [
            "push ci/M40-user-decisions в origin и ожидание CI четырёх платформ"
          ]
        }
      ],
      "mode": "full",
      "note": "Full autopilot run run-ccWhaP7vmQJZ: the user's direct instruction «Сделай так, как предложил - разбей на два скопе» (2026-11-17T06:52:42.726Z) to prepare and carry out the plan",
      "ownerSession": "25cedd72-7908-49d9-9f21-79cfca178443",
      "proposalDigest": "6d767260db504dd8d70ff25faa7709c51d5a202681dbc36c6f9e0d2342761690",
      "publication": {
        "branch": "main",
        "upstream": "origin/main"
      },
      "revision": 1,
      "revoked": null,
      "runId": "run-ccWhaP7vmQJZ",
      "source": "user-command"
    }
  },
  "tasks": [
    {
      "acceptance": [
        "Ключ decisions в config.json: host или agent, по умолчанию agent; установщик принимает --decisions host",
        "В режиме host scope:choose, task:start задачи delivery, accept, close, task:unblock и quality:apply с установкой без билета не меняют план, дают USER_DECISION_REQUIRED и создают запрос решения с params и inputDigest по таблице контракта; повтор с тем же входом возвращает тот же id, другой вход помечает прежний stale",
        "status отдаёт поле decisions только с воспроизводимыми запросами pending; подложенная запись не выдаётся",
        "Операция хоста с --decision и билетом (id, inputDigest, ревизия, корень через sameRoot с внедрённой платформой win32 и linux) записывает решение в историю с decisionId и источником; изменённые данные дают DECISION_STALE; повтор применённого decisionId возвращает already без второй записи",
        "quality:apply --decision применяет сохранённый вход: правка файла после регистрации запроса ничего не меняет, повторный quality:apply с другим входом заменяет запрос, старый id даёт DECISION_STALE; scope:choose проверяет поколение и дайджест предложения до появления scope",
        "Решение по разрешению запуска: операция с runId проверяет живое разрешение scope (отозванное, чужое, не покрывающее действие — отказы M39) и записывает источник grant с runId и дайджестом разрешения; HostRequest несёт runId и decisionId",
        "task:start delivery без флагов стартует задачу, покрытую живым разрешением scope, и записывает подтверждение с источником grant; --autopilot-run остаётся совместимым",
        "Режим agent и отсутствие ключа ведут себя как Kit 2.3.3, тесты M39 проходят; bundle 2.3.3 сохранён как тестовая фикстура; KIT_VERSION 2.4.0, bundle пересобран, module.md и OS-MATRIX обновлены"
      ],
      "checks": [],
      "commitMessage": "feat: record user decisions only through host operations",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M40-user-decisions.md",
          "required": true,
          "heading": "2.1. Режим решений в ядре"
        },
        {
          "path": "docs/planning/M40-user-decisions-contract.md",
          "required": true
        },
        {
          "path": "docs/planning/M40-user-decisions-validation.md",
          "required": true,
          "heading": "1. По задачам"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/kit-core",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Ядро: режим decisions, запросы решений и операции хоста (Kit 2.4.0)",
      "why": "Kit верит тексту агента о решениях пользователя"
    },
    {
      "acceptance": [
        "pre-push читает строки refs из stdin (LF и CRLF) и проверяет целевой remote ref каждой строки: HEAD:main и другая локальная ветка в main оцениваются как push в main; push с несколькими refs отклоняется целиком при одном запрещённом",
        "Ветка публикации при открытом scope — PUBLISH_SCOPE_OPEN, после закрытия проходит",
        "Ветка CI: необязательное поле automation.ci.task; push разрешён, когда объявленная задача IN_PROGRESS или DONE, без task — когда все задачи DONE, у плана без automation — при delivery IN_PROGRESS или всех задачах DONE; иначе CI_PUSH_NOT_ALLOWED, включая постороннюю начатую delivery при объявленной задаче CI; удаление ветки и прочие ветки проходят",
        "Коммит без трейлера Workflow-Transaction после базы scope отклоняет task:start, commit, accept и close кодом EXTERNAL_COMMITS; commits:adopt с точным списком SHA (host с билетом по запросу решения, agent с --note) снимает отказ; новый внешний коммит после создания запроса даёт DECISION_STALE",
        "KIT_VERSION 2.4.1, bundle пересобран, module.md и OS-MATRIX обновлены"
      ],
      "checks": [],
      "commitMessage": "feat: enforce push and external commit barriers",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M40-user-decisions.md",
          "required": true,
          "heading": "3. Барьеры ядра"
        },
        {
          "path": "docs/planning/M40-user-decisions-validation.md",
          "required": true,
          "heading": "1. По задачам"
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/kit-core",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Ядро: барьеры Git — push и внешние коммиты (Kit 2.4.1)",
      "why": "Правила push и запрет коммитов в обход Kit держатся только на тексте инструкции"
    },
    {
      "acceptance": [
        "commit --task в main при изменённых файлах вне files задачи даёт TASK_FILES_OUTSIDE со списком путей; task:update files снимает отказ; задача без files не ограничивается; preexisting и управляемые файлы как раньше",
        "--input или --digest внутри проекта вне .harness/inputs/ дают INPUT_LOCATION до чтения; файл вне проекта проходит",
        "Ветки win32 сравнения путей (регистр, разделители, короткое имя) проверены с внедрённой платформой и путями, которых нет ни на одной ОС",
        "KIT_VERSION 2.4.2, bundle пересобран, module.md и OS-MATRIX обновлены"
      ],
      "checks": [],
      "commitMessage": "feat: enforce task file and input location barriers",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M40-user-decisions.md",
          "required": true,
          "heading": "3. Барьеры ядра"
        },
        {
          "path": "docs/planning/M40-user-decisions-validation.md",
          "required": true,
          "heading": "1. По задачам"
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/kit-core",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Ядро: файловые барьеры — файлы задачи и --input (Kit 2.4.2)",
      "why": "Задача в main молча забирает чужие файлы, файл дайджеста попадает в коммит"
    },
    {
      "acceptance": [
        "Управляемый раздел Kit в режиме host содержит правило о решениях пользователя и wfk decision и не поручает агенту --confirmed, --autopilot-run, accept --note, close и task:unblock",
        "Recovery next и тексты автопилота в режиме host называют решение и где его принять, без ручных форм",
        "Тест сверяет сгенерированные тексты обоих режимов; режим agent прежний",
        "KIT_VERSION 2.4.3, bundle пересобран, module.md обновлены"
      ],
      "checks": [],
      "commitMessage": "feat: generate host-mode instructions without user-decision relays",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M40-user-decisions.md",
          "required": true,
          "heading": "4. Инструкции и тексты"
        },
        {
          "path": "docs/planning/M40-user-decisions-validation.md",
          "required": true,
          "heading": "1. По задачам"
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/kit-core",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Ядро: инструкции и recovery режима host (Kit 2.4.3)",
      "why": "Инструкции поручают агенту передавать решения пользователя"
    },
    {
      "acceptance": [
        "Журнал сообщений пользователя привязан к поколению хода канала агента: только доставленные сообщения (хук UserPromptSubmit или подтверждённая доставка сообщения панели); источник годен, пока текущее поколение то же и происхождение хода user или delivery из сообщений пользователя; автоматическое продолжение (Stop с block), напоминание, доставка ревью, очередь, старый ход, служебное сообщение и отсутствие достоверной привязки дают decision-source-missing без записи; одно сообщение — одно решение",
        "wfk decision <kind> с параметрами выбора (--task, для choose --option) записывает решение операцией хоста с примечанием из сообщения; агент цитату не передаёт",
        "Журнал решений с ключом идемпотентности: двойной запрос и двойное нажатие дают одну запись в истории Kit; запись issued после сбоя или перезапуска службы сверяется с Kit по decisionId без второго решения",
        "Служба читает decisions из status и публикует их в состоянии панели проекта: отказ команды, вызванной отдельным процессом агента, даёт карточку без сообщения агента",
        "Кнопки приёмки, закрытия, выбора режима и подтверждения поставки для проекта decisions host идут операциями хоста с id и дайджестом запроса, старый дайджест даёт DECISION_STALE; для Kit 2.3.x — прежние формы",
        "Решения запуска автопилота (выбор режима, приёмка, закрытие) записываются с источником grant: не потребляют сообщение пользователя, перед билетом проверяются пауза, остановка и отзыв, повтор шага после перезапуска не создаёт второго решения",
        "Подтверждение поставки: служба сама стартует задачу delivery и только затем сообщает агенту, что задача начата",
        "module.md изменённых модулей и OS-MATRIX обновлены"
      ],
      "checks": [],
      "commitMessage": "feat: record user decisions from panel buttons and delivered user messages",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M40-user-decisions.md",
          "required": true,
          "heading": "2.2. Источник решения в службе"
        },
        {
          "path": "docs/planning/M40-user-decisions-contract.md",
          "required": true
        },
        {
          "path": "docs/planning/M40-user-decisions-validation.md",
          "required": true,
          "heading": "1. По задачам"
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-runner",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Служба: журнал решений, привязка к ходу, wfk decision и операции хоста",
      "why": "Служба знает решение пользователя, но поручает агенту передать его в Kit"
    },
    {
      "acceptance": [
        "Сообщение пользователя владельцу живого запуска проверяется при получении службой: сообщение панели — в момент приёма, даже если агент занят и сообщение в очереди; текст из приложения провайдера — в хуке UserPromptSubmit",
        "Первое слово стоп, stop, останови, остановись, остановить останавливает запуск, пауза, pause, приостанови ставит на паузу; следующие автоматические действия (продолжение, выбор, старт задачи, приёмка, закрытие, публикация) не начинаются, начатое действие заканчивается с записью результата",
        "Стоп при занятом агенте и стоп перед автоматической приёмкой и публикацией проверены тестами; другое первое слово, сообщение не владельцу и сообщение без живого запуска ничего не меняют; текст нормализуется NFC и нижним регистром без учёта локали",
        "module.md изменённых модулей обновлены"
      ],
      "checks": [],
      "commitMessage": "feat: stop or pause a live run by the user's word in the service",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M40-user-decisions.md",
          "required": true,
          "heading": "2.4. «Стоп» и «пауза» распознаёт служба"
        },
        {
          "path": "docs/planning/M40-user-decisions-validation.md",
          "required": true,
          "heading": "1. По задачам"
        }
      ],
      "dependencies": [
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Служба: «стоп» и «пауза» распознаёт служба",
      "why": "Остановка запуска зависит от того, поймёт ли агент слово пользователя"
    },
    {
      "acceptance": [
        "wfk session plan при full и сообщении пользователя, доставленном в текущий ход, записывает запуск без карточки, ревью из Settings",
        "Без такого сообщения (служебное, из очереди, старого хода), при off и after-start — карточка; старый Kit — kit-update-required",
        "--authorized с любым значением даёт тот же результат, что без флага, и убран из справки",
        "Повтор в том же ходе возвращает тот же runId; другой активный запуск — run-active",
        "module.md изменённых модулей обновлены"
      ],
      "checks": [],
      "commitMessage": "feat: let the service authorize full-autopilot preparation itself",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M40-user-decisions.md",
          "required": true,
          "heading": "2.3. Вопрос о плане в полном автопилоте"
        },
        {
          "path": "docs/planning/M40-user-decisions-contract.md",
          "required": true,
          "heading": "3. Сообщение пользователя как источник"
        },
        {
          "path": "docs/planning/M40-user-decisions-validation.md",
          "required": true,
          "heading": "1. По задачам"
        }
      ],
      "dependencies": [
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Служба: вопрос о плане в полном автопилоте без --authorized",
      "why": "Карточка появляется, если агент не знает про --authorized"
    },
    {
      "acceptance": [
        "Карточки unblock, approve-install и adopt-commits строятся по запросам решений из состояния панели, показывают точные параметры (причина, команды установки, список коммитов) и по кнопке записывают решение; клавиатура, aria и обе темы как у существующих карточек",
        "Создание проекта и Обновить Kit на Kit 2.4.0 и новее ставят decisions host; Kit 2.3.x ключ не получает",
        "Раздел панели AGENTS.md не упоминает --authorized; для проектов host вместо scope:create без вопроса — wfk session plan",
        "module.md изменённых модулей и OS-MATRIX обновлены"
      ],
      "checks": [],
      "commitMessage": "feat: show decision cards and enable host decisions for new projects",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M40-user-decisions.md",
          "required": true
        },
        {
          "path": "docs/planning/M40-user-decisions-contract.md",
          "required": true,
          "heading": "1. Запрос решения"
        },
        {
          "path": "docs/planning/M40-user-decisions-validation.md",
          "required": true,
          "heading": "1. По задачам"
        }
      ],
      "dependencies": [
        "T007"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel",
        "product-parts/backend-core/clusters/projects",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-update",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T008",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Панель и структура: карточки решений и decisions host",
      "why": "Новые решения пользователя нужно принять кнопкой; новые проекты включают режим host"
    },
    {
      "acceptance": [
        "Девять сценариев раздела 2 проверки M40 — отдельные тесты с настоящим bundle Kit и службой на одноразовых проектах, проходят: полный проход host под автопилотом от предложения до проверенной публикации с проверкой записанного состояния каждого этапа (решения запуска с источником grant, исходное сообщение использовано один раз, отзыв разрешения останавливает проход), полный ручной проход host кнопками, отказ из отдельного процесса агента, вопрос о плане, согласование установки (правка файла не влияет, новый вызов заменяет запрос), устаревшие решения включая автоматическое продолжение, барьеры Git, стоп при занятом агенте и перед приёмкой, регрессия Kit 2.3.3",
        "docs/evidence/M40-acceptance.md: таблица сценарий, тест, результат и что не проверено"
      ],
      "checks": [],
      "commitMessage": "test: verify M40 user decisions end to end",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M40-user-decisions-validation.md",
          "required": true,
          "heading": "2. Сквозные сценарии (T009)"
        },
        {
          "path": "docs/planning/M40-user-decisions-contract.md",
          "required": true
        }
      ],
      "dependencies": [
        "T006",
        "T008"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/test",
        "product-parts/backend-core/clusters/runtime/modules/cli/test",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/test",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test",
        "docs/evidence/M40-acceptance.md",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T009",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Сквозные проверки M40 с настоящим bundle и службой",
      "why": "Модульные тесты не доказывают путь целиком"
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
        "T006",
        "T007",
        "T008",
        "T009"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M40-user-decisions.md",
        "docs/architecture/OS-MATRIX.md",
        "docs/evidence/M40-acceptance.md"
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
        "Версия 0.16.0 собрана и установлена; проверка installed-service успешна; CHANGELOG и README называют 0.16.0"
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: release Workflow Kit 0.16.0",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M40-user-decisions-validation.md",
          "required": true,
          "heading": "3. Поставка и CI"
        }
      ],
      "dependencies": [
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "README.md",
        "docs/evidence/M40-acceptance.md"
      ],
      "fixes": null,
      "id": "T010",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Поставка 0.16.0",
      "why": "Пользователь получает исправление"
    },
    {
      "acceptance": [
        "CI на ci/M40-user-decisions успешен для точного SHA на macOS ARM64, Linux x64, Windows x64 и Windows ARM64"
      ],
      "checks": [],
      "commitMessage": "test: verify M40 on four CI platforms",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M40-user-decisions-validation.md",
          "required": true,
          "heading": "3. Поставка и CI"
        }
      ],
      "dependencies": [
        "T010",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M40-acceptance.md"
      ],
      "fixes": null,
      "id": "T011",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "CI четырёх платформ",
      "why": "Изменения должны работать на macOS, Linux и Windows"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: M40-user-decisions (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Automation: 6 automatic, 0 manual criteria; CI origin ci/M40-user-decisions (4 checks); publication main → origin/main
- Current task: none
- Progress: 0/12
- Revision: 1230

## Objective

Решения пользователя и барьеры записывает и проверяет Kit, а не агент: вопрос о плане в полном автопилоте, подтверждения, приёмка, закрытие, стоп и пауза, push, внешние коммиты, файлы задачи.

## Acceptance

- В полном автопилоте прямое поручение пользователя запускает подготовку без карточки вопроса; служба решает сама по Settings и сообщению пользователя
- В режиме decisions host решения пользователя записываются только операциями хоста по кнопке панели или сообщению пользователя; ручные формы агента отклоняются
- Подтверждение поставки стартует задачу службой; стоп и пауза в чате останавливают запуск без участия агента
- Push ветки публикации при открытом scope, push ci-ветки вне delivery, внешние коммиты, файлы вне задачи и файлы входа вне .harness/inputs отклоняются Kit
- Инструкции и recovery режима host не поручают агенту передавать решения пользователя; проекты на Kit 2.3.x и без приложения работают как раньше
- Сквозные сценарии с настоящим bundle и службой и CI четырёх платформ пройдены; доказательства в docs/evidence/M40-acceptance.md

## Rounds

### R1 — Implementation (implementation, OPEN)

- [TODO] T001 — Ядро: режим decisions, запросы решений и операции хоста (Kit 2.4.0) (work)
  - Commit: feat: record user decisions only through host operations
  - Files: product-parts/kit-core, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle, docs/architecture/OS-MATRIX.md
- [TODO] T002 — Ядро: барьеры Git — push и внешние коммиты (Kit 2.4.1) (work)
  - Commit: feat: enforce push and external commit barriers
  - Files: product-parts/kit-core, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle, docs/architecture/OS-MATRIX.md
  - Depends on: T001
- [TODO] T003 — Ядро: файловые барьеры — файлы задачи и --input (Kit 2.4.2) (work)
  - Commit: feat: enforce task file and input location barriers
  - Files: product-parts/kit-core, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle, docs/architecture/OS-MATRIX.md
  - Depends on: T002
- [TODO] T004 — Ядро: инструкции и recovery режима host (Kit 2.4.3) (work)
  - Commit: feat: generate host-mode instructions without user-decision relays
  - Files: product-parts/kit-core, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle, docs/architecture/OS-MATRIX.md
  - Depends on: T003
- [TODO] T005 — Служба: журнал решений, привязка к ходу, wfk decision и операции хоста (work)
  - Commit: feat: record user decisions from panel buttons and delivered user messages
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/workflow-engine/clusters/kit-host/modules/kit-runner, product-parts/workflow-engine/clusters/kit-host/modules/plan-view, product-parts/workflow-engine/clusters/session-loop/modules/plan-review, docs/architecture/OS-MATRIX.md
  - Depends on: T004
- [TODO] T006 — Служба: «стоп» и «пауза» распознаёт служба (work)
  - Commit: feat: stop or pause a live run by the user's word in the service
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, product-parts/backend-core/clusters/runtime/modules/cli, docs/architecture/OS-MATRIX.md
  - Depends on: T005
- [TODO] T007 — Служба: вопрос о плане в полном автопилоте без --authorized (work)
  - Commit: feat: let the service authorize full-autopilot preparation itself
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/workflow-engine/clusters/session-loop/modules/plan-review, product-parts/backend-core/clusters/runtime/modules/cli, docs/architecture/OS-MATRIX.md
  - Depends on: T005
- [TODO] T008 — Панель и структура: карточки решений и decisions host (work)
  - Commit: feat: show decision cards and enable host decisions for new projects
  - Files: product-parts/control-panel, product-parts/backend-core/clusters/projects, product-parts/workflow-engine/clusters/kit-host/modules/kit-update, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, docs/architecture/OS-MATRIX.md
  - Depends on: T007
- [TODO] T009 — Сквозные проверки M40 с настоящим bundle и службой (work)
  - Commit: test: verify M40 user decisions end to end
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/test, product-parts/backend-core/clusters/runtime/modules/cli/test, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/test, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test, docs/evidence/M40-acceptance.md, docs/architecture/OS-MATRIX.md
  - Depends on: T006, T008
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M40-user-decisions.md, docs/architecture/OS-MATRIX.md, docs/evidence/M40-acceptance.md
  - Depends on: T001, T002, T003, T004, T005, T006, T007, T008, T009
- [TODO] T010 — Поставка 0.16.0 (delivery)
  - Commit: chore: release Workflow Kit 0.16.0
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/evidence/M40-acceptance.md
  - Depends on: DOCS-R1
- [TODO] T011 — CI четырёх платформ (delivery)
  - Commit: test: verify M40 on four CI platforms
  - Files: docs/evidence/M40-acceptance.md
  - Depends on: T010, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
