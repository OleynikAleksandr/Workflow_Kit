# autopilot: конец плана и ОС (M37)

Раздел перенесён без изменений из [module.md](module.md) (перед M48), чтобы контракт
оставался в пределах размера документа.

## Конец плана и ОС (M37)

Спецификация — [M37](../../../../../../docs/planning/M37-plan-close-flow.md), разделы 2.2 и 2.3.
Код — `src/acceptance.ts` (`createPlanEnd`), тексты — `src/texts.ts`.

- **Кому сообщают.** Сессия-владелец: запомненный владелец проекта, иначе
  `execution.ownerSession` Kit среди сессий канала, иначе `session` из запроса панели. Ключ
  определяется до команды Kit. Владельца нет или он вышел из процесса Kit
  (`channel.excluded`) — команда Kit выполняется, сообщение не ставится, в журнале
  `autopilot: <accept|close> of <project>: no session to notify (<no owner|owner left the Kit process>)`.
- **`accept(projectId, note?, session?)`**: `accept --note` (слова пользователя от трёх знаков,
  иначе `ACCEPT_NOTE`); запуски плана забываются, автопилот сессий проекта выключается;
  владельцу в очередь (источник `panel`) — `acceptedMessage(scopeId, paths)`, где `paths` —
  `plan.dirty` свежего состояния (с `tidyNote`, если пути есть); очередь будит удержанный
  `Stop`; другие сессии проекта с `ready-for-acceptance` будятся; метка владельца — `accepted`.
- **`close(projectId, note?, session?)`**: нет scope — `no-scope`; `close --scope <id> --note`
  (слова от десяти знаков, иначе `CLOSE_NOTE`); отказ Kit `DIRTY_TREE` с `details.paths` —
  `dirty-tree`, 409, `dirtyTreeText(paths)` (до пяти путей, «и ещё N», подсказка про «Попросить
  агента убрать»); прочие отказы — как есть. После успеха: владелец проекта забывается,
  автопилот выключается, владельцу — `closedMessage(scopeId)`, метка — `closed`.
- **`tidy(projectId, session?)`** → `{ owner, paths }`; отказы 409 по порядку: `no-scope`;
  `not-finished` (фаза не `acceptance` и не `accepted`); `clean` (текст `CLEAN_TEXTS` по фазе:
  «…можно принимать результат» / «…план можно закрыть»); `no-owner`; `owner-unavailable`
  (`channel.excluded`). Иначе владельцу — `tidyMessage(paths)`; Kit не вызывается, автопилот
  не трогается. Сессия процесса Kit, которую сейчас нельзя разбудить, — не отказ: сообщение
  ждёт в очереди канала.
- **Метки.** `AutopilotReason` и `STOP_LABELS`: `accepted` — «План принят» (без обещания
  закрытия), `closed` — «План закрыт». `decide()` поправляет устаревшую метку и после приёмки
  или закрытия словами в чате: у сессии с выключенным автопилотом — `settle` (`ACCEPTED` →
  `accepted`, нет scope → `closed`), у включённого — `endReason` при записи причины
  (`ready-for-acceptance` при `ACCEPTED` → `accepted`; `no-scope` после `ready-for-acceptance`,
  `accepted` или `closed` → `closed`).
- После сообщений о приёмке и закрытии автопилот ход не продолжает: он выключен, `decide()`
  отпускает `Stop`. Сообщения — английские, тексты панели — русские.
- Работает с Kit 2.2.5 и 2.2.6: `status` 2.2.5 уже отдаёт `changes`, `DIRTY_TREE` — `details.paths`.
- Тесты: `test/acceptance.test.ts` (подставные Kit, состояние и канал: владелец, отсутствующий
  и исключённый владелец, отказы `close` и `tidy`, сочетания фаз и чистоты дерева, метки),
  `test/flow.test.ts` (настоящий бандл: удержанный владелец получает сообщения о `tidy` и
  приёмке, отказ закрытия с путём, закрытие и метки).

Поведение одинаково на macOS, Linux и Windows x64/ARM64: общий Node-код, пути Kit отдаёт
через `/`, новых вызовов программ ОС нет; доставка — существующий канал.

- **Тест на Windows (F001).** `test/flow.test.ts` удаляет временный проект с повторами
  (`rm` с `maxRetries: 10`, `retryDelay: 200`): команда Kit, запущенная оставшимся таймером
  канала, ещё может работать в папке проекта, и Windows x64/ARM64 отказывает в удалении
  занятой папки (`EBUSY`, CI 43859413953). На macOS и Linux удаление проходит с первого раза;
  код службы не меняется.
