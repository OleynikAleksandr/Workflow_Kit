# Интеграция Speech Input в main

## Цель и согласование

Голосовой ввод (Speech Input) разработан отдельно: дерево
`/Users/oleksandroliinyk/VSCODE/Workflow_Kit_Speech`, ветка `feature/speech-input`,
база `bbab32d72f8a899cc6a01a0aadb5d741efb21bf2`, готовый HEAD
`5e990e3ac62bea0df331ee002d1086775df8bb81`. Все 11 пунктов его плана выполнены, релиз не
собирался. Этот scope переносит результат в main, проверяет объединённый код, доставляет
нативный helper в установленное приложение и выпускает 0.17.0.

Поручение пользователя, 17.11.2026: «После завершения своего текущего плана интегрируй Speech
в main через merge ветки feature/speech-input… Сохрани план и историю основного проекта…
Из quality config перенеси необходимые speech-проверки штатными командами Kit… До сборки релиза
проверь именно объединённый код… Сборку релиза начинай после успешной интеграции и необходимых
проверок. Учти: packaging helper ещё не реализован».

Передача и доказательства ветки: `docs/planning/speech-input-integration.md` и
`docs/evidence/speech-input-acceptance.md` на `feature/speech-input` (после T001 — в main).

## 1. Принципы

- **Перенос коммитом задачи, а не коммитом слияния.** Kit отклоняет прямой коммит
  (`MANAGED_COMMIT_REQUIRED` хука `pre-commit`), а коммит с двумя родителями создаёт только
  интеграция коммита исполнителя (роль `integration`, `INTEGRATION_HISTORY` проверяет трейлеры
  assignment). Обход хука (`--no-verify`) запрещён правилами проекта. Кроме того, 23 коммита
  ветки несут ревизии отдельного плана Speech в `.harness/plans/todo-plan.md` и смешали бы
  историю плана main. Поэтому T001 выполняет `git merge --squash --no-commit feature/speech-input`
  (без `MERGE_HEAD`), разрешает конфликты и коммитит `commit --task T001`; сообщение коммита
  называет ветку и SHA `5e990e3`. Ветка `feature/speech-input` остаётся с полной историей.
- **План, история и Kit main не меняются переносом.** `.harness/plans/todo-plan.md` и
  `.harness/workflow/**` берутся из main (`git checkout HEAD -- …` после squash). Kit runtime,
  bundle, launchers, настройки и версия приложения 0.16.0 остаются из main; изменения M40 не
  откатываются.
- **Профиль качества — командой Kit.** До предложения плана `quality:apply` записал профиль
  main с двумя изменениями из Speech (коммит `8cafd65`): проверка `test` запускает
  `node tools/speech-checks/test.mjs` (обе прежние Node-группы, без исключений; окружение
  Git hook очищается для временных репозиториев тестов), новая обязательная проверка
  `speech-native` — `cargo test --locked` helper для путей `product-parts/speech-input/**/speech-helper/**`.
  Builtins, `docs.contracts` и `policy` main сохранены.
- **Релиз — после проверок объединённого кода.** Зелёные тесты исходников не доказывают
  работу установленного приложения: поставка проверяет установленный экземпляр.

## 2. Решение

### 2.1. T001: перенос

Конфликты и точки совмещения (по передаче Speech):

| Файл | Решение |
| --- | --- |
| `.harness/plans/todo-plan.md`, `.harness/workflow/config.json` | версия main (HEAD) |
| `package.json` | версия main 0.16.0; aliases `#speech-service`, `#speech-input`; `ws` 8.23.0, `@types/ws` 8.18.2; скрипт `test:speech-native` |
| `package-lock.json` | формат Speech (строка на пакет, предел 400 строк), версия 0.16.0; проверка `npm ci` и JSON |
| `cli/src/app.ts` | speech imports, static mount, служба и маршруты, `stopSpeech` до остановки HTTP; регистрации M40 сохраняются |
| `http-server` | реестр `addUpgrade`, отказ неизвестного upgrade; access/CSP guards main |
| `session-chat`, `panel-shell` | composer, question-card, Settings Speech; изменения M40 (карточки решений) сохраняются |
| `.github/workflows/ci.yml`, `tsconfig.json` | Rust 1.88.0 и `npm run test:speech-native` в четырёх заданиях; exclude `**/target/**` |
| `README.md`, `docs/architecture/OVERVIEW.md`, `docs/architecture/OS-MATRIX.md` | текст main плюс разделы Speech; размер ≤ 28 000 байт (строки M40 матрицы уже вынесены в `OS-MATRIX-M40.md`) |

Перед коммитом: `npm ci`, `cargo test --locked` (наполняет `target` до проверки хука).

### 2.2. T002: проверка объединённого кода

