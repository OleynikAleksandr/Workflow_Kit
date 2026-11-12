# M22: исходники Kit в Workflow Kit и обновление Kit с экрана проекта

Статус: предложена 2026-11-12, план ждёт выбора режима.

## Цель и согласование

Код процесса Kit (Harness Workflow Kit) сейчас лежит в другом репозитории — Harness AI.
Workflow Kit получает его только готовым бандлом (`kit-bundle/vendor/*.mjs.gz`). Любое
исправление Kit проходит два репозитория: scope и выпуск в Harness AI, потом перенос бандла
и выпуск здесь. Так было в M21. Кроме того, в панели Workflow Kit не видно версии Kit
проекта и нельзя обновить Kit открытого проекта: обновление есть только в мастере «Открыть
папку проекта».

После этой работы:

- исходники Kit — модули этого репозитория; бандл собирается здесь же, одной командой;
- первый бандл, собранный здесь, — Kit **2.2.4**;
- экран проекта показывает версию Kit, а для устаревшего Kit — карточку «Обновить Kit» с
  одним нажатием, без мастера и без новой сессии.

Решение пользователя, 2026-11-12: «Давай переезжать со всем этим бэкэндом в наш проект
Workflow Kit и с китом, и с харнесом… Я предлагаю перенести, скопировать все необходимые
модули, которые используются в Workflow Kit из Harness AI в сам код Workflow Kit, в проект.
Да, на каком-то этапе эти модули по составу и по функциональности разъедутся. Но ничего,
тогда, когда мне понадобится проект Harness AI, я попрошу тебя их синхронизировать. Но
сейчас мы занимаемся разработкой workflow Kit». В панели выбрано: спецификация и план без
ревью.

## 1. Принципы

- Kit по-прежнему работает отдельным процессом `node <bundle> …`. Служба не импортирует код
  Kit: граница части `workflow-engine` не меняется. Исходники нужны, чтобы собирать бандл и
  править Kit здесь.
- Модули копируются из Harness AI как есть: те же имена модулей и файлов, тот же код. Так
  будущая синхронизация остаётся сравнением файлов. Каждая правка при переносе записана в
  `product-part.md` (раздел «Происхождение и синхронизация»).
- Harness AI в этой работе не меняется. Синхронизация — по отдельной просьбе пользователя.
- Версии Kit идут своей линией (2.2.4, 2.2.5…), отдельно от версии приложения (0.9.x).
- Запись в проект пользователя делает только Kit (`install --update`); служба лишь
  запускает команду и показывает результат.

## 2. Решение

### 2.1. Что переносится (проверено 2026-11-12)

Источник — Harness AI, коммит `94a9d457`. Исходники Kit в нём не менялись с `7afe27ad`
(Kit 2.2.3), то есть переносится ровно код 2.2.3.

- 12 модулей кластера `core-runtime/project-workflow`: `workflow-assignment`,
  `workflow-autopilot`, `workflow-execution-mode`, `workflow-git`, `workflow-host`,
  `workflow-installer`, `workflow-integration`, `workflow-kit`, `workflow-plan`,
  `workflow-platform`, `workflow-quality`, `workflow-recovery`. Это около 21 000 строк
  кода, 97 файлов `.ts`, у каждого модуля `module.md`, 51 файл тестов `.test.mjs` и три
  помощника тестов `.mjs`.
- Наружу модули импортируют только встроенные модули Node (`node:*`). Между собой — через
  относительные пути `../../<модуль>/src/<файл>.js`.
- Документы Kit: `docs/architecture/workflow-kit/*.md` (10 файлов, 176 КБ). На них
  ссылаются `module.md` модулей.

Пробы на копии (scratchpad, 2026-11-12):

- проверка типов с `tsconfig.json` Workflow Kit (strict, `noUncheckedIndexedAccess`,
  `erasableSyntaxOnly`, `verbatimModuleSyntax`) — 0 ошибок; в коде нет `enum`, свойств в
  параметрах конструктора и `namespace`;
- тесты с `node_modules` Workflow Kit: 50 из 51 прошли; упал `workflow-host-facade.test.mjs`
  — он собирает бандл через `vite`, которого здесь нет;
- `platform-guard` на копии — 10 замечаний: `process.platform` напрямую в
  `installer-doctor.ts:120`, `installer-install.ts:111`, `platform-paths.ts:19–20`;
  программы `powershell` (`platform-launchers.ts:83`) и `cmd.exe` (`platform-process.ts:121`)
  без записи в allowlist; ещё 3 — в тестах, лежащих в `src/`;
