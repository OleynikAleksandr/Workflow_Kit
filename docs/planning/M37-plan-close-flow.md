# M37: приёмка и закрытие плана из панели

## Цель и согласование

Пользователь 16.11.2026 прогнал на 0.14.3 два тестовых проекта с одним заданием
(«Список покупок»): `Codex_01` (ChatGPT) и `Claude_01` (Claude). Нашлись три дефекта конца плана:

1. `Codex_01`: «Закрыть план» отвечает «Не удалось: Закрыть план: Close the scope on a clean
   working tree.» — без имени файла и без подсказки, что делать.
2. `Claude_01`: план принят и закрыт кнопками панели, а агент об этом не знает: последней
   реплики нет, строка активности показывает устаревшее «Ждёт приёмки».
3. `Claude_01`: после закрытия плана в боковой панели снова появилась карточка «Ревью плана»
   уже закрытого scope.

После M37 агент получает сообщение о приёмке и о закрытии и отвечает одной-двумя фразами;
файлы вне коммитов видны на карточке плана заранее, а убрать их можно одной кнопкой; Kit сам
говорит агенту, куда класть входные JSON; карточка ревью закрытого плана не показывается.

Пользователь, 16.11.2026: на предложенный состав — «Да, я согласен с таким составом. Сделай
спецификацию и план.»; в панели выбраны спецификация и план с ревью.

## 1. Факты

Разбор двух тестовых проектов и кода 0.14.3 — в [M37-plan-close-facts.md](M37-plan-close-facts.md):
там же подготовка места в документах перед планом.

## 2. Решение

Тексты агенту — английские, тексты панели — русские, как в остальной службе.

### 2.1. Kit 2.2.6 (`kit-core`)

- **Папка входных файлов.** Блок «Inputs and documents» управляемой секции `AGENTS.md`
  (`workflow-installer/src/installer-texts.ts`) получает пункт:
  «Write `--input` and `--digest` JSON files to `.harness/inputs/` (git-ignored): a file left
  elsewhere in the project is an uncommitted change and blocks `close`.»
  `gitignoreSection()` получает строку `.harness/inputs/`. Папку создаёт агент записью файла.
- **Подсказка в схеме.** `schemaText` (`workflow-recovery/src/recovery-schema.ts`) после правил
  схемы добавляет общую строку `- Write the input file to .harness/inputs/ (git-ignored), not
  among the project files.` — её видят `schema <command> --format text` и раздел `schema` пакета.
- **Строка `next`** (`workflow-recovery/src/recovery-sections.ts`), когда `changes` не пуст:
  - `READY_FOR_ACCEPTANCE`: «Scope is READY_FOR_ACCEPTANCE: first tidy the paths outside commits
    (see changes) — delete your temporary files, commit documents with `scripts/workflow
    docs:commit`; `close` needs a clean tree. Then ask the user to accept the result or report
    defects.»
  - `ACCEPTED`: «Scope is ACCEPTED: the user decides when to close it. `close` needs a clean tree:
    tidy the paths outside commits (see changes).»
  - Без таких путей тексты прежние.
- **Отказ `close`** (`workflow-kit/src/kit-scope.ts`): сообщение называет до пяти путей —
  «Close the scope on a clean working tree; not committed: a, b (and N more).», `nextAction` —
  «Delete temporary files or commit documents with `scripts/workflow docs:commit --files
  <paths>`, then repeat close.» Код `DIRTY_TREE` и `details.paths` (полный список) не меняются.
- `KIT_VERSION` = `2.2.6` (`workflow-installer/src/installer-payload.ts`), бандл пересобирается
  `npm run build:kit` (`kit-bundle/vendor`, `src/bundle-meta.ts`, `PROVENANCE`), история версий в
  `WorkflowKitInstallation.md` получает одну строку (запас файла — 700 байт).
- Проекты с Kit 2.2.5 получают всё это кнопкой «Обновить Kit»; служба работает с обеими версиями.

### 2.2. Агент узнаёт о приёмке и закрытии (`autopilot`)

Новый файл `src/acceptance.ts` (`autopilot.ts` уже 400 строк): сообщения, пути и метки конца
плана; `accept`, `close` и новый `tidy` в `autopilot.ts` только вызывают его.

- **Кому.** Сессия-владелец плана: запомненный владелец проекта, иначе `execution.ownerSession`
  из Kit, иначе сессия из запроса панели. Ключ определяется до команды Kit (после `close`
  владельца в Kit уже нет). Владелец не найден или вышел из процесса Kit
  (`channel.excluded(key, projectId)` — такой сессии канал сообщение молча отбрасывает) —
  команда Kit выполняется (приёмка и закрытие — решение пользователя, оно не зависит от
  агента), сообщение не ставится, в журнале
  `autopilot: <accept|close> of <project>: no session to notify (<no owner|owner left the Kit process>)`.
