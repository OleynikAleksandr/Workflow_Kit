# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-13T17:02:09.556Z",
    "scopeId": "m26-native-session-controls"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 879,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "Shared FIFO for parameters/send/Stop; UUID/session/epoch/deadline, stable frame and independent ACK/read-back.",
          "Trusted native hook guard runs before channel/autopilot; queued messages preserved exactly once.",
          "Discriminated claude-controls/effort-card; Ultracode only Claude; explicit HTTP 400/409/503/504.",
          "Design QA passed; common ES/CSS with nested keyboard/touch menus; Windows live remains pending."
        ],
        "decisions": [
          "Session-local PTY controls only; minimum 2.1.323 plus known frame; old/external hosts read-only.",
          "Effort is a nested list; Ultracode is separate; fast account prohibition is preserved.",
          "Native T006 used one Sonnet/high/fast=false turn; T007 has at most one remaining turn.",
          "README and setup/usage/installation fully read; versioned guide changes ship in T007.",
          "User authorized autonomous execution through release; acceptance/closing/main publication remain separate."
        ],
        "references": [
          "README.md",
          "docs/planning/M27-claude-native-controls.md",
          "docs/design/M27-claude-controls-facts.md",
          "docs/design/M27-claude-control-contract.md",
          "docs/design/M27/claude-native-channel.md",
          "docs/design/M27/claude-visual-reference.md",
          "docs/evidence/M27-claude-native-controls.md",
          "design-qa.md"
        ],
        "result": "M27: native model/effort/Ultracode/mode, guarded transactions and Claude menus implemented. Native roundtrip, queue and visual QA passed; release 0.13.0 and CI remain T007/T008."
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
      "T001 доказала session-local model И effort и все native-доступные опции; таблица/хуки/эталон заполнены. Иначе task:block без commit T001; урезание scope только по решению пользователя.",
      "Модель/effort/fast/mode и представление ultra/Ultracode соответствуют доказательствам T001; native запреты не обходятся, остальные сессии/defaults/история/ввод сохраняются.",
      "Controls соответствуют тёмному RC-эталону Claude Desktop; light проверена по токенам, обе темы/раскладка/keyboard/touch/thumb drag и quiet success проверены, visual QA passed без заявления неподтверждённой светлой pixel fidelity.",
      "ChatGPT/Kimi и Stop/send/очередь/statusline/лимиты не регрессировали; контракты и матрица трёх ОС согласованы.",
      "0.13.0 установлена и проверена, CI точного SHA зелёная на macOS/Linux/Windows x64/ARM64; пользовательская приёмка отдельно."
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-13T17:33:21.666Z",
      "text": "Пользователь: «А теперь давай разберемся и сделаем то же самое для Claude!»; в панели выбраны спецификация и план с ревью. | Execution mode chosen by the user: sequential: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
    },
    "baselineCommit": "62e013eb90418a83f50c909cc014061bd1dc8801",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/design/M27-claude-controls-facts.md",
        "required": true,
        "heading": "4. Таблица управления (заполняет T001)"
      },
      {
        "path": "docs/design/M27-claude-control-contract.md",
        "required": true,
        "heading": "Обязательные гарантии"
      }
    ],
    "decisions": [
      {
        "at": "2026-11-13T17:33:21.666Z",
        "text": "Спецификация и план с ревью; задачи не запускать до решения панели."
      },
      {
        "at": "2026-11-13T17:33:21.666Z",
        "text": "Session-local model И effort обязательны; native-доступный speed/mode/Ultracode без доказанного канала — блокер, не отключаемая недоработка."
      },
      {
        "at": "2026-11-13T17:33:21.666Z",
        "text": "При блокере T001: task:block без commit; продолжение после устранения пользователем и task:unblock либо согласованного пересмотра."
      },
      {
        "at": "2026-11-13T17:33:21.666Z",
        "text": "T001 сначала проверяет канал/defaults/hooks в штатном временном Kit-проекте, потом запрашивает ручные PNG/обратную смену; scoped trust и cleanup явно разрешены только ему."
      },
      {
        "at": "2026-11-13T17:33:21.666Z",
        "text": "Первичный визуальный эталон — тёмное Remote Control-представление тестовой беседы в Claude Desktop Code; светлая тема без PNG проверяется только по токенам."
      },
      {
        "at": "2026-11-13T17:33:21.666Z",
        "text": "Ultracode/raw ultra/base effort и UI устанавливает T001; не подменять наблюдение предположением о шестой позиции или boolean."
      },
      {
        "at": "2026-11-13T17:33:21.666Z",
        "text": "T002 только переносит send/Stop под общий арбитр без изменения поведения, T003 добавляет setter и защищённую корреляцию hooks."
      },
      {
        "at": "2026-11-13T17:33:21.666Z",
        "text": "Все обязательные контексты имеют required:true; DOCS полностью перечитывает README и сверяет README/setup/usage/installation."
      },
      {
        "at": "2026-11-13T17:33:21.666Z",
        "text": "Бюджет inference: максимум 2 Sonnet fast=false хода T001 и 2 суммарно T006/T007, включая bootstrap; требуется прямое применимое разрешение пользователя, metadata fast без генерации."
      },
      {
        "at": "2026-11-13T17:33:21.666Z",
        "text": "Допуск по минимальной версии и распознанным capabilities/frame, не точному 2.1.323; неизвестная форма отказывает. Windows CI отдельно от живой приёмки."
      },
      {
        "at": "2026-11-13T17:33:21.666Z",
        "text": "Все work parallelSafe:false, sequential/maxWorkers1; local delivery, CI exact SHA, приёмка/закрытие и main publication разделены."
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": "01a1d50b-6999-7022-81c9-9f604ceea169",
      "strategy": "sequential"
    },
    "id": "m27-claude-native-controls",
    "objective": "Управлять моделью, усилием, скоростью и режимом доступа той же нативной беседы Claude из диалога Workflow Kit с родным интерфейсом и подтверждённым эффектом",
    "spec": "docs/planning/M27-claude-native-controls.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Сначала дешёвые probes model И effort и всех native-доступных опций: та же session-local история, native read-back/persistence, capability floor/signature и raw ultra/base effort; модель/effort обязаны PASS, остальные PASS либо доказанное NATIVE_UNAVAILABLE.",
        "Любой BLOCKED/PENDING обязательной строки или противоречие native UI/state: task:block --reason без commit T001; продолжение только после решения пользователя и task:unblock либо пересмотра scope.",
        "Пробы через public provider.createSession/startSessionProcess в уникальном Kit-проекте с настоящими hooks, expect/ConPTY, --settings и Remote Control; записаны реальные hooks каждой команды и эффект на sentinel queue/autopilot.",
        "Допустимы штатные trust/hooks только пробного проекта; archive/stop/purge убирают собственные локальные данные/trust/process. Серверные RC-карточки архивируются отдельно нативно с подтверждением; чужие записи/defaults/авторизация не меняются.",
        "После канального proof получены composer/model/effort/fast/mode/disabled dark PNG основной RC-поверхности с версиями/DPR/замерами; при недоступном read-only захвате нужны действия пользователя и несколько ходов. Light без PNG только token QA.",
        "Заполнены адресуемые facts §4/§5 и visual contract, включая ultra и minimum-version+signature. Inference только по facts §6: Sonnet fast=false, максимум2 хода с bootstrap и применимым прямым согласием; нет платной fast/Fable генерации."
      ],
      "checks": [],
      "commitMessage": "docs: verify Claude native parameter controls",
      "confirmation": null,
      "context": [
        {
          "path": "docs/design/M27-claude-controls-facts.md",
          "required": true
        },
        {
          "path": "docs/design/M27/claude-visual-reference.md",
          "required": true,
          "heading": "Визуальный контракт (заполняет T001)"
        },
        {
          "path": "docs/design/M27-claude-control-contract.md",
          "required": true,
          "heading": "Обязательные гарантии"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "docs/planning/M27-claude-native-controls.md",
        "docs/design/M27-claude-controls-facts.md",
        "docs/design/M27-claude-control-contract.md",
        "docs/design/M27",
        "docs/evidence/M27-claude-native-controls.md",
        "docs/evidence/M27",
        "docs/design/M27/claude-visual-reference.md",
        "docs/design/M27/claude-native-channel.md",
        "docs/design/M27/native-composer-dark.png",
        "docs/design/M27/native-disabled-dark.png",
        "docs/design/M27/native-effort-dark.png",
        "docs/design/M27/native-fast-dark.png",
        "docs/design/M27/native-mode-dark.png",
        "docs/design/M27/native-model-dark.png",
        "docs/design/M27/native-more-models-dark.png",
        "docs/evidence/M27/before-final-cleanup.json",
        "docs/evidence/M27/extra-probe-inference.json",
        "docs/evidence/M27/final-native-cleanup.json",
        "docs/evidence/M27/generic-message-control-regression.json",
        "docs/evidence/M27/local-cleanup.json",
        "docs/evidence/M27/more-models-queue-probe.json",
        "docs/evidence/M27/native-ax-helper.md",
        "docs/evidence/M27/native-gui-roundtrip.json",
        "docs/evidence/M27/native-probe-observations.json",
        "docs/evidence/M27/normalized-controls-probe.json",
        "docs/evidence/M27/normalized-model-mode.json",
        "docs/evidence/M27/normalized-native-direct.json",
        "docs/evidence/M27/normalized-terminal-probe.json",
        "docs/evidence/M27/probe-harness.md",
        "docs/evidence/M27/queue-during-all-controls.json",
        "docs/evidence/M27/second-local-cleanup.json"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Доказать управление сессией Claude и зафиксировать нативные эталоны",
      "why": "Доказать управление сессией Claude и зафиксировать нативные эталоны"
    },
    {
      "acceptance": [
        "Единый арбитр существующего native host управляет send/Stop; новых parameter setters и изменений пользовательского поведения в этой задаче нет.",
        "Существующие interrupt*/direct тесты проходят без ослабления assertions, deadlines и гарантий; race send/Stop не теряет, не дублирует сообщение и не нарушает барьер.",
        "Проверены expect macOS/Linux и ConPTY injected win32, отмена/выход/ошибки host; контракты/OS matrix обновлены."
      ],
      "checks": [],
      "commitMessage": "refactor(claude): share native send and interrupt arbitration",
      "confirmation": null,
      "context": [
        {
          "path": "docs/design/M27-claude-controls-facts.md",
          "required": true,
          "heading": "4. Таблица управления (заполняет T001)"
        },
        {
          "path": "docs/design/M27-claude-control-contract.md",
          "required": true,
          "heading": "2.5. Native control и конкурентность"
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host",
        "docs/design/M27-claude-control-contract.md",
        "docs/architecture/OVERVIEW.md",
        "docs/architecture/CONTRACTS.md",
        "docs/evidence/M27-claude-native-controls.md",
        "docs/evidence/M27",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/interrupt.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/interrupt.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/native-arbiter.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/direct.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/native-arbiter.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/test/native-arbiter.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Объединить существующие send и Stop общим арбитром",
      "why": "Объединить существующие send и Stop общим арбитром"
    },
    {
      "acceptance": [
        "Только канал T001, UUID/session/epoch/deadline и независимый native read-back; minimum-version+совместимая сигнатура допускают новый patch, неизвестная форма/старый floor отказывают.",
        "До записи подтверждены пустой idle и отсутствие чужого диалога/транзакции; busy/draft/stale/unknown отказывают, нет LLM-подмены, kill/restart или retries.",
        "Для реально наблюдённых T001 hooks введена проверенная корреляция pending control, не только префикс prompt. Не вызываются beginTurn/autopilot, не забираются queue/ack и не снимается барьер; похожая обычная реплика не получает привилегию.",
        "Sentinel сообщение, поставленное до/во время control, сохраняется и после операции доставляется ровно один раз. Race parameters/send/Stop и interrupt*/direct тесты проходят без ослабления.",
        "Общий контроллер работает через expect macOS/Linux и ConPTY Windows, injected linux/win32 и ошибки покрыты, source invariants/hooks/backend contract/allowlist/OS matrix согласованы."
      ],
      "checks": [],
      "commitMessage": "feat(claude): add verified native parameter transactions",
      "confirmation": null,
      "context": [
        {
          "path": "docs/design/M27-claude-controls-facts.md",
          "required": true,
          "heading": "4. Таблица управления (заполняет T001)"
        },
        {
          "path": "docs/design/M27-claude-control-contract.md",
          "required": true,
          "heading": "2.5. Native control и конкурентность"
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host",
        "tools/platform-guard/allowlist.json",
        "docs/design/M27-claude-control-contract.md",
        "docs/architecture/OVERVIEW.md",
        "docs/architecture/CONTRACTS.md",
        "docs/evidence/M27-claude-native-controls.md",
        "docs/evidence/M27",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/native-statusline.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/native-statusline.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/interrupt.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/native-parameters.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameter-settings.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-worker.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt.tcl",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-files.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-protocol.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-screen.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/records.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/native-parameters.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-engine.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/context.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/screen.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/native-hook.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Добавить native setters и корреляцию служебных hooks",
      "why": "Добавить native setters и корреляцию служебных hooks"
    },
    {
      "acceptance": [
        "Reader/catalog/state соответствуют facts §4 и raw ultra mapping: базовый effort не угадывается, неизвестность явно объяснена. GET без программ/меню, stale/старые host с причиной.",
        "updateParameters меняет одно поле одной сессии, проверяет native доступность/confirmed, перечитывает весь набор и сохраняет unrelated поля/defaults; аудит effective old/new.",
        "claude-controls и условная схема Ultracode следуют proof T001; effort-card/access обратно совместимы с layout guards. Codex отклоняет чужой ultracode также в mixed запросе, не игнорирует его.",
        "400/409/503/504 явно отображаются HTTP-слоем, ownership/очередь и busy/stale/timeout/запреты покрыты тестами; statusline wrapper, контракты и три ОС согласованы."
      ],
      "checks": [],
      "commitMessage": "feat(parameters): expose effective Claude session controls",
      "confirmation": null,
      "context": [
        {
          "path": "docs/design/M27-claude-controls-facts.md",
          "required": true,
          "heading": "4. Таблица управления (заполняет T001)"
        },
        {
          "path": "docs/design/M27-claude-control-contract.md",
          "required": true,
          "heading": "2.4. Общий контракт и HTTP"
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "docs/design/M27-claude-control-contract.md",
        "docs/architecture/OVERVIEW.md",
        "docs/architecture/CONTRACTS.md",
        "docs/evidence/M27-claude-native-controls.md",
        "docs/evidence/M27",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/access-menu.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameter-controls.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameters.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/programs.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-protocol.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-controls.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/parameter-update.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/parameter-values.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/parameter-access.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/parameters.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameter-routes.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameters.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/parameters.test.ts"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Подключить каталоги, эффективный state и HTTP изменения Claude",
      "why": "Подключить каталоги, эффективный state и HTTP изменения Claude"
    },
    {
      "acceptance": [
        "Presentation выбирается по layout; геометрия/сценарии/положение ultra/Ultracode строго как в заполненном native эталоне T001. Несогласованность с state — блокер, не выбор дизайна. Plan не дублируется независимым режимом.",
        "Один popup, причины недоступности/подтверждения/ошибки видны; quiet success без технических notes, контекст/лимиты и рабочий composer сохранены.",
        "Настоящий thumb drag, keyboard, touch44, visualViewport и переносы работают; polling/POST/stale не теряют draft/focus и не откатывают state.",
        "ChatGPT M26/R2 и Kimi fallback сохранены, общий ES/CSS для трёх ОС, контракты и OS matrix обновлены."
      ],
      "checks": [],
      "commitMessage": "feat(panel): add Claude native parameter controls",
      "confirmation": null,
      "context": [
        {
          "path": "docs/design/M27-claude-controls-facts.md",
          "required": true,
          "heading": "4. Таблица управления (заполняет T001)"
        },
        {
          "path": "docs/design/M27/claude-visual-reference.md",
          "required": true,
          "heading": "Визуальный контракт (заполняет T001)"
        },
        {
          "path": "docs/planning/M27-claude-native-controls.md",
          "required": true,
          "heading": "2.3. Контролы в composer"
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "docs/architecture/OVERVIEW.md",
        "docs/architecture/CONTRACTS.md",
        "docs/evidence/M27-claude-native-controls.md",
        "docs/evidence/M27",
        "docs/evidence/M26/fixes-composer.png",
        "docs/evidence/M27/claude-effort-source.png",
        "docs/evidence/M27/claude-effort-touch.png",
        "docs/evidence/M27/claude-mode-source.png",
        "docs/evidence/M27/claude-mode-touch.png",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/claude-controls.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/claude-menu.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/claude-controls.browser.js",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameter-controls.ts"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Добавить нативные контролы Claude в composer",
      "why": "Добавить нативные контролы Claude в composer"
    },
    {
      "acceptance": [
        "Подтверждены read-back/обратная смена/сохранение identity и defaults. Для нового хода: только Sonnet fast=false по facts §6, максимум2 хода суммарно T006/T007 и прямое разрешение; fast/Fable только metadata.",
        "Browser regression проверяет все поля, ошибки/подтверждения/quiet success, focus/draft, реальный drag из thumb центра до и после polling, cancel/выход за дорожку и touch.",
        "Раскладка Kit в dark/light на пяти размерах и200% проверена отдельно от pixel QA: только тёмный RC-эталон в том же размере/состоянии/DPR, совместное сравнение, P0/P1/P2 исправлены, design-qa.md passed; light без native PNG не заявлена совпадающей.",
        "Полный профиль и прежние interrupt*/direct/channel/autopilot/ChatGPT/Kimi проходят без ослабления. Windows — CI+ожидаемый live tester; нераспознанный ConPTY frame всегда отказывает. Артефакты и границы приёмки записаны."
      ],
      "checks": [],
      "commitMessage": "test(claude): verify native controls and visual fidelity",
      "confirmation": null,
      "context": [
        {
          "path": "docs/design/M27-claude-controls-facts.md",
          "required": true
        },
        {
          "path": "docs/design/M27/claude-visual-reference.md",
          "required": true,
          "heading": "Визуальный контракт (заполняет T001)"
        },
        {
          "path": "docs/planning/M27-claude-native-controls.md",
          "required": true,
          "heading": "4. Проверка и критерии готовности"
        }
      ],
      "dependencies": [
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "design-qa.md",
        "docs/design/M27-claude-control-contract.md",
        "docs/architecture/OVERVIEW.md",
        "docs/architecture/CONTRACTS.md",
        "docs/evidence/M27-claude-native-controls.md",
        "docs/evidence/M27",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host",
        "docs/design/M27/claude-visual-reference.md",
        "docs/design/M27-claude-controls-facts.md",
        "docs/evidence/M27/browser-responsive.json",
        "docs/evidence/M27/claude-effort-dark-1024x768.png",
        "docs/evidence/M27/claude-effort-dark-1280x800.png",
        "docs/evidence/M27/claude-effort-dark-1920x1080.png",
        "docs/evidence/M27/claude-effort-dark-375x667.png",
        "docs/evidence/M27/claude-effort-dark-640x400.png",
        "docs/evidence/M27/claude-effort-dark-768x400.png",
        "docs/evidence/M27/claude-effort-debug.png",
        "docs/evidence/M27/claude-effort-final.png",
        "docs/evidence/M27/claude-effort-light-1024x768.png",
        "docs/evidence/M27/claude-effort-light-1280x800.png",
        "docs/evidence/M27/claude-effort-light-1920x1080.png",
        "docs/evidence/M27/claude-effort-light-375x667.png",
        "docs/evidence/M27/claude-effort-light-640x400.png",
        "docs/evidence/M27/claude-effort-light-768x400.png",
        "docs/evidence/M27/claude-mode-dark-1024x768.png",
        "docs/evidence/M27/claude-mode-dark-1280x800.png",
        "docs/evidence/M27/claude-mode-dark-1920x1080.png",
        "docs/evidence/M27/claude-mode-dark-375x667.png",
        "docs/evidence/M27/claude-mode-dark-640x400.png",
        "docs/evidence/M27/claude-mode-dark-768x400.png",
        "docs/evidence/M27/claude-mode-debug.png",
        "docs/evidence/M27/claude-mode-final.png",
        "docs/evidence/M27/claude-mode-light-1024x768.png",
        "docs/evidence/M27/claude-mode-light-1280x800.png",
        "docs/evidence/M27/claude-mode-light-1920x1080.png",
        "docs/evidence/M27/claude-mode-light-375x667.png",
        "docs/evidence/M27/claude-mode-light-640x400.png",
        "docs/evidence/M27/claude-mode-light-768x400.png",
        "docs/evidence/M27/claude-more-dark-1024x768.png",
        "docs/evidence/M27/claude-more-dark-1280x800.png",
        "docs/evidence/M27/claude-more-dark-1920x1080.png",
        "docs/evidence/M27/claude-more-dark-375x667.png",
        "docs/evidence/M27/claude-more-dark-640x400.png",
        "docs/evidence/M27/claude-more-dark-768x400.png",
        "docs/evidence/M27/claude-more-debug.png",
        "docs/evidence/M27/claude-more-final.png",
        "docs/evidence/M27/claude-more-light-1024x768.png",
        "docs/evidence/M27/claude-more-light-1280x800.png",
        "docs/evidence/M27/claude-more-light-1920x1080.png",
        "docs/evidence/M27/claude-more-light-375x667.png",
        "docs/evidence/M27/claude-more-light-640x400.png",
        "docs/evidence/M27/claude-more-light-768x400.png",
        "docs/evidence/M27/effort-comparison-final.png",
        "docs/evidence/M27/effort-comparison-initial.png",
        "docs/evidence/M27/mode-comparison-final.png",
        "docs/evidence/M27/mode-comparison-initial.png",
        "docs/evidence/M27/more-comparison-final.png",
        "docs/evidence/M27/native-gui-back-production.json",
        "docs/evidence/M27/native-gui-final.json",
        "docs/evidence/M27/native-production-before-cache-fix.json",
        "docs/evidence/M27/native-production-cleanup.json",
        "docs/evidence/M27/native-production-final.json",
        "docs/evidence/M27/native-production-phase2.json",
        "docs/evidence/M27/native-production-roundtrip.json",
        "docs/evidence/M27/native-queue-during-production.json",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/claude-controls.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/claude-menu.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/info.svg",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/claude-controls.browser.js",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameter-controls.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-screen.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-controls.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-engine.test.ts"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Проверить native round trip, браузерные сценарии и визуальное совпадение",
      "why": "Проверить native round trip, браузерные сценарии и визуальное совпадение"
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
        "docs/planning/M27-claude-native-controls.md",
        "docs/design/M27-claude-controls-facts.md",
        "docs/design/M27-claude-control-contract.md",
        "docs/evidence/M27-claude-native-controls.md",
        "docs/design/M27/claude-visual-reference.md",
        "docs/architecture/CONTRACTS.md",
        "design-qa.md"
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
        "После DOCS, полностью перечитавшей README и сверившей README/setup/usage/installation, и подтверждения пользователя версии/CHANGELOG согласованы; штатная0.13.0 установлена, doctor installed ok, история документов не потеряна.",
        "Настоящий API/панель/установленный ES/CSS, новый/возобновлённый host и read-only старого проверены без рестарта рабочих/ревьюера. Native smoke без генерации либо остаток общего бюджета2 T006/T007 с согласия по facts §6.",
        "Evidence содержит команды/результаты/границы, коммит T007 — SHA поставки; задача не делает push, CI ожидается."
      ],
      "checks": [],
      "commitMessage": "chore(release): install Workflow Kit 0.13.0 locally",
      "confirmation": "Весь план выполняй самостоятельно без привлечения меня к каким-то выборам вплоть до сборки нового релиза, пожалуйста. Принимай все решения самостоятельно. Я совсем заранее согласен",
      "context": [
        {
          "path": "README.md",
          "required": true
        },
        {
          "path": "docs/design/M27-claude-controls-facts.md",
          "required": true,
          "heading": "6. Бюджет генерации и согласие"
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
        "README.md",
        "CHANGELOG.md",
        "docs/usage.md",
        "docs/installation.md",
        "docs/changelog",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M27-claude-native-controls.md",
        "docs/evidence/M27",
        "docs/setup.md",
        "docs/evidence/M27/claude-effort-installed-touch.png",
        "docs/evidence/M27/claude-effort-installed.png",
        "docs/evidence/M27/claude-mode-installed-touch.png",
        "docs/evidence/M27/claude-mode-installed.png",
        "docs/evidence/M27/claude-more-installed-touch.png",
        "docs/evidence/M27/claude-more-installed.png",
        "docs/evidence/M27/installed-browser.json",
        "docs/evidence/M27/installed-cleanup.json",
        "docs/evidence/M27/installed-health.json",
        "docs/evidence/M27/installed-legacy-hosts.json",
        "docs/evidence/M27/installed-native-roundtrip.json",
        "docs/evidence/M27/local-delivery.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Собрать и установить локальную поставку 0.13.0",
      "why": "Собрать и установить локальную поставку 0.13.0"
    },
    {
      "acceptance": [
        "До task:start проверены headSha T007 и success macOS/Linux/Windows x64/ARM64; ci/m27-claude-native-controls отправлена вне задач по прямой команде пользователя.",
        "Записаны SHA/URL/четыре результата CI; нет функциональных изменений или push из задачи, пользовательская приёмка/закрытие отдельно."
      ],
      "checks": [],
      "commitMessage": "docs: record green CI for Claude native controls",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T007",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M27-claude-native-controls.md"
      ],
      "fixes": null,
      "id": "T008",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Зафиксировать зелёную CI четырёх платформ на SHA поставки",
      "why": "Зафиксировать зелёную CI четырёх платформ на SHA поставки"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m27-claude-native-controls (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 8/9
- Revision: 879

## Objective

Управлять моделью, усилием, скоростью и режимом доступа той же нативной беседы Claude из диалога Workflow Kit с родным интерфейсом и подтверждённым эффектом

## Acceptance

- T001 доказала session-local model И effort и все native-доступные опции; таблица/хуки/эталон заполнены. Иначе task:block без commit T001; урезание scope только по решению пользователя.
- Модель/effort/fast/mode и представление ultra/Ultracode соответствуют доказательствам T001; native запреты не обходятся, остальные сессии/defaults/история/ввод сохраняются.
- Controls соответствуют тёмному RC-эталону Claude Desktop; light проверена по токенам, обе темы/раскладка/keyboard/touch/thumb drag и quiet success проверены, visual QA passed без заявления неподтверждённой светлой pixel fidelity.
- ChatGPT/Kimi и Stop/send/очередь/statusline/лимиты не регрессировали; контракты и матрица трёх ОС согласованы.
- 0.13.0 установлена и проверена, CI точного SHA зелёная на macOS/Linux/Windows x64/ARM64; пользовательская приёмка отдельно.

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Доказать управление сессией Claude и зафиксировать нативные эталоны (work)
  - Commit: docs: verify Claude native parameter controls
  - Files: docs/planning/M27-claude-native-controls.md, docs/design/M27-claude-controls-facts.md, docs/design/M27-claude-control-contract.md, docs/design/M27, docs/evidence/M27-claude-native-controls.md, docs/evidence/M27, docs/design/M27/claude-visual-reference.md, docs/design/M27/claude-native-channel.md, docs/design/M27/native-composer-dark.png, docs/design/M27/native-disabled-dark.png, docs/design/M27/native-effort-dark.png, docs/design/M27/native-fast-dark.png, docs/design/M27/native-mode-dark.png, docs/design/M27/native-model-dark.png, docs/design/M27/native-more-models-dark.png, docs/evidence/M27/before-final-cleanup.json, docs/evidence/M27/extra-probe-inference.json, docs/evidence/M27/final-native-cleanup.json, docs/evidence/M27/generic-message-control-regression.json, docs/evidence/M27/local-cleanup.json, docs/evidence/M27/more-models-queue-probe.json, docs/evidence/M27/native-ax-helper.md, docs/evidence/M27/native-gui-roundtrip.json, docs/evidence/M27/native-probe-observations.json, docs/evidence/M27/normalized-controls-probe.json, docs/evidence/M27/normalized-model-mode.json, docs/evidence/M27/normalized-native-direct.json, docs/evidence/M27/normalized-terminal-probe.json, docs/evidence/M27/probe-harness.md, docs/evidence/M27/queue-during-all-controls.json, docs/evidence/M27/second-local-cleanup.json
- [DONE] T002 — Объединить существующие send и Stop общим арбитром (work)
  - Commit: refactor(claude): share native send and interrupt arbitration
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host, docs/design/M27-claude-control-contract.md, docs/architecture/OVERVIEW.md, docs/architecture/CONTRACTS.md, docs/evidence/M27-claude-native-controls.md, docs/evidence/M27, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/interrupt.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/interrupt.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/native-arbiter.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/direct.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/native-arbiter.ts, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/test/native-arbiter.test.ts
  - Depends on: T001
- [DONE] T003 — Добавить native setters и корреляцию служебных hooks (work)
  - Commit: feat(claude): add verified native parameter transactions
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host, tools/platform-guard/allowlist.json, docs/design/M27-claude-control-contract.md, docs/architecture/OVERVIEW.md, docs/architecture/CONTRACTS.md, docs/evidence/M27-claude-native-controls.md, docs/evidence/M27, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/native-statusline.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/native-statusline.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/interrupt.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/native-parameters.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameter-settings.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-worker.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt.tcl, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-files.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-protocol.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-screen.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/records.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/native-parameters.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-engine.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/context.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/screen.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/native-hook.ts
  - Depends on: T002
- [DONE] T004 — Подключить каталоги, эффективный state и HTTP изменения Claude (work)
  - Commit: feat(parameters): expose effective Claude session controls
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/control-panel/clusters/web-panel/modules/session-chat, docs/design/M27-claude-control-contract.md, docs/architecture/OVERVIEW.md, docs/architecture/CONTRACTS.md, docs/evidence/M27-claude-native-controls.md, docs/evidence/M27, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/access-menu.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters-model.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameter-controls.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameters.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/programs.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-protocol.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-controls.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/parameter-update.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/parameter-values.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/parameter-access.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/parameters.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameter-routes.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameters.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/parameters.test.ts
  - Depends on: T003
- [DONE] T005 — Добавить нативные контролы Claude в composer (work)
  - Commit: feat(panel): add Claude native parameter controls
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, docs/architecture/OVERVIEW.md, docs/architecture/CONTRACTS.md, docs/evidence/M27-claude-native-controls.md, docs/evidence/M27, docs/evidence/M26/fixes-composer.png, docs/evidence/M27/claude-effort-source.png, docs/evidence/M27/claude-effort-touch.png, docs/evidence/M27/claude-mode-source.png, docs/evidence/M27/claude-mode-touch.png, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/claude-controls.css, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/claude-menu.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.css, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/claude-controls.browser.js, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameter-controls.ts
  - Depends on: T004
- [DONE] T006 — Проверить native round trip, браузерные сценарии и визуальное совпадение (work)
  - Commit: test(claude): verify native controls and visual fidelity
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/backend-core/clusters/runtime/modules/cli, design-qa.md, docs/design/M27-claude-control-contract.md, docs/architecture/OVERVIEW.md, docs/architecture/CONTRACTS.md, docs/evidence/M27-claude-native-controls.md, docs/evidence/M27, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host, docs/design/M27/claude-visual-reference.md, docs/design/M27-claude-controls-facts.md, docs/evidence/M27/browser-responsive.json, docs/evidence/M27/claude-effort-dark-1024x768.png, docs/evidence/M27/claude-effort-dark-1280x800.png, docs/evidence/M27/claude-effort-dark-1920x1080.png, docs/evidence/M27/claude-effort-dark-375x667.png, docs/evidence/M27/claude-effort-dark-640x400.png, docs/evidence/M27/claude-effort-dark-768x400.png, docs/evidence/M27/claude-effort-debug.png, docs/evidence/M27/claude-effort-final.png, docs/evidence/M27/claude-effort-light-1024x768.png, docs/evidence/M27/claude-effort-light-1280x800.png, docs/evidence/M27/claude-effort-light-1920x1080.png, docs/evidence/M27/claude-effort-light-375x667.png, docs/evidence/M27/claude-effort-light-640x400.png, docs/evidence/M27/claude-effort-light-768x400.png, docs/evidence/M27/claude-mode-dark-1024x768.png, docs/evidence/M27/claude-mode-dark-1280x800.png, docs/evidence/M27/claude-mode-dark-1920x1080.png, docs/evidence/M27/claude-mode-dark-375x667.png, docs/evidence/M27/claude-mode-dark-640x400.png, docs/evidence/M27/claude-mode-dark-768x400.png, docs/evidence/M27/claude-mode-debug.png, docs/evidence/M27/claude-mode-final.png, docs/evidence/M27/claude-mode-light-1024x768.png, docs/evidence/M27/claude-mode-light-1280x800.png, docs/evidence/M27/claude-mode-light-1920x1080.png, docs/evidence/M27/claude-mode-light-375x667.png, docs/evidence/M27/claude-mode-light-640x400.png, docs/evidence/M27/claude-mode-light-768x400.png, docs/evidence/M27/claude-more-dark-1024x768.png, docs/evidence/M27/claude-more-dark-1280x800.png, docs/evidence/M27/claude-more-dark-1920x1080.png, docs/evidence/M27/claude-more-dark-375x667.png, docs/evidence/M27/claude-more-dark-640x400.png, docs/evidence/M27/claude-more-dark-768x400.png, docs/evidence/M27/claude-more-debug.png, docs/evidence/M27/claude-more-final.png, docs/evidence/M27/claude-more-light-1024x768.png, docs/evidence/M27/claude-more-light-1280x800.png, docs/evidence/M27/claude-more-light-1920x1080.png, docs/evidence/M27/claude-more-light-375x667.png, docs/evidence/M27/claude-more-light-640x400.png, docs/evidence/M27/claude-more-light-768x400.png, docs/evidence/M27/effort-comparison-final.png, docs/evidence/M27/effort-comparison-initial.png, docs/evidence/M27/mode-comparison-final.png, docs/evidence/M27/mode-comparison-initial.png, docs/evidence/M27/more-comparison-final.png, docs/evidence/M27/native-gui-back-production.json, docs/evidence/M27/native-gui-final.json, docs/evidence/M27/native-production-before-cache-fix.json, docs/evidence/M27/native-production-cleanup.json, docs/evidence/M27/native-production-final.json, docs/evidence/M27/native-production-phase2.json, docs/evidence/M27/native-production-roundtrip.json, docs/evidence/M27/native-queue-during-production.json, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/claude-controls.css, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/claude-menu.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/info.svg, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/claude-controls.browser.js, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameter-controls.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-screen.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-controls.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-engine.test.ts
  - Depends on: T005
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M27-claude-native-controls.md, docs/design/M27-claude-controls-facts.md, docs/design/M27-claude-control-contract.md, docs/evidence/M27-claude-native-controls.md, docs/design/M27/claude-visual-reference.md, docs/architecture/CONTRACTS.md, design-qa.md
  - Depends on: T001, T002, T003, T004, T005, T006
- [DONE] T007 — Собрать и установить локальную поставку 0.13.0 (delivery)
  - Commit: chore(release): install Workflow Kit 0.13.0 locally
  - Files: package.json, package-lock.json, README.md, CHANGELOG.md, docs/usage.md, docs/installation.md, docs/changelog, docs/architecture/OVERVIEW.md, docs/evidence/M27-claude-native-controls.md, docs/evidence/M27, docs/setup.md, docs/evidence/M27/claude-effort-installed-touch.png, docs/evidence/M27/claude-effort-installed.png, docs/evidence/M27/claude-mode-installed-touch.png, docs/evidence/M27/claude-mode-installed.png, docs/evidence/M27/claude-more-installed-touch.png, docs/evidence/M27/claude-more-installed.png, docs/evidence/M27/installed-browser.json, docs/evidence/M27/installed-cleanup.json, docs/evidence/M27/installed-health.json, docs/evidence/M27/installed-legacy-hosts.json, docs/evidence/M27/installed-native-roundtrip.json, docs/evidence/M27/local-delivery.md
  - Depends on: T006, DOCS-R1
- [TODO] T008 — Зафиксировать зелёную CI четырёх платформ на SHA поставки (delivery)
  - Commit: docs: record green CI for Claude native controls
  - Files: docs/evidence/M27-claude-native-controls.md
  - Depends on: T007, DOCS-R1

Digest: M27: native model/effort/Ultracode/mode, guarded transactions and Claude menus implemented. Native roundtrip, queue and visual QA passed; release 0.13.0 and CI remain T007/T008.

State changes only through `scripts/workflow` commands. History lives in Git.
