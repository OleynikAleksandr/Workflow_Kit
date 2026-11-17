# Speech Input: проверка кода в изолированном дереве

## Границы

Исходная база bbab32d7, ветка feature/speech-input, macOS 27.2 ARM64.
Релизная сборка, упаковка, установка, merge и push main не выполняются.
Чужой scope M40 и действующая служба не изменяются.

## T001: настоящий native streaming

17.11.2026, pinned Handy aca8985190c3ad7f361d8a80cb30f179513ed690;
transcribe-cpp и transcribe-cpp-sys =0.4.2 (Cargo.lock/checksums).
Voxtral Q8_0: revision b3e1c979e3775cbd0a49a65878a0ec7f06789ed7,
4731791648 bytes, SHA256
6fb22249463c1e7a600d920ad732e2dd0a231510e9db59fb8061d3d1d48d0c67.
Веса загружены и проверены во временном каталоге вне git; Handy не изменялся.

Проверка: тестовая `cargo build --locked` (debug, не релиз приложения),
`test/streaming.smoke.mjs helper model russian.wav`. WAV — синтетическая русская
речь macOS Milena, mono float32 16 kHz, подаётся 200-мс пакетами по часам.
Тест требует минимум два изменения текста до EOF, кириллицу в финале,
truncated=false и отставание менее 3 с; это не mock движка.

| Метрика | Результат |
| --- | --- |
| Runtime | transcribe-cpp/0.4.2 |
| Compute backend | MTL0 (Metal) |
| Длительность аудио | 15,716 с |
| Hello + холодная загрузка | 2954 мс |
| Begin уже загруженной модели | 129 мс |
| Первый непустой текст от начала подачи | 2009 мс |
| Изменений до EOF | 13 |
| Максимальное отставание подачи | 328 мс |
| Максимальная длительность feed | 525 мс |
| Finalize | 307 мс |
| Peak RSS процесса после загрузки | 376881152 bytes |

RSS здесь не измеряет полную объединённую память/GPU и не является обещанием
потребления модели. Ожидаемый текст распознан, но package.json передан неточно;
качество технической лексики на живой речи пользователя ещё не принято.

`cargo test --locked`: 3/3 protocol tests (fragmented/multiple frames, EOF,
invalid lengths и nonfinite PCM). Конфигурация TypeScript исключает Cargo target:
CMake создаёт служебные compiler_depend.ts, которые не являются кодом Kit.

## Не покрыто на этапе T001 (актуальный итог ниже)

- Поток службы/WebSocket и browser capture — следующие задачи.
- Реальные микрофон/разрешения, Safari и русская речь пользователя — после реализации.
- Минутная и пятиминутная непрерывная подача — отдельные прогоны.
- Общая память/GPU, Intel macOS — не измерены/не поддержаны первой конфигурацией.
- Windows x64/ARM64 и Linux CI — не запускались из этого дерева; будут нужны до merge.

## T002–T008: реализованный путь и доказательства

Все проверки ниже запускаются в отдельном дереве, временных каталогах и на свободных
портах. App/provider state основного проекта не используется. Тестовые веса лежат
вне git. Сборка helper — проверочная debug-компиляция, не релиз приложения.

| Область | Проверка | Результат на этапе T008 |
| --- | --- | --- |
| Хранилище | model-store.test.ts: hash, partial, cancel, выбор, подмена файла, symlink, active model; darwin/linux/win32 injected | 5/5 |
| Служба | service.test.ts: один владелец, feed/finalize, double finish, queue bound, nonfinite, unavailable, Origin/Host/path, настоящий upgrade и shutdown | 6/6 |
| Browser model | browser-model.test.ts: exact duration/packet continuity, anti-alias, snapshots/Unicode, client capability | 4/4 |
| Composer | speech-composer.browser.mjs, обе темы | 2/2: ввод до Stop, все send guards, отдельная отправка, независимый Stop агента, ручная правка, позднее разрешение, hide |
| Settings | speech-settings.browser.mjs, обе темы, настоящий store/API с маленькими fixtures | 2/2: progress/focus, cancel, установка с hash, выбор на диске, active barriers, удаление файла, unavailable |
| Question card | speech-question.browser.mjs, обе темы | 2/2: writeOther, send guards, только answer route, poll/правка, смена варианта, hide/keep/closed cleanup |
| Регрессия интерфейса | m28-composer.browser.js и m33-question.browser.js; dark 1280, light 390 | 4/4: 25 + 25 + 26 + 26 проверок |
| Реальный runtime switch | runtime-switch.smoke.mjs с настоящими GGUF Q8/Q4 | Загружены разные файлы voxtral-q8.gguf и voxtral-q4.gguf; русский streaming до EOF, Metal, truncated=false |
| Полный production App | real-browser.smoke.mjs: createApp, настоящее API/WebSocket, AudioWorklet/resampler, настоящий Voxtral Q8, поле composer | Пройдено: первый текст 1699 мс, 0 отправленных сообщений, tracks/context закрыты |
| Не-ASCII пути | Полный App: каталог «Диктовка с пробелами» и executable «Речевой помощник» | Пройдено |