- **`accept(projectId, note, session?)`** после успешного `accept --note`:
  1. как сейчас: `starts.forgetProject`, `enabled = false` у сессий проекта;
  2. читает свежий `status` (`workflow.refresh`) и берёт `changes`;
  3. ставит владельцу в очередь (`channel.enqueue`, источник `panel`) `acceptedMessage`;
     очередь сама будит удержанный `Stop` и сессию, которую служба может разбудить;
  4. будит (`wakeHolders`) другие сессии проекта с причиной `ready-for-acceptance`;
  5. метка владельца — `accepted`.
- **`close(projectId, note, session?)`**: отказ Kit `DIRTY_TREE` превращается в
  `WorkflowActionError('dirty-tree', …, 409)` с текстом из 2.3. После успешного `close`:
  `owners.delete`, `starts.forgetProject`, `enabled = false`, владельцу — `closedMessage`,
  метка — `closed`.
- **Тексты** (`texts.ts`; `<paths>` — до десяти путей в обратных кавычках, дальше «and N more»):
  - `acceptedMessage(scopeId, paths)`: «Workflow Kit: the user accepted the result of scope
    `<id>` in the panel; Kit recorded it. Do not run `accept` or `close`: the user closes the plan
    with the "Закрыть план" button.» + `tidyNote(paths)`, если пути есть, + « Tell the user in one
    or two sentences that the result is accepted and whether the plan can be closed now, then end
    your turn.»
  - `tidyNote(paths)`: « Closing needs a clean working tree, and these paths are not committed:
    `<paths>`. Tidy them now: delete temporary files you created (for example `--input` or
    `--digest` JSON), commit documents worth keeping with `scripts/workflow docs:commit --files
    <paths>`; leave functional code and files you did not create untouched and name them to the
    user.»
  - `closedMessage(scopeId)`: «Workflow Kit: the user closed the plan (scope `<id>`) in the
    panel; Kit recorded it and no scope is active now. Do not run Kit commands for it. Tell the
    user in one or two sentences that the plan is closed and you are ready for the next task,
    then end your turn.»
- **Метки.** `AutopilotReason` и `STOP_LABELS` получают `accepted` — «План принят» и
  `closed` — «План закрыт». Метка не обещает закрытия: мешают ли ему файлы вне коммитов,
  говорит предупреждение на карточке плана (2.4). `decide()` при каждом `Stop` поправляет устаревшую метку
  сессии (`ready-for-acceptance` или `accepted`) по `autopilot:status`: результат `ACCEPTED` —
  `accepted`, scope нет — `closed`. Так метка верна и после приёмки или закрытия словами в чате.
- Ход агента после этих сообщений автопилот не продолжает: `enabled = false`, `decide()`
  отпускает `Stop`. Сессии вне процесса Kit сообщение не получают (правило канала), сессия,
  которую нельзя разбудить, получит его со следующим своим ходом.
- Маршруты `POST …/workflow/accept` и `…/close` передают в автопилот `session` из тела запроса
  (панель его уже шлёт).

### 2.3. Файлы вне коммитов (`plan-view`, `autopilot`)

- `KitStatus` (`plan-view/src/kit-types.ts`) получает необязательное `changes?: string[]`.
  `PlanView` получает `dirty: string[]`: `status.changes` в фазах `acceptance` и `accepted`,
  иначе пустой список (во время работы незакоммиченные файлы — норма).
- Свежесть: `status` перечитывается, когда меняются файлы плана, на каждом `Stop` сессии
  проекта (`decide()`), после каждой команды панели и в `tidy`. Файл, который пользователь
  убрал руками, исчезнет с карточки при следующем таком событии; `close` всегда проверяет сам Kit.
- **Отказ закрытия.** Код `dirty-tree`, 409, текст: «в папке проекта есть файлы вне коммитов:
  `a`, `b` (и ещё N). Пока они есть, план не закроется: нажмите «Попросить агента убрать» на
  карточке плана или уберите их сами.» — до пяти путей из `details.paths`.
