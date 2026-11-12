# M23: тесты Kit на Windows — CI выпуска 0.9.3

Статус: R1 — T001 `501acca` (исправления 1–4), T002 `c9f2126` (CI 43270655505: на Windows
осталось 6 тестов); R2 — T003 `1ab318e` (исправления 5–8), CI на всех ОС — T004.

## Цель и согласование

Выпуск 0.9.3 (M22) собран и закоммичен (`d67661b`), scope `m22-kit-source` принят и закрыт в
панели. CI ветки `ci/m22-kit-source` (запуск 43266183754): macOS ARM64 и Linux x64 зелёные,
Windows x64 и Windows ARM64 — красные. Тесты приложения на Windows прошли (680 + 66
пропущенных не для Windows); упали 15 из 57 тестов Kit. Это предсказано в M22 (раздел 4): в
Harness AI тесты Kit в CI не шли. По правилам проекта выпуск не готов, пока CI не зелёный на
всех ОС, а `main` публикуется только после этого.

Решение пользователя, 2026-11-12: «Пожалуйста, не останавливайся вплоть до сборки. И выпуска
«093».»

## 1. Принципы

- Код Kit (`src/`) не меняется: все 15 падений — в тестах и их помощниках. Дайджест
  исходников Kit не меняется, бандл 2.2.4 не пересобирается.
- Версия остаётся 0.9.3: на GitHub она не опубликована, пользователь видимых изменений не
  получает.
- Тесты остаются теми же проверками: меняются только пути, URL импорта и подставной `npm`.

## 2. Причины и исправления (CI 43266183754, Windows x64 и ARM64 одинаково)

1. **Импорт по абсолютному пути (11 тестов).** Заглушки бандла пишут
   `import { … } from "D:\a\…\workflow-kit-cli.js"`. Загрузчик ESM Node на Windows
   принимает только `file://`: `ERR_UNSUPPORTED_ESM_URL_SCHEME … Received protocol 'd:'`.
   Падали коммиты Kit в тестовых проектах (хук коммита запускал заглушку). Исправление:
   `pathToFileURL(…).href` в 10 файлах — `workflow-kit-support.mjs`,
   `workflow-kit-hooks.test.mjs`, `workflow-kit-ignored-commit.test.mjs`,
   `workflow-installer-doctor.test.mjs`, `workflow-installer-migrate.test.mjs`,
   `workflow-installer-install-support.mjs`, `workflow-recovery-worktree.test.mjs`,
   `orchestration-scenario-support.mjs`, `workflow-integration-facade.test.mjs`,
   `workflow-integration-merge-support.mjs`.
2. **Короткие имена 8.3 (2 теста).** На раннере `tmpdir()` — `C:\Users\RUNNER~1\…`, а git
   сообщает длинный путь `C:/Users/runneradmin/…`. `assignment:cancel` не нашёл worktree по
   записи и не смог удалить ветку; `context` с абсолютным путём счёл файл внешним.
   Исправление: временные папки тестов — `realpathSync.native` (длинный путь на Windows,
   `/private/var` на macOS) в `workflow-assignment-cancel.test.mjs`,
   `workflow-kit-worktree.test.mjs`, `workflow-kit-context-command.test.mjs`.
3. **Слэши git (1 тест).** `gitPath` отдаёт путь git с прямыми слэшами и на Windows; тест
   `workflow-git-history.test.mjs` сравнивал с `path.join(".git", "hooks")`. Исправление:
   сравнение регулярным выражением с любым разделителем.
4. **Подставной `npm` (1 тест).** `workflow-kit-worktree.test.mjs` кладёт sh-скрипт `npm`, а Kit
   на Windows ищет `npm` с `PATHEXT` (`npm.cmd`); вдобавок `{ ...process.env }` на Windows
   хранит путь поиска под ключом `Path`, и тест собирал `PATH` как `bin;undefined`. Исправление:
   рядом `npm.cmd` с тем же поведением, `PATH` — под тем ключом, который есть в окружении.

Проверено на macOS (копия в scratchpad): 53 из 53 тестов Kit проходят с исправлениями.

### 2.1. Второй проход (CI 43270655505, после T001 `501acca`)

Тест останавливается на первом падении, поэтому за исправленным открылись следующие места.
macOS и Linux зелёные; на Windows x64 и ARM64 упали 6 тестов Kit из 57:

