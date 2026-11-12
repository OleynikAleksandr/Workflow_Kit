# provider-registry: диалог сессии

Контракт чтения переписки сессии и прямой отправки реплики (M18, раздел 2.1;
`docs/planning/M18-session-chat.md`). Ссылка — из `module.md`.

## Типы и константы (`src/chat.ts`)

- `ChatMessage` — `{ id, role: 'user' | 'assistant', text, at: string | null }`:
  `id` — собственный id сообщения у провайдера (стабилен в сессии), `text` — простой
  текст (вызовы инструментов, рассуждения и служебные записи — не сообщения), `at` —
  время ISO или `null`.
- `ChatPage` — `{ messages: ChatMessage[], truncated }`: последние сообщения от старых к
  новым; `truncated` — более старые есть, но не вошли.
- `CHAT_PAGE_LIMIT = 100` — сообщений на страницу (маршрут передаёт его в `limit`).
- `CHAT_TEXT_MAX_CHARS = 20_000` — длиннее текст обрезается с конца пометкой
  `CHAT_TEXT_CUT_NOTE` («\n… (обрезано, полный текст — в чате провайдера)»);
  `cutChatText(text, max?)` не разрезает суррогатную пару. Обрезает маршрут, не провайдер.

## Методы `Provider` (`src/contract.ts`)

- `readMessages?(project, sid, { limit }) → ChatPage` — последние `limit` сообщений
  сессии, от старых к новым. Ничего не меняет у провайдера: не загружает чат, не начинает
  ход. Сессия без записей — пустая страница. Нечитаемый источник —
  `ProviderError('chat-unavailable', <причина по-русски>)`.
- `sendDirect?(project, sid, text) → boolean` — текст агенту репликой пользователя прямо
  сейчас; `true` — принят провайдером, `false` — сейчас нельзя (вызывающий кладёт
  сообщение в очередь канала). На ожидаемых отказах (сессия не под управлением панели,
  идёт ход, нет общего доступа) не бросает, а возвращает `false`.

Провайдер без методов работает как раньше; маршруты и панель провайдеров не называют.

## Маршрут (`src/chat-routes.ts`)

`registerChatRoutes({ router, providerOf, projectOf, sessionIdOf, toHttpError })`
вызывается из `registerProviderRoutes`; маршрут только читает (без операции и мьютекса).

`GET /api/projects/:id/providers/:p/sessions/:sid/messages` →
`ChatMessagesAnswer { supported, messages: ChatMessage[], truncated }`:

| Случай | Ответ |
| --- | --- |
| `:sid` не `[A-Za-z0-9._:-]{1,200}` | 400 `invalid-session` |
| провайдер или проект неизвестен | 404 `unknown-provider` / `not-found` (как у соседних); папки нет — 409 `project-missing` |
| у провайдера нет `readMessages` | 200 `{ supported: false, messages: [], truncated: false }` (сессия не проверяется) |
| сессии нет в `listSessions(project)` (ни `localId`, ни `remoteId`) | 404 `unknown-session` «Сессия не найдена» |
| `readMessages` бросил `ProviderError` | 502 с его `code`, `message`, `details` и `hint` |
| иначе | 200 `{ supported: true, messages, truncated }` |

Провайдер получает `localId` найденной сессии. В ответе — только поля контракта
(`at` без значения — `null`); тексты длиннее `CHAT_TEXT_MAX_CHARS` обрезаны; если
провайдер отдал больше `CHAT_PAGE_LIMIT`, остаются последние и `truncated: true`.
`ProviderError` из `listSessions` — со своим статусом, как у других маршрутов.

## Тесты

`test/chat-routes.test.ts`: `supported: false`, страница, пустая сессия, поиск по
`remoteId`, обрезка и суррогатная пара, предел страницы, чужая сессия 404, ошибка 502,
404/400 до чтения. `test/fake-provider.ts` имеет `readMessages` (`chat`, `chatError`) и
`sendDirect` (`direct`, `directAccepts`).

## Поведение на ОС

Одинаково на macOS, Linux и Windows: модуль только описывает контракт и читает через него.