- esbuild 0.25.12 собрал из копии один файл `workflow.mjs` (13 197 строк, импорты только
  `node:*`). На нём прошли `help`, `status`, `install` во временный проект с первым
  коммитом и `doctor` установленного проекта.

### 2.2. Размещение

Новая часть продукта `kit-core`:

```text
product-parts/kit-core/product-part.md
product-parts/kit-core/clusters/project-workflow/cluster.md
product-parts/kit-core/clusters/project-workflow/modules/<модуль>/module.md
product-parts/kit-core/clusters/project-workflow/modules/<модуль>/src/*.ts
product-parts/kit-core/clusters/project-workflow/modules/<модуль>/test/*.test.mjs
```

- Имя кластера и модулей — как в Harness AI, поэтому относительные импорты
  `../../<модуль>/src/…` работают без правок.
- Тесты и помощники тестов переезжают из `src/` в `test/`. Глубина та же, поэтому импорты
  тестов `../../<модуль>/src/…` не меняются. Меняются импорты помощника
  `workflow-test-build.mjs` из других модулей (`…/workflow-platform/test/…`) и
  `MODULES_ROOT` в нём, если понадобится.
- Публичный вход модуля Kit — его `src/<модуль>-facade.ts`, как в Harness AI; `index.ts`
  не добавляется. Это исключение записано в `product-part.md`. Псевдонимов `#…` в
  `package.json` у модулей Kit нет: служба их не импортирует.
- Документы Kit копируются в `docs/architecture/workflow-kit/`.

### 2.3. Правки при переносе

Только то, чего требуют правила этого репозитория. Каждая правка записана в
`product-part.md`:

1. Платформа как параметр (`platform ?? process.platform`) в `installer-doctor.ts`,
   `installer-install.ts` и `platform-paths.ts`; для веток `win32` и `linux` — тесты с
   подставленной платформой.
2. Записи в `tools/platform-guard/allowlist.json` для `powershell` и `cmd.exe`: что
   делается на macOS, Linux и Windows.
3. Тесты в `test/` (см. 2.2).
4. Тест `workflow-host-facade.test.mjs` собирает бандл через esbuild вместо vite.
5. В `module.md` модулей `workflow-installer` и `workflow-platform` — раздел «Поведение на
   ОС».

Тексты, которые Kit пишет в проекты (управляемые разделы `AGENTS.md`, шаблоны хуков,
ссылки вида `docs/architecture/OVERVIEW.md` и `docs/spec.md` — это соглашения для проектов
пользователя), не меняются.

### 2.4. Проверки и инструмент сборки

- **esbuild 0.25.12** — новая зависимость разработки (`devDependencies`, точная версия).
  Нужен только для сборки бандла; приложение пользователя его не использует, потому что
  собранный бандл лежит в репозитории. Установка — через `quality:apply` с согласием
  пользователя в `approval`; без согласия T001 не начинается.
- Проверка `test` профиля качества и `npm test` получают второй шаблон
  `product-parts/**/test/*.test.mjs` (через `quality:apply`, профиль руками не правится).
- Помощник `workflow-test-build.mjs` пишет временные файлы в `.harness/runtime/`; в
  `.gitignore` эта папка уже есть.

### 2.5. Сборка бандла (`tools/kit-build`)

`npm run build:kit` (`node tools/kit-build/build.ts`):

1. esbuild собирает `product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-cli.ts`
   в один ESM-файл для Node (`--bundle --platform=node --format=esm`), запуск из корня
   репозитория, чтобы пути в комментариях были относительными.
2. Отказ, если в бандле есть импорт не `node:*`.
3. Проверка: `help`, `status`, `validate` на пустой папке, `install` во временный
   git-проект, `validate` и `doctor` через его `scripts/workflow` (как
   `build-workflow-kit.mjs` в Harness AI). Git-личность берётся из временного
   `GIT_CONFIG_GLOBAL`.
4. Пишет `kit-bundle/vendor/workflow-kit-<версия>.mjs.gz`, удаляет gzip прежней версии,
   пишет `vendor/PROVENANCE` и `kit-bundle/src/bundle-meta.ts` (версия, sha256 бандла,
   дайджест исходников). `bundle.ts` берёт константы оттуда.