5. **Ещё три временные папки 8.3.** `orchestration-scenario.test.mjs`,
   `workflow-kit-executor.test.mjs`, `workflow-recovery-worktree.test.mjs` ждали путь
   `C:\Users\RUNNER~1\…`, а Kit отдал длинный. Исправление: `realpathSync.native`.
6. **Путь worktree от git.** `assignment:cancel` возвращает путь, как его пишет git
   (`C:/Users/…`); `workflow-assignment-cancel.test.mjs` сравнивал с `C:\Users\…`.
   Исправление: сравнение после `path.resolve`.
7. **Кавычки `cmd.exe`.** Kit запускает `npm.cmd` через `cmd.exe /d /s /c` и берёт аргументы
   в кавычки, поэтому `%*` подставного `npm.cmd` печатал `fake npm "ci"`. Исправление:
   `%~1`.
8. **Проверка `executable` doctor.** На Windows нет битов исполнения, и doctor этой проверки
   не делает; `workflow-installer-doctor.test.mjs` её ждал. Исправление: тест ждёт её только
   вне Windows (платформа — из `workflowPlatformFacade` сборки теста).

Исправления 5–8 проверены на macOS: 6 из 6 тестов проходят.

### 2.2. Третий проход (CI 43272867981, после T003 `1ab318e`)

macOS и Linux зелёные; на Windows x64 и ARM64 упали 3 теста Kit из 57:

9. **Список worktree от git.** Помощник `orchestration-scenario-support.mjs` берёт пути из
   `git worktree list --porcelain` (`C:/Users/…`); тест сравнивал с `C:\Users\…`.
   Исправление: `path.resolve` в помощнике.
10. **Аргументы `.cmd`-шима.** Kit экранирует аргументы `.cmd` дважды: настоящий `npm.cmd`
    разбирает их ещё раз, а подставной только печатает — и `%~1`, и `%*` дают `"ci"`. Это
    поведение Kit для настоящих шимов верно. Исправление: подставной печатает `%*`, тест
    принимает `ci` и `"ci"`.
11. **Нечего чинить.** Без битов исполнения после копирования личности doctor не находит, что
    чинить, и `fix` равен `null`; тест ждал `fix.written`. Исправление: на Windows тест ждёт
    `fix: null`.

Исправления 9–11 проверены на macOS: 3 из 3 тестов проходят.

## 3. Поведение на ОС

| Что | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Тесты Kit | как прежде | как прежде | импорт заглушек по `file://`, длинные пути временных папок, `npm.cmd` и ключ `Path` |
| Код Kit и бандл 2.2.4 | не меняются | не меняются | не меняются |

## 4. Проверка

- CI ветки `ci/m23-kit-tests-windows`: macOS ARM64, Linux x64, Windows x64 и ARM64 зелёные.
  Если CI найдёт новые падения (тест останавливается на первом), они исправляются следующей
  задачей этого же scope.
- Живые проверки выпуска 0.9.3 — как в `docs/evidence/M22-acceptance.md`.

## 5. Границы

- Kit не раскрывает короткие имена 8.3 в своём коде (`context`, `assignment:cancel`): пути
  агентов и git на Windows длинные; правка кода Kit — отдельной работой.
- `kit:file-lines` считает строки `package-lock.json` (M22, раздел 7) — отдельной работой.
- Harness AI не меняется.

## 6. План

| Задача | Содержание | Файлы |
| --- | --- | --- |
| T001 | Тесты Kit на Windows: исправления 1–4 | `product-parts/kit-core/clusters/project-workflow/modules/*/test/` (14 файлов), `product-parts/kit-core/product-part.md` |
| DOCS | спецификация, приёмка M22 | добавляет Kit |
| T002 | запись CI 43270655505: на Windows осталось 6 тестов | `docs/evidence/M22-acceptance.md`, `docs/planning/M23-kit-tests-windows.md` |
| R2: T003 | исправления 5–8 | 6 тестов Kit, `product-parts/kit-core/product-part.md` |
| R2: T004 | запись CI 43272867981: на Windows осталось 3 теста | `docs/evidence/M22-acceptance.md`, эта спецификация |
| R3: T005 | исправления 9–11 | 3 теста Kit и помощник, `product-parts/kit-core/product-part.md` |
| R3: delivery | CI выпуска 0.9.3 на всех ОС | `docs/evidence/M22-acceptance.md`, эта спецификация |
