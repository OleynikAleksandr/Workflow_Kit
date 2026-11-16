# Модуль: kit-update

Часть `workflow-engine`, кластер `kit-host`. Алиас импорта: `#kit-update`.

## Назначение

Версия Kit каждого проекта и её обновление одной кнопкой с экрана проекта (спецификация
`docs/planning/M22-kit-source.md`, раздел 2.6). Устаревший Kit обновляется без мастера и без
новой сессии. С M38 (`docs/planning/M38-kit-structure-update.md`, раздел 2.2) та же кнопка
обновляет и структуру Kit (`wfk`, модуль `kit-structure`): устаревшие фрагменты записываются
перед `install --update --with`, и Kit коммитит их вместе со своими файлами одним коммитом.
Модуль запускает команды, хранит их итог и после обновления одобряет хуки Kit у провайдера,
которому нужно одобрение (Codex). Пользователю ничего подтверждать не нужно: нажатие «Обновить
Kit» — это согласие.

## Публичный интерфейс (`src/index.ts`)

- `registerKitUpdateRoutes({ router, state, projects, kit, providers, structure?, bundled?,
  intervalMs?, hooks?, now?, log?, onUpdated? }) → KitUpdate` (`refresh(projectId?)`,
  `section()`, `settled(projectId)`, `stop()`); `kit` — `inspect`, `install` и необязательный
  `status`, `structure` — `{ check(root), install(root) }` (`checkStructure` и
  `installStructure` из `#kit-structure`, их передаёт `cli`; без него структура не
  проверяется):
  - раздел `kitUpdate` в `/api/state` — `{ projects: { <id>: KitUpdateState } }` из кэша; для
    каждого проекта не из архива: `installed` (версия Kit в проекте или `null`), `bundled`
    (`KIT_VERSION` бандла приложения из `#kit-bundle`), `state` (состояние папки из `inspect`:
    `KIT_OK`, `KIT_OUTDATED`, `KIT_DAMAGED`, `GIT_NO_KIT`… или `null`, если `inspect` не
    ответил — тогда `note` с текстом Kit), `action` (`update` | `none`), `structure`
    (`{ status, installed, version, installable, kept }` — структура Kit проекта с
    установленным Kit: общий статус `kit-structure`, версия манифеста или `null`, версия
    приложения, есть ли что записать, пути фрагментов `modified` и `newer`; `null` без Kit, без
    `structure` в опциях и при ошибке проверки — тогда `structureNote` «Структура Kit:
    <текст>»), `running`, `error?` (`{ code, message, nextAction, at }` — ошибка Kit последнего
    обновления), `last?` (`{ from, to, commit, hooks, structure, structureNote, at }` — итог
    последнего обновления; `hooks` — строка на каждого провайдера, который одобряет хуки;
    `structure` — `{ from, to, files }` записанной и закоммиченной структуры или `null`;
    `structureNote` — «Структура Kit не обновлена: <причина>» или `null`), `checkedAt`;
  - `POST /api/projects/:id/kit/update` — 202 `{ started: true, project, from, to }`; обновление
    идёт в фоне. Если структура `installable`: `kit.status` проекта (поле `changes`); нет
    `status`, отказ или нет поля — структура пропускается с причиной «Kit не сообщил файлы вне
    коммитов»; если файл к записи (фрагменты `missing` и `outdated` и манифест) есть в
    `changes` — пропуск с причиной «файлы изменены и не закоммичены: <до пяти путей> и ещё N»;
    иначе модуль сохраняет текст этих файлов, вызывает `structure.install` и переводит
    записанные фрагменты в пути. Отказ `kit-structure` (повреждённый JSON, маркеры) — пропуск
    с его текстом. Затем `kit.install(path, { update: true, with? })` (`install <папка> --host
    harness --update [--with <JSON>]` бандлом приложения через `kit-runner`): один коммит Kit и
    структуры. Отказ или исключение Kit возвращает сохранённые тексты и удаляет созданные файлы
    структуры. Затем `approveKitHooks` для каждого провайдера реестра, `inspect` проекта и
    `onUpdated(id)`; 404 `not-found` — нет
    проекта; 409 `busy` — обновление этого проекта уже идёт. Новый запуск стирает прежние
    `error` и `last`. В журнал (`log`) — `kit: updated <проект> <из> → <в>` или
    `kit: update failed <проект>: <код>`, а для структуры — `kit: structure <проект> <из> →
    <в>` или `kit: structure skipped <проект>: <причина>`.
- `approveKitHooks(provider, project, { pollMs?, attempts?, sleep? }) → строка | null` —
  одобрение хуков Kit одного провайдера после обновления:
  - провайдер без `approveHooks` (Claude) и провайдер, чьё одобрение пишет файл (`hooks()` с
    `writes`, Kimi), — `null`, ничего не делается;
  - папка не доверена (`trust().trusted !== true`) — строка «папка не доверена — хуки Kit не
    одобрялись»;
  - иначе `hooks(project)` читается до `attempts` (15) раз с паузой `pollMs` (1 с), пока у хука
    Kit нет хеша (Codex ещё не перечитал `.codex/hooks.json`); с хешем — `approveHooks` с
    командой и хешем, которые провайдер показал сейчас (на Windows это `commandWindows`).
    Отказ `hash-changed` (список был старше обновления) — новое чтение. Итог: «хуки Kit
    одобрены», «… не показал их хеш; одобрите в «Настройках»» или текст ошибки провайдера.
- `kitAction(inspect, bundled)` — `update` для `KIT_OUTDATED` и для установленного Kit с
  версией старше `bundled`; иначе `none`. Раздел даёт `action: update` и тогда, когда Kit
  свежий, а `structure.installable`. `compareVersions(a, b)` — сравнение версий по
  числам, как у установщика Kit. `KIT_INSTALLED_STATES`, `providerLabel(provider)`.