- **`tidy(projectId, session?)`** и маршрут `POST /api/projects/:id/workflow/tidy`
  (`{ session }`, ответ `{ owner, paths }`) — единая точка «попросить агента навести порядок»:
  читает свежий `status` и отвечает по порядку (все отказы — 409):
  1. нет scope — `no-scope`, «Нет активного плана»;
  2. фаза не `acceptance` и не `accepted` — `not-finished`, «Убирать файлы можно, когда план
     выполнен»;
  3. путей нет — `clean`; текст по фазе: `acceptance` — «Файлов вне коммитов нет: можно
     принимать результат», `accepted` — «Файлов вне коммитов нет: план можно закрыть»;
  4. владелец не найден — `no-owner`, «Не найдена сессия-владелец плана: уберите файлы сами»;
  5. владелец вышел из процесса Kit (`channel.excluded`) — `owner-unavailable`,
     «Сессия-владелец плана не получает сообщений Workflow Kit: уберите файлы сами»;
  6. иначе ставит владельцу `tidyMessage(paths)`: «Workflow Kit: the user asks you to tidy the
     working tree: closing the plan needs it clean.» + `tidyNote(paths)` + « Then tell the user
     in one or two sentences what you did and whether the working tree is clean now, and end
     your turn.» Текст не обещает закрытия: в фазе `acceptance` результат ещё не принят.
  Сессия в процессе Kit, которую сейчас нельзя разбудить, — не отказ: сообщение ждёт в очереди
  (отложенная доставка канала), панель показывает его в счётчике ожидающих. Автопилот при этом
  не включается.

### 2.4. Панель (`session-view`)

- **Карточка плана.** При непустом `plan.dirty` под списком задач — предупреждение (`sv-warn`):
  «В папке проекта есть файлы вне коммитов: `a`, `b` (и ещё N). Пока они есть, план не
  закроется.» (до пяти путей) и кнопка «Попросить агента убрать» (`workflow/tidy`, ошибка —
  «Не удалось попросить агента»). Кнопки «Принять план» и «Закрыть план» остаются активными.
  Отрисовка и текст — в новом файле `src/plan-dirty.js` (`session-view.js` уже 390 строк),
  `planView` (`plan-cards.js`) отдаёт `dirty`.
- **Карточка «Ревью плана».** `crossReviewView` получает поле `current`: `scopeId` ревью равен
  `scopeId` открытого предложения проекта или активного scope (`workflow.projects[id].proposal`
  и `.plan`). `sidebar-view.js`: законченное ревью основной сессии показывается при
  `!data.plan && review.current`; идущее ревью и карточка в сессии ревьюера — как раньше.
  После `close` (и после предложения другого scope) карточка исчезает.
- **Строка решения о ревью.** Текст при «да»: «Следующий план этой сессии проверит ревьюер —
  так решено ответом на вопрос о плане.» Условия показа не меняются.
- **Метки активности.** `REASON_LABELS` (`activity-model.js`) получает `accepted` и `closed` с
  теми же текстами, что `STOP_LABELS`.

### 2.5. Полный автопилот

Решение не добавляет шагов, где нужен человек: сообщения о приёмке и закрытии уходят сами, а
`tidy` — метод службы, который будущий полный автопилот ([M33](M33-full-autopilot.md)) сможет
вызвать перед `close` без кнопки. При выключенном автопилоте `tidy` вызывается только кнопкой.

## 3. Поведение на ОС

| Что | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Kit 2.2.6: папка `.harness/inputs/`, строка `next`, текст отказа `close` | общий Node-код Kit, пути в `git status` через `/` | так же | так же; x64 и ARM64 |
| Сообщения агенту о приёмке и закрытии, `tidy`, метки | общий Node-код службы; доставка — существующий канал (Claude PTY, демон Codex, Kimi) | так же | так же (ConPTY, `codex app-server proxy`); x64 и ARM64 |
| Предупреждение на карточке плана, карточка ревью | общий ES-код панели | так же | так же; x64 и ARM64 |

Поведение одинаково на трёх ОС; веток по платформе и новых вызовов программ ОС нет,
`tools/platform-guard/allowlist.json` не меняется. Каждая задача дополняет строкой
`docs/architecture/OS-MATRIX.md` и раздел ОС своих `module.md`.

## 4. Проверка

- `kit-core`: секция `AGENTS.md` и `.gitignore` с `.harness/inputs/`; файл в `.harness/inputs/`
  не мешает `close` и не попадает в `changes`; `schemaText` с общей строкой; `next` для
  `READY_FOR_ACCEPTANCE` и `ACCEPTED` с путями и без; отказ `close` с одним, пятью и семью
  путями, `details.paths` полный; версия 2.2.6 и пересобранный бандл (`npm run build:kit`).
- `autopilot`: `accept` ставит владельцу `acceptedMessage` с путями и без, будит удержанную
  сессию, ставит метку; `close` — `closedMessage` и метка; владелец не найден — команда Kit
  выполнена, сообщения нет; то же для владельца, вышедшего из процесса Kit (в очереди пусто);
  `DIRTY_TREE` → `dirty-tree` с русским текстом; `tidy` — шесть исходов раздела 2.3, в том
  числе отсутствующий и исключённый владелец и отложенная доставка сессии, которую нельзя
  разбудить; сочетания `acceptance`/`accepted` × чистое/грязное дерево: метка, текст `clean`,
  `acceptedMessage` с `tidyNote` и без; `decide()` поправляет устаревшую метку; после
  сообщений автопилот ход не продолжает; Kit 2.2.5 без изменений 2.1 — всё работает.