`PROVENANCE`: источник — этот репозиторий (`product-parts/kit-core`); базовый коммит
Harness AI `94a9d457`; версия esbuild; строки; sha256 распакованного бандла; дайджест
исходников — sha256 по отсортированным путям и содержимому `kit-core/**/src/*.ts`.

Тест `tools/kit-build/test/kit-build.test.ts` (идёт в обычном `npm test`):

- дайджест исходников равен записанному в `PROVENANCE`: правка Kit без пересборки
  бандла не пройдёт коммит;
- сборка в память даёт тот же sha256, что записан.

Версия Kit — константа `KIT_VERSION` в `workflow-installer/src/installer-payload.ts`;
в T002 она становится `2.2.4`.

### 2.6. Kit на экране проекта — служба

Новый модуль `workflow-engine/kit-host/kit-update` (по образцу `git-publish`):

- раздел `kitUpdate` в `/api/state`: для каждого активного проекта
  `{ installed, bundled, state, action, running, error?, last? }`. `installed` и `state`
  — из `inspect` (`kit-runner`); `bundled` — `KIT_VERSION` из `#kit-bundle`; `action` —
  `update`, если `state` равно `KIT_OUTDATED` или `KIT_OK` с другой версией, иначе `none`.
  Раздел читает только кэш; `inspect` запускается при старте, после изменения плана, после
  обновления и раз в 60 с;
- `POST /api/projects/:id/kit/update` (202): `install --update` через `kit-runner`. Затем
  для Codex, если папка доверена: читается `hooks(project)`, и если хук Kit не одобрен,
  `approveHooks` с его командой и хешем. Kit одобряет только хуки Kit и хук Harness с точной
  командой (M21). Пользователю ничего подтверждать не нужно. Claude и Kimi одобрения хуков
  не требуют;
- ошибка Kit (`code`, `message`, `nextAction`) сохраняется в `error` и показывается в
  карточке; повторный запуск во время работы — 409 `busy`;
- в журнал службы — строка `kit: updated <project> <from> → <to>`.

### 2.7. Kit на экране проекта — панель

- В заголовке экрана проекта — строка «Kit 2.2.4» или «Kit не установлен — «Открыть папку
  проекта»».
- При `action: update` — карточка «Kit 2.2.3 → 2.2.4» с пояснением: «Kit обновит свои файлы
  и хуки проекта одним коммитом; сессии, начатые до обновления, получат новый пакет со
  следующей сессии». Кнопка «Обновить Kit» — это и есть согласие; во время работы — «Kit
  обновляется…».
- После успеха — «Kit обновлён до 2.2.4» и что сделано с хуками Codex; после ошибки — текст
  Kit и его следующий шаг.
- Мастер «Открыть папку проекта» работает как раньше.

### 2.8. Архивные и убранные сессии не участвуют в процессе

Найдено 2026-11-12: сессия Kimi, которую пользователь отправил в архив (15:06) и убрал из
списка (15:08), осталась в канале «работающей» (хук начала хода в 15:05, хука конца хода не
было). Экран сессии прячет карточку выбора пути, пока в проекте есть работающая сессия, и
карточка не появилась. Сейчас архив учитывает только доставка сообщений панели
(`archived` в `agent-channel`); состояние канала, карточка выбора, ревью и автопилот его не
смотрят.

Решение пользователя, 2026-11-12: «У нас есть убрать её из списка. Это когда мы переносим
сессию в архив. А значит, мы должны её убирать, эту сессию, и из всего workflow кита. За ней
следить, то есть она не должна уже дальше участвовать ни в чем.»

Правило: сессия **выходит из процесса Kit**, если она в архиве (`archivedAt`) или убрана из
списка (`forgottenAt`) в `session-titles`. Пока сессия в архиве, её можно вернуть
(«Вернуть»), и тогда она снова участвует. Убранная из списка не возвращается.

- `session-titles`: `excluded(projectId, key)` — true для архивной или убранной сессии.
- `agent-channel`: хуки такой сессии (`stop`, `prompt`, `turn-end`) получают пустой ответ:
  без удержания, без доставки очереди и без продолжения; её очередь очищается, новые
  сообщения отклоняются (409 `session-archived`). В разделе `channel` её нет. При архивации
  запись канала удаляется сразу, без ожидания хука.
- `autopilot`, `plan-review`, `cross-review`: не выбирают такую сессию ни для продолжения,
  ни основной, ни рецензентом.