- Типы `KitUpdate`, `KitUpdateOptions`, `KitUpdateSection`, `KitUpdateState`,
  `KitUpdateAction`, `KitUpdateError`, `KitUpdateLast`, `HookApprovalOptions`,
  `KitStructureState`, `KitStructureLast`, `StructureAccess` (`src/structure.ts`).

## Инварианты

- Раздел состояния только читает кэш (D11): `inspect` запускается в `refresh()` — при
  регистрации, раз в `intervalMs` (60 с), после изменения плана (`onChange` состояния
  `workflow` в `cli`) и после обновления. Проекты опрашиваются по одному; проект, который
  обновляется, не опрашивается. Записи архивных и удалённых проектов уходят из раздела.
- Новый Kit не заменяется старым: Kit сам не запрещает понижение версии, поэтому кнопку
  даёт только `action: update` для более старой версии.
- Одобряются только хуки, которые провайдер считает хуками Kit: модуль передаёт команду
  хука Kit из `hooks()`, а Codex сам проверяет точную команду шаблона и одобряет вместе с ним
  только хуки Kit и хук Harness с точной командой (M21). Чужие хуки не одобряются.
- `approveHooks` зовётся и для хука, который выглядит одобренным: провайдер сверяет его со
  свежим списком, а прочитанный список мог быть старше обновления.
- Ошибка провайдера при одобрении не делает обновление неудачным: Kit уже обновлён, строка с
  причиной попадает в `last.hooks`.
- Маршрут и фоновая работа никогда не бросают необработанных исключений: исключение
  становится `error` с кодом `KIT_UPDATE_FAILED`.
- Структура проверяется только у проекта с установленным Kit (`KIT_INSTALLED_STATES`): без
  Kit её ставит мастер. Проверка только читает файлы, отдельного процесса нет.
- Файл структуры с изменениями вне коммитов никогда не перезаписывается и не попадает в
  служебный коммит: структура пропускается целиком, Kit обновляется дальше.
- Структура коммитится только Kit (`--with`) в той же транзакции `kit-update`, что и файлы
  Kit; модуль сам git не вызывает. Если Kit отказал или упал, файлы структуры возвращаются к
  прежнему тексту, созданные удаляются; после успеха Kit возврата нет.
- Фрагменты `modified` и `newer` не перезаписываются (`installStructure` без `force`), их пути
  — в `structure.kept`.

## Поведение на ОС

| | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Команды Kit (`inspect`, `install --update [--with]`, `status`) | `node <бандл>` через `kit-runner` | то же | то же |
| Структура Kit (M38): проверка, запись, возврат файлов | `kit-structure`; пути через `path.join` от корня | то же | то же; команды хуков Claude — в exec-форме `kit-structure` (M33) |
| Одобрение хуков Kit | Codex: команда из шаблона | то же | Codex: `commandWindows` хука (PowerShell), как его показывает провайдер (M5, M21) |
| Раздел, маршрут, журнал | одинаково | одинаково | одинаково |

Своих веток по ОС у модуля нет: различия команд хуков знает провайдер.

## Зависимости

`http-server` (маршрут, раздел состояния, `HttpError`, `jsonResult`), `kit-bundle`
(`KIT_VERSION`), `kit-runner` (типы `KitRunner`, `KitInspect`), `kit-structure`
(`MANIFEST_PATH`, типы `StructureReport`, `InstallResult`), `provider-registry` (типы
`Provider`, `ProviderRegistry`, `Project`). Служба (`cli`) передаёт `kit` (тот же
`KitRunner`), `providers`, `projects`, `structure` (`checkStructure`, `installStructure`),
`log` и `onUpdated` (`workflow.refresh`). Тесты используют `kit-structure` (команда хука Kit
для Windows, настоящая структура), `kit-bundle` и `process-supervisor` (настоящий Kit) и
`plan-view` (тип `KitStatus`).

## Тесты

- `test/kit-update.test.ts` — сравнение версий, раздел и фоновое обновление с одобрением
  хука Codex, ошибка Kit, ошибка `inspect`, одобрение хуков (недоверенная папка, Claude,
  Kimi, поздний и устаревший список, Windows).
- `test/kit-update-structure.test.ts` — структура с подставными `kit-structure` и Kit во
  временной папке: поле `structure` и `action: update` ради одной структуры, `kept`, ошибка
  проверки, проект без Kit; запись структуры и `install` с `with`; пропуск при изменённых
  файлах и без списка изменений; возврат файлов при отказе и при исключении Kit.
- `test/kit-update-real.test.ts` — настоящие `kit-structure` и бандл Kit на временном
  git-репозитории: структура 3 без хуков вопроса становится текущей одним коммитом
  `chore: update the Workflow Kit structure` (роль `kit-update`), дерево чистое.
- `test/kit-update-instructions.test.ts` (M39 T004) — настоящие бандл Kit и `kit-structure` в
  одном `AGENTS.md`: одно правило публикации (основная ветка — только после приёмки и закрытия,
  поставка пушит только CI-ветку), граница автопилота в обоих разделах, оговорка о
  пересборке vendor-бандла, `task:defer-delivery`; `autopilot:status` даёт полный capability
  (`plan-view` `autopilotSupport` — `ready`); установка, помеченная Kit 2.3.2 со старым снимком
  правил, получает `KIT_OUTDATED`, `kitAction` → `update` (и для 2.3.2 → 2.3.3), а
  `install --update` возвращает новый снимок; дерево чистое, `inspect` — `KIT_OK`.
