# provider-kimi: диалог сессии

Часть контракта модуля [provider-kimi](module.md): чтение переписки сессии
для экрана сессии в панели (M18, раздел 2.4). Контракт `ChatMessage`,
`ChatPage` и маршрут `GET …/messages` — в `provider-registry` (`chat.md`).
Код — `src/chat.ts`.

## Публичный интерфейс

- `readMessages(project, sessionId, { limit })` провайдера (из
  `createKimiSessions`) → `ChatPage`.
- `readKimiChat(rt, sessionId, { limit })` — то же для `KimiRuntime`.
- `chatMessage(item: KimiMessage)` → `ChatMessage | null` — фильтр одного
  сообщения Kimi.
- `CHAT_PAGE_SIZE_MAX = 100` — наибольший `page_size` запроса.
- `KimiMessage` (`parseMessages`) получил поле `at: string | null`.

## Поведение

- Один запрос `GET /api/v1/sessions/{id}/messages?page_size=<limit>`
  (`limit` от 1 до 100) к серверу Kit, как у `lastAnswer`
  (`rt.requireServer()`). Чтение ничего не меняет в Kimi: нет промпта,
  `:takeover` и `:reload`.
- Kimi отдаёт страницу от новых к старым; провайдер разворачивает её в
  порядок от старых к новым.
- Сообщения ленты:
  - `role: "user"` с `metadata.origin.kind: "user"` — реплики пользователя
    (и промпты Kit: их отправляет канал от имени пользователя);
  - `role: "assistant"` с непустым текстом (части `type: "text"` через
    перевод строки).
  Вставки Kimi (`origin.kind: "injection"`, например `<system-reminder>`),
  реплики `user` без `origin`, вызовы инструментов и пустые ответы — не
  сообщения.
- `truncated` — `has_more` страницы (или сервер отдал больше, чем просили:
  лишние старые отбрасываются).
- `id` — `id` сообщения Kimi; `text` — полный текст (обрезку делает
  маршрут); `at` — `created_at` сообщения в ISO.
- `id` сессии проверяется так же, как в `lastAnswer` (`SESSION_ID`).
- Ошибка — неверный id, сервер не запускается или не ответил, отказ Kimi
  (например `40401`), неверная форма ответа — `ProviderError`
  `chat-unavailable` «Kimi не отдал переписку: <причина>» (причина — через
  `describeKimiError`).
- `sendDirect` у Kimi нет: сообщение панели канал отправляет промптом
  через `sendMessage`. `sendMessage` и `lastAnswer` не менялись.

## Время сообщения

`parseMessages` читает необязательное `created_at`: строка ISO или число
миллисекунд → ISO; поля нет или значение не время — `null`. Ошибкой формы
это не бывает; прежние проверки формы (`items`, `has_more`, `id`, `role`,
`content`) остаются.

## Не проверено вживую

Форма страницы взята из снимка Kimi 2.5.2 (`test/fixtures/messages.json`,
там `created_at` — строка ISO). На живом сервере `readMessages` не
проверялся, поэтому чтение терпимо: необязательные поля не дают ошибку, а
неизвестные значения `origin` отбрасываются.

## Поведение на ОС

Одинаково на macOS, Linux и Windows (x64 и ARM64): HTTP-запрос к серверу
Kimi на `127.0.0.1`; ветвей по ОС нет.

## Тесты

`test/chat.test.ts` (подставной сервер `fake-sessions.ts`): разворот
снятой страницы и фильтр вставок, вызовы инструментов, пустые ответы,
`truncated`, `page_size` не больше 100, время и `null` без него, отказ
сервера, `40401`, неверный id, `sendMessage` после чтения.
`test/shapes.test.ts`: поле `at` и терпимость к неверному `created_at`.