Браузерные сценарии захвата используют синтетический MediaStream: аппаратный
getUserMedia в headless не завершился. Проверка позднего разрешения моделирует
разрешение, возвращающее настоящий синтетический track после Cancel. Это доказывает
обработку гонки и освобождение track, но не реальное системное разрешение микрофона.
Скриншоты обеих тем и реального текста просмотрены; pageerror/CSP errors отсутствуют.

Пятиминутный настоящий native streaming: 300 с, 287 обновлений, максимум отставания
подачи 14,7 мс, maximum feed 211,9 мс, finalize 247,9 мс, truncated=false.
Прогон Q8 через service: подготовка 2402 мс, первый текст 1957 мс, finalize 267 мс.
Прогон Q4: подготовка 1565 мс, первый текст 1983 мс, finalize 264 мс.
Это измерения конкретного Mac и синтетического русского материала, не SLA и не WER.

Исходники тестов находятся в соответствующих test/ каталогах. Локальные артефакты:
`/tmp/wfk-speech-browser-01a1e8f9`, `/tmp/wfk-speech-legacy-01a1e8f9`;
метрики native — `.harness/inputs/speech-native-smoke.json`,
`speech-native-300s.json`, `speech-runtime-switch.json` (не в git).

## Найденные негативными проверками дефекты

- **T009, fixes T003.** Отдельный процесс с worker, закрывшим stdin, воспроизвёл
  необработанный stream error EPIPE: Node exit 1. Это нужно исправить до готовности
  scope; зелёные положительные сценарии этот случай не покрывали.
- **T010, fixes T004.** VM-проверка AudioWorklet без чтения main-thread: 14 пакетов
  за 3 секунды, overload не сигнализируется. Нужны предел и acknowledgement на этом
  переходе; ограничения WebSocket/service не ограничивают MessagePort.

Обе проблемы зарегистрированы через plan:extend отдельными задачами; завершённые
записи задач не переписывались. T008 фиксирует проверку и находки, а не объявляет
готовым scope с этими дефектами. Итог после T009/T010 записывается ниже.

## Общие проверки и CI

На коммитах кода выполняются typecheck, полный Node suite, platform-guard и все
Kit builtins; speech-native требует cargo test --locked при изменении helper.
Чистая исходная база bbab32d7 дала 1343/1343 app tests. Запуск из git hook связанного
дерева требовал очистки GIT_* и HARNESS_WORKFLOW_ROOT для временных репозиториев
тестов; tools/speech-checks/test.mjs запускает обе прежние группы без исключений.

CI дополнен Rust 1.88.0 (как локально) и npm run test:speech-native на всех четырёх
заданиях. Action dtolnay/rust-toolchain закреплён SHA из истории master;
[CI workflow](../../.github/workflows/ci.yml) подготовлен, удалённо здесь не запускался.
Публикация, merge и релизная сборка не выполняются.

Не проверены живьём: физический микрофон и TCC/browser permission, Safari, sleep/wake,
исчезновение реального устройства, Intel. Windows x64/ARM64 и Linux проверены
внедрёнными платформами; их настоящий CI и Windows tester остаются перед интеграцией.
Полная объединённая память/GPU не измерена; RSS первого прогона не заменяет её.

