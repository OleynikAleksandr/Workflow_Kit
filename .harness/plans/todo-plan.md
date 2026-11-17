# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "autopilotRun": "run-ccWhaP7vmQJZ",
    "closedAt": "2026-11-17T12:52:26.749Z",
    "finalCommit": "fe6cfbbecb4b526ea84b3fbe1bed35acd0fe0606",
    "scopeId": "M40-user-decisions"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 1275,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "cli: app.ts загружается только для serve (loadCreateApp, missingPackage, ленивый createApp); deps.loadApp",
          "service-installer: APP_PARTS + package-lock.json, THIRD_PARTY_NOTICES.md; COPY_EXCLUDED_DIRS + target; runtime-payload.ts (runtimePackages, ensureDependencies, deployHelper, removeHelper); ServiceDeps.arch; InstallerFs.copyFile/sha256",
          "doctor --installed: «зависимости копии» (fail) и «диктовка: helper» (warn) на macOS ARM64",
          "HTTP: GET /api/speech, POST /api/speech/models/:id/*, upgrade /api/speech/stream (HTTP-CONTRACTS.md)"
        ],
        "decisions": [
          "Перенос — git apply -3 изменений ветки без .harness внутри T001 и commit --task: коммит слияния Kit отклоняет, а ревизии плана Speech не должны попасть в историю плана main",
          "Профиль качества дополнен speech-native и обёрткой tools/speech-checks/test.mjs командой quality:apply",
          "Helper речи живёт в <данные>/speech с helper.json {version, sha256}; helper другой версии удаляется, модели и speech.json не трогаются",
          "npm ci — обязательный шаг перед install; без пакетов lock установка отказывает DEPENDENCY_MISSING до изменений",
          "Сценарий установленного экземпляра открывает настоящую панель (/): подставленный документ блокируется проверками local network access Chromium"
        ],
        "references": [
          "docs/planning/speech-integration.md",
          "docs/evidence/speech-integration-acceptance.md",
          "docs/planning/speech-input-integration.md",
          "docs/planning/speech-input-macos.md",
          "product-parts/system-service/clusters/deployment/modules/service-installer/module.md"
        ],
        "result": "Голосовой ввод feature/speech-input (5e990e3) перенесён в main коммитом задачи 719e22c; объединённый код проверен (Node 1384/1386 и 76/76, cargo, браузерные сценарии, настоящий Voxtral Q8/Q4/Q6 и полный путь до черновика); CLI работает без ws, установщик доставляет пакеты lock, notices и helper речи с политикой версии."
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
      "Код Speech из feature/speech-input (5e990e3) перенесён в main коммитом задачи; план, история, Kit runtime/bundle, настройки, версия и изменения M40 main сохранены; speech-проверки добавлены в профиль командой Kit",
      "Объединённый код проверен: typecheck, обе Node-группы, platform guard, проверки Kit, cargo test и debug-сборка helper, браузерные сценарии и настоящий Voxtral; результаты и ограничения записаны в docs/evidence/speech-integration-acceptance.md",
      "Установка из исходников выпуска доставляет зависимости времени выполнения, lock, helper (macOS ARM64) с политикой версии и лицензии; CLI работает без ws; установленный экземпляр 0.17.0 распознаёт русскую речь сквозным сценарием браузер → установленные assets → WebSocket → установленный helper → черновик",
      "CI четырёх платформ успешен для объединённого кода и для выпуска"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-17T15:57:59.700Z",
      "text": "Пользователь 17.11.2026: «После завершения своего текущего плана интегрируй Speech в main через merge ветки feature/speech-input… До сборки релиза проверь именно объединённый код… Сборку релиза начинай после успешной интеграции и необходимых проверок.» | Execution mode chosen by the user: sequential: Автоматический выбор по поручению run-E4-rDe1mHCmk: sequential (recommended by the plan; ревью: agreed)"
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
            "speech-native",
            "kit:doc-size",
            "kit:md-links"
          ],
          "evidence": [
            "docs/evidence/speech-integration-acceptance.md"
          ]
        },
        {
          "criterion": 1,
          "kind": "automatic",
          "checks": [
            "typecheck",
            "test",
            "platform-guard",
            "speech-native",
            "kit:doc-size",
            "kit:md-links"
          ],
          "evidence": [
            "docs/evidence/speech-integration-acceptance.md"
          ]
        },
        {
          "criterion": 2,
          "kind": "automatic",
          "checks": [
            "typecheck",
            "test",
            "platform-guard",
            "speech-native",
            "kit:doc-size",
            "kit:md-links",
            "installed-service"
          ],
          "evidence": [
            "docs/evidence/speech-integration-acceptance.md"
          ]
        },
        {
          "criterion": 3,
          "kind": "automatic",
          "checks": [
            "typecheck",
            "test",
            "platform-guard",
            "speech-native",
            "kit:doc-size",
            "kit:md-links"
          ],
          "evidence": [
            "docs/evidence/speech-integration-acceptance.md"
          ]
        }
      ],
      "ci": {
        "remote": "origin",
        "branch": "ci/speech-integration",
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
          "taskId": "T004",
          "effects": [
            "push ci/speech-integration в origin и ожидание CI четырёх платформ"
          ]
        },
        {
          "taskId": "T005",
          "effects": [
            "cargo build --release --locked speech-helper",
            "отдельный экземпляр WFK_DATA_DIR: node bin/wfk.mjs install, сквозной сценарий, остановка и удаление",
            "установка Workflow Kit 0.17.0 (node bin/wfk.mjs install) с helper в Application Support/Workflow Kit/speech и перезапуск службы"
          ]
        },
        {
          "taskId": "T006",
          "effects": [
            "push ci/speech-integration в origin и ожидание CI четырёх платформ"
          ]
        }
      ],
      "publication": {
        "branch": "main",
        "upstream": "origin/main"
      }
    },
    "baselineCommit": "1b2ee5eeb8068f946ef6fa64f428cc8d3a6af945",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/speech-integration.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-17T15:57:59.700Z",
        "text": "Перенос — git merge --squash в задаче T001 и commit --task: Kit отклоняет прямой коммит слияния, а ревизии отдельного плана Speech не должны попасть в историю плана main; ветка feature/speech-input сохраняется"
      },
      {
        "at": "2026-11-17T15:57:59.700Z",
        "text": "Профиль качества main дополнен проверкой speech-native и обёрткой tools/speech-checks/test.mjs командой quality:apply (8cafd65)"
      },
      {
        "at": "2026-11-17T15:57:59.700Z",
        "text": "Живые проверки микрофона, разрешений, Safari и sleep/wake не входят в автоматическую приёмку и записываются как непроверенные"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "25cedd72-7908-49d9-9f21-79cfca178443",
      "strategy": "sequential"
    },
    "id": "speech-integration",
    "objective": "Голосовой ввод из feature/speech-input перенесён в main с сохранением плана, истории и Kit main, объединённый код проверен, установщик доставляет helper, зависимости и лицензии, выпущена 0.17.0.",
    "spec": "docs/planning/speech-integration.md",
    "status": "ACTIVE",
    "proposal": {
      "digest": "ef6d64a240469784aac7a68a99ee7183ce3910a7788fe7bc62e06b81ff708019",
      "generation": 2
    },
    "authorization": {
      "accept": true,
      "acceptancePolicy": "automatic",
      "at": "2026-11-17T15:58:01.392Z",
      "ci": {
        "remote": "origin",
        "branch": "ci/speech-integration",
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
          "taskId": "T004",
          "effects": [
            "push ci/speech-integration в origin и ожидание CI четырёх платформ"
          ]
        },
        {
          "taskId": "T005",
          "effects": [
            "cargo build --release --locked speech-helper",
            "отдельный экземпляр WFK_DATA_DIR: node bin/wfk.mjs install, сквозной сценарий, остановка и удаление",
            "установка Workflow Kit 0.17.0 (node bin/wfk.mjs install) с helper в Application Support/Workflow Kit/speech и перезапуск службы"
          ]
        },
        {
          "taskId": "T006",
          "effects": [
            "push ci/speech-integration в origin и ожидание CI четырёх платформ"
          ]
        }
      ],
      "mode": "full",
      "note": "Full autopilot run run-E4-rDe1mHCmk: the user's direct instruction «После завершения своего текущего плана интегрируй Speech в main через merge ветки feature/speech-input.\n\nДерево Speech: /Users/oleksandroliinyk/VSCODE/Workflow_Kit_Speech\nБаза: bbab32d72f8a899cc6a01a0» (2026-11-17T15:44:42.033Z) to prepare and carry out the plan",
      "ownerSession": "25cedd72-7908-49d9-9f21-79cfca178443",
      "proposalDigest": "ef6d64a240469784aac7a68a99ee7183ce3910a7788fe7bc62e06b81ff708019",
      "publication": {
        "branch": "main",
        "upstream": "origin/main"
      },
      "revision": 1,
      "revoked": null,
      "runId": "run-E4-rDe1mHCmk",
      "source": "user-command"
    }
  },
  "tasks": [
    {
      "acceptance": [
        "Main содержит изменения feature/speech-input 5e990e3 со всеми точками совмещения: package.json и lock, cli, http-server upgrade, composer, question-card, Settings, CI, tsconfig, общие документы",
        "План, .harness/workflow, версия 0.16.0 и изменения M40 main сохранены; README, OVERVIEW и OS-MATRIX не больше 28 000 байт",
        "Коммит проходит typecheck, test (обёртка), platform-guard, speech-native и проверки Kit"
      ],
      "checks": [
        "speech-native"
      ],
      "commitMessage": "feat: integrate speech input from feature/speech-input 5e990e3",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/speech-integration.md",
          "required": true,
          "heading": "2.1. T001: перенос"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        ".github/workflows/ci.yml",
        "README.md",
        "THIRD_PARTY_NOTICES.md",
        "docs/architecture/OS-MATRIX.md",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/speech-input-acceptance.md",
        "docs/planning/speech-input-integration.md",
        "docs/planning/speech-input-macos.md",
        "docs/planning/speech-input/handoff-1.md",
        "docs/planning/speech-input/handoff-2.md",
        "docs/planning/speech-input/handoff-3.md",
        "docs/planning/speech-input/handoff-4.md",
        "package-lock.json",
        "package.json",
        "product-parts/backend-core/clusters/http-api/modules/http-server/module.md",
        "product-parts/backend-core/clusters/http-api/modules/http-server/src/server.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/settings.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/speech-settings.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/styles.css",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/autopiloting-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/speech-settings.browser.mjs",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/speech.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/question-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/run-browser.mjs",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/speech-composer.browser.mjs",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/speech-question.browser.mjs",
        "product-parts/speech-input",
        "tools/speech-checks/README.md",
        "tools/speech-checks/test.mjs",
        "tsconfig.json",
        "product-parts/speech-input/clusters/browser-input/cluster.md",
        "product-parts/speech-input/clusters/browser-input/modules/speech-input/module.md",
        "product-parts/speech-input/clusters/browser-input/modules/speech-input/src/capture.js",
        "product-parts/speech-input/clusters/browser-input/modules/speech-input/src/connection.js",
        "product-parts/speech-input/clusters/browser-input/modules/speech-input/src/dictation.js",
        "product-parts/speech-input/clusters/browser-input/modules/speech-input/src/field-model.js",
        "product-parts/speech-input/clusters/browser-input/modules/speech-input/src/index.ts",
        "product-parts/speech-input/clusters/browser-input/modules/speech-input/src/resampler.js",
        "product-parts/speech-input/clusters/browser-input/modules/speech-input/src/worklet.js",
        "product-parts/speech-input/clusters/browser-input/modules/speech-input/test/browser-model.test.ts",
        "product-parts/speech-input/clusters/browser-input/modules/speech-input/test/capture-negative.browser.mjs",
        "product-parts/speech-input/clusters/browser-input/modules/speech-input/test/real-browser.smoke.mjs",
        "product-parts/speech-input/clusters/browser-input/modules/speech-input/test/worklet.test.ts",
        "product-parts/speech-input/clusters/local-recognition/cluster.md",
        "product-parts/speech-input/clusters/local-recognition/modules/speech-helper/.gitignore",
        "product-parts/speech-input/clusters/local-recognition/modules/speech-helper/Cargo.lock",
        "product-parts/speech-input/clusters/local-recognition/modules/speech-helper/Cargo.toml",
        "product-parts/speech-input/clusters/local-recognition/modules/speech-helper/module.md",
        "product-parts/speech-input/clusters/local-recognition/modules/speech-helper/src/main.rs",
        "product-parts/speech-input/clusters/local-recognition/modules/speech-helper/src/native.rs",
        "product-parts/speech-input/clusters/local-recognition/modules/speech-helper/src/protocol.rs",
        "product-parts/speech-input/clusters/local-recognition/modules/speech-helper/test/streaming.smoke.mjs",
        "product-parts/speech-input/clusters/local-recognition/modules/speech-service/module.md",
        "product-parts/speech-input/clusters/local-recognition/modules/speech-service/src/catalog.ts",
        "product-parts/speech-input/clusters/local-recognition/modules/speech-service/src/helper-client.ts",
        "product-parts/speech-input/clusters/local-recognition/modules/speech-service/src/index.ts",
        "product-parts/speech-input/clusters/local-recognition/modules/speech-service/src/model-store.ts",
        "product-parts/speech-input/clusters/local-recognition/modules/speech-service/src/routes.ts",
        "product-parts/speech-input/clusters/local-recognition/modules/speech-service/src/service.ts",
        "product-parts/speech-input/clusters/local-recognition/modules/speech-service/test/helper-client.test.ts",
        "product-parts/speech-input/clusters/local-recognition/modules/speech-service/test/model-store.test.ts",
        "product-parts/speech-input/clusters/local-recognition/modules/speech-service/test/runtime-switch.smoke.mjs",
        "product-parts/speech-input/clusters/local-recognition/modules/speech-service/test/service.test.ts",
        "product-parts/speech-input/product-part.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Перенос ветки Speech в main",
      "why": "Голосовой ввод готов в отдельной ветке"
    },
    {
      "acceptance": [
        "npm ci, typecheck, обе Node-группы, platform guard и проверки Kit пройдены на SHA T001",
        "cargo test --locked и debug-сборка helper пройдены",
        "Браузерные сценарии composer, question-card, Settings и негативные сценарии захвата пройдены в обеих темах",
        "Настоящий Voxtral: streaming до EOF, переключение Q8/Q4/Q6 и полный путь AudioWorklet → WebSocket → helper → черновик пройдены на отдельном экземпляре",
        "Evidence называет SHA, метрики и непроверенное: физический микрофон, разрешения, Safari, sleep/wake"
      ],
      "checks": [],
      "commitMessage": "test: verify the integrated speech input",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/speech-integration.md",
          "required": true,
          "heading": "2.2. T002: проверка объединённого кода"
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/speech-integration-acceptance.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Проверка объединённого кода",
      "why": "Проверки ветки Speech не доказывают объединённый код"
    },
    {
      "acceptance": [
        "cli загружает app.ts только для serve: install, doctor, hook, session и --version работают без ws; serve без ws завершается понятным сообщением и кодом 1",
        "Копия приложения содержит node_modules пакетов lock без dev, package-lock.json и THIRD_PARTY_NOTICES.md и не содержит каталогов target; нет пакета в источнике — DEPENDENCY_MISSING без побочных изменений; повторная установка из копии ничего не копирует",
        "На macOS ARM64 release helper заменяется атомарно с helper.json {version, sha256} и notices; без нового артефакта прежний helper остаётся только при совпадении версии и sha256, иначе удаляется с предупреждением; ошибка замены удаляет helper; модели и speech.json сохраняются; uninstall удаляет helper; Linux, Windows и Intel ничего не копируют",
        "doctor --installed проверяет зависимости копии и helper с его версией на macOS ARM64",
        "Тесты: модульные с внедрёнными darwin, linux, win32 и arm64/x64; отдельным процессом с WFK_DATA_DIR без ws — --version, настоящий install с DEPENDENCY_MISSING и пустым каталогом данных, doctor --installed с отсутствующим ws",
        "installed-browser.smoke.mjs ведёт синтетический MediaStream через assets и WebSocket установленного экземпляра в черновик без отправки; module.md и OS-MATRIX обновлены"
      ],
      "checks": [],
      "commitMessage": "feat: install speech helper, runtime dependencies and notices",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/speech-integration.md",
          "required": true,
          "heading": "2.3. T003: доставка в установленное приложение (`service-installer`, `cli`)"
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/runtime/modules/cli/src/index.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/commands.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/test",
        "product-parts/system-service/clusters/deployment/modules/service-installer",
        "product-parts/speech-input/clusters/browser-input/modules/speech-input/test/installed-browser.smoke.mjs",
        "product-parts/speech-input/clusters/browser-input/modules/speech-input/module.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/missing-dependency-process.test.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/module.md",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/context.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/deploy.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/doctor.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/fs.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/install.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/run.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/runtime-payload.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/types.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/fakes.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/payload-doctor.test.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/payload-fixtures.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/runtime-payload.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Загрузка CLI без ws и доставка helper, зависимостей и лицензий",
      "why": "Установленная служба без ws не запустится, а helper не доставляется"
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
        "docs/planning/speech-integration.md",
        "THIRD_PARTY_NOTICES.md",
        "docs/architecture/OS-MATRIX.md",
        "docs/evidence/speech-input-acceptance.md",
        "docs/planning/speech-input-integration.md",
        "docs/planning/speech-input-macos.md",
        "docs/planning/speech-input/handoff-1.md",
        "docs/planning/speech-input/handoff-2.md",
        "docs/planning/speech-input/handoff-3.md",
        "docs/planning/speech-input/handoff-4.md",
        "product-parts/backend-core/clusters/http-api/modules/http-server/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/speech.md",
        "tools/speech-checks/README.md",
        "docs/evidence/speech-integration-acceptance.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/commands.md",
        "product-parts/speech-input/clusters/browser-input/modules/speech-input/module.md",
        "docs/architecture/HTTP-CONTRACTS.md",
        "docs/installation.md",
        "docs/setup.md"
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
        "CI на ci/speech-integration успешен для точного SHA на macOS ARM64, Linux x64, Windows x64 и Windows ARM64"
      ],
      "checks": [],
      "commitMessage": "test: verify the speech integration on four CI platforms",
      "confirmation": "Autopilot run run-E4-rDe1mHCmk (authorization 1, user-command, 2026-11-17T15:58:01.392Z): Full autopilot run run-E4-rDe1mHCmk: the user's direct instruction «После завершения своего текущего плана интегрируй Speech в main через merge ветки feature/speech-input.\n\nДерево Speech: /Users/oleksandroliinyk/VSCODE/Workflow_Kit_Speech\nБаза: bbab32d72f8a899cc6a01a0» (2026-11-17T15:44:42.033Z) to prepare and carry out the plan | effects: push ci/speech-integration в origin и ожидание CI четырёх платформ",
      "context": [
        {
          "path": "docs/planning/speech-integration.md",
          "required": true,
          "heading": "2.4. Поставка"
        }
      ],
      "dependencies": [
        "T003",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/speech-integration-acceptance.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "CI объединённого кода",
      "why": "Изменения должны работать на macOS, Linux и Windows до выпуска"
    },
    {
      "acceptance": [
        "Версия 0.17.0 собрана с release helper и установлена через node bin/wfk.mjs install из исходников выпуска; installed-service успешна; CHANGELOG и README называют 0.17.0",
        "Отдельный экземпляр (WFK_DATA_DIR, свободный порт, без WFK_SPEECH_HELPER и исходного target) после install проходит installed-browser.smoke.mjs с настоящим Q8: русский текст в черновике, отправок нет",
        "Evidence называет версию, пути копии и helper, sha256 helper и helper.json и результат сценария; обычная установленная служба сообщает доступность диктовки"
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: release Workflow Kit 0.17.0",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/speech-integration.md",
          "required": true,
          "heading": "2.4. Поставка"
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
        "docs/evidence/speech-integration-acceptance.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Поставка 0.17.0",
      "why": "Пользователь получает голосовой ввод"
    },
    {
      "acceptance": [
        "CI на ci/speech-integration успешен для точного SHA выпуска на macOS ARM64, Linux x64, Windows x64 и Windows ARM64"
      ],
      "checks": [],
      "commitMessage": "test: verify the 0.17.0 release on four CI platforms",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/speech-integration.md",
          "required": true,
          "heading": "2.4. Поставка"
        }
      ],
      "dependencies": [
        "T005",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/speech-integration-acceptance.md"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "CI выпуска",
      "why": "Выпуск должен работать на macOS, Linux и Windows"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: speech-integration (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Automation: 4 automatic, 0 manual criteria; CI origin ci/speech-integration (4 checks); publication main → origin/main
- Current task: none
- Progress: 5/7
- Revision: 1275

## Objective

Голосовой ввод из feature/speech-input перенесён в main с сохранением плана, истории и Kit main, объединённый код проверен, установщик доставляет helper, зависимости и лицензии, выпущена 0.17.0.

## Acceptance

- Код Speech из feature/speech-input (5e990e3) перенесён в main коммитом задачи; план, история, Kit runtime/bundle, настройки, версия и изменения M40 main сохранены; speech-проверки добавлены в профиль командой Kit
- Объединённый код проверен: typecheck, обе Node-группы, platform guard, проверки Kit, cargo test и debug-сборка helper, браузерные сценарии и настоящий Voxtral; результаты и ограничения записаны в docs/evidence/speech-integration-acceptance.md
- Установка из исходников выпуска доставляет зависимости времени выполнения, lock, helper (macOS ARM64) с политикой версии и лицензии; CLI работает без ws; установленный экземпляр 0.17.0 распознаёт русскую речь сквозным сценарием браузер → установленные assets → WebSocket → установленный helper → черновик
- CI четырёх платформ успешен для объединённого кода и для выпуска

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Перенос ветки Speech в main (work)
  - Commit: feat: integrate speech input from feature/speech-input 5e990e3
  - Files: .github/workflows/ci.yml, README.md, THIRD_PARTY_NOTICES.md, docs/architecture/OS-MATRIX.md, docs/architecture/OVERVIEW.md, docs/evidence/speech-input-acceptance.md, docs/planning/speech-input-integration.md, docs/planning/speech-input-macos.md, docs/planning/speech-input/handoff-1.md, docs/planning/speech-input/handoff-2.md, docs/planning/speech-input/handoff-3.md, docs/planning/speech-input/handoff-4.md, package-lock.json, package.json, product-parts/backend-core/clusters/http-api/modules/http-server/module.md, product-parts/backend-core/clusters/http-api/modules/http-server/src/server.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/settings.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/speech-settings.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/styles.css, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/autopiloting-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/speech-settings.browser.mjs, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/speech.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/question-card.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/run-browser.mjs, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/speech-composer.browser.mjs, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/speech-question.browser.mjs, product-parts/speech-input, tools/speech-checks/README.md, tools/speech-checks/test.mjs, tsconfig.json, product-parts/speech-input/clusters/browser-input/cluster.md, product-parts/speech-input/clusters/browser-input/modules/speech-input/module.md, product-parts/speech-input/clusters/browser-input/modules/speech-input/src/capture.js, product-parts/speech-input/clusters/browser-input/modules/speech-input/src/connection.js, product-parts/speech-input/clusters/browser-input/modules/speech-input/src/dictation.js, product-parts/speech-input/clusters/browser-input/modules/speech-input/src/field-model.js, product-parts/speech-input/clusters/browser-input/modules/speech-input/src/index.ts, product-parts/speech-input/clusters/browser-input/modules/speech-input/src/resampler.js, product-parts/speech-input/clusters/browser-input/modules/speech-input/src/worklet.js, product-parts/speech-input/clusters/browser-input/modules/speech-input/test/browser-model.test.ts, product-parts/speech-input/clusters/browser-input/modules/speech-input/test/capture-negative.browser.mjs, product-parts/speech-input/clusters/browser-input/modules/speech-input/test/real-browser.smoke.mjs, product-parts/speech-input/clusters/browser-input/modules/speech-input/test/worklet.test.ts, product-parts/speech-input/clusters/local-recognition/cluster.md, product-parts/speech-input/clusters/local-recognition/modules/speech-helper/.gitignore, product-parts/speech-input/clusters/local-recognition/modules/speech-helper/Cargo.lock, product-parts/speech-input/clusters/local-recognition/modules/speech-helper/Cargo.toml, product-parts/speech-input/clusters/local-recognition/modules/speech-helper/module.md, product-parts/speech-input/clusters/local-recognition/modules/speech-helper/src/main.rs, product-parts/speech-input/clusters/local-recognition/modules/speech-helper/src/native.rs, product-parts/speech-input/clusters/local-recognition/modules/speech-helper/src/protocol.rs, product-parts/speech-input/clusters/local-recognition/modules/speech-helper/test/streaming.smoke.mjs, product-parts/speech-input/clusters/local-recognition/modules/speech-service/module.md, product-parts/speech-input/clusters/local-recognition/modules/speech-service/src/catalog.ts, product-parts/speech-input/clusters/local-recognition/modules/speech-service/src/helper-client.ts, product-parts/speech-input/clusters/local-recognition/modules/speech-service/src/index.ts, product-parts/speech-input/clusters/local-recognition/modules/speech-service/src/model-store.ts, product-parts/speech-input/clusters/local-recognition/modules/speech-service/src/routes.ts, product-parts/speech-input/clusters/local-recognition/modules/speech-service/src/service.ts, product-parts/speech-input/clusters/local-recognition/modules/speech-service/test/helper-client.test.ts, product-parts/speech-input/clusters/local-recognition/modules/speech-service/test/model-store.test.ts, product-parts/speech-input/clusters/local-recognition/modules/speech-service/test/runtime-switch.smoke.mjs, product-parts/speech-input/clusters/local-recognition/modules/speech-service/test/service.test.ts, product-parts/speech-input/product-part.md
- [DONE] T002 — Проверка объединённого кода (work)
  - Commit: test: verify the integrated speech input
  - Files: docs/evidence/speech-integration-acceptance.md
  - Depends on: T001
- [DONE] T003 — Загрузка CLI без ws и доставка helper, зависимостей и лицензий (work)
  - Commit: feat: install speech helper, runtime dependencies and notices
  - Files: product-parts/backend-core/clusters/runtime/modules/cli/src/index.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/commands.md, product-parts/backend-core/clusters/runtime/modules/cli/test, product-parts/system-service/clusters/deployment/modules/service-installer, product-parts/speech-input/clusters/browser-input/modules/speech-input/test/installed-browser.smoke.mjs, product-parts/speech-input/clusters/browser-input/modules/speech-input/module.md, docs/architecture/OS-MATRIX.md, product-parts/backend-core/clusters/runtime/modules/cli/test/missing-dependency-process.test.ts, product-parts/system-service/clusters/deployment/modules/service-installer/module.md, product-parts/system-service/clusters/deployment/modules/service-installer/src/context.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/deploy.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/doctor.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/fs.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/install.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/run.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/runtime-payload.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/types.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/fakes.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/payload-doctor.test.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/payload-fixtures.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/runtime-payload.test.ts
  - Depends on: T002
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/speech-integration.md, THIRD_PARTY_NOTICES.md, docs/architecture/OS-MATRIX.md, docs/evidence/speech-input-acceptance.md, docs/planning/speech-input-integration.md, docs/planning/speech-input-macos.md, docs/planning/speech-input/handoff-1.md, docs/planning/speech-input/handoff-2.md, docs/planning/speech-input/handoff-3.md, docs/planning/speech-input/handoff-4.md, product-parts/backend-core/clusters/http-api/modules/http-server/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/speech.md, tools/speech-checks/README.md, docs/evidence/speech-integration-acceptance.md, product-parts/backend-core/clusters/runtime/modules/cli/commands.md, product-parts/speech-input/clusters/browser-input/modules/speech-input/module.md, docs/architecture/HTTP-CONTRACTS.md, docs/installation.md, docs/setup.md
  - Depends on: T001, T002, T003
- [DONE] T004 — CI объединённого кода (delivery)
  - Commit: test: verify the speech integration on four CI platforms
  - Files: docs/evidence/speech-integration-acceptance.md
  - Depends on: T003, DOCS-R1
- [TODO] T005 — Поставка 0.17.0 (delivery)
  - Commit: chore: release Workflow Kit 0.17.0
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/evidence/speech-integration-acceptance.md
  - Depends on: T004, DOCS-R1
- [TODO] T006 — CI выпуска (delivery)
  - Commit: test: verify the 0.17.0 release on four CI platforms
  - Files: docs/evidence/speech-integration-acceptance.md
  - Depends on: T005, DOCS-R1

Digest: Голосовой ввод feature/speech-input (5e990e3) перенесён в main коммитом задачи 719e22c; объединённый код проверен (Node 1384/1386 и 76/76, cargo, браузерные сценарии, настоящий Voxtral Q8/Q4/Q6 и полный путь до черновика); CLI работает без ws, установщик доставляет пакеты lock, notices и helper речи с политикой версии.

State changes only through `scripts/workflow` commands. History lives in Git.
