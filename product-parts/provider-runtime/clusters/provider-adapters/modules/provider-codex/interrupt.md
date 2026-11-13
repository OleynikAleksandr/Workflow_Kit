# Codex: прерывание конкретного хода (M24)

Часть [module.md](module.md). Общий протокол —
[M24-turn-interruption](../../../../../../docs/design/M24-turn-interruption.md).

## Подтверждённая локальная схема

13.11.2026, установленный `codex-cli 0.167.2`:

```sh
codex --version
codex app-server generate-json-schema --out /tmp/wfk-m24-codex-schema
```

Это генерация справочной схемы в scratch, не запуск демона/чата и не сборка Workflow Kit.
Пользовательские сессии, настройки и общий доступ не изменялись. Проверены записи
ClientRequest и ServerNotification и соответствующие определения v2:

- `turn/interrupt`: params `{ threadId: string, turnId: string }`, оба обязательны.
- TurnInterruptResponse: object, без обязательных полей. `{}` не доказывает остановку.
- `turn/completed`: params `{ threadId: string, turn: Turn }`, оба обязательны.
- Turn: обязательны id, items, status; status — completed/interrupted/failed/inProgress.
- `thread/read`: threadId обязателен, includeTurns — boolean; ответ содержит thread с id,
  status и turns. Ходы заполняются при includeTurns=true, без загрузки/возобновления треда.

SHA-256 файлов генератора (для воспроизведения на этой версии):

| Файл v2 | SHA-256 |
| --- | --- |
| TurnInterruptParams.json | 6dff382dae73d1dbc58406ed045605f647e7a49660e2540fbd2c6c24d60c5f2b |
| TurnInterruptResponse.json | 531de6be06fe979b5963f249bab82498a175e614bf65ac12fb2e849dfe60bcf1 |
| TurnCompletedNotification.json | 00b691508bb0187ecc5f080bb1608add7137672698daed6922967ad90bcb16e1 |
| ThreadReadParams.json | dfe040c6ac71d30795b8be3f3ff232e66f362a37f883b491e5d1ea367f470db4 |
| ThreadReadResponse.json | 4b1a0bb5d6896a5ef1c03045e35ca262b21471e07d4e322d874995b6fd31c094 |

Stop включается с 0.167.2 — это подтверждённая здесь базовая версия, а не утверждение,
что API отсутствует в каждой более ранней версии. Неизвестные формы ответа отказывают,
даже если версия новее. Типы/разбор — src/turn-snapshot.ts.

## Доступность без дополнительного опроса

Capability interruptTurn требует найденной, проверенной версии без ошибки. Реальная
interruptAvailability(project, id) дополнительно проверяет принадлежность проекту,
кэш состояния демона и свежий снимок thread/read (6 с). Кэш обновляется уже существующим
readMessages: ChatDeps.onThreadRead не делает второй RPC. Ошибка/неизвестный ответ
инвалидирует положительный снимок. CodexRuntime.cachedDaemon читает последнюю наблюдённую
запись без IO; forgetDaemon сбрасывает и её.

notLoaded, ошибка треда, отсутствие native id, противоречие idle/inProgress, отсутствие
доступного демона или передача управления — причины недоступности Stop. История внешнего
треда сама по себе не подтверждает управление им. Сам Stop никогда не включает общий
доступ и не требует его изменения; доступен и для активного хода демона без ChatGPT.
После перезапуска общий канал остаётся unknown до своего события хода (T002), даже если
история уже прочитана. При первоначальном выборе сессии Stop ждёт обычного чтения ленты.

## Цель и действие

`interruptTurn(project, threadId, { turnRef, nativeTurnId })` берёт native id из хука.
Если он пока null, цель фиксируется из уже наблюдавшегося активного native id в снимке,
а не из первого попавшегося нового хода после подключения. Связь turnRef → native id
сохраняется для явной повторной проверки после тайм-аута (ограниченный кэш 256 записей).
Нельзя перепривязать тот же turnRef к следующему native turn.

В одном коротком initialized-соединении существующего withDaemon:

1. Два thread/read с includeTurns=true проверяют конкретный id и актуальный активный ход.
   Другой active id — stale. Нет ожидаемого id, или после него уже более новый ход — stale.
2. Терминальный interrupted ожидаемой цели подтверждает interrupted; completed —
   already-idle без interrupt; failed — ошибка, не успешная остановка. Неизвестный idle
   не считается доказательством.
3. Для подтверждённого inProgress в активном демоне посылается ровно один
   turn/interrupt с threadId и ожидаемым turnId. Нет thread/resume, turn/start,
   unsubscribe, archive, delete, запуска/остановки демона или изменения общего доступа.
4. После RPC снова проверяется текущий native id. Следующий активный ход имеет приоритет
   над поздним завершением старого. Затем принимается matching turn/completed с теми же
   threadId/id и terminal status; чужие/старые/неизвестные события игнорируются. Событие
   turn/started следующего id тоже даёт stale.
5. Если уведомление не пришло (соединение не подписано на тред), thread/read подтверждает
   терминальный статус именно цели. Если чтение временно недоступно, уже полученное
   matching completion остаётся доказательством. Пустой успешный RPC не даёт stopped.

Результат имеет nativeTurnId цели и proof provider-event либо provider-state. Общий
канал сам переходит в waiting (T002), без ожидания Stop hook Codex. При stale следующий
ход не получает interrupt; повтор требует нового нажатия и актуальной ссылки.

## Ошибки и deadline

Весь адаптер ограничен interruptWaitMs (по умолчанию 8 с), interval interruptPollMs —
200 мс. Каждое чтение/RPC получает оставшееся время; после позднего соединения или
закончившегося preflight deadline повторно проверяется до отправки команды.
Поздний callback не может начать interrupt после тайм-аута. Свой initialized-сеанс
закрывается withDaemon; демон и тред остаются живы.

Тайм-аут — ProviderError interrupt-timeout (504 с подсказкой, T008 сохраняет её в HTTP);
другая ошибка — interrupt-failed (502). RPC-ошибка не превращает терминальное completed
в interrupted: требуется независимое доказательство состояния. Барьер/очередь/черновик
хранит общий канал; адаптер не снимает паузу и не отменяет назначения Kit.

## Поведение на ОС и проверки

| macOS | Linux | Windows x64/ARM64 |
| --- | --- | --- |
| withDaemon, WebSocket через Unix-сокет | то же; приложения ChatGPT нет, доступен только управляемый демон | существующий codex app-server proxy, тот же RPC/контроллер |

Новых программ ОС нет: proxy и выбор транспорта уже были в runtime. Тесты проверяют
обе формы подтверждения, естественное завершение, stale/поздние события, внешний тред,
ошибки и deadline. Интеграция использует реальный WebSocket JSON-RPC и, для injected
win32, настоящий Node-процесс подставного proxy через proxyStream, без native codex.exe.
Следующая явная реплика проверена через прежний sendDirect. Изменений общего доступа,
удаления треда или завершения демона в Stop-пути нет.

Живая macOS — пользователь; Windows — проверяющий на Windows; Linux — CI. Генерация
схемы и подставной транспорт не доказывают живую остановку агента и работу настоящего
Windows proxy; это остаётся приёмкой. Evidence —
[M24-acceptance](../../../../../../docs/evidence/M24-acceptance.md).
