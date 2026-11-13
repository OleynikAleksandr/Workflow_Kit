# Параметры сессии (M25, T002)

Публичные типы `SessionParameters`, `ParameterChange`, `ParameterItem`, `ParameterOption`,
`ContextUsage`, `LimitWindow`, `ParameterStyle`, `ParameterId` — `src/parameters.ts`;
экспортируются через `src/index.ts`. Провайдер владеет порядком, подписями, стилем
и вариантами. Параметр без вариантов несёт `reason`; `editable` истинен, когда варианты
есть хотя бы у одного параметра. Необязательные `readParameters(project, localId)` и
`updateParameters(project, localId, change)` работают с эффективными настройками.
Capabilities `sessionParameters` и `updateParameters` требуют явного объявления;
отсутствующий ключ не означает доступность. Старые провайдеры и заглушки сохраняют поведение.
`ProviderContext` вынесен в `context.ts` с прежним публичным экспортом.

`GET …/sessions/:sid/parameters` → `{ supported: true, parameters }`, без метода —
`{ supported: false }`. `POST` с `{ change }` → `{ parameters }`. Оба маршрута сначала
проверяют `listSessions(project)` (localId, затем remoteId), иначе 404 `unknown-session`.
POST проверяет только известные поля, непустые строки до 128 знаков, хотя бы один параметр;
`confirmed` — boolean. Очередь по провайдеру и localId: разные сессии не блокируют друг друга.
Провайдер читает текущие значения внутри очереди; маршрут пишет событие
`provider.parameters.changed` с provider, project, session, parameter, old, new.
Ошибки: 400 `parameter-invalid`, 404 `parameters-unsupported`, 409
`confirmation-required` (confirm), 503 `parameters-unavailable` (hint).

`snapshotFile(dirs, provider, sessionId, platform?)`, `limitsFile(dirs, provider, platform?)`
дают пути под `<state>/session-parameters/<provider>/`. Идентификаторы —
`[A-Za-z0-9_-]{1,128}`; файл общих лимитов `account.limits.json` не пересекается с id сессии.
`readSnapshot<T>` возвращает null для отсутствующего или повреждённого JSON;
`writeSnapshot` пишет временный файл и атомарно переименовывает, убирая временный файл.

`createJsonlTail<T>(selectors, { blockBytes?, maxBytes? })` → `{ read(file), clear(file?) }`:
холодное чтение с конца блоками 1 МиБ, предел 256 МиБ, до получения всех видов записей;
последующие чтения — только дописанное с сохранением редких значений. Селектор возвращает
undefined для посторонней записи. Незавершённая строка ждёт дописывания; неверный JSON
пропускается; строки длиннее блока собираются; укороченный или заменённый файл сбрасывает
эффективные значения. Провайдеры выбирают нужные записи без знаний о них в реестре.

Все эти контракты одинаковы на macOS, Linux и Windows x64/ARM64. Пути строятся через
path с внедрённой платформой; внешние программы не запускаются. Тесты проверяют
все три варианта путей, атомарную запись, очередь, принадлежность и граничные случаи JSONL.

R2/T010: writeSnapshot сериализует запись одного назначения и повторяет атомарное
переименование при EPERM/EACCES/EBUSY до шести попыток (15, 30, 60, 120, 240 мс).
Назначение перед переименованием не удаляется; постоянный отказ сохраняет прежний снимок.
Разные файлы не ждут друг друга. Необязательные SnapshotWriteOptions позволяют проверить
отказы детерминированно. Поведение одинаково на трёх ОС; исправляет Windows EPERM
предварительной CI M25, новые программы ОС не вызываются.

## M26: компактная презентация и нативный access

SessionParameters.presentation optional: layout effort-card, speedHint optional и access
(value string|null, label, tone primary|warning, options, reason). AccessOption дополняет
ParameterOption фиксированной icon hand|shield-check|shield-alert. Старые клиенты продолжают
читать items; Claude/Kimi не обязаны возвращать presentation. Общая панель не знает id провайдера.
ParameterChange.access — opaque id; одновременно access/permissions запрещены HTTP-валидацией.
PARAMETER_IDS не меняет значения; PARAMETER_CHANGE_IDS добавляет access только для записи.
Аудит access сохраняет прежний/новый пресет и реальные permissions/policy/reviewer.
Контракт и очередь одинаковы на macOS, Linux и Windows x64/ARM64; программ ОС нет.
