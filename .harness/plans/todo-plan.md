# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 46,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "product-parts/backend-core/clusters/runtime/modules/cli/module.md (createApp, commands, system section)",
          "product-parts/backend-core/clusters/http-api/modules/http-server/module.md (router, state registry, D8 filter)",
          "product-parts/backend-core/clusters/runtime/modules/data-store/module.md (dirs, config, events, mutex, operations)",
          "product-parts/backend-core/clusters/projects/modules/{project-registry,kit-structure}/module.md",
          "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md (Provider contract)",
          "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/{provider-claude,provider-codex}/module.md",
          "product-parts/system-service/clusters/deployment/modules/service-installer/module.md; control-panel modules panel-shell, provider-cards"
        ],
        "decisions": [
          "Code lives in product-parts/<part>/clusters/<cluster>/modules/<module>; modules import each other only through src/index.ts via # aliases; module.md changes with its code.",
          "Only cli knows all modules: createApp registers routes and /api/state sections (system, projects, structure, providers, operations).",
          "Providers plug in by createProvider factories (DEFAULT_PROVIDERS); server and panel know them only through the provider contract.",
          "Long actions are in-memory operations (202 + operationId) under provider/project mutexes; polling only reads files and caches (D10, D11).",
          "Writes to foreign configs need a one-time preview token bound to a fingerprint, a backup before and a check after (D7).",
          "Processes are stopped only from own records after pid, start time, command line and boot id checks; no pkill (D5, D9).",
          "wfk link and wfk hook live in the cli module; service commands are delegated to service-installer runServiceCommand.",
          "Windows and Linux are covered by tests only; Claude pty and Codex on Windows are unsupported (Q1, Q2)."
        ],
        "references": [
          "docs/architecture/OVERVIEW.md",
          "README.md",
          "docs/planning/M1-orchestrator-core.md",
          "docs/planning/M1-providers.md"
        ],
        "result": "Milestone 1 core is in code: wfk CLI and createApp, data store with operations, HTTP API with the D8 access filter, project registry, Kit structure v1 with the SessionStart hook, provider contract with Claude and Codex providers, process supervisor, web panel with System, Projects, Structure and provider cards, and a service installer wired into the cli and panel. Device acceptance on Mac and iPad is still pending."
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
      "title": "Исправления по приёмке вехи 1"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "Сценарий визуальной приёмки из раздела 11 спецификации пройден пользователем на Mac и iPad",
      "Бэкенд установлен установщиком и стартует после входа в систему и по значку без ручного запуска",
      "Обязательные проверки качества (типы, тесты) проходят"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-05T15:03:00.800Z",
      "text": "Пользователь: «Согласен с твоим предложением, но важно, чтобы по каждой вехе я мог что-то тестировать визуально. Для меня важно, чтобы бэкэнд мог работать на любой операционной системе, разворачиваться. И чтобы он стартовал при старте компьютера или при старте самого интерфейса кита. У нас независимый совершенно проект, поэтому переносим все абсолютно в наш проект, формируем его по новой и строим инсталлятор бэкэнда.» | Execution mode chosen by the user: orchestrated: Согласен с планом, прошу тебя его показывать как виджет и отмечать его выполнение. А также в тех местах, в которых ты мог бы запустить процессы параллельно, запускай сабагентов. Жду первый релиз."
    },
    "baselineCommit": "4ec2edc62005983d0455d69078bcd50c5f74c178",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M1-orchestrator-core.md",
        "required": true
      },
      {
        "path": "docs/planning/M1-providers.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Веха 1 в урезанном объёме: сканер доверия, раскладка окон и авторизация панели — веха 2"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Каждая задача даёт видимый в панели результат; веха принимается визуально на Mac и iPad"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Бэкенд кроссплатформенный (macOS, Linux, Windows), разворачивается установщиком, стартует после входа в систему и при запуске интерфейса Kit"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Проект независим от harness-ai: структура Kit и установщик пишутся заново"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Стек: Node 24 + TypeScript (type stripping) без runtime-зависимостей; панель без сборки"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "QUALITY: стек node задаётся явно; создаются package.json (скрипты typecheck, test) и tsconfig.json (noEmit, allowImportingTsExtensions, erasableSyntaxOnly, verbatimModuleSyntax, checkJs для src/panel); typecheck с appliesTo **/*.ts и **/*.js; test — node --test \"test/**/*.test.ts\"; policy.maxFileLines 400; docs.contracts: src/{module}/** → docs/architecture/modules/{module}.md, bin/** → docs/architecture/modules/cli.md"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "QUALITY заводит проверку installed на этапе delivery: node bin/wfk.mjs doctor --installed, evidence «установленная служба отвечает на /api/health после перезагрузки и входа»"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Документы docs/planning/** удаляются после приёмки вехи (accept), не в DOCS раунда"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Реальная установка службы на Mac пользователя — только в задаче выпуска с подтверждением пользователя"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Пользователь разрешил QUALITY поставить через npm dev-зависимости typescript и @types/node («Да, ставить»)"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Автозапуск — после входа пользователя в систему; значок «Workflow Kit» и команда wfk поднимают службу и открывают панель уже в вехе 1 (ответ пользователя: «После входа + значок»)"
      },
      {
        "at": "2026-11-05T15:03:00.800Z",
        "text": "Windows и Linux в вехе 1 проверяются только тестами; приёмка на устройствах — Mac и iPad (ответ пользователя: «Тестов достаточно»)"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "cfa00ffe-c414-4ae6-9953-e3d2906b3705",
      "strategy": "orchestrated"
    },
    "id": "m1-orchestrator-core",
    "objective": "Веха 1: бэкенд-служба Workflow Kit (любая ОС, установщик, автозапуск, запускатель), проекты, собственная структура Kit, провайдеры Claude и Codex с общим контрактом и веб-панель для Mac и iPad",
    "spec": "docs/planning/M1-orchestrator-core.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Project stacks are detected or chosen from the architecture",
        "Quality checks are applied with `quality:apply` and the profile is CONFIGURED"
      ],
      "checks": [],
      "commitMessage": "chore: configure the project quality profile",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "node_modules/.bin/tsc",
        "node_modules/.bin/tsserver",
        "node_modules/.package-lock.json",
        "node_modules/@types/node/LICENSE",
        "node_modules/@types/node/README.md",
        "node_modules/@types/node/assert.d.ts",
        "node_modules/@types/node/assert/strict.d.ts",
        "node_modules/@types/node/async_hooks.d.ts",
        "node_modules/@types/node/buffer.buffer.d.ts",
        "node_modules/@types/node/buffer.d.ts",
        "node_modules/@types/node/child_process.d.ts",
        "node_modules/@types/node/cluster.d.ts",
        "node_modules/@types/node/compatibility/iterators.d.ts",
        "node_modules/@types/node/console.d.ts",
        "node_modules/@types/node/constants.d.ts",
        "node_modules/@types/node/crypto.d.ts",
        "node_modules/@types/node/dgram.d.ts",
        "node_modules/@types/node/diagnostics_channel.d.ts",
        "node_modules/@types/node/dns.d.ts",
        "node_modules/@types/node/dns/promises.d.ts",
        "node_modules/@types/node/domain.d.ts",
        "node_modules/@types/node/events.d.ts",
        "node_modules/@types/node/fs.d.ts",
        "node_modules/@types/node/fs/promises.d.ts",
        "node_modules/@types/node/globals.d.ts",
        "node_modules/@types/node/globals.typedarray.d.ts",
        "node_modules/@types/node/http.d.ts",
        "node_modules/@types/node/http2.d.ts",
        "node_modules/@types/node/https.d.ts",
        "node_modules/@types/node/index.d.ts",
        "node_modules/@types/node/inspector.d.ts",
        "node_modules/@types/node/inspector.generated.d.ts",
        "node_modules/@types/node/module.d.ts",
        "node_modules/@types/node/net.d.ts",
        "node_modules/@types/node/os.d.ts",
        "node_modules/@types/node/package.json",
        "node_modules/@types/node/path.d.ts",
        "node_modules/@types/node/perf_hooks.d.ts",
        "node_modules/@types/node/process.d.ts",
        "node_modules/@types/node/punycode.d.ts",
        "node_modules/@types/node/querystring.d.ts",
        "node_modules/@types/node/readline.d.ts",
        "node_modules/@types/node/readline/promises.d.ts",
        "node_modules/@types/node/repl.d.ts",
        "node_modules/@types/node/sea.d.ts",
        "node_modules/@types/node/sqlite.d.ts",
        "node_modules/@types/node/stream.d.ts",
        "node_modules/@types/node/stream/consumers.d.ts",
        "node_modules/@types/node/stream/promises.d.ts",
        "node_modules/@types/node/stream/web.d.ts",
        "node_modules/@types/node/string_decoder.d.ts",
        "node_modules/@types/node/test.d.ts",
        "node_modules/@types/node/timers.d.ts",
        "node_modules/@types/node/timers/promises.d.ts",
        "node_modules/@types/node/tls.d.ts",
        "node_modules/@types/node/trace_events.d.ts",
        "node_modules/@types/node/ts5.6/buffer.buffer.d.ts",
        "node_modules/@types/node/ts5.6/compatibility/float16array.d.ts",
        "node_modules/@types/node/ts5.6/globals.typedarray.d.ts",
        "node_modules/@types/node/ts5.6/index.d.ts",
        "node_modules/@types/node/ts5.7/compatibility/float16array.d.ts",
        "node_modules/@types/node/ts5.7/index.d.ts",
        "node_modules/@types/node/tty.d.ts",
        "node_modules/@types/node/url.d.ts",
        "node_modules/@types/node/util.d.ts",
        "node_modules/@types/node/v8.d.ts",
        "node_modules/@types/node/vm.d.ts",
        "node_modules/@types/node/wasi.d.ts",
        "node_modules/@types/node/web-globals/abortcontroller.d.ts",
        "node_modules/@types/node/web-globals/crypto.d.ts",
        "node_modules/@types/node/web-globals/domexception.d.ts",
        "node_modules/@types/node/web-globals/events.d.ts",
        "node_modules/@types/node/web-globals/fetch.d.ts",
        "node_modules/@types/node/web-globals/navigator.d.ts",
        "node_modules/@types/node/web-globals/storage.d.ts",
        "node_modules/@types/node/web-globals/streams.d.ts",
        "node_modules/@types/node/worker_threads.d.ts",
        "node_modules/@types/node/zlib.d.ts",
        "node_modules/typescript/LICENSE.txt",
        "node_modules/typescript/README.md",
        "node_modules/typescript/SECURITY.md",
        "node_modules/typescript/ThirdPartyNoticeText.txt",
        "node_modules/typescript/bin/tsc",
        "node_modules/typescript/bin/tsserver",
        "node_modules/typescript/lib/_tsc.js",
        "node_modules/typescript/lib/_tsserver.js",
        "node_modules/typescript/lib/_typingsInstaller.js",
        "node_modules/typescript/lib/cs/diagnosticMessages.generated.json",
        "node_modules/typescript/lib/de/diagnosticMessages.generated.json",
        "node_modules/typescript/lib/es/diagnosticMessages.generated.json",
        "node_modules/typescript/lib/fr/diagnosticMessages.generated.json",
        "node_modules/typescript/lib/it/diagnosticMessages.generated.json",
        "node_modules/typescript/lib/ja/diagnosticMessages.generated.json",
        "node_modules/typescript/lib/ko/diagnosticMessages.generated.json",
        "node_modules/typescript/lib/lib.d.ts",
        "node_modules/typescript/lib/lib.decorators.d.ts",
        "node_modules/typescript/lib/lib.decorators.legacy.d.ts",
        "node_modules/typescript/lib/lib.dom.asynciterable.d.ts",
        "node_modules/typescript/lib/lib.dom.d.ts",
        "node_modules/typescript/lib/lib.dom.iterable.d.ts",
        "node_modules/typescript/lib/lib.es2015.collection.d.ts",
        "node_modules/typescript/lib/lib.es2015.core.d.ts",
        "node_modules/typescript/lib/lib.es2015.d.ts",
        "node_modules/typescript/lib/lib.es2015.generator.d.ts",
        "node_modules/typescript/lib/lib.es2015.iterable.d.ts",
        "node_modules/typescript/lib/lib.es2015.promise.d.ts",
        "node_modules/typescript/lib/lib.es2015.proxy.d.ts",
        "node_modules/typescript/lib/lib.es2015.reflect.d.ts",
        "node_modules/typescript/lib/lib.es2015.symbol.d.ts",
        "node_modules/typescript/lib/lib.es2015.symbol.wellknown.d.ts",
        "node_modules/typescript/lib/lib.es2016.array.include.d.ts",
        "node_modules/typescript/lib/lib.es2016.d.ts",
        "node_modules/typescript/lib/lib.es2016.full.d.ts",
        "node_modules/typescript/lib/lib.es2016.intl.d.ts",
        "node_modules/typescript/lib/lib.es2017.arraybuffer.d.ts",
        "node_modules/typescript/lib/lib.es2017.d.ts",
        "node_modules/typescript/lib/lib.es2017.date.d.ts",
        "node_modules/typescript/lib/lib.es2017.full.d.ts",
        "node_modules/typescript/lib/lib.es2017.intl.d.ts",
        "node_modules/typescript/lib/lib.es2017.object.d.ts",
        "node_modules/typescript/lib/lib.es2017.sharedmemory.d.ts",
        "node_modules/typescript/lib/lib.es2017.string.d.ts",
        "node_modules/typescript/lib/lib.es2017.typedarrays.d.ts",
        "node_modules/typescript/lib/lib.es2018.asyncgenerator.d.ts",
        "node_modules/typescript/lib/lib.es2018.asynciterable.d.ts",
        "node_modules/typescript/lib/lib.es2018.d.ts",
        "node_modules/typescript/lib/lib.es2018.full.d.ts",
        "node_modules/typescript/lib/lib.es2018.intl.d.ts",
        "node_modules/typescript/lib/lib.es2018.promise.d.ts",
        "node_modules/typescript/lib/lib.es2018.regexp.d.ts",
        "node_modules/typescript/lib/lib.es2019.array.d.ts",
        "node_modules/typescript/lib/lib.es2019.d.ts",
        "node_modules/typescript/lib/lib.es2019.full.d.ts",
        "node_modules/typescript/lib/lib.es2019.intl.d.ts",
        "node_modules/typescript/lib/lib.es2019.object.d.ts",
        "node_modules/typescript/lib/lib.es2019.string.d.ts",
        "node_modules/typescript/lib/lib.es2019.symbol.d.ts",
        "node_modules/typescript/lib/lib.es2020.bigint.d.ts",
        "node_modules/typescript/lib/lib.es2020.d.ts",
        "node_modules/typescript/lib/lib.es2020.date.d.ts",
        "node_modules/typescript/lib/lib.es2020.full.d.ts",
        "node_modules/typescript/lib/lib.es2020.intl.d.ts",
        "node_modules/typescript/lib/lib.es2020.number.d.ts",
        "node_modules/typescript/lib/lib.es2020.promise.d.ts",
        "node_modules/typescript/lib/lib.es2020.sharedmemory.d.ts",
        "node_modules/typescript/lib/lib.es2020.string.d.ts",
        "node_modules/typescript/lib/lib.es2020.symbol.wellknown.d.ts",
        "node_modules/typescript/lib/lib.es2021.d.ts",
        "node_modules/typescript/lib/lib.es2021.full.d.ts",
        "node_modules/typescript/lib/lib.es2021.intl.d.ts",
        "node_modules/typescript/lib/lib.es2021.promise.d.ts",
        "node_modules/typescript/lib/lib.es2021.string.d.ts",
        "node_modules/typescript/lib/lib.es2021.weakref.d.ts",
        "node_modules/typescript/lib/lib.es2022.array.d.ts",
        "node_modules/typescript/lib/lib.es2022.d.ts",
        "node_modules/typescript/lib/lib.es2022.error.d.ts",
        "node_modules/typescript/lib/lib.es2022.full.d.ts",
        "node_modules/typescript/lib/lib.es2022.intl.d.ts",
        "node_modules/typescript/lib/lib.es2022.object.d.ts",
        "node_modules/typescript/lib/lib.es2022.regexp.d.ts",
        "node_modules/typescript/lib/lib.es2022.string.d.ts",
        "node_modules/typescript/lib/lib.es2023.array.d.ts",
        "node_modules/typescript/lib/lib.es2023.collection.d.ts",
        "node_modules/typescript/lib/lib.es2023.d.ts",
        "node_modules/typescript/lib/lib.es2023.full.d.ts",
        "node_modules/typescript/lib/lib.es2023.intl.d.ts",
        "node_modules/typescript/lib/lib.es2024.arraybuffer.d.ts",
        "node_modules/typescript/lib/lib.es2024.collection.d.ts",
        "node_modules/typescript/lib/lib.es2024.d.ts",
        "node_modules/typescript/lib/lib.es2024.full.d.ts",
        "node_modules/typescript/lib/lib.es2024.object.d.ts",
        "node_modules/typescript/lib/lib.es2024.promise.d.ts",
        "node_modules/typescript/lib/lib.es2024.regexp.d.ts",
        "node_modules/typescript/lib/lib.es2024.sharedmemory.d.ts",
        "node_modules/typescript/lib/lib.es2024.string.d.ts",
        "node_modules/typescript/lib/lib.es5.d.ts",
        "node_modules/typescript/lib/lib.es6.d.ts",
        "node_modules/typescript/lib/lib.esnext.array.d.ts",
        "node_modules/typescript/lib/lib.esnext.collection.d.ts",
        "node_modules/typescript/lib/lib.esnext.d.ts",
        "node_modules/typescript/lib/lib.esnext.decorators.d.ts",
        "node_modules/typescript/lib/lib.esnext.disposable.d.ts",
        "node_modules/typescript/lib/lib.esnext.error.d.ts",
        "node_modules/typescript/lib/lib.esnext.float16.d.ts",
        "node_modules/typescript/lib/lib.esnext.full.d.ts",
        "node_modules/typescript/lib/lib.esnext.intl.d.ts",
        "node_modules/typescript/lib/lib.esnext.iterator.d.ts",
        "node_modules/typescript/lib/lib.esnext.promise.d.ts",
        "node_modules/typescript/lib/lib.esnext.sharedmemory.d.ts",
        "node_modules/typescript/lib/lib.scripthost.d.ts",
        "node_modules/typescript/lib/lib.webworker.asynciterable.d.ts",
        "node_modules/typescript/lib/lib.webworker.d.ts",
        "node_modules/typescript/lib/lib.webworker.importscripts.d.ts",
        "node_modules/typescript/lib/lib.webworker.iterable.d.ts",
        "node_modules/typescript/lib/pl/diagnosticMessages.generated.json",
        "node_modules/typescript/lib/pt-br/diagnosticMessages.generated.json",
        "node_modules/typescript/lib/ru/diagnosticMessages.generated.json",
        "node_modules/typescript/lib/tr/diagnosticMessages.generated.json",
        "node_modules/typescript/lib/tsc.js",
        "node_modules/typescript/lib/tsserver.js",
        "node_modules/typescript/lib/tsserverlibrary.d.ts",
        "node_modules/typescript/lib/tsserverlibrary.js",
        "node_modules/typescript/lib/typesMap.json",
        "node_modules/typescript/lib/typescript.d.ts",
        "node_modules/typescript/lib/typescript.js",
        "node_modules/typescript/lib/typingsInstaller.js",
        "node_modules/typescript/lib/watchGuard.js",
        "node_modules/typescript/lib/zh-cn/diagnosticMessages.generated.json",
        "node_modules/typescript/lib/zh-tw/diagnosticMessages.generated.json",
        "node_modules/typescript/package.json",
        "node_modules/undici-types/LICENSE",
        "node_modules/undici-types/README.md",
        "node_modules/undici-types/agent.d.ts",
        "node_modules/undici-types/api.d.ts",
        "node_modules/undici-types/balanced-pool.d.ts",
        "node_modules/undici-types/cache-interceptor.d.ts",
        "node_modules/undici-types/cache.d.ts",
        "node_modules/undici-types/client-stats.d.ts",
        "node_modules/undici-types/client.d.ts",
        "node_modules/undici-types/connector.d.ts",
        "node_modules/undici-types/content-type.d.ts",
        "node_modules/undici-types/cookies.d.ts",
        "node_modules/undici-types/diagnostics-channel.d.ts",
        "node_modules/undici-types/dispatcher.d.ts",
        "node_modules/undici-types/env-http-proxy-agent.d.ts",
        "node_modules/undici-types/errors.d.ts",
        "node_modules/undici-types/eventsource.d.ts",
        "node_modules/undici-types/fetch.d.ts",
        "node_modules/undici-types/formdata.d.ts",
        "node_modules/undici-types/global-dispatcher.d.ts",
        "node_modules/undici-types/global-origin.d.ts",
        "node_modules/undici-types/h2c-client.d.ts",
        "node_modules/undici-types/handlers.d.ts",
        "node_modules/undici-types/header.d.ts",
        "node_modules/undici-types/index.d.ts",
        "node_modules/undici-types/interceptors.d.ts",
        "node_modules/undici-types/mock-agent.d.ts",
        "node_modules/undici-types/mock-call-history.d.ts",
        "node_modules/undici-types/mock-client.d.ts",
        "node_modules/undici-types/mock-errors.d.ts",
        "node_modules/undici-types/mock-interceptor.d.ts",
        "node_modules/undici-types/mock-pool.d.ts",
        "node_modules/undici-types/package.json",
        "node_modules/undici-types/patch.d.ts",
        "node_modules/undici-types/pool-stats.d.ts",
        "node_modules/undici-types/pool.d.ts",
        "node_modules/undici-types/proxy-agent.d.ts",
        "node_modules/undici-types/readable.d.ts",
        "node_modules/undici-types/retry-agent.d.ts",
        "node_modules/undici-types/retry-handler.d.ts",
        "node_modules/undici-types/round-robin-pool.d.ts",
        "node_modules/undici-types/snapshot-agent.d.ts",
        "node_modules/undici-types/socks5-proxy-agent.d.ts",
        "node_modules/undici-types/util.d.ts",
        "node_modules/undici-types/utility.d.ts",
        "node_modules/undici-types/webidl.d.ts",
        "node_modules/undici-types/websocket.d.ts",
        "package-lock.json",
        "package.json",
        "tsconfig.json",
        ".harness/workflow/config.json"
      ],
      "fixes": null,
      "id": "QUALITY",
      "iteration": 1,
      "kind": "quality",
      "roundId": "R1",
      "status": "DONE",
      "title": "Configure the project quality profile",
      "why": "Functional code needs a configured quality profile before its first commit."
    },
    {
      "acceptance": [
        "bin/wfk.mjs проверяет Node >= 24 и загружает модуль cli; команды serve, open, install, uninstall, service, doctor, link, hook маршрутизируются (нереализованные отвечают «не реализовано»; заглушка службы — модуль service-installer)",
        "Каталоги данных выбираются по ОС (macOS, Linux с XDG, Windows %LOCALAPPDATA%) и создаются с правами 0700; WFK_DATA_DIR и WFK_PORT переопределяют их; тесты на три ОС",
        "Помощник атомарной записи JSON (tmp + rename) с тестом",
        "Фильтр доступа по D8: адрес клиента и локальный адрес сокета — loopback или Tailscale (IPv4 и IPv6), Host из списка, Origin изменяющих запросов совпадает с Host, тело JSON; иначе 403; тесты",
        "GET /api/health и GET /api/state (раздел «Система»: версия, ОС, каталог данных, статус службы из заглушки); / отдаёт панель с опросом раз в 3 с",
        "node_modules удалён из индекса git (git rm -r --cached node_modules; он попал туда коммитом QUALITY), .gitignore исключает node_modules/ вне блока Workflow Kit; зависимости ставятся npm ci",
        "Ручная проверка пользователем: Визуально: node bin/wfk.mjs serve; панель на http://127.0.0.1:4747/ и с iPad по адресу Tailscale без правки конфига; карточка «Система» показывает версию, ОС и каталог данных",
        "Создан скелет структуры product-parts: product-part.md каждой части и cluster.md каждого кластера из раздела 4 (назначение, модули, границы); package.json получает поле imports с #-алиасами для src/index.ts модулей, tsconfig.json включает product-parts/** и bin/**"
      ],
      "checks": [],
      "commitMessage": "feat: add backend skeleton with access filter and panel shell",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true
        }
      ],
      "dependencies": [
        "QUALITY"
      ],
      "docsWaiver": null,
      "files": [
        "bin",
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        ".gitignore",
        "node_modules",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/backend-core/clusters/runtime/modules/data-store",
        "product-parts/backend-core/clusters/http-api/modules/http-server",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/index.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/module.md",
        "product-parts/backend-core/product-part.md",
        "product-parts/provider-runtime/product-part.md",
        "product-parts/control-panel/product-part.md",
        "product-parts/system-service/product-part.md",
        "product-parts/backend-core/clusters/runtime/cluster.md",
        "product-parts/backend-core/clusters/http-api/cluster.md",
        "product-parts/backend-core/clusters/projects/cluster.md",
        "product-parts/provider-runtime/clusters/provider-contract/cluster.md",
        "product-parts/provider-runtime/clusters/provider-adapters/cluster.md",
        "product-parts/control-panel/clusters/web-panel/cluster.md",
        "product-parts/system-service/clusters/deployment/cluster.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Каркас бэкенда, фильтр доступа и панель-оболочка",
      "why": "Точка входа, HTTP-сервер с безопасным доступом с Mac и iPad и пустая панель, на которой наращиваются видимые функции",
      "integration": {
        "operationId": "07d15cde-291c-4f38-9de8-c09201f60b39",
        "sourceCommit": "443b599b56ff9ce122858764ff2ad5861d539e6f"
      }
    },
    {
      "acceptance": [
        "Проект создаётся в корне проектов из config.json; имя проверяется по разделу 6 (без /, \\, .., ведущего -, зарезервированных имён Windows; NFC); тесты",
        "Открыть можно только папку внутри домашней по realpath (на Windows без учёта регистра); выход через .. и симлинки отклоняется; тесты",
        "GET /api/folders отдаёт подкаталоги; ошибка доступа (macOS TCC) показывается с подсказкой; поля ввода с autocapitalize=off и autocorrect=off",
        "DELETE убирает проект только из списка, папка остаётся",
        "projects.json пишется атомарно; события пишутся в events.jsonl с ротацией по 5 МБ",
        "Ручная проверка пользователем: Визуально: создать проект и открыть существующую папку выбором из списка на Mac и iPad; после перезапуска serve проекты на месте"
      ],
      "checks": [],
      "commitMessage": "feat: add project registry and folder picker",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/runtime/modules/data-store",
        "product-parts/backend-core/clusters/http-api/modules/http-server",
        "product-parts/backend-core/clusters/projects/modules/project-registry",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "package.json",
        "product-parts/backend-core/clusters/runtime/modules/cli"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Реестр проектов и выбор папки",
      "why": "Проект — основная единица навигации панели",
      "integration": {
        "operationId": "23129545-dafb-4f1b-b5f2-d898df268fa0",
        "sourceCommit": "54af4cfaeb21c37e12db5f9b8c3f311e0624f179"
      }
    },
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
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/projects/modules/kit-structure",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/backend-core/clusters/runtime/modules/data-store",
        "product-parts/backend-core/clusters/http-api/modules/http-server",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "package.json"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Структура Kit v1, приём хука и wfk link",
      "why": "Kit записывает в папку свою структуру и узнаёт о сессиях через хук SessionStart",
      "integration": {
        "operationId": "9cab5559-ee7b-4600-b433-2ff0c3e7c5a8",
        "sourceCommit": "977b9dcac830f962e573413bee06ea94a3f69466"
      }
    },
    {
      "acceptance": [
        "Контракт раздела 1 документа провайдеров описан типами; реестр по строковому id содержит claude и codex (заглушки со статусом «не реализовано»)",
        "Помощник readHookSessions(project, client) читает журнал хука; итоговый список строит провайдер, сервер не фильтрует",
        "Маршруты раздела 10 (предпросмотр и доверие по токену, одобрение хука по команде и хешу, сессии, особые действия, refresh) работают через контракт; тесты с подставным провайдером",
        "Мьютекс на проект и провайдера; долгие действия — операции с operationId и состоянием в /api/state; повторный запуск того же действия во время операции не создаёт второе",
        "Утилиты процессов по D5 и D9: отдельная группа, вывод в файл, очистка CLAUDE*, запись pid, времени старта, командной строки и boot id; остановка TERM → ожидание → проверка → KILL только после сверки; тесты",
        "Действия провайдеров (доверие, одобрение, создание) пишутся в events.jsonl",
        "Ручная проверка пользователем: Визуально: в «Системе» и в проекте видны провайдеры claude и codex со статусом «не реализовано»; сессии Claude, начатые в Desktop в папке проекта, видны в /api/state по журналу хука"
      ],
      "checks": [],
      "commitMessage": "feat: add provider contract, registry, operations and process utilities",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-providers.md",
          "required": true,
          "heading": "1. Контракт провайдера"
        },
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor",
        "product-parts/backend-core/clusters/runtime/modules/data-store",
        "product-parts/backend-core/clusters/http-api/modules/http-server",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "package.json",
        "product-parts/backend-core/clusters/runtime/modules/cli"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Контракт провайдера, API, операции и утилиты процессов",
      "why": "Общий контракт и общие механизмы позволяют реализовать провайдеров без правок сервера и панели",
      "integration": {
        "operationId": "14fee231-3898-41e7-9796-bec768497e02",
        "sourceCommit": "5653a4cc87fb988d3a23fa36b3aa6f7e2db16c96"
      }
    },
    {
      "acceptance": [
        "Карточка провайдера: статус и версии CLI, доверие с предпросмотром (ключи и точки автозапуска) и подтверждением по токену, хуки Kit и чужие с командой и хешем, кнопка одобрения передаёт команду и хеш, список сессий, особые действия",
        "Недоступное показано с причиной; идущие операции блокируют свою кнопку и показывают ход",
        "Ссылка сессии выбирается по устройству: mobile при navigator.maxTouchPoints > 1, иначе desktop, web — запасная; сессия без ссылки показывает note",
        "Логика выбора ссылки и отображения состояний покрыта тестами node --test",
        "Ручная проверка пользователем: Визуально: на Mac и iPad в проекте две карточки (Claude, ChatGPT) с заглушками; сессии Claude из журнала хука видны в списке; на iPad вёрстка не ломается"
      ],
      "checks": [],
      "commitMessage": "feat: add generic provider cards to the panel",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-providers.md",
          "required": true,
          "heading": "1. Контракт провайдера"
        },
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true,
          "heading": "10. HTTP API"
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/provider-cards",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "package.json",
        "product-parts/backend-core/clusters/runtime/modules/cli"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Общий интерфейс провайдеров в панели",
      "why": "Панель рисует любого провайдера из контракта, без кода под провайдера",
      "integration": {
        "operationId": "9f6aa40e-d1f5-45be-b125-83a30fc2fb9b",
        "sourceCommit": "68e794375bc81c50cbd6959ad89869e38ef2dea6"
      }
    },
    {
      "acceptance": [
        "Возможности учитывают ОС, наличие expect и версию claude; status только читает (кэш по mtime ~/.claude.json)",
        "previewTrust перечисляет ключи и точки автозапуска папки; grantTrust проходит диалог под pty с WFK_SERVICE_SESSION=trust, копией ~/.claude.json до и проверкой после",
        "createSession: session.exp печатает SESSION_URL и pid дочернего claude; debug-файл — запасной источник; запись в sessions/claude.json по D9; имя «<проект> · <время>»",
        "Сессии из хука получают remoteId отложенно по bridge-session в transcript_path; без него — без ссылки с note; служебные сессии скрыты",
        "resumeSession поднимает тот же session id; stopSession останавливает только свой процесс по D9",
        "Особое действие проекта «Окружение папки» (запуск и остановка claude remote-control --spawn=same-dir) по D5 и D9",
        "Ссылки claude://claude.ai/code/session_<id> и https://claude.ai/code/session_<id>; тесты на подставном claude и фикстурах транскриптов",
        "Ручная проверка пользователем: Визуально: предпросмотр → «Доверять» → «доверено»; «Создать сессию» → открывается в Claude Desktop на Mac и в приложении Claude на iPad; после перезапуска serve сессия жива; окружение папки запускается и видно с iPad",
        "Тест cli/test/providers.test.ts не зависит от того, реализован ли провайдер: проверки заглушек и not-implemented идут на внедрённых провайдерах-заглушках (createApp({providers})), а для настоящих claude и codex проверяется только регистрация и раздел состояния — так реализация T007 его не ломает"
      ],
      "checks": [],
      "commitMessage": "feat: implement claude provider",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-providers.md",
          "required": true,
          "heading": "2. Claude"
        },
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true,
          "heading": "3. Решения"
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/providers.test.ts"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Провайдер Claude",
      "why": "Доверие, сессии Remote Control и окружение папки Claude из панели",
      "integration": {
        "operationId": "684c6a9c-bb65-480f-a4c4-532c0dd36d93",
        "sourceCommit": "4ae08d0354cd123d14d950626bd4d533e6418ded"
      }
    },
    {
      "acceptance": [
        "status только читает: pid-файл и initialize по сокету демона с кэшем; ошибка токена — с подсказкой «выполните codex login»; запуск демона — особое действие",
        "previewTrust показывает trust_level и чужие хуки; запись через codex app-server с копией ~/.codex/config.toml до и проверкой после",
        "approveHooks одобряет только хук Kit при точном совпадении команды и хеша; чужие хуки не одобряются; тест",
        "createSession: thread/start, thread/name/set, служебный turn/start с безопасными sandbox и approval (параметры проверены на устройстве и записаны в контракт модуля); запись в sessions/codex.json",
        "listSessions: журнал хука + записи панели, названия из session_index.jsonl; неодобренный хук — note «список неполон»; ссылка codex://threads/<id>",
        "Windows — возможности недоступны с причиной; тесты на подставном JSON-RPC сервере и фикстурах",
        "Ручная проверка пользователем: Визуально: статус демона; доверие с предпросмотром; «Одобрить хук» с командой и хешем; «Создать сессию» → открывается в ChatGPT на Mac и на iPad"
      ],
      "checks": [],
      "commitMessage": "feat: implement codex provider",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-providers.md",
          "required": true,
          "heading": "3. Codex"
        },
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Провайдер Codex",
      "why": "Демон, доверие, одобрение хука Kit и сессии Codex из панели",
      "integration": {
        "operationId": "c3698dac-2a90-48a9-bae9-3bc7716d59db",
        "sourceCommit": "db08ada87d36f6fb74eea27a3d7be369f4a49444"
      }
    },
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
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/system-service/clusters/deployment/modules/service-installer"
      ],
      "fixes": null,
      "id": "T008",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Установщик, автозапуск, запускатель и значок",
      "why": "Бэкенд разворачивается на любой ОС и стартует сам после входа в систему или при запуске интерфейса",
      "integration": {
        "operationId": "b9d76f5a-9250-4687-a235-2043c7590fda",
        "sourceCommit": "b1630eb69a54d2fb83cfce20e99801fa14435ccc"
      }
    },
    {
      "acceptance": [
        "cli передаёт install, uninstall, service start/stop/status, open и doctor [--installed] в service-installer с контекстом (env, homedir, платформа, исполнитель); тесты cli используют подставные эффекты и никогда не трогают настоящий HOME, LaunchAgents и автозапуск",
        "Карточка «Система» показывает установленную версию, экземпляр (установка или разработка), способ и состояние автозапуска, запускатель, значок и найденные пути программ",
        "Путь к node для службы устойчив к обновлению Homebrew: вместо версионного пути Cellar берётся node из login PATH с тем же realpath (например /opt/homebrew/opt/node@24/bin/node или /opt/homebrew/bin/node); тест",
        "module.md модулей cli, panel-shell и service-installer обновлены; product-part.md и cluster.md части system-service больше не называют установщик заглушкой",
        "Ручная проверка пользователем: WFK_DATA_DIR=<временный каталог> WFK_PORT=<порт> node bin/wfk.mjs install, затем open — панель в окне без вкладок, «Система» показывает службу и пути программ",
        "node_modules удалён из индекса git (git rm -r --cached node_modules; Kit 2.2.1 это коммитит); дублирующая строка node_modules/ вне блока Workflow Kit в .gitignore убрана (блок Kit уже её содержит); файлы на диске остаются"
      ],
      "checks": [],
      "commitMessage": "fix: wire the service installer into the cli and panel",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true,
          "heading": "9. Установщик, запуск и автозапуск"
        }
      ],
      "dependencies": [
        "T008"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "product-parts/system-service/clusters/deployment/modules/service-installer",
        "product-parts/system-service/product-part.md",
        "product-parts/system-service/clusters/deployment/cluster.md",
        "node_modules",
        ".gitignore"
      ],
      "fixes": "T008",
      "id": "T010",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Подключение установщика к cli и панели",
      "why": "T008 не мог менять cli и панель: команды install, uninstall, service, open, doctor пока отвечают заглушкой, а «Система» не показывает автозапуск и программы",
      "integration": {
        "operationId": "c1cbdc48-43bb-4797-902e-807cf4b9ee0e",
        "sourceCommit": "fbe32ea887f834282e6e9d6b1fc897ed3020eeef"
      }
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
        "QUALITY",
        "T001",
        "T002",
        "T003",
        "T004",
        "T005",
        "T006",
        "T007",
        "T008",
        "T010"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M1-orchestrator-core.md",
        "docs/architecture/modules/cli.md",
        "docs/architecture/modules/core.md",
        "docs/architecture/modules/server.md",
        "docs/architecture/modules/panel.md",
        "docs/architecture/modules/service.md",
        "docs/architecture/modules/kit-structure.md",
        "docs/architecture/modules/providers.md",
        "docs/architecture/modules/provider-claude.md",
        "docs/architecture/modules/provider-codex.md",
        "node_modules/@types/node/README.md",
        "node_modules/typescript/README.md",
        "node_modules/typescript/SECURITY.md",
        "node_modules/undici-types/README.md",
        "product-parts/system-service/clusters/deployment/modules/service-installer/module.md",
        "product-parts/backend-core/product-part.md",
        "product-parts/provider-runtime/product-part.md",
        "product-parts/control-panel/product-part.md",
        "product-parts/system-service/product-part.md",
        "product-parts/backend-core/clusters/runtime/cluster.md",
        "product-parts/backend-core/clusters/http-api/cluster.md",
        "product-parts/backend-core/clusters/projects/cluster.md",
        "product-parts/provider-runtime/clusters/provider-contract/cluster.md",
        "product-parts/provider-runtime/clusters/provider-adapters/cluster.md",
        "product-parts/control-panel/clusters/web-panel/cluster.md",
        "product-parts/system-service/clusters/deployment/cluster.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md"
      ],
      "fixes": null,
      "id": "DOCS-R1",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R1",
      "status": "DONE",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round.",
      "integration": {
        "operationId": "157e7196-d371-4c4f-a19c-7568afbaa3d8",
        "sourceCommit": "165924ed7cdf25316a6a208b5a44c31a26f41dd6"
      }
    },
    {
      "acceptance": [
        "Бэкенд установлен на Mac пользователя командой node bin/wfk.mjs install после его подтверждения; после перезагрузки и входа служба работает",
        "Сценарий раздела 11 пройден с пользователем на Mac и iPad; результат каждого шага записан в docs/evidence/M1-acceptance.md",
        "Ручная проверка пользователем: Пользователь проходит сценарий раздела 11 спецификации"
      ],
      "checks": [],
      "commitMessage": "docs: record milestone 1 acceptance",
      "confirmation": "Да, ставить",
      "context": [
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true
        }
      ],
      "dependencies": [
        "T006",
        "T007",
        "T008",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M1-acceptance.md"
      ],
      "fixes": null,
      "id": "T009",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Установка на Mac и приёмка вехи 1",
      "why": "Пользователь проверяет веху визуально на своём Mac и iPad"
    },
    {
      "acceptance": [
        "Доверие для Remote Control определяется точным ключом папки в ~/.claude.json; если доверена родительская папка (например ~), панель показывает это отдельной пометкой («интерактивный Claude не спросит, Remote Control требует доверия папки»)",
        "grantTrust больше не проходит диалоги под pty: после предпросмотра и подтверждения по токену он атомарно записывает projects[<папка>].hasTrustDialogAccepted=true в ~/.claude.json с копией до записи, перечитывает файл и при потере записи из-за параллельной записи Claude повторяет до 3 раз; trust.exp удалён",
        "Предпросмотр находит внешние импорты CLAUDE.md, которые Claude загрузит для папки, включая CLAUDE.md родительских папок (например ~/CLAUDE.md → ~/AGENTS.md) и .claude/rules; если они есть, предпросмотр содержит обязательный выбор «разрешить / запретить внешние импорты», а запись ставит hasClaudeMdExternalIncludesApproved по выбору пользователя и hasClaudeMdExternalIncludesWarningShown=true",
        "Контракт: TrustPreview.choices (id, title, description, options, required) и grantTrust(project, token, choices); маршрут POST …/trust принимает {token, choices}; карточка провайдера рисует выбор и не отправляет «Доверять» без обязательного ответа — без кода под конкретного провайдера",
        "session.exp и environment.exp никогда не нажимают клавиши в диалогах: известные диалоги (доверие, внешние импорты) распознаются по точному тексту, процесс останавливается, операция завершается ошибкой с текстом диалога и подсказкой «решите это в предпросмотре доверия»; любой другой диалог — то же с кодом unknown-dialog",
        "Тесты на подставном claude: диалог импортов при создании сессии, доверие через запись файла, выбор импортов, доверенная родительская папка, потеря записи и повтор; тесты cli и карточек обновлены",
        "module.md provider-claude, provider-registry, provider-cards и факты раздела 2 в docs/planning/M1-providers.md обновлены (проверено 2026-11-05: доверие ~ подавляет диалог доверия для вложенных папок; диалог внешних импортов)",
        "Ручная проверка пользователем: предпросмотр доверия Claude для проекта под ~ показывает пометку о родительской папке и выбор про внешние импорты; после «Доверять» карточка показывает «доверено», ~/.claude.json содержит ключ проекта"
      ],
      "checks": [],
      "commitMessage": "fix: grant claude trust explicitly and ask about external imports",
      "confirmation": null,
      "context": [
        {
          "path": "docs/evidence/M1-acceptance.md",
          "required": true
        },
        {
          "path": "docs/planning/M1-providers.md",
          "required": true,
          "heading": "2. Claude"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/control-panel/clusters/web-panel/modules/provider-cards",
        "docs/planning/M1-providers.md"
      ],
      "fixes": "T006",
      "id": "T011",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "TODO",
      "title": "Доверие Claude без подмены решений пользователя",
      "why": "Приёмка: скрипт доверия выбрал «Yes, allow external imports» вместо пользователя и не записал доверие; при доверенной домашней папке Claude не показывает диалог доверия (D2, D3)"
    },
    {
      "acceptance": [
        "После служебного хода (turn/completed или таймаут ожидания) createSession вызывает thread/unsubscribe {threadId} и только потом закрывает соединение; ошибка unsubscribe не ломает создание, но пишется в журнал",
        "Служебный ход не передаёт переопределения sandboxPolicy и approvalPolicy (как в проверенном прототипе), чтобы не менять настройки треда для дальнейшей работы пользователя в ChatGPT",
        "Тест на подставном демоне: после createSession тред отсутствует в thread/loaded/list подставного демона, порядок вызовов thread/start → thread/name/set → turn/start → thread/unsubscribe",
        "module.md provider-codex обновлён",
        "Ручная проверка пользователем: новая сессия Codex из панели сразу открывается в ChatGPT на Mac и iPad без сообщения «Этот чат открыт в другом приложении»"
      ],
      "checks": [],
      "commitMessage": "fix: release the codex thread after the service turn",
      "confirmation": null,
      "context": [
        {
          "path": "docs/evidence/M1-acceptance.md",
          "required": true
        },
        {
          "path": "docs/planning/M1-providers.md",
          "required": true,
          "heading": "3. Codex"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex"
      ],
      "fixes": "T007",
      "id": "T012",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R2",
      "status": "TODO",
      "title": "Codex отпускает тред после служебного хода",
      "why": "Приёмка: ChatGPT показал «Этот чат открыт в другом приложении» для сессии, созданной панелью (D1)"
    },
    {
      "acceptance": [
        "node_modules удалён из индекса git (git rm -r --cached node_modules), файлы на диске остаются; .gitignore (блок Workflow Kit) его исключает",
        "Разделы «Дальше» и упоминания будущих задач T00x в module.md data-store, http-server, project-registry, kit-structure, process-supervisor приведены к факту"
      ],
      "checks": [],
      "commitMessage": "chore: stop tracking node_modules and refresh module contracts",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T011",
        "T012"
      ],
      "docsWaiver": null,
      "files": [
        "node_modules",
        "product-parts/backend-core/clusters/runtime/modules/data-store/module.md",
        "product-parts/backend-core/clusters/http-api/modules/http-server/module.md",
        "product-parts/backend-core/clusters/projects/modules/project-registry/module.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md"
      ],
      "fixes": null,
      "id": "T013",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "TODO",
      "title": "node_modules вне git и актуальные контракты модулей",
      "why": "node_modules закоммичен коммитом QUALITY; разделы «Дальше» в module.md устарели после раунда R1"
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
        "T011",
        "T012",
        "T013"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M1-providers.md",
        "product-parts/backend-core/clusters/runtime/modules/data-store/module.md",
        "product-parts/backend-core/clusters/http-api/modules/http-server/module.md",
        "product-parts/backend-core/clusters/projects/modules/project-registry/module.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md"
      ],
      "fixes": null,
      "id": "DOCS-R2",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R2",
      "status": "TODO",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "Служба обновлена командой node bin/wfk.mjs install после подтверждения пользователя; wfk doctor --installed — всё в порядке",
        "Сценарий раздела 11 пройден пользователем по порядку на Mac и iPad; результат каждого шага дописан в docs/evidence/M1-acceptance.md"
      ],
      "checks": [],
      "commitMessage": "docs: record milestone 1 acceptance after fixes",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true,
          "heading": "11. Визуальная приёмка вехи"
        },
        {
          "path": "docs/evidence/M1-acceptance.md",
          "required": true
        }
      ],
      "dependencies": [
        "T011",
        "T012",
        "T013",
        "DOCS-R2"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M1-acceptance.md"
      ],
      "fixes": null,
      "id": "T014",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R2",
      "status": "TODO",
      "title": "Переустановка службы и повторная приёмка вехи 1",
      "why": "Пользователь проверяет исправления на своём Mac и iPad, проходя сценарий по порядку"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m1-orchestrator-core (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: orchestrated (max 3 workers, owner cfa00ffe-c414-4ae6-9953-e3d2906b3705)
- Current task: none
- Progress: 12/17
- Revision: 46

## Objective

Веха 1: бэкенд-служба Workflow Kit (любая ОС, установщик, автозапуск, запускатель), проекты, собственная структура Kit, провайдеры Claude и Codex с общим контрактом и веб-панель для Mac и iPad

## Acceptance

- Сценарий визуальной приёмки из раздела 11 спецификации пройден пользователем на Mac и iPad
- Бэкенд установлен установщиком и стартует после входа в систему и по значку без ручного запуска
- Обязательные проверки качества (типы, тесты) проходят

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] QUALITY — Configure the project quality profile (quality)
  - Commit: chore: configure the project quality profile
  - Files: node_modules/.bin/tsc, node_modules/.bin/tsserver, node_modules/.package-lock.json, node_modules/@types/node/LICENSE, node_modules/@types/node/README.md, node_modules/@types/node/assert.d.ts, node_modules/@types/node/assert/strict.d.ts, node_modules/@types/node/async_hooks.d.ts, node_modules/@types/node/buffer.buffer.d.ts, node_modules/@types/node/buffer.d.ts, node_modules/@types/node/child_process.d.ts, node_modules/@types/node/cluster.d.ts, node_modules/@types/node/compatibility/iterators.d.ts, node_modules/@types/node/console.d.ts, node_modules/@types/node/constants.d.ts, node_modules/@types/node/crypto.d.ts, node_modules/@types/node/dgram.d.ts, node_modules/@types/node/diagnostics_channel.d.ts, node_modules/@types/node/dns.d.ts, node_modules/@types/node/dns/promises.d.ts, node_modules/@types/node/domain.d.ts, node_modules/@types/node/events.d.ts, node_modules/@types/node/fs.d.ts, node_modules/@types/node/fs/promises.d.ts, node_modules/@types/node/globals.d.ts, node_modules/@types/node/globals.typedarray.d.ts, node_modules/@types/node/http.d.ts, node_modules/@types/node/http2.d.ts, node_modules/@types/node/https.d.ts, node_modules/@types/node/index.d.ts, node_modules/@types/node/inspector.d.ts, node_modules/@types/node/inspector.generated.d.ts, node_modules/@types/node/module.d.ts, node_modules/@types/node/net.d.ts, node_modules/@types/node/os.d.ts, node_modules/@types/node/package.json, node_modules/@types/node/path.d.ts, node_modules/@types/node/perf_hooks.d.ts, node_modules/@types/node/process.d.ts, node_modules/@types/node/punycode.d.ts, node_modules/@types/node/querystring.d.ts, node_modules/@types/node/readline.d.ts, node_modules/@types/node/readline/promises.d.ts, node_modules/@types/node/repl.d.ts, node_modules/@types/node/sea.d.ts, node_modules/@types/node/sqlite.d.ts, node_modules/@types/node/stream.d.ts, node_modules/@types/node/stream/consumers.d.ts, node_modules/@types/node/stream/promises.d.ts, node_modules/@types/node/stream/web.d.ts, node_modules/@types/node/string_decoder.d.ts, node_modules/@types/node/test.d.ts, node_modules/@types/node/timers.d.ts, node_modules/@types/node/timers/promises.d.ts, node_modules/@types/node/tls.d.ts, node_modules/@types/node/trace_events.d.ts, node_modules/@types/node/ts5.6/buffer.buffer.d.ts, node_modules/@types/node/ts5.6/compatibility/float16array.d.ts, node_modules/@types/node/ts5.6/globals.typedarray.d.ts, node_modules/@types/node/ts5.6/index.d.ts, node_modules/@types/node/ts5.7/compatibility/float16array.d.ts, node_modules/@types/node/ts5.7/index.d.ts, node_modules/@types/node/tty.d.ts, node_modules/@types/node/url.d.ts, node_modules/@types/node/util.d.ts, node_modules/@types/node/v8.d.ts, node_modules/@types/node/vm.d.ts, node_modules/@types/node/wasi.d.ts, node_modules/@types/node/web-globals/abortcontroller.d.ts, node_modules/@types/node/web-globals/crypto.d.ts, node_modules/@types/node/web-globals/domexception.d.ts, node_modules/@types/node/web-globals/events.d.ts, node_modules/@types/node/web-globals/fetch.d.ts, node_modules/@types/node/web-globals/navigator.d.ts, node_modules/@types/node/web-globals/storage.d.ts, node_modules/@types/node/web-globals/streams.d.ts, node_modules/@types/node/worker_threads.d.ts, node_modules/@types/node/zlib.d.ts, node_modules/typescript/LICENSE.txt, node_modules/typescript/README.md, node_modules/typescript/SECURITY.md, node_modules/typescript/ThirdPartyNoticeText.txt, node_modules/typescript/bin/tsc, node_modules/typescript/bin/tsserver, node_modules/typescript/lib/_tsc.js, node_modules/typescript/lib/_tsserver.js, node_modules/typescript/lib/_typingsInstaller.js, node_modules/typescript/lib/cs/diagnosticMessages.generated.json, node_modules/typescript/lib/de/diagnosticMessages.generated.json, node_modules/typescript/lib/es/diagnosticMessages.generated.json, node_modules/typescript/lib/fr/diagnosticMessages.generated.json, node_modules/typescript/lib/it/diagnosticMessages.generated.json, node_modules/typescript/lib/ja/diagnosticMessages.generated.json, node_modules/typescript/lib/ko/diagnosticMessages.generated.json, node_modules/typescript/lib/lib.d.ts, node_modules/typescript/lib/lib.decorators.d.ts, node_modules/typescript/lib/lib.decorators.legacy.d.ts, node_modules/typescript/lib/lib.dom.asynciterable.d.ts, node_modules/typescript/lib/lib.dom.d.ts, node_modules/typescript/lib/lib.dom.iterable.d.ts, node_modules/typescript/lib/lib.es2015.collection.d.ts, node_modules/typescript/lib/lib.es2015.core.d.ts, node_modules/typescript/lib/lib.es2015.d.ts, node_modules/typescript/lib/lib.es2015.generator.d.ts, node_modules/typescript/lib/lib.es2015.iterable.d.ts, node_modules/typescript/lib/lib.es2015.promise.d.ts, node_modules/typescript/lib/lib.es2015.proxy.d.ts, node_modules/typescript/lib/lib.es2015.reflect.d.ts, node_modules/typescript/lib/lib.es2015.symbol.d.ts, node_modules/typescript/lib/lib.es2015.symbol.wellknown.d.ts, node_modules/typescript/lib/lib.es2016.array.include.d.ts, node_modules/typescript/lib/lib.es2016.d.ts, node_modules/typescript/lib/lib.es2016.full.d.ts, node_modules/typescript/lib/lib.es2016.intl.d.ts, node_modules/typescript/lib/lib.es2017.arraybuffer.d.ts, node_modules/typescript/lib/lib.es2017.d.ts, node_modules/typescript/lib/lib.es2017.date.d.ts, node_modules/typescript/lib/lib.es2017.full.d.ts, node_modules/typescript/lib/lib.es2017.intl.d.ts, node_modules/typescript/lib/lib.es2017.object.d.ts, node_modules/typescript/lib/lib.es2017.sharedmemory.d.ts, node_modules/typescript/lib/lib.es2017.string.d.ts, node_modules/typescript/lib/lib.es2017.typedarrays.d.ts, node_modules/typescript/lib/lib.es2018.asyncgenerator.d.ts, node_modules/typescript/lib/lib.es2018.asynciterable.d.ts, node_modules/typescript/lib/lib.es2018.d.ts, node_modules/typescript/lib/lib.es2018.full.d.ts, node_modules/typescript/lib/lib.es2018.intl.d.ts, node_modules/typescript/lib/lib.es2018.promise.d.ts, node_modules/typescript/lib/lib.es2018.regexp.d.ts, node_modules/typescript/lib/lib.es2019.array.d.ts, node_modules/typescript/lib/lib.es2019.d.ts, node_modules/typescript/lib/lib.es2019.full.d.ts, node_modules/typescript/lib/lib.es2019.intl.d.ts, node_modules/typescript/lib/lib.es2019.object.d.ts, node_modules/typescript/lib/lib.es2019.string.d.ts, node_modules/typescript/lib/lib.es2019.symbol.d.ts, node_modules/typescript/lib/lib.es2020.bigint.d.ts, node_modules/typescript/lib/lib.es2020.d.ts, node_modules/typescript/lib/lib.es2020.date.d.ts, node_modules/typescript/lib/lib.es2020.full.d.ts, node_modules/typescript/lib/lib.es2020.intl.d.ts, node_modules/typescript/lib/lib.es2020.number.d.ts, node_modules/typescript/lib/lib.es2020.promise.d.ts, node_modules/typescript/lib/lib.es2020.sharedmemory.d.ts, node_modules/typescript/lib/lib.es2020.string.d.ts, node_modules/typescript/lib/lib.es2020.symbol.wellknown.d.ts, node_modules/typescript/lib/lib.es2021.d.ts, node_modules/typescript/lib/lib.es2021.full.d.ts, node_modules/typescript/lib/lib.es2021.intl.d.ts, node_modules/typescript/lib/lib.es2021.promise.d.ts, node_modules/typescript/lib/lib.es2021.string.d.ts, node_modules/typescript/lib/lib.es2021.weakref.d.ts, node_modules/typescript/lib/lib.es2022.array.d.ts, node_modules/typescript/lib/lib.es2022.d.ts, node_modules/typescript/lib/lib.es2022.error.d.ts, node_modules/typescript/lib/lib.es2022.full.d.ts, node_modules/typescript/lib/lib.es2022.intl.d.ts, node_modules/typescript/lib/lib.es2022.object.d.ts, node_modules/typescript/lib/lib.es2022.regexp.d.ts, node_modules/typescript/lib/lib.es2022.string.d.ts, node_modules/typescript/lib/lib.es2023.array.d.ts, node_modules/typescript/lib/lib.es2023.collection.d.ts, node_modules/typescript/lib/lib.es2023.d.ts, node_modules/typescript/lib/lib.es2023.full.d.ts, node_modules/typescript/lib/lib.es2023.intl.d.ts, node_modules/typescript/lib/lib.es2024.arraybuffer.d.ts, node_modules/typescript/lib/lib.es2024.collection.d.ts, node_modules/typescript/lib/lib.es2024.d.ts, node_modules/typescript/lib/lib.es2024.full.d.ts, node_modules/typescript/lib/lib.es2024.object.d.ts, node_modules/typescript/lib/lib.es2024.promise.d.ts, node_modules/typescript/lib/lib.es2024.regexp.d.ts, node_modules/typescript/lib/lib.es2024.sharedmemory.d.ts, node_modules/typescript/lib/lib.es2024.string.d.ts, node_modules/typescript/lib/lib.es5.d.ts, node_modules/typescript/lib/lib.es6.d.ts, node_modules/typescript/lib/lib.esnext.array.d.ts, node_modules/typescript/lib/lib.esnext.collection.d.ts, node_modules/typescript/lib/lib.esnext.d.ts, node_modules/typescript/lib/lib.esnext.decorators.d.ts, node_modules/typescript/lib/lib.esnext.disposable.d.ts, node_modules/typescript/lib/lib.esnext.error.d.ts, node_modules/typescript/lib/lib.esnext.float16.d.ts, node_modules/typescript/lib/lib.esnext.full.d.ts, node_modules/typescript/lib/lib.esnext.intl.d.ts, node_modules/typescript/lib/lib.esnext.iterator.d.ts, node_modules/typescript/lib/lib.esnext.promise.d.ts, node_modules/typescript/lib/lib.esnext.sharedmemory.d.ts, node_modules/typescript/lib/lib.scripthost.d.ts, node_modules/typescript/lib/lib.webworker.asynciterable.d.ts, node_modules/typescript/lib/lib.webworker.d.ts, node_modules/typescript/lib/lib.webworker.importscripts.d.ts, node_modules/typescript/lib/lib.webworker.iterable.d.ts, node_modules/typescript/lib/pl/diagnosticMessages.generated.json, node_modules/typescript/lib/pt-br/diagnosticMessages.generated.json, node_modules/typescript/lib/ru/diagnosticMessages.generated.json, node_modules/typescript/lib/tr/diagnosticMessages.generated.json, node_modules/typescript/lib/tsc.js, node_modules/typescript/lib/tsserver.js, node_modules/typescript/lib/tsserverlibrary.d.ts, node_modules/typescript/lib/tsserverlibrary.js, node_modules/typescript/lib/typesMap.json, node_modules/typescript/lib/typescript.d.ts, node_modules/typescript/lib/typescript.js, node_modules/typescript/lib/typingsInstaller.js, node_modules/typescript/lib/watchGuard.js, node_modules/typescript/lib/zh-cn/diagnosticMessages.generated.json, node_modules/typescript/lib/zh-tw/diagnosticMessages.generated.json, node_modules/typescript/package.json, node_modules/undici-types/LICENSE, node_modules/undici-types/README.md, node_modules/undici-types/agent.d.ts, node_modules/undici-types/api.d.ts, node_modules/undici-types/balanced-pool.d.ts, node_modules/undici-types/cache-interceptor.d.ts, node_modules/undici-types/cache.d.ts, node_modules/undici-types/client-stats.d.ts, node_modules/undici-types/client.d.ts, node_modules/undici-types/connector.d.ts, node_modules/undici-types/content-type.d.ts, node_modules/undici-types/cookies.d.ts, node_modules/undici-types/diagnostics-channel.d.ts, node_modules/undici-types/dispatcher.d.ts, node_modules/undici-types/env-http-proxy-agent.d.ts, node_modules/undici-types/errors.d.ts, node_modules/undici-types/eventsource.d.ts, node_modules/undici-types/fetch.d.ts, node_modules/undici-types/formdata.d.ts, node_modules/undici-types/global-dispatcher.d.ts, node_modules/undici-types/global-origin.d.ts, node_modules/undici-types/h2c-client.d.ts, node_modules/undici-types/handlers.d.ts, node_modules/undici-types/header.d.ts, node_modules/undici-types/index.d.ts, node_modules/undici-types/interceptors.d.ts, node_modules/undici-types/mock-agent.d.ts, node_modules/undici-types/mock-call-history.d.ts, node_modules/undici-types/mock-client.d.ts, node_modules/undici-types/mock-errors.d.ts, node_modules/undici-types/mock-interceptor.d.ts, node_modules/undici-types/mock-pool.d.ts, node_modules/undici-types/package.json, node_modules/undici-types/patch.d.ts, node_modules/undici-types/pool-stats.d.ts, node_modules/undici-types/pool.d.ts, node_modules/undici-types/proxy-agent.d.ts, node_modules/undici-types/readable.d.ts, node_modules/undici-types/retry-agent.d.ts, node_modules/undici-types/retry-handler.d.ts, node_modules/undici-types/round-robin-pool.d.ts, node_modules/undici-types/snapshot-agent.d.ts, node_modules/undici-types/socks5-proxy-agent.d.ts, node_modules/undici-types/util.d.ts, node_modules/undici-types/utility.d.ts, node_modules/undici-types/webidl.d.ts, node_modules/undici-types/websocket.d.ts, package-lock.json, package.json, tsconfig.json, .harness/workflow/config.json
- [DONE] T001 — Каркас бэкенда, фильтр доступа и панель-оболочка (work)
  - Commit: feat: add backend skeleton with access filter and panel shell
  - Files: bin, package.json, package-lock.json, tsconfig.json, .gitignore, node_modules, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/backend-core/clusters/runtime/modules/data-store, product-parts/backend-core/clusters/http-api/modules/http-server, product-parts/control-panel/clusters/web-panel/modules/panel-shell, product-parts/system-service/clusters/deployment/modules/service-installer/src/index.ts, product-parts/system-service/clusters/deployment/modules/service-installer/module.md, product-parts/backend-core/product-part.md, product-parts/provider-runtime/product-part.md, product-parts/control-panel/product-part.md, product-parts/system-service/product-part.md, product-parts/backend-core/clusters/runtime/cluster.md, product-parts/backend-core/clusters/http-api/cluster.md, product-parts/backend-core/clusters/projects/cluster.md, product-parts/provider-runtime/clusters/provider-contract/cluster.md, product-parts/provider-runtime/clusters/provider-adapters/cluster.md, product-parts/control-panel/clusters/web-panel/cluster.md, product-parts/system-service/clusters/deployment/cluster.md
  - Depends on: QUALITY
- [DONE] T002 — Реестр проектов и выбор папки (work)
  - Commit: feat: add project registry and folder picker
  - Files: product-parts/backend-core/clusters/runtime/modules/data-store, product-parts/backend-core/clusters/http-api/modules/http-server, product-parts/backend-core/clusters/projects/modules/project-registry, product-parts/control-panel/clusters/web-panel/modules/panel-shell, package.json, product-parts/backend-core/clusters/runtime/modules/cli
  - Depends on: T001
- [DONE] T003 — Структура Kit v1, приём хука и wfk link (work)
  - Commit: feat: add kit structure installer and session start hook
  - Files: product-parts/backend-core/clusters/projects/modules/kit-structure, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/backend-core/clusters/runtime/modules/data-store, product-parts/backend-core/clusters/http-api/modules/http-server, product-parts/control-panel/clusters/web-panel/modules/panel-shell, package.json
  - Depends on: T002
- [DONE] T004 — Контракт провайдера, API, операции и утилиты процессов (work)
  - Commit: feat: add provider contract, registry, operations and process utilities
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor, product-parts/backend-core/clusters/runtime/modules/data-store, product-parts/backend-core/clusters/http-api/modules/http-server, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, package.json, product-parts/backend-core/clusters/runtime/modules/cli
  - Depends on: T003
- [DONE] T005 — Общий интерфейс провайдеров в панели (work)
  - Commit: feat: add generic provider cards to the panel
  - Files: product-parts/control-panel/clusters/web-panel/modules/provider-cards, product-parts/control-panel/clusters/web-panel/modules/panel-shell, package.json, product-parts/backend-core/clusters/runtime/modules/cli
  - Depends on: T004
- [DONE] T006 — Провайдер Claude (work, parallel-safe)
  - Commit: feat: implement claude provider
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, product-parts/backend-core/clusters/runtime/modules/cli/test/providers.test.ts
  - Depends on: T004
- [DONE] T007 — Провайдер Codex (work, parallel-safe)
  - Commit: feat: implement codex provider
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex
  - Depends on: T004
- [DONE] T008 — Установщик, автозапуск, запускатель и значок (work, parallel-safe)
  - Commit: feat: add backend installer, autostart and launcher
  - Files: product-parts/system-service/clusters/deployment/modules/service-installer
  - Depends on: T004
- [DONE] T010 — Подключение установщика к cli и панели (work)
  - Commit: fix: wire the service installer into the cli and panel
  - Files: product-parts/backend-core/clusters/runtime/modules/cli, product-parts/control-panel/clusters/web-panel/modules/panel-shell, product-parts/system-service/clusters/deployment/modules/service-installer, product-parts/system-service/product-part.md, product-parts/system-service/clusters/deployment/cluster.md, node_modules, .gitignore
  - Depends on: T008
  - Fixes: T008
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M1-orchestrator-core.md, docs/architecture/modules/cli.md, docs/architecture/modules/core.md, docs/architecture/modules/server.md, docs/architecture/modules/panel.md, docs/architecture/modules/service.md, docs/architecture/modules/kit-structure.md, docs/architecture/modules/providers.md, docs/architecture/modules/provider-claude.md, docs/architecture/modules/provider-codex.md, node_modules/@types/node/README.md, node_modules/typescript/README.md, node_modules/typescript/SECURITY.md, node_modules/undici-types/README.md, product-parts/system-service/clusters/deployment/modules/service-installer/module.md, product-parts/backend-core/product-part.md, product-parts/provider-runtime/product-part.md, product-parts/control-panel/product-part.md, product-parts/system-service/product-part.md, product-parts/backend-core/clusters/runtime/cluster.md, product-parts/backend-core/clusters/http-api/cluster.md, product-parts/backend-core/clusters/projects/cluster.md, product-parts/provider-runtime/clusters/provider-contract/cluster.md, product-parts/provider-runtime/clusters/provider-adapters/cluster.md, product-parts/control-panel/clusters/web-panel/cluster.md, product-parts/system-service/clusters/deployment/cluster.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md
  - Depends on: QUALITY, T001, T002, T003, T004, T005, T006, T007, T008, T010
- [DONE] T009 — Установка на Mac и приёмка вехи 1 (delivery)
  - Commit: docs: record milestone 1 acceptance
  - Files: docs/evidence/M1-acceptance.md
  - Depends on: T006, T007, T008, DOCS-R1

Digest: Milestone 1 core is in code: wfk CLI and createApp, data store with operations, HTTP API with the D8 access filter, project registry, Kit structure v1 with the SessionStart hook, provider contract with Claude and Codex providers, process supervisor, web panel with System, Projects, Structure and provider cards, and a service installer wired into the cli and panel. Device acceptance on Mac and iPad is still pending.

### R2 — Исправления по приёмке вехи 1 (fixes, OPEN)

- [TODO] T011 — Доверие Claude без подмены решений пользователя (work)
  - Commit: fix: grant claude trust explicitly and ask about external imports
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/control-panel/clusters/web-panel/modules/provider-cards, docs/planning/M1-providers.md
  - Fixes: T006
- [TODO] T012 — Codex отпускает тред после служебного хода (work, parallel-safe)
  - Commit: fix: release the codex thread after the service turn
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex
  - Fixes: T007
- [TODO] T013 — node_modules вне git и актуальные контракты модулей (work)
  - Commit: chore: stop tracking node_modules and refresh module contracts
  - Files: node_modules, product-parts/backend-core/clusters/runtime/modules/data-store/module.md, product-parts/backend-core/clusters/http-api/modules/http-server/module.md, product-parts/backend-core/clusters/projects/modules/project-registry/module.md, product-parts/backend-core/clusters/projects/modules/kit-structure/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md
  - Depends on: T011, T012
- [TODO] DOCS-R2 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R2
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M1-providers.md, product-parts/backend-core/clusters/runtime/modules/data-store/module.md, product-parts/backend-core/clusters/http-api/modules/http-server/module.md, product-parts/backend-core/clusters/projects/modules/project-registry/module.md, product-parts/backend-core/clusters/projects/modules/kit-structure/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md
  - Depends on: T011, T012, T013
- [TODO] T014 — Переустановка службы и повторная приёмка вехи 1 (delivery)
  - Commit: docs: record milestone 1 acceptance after fixes
  - Files: docs/evidence/M1-acceptance.md
  - Depends on: T011, T012, T013, DOCS-R2

State changes only through `scripts/workflow` commands. History lives in Git.
