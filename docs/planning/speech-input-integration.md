# Speech Input: передача основному агенту

## Состояние и границы

**Интеграция выполнена** scope [speech-integration](speech-integration.md): изменения ветки
перенесены в main коммитом задачи `719e22c`, проверки объединённого кода —
[доказательства интеграции](../evidence/speech-integration-acceptance.md); поставка helper,
зависимостей и лицензий реализована в установщике. Текст ниже — исходная передача.

Код находится в `/Users/oleksandroliinyk/VSCODE/Workflow_Kit_Speech`, ветка
`feature/speech-input`, база `bbab32d72f8a899cc6a01a0aadb5d741efb21bf2`.
Последний функциональный коммит — `afa4ade7fcc27e829c931138e79342f355d05bee`;
последующие коммиты согласуют документы и изолированный план. Итоговый HEAD
получается `git rev-parse feature/speech-input`, а не фиксируется в своём коммите.

По прямому поручению пользователя реализованы T001–T010 и документация:
Rust helper, проверенные модели, Node supervisor/API/WebSocket, browser capture,
composer, Settings и свободный ответ question-card. T009/T010 — отдельные fixes
двух дефектов, найденных негативными проверками; предыдущие DONE-задачи сохранены.
Проверки и ограничения — [evidence](../evidence/speech-input-acceptance.md).

Работа выполнена автономно по поручению в чате. Host-разрешение автопилота M40
не переносилось. Основной проект, его план, действующая служба и данные не
изменялись нашими командами. Scope Speech не принимался и не закрывался за
пользователя. Merge, push, релизная сборка, упаковка и установка не выполнялись.
Debug-компиляция helper сделана для проверки кода.

## Как переносить результат после завершения main

Слияние выполняет основной агент после окончания своего плана. До переноса нужно
сверить актуальный main и новую версию Kit: эта ветка начинается внутри M40 и не
содержит его последующих изменений. Не откатывать их файлами из Speech.

| Область | Что сохранить при интеграции |
| --- | --- |
| `.harness/plans/todo-plan.md` | План и историю основного проекта. В Speech унаследованная копия M40 заменена отдельным планом по разрешению пользователя; переносить её поверх main нельзя |
| `.harness/workflow/config.json` | Актуальные настройки main, добавив нужные speech checks/contract mappings штатными quality-командами. Speech заменяет test command на wrapper для Git hook; не копировать весь старый config |
| `.harness/workflow/runtime/`, launchers, vendor bundle | В Speech не менялись. Не заменять новым деревом более свежий Kit main |
| `package.json`, lock | Новые `#speech-service`/`#speech-input`, pinned `ws=8.23.0`, `@types/ws=8.18.2`, `test:speech-native`. Сохранить новую версию приложения и зависимости main |
| `package-lock.json` | Формат one-package-per-line из-за лимита 400 строк; поля/версии/integrity сохранены. После разрешения зависимостей проверить JSON, npm ci и лимит |
| `cli/src/app.ts` | Два публичных speech imports, static mount, service/routes setup и stopSpeech перед HTTP shutdown; совместить с новыми M40 registrations |
| `http-server` | Реестр addUpgrade/unsubscribe и unknown-upgrade refusal; сохранить существующие HTTP access/CSP guards |
| `session-chat` | Composer guards/draftRevision, отдельный Stop агента, question-card writeOther и lifecycle; сохранить изменения main и ссылки на отдельный speech.md |
| `panel-shell` | Settings speech card/styles; прежний порядок appearance → autopilot → archive → cards остаётся, speech добавлен между ними |
| CI и tsconfig | Rust native tests для четырёх jobs, exclude Cargo target и node_modules. Не заменять новые checks main |
| Общие документы | Добавить Speech-разделы, сохранить актуальные версии и результаты M40; handoff-* — полный исходный документ, не сокращённый |

Служба использует публичные фасады. Новый код лежит в `product-parts/speech-input/`;
независимые modules — speech-helper, speech-service и speech-input. Нативная
зависимость собирается только для macOS ARM64; на остальных ОС helper и UI
явно unavailable, общий запуск Kit должен оставаться работоспособным.

## Поведение на ОС

