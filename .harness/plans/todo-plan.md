# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 38,
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
      "install копирует bin, src, package.json в app/<версия>, пишет app/current.json, сохраняет пути node, claude, codex, expect и PATH login-shell, ставит запускатель wfk и значок, регистрирует автозапуск и запускает службу; повтор обновляет; uninstall снимает всё, кроме данных",
      "macOS: LaunchAgent с RunAtLoad, KeepAlive, AbandonProcessGroup, PATH и абсолютным node; Linux: systemd user unit с KillMode=process, без systemd — XDG autostart; Windows: ключ HKCU Run со скрытым окном; тесты проверяют файлы и команды для трёх ОС на подставном HOME",
      "service start, stop, status; статус службы и автозапуска отдаётся в «Систему» через src/index.ts модуля service-installer",
      "open: проверяет /api/health, при необходимости запускает службу, ждёт готовности и открывает панель в окне приложения (Chrome/Edge --app, иначе браузер); значок вызывает open",
      "doctor --installed проверяет установленную службу и /api/health",
      "Ручная проверка пользователем: Визуально (на dev-экземпляре с WFK_DATA_DIR и WFK_PORT, без регистрации автозапуска на Mac): карточка «Система» показывает службу, способ автозапуска и пути программ; open открывает панель в окне без вкладок"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-05T16:34:09.322Z",
      "text": "Assignment m1-orchestrator-core-T008-1: task T008 of scope m1-orchestrator-core"
    },
    "baselineCommit": "c81bf0aae75bcc62b70181638f61ec32113e9efc",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M1-orchestrator-core.md",
        "required": true
      }
    ],
    "decisions": [],
    "delivery": "READY_FOR_ACCEPTANCE",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": null,
      "strategy": "sequential"
    },
    "id": "assignment-m1-orchestrator-core-T008-1",
    "objective": "Установщик, автозапуск, запускатель и значок: Бэкенд разворачивается на любой ОС и стартует сам после входа в систему или при запуске интерфейса",
    "spec": "docs/planning/M1-orchestrator-core.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "install копирует bin, src, package.json в app/<версия>, пишет app/current.json, сохраняет пути node, claude, codex, expect и PATH login-shell, ставит запускатель wfk и значок, регистрирует автозапуск и запускает службу; повтор обновляет; uninstall снимает всё, кроме данных",
        "macOS: LaunchAgent с RunAtLoad, KeepAlive, AbandonProcessGroup, PATH и абсолютным node; Linux: systemd user unit с KillMode=process, без systemd — XDG autostart; Windows: ключ HKCU Run со скрытым окном; тесты проверяют файлы и команды для трёх ОС на подставном HOME",
        "service start, stop, status; статус службы и автозапуска отдаётся в «Систему» через src/index.ts модуля service-installer",
        "open: проверяет /api/health, при необходимости запускает службу, ждёт готовности и открывает панель в окне приложения (Chrome/Edge --app, иначе браузер); значок вызывает open",
        "doctor --installed проверяет установленную службу и /api/health",
        "Ручная проверка пользователем: Визуально (на dev-экземпляре с WFK_DATA_DIR и WFK_PORT, без регистрации автозапуска на Mac): карточка «Система» показывает службу, способ автозапуска и пути программ; open открывает панель в окне без вкладок"
      ],
      "checks": [],
      "commitMessage": "feat: add backend installer, autostart and launcher",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/system-service/clusters/deployment/modules/service-installer",
        "product-parts/system-service/clusters/deployment/modules/service-installer/module.md",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/commands.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/context.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/control.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/deploy.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/doctor.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/fs.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/index.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/install.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/integrate.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/layout.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/open.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/programs.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/run.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/status.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/templates.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/types.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/control.test.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/fakes.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/install.test.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/real-fs.test.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/templates.test.ts"
      ],
      "fixes": null,
      "id": "T008",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Установщик, автозапуск, запускатель и значок",
      "why": "Бэкенд разворачивается на любой ОС и стартует сам после входа в систему или при запуске интерфейса"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m1-orchestrator-core-T008-1 (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 1/1
- Revision: 38

## Objective

Установщик, автозапуск, запускатель и значок: Бэкенд разворачивается на любой ОС и стартует сам после входа в систему или при запуске интерфейса

## Acceptance

- install копирует bin, src, package.json в app/<версия>, пишет app/current.json, сохраняет пути node, claude, codex, expect и PATH login-shell, ставит запускатель wfk и значок, регистрирует автозапуск и запускает службу; повтор обновляет; uninstall снимает всё, кроме данных
- macOS: LaunchAgent с RunAtLoad, KeepAlive, AbandonProcessGroup, PATH и абсолютным node; Linux: systemd user unit с KillMode=process, без systemd — XDG autostart; Windows: ключ HKCU Run со скрытым окном; тесты проверяют файлы и команды для трёх ОС на подставном HOME
- service start, stop, status; статус службы и автозапуска отдаётся в «Систему» через src/index.ts модуля service-installer
- open: проверяет /api/health, при необходимости запускает службу, ждёт готовности и открывает панель в окне приложения (Chrome/Edge --app, иначе браузер); значок вызывает open
- doctor --installed проверяет установленную службу и /api/health
- Ручная проверка пользователем: Визуально (на dev-экземпляре с WFK_DATA_DIR и WFK_PORT, без регистрации автозапуска на Mac): карточка «Система» показывает службу, способ автозапуска и пути программ; open открывает панель в окне без вкладок

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T008 — Установщик, автозапуск, запускатель и значок (work, parallel-safe)
  - Commit: feat: add backend installer, autostart and launcher
  - Files: product-parts/system-service/clusters/deployment/modules/service-installer, product-parts/system-service/clusters/deployment/modules/service-installer/module.md, product-parts/system-service/clusters/deployment/modules/service-installer/src/commands.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/context.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/control.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/deploy.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/doctor.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/fs.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/index.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/install.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/integrate.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/layout.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/open.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/programs.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/run.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/status.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/templates.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/types.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/control.test.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/fakes.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/install.test.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/real-fs.test.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/templates.test.ts

State changes only through `scripts/workflow` commands. History lives in Git.
