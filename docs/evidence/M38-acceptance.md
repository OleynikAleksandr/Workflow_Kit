# M38: поставка 0.14.5 (T005)

Проверка поставки агентом. Это не пользовательская приёмка: приёмка (`accept`) и закрытие
scope выполняются отдельно, по командам пользователя. Спецификация —
[M38](../planning/M38-kit-structure-update.md).

Подтверждение поставки и согласие на живую проверку в `task:start --confirmed`: «Выполняй весь
план задача за задачей без пауз - даю тебе на это своё согласие.» (16.11.2026).

## Исходное состояние

16.11.2026 вопрос агента (`AskUserQuestion`) в сессии Claude проекта Workflow_Kit был виден в
Claude Desktop, но не в диалоге панели. Причина: структура Kit (`wfk`) Workflow_Kit осталась
версии 3 без хуков `PreToolUse` и `PermissionRequest`, а в панели не было способа её обновить —
«Обновить Kit» обновлял только Kit проекта (`4eabb66`, Kit 2.2.6), структура осталась 3. Без
`PreToolUse` Claude не пишет ожидающий вопрос в транскрипт
([факты Claude, раздел 7](../design/M33-claude-question-facts.md)).

## Исправление

- Обход 16.11: структура 4 записана маршрутом `POST /api/projects/:id/structure`. T001
  (`4cdfcad`) закоммитил только план — файлы были изменены до `task:start`; исправление F001
  (`6b30010`) закоммитило `.claude/settings.json`, `.workflow-kit/manifest.json` и `AGENTS.md`
  явным `--files`.
- T002 (`0f64e2f`): Kit 2.2.7 — `install --update --with` (`installer-with.ts`), отказы
  `USAGE` и `WITH_NOT_MANAGED`, сообщение `chore: update the Workflow Kit structure`; бандл.
- T003 (`fb0420c`): `kit-update` — `kitUpdate.structure`, запись структуры перед `install
  --update --with`, пропуск изменённых файлов, возврат файлов при отказе Kit; `kit-runner`
  `--with`; `cli` передаёт `checkStructure` и `installStructure`.
- T004 (`cb7ab2d`): карточка Kit со структурой, `docs/usage.md`, `design-qa.md`.
- DOCS-R1 (`8c6bc4b`): README, OVERVIEW, спецификация, сводка круга.

## Сборка и установка

Исходники: `8c6bc4b` плюс повышение версии и CHANGELOG этой задачи; база — 0.14.4.
`package-lock.json` меняет только два поля версии.

```sh
npm run typecheck             # без ошибок
npm run check:platforms       # platform-guard: ok
npm test                      # test:app 1194 (1192 пройдено, 2 пропущено, 0 ошибок); test:kit 59 из 59
npm run build:kit             # Kit 2.2.7, sha256 a378b3c8…1e1299, бандл без изменений
node bin/wfk.mjs install      # app/0.14.5 вместо 0.14.4, удалена старая 0.14.3
~/.local/bin/wfk doctor --installed
curl -s http://127.0.0.1:4747/api/health
```

Doctor: все строки `ok`, «итог: всё в порядке», служба 0.14.5 (pid 16902), LaunchAgent
загружен, общий доступ ChatGPT «Работает». `/api/health`:
`{"ok":true,"version":"0.14.5","pid":16902,"startedAt":"2026-11-16T16:48:38.777Z"}`.
Установка перезапустила только службу; работающие сессии пользователя не перезапускались.

## Живая проверка (macOS, 16.11.2026, время UTC)

Расширение Claude in Chrome не было подключено, поэтому кнопки панели агент нажимал теми же
запросами к службе, что шлёт панель (заголовок `Origin` панели). Вид карточки Kit в браузере
агент не смотрел: его проверяет пользователь; модель карточки покрыта `kit-card.test.ts`.

### 1. «Обновить Kit» в проекте со структурой 3 и Kit 2.2.6

Одноразовый проект `~/WorkflowKitProjects/M38_live_174902`: `git init`, файлы структуры 3 из
`304ae8d` этого репозитория (раздел `AGENTS.md`, `CLAUDE.md`, хуки Claude и Codex,
`.gitignore`, шаблоны, манифест) обычным коммитом `791549e`, затем Kit 2.2.6 бандлом 2.2.6 из
истории `kit-bundle/vendor` (`a83f0f7 chore: install workflow kit 2.2.6`), регистрация
`POST /api/projects/open` (id `4701981f4ece`).

- `GET …/structure`: `outdated`, версия 3 (`agents-section` и `claude-hook` — `outdated`,
  `product-parts-readme` — `missing`).