| Что | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Native helper и диктовка | Apple Silicon (Metal); Intel — unavailable | unavailable | unavailable x64/ARM64 |
| Служба, API, Settings, composer и question-card | общий Node- и браузерный код | то же, диктовка показана недоступной | то же, x64/ARM64 |
| `cargo test --locked` в CI | протокол и native | протокол | протокол x64/ARM64 |

Общий запуск Kit работает на всех ОС; отсутствие helper даёт unavailable, а не ошибку службы.

## Проверка кода и отдельного экземпляра

После согласования конфликтов нужны проверки именно объединённого кода, а не
только SHA этой ветки. Обычный профиль: typecheck, обе полные Node-группы,
platform guard и Kit builtins. Из Git hook связанного дерева тестам нужен wrapper:
он убирает GIT_* и HARNESS_WORKFLOW_ROOT перед временными чужими репозиториями,
не исключая тестов. См. [tools/speech-checks](../../tools/speech-checks/README.md).

```sh
npm ci
npm run typecheck
node tools/speech-checks/test.mjs
npm run check:platforms
npm run test:speech-native
cargo build --locked --manifest-path product-parts/speech-input/clusters/local-recognition/modules/speech-helper/Cargo.toml
```

Это debug helper, не релизная сборка приложения. Реальная проверка:
`speech-helper/test/streaming.smoke.mjs` принимает helper/model/float32 WAV,
`speech-service/test/runtime-switch.smoke.mjs` — helper/Q8/Q4/WAV и необязательный Q6.
Они требуют кириллицу, несколько обновлений до EOF и truncated=false.
Узкие unit tests входят в обычный Node/Cargo профиль.

Опциональные browser runners требуют путь к установленному Playwright как первый
аргумент и каталог артефактов вторым; автоматически ничего не устанавливают:

- `session-chat/test/speech-composer.browser.mjs`;
- `session-chat/test/speech-question.browser.mjs`;
- `panel-shell/test/speech-settings.browser.mjs`;
- `speech-input/test/capture-negative.browser.mjs`.

Пути этих файлов относительно соответствующих modules. Полный production путь —
`speech-input/test/real-browser.smoke.mjs`: аргументы Playwright/helper/Q8/WAV/out.
Он запускает createApp на свободном порту с отдельным WFK_DATA_DIR и синтетическим
MediaStream русского WAV; настоящий AudioWorklet, API, worker и Voxtral.
Не выдавать это за физический микрофон или системное разрешение.

Для ручного исходного экземпляра задавать собственные `WFK_DATA_DIR`, `WFK_PORT`
и абсолютный `WFK_SPEECH_HELPER`; не пользоваться действующей службой или её
папкой. Модели скачиваются и проверяются менеджером в stateDir/speech/models,
выбор хранится в configDir/speech.json. Handy/cache пользователя не используются.
API доступен только локально, WS проверяет Origin/Host/loopback, аудио/текст не
пишутся в журнал и не передаются провайдеру до отдельной отправки черновика.

## Поставка после интеграции

Ни установщик, ни release packaging в этой ветке не обновлялись: это следующий
этап у основного агента. Production service ищет executable по
`<appDir>/speech/wfk-speech-helper`, source fallback — Cargo target/debug;
`WFK_SPEECH_HELPER` задаёт явный путь. Для будущей поставки требуется отдельно
собрать/положить helper в ожидаемый каталог, доставить browser assets и licenses,
проверить запуск уже установленного экземпляра. Отсутствие helper даёт unavailable,
поэтому зелёный UI-тест из исходников не доказывает работоспособность релиза.
Версию приложения эта ветка не поднимала.

## Что ещё проверять

До итогового объединения/поставки нужен CI объединённого SHA на macOS ARM64,
Linux x64, Windows x64 и ARM64. CI workflow подготовлен, push здесь не делался.
Живые проверки macOS выполняет пользователь: разрешение TCC/browser, физический
микрофон, Safari и основной браузер, русский/смешанный текст 10–20 с, 1 и 5 мин,
sleep/wake и смена устройства. Windows — проверяющий на Windows; Linux — CI.
Intel macOS пока unavailable. Полная unified/GPU memory и качество по WER не измерены.

Локально подтверждены: реальный Metal Q8/Q6/Q4, 300 с native streaming, полный
production путь до поля, обе темы, узкая регрессия 390 px, EPIPE containment,
реальная перегрузка worklet и освобождение ресурсов. Это граница доказательств.