- `plan-view`: `dirty` в сочетаниях `acceptance`/`accepted` × чистое/грязное дерево и пустой в
  остальных фазах; статус без `changes`.
- `session-view`: `planView.dirty`; предупреждение в фазах `acceptance` и `accepted` при
  грязном дереве и его отсутствие при чистом; текст предупреждения с 1, 5 и 7 путями; `current` ревью для
  открытого предложения, активного scope, закрытого scope и другого предложения; условие
  показа карточки; новый текст решения о ревью.
- Код от платформы не зависит; CI: macOS, Linux, Windows x64 и ARM64 для точного SHA поставки.
  Механизм T005 — правило проекта «Three operating systems» (`AGENTS.md`, вне управляемых
  секций): до приёмки CI идёт на ветке `ci/<scope>`. Задача отправляет только точный SHA T004
  в служебную ветку: `git push origin <sha>:refs/heads/ci/M37-plan-close-flow`, без `--force`.
  Это не публикация из правила «GitHub publication»: `main` не отправляется, релиз не
  публикуется, публикация `main` — после приёмки и закрытия scope по команде пользователя.
  Так же шли M33–M36. T005 — задача delivery и начинается только с подтверждения пользователя
  (`task:start --confirmed`).
- Живая проверка на установленной 0.14.4 (macOS) с согласия пользователя, в тестовых проектах:
  - `Codex_01` (план принят, файл вне коммитов на месте, Kit 2.2.5): карточка плана показывает
    предупреждение с именем файла; «Попросить агента убрать» — агент убирает файл и отвечает;
    «Закрыть план» — план закрыт, агент отвечает одной-двумя фразами.
  - `Claude_01` (план закрыт): карточки «Ревью плана» нет.
  - Новый маленький план в одном из проектов после «Обновить Kit»: агент кладёт входной JSON в
    `.harness/inputs/`; после «Принять план» агент отвечает, метка — «План принят»; после «Закрыть план» — ответ агента и метка «План закрыт».
  - Бюджет — до 6 ходов агентов.
- Живая проверка Windows (x64 или ARM64) — проверяющий на Windows: установка 0.14.4, «Обновить
  Kit» в тестовом проекте (секция `AGENTS.md` и `.gitignore` с `.harness/inputs/`, запускатель
  `workflow.cmd`), маленький план — предупреждение о файле вне коммитов и «Попросить агента
  убрать», «Принять план» и «Закрыть план» с ответами агента и метками, после закрытия карточки
  «Ревью плана» нет. Пока проверка не проведена, в документе приёмки стоит «не проверено
  вживую на Windows» (итог `pending`, как в M34); CI этого не заменяет.
- Linux — пока только CI.

## 5. Границы

- `accept` и коммиты задач по-прежнему не требуют чистого дерева; `close` его требует.
- Служба не удаляет и не коммитит файлы проекта сама: это делает агент по сообщению или
  пользователь.
- Приёмка и закрытие словами в чате (агент сам запускает `accept` и `close`) сообщений панели не
  вызывают; меняется только метка (2.2).
- Журнал законченного ревью закрытого плана в панели больше не виден; запись ревью в данных
  службы остаётся.
- Версия структуры проекта панели (`wfk`, v4) и секция `AGENTS.md` панели не меняются.
- Дефекты «ответ во втором круге ревью теряется» и «тупик fixes round после delivery» — отдельные
  работы.

## 6. План

| Задача | Содержание | Файлы |
| --- | --- | --- |
| T001 | Kit 2.2.6: папка входных файлов, `next`, отказ `close`, бандл (2.1) | `workflow-installer`, `workflow-recovery`, `workflow-kit`, `kit-bundle`, документы Kit |
| T002 | Сообщения о приёмке и закрытии, `tidy`, `dirty`, метки (2.2, 2.3) | `autopilot`, `plan-view` |
| T003 | Панель: предупреждение и кнопка, карточка ревью, тексты (2.4) | `session-view` |
| DOCS | README и пользовательские документы, CONTRACTS, OVERVIEW, digest | добавляет Kit |
| T004 | Поставка 0.14.4, установка, живая проверка | версии, CHANGELOG, evidence |
| T005 | CI точного SHA поставки на четырёх платформах | evidence |

Задачи T001–T003 идут по порядку: каждая дополняет `docs/architecture/OS-MATRIX.md`, T003
опирается на `dirty` и маршрут `tidy` из T002.