На SHA T001, в main, с отдельными `WFK_DATA_DIR`, свободными портами и абсолютным
`WFK_SPEECH_HELPER`; действующая служба и её данные не используются.

1. `npm ci`, `npm run typecheck`, `node tools/speech-checks/test.mjs`, `npm run check:platforms`,
   `scripts/workflow validate` и builtins Kit.
2. `npm run test:speech-native` и debug `cargo build --locked` helper.
3. Браузерные сценарии (Playwright из глобальной установки): `speech-composer`,
   `speech-question`, `speech-settings`, `capture-negative`; регрессия m28/m33.
4. Настоящий Voxtral: `streaming.smoke.mjs` (Q8, до EOF), `runtime-switch.smoke.mjs`
   (Q8/Q4 и Q6), `real-browser.smoke.mjs` (AudioWorklet → WebSocket → helper → черновик).

Результаты, метрики и ограничения — `docs/evidence/speech-integration-acceptance.md`.
Дефект объединённого кода — раунд исправлений `plan:extend`, не правка завершённой T001.

### 2.3. T003: доставка в установленное приложение (`service-installer`, `cli`)

Служба ищет helper по `<appDir>/speech/wfk-speech-helper`, где `appDir` — каталог данных
`data-store` (macOS `~/Library/Application Support/Workflow Kit`; с `WFK_DATA_DIR` — этот
каталог). Установщик сейчас копирует `bin`, `product-parts`, `package.json` без `node_modules`:
установленная служба не нашла бы `ws`, а каталог Cargo `target` попал бы в копию.

**Загрузка CLI без серверных зависимостей.** Ветка Speech добавляет статическую цепочку
`bin/wfk.mjs → #cli (index.ts) → app.ts → #speech-service → ws`: без `ws` процесс падает до
любой команды. `cli` загружает `app.ts` только для `serve`: `commands.ts` берёт его через
`await import('./app.ts')`, `index.ts` экспортирует `createApp` обёрткой с динамическим
импортом (типы — `export type`). `install`, `doctor`, `hook`, `session` и `--version` работают
без `ws`; `serve` без `ws` завершается сообщением «зависимость ws не найдена: переустановите
Workflow Kit» и кодом 1.

**Копия приложения.**
- `COPY_EXCLUDED_DIRS` дополняется `target` (Cargo); других каталогов `target` в
  `product-parts` нет.
- `APP_PARTS` дополняется `package-lock.json` и `THIRD_PARTY_NOTICES.md`.
- Зависимости времени выполнения: пакеты lock-файла без `dev` (`node_modules/<имя>`)
  копируются из источника в `app/<версия>/node_modules` во временном каталоге копии до
  `rename`. Нет пакета в источнике — отказ `DEPENDENCY_MISSING` («запустите npm ci») до
  любых изменений (ни копии, ни `current.json`, ни запуска службы).
- Повторная установка из установленной копии (`SOURCE_ROOT` = `app/<версия>`) ничего не
  копирует, как и сейчас: `node_modules`, lock и notices уже в копии.

**Helper (только macOS ARM64).** Рядом с helper пишется `<данные>/speech/helper.json`
`{version, sha256}`. Политика — диктовка не работает с helper другой версии:
- в источнике есть `…/speech-helper/target/release/wfk-speech-helper`: копия во временный
  файл в `<данные>/speech`, `chmod 0755`, `rename` поверх старого, затем `helper.json` и
  `THIRD_PARTY_NOTICES.md`;
- артефакта нет (клон без release-сборки или установленная копия): прежний helper
  остаётся, только если `helper.json` называет устанавливаемую версию и sha256 совпадает;
  иначе helper и `helper.json` удаляются, предупреждение «диктовка недоступна: helper
  версии <v> не собран»;
- ошибка копирования или замены: временный файл удаляется, прежний helper и `helper.json`
  удаляются, то же предупреждение; остальная установка продолжается;
- удаляются только эти три файла: модели (`<состояние>/speech/models`, на macOS в том же
  каталоге `speech`) и `<конфигурация>/speech.json` не трогаются. `uninstall` удаляет те же
  три файла. Linux, Windows и Intel: ничего не копируется и не удаляется.

**`doctor --installed`.** Пакеты lock-файла копии без `dev` есть в её `node_modules`; на
macOS ARM64 helper есть, исполним, `helper.json` называет версию копии и sha256 совпадает
(иначе проверка с предупреждением «диктовка недоступна» и причиной).

