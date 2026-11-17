# Интеграция Speech Input: доказательства

Спецификация — [speech-integration.md](../planning/speech-integration.md). Исходные
доказательства ветки — [speech-input-acceptance.md](speech-input-acceptance.md).

## T001: перенос

Изменения `feature/speech-input` от базы `bbab32d7` до `5e990e3` перенесены коммитом
`719e22c` (`git apply -3` без путей `.harness`: `git merge --squash` отказался, потому что
`task:start` уже записал план; прямой коммит слияния Kit отклоняет). Конфликты:
`package-lock.json` (формат Speech, версия 0.16.0), `README.md`, `OVERVIEW.md`,
`OS-MATRIX.md` (строки M40 — в [OS-MATRIX-M40.md](../architecture/OS-MATRIX-M40.md)).
План и `.harness/workflow` — из main; профиль качества — `quality:apply` (`8cafd65`).
Передаточный документ Speech получил обязательный раздел «Поведение на ОС».

## T002: проверка объединённого кода

17.11.2026, SHA `719e22cdc4bd3ca416869efd6a97da921e5d7286`, macOS 27.2 ARM64, Node 24,
Rust 1.88.0. Проверки шли в main; каждая — со своим временным каталогом данных и
свободным портом; действующая служба и её данные не использовались.

### 1. Зависимости, типы, тесты, guard, Kit

| Проверка | Результат |
| --- | --- |
| `npm ci` по lock-файлу | успех, `node_modules/ws` 8.23.0 |
| `npm run typecheck` | успех |
| `node tools/speech-checks/test.mjs` — группа приложения | 1386 тестов: 1384 успешно, 2 пропущены, 0 ошибок (88 с) |
| `node tools/speech-checks/test.mjs` — группа ядра Kit | 76/76 (50 с) |
| `npm run check:platforms` | `platform-guard: ok` |
| `scripts/workflow validate` | `ok`, ошибок нет |
| Builtins Kit (`kit:doc-size`, `kit:md-links`, `kit:file-lines`, `kit:docs-contracts`, `kit:conflict-markers`) | пройдены хуком коммитов T001 и T002 |

### 2. Rust

| Проверка | Результат |
| --- | --- |
| `npm run test:speech-native` (`cargo test --locked`) | 3/3 |
| `cargo build --locked` (debug, проверочная, не релиз) | успех, `Mach-O 64-bit executable arm64` |

### 3. Браузерные сценарии

Chromium 153.0.8010.12 из глобального Playwright. Захват — синтетический MediaStream.

| Сценарий | Результат |
| --- | --- |
| `speech-composer.browser.mjs` | тёмная и светлая темы — успех, по 9 проверок, 9 пакетов |
| `speech-question.browser.mjs` | тёмная и светлая — успех, по 8 проверок |
| `speech-settings.browser.mjs` | тёмная и светлая — успех, по 9 проверок, ошибок консоли нет |
| `capture-negative.browser.mjs` | успех, 7 проверок (NotAllowed, NotFound, NotReadable, overload, device-ended, Stop, Cancel), ошибок браузера 0 |
| Регрессия `m28-composer` (dark 1280, light 390) | 25 + 25 проверок |
| Регрессия `m33-question` (dark 1280, light 390) | 26 + 26 проверок |

Снимки просмотрены: черновик composer, карточка «Распознавание речи» в Settings.

### 4. Настоящий Voxtral

Веса и WAV вне git (`/tmp/wfk-speech-validation-01a1e8f9`): Q8_0, Q4_K_M, Q6_K; синтетическая
русская речь 15,7 с, mono float32 16 kHz. Helper — debug-сборка пункта 2.

| Прогон | Результат |
| --- | --- |
| `streaming.smoke.mjs` Q8 | MTL0; загрузка 3055 мс; первый текст 1956 мс; 13 изменений до EOF; отставание подачи ≤ 2,3 мс; finalize 314 мс; RSS 376 МБ |
| `runtime-switch.smoke.mjs` через службу | Q8: подготовка 2402 / первый текст 1960 / finalize 312 мс; Q4: 1492 / 1939 / 275; Q6: 1879 / 1962 / 297; три разных файла, 26 изменений до EOF у каждого |
| `real-browser.smoke.mjs` (createApp, AudioWorklet → WebSocket → helper → черновик) | успех: первый текст 2148 мс, Stop до готового поля 945 мс, отправок 0, MTL0, ошибок браузера 0 |

Итоговый текст полного пути: «Заметка: Создай отдельный модуль распознавания речи для
Workflow Kit. Версия 1.15. Проверь файл Package.json, затем открой GitHub и настройки
macOS. Текст должен появляться во время речи, а отправка сообщения выполняется отдельно.»
Прямой поток helper дал «Package Chsen» вместо «package.json»: качество технической лексики
не измерялось (WER нет).

### Не проверено

- Физический микрофон, разрешение TCC и браузера, Safari, sleep/wake, смена и исчезновение
  устройства — живая проверка пользователя на macOS; синтетический MediaStream их не заменяет.
- Windows x64/ARM64 и Linux — только внедрённые платформы в тестах; CI — задачи T004/T006,
  Windows-проверяющий — не проверено.
- Intel macOS — unavailable; полная объединённая память/GPU — не измерена.
- Установленное приложение — T003 (доставка) и T005 (выпуск); проверка исходников его не
  заменяет.

## T003: CLI без `ws` и доставка установщиком

Коммит `68d99b3`. Тесты установщика и `cli` (197 из 198, один пропущен по своему условию):
копия с пакетами lock без `dev`, lock и notices, без Cargo `target`; `DEPENDENCY_MISSING` без
побочных изменений на трёх ОС; замена helper, политика версии, ошибка замены, повторная
установка из копии, `uninstall`; `doctor --installed`. Отдельными процессами в копии без
`node_modules`: `--version` работает, `install` отказывает и не создаёт каталог данных, `serve`
объясняет причину без трассировки, `doctor --installed` сообщает `[ошибка] зависимости копии`.
Проверочный прогон `installed-browser.smoke.mjs` на экземпляре из исходников (отдельный
`WFK_DATA_DIR`, свободный порт, debug helper через `WFK_SPEECH_HELPER`, Q8): первый текст
2022 мс, Stop до поля 1069 мс, отправок 0, ошибок браузера 0. Установленный release helper —
T005.

## T004: CI объединённого кода

Ветка `ci/speech-integration`, SHA `02ab4c985676061b87839e21db6f977f8a7402db` (после DOCS-R1),
[run 44125301305](https://github.com/OleynikAleksandr/Workflow_Kit/actions/runs/44125301305):

| Задание | Результат | Время |
| --- | --- | --- |
| macOS ARM64 | success | 6 мин |
| Linux x64 | success | 4 мин |
| Windows x64 | success | 11 мин |
| Windows ARM64 | success | 19 мин (`npm test` ≈ 18 мин; в M40 задание шло 18 мин 20 с) |

Каждое задание прошло `npm ci`, Rust 1.88.0 и `npm run test:speech-native`, typecheck,
`npm test` и `check:platforms`. Windows и Linux проверены только CI; Windows-проверяющий — не
проверено.
