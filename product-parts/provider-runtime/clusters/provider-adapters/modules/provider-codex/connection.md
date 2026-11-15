# provider-codex: восстановление подключения к демону (M32)

Спецификация — `docs/planning/M32-codex-connection.md`, разделы 2.5–2.8. Код —
`src/connection.ts` (`createConnectionCoordinator`, `isNetworkFailure`, `CodexOffline`), встроен в
`src/runtime.ts` (`CodexRuntime.connection`, `withDaemon`, `readDaemon`, `monotonic`).

## Координатор

Один на runtime (CODEX_HOME). Отдельного цикла проб нет: попытки делают сами чтения и
существующий `daemon()`.

- `withDaemon` при каждой попытке заново разрешает `controlSocket` через realpath, открывает
  транспорт, выполняет handshake и `initialize`. Сбой подключения или callback сообщается
  координатору (`failed`), выполненный callback — `succeeded`. Callback не повторяется никогда:
  в нём бывают `turn/start`, `turn/interrupt`, запись параметров и удаление.
- Сетевой сбой (`isNetworkFailure`): `ENOENT`, `ECONNREFUSED`, `ECONNRESET`, `EPIPE`, `ETIMEDOUT`
  (handshake без ответа), `TransportError`/`RpcError` с `connection-lost`, закрытие с
  незавершённым вызовом (`RpcError` `closed`, кроме закрытия самим клиентом). Не сетевые:
  `frame-too-large`, `message-too-large`, `malformed-json`, `protocol-error`, отказ handshake
  (auth и т. п.), RPC-ошибки, `timeout` ответа, unsupported. Они не меняют epoch и не запускают
  backoff.
- Сетевой сбой увеличивает reconnect epoch и назначает следующую попытку: 250 мс, 1 с, 2 с, 4 с,
  затем 10 с (`RECOVERY_DELAYS_MS`) с jitter ±10 %. Успех сбрасывает backoff и отсчёт 30 с.
- Идентичность сервера после `initialize`: pid и start из `daemon.pid`, realpath цели сокета,
  `userAgent`; неизвестный признак — `?`. Новый epoch или другая идентичность вызывают
  `onReset`: контроллер Stop забывает положительные снимки ([interrupt.md](interrupt.md)).
- `readDaemon(fn, timeoutMs)` — безопасное чтение (лента, фоновое чтение параметров) в пределах
  timeoutMs от вызова, подключение включено. В cooldown — сразу `CodexOffline` с
  `offline() = { state, reason, retryAfterMs }`; когда попытка пора, её делает один запрос
  (recovery probe), остальные ждут его в пределах своего deadline и получают отказ, если проба
  не удалась. Таймеров вне ожидающих запросов нет.
- `offline()`: `reconnecting` меньше 30 с от первого сбоя (`RECOVERY_REASON`), затем
  `unavailable` (`UNAVAILABLE_REASON`); `retryAfterMs` — остаток до следующей попытки,
  0…11 000 мс. Отсчёт по монотонным часам службы, общий для всех вкладок.
- Stop, прямой ход, создание и удаление сессий, запись параметров идут через `withDaemon`: они
  не ждут backoff (deadline Stop важнее) и не повторяются после неопределённого исхода.

## Windows proxy

`proxyStream` запоминает код выхода и последнюю строку stderr; ранний выход до handshake даёт
`TransportError('connection-lost', 'the Codex daemon closed the connection: codex app-server
proxy ended (exit code N): <строка>')`. Строка однострочная, не длиннее 300 символов, значения
после `token`/`key`/`secret`/`bearer`/`authorization` и длинные токены заменены на `…`
(`safeStderr`). Это сетевой сбой с тем же backoff; отсутствием сокета он не объявляется.

## Поведение на ОС

| Что | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Попытка | realpath ссылки, Unix-сокет | так же | новый процесс `codex app-server proxy` |
| Backoff, epoch, идентичность | общий код | так же | так же, x64 и ARM64 |

Веток по ОС в `connection.ts` нет. Демон координатор не запускает и не останавливает.

## Тесты

`test/connection.test.ts`: последовательность задержек и jitter, 30 с и unavailable, только
сетевые сбои, cooldown и одна проба, сброс по идентичности; лента и параметры после возврата
демона на подставных `darwin`, `linux`, `win32` без reload и без шторма; потерянный ответ
`turn/start` не отправляется снова; oversized не меняет epoch; ранний выход proxy.