**Тесты.** Модульные — с внедрёнными `darwin`/`linux`/`win32` и `arm64`/`x64`: копия без
`target`, с зависимостями и notices; `DEPENDENCY_MISSING` без побочных изменений; обновление
с существующим helper; отсутствие нового артефакта; ошибка замены; удаление; модели и
`speech.json` сохраняются; повторная установка из копии. Отдельным процессом
(`node bin/wfk.mjs` во временной копии источника без `node_modules/ws`, `WFK_DATA_DIR` и
`HOME` во временном каталоге, свободный `WFK_PORT`): `--version` работает; настоящий
`install` отказывает `DEPENDENCY_MISSING`, временный каталог данных остаётся пустым;
`doctor --installed` установленной копии с удалённым `ws` сообщает отсутствие зависимости, а
не падает. Экземпляр с `WFK_DATA_DIR` не вызывает `launchctl`/`systemctl` и не пишет
запускатель, значок и автозапуск.

**Сквозной сценарий установленного экземпляра** —
`speech-input/test/installed-browser.smoke.mjs <playwright> <url> <wav> <out>`. Страница
стенда (`/fixture/`) и WAV подставляются `page.route` на origin экземпляра; все остальные
ресурсы (`/dom.js`, composer, модули speech-input, AudioWorklet) и WebSocket идут в
установленную службу. Синтетический русский MediaStream → AudioWorklet → WebSocket →
helper → черновик composer; ни одной отправки агенту. Скрипт пишет текст, первый текст и
Stop в мс, ошибки браузера.

### 2.4. Поставка

- T004: push `ci/speech-integration`, CI четырёх платформ для точного SHA.
- T005: версия 0.17.0 (`package.json`, lock, CHANGELOG, README); `cargo build --release
  --locked` helper. Установщик запускается из исходников выпуска — `node bin/wfk.mjs install`
  в корне репозитория, а не `wfk` из PATH (тот может выполнить прежнюю установленную версию).
  1. Отдельный экземпляр: `WFK_DATA_DIR=<временный>`, свободный `WFK_PORT`, без
     `WFK_SPEECH_HELPER`; `node bin/wfk.mjs install` копирует 0.17.0 и helper в этот каталог и
     запускает службу из копии. Модель Q8 связывается в `<временный>/speech/models` и
     выбирается через API службы. `installed-browser.smoke.mjs` проходит; служба
     останавливается, каталог удаляется. Исходный `target` в этом прогоне не используется:
     служба ищет helper только в `<временный>/speech`.
  2. Обычная установка `node bin/wfk.mjs install` с перезапуском службы; `installed-service`;
     служба сообщает доступность диктовки.
  3. Evidence: версия, пути копии и helper, sha256 helper и `helper.json`, результат сценария.
- T006: CI четырёх платформ для SHA выпуска.

## 3. Поведение на ОС

| Что | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Перенос, проверки Node, установщик (`ws`, lock, notices, исключение `target`), ленивая загрузка `app.ts` | общий Node-код | то же | то же, x64/ARM64; пути через `path` и внедрённую платформу |
| Сквозной сценарий установленного экземпляра | ARM64, экземпляр `WFK_DATA_DIR` | не запускается (диктовка unavailable) | не запускается (диктовка unavailable) |
| Helper и диктовка | ARM64: Metal, helper в `<данные>/speech`; Intel — unavailable | unavailable, helper не копируется | unavailable x64/ARM64, helper не копируется |
| `speech-native` (`cargo test --locked`) | протокол и native | протокол | протокол x64/ARM64 |

Windows-риски установщика: копия `node_modules` с длинными путями и занятыми файлами идёт
во временный каталог и `rename`, как остальная копия; ветки `win32`/`linux` — тесты с
внедрённой платформой.

## 4. Проверка

- Автоматические тесты установщика с внедрёнными `darwin`/`linux`/`win32` и `arm64`/`x64`.
- CI: macOS ARM64, Linux x64, Windows x64 и ARM64 (T004, T006).
- Живые проверки: macOS — пользователь (физический микрофон, TCC/browser permission, Safari,
  sleep/wake, смена устройства); Windows — проверяющий на Windows; Linux — только CI. Они
  записываются как непроверенные, синтетический MediaStream их не заменяет.

## 5. Границы

- Не входит: публикация моделей, Intel/Linux/Windows inference, измерение WER и полной
  памяти GPU, переход Workflow_Kit на Kit 2.4.x (кнопка «Обновить Kit»).
- Пуш main — только приложением после приёмки и закрытия.

## 6. План

| Задача | Содержание | Файлы |
| --- | --- | --- |
| T001 | перенос `feature/speech-input` (squash), совмещение | файлы ветки без плана и `.harness/workflow` |
| T002 | проверки объединённого кода | `docs/evidence/speech-integration-acceptance.md` |
| T003 | загрузка CLI без `ws`; доставка helper, зависимостей, лицензий; сценарий установленного экземпляра | `cli`, `service-installer`, `installed-browser.smoke.mjs`, `OS-MATRIX.md` |
| T004 | CI объединённого кода (delivery) | evidence |
| T005 | выпуск 0.17.0 (delivery) | версии, CHANGELOG, README, evidence |
| T006 | CI выпуска (delivery) | evidence |