- `session-view`: держатель карточки выбора и ожидание ревью считают только сессии, которые
  участвуют в процессе.
- `cli/session-wiring.ts`: передаёт `excluded` в канал, автопилот и ревью.
- Пакет восстановления Kit приходит и в такую сессию: его даёт хук Kit проекта, не служба.

## 3. Поведение на ОС

| Что | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Исходники и тесты Kit | одинаково | одинаково | одинаково; ветки `win32` Kit (`.cmd`-запускатели, `powershell`, `cmd.exe`) — с подставленной платформой |
| Сборка `npm run build:kit` | esbuild darwin-arm64/x64 | esbuild linux-x64/arm64 | esbuild win32-x64 и win32-arm64; файлы с LF (`.gitattributes`) |
| Тест свежести бандла | одинаково на всех ОС: дайджест исходников и sha256 пересборки | то же | то же; если пересборка на Windows даст другой sha256, тест сравнивает только дайджест и причина записывается |
| Карточка «Обновить Kit» | одинаково | одинаково | одинаково; одобрение хука Codex — по `commandWindows`, как в M21 |
| Архивные и убранные сессии | одинаково | одинаково | одинаково |

## 4. Проверка

- Автоматические тесты: архивная и убранная сессия не держит карточку, не получает сообщений и не выбирается рецензентом; 51 тест Kit в обычном `npm test`; ветки `win32` и `linux` — с
  подставленной платформой; тест свежести бандла; тесты `kit-update` (раздел, маршрут,
  одобрение хука Codex, ошибки Kit, `busy`) и модели карточки в `panel-shell`.
- CI: macOS, Linux, Windows x64 и ARM64. Тесты Kit в Harness AI в CI не шли (там нет CI),
  поэтому первые падения на Linux и Windows возможны; они исправляются раундом исправлений.
- Живая проверка: macOS — пользователь: в службе 0.9.3 на проекте с Kit 2.2.3 экран
  показывает карточку, «Обновить Kit» обновляет до 2.2.4, хук Codex одобрен сам, новые
  сессии Claude и Codex получают пакет целиком. Windows — проверяющий на Windows; Linux —
  только CI.

## 5. Границы

- Harness AI не меняется; синхронизация модулей — отдельная работа по просьбе пользователя.
- Новых возможностей Kit нет: 2.2.4 = 2.2.3 + правки переноса.
- Интерфейс Harness AI (React) не переносится; карточка пишется заново в панели.
- Kit этого репозитория обновляется до 2.2.4 после закрытия scope (карточкой).
- Хуки и пакет Kimi — как в M21 (отложено).

## 6. План

| Задача | Содержание | Файлы |
| --- | --- | --- |
| T000 | Архивные и убранные сессии выходят из процесса Kit (2.8) | `agent-channel`, `session-titles`, `autopilot`, `plan-review`, `cross-review`, `session-view`, `cli/src/session-wiring.ts` |
| T001 | Исходники Kit: перенос 12 модулей и документов, правки 2.3, esbuild и шаблон тестов через `quality:apply` | `product-parts/kit-core/`, `docs/architecture/workflow-kit/`, `tools/platform-guard/allowlist.json`, `package.json`, `package-lock.json`, `docs/architecture/OVERVIEW.md` |
| T002 | Сборка бандла здесь, Kit 2.2.4 | `tools/kit-build/`, `package.json`, `kit-bundle/`, `installer-payload.ts` и `module.md` `workflow-installer`, тесты, ссылающиеся на версию |
| T003 | Служба: раздел `kitUpdate`, маршрут обновления, одобрение хука Codex | `workflow-engine/clusters/kit-host/modules/kit-update/`, `cluster.md` kit-host, `package.json`, `cli/src/app.ts`, `cli/module.md` |
| T004 | Панель: версия Kit и карточка «Обновить Kit» | `panel-shell/src/` (новый `kit-card.js`, `screens.js`, `view-model.js`, `actions.js`), тесты, `module.md` |
| DOCS | README, OVERVIEW, эта спецификация | добавляет Kit |
| T005 | Выпуск 0.9.3, CI на всех ОС, приёмка M22 | `package.json`, `package-lock.json`, `CHANGELOG.md`, `README.md`, `docs/installation.md`, `docs/usage.md`, `docs/evidence/M22-acceptance.md`, `docs/architecture/OVERVIEW.md` |

Задачи идут по порядку: T002 и T003 обе меняют `package.json`, T004 зависит от T003.
