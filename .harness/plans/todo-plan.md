# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 32,
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
      "Установка пишет раздел AGENTS.md между <!-- wfk:begin --> и <!-- wfk:end -->, CLAUDE.md (если нет), записи хука в .claude/settings.json и в конец .codex/hooks.json, блок .gitignore и манифест с хешами управляемых фрагментов; повтор идемпотентен",
      "Чужие разделы и маркеры (в том числе workflow-kit:begin/end Harness) и текст вне своих маркеров не меняются; тест на AGENTS.md и .codex/hooks.json с разделами Harness",
      "Проверка возвращает ok, missing, modified, outdated, newer; правка вне раздела Kit не меняет статус; невалидный JSON — отказ без перезаписи; CLAUDE.md без @AGENTS.md — предупреждение",
      "wfk hook session-start --client <c> ничего не печатает в stdout, находит проект по $CLAUDE_PROJECT_DIR или вверх от cwd, дописывает одну строку в .workflow-kit/local/sessions.jsonl с меткой WFK_SERVICE_SESSION, выходит с кодом 0 за 2 с; тест с подставным stdin",
      "wfk link ставит запускатель ~/.local/bin/wfk на текущий клон (разработка); тест на подставном HOME",
      "Ручная проверка пользователем: Визуально: карточка структуры «нет» → «Установить» → «ok»; правка внутри раздела Kit в AGENTS.md → «modified». Пользователь выполняет wfk link, начинает сессию Claude в папке проекта — строка появляется в журнале",
      "Раздел Kit в AGENTS.md описывает соглашение product-parts (раздел 7); установка создаёт product-parts/README.md, если каталога нет, и шаблоны .workflow-kit/templates/product-part.md, cluster.md, module.md, учтённые в манифесте; существующий код и существующий product-parts не меняются; тесты"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-05T15:48:07.572Z",
      "text": "Assignment m1-orchestrator-core-T003-1: task T003 of scope m1-orchestrator-core"
    },
    "baselineCommit": "3387e8a235bfc576f091c63fe27e41f5a0d071e5",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M1-orchestrator-core.md",
        "required": true,
        "heading": "7. Структура Kit в папке проекта (v1)"
      }
    ],
    "decisions": [],
    "delivery": "READY_FOR_ACCEPTANCE",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": null,
      "strategy": "sequential"
    },
    "id": "assignment-m1-orchestrator-core-T003-1",
    "objective": "Структура Kit v1, приём хука и wfk link: Kit записывает в папку свою структуру и узнаёт о сессиях через хук SessionStart",
    "spec": "docs/planning/M1-orchestrator-core.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Установка пишет раздел AGENTS.md между <!-- wfk:begin --> и <!-- wfk:end -->, CLAUDE.md (если нет), записи хука в .claude/settings.json и в конец .codex/hooks.json, блок .gitignore и манифест с хешами управляемых фрагментов; повтор идемпотентен",
        "Чужие разделы и маркеры (в том числе workflow-kit:begin/end Harness) и текст вне своих маркеров не меняются; тест на AGENTS.md и .codex/hooks.json с разделами Harness",
        "Проверка возвращает ok, missing, modified, outdated, newer; правка вне раздела Kit не меняет статус; невалидный JSON — отказ без перезаписи; CLAUDE.md без @AGENTS.md — предупреждение",
        "wfk hook session-start --client <c> ничего не печатает в stdout, находит проект по $CLAUDE_PROJECT_DIR или вверх от cwd, дописывает одну строку в .workflow-kit/local/sessions.jsonl с меткой WFK_SERVICE_SESSION, выходит с кодом 0 за 2 с; тест с подставным stdin",
        "wfk link ставит запускатель ~/.local/bin/wfk на текущий клон (разработка); тест на подставном HOME",
        "Ручная проверка пользователем: Визуально: карточка структуры «нет» → «Установить» → «ok»; правка внутри раздела Kit в AGENTS.md → «modified». Пользователь выполняет wfk link, начинает сессию Claude в папке проекта — строка появляется в журнале",
        "Раздел Kit в AGENTS.md описывает соглашение product-parts (раздел 7); установка создаёт product-parts/README.md, если каталога нет, и шаблоны .workflow-kit/templates/product-part.md, cluster.md, module.md, учтённые в манифесте; существующий код и существующий product-parts не меняются; тесты"
      ],
      "checks": [],
      "commitMessage": "feat: add kit structure installer and session start hook",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true,
          "heading": "7. Структура Kit в папке проекта (v1)"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/projects/modules/kit-structure",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/backend-core/clusters/runtime/modules/data-store",
        "product-parts/backend-core/clusters/http-api/modules/http-server",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "package.json",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/module.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/fragments.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/hook-config.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/index.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/markers.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/routes.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/session-hook.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/structure.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/templates.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/test/markers.test.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/test/session-hook.test.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/test/structure.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/hook.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/index.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/link.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/app.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/commands.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/hook-link.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/data-store/module.md",
        "product-parts/backend-core/clusters/runtime/modules/data-store/src/atomic.ts",
        "product-parts/backend-core/clusters/runtime/modules/data-store/src/index.ts",
        "product-parts/backend-core/clusters/runtime/modules/data-store/test/atomic.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/controls.css",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/structure-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Структура Kit v1, приём хука и wfk link",
      "why": "Kit записывает в папку свою структуру и узнаёт о сессиях через хук SessionStart"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m1-orchestrator-core-T003-1 (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 1/1
- Revision: 32

## Objective

Структура Kit v1, приём хука и wfk link: Kit записывает в папку свою структуру и узнаёт о сессиях через хук SessionStart

## Acceptance

- Установка пишет раздел AGENTS.md между <!-- wfk:begin --> и <!-- wfk:end -->, CLAUDE.md (если нет), записи хука в .claude/settings.json и в конец .codex/hooks.json, блок .gitignore и манифест с хешами управляемых фрагментов; повтор идемпотентен
- Чужие разделы и маркеры (в том числе workflow-kit:begin/end Harness) и текст вне своих маркеров не меняются; тест на AGENTS.md и .codex/hooks.json с разделами Harness
- Проверка возвращает ok, missing, modified, outdated, newer; правка вне раздела Kit не меняет статус; невалидный JSON — отказ без перезаписи; CLAUDE.md без @AGENTS.md — предупреждение
- wfk hook session-start --client <c> ничего не печатает в stdout, находит проект по $CLAUDE_PROJECT_DIR или вверх от cwd, дописывает одну строку в .workflow-kit/local/sessions.jsonl с меткой WFK_SERVICE_SESSION, выходит с кодом 0 за 2 с; тест с подставным stdin
- wfk link ставит запускатель ~/.local/bin/wfk на текущий клон (разработка); тест на подставном HOME
- Ручная проверка пользователем: Визуально: карточка структуры «нет» → «Установить» → «ok»; правка внутри раздела Kit в AGENTS.md → «modified». Пользователь выполняет wfk link, начинает сессию Claude в папке проекта — строка появляется в журнале
- Раздел Kit в AGENTS.md описывает соглашение product-parts (раздел 7); установка создаёт product-parts/README.md, если каталога нет, и шаблоны .workflow-kit/templates/product-part.md, cluster.md, module.md, учтённые в манифесте; существующий код и существующий product-parts не меняются; тесты

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T003 — Структура Kit v1, приём хука и wfk link (work)
  - Commit: feat: add kit structure installer and session start hook
  - Files: product-parts/backend-core/clusters/projects/modules/kit-structure, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/backend-core/clusters/runtime/modules/data-store, product-parts/backend-core/clusters/http-api/modules/http-server, product-parts/control-panel/clusters/web-panel/modules/panel-shell, package.json, product-parts/backend-core/clusters/projects/modules/kit-structure/module.md, product-parts/backend-core/clusters/projects/modules/kit-structure/src/fragments.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/src/hook-config.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/src/index.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/src/markers.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/src/routes.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/src/session-hook.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/src/structure.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/src/templates.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/test/markers.test.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/test/session-hook.test.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/test/structure.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/hook.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/index.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/link.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/app.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/commands.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/hook-link.test.ts, product-parts/backend-core/clusters/runtime/modules/data-store/module.md, product-parts/backend-core/clusters/runtime/modules/data-store/src/atomic.ts, product-parts/backend-core/clusters/runtime/modules/data-store/src/index.ts, product-parts/backend-core/clusters/runtime/modules/data-store/test/atomic.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/controls.css, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/structure-card.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts

State changes only through `scripts/workflow` commands. History lives in Git.
