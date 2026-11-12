# Часть продукта: kit-core

## Назначение

Исходники процесса Kit (Harness Workflow Kit): план со scope, раундами и задачами,
транзакционные коммиты задач, пакет восстановления, профиль качества, git-хуки, установка
и доктор проекта, режимы выполнения. Из этих исходников собирается бандл, который
приложение ставит в проекты пользователя (спецификация
[M22](../../docs/planning/M22-kit-source.md)). Описание процесса —
[docs/architecture/workflow-kit/](../../docs/architecture/workflow-kit/WorkflowKit.md).

## Кластеры

| Кластер | Назначение |
| --- | --- |
| [project-workflow](clusters/project-workflow/cluster.md) | 12 модулей Kit: `workflow-platform`, `workflow-plan`, `workflow-git`, `workflow-quality`, `workflow-recovery`, `workflow-autopilot`, `workflow-execution-mode`, `workflow-assignment`, `workflow-integration`, `workflow-kit`, `workflow-installer`, `workflow-host` |

## Границы

- Код части работает только внутри бандла Kit (`node <bundle> …`) и в своих тестах.
  Служба Workflow Kit его не импортирует: бандл ставит и запускает часть
  `workflow-engine` (`kit-host`).
- Модули Kit импортируют только встроенные модули Node и друг друга через относительные
  пути `../../<модуль>/src/<файл>.js`; npm-пакетов нет (в тестах — `typescript` и
  `esbuild`).
- Публичный вход модуля — `src/<модуль>-facade.ts` (так в Harness AI); `index.ts` и
  псевдонимов `#…` в `package.json` нет.
- Тесты модулей — `test/*.test.mjs`: помощник `workflow-platform/test/workflow-test-build.mjs`
  переводит исходники TypeScript во временную папку `.harness/runtime/` и грузит их оттуда.

## Происхождение и синхронизация

- Источник: репозиторий Harness AI, коммит `94a9d457` (2026-11-12). Исходники Kit в нём
  не менялись с `7afe27ad` — это код Kit 2.2.3.
- Перенос: `core-runtime/clusters/project-workflow/**` → `kit-core/clusters/project-workflow/**`,
  `docs/architecture/workflow-kit/*.md` → `docs/architecture/workflow-kit/*.md`.
- Harness AI дальше развивается отдельно; модули сверяются по просьбе пользователя
  (решение 2026-11-12). При сверке правки ниже не переносятся обратно как ошибки.

Правки переноса (спецификация M22, раздел 2.3):

1. Тесты и помощники тестов (`*.mjs`) перенесены из `src/` в `test/`; импорты помощников
   `workflow-test-build.mjs` и `workflow-git-test-repo.mjs` указывают на `test/`; пути в
   `module.md`, `cluster.md` и документах Kit — тоже; в «Owned Paths» добавлено `test/**`.
2. Платформа — параметром: `currentWorkflowPlatform(platform?)` в `platform-paths.ts`,
   опция `platform` у `install` (`installer-install.ts`) и `doctor`
   (`installer-doctor.ts`); новый тест `workflow-installer-platform.test.mjs`.
3. `powershell` (`platform-launchers.ts`) и `cmd.exe` (`platform-process.ts`) записаны в
   `tools/platform-guard/allowlist.json`.
4. `workflow-host-facade.test.mjs` собирает бандл esbuild-ом, а не vite.
5. Разделы «Поведение на ОС» в `module.md` модулей `workflow-platform` и
   `workflow-installer`, раздел «В Workflow Kit» в `cluster.md`.
6. Ссылки документов Kit на документы, которых нет в Workflow Kit
   (`ReleaseFixes-2026-11-04-2.md`, `ReleaseFixes-2026-11-04-3.md`,
   `ClaudeSubagentSessions.md`), ведут на эти документы в Harness AI на коммите
   `94a9d457`.

7. Лимит файла этого репозитория — 400 строк (`policy.maxFileLines`; в Harness AI лимита
   нет). 17 файлов Kit длиннее разбиты без изменения поведения: части кода — в соседние
   файлы `src/` с относительным импортом, помощники и данные тестов — в `test/*-support.mjs`
   или во второй файл теста. Какие файлы появились — в `module.md` модулей.

## Поведение на ОС

Kit работает на macOS, Linux и Windows: ветки ОС — в `workflow-platform` (пути, запускатели
`sh`, `.ps1` и `.cmd`, запуск `.cmd` через `cmd.exe`) и `workflow-installer` (режимы файлов,
проверка `executable`); таблицы — в их `module.md`.

## Зависимости

Нет: часть не использует другие части продукта.