Повторный прогон через настоящий service с Q8, Q4 и Q6 прошёл для всех трёх:
проверены разные load paths и streaming до EOF, backend MTL0, truncated=false.
Q8: prepare 2514 мс / первый текст 1964 мс / finalize 315 мс;
Q4: 1488 / 1929 / 276 мс; Q6: 1886 / 2015 / 277 мс.
Q6: 3661018912 bytes, SHA256
92038784cffa20ea8ee925f10fd28c110285124d94730eacce48bab6c214fa48.
Локальный результат: `.harness/inputs/speech-runtime-switch-all.json`.

## T009: закрытый pipe и восстановление

Исправлены постоянные stdin/stdout error listeners, EOF и закрытие worker.
Шесть новых helper-client tests прошли: fragmented/repeated/concurrent requests,
stdin/stdout error с поздним EPIPE, partial EOF, malformed frame, exit/spawn/timeout.
Service suite теперь 7/7, включая отказ hello и успешный новый явный begin.

Повтор исходной отдельной EPIPE-пробы: exitCode=0, stdout «handled helper-io»,
stderr пуст. Предыдущий код на том же сценарии давал unhandled error и exit 1.
Результат `.harness/inputs/speech-pipe-fixed.json`; завершение worker проверено.

## T010: ограничение worklet и финальный сквозной повтор

Worklet теперь держит максимум 8 неподтверждённых пакетов (102400 bytes / 1,6 с).
Ack возвращается только после передачи в ограниченную WebSocket-очередь. При
переполнении — один overload, остановка и сохранение видимого черновика.
VM-проверка исходника: за 3 с без чтения main — 8 пакетов и overload вместо
прежних 14 пакетов без предела. С ack поток и финальная длина 16000 samples/с
сохранены. Browser model/worklet suite: 6/6.

Chromium 153.0.8010.12, capture-negative.browser.mjs: NotAllowedError,
NotFoundError, NotReadableError дают русское объяснение, закрытый AudioContext
и снятую блокировку отправки. Настоящий AudioWorklet при задержке main на 3 с
вызывает overload; текст сохранён, tracks/context/MessagePort освобождены.
Проверены device-ended, Stop и Cancel, поздняя ручная правка; browser errors=0.
Это синтетические MediaDevices outcomes, не подтверждение TCC/живого устройства.

После исправления повторены composer и question-card в обеих темах — 4/4,
включая guards, writeOther, ручную правку, позднее разрешение, hide/keep/closed.
Полный production createApp с реальным Q8/Metal и browser AudioWorklet также прошёл:
первый текст 1747 мс, Stop до готового поля 887 мс, текст до EOF, отправок 0,
tracks/context закрыты, browser/CSP errors=0. Метрика Stop теперь снимается сразу
после готовности поля, до screenshot и проверок DOM. Скриншоты просмотрены.
Артефакты capture-negative.json и real-browser.json — в том же временном каталоге.

Оба дефекта, найденные в T008, закрыты отдельными T009/T010 и повторными проверками.
Перечисленные выше живые проверки, Safari и удалённый CI остаются непроверенными;
это границы результата code-only, а не скрытая приёмка или поставка релиза.

## Итог кода и передачи

Все десять функциональных задач завершены; последний код —
`afa4ade7fcc27e829c931138e79342f355d05bee` (T010), fixes T009 —
`15adc75f956cee716642e6d0267e80aac6f210fe`, сквозные проверки T008 —
`3529ad084b55497654a87b9b30f1cdeb96c6ed9b`.
Профиль commit прошёл для каждой задачи: typecheck, обе полные Node-группы,
platform guard, doc-size/links/file-lines/contracts/conflict markers.
Три native protocol tests и debug-компиляция пройдены отдельно; native CI step
подготовлен для всех четырёх ОС. Опубликованного SHA и результатов remote CI нет.

[Передача для интеграции](../planning/speech-input-integration.md) описывает общий
код, сохранение плана main и quality config, повтор проверок объединённого SHA,
ожидаемый путь helper и отдельный будущий этап поставки. Новых релизов нет;
accept/close, merge и push не выполнялись. Результат требует перечисленных живых
проверок и CI перед итоговой интеграцией/поставкой.
