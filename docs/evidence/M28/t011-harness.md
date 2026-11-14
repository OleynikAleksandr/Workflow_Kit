# M28 T011: стенды

Одноразовые стенды в папке временных файлов агента, не в репозитории. Основа — стенд T007
([t007-harness.md](t007-harness.md)) без изменений в коде Kit.

## Живой прогон (`m28-live-t011.mjs`)

Копия стенда T007 с отличиями:

- префикс временной папки `M28_t011_`, имя проекта и сессии `M28 T011 probe`;
- для каждого Stop записывается время ответа маршрута (`ms`) и активность канала сразу
  после ответа;
- для очереди после прерывания — время от нажатия Stop (`msAfterStop`).

Запуск: `node --experimental-strip-types m28-live-t011.mjs <repo> <out.json>`.

## Диагностика без генерации (`m28-diag.mjs`)

Тот же изолированный Kit и обёртка `session.exp`, но:

- `createSession` без первого сообщения: Claude стартует, модель не вызывается;
- через 9 с читаются `.interrupt-state`, `.interrupt-result`, `.turn` и статус
  `.parameters-state` (только `status`, `reason`, `inputEmpty`);
- в `<debug>.text` пишется `/model` (меню Claude, без хода), через 4 с — снова файлы;
- `provider.interruptTurn` прямо у провайдера, затем файлы через 2,5 с;
- очистка как в T007.

Запуск: `node --experimental-strip-types m28-diag.mjs <repo> <out.json>`.

## Повтор с подставным CLI

Временный тест в `provider-claude/test` (удалён после запуска, не коммитился):
`createHarness`, режим `FAKE_CLAUDE_MODE=interrupt-working`, с `nativeStatuslineCommand`
и без него, `.fixture-mode` = `dialog`, затем `interruptTurn`. Оба раза
`interrupted` за ~2 с: без метаданных statusline discovery не начинается, и рабочий
процесс не занят.
