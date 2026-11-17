# M41: доказательства приёмки

Спецификация — [M41-autopilot-acceptance.md](../planning/M41-autopilot-acceptance.md).
Проверки выполнены 17.11.2026 на macOS ARM64 (Darwin 27.2.0), Node.js 24.21.0.

## Критерии и доказательства

| Критерий | Чем доказан |
| --- | --- |
| 1. Kit 2.4.5 записывает проверки поставки, отклоняет невыполнимые критерии, сообщает `checksPending`/`checksUnreachable` | T001 `c5e76e8`: `workflow-quality-recording.test.mjs`, `workflow-kit-delivery-checks.test.mjs`; сквозные сценарии 1 и 2 ниже |
| 2. Нехватка доказательств — ожидание приёмки пользователя, затем закрытие и публикация; раннее предупреждение | T002 `0b267cb`: `manual-acceptance.test.ts`, `run-model.test.ts`; сквозные сценарии 3 и 3a ниже |
| 3. «Обновить Kit» отклоняется при открытом плане и до публикации запуска | T003 `ab4c64c`: `kit-update-deferral.test.ts`, `kit-card.test.ts`; сквозной сценарий 4 ниже |
| 4. Сквозные сценарии, выпуск 0.18.0, CI четырёх платформ | этот документ: сценарии T004; выпуск — раздел T005; CI — раздел T006 |

## T004: сквозные сценарии на настоящем bundle 2.4.5

Стенд — `autopilot/test/m40-world.ts`: временные git-проекты с bare `origin`, Kit из бандла
приложения (`decisions: host`), служба, собранная как в `wfk serve`, «Полный автопилот»,
агент-скрипт. Профиль качества: `lint` (commit), `smoke` (delivery, проходит, только когда
есть `docs/release.md`), `src-smoke` (delivery, `appliesTo src/**`), `push-guard` (push).

`node --test product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m41-acceptance-real.test.ts`
— 4 из 4:
1. Задача поставки D1 называет `smoke`, критерий — `lint` и `smoke`: хук записывает `smoke`
   при коммите D1, запуск сам принимает (`automatic acceptance by run`), закрывает и
   публикует; решение `accept` в истории Kit — источник `grant` этого запуска.
2. `scope:propose` отклоняет `AUTOMATION_CHECK_UNRECORDED`: `push-guard` — `stage-push`,
   `smoke` без задачи поставки — `delivery-unassigned`, `src-smoke` у D1 с файлами `docs/**`
   — `applies-to`; scope не создан.
3. Файла доказательств нет ни в HEAD, ни на диске, дерево чистое: запуск в `accepting` с
   `manualAcceptance` и подсказкой «нажмите «Принять план»…», при том же HEAD Kit не
   вызывается (ревизия и тикеты не меняются); «Принять план» (решение с источником `button`)
   — закрытие запуском, CI коммита закрытия, публикация именно этого SHA; фазы `blocked` не
   было.
3a. Файл доказательств лежит незакоммиченным: запуск ждёт приёмки; после «Принять план»
   закрытие получает `DIRTY_TREE`, запуск останавливается с подсказкой о незакоммиченных
   файлах, файл сохранён, scope принят.

`node --test product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/m41-kit-update-real.test.ts`
— 1 из 1 (сценарий 4): при открытом плане `POST /api/projects/:id/kit/update` — 409
`scope-open`, HEAD не меняется; после закрытия, пока запуск ждёт CI финального SHA, — 409
`run-active`, HEAD и `inspect` Kit прежние, раздел даёт `deferred { run-active }`; после
проверенной публикации — 202, отказа отложения нет.

## Живые проверки по ОС

| ОС | Что | Кто |
| --- | --- | --- |
| macOS | карточка запуска «Ждёт вашей приёмки» с причиной; выключенная «Обновить Kit» с подписью при открытом плане | пользователь |
| Windows 11 x64/ARM64 | то же в панели на Windows | проверяющий Windows |
| Linux | только CI | CI |

Кода с ветками по ОС в M41 нет: общий Node-код Kit и службы, ES-код панели.
