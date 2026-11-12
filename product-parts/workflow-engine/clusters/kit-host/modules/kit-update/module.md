# Модуль: kit-update

Часть `workflow-engine`, кластер `kit-host`. Алиас импорта: `#kit-update`.

## Назначение

Версия Kit каждого проекта и её обновление одной кнопкой с экрана проекта (спецификация
`docs/planning/M22-kit-source.md`, раздел 2.6). Устаревший Kit обновляется без мастера и без
новой сессии. Файлы проекта пишет только Kit (`install --update`); модуль запускает команду,
хранит её итог и после обновления одобряет хуки Kit у провайдера, которому нужно одобрение
(Codex). Пользователю ничего подтверждать не нужно: нажатие «Обновить Kit» — это согласие.

## Публичный интерфейс (`src/index.ts`)

- `registerKitUpdateRoutes({ router, state, projects, kit, providers, bundled?, intervalMs?,
  hooks?, now?, log?, onUpdated? }) → KitUpdate` (`refresh(projectId?)`, `section()`,
  `settled(projectId)`, `stop()`):
  - раздел `kitUpdate` в `/api/state` — `{ projects: { <id>: KitUpdateState } }` из кэша; для
    каждого проекта не из архива: `installed` (версия Kit в проекте или `null`), `bundled`
    (`KIT_VERSION` бандла приложения из `#kit-bundle`), `state` (состояние папки из `inspect`:
    `KIT_OK`, `KIT_OUTDATED`, `KIT_DAMAGED`, `GIT_NO_KIT`… или `null`, если `inspect` не
    ответил — тогда `note` с текстом Kit), `action` (`update` | `none`), `running`, `error?`
    (`{ code, message, nextAction, at }` — ошибка Kit последнего обновления), `last?`
    (`{ from, to, commit, hooks, at }` — итог последнего обновления; `hooks` — строка на
    каждого провайдера, который одобряет хуки), `checkedAt`;
  - `POST /api/projects/:id/kit/update` — 202 `{ started: true, project, from, to }`; обновление
    идёт в фоне: `kit.install(path, { update: true })` (`install <папка> --host harness
    --update` бандлом приложения через `kit-runner`), затем `approveKitHooks` для каждого
    провайдера реестра, затем `inspect` проекта и `onUpdated(id)`; 404 `not-found` — нет
    проекта; 409 `busy` — обновление этого проекта уже идёт. Новый запуск стирает прежние
    `error` и `last`. В журнал (`log`) — `kit: updated <проект> <из> → <в>` или
    `kit: update failed <проект>: <код>`.
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
  версией старше `bundled`; иначе `none`. `compareVersions(a, b)` — сравнение версий по
  числам, как у установщика Kit. `KIT_INSTALLED_STATES`, `providerLabel(provider)`.
- Типы `KitUpdate`, `KitUpdateOptions`, `KitUpdateSection`, `KitUpdateState`,
  `KitUpdateAction`, `KitUpdateError`, `KitUpdateLast`, `HookApprovalOptions`.

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

## Поведение на ОС

| | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Команды Kit (`inspect`, `install --update`) | `node <бандл>` через `kit-runner` | то же | то же |
| Одобрение хуков Kit | Codex: команда из шаблона | то же | Codex: `commandWindows` хука (PowerShell), как его показывает провайдер (M5, M21) |
| Раздел, маршрут, журнал | одинаково | одинаково | одинаково |

Своих веток по ОС у модуля нет: различия команд хуков знает провайдер.

## Зависимости

`http-server` (маршрут, раздел состояния, `HttpError`, `jsonResult`), `kit-bundle`
(`KIT_VERSION`), `kit-runner` (типы `KitRunner`, `KitInspect`), `provider-registry` (типы
`Provider`, `ProviderRegistry`, `Project`). Служба (`cli`) передаёт `kit` (тот же
`KitRunner`), `providers`, `projects`, `log` и `onUpdated` (`workflow.refresh`). Тесты
используют `kit-structure` (команда хука Kit для Windows).