- `kitUpdate` проекта: `installed` 2.2.6, `state` `KIT_OUTDATED`, `structure` `{ status:
  outdated, installed: 3, version: 4, installable: true, kept: [] }`, `action` `update` — по
  модели карточки заголовок «Kit 2.2.6 → 2.2.7, структура 3 → 4».
- 16:49:52 `POST …/kit/update`: `{"started":true,"from":"2.2.6","to":"2.2.7"}`; через 1 с
  `last` — `{ from: 2.2.6, to: 2.2.7, commit: 66e2e12…, structure: { from: 3, to: 4, files:
  [AGENTS.md, .claude/settings.json, product-parts/README.md, .workflow-kit/manifest.json] },
  structureNote: null }`; строки хуков — «папка не доверена» у ChatGPT и Kimi (проект не
  проходил мастер).
- Один коммит `66e2e12 chore: update workflow kit to 2.2.7` (роль `kit-update`):
  `.claude/settings.json` (+24, хуки вопроса), `.harness/workflow/manifest.json`,
  `.harness/workflow/runtime/workflow.mjs`, `.workflow-kit/manifest.json`, `AGENTS.md`,
  `product-parts/README.md`. `git status` пуст, структура `ok`, версия 4, `action` `none`.

Итог: пройдено.

### 2. Ожидающий вопрос Claude в диалоге панели (Workflow_Kit) — 1 ход Claude

Новая сессия Claude в Workflow_Kit (структура 4 закоммичена F001), запущенная панелью
`POST …/providers/claude/sessions` (16:50:29, `claude:1314009a-…`, «M38 живая проверка
вопроса»), сообщение панели `POST …/sessions/:key/message` (16:51:24, `{"sent":true}`) с
просьбой вызвать `AskUserQuestion` и больше ничего не делать.

- 16:51:29 лента сессии (`GET …/messages`): вопрос `toolu_01Rr3UPx…`, `state` `pending`,
  «Проверка M38: вопрос виден в панели?», варианты «Да» и «Нет», `answerable: true` — хук
  `PermissionRequest` привязан.
- 16:53:59 ответ из панели `POST …/questions/:qid/answer` («Да»):
  `{"answered":true,"outcome":"accepted"}`; вопрос `answered` с ответом «Да». Агент: «Получен
  ответ «Да»: вопрос виден в панели.» Рабочее дерево Workflow_Kit не изменилось.

Итог: пройдено. Сессия и одноразовый проект оставлены в панели; их можно убрать в архив.

## Проверки по ОС

| ОС | Кто | Что | Итог |
| --- | --- | --- | --- |
| macOS | агент | тесты, установка 0.14.5, doctor, `/api/health`, живая проверка выше | пройдено |
| macOS | пользователь | вид карточки «Обновить Kit» со структурой в браузере; приёмка результата M38 | после поставки |
| Linux | CI | typecheck, тесты, platform-guard для точного SHA поставки | пройдено (CI ниже) |
| Windows x64 и ARM64 | CI | то же | пройдено (CI ниже; ARM64 — со второй попытки) |
| Windows x64 или ARM64 | проверяющий на Windows | раздел 4 спецификации: «Обновить Kit» в проекте со структурой 3 — один коммит, структура `ok`, хук Claude в exec-форме | pending — не проверено вживую на Windows |

CI проверку на Windows не заменяет.

## CI точного SHA поставки (T006)

Подтверждение в `task:start --confirmed`: «Выполняй весь план задача за задачей без пауз - даю
тебе на это своё согласие.» (16.11.2026). SHA задачи T005
`aa402cc5b6d24476e191a2bcb85fd8258b24e037` отправлен в новую ветку
`ci/M38-kit-structure-update` (`git push origin <sha>:refs/heads/ci/M38-kit-structure-update`,
без `--force`), прогон
[43913115642](https://github.com/OleynikAleksandr/Workflow_Kit/actions/runs/43913115642).

- Попытка 1: Linux x64, macOS ARM64, Windows x64 — success; Windows ARM64 — один провал
  старого теста M8 `agent-channel/test/detached.test.ts` «an expired watch is picked up by
  maintain» (`[1, 'working']` вместо `[0, 'working']`): таймер наблюдения 16 мс сработал
  позже паузы 60 мс на загруженной машине. Тот же провал и тот же исход — в
  [M30](M30-claude-feed-quiet.md). Ни тест, ни модуль `agent-channel` в M38 не менялись.
- Попытка 2 (`gh run rerun --failed`, тот же SHA): Windows ARM64 — success (17:14:43 UTC);
  итог прогона — success на всех четырёх платформах.

`main` не публиковался и релиз не создавался: это после приёмки и закрытия scope по команде
пользователя.
