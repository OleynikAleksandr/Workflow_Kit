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

### 2.3. T003: доставка в установленное приложение (`service-installer`)

Служба ищет helper по `<appDir>/speech/wfk-speech-helper`, где `appDir` — каталог данных
`data-store` (macOS `~/Library/Application Support/Workflow Kit`). Установщик сейчас копирует
`bin`, `product-parts`, `package.json` без `node_modules`, поэтому установленная служба не
нашла бы `ws` и не запустилась бы, а каталог Cargo `target` попал бы в копию.

- `COPY_EXCLUDED_DIRS` дополняется `target` (Cargo); других каталогов `target` в
  `product-parts` нет.
- Зависимости времени выполнения: пакеты `package-lock.json` без `dev` (`node_modules/<имя>`)
  копируются из источника в `app/<версия>/node_modules`; нет пакета в источнике — отказ
  `DEPENDENCY_MISSING` с текстом «запустите npm ci» до изменений.
- `THIRD_PARTY_NOTICES.md` входит в `APP_PARTS`.
- macOS ARM64: собранный `target/release/wfk-speech-helper` источника копируется во
  временный файл и `rename` в `<данные>/speech/wfk-speech-helper` (0755) вместе с
  `THIRD_PARTY_NOTICES.md`; нет файла — предупреждение «диктовка недоступна», установка
  продолжается. Другие ОС и Intel: ничего не копируется. Модели пользователя
  (`<состояние>/speech/models`) не трогаются; `uninstall` удаляет helper и notices.
- `doctor --installed`: зависимости копии разрешаются; на macOS ARM64 helper есть и исполним.

### 2.4. Поставка

- T004: push `ci/speech-integration`, CI четырёх платформ для точного SHA.
- T005: версия 0.17.0 (`package.json`, lock, CHANGELOG, README); `cargo build --release
  --locked` helper; `wfk install` с перезапуском службы; `installed-service`; установленный
  helper распознаёт русский WAV до EOF (Q8) и служба сообщает доступность диктовки.
- T006: CI четырёх платформ для SHA выпуска.

## 3. Поведение на ОС

| Что | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Перенос, проверки Node, установщик (`ws`, notices, исключение `target`) | общий Node-код | то же | то же, x64/ARM64; пути через `path` и внедрённую платформу |
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
| T003 | доставка helper, зависимостей, лицензий | `service-installer`, `OS-MATRIX.md` |
| T004 | CI объединённого кода (delivery) | evidence |
| T005 | выпуск 0.17.0 (delivery) | версии, CHANGELOG, README, evidence |
| T006 | CI выпуска (delivery) | evidence |
