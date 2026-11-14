# M31: неначатый план в любой сессии проекта (проверка)

Спецификация: [M31-plan-in-any-session.md](../planning/M31-plan-in-any-session.md). Дата:
14.11.2026, macOS 27.2 (Apple Silicon, arm64), Node 24.21.0.

## T005: проба `scope:owner` на собранном Kit 2.2.5

Стенд: одноразовый git-проект во временной папке; Kit поставлен из бандла приложения
(`kit-bundle/vendor/workflow-kit-2.2.5.mjs.gz`, SHA-256 распакованного файла
`6f4fab8d…23e4` совпал с `KIT_SHA256`) командой `install --host harness`; git-автор —
временный `GIT_CONFIG_GLOBAL`. После прогона папка удалена. Журнал команд:
[M31/kit-probe.log](M31/kit-probe.log).

| Шаг | Результат |
| --- | --- |
| `scope:propose` (одна задача документации) | поколение 1, `sequential`, `refine` |
| `scope:choose … --session session-A` | scope `probe-1`, ревизия 2, владелец `session-A` |
| `scope:owner --session session-B --note …` | `owner: session-A → session-B (revision 3)`, коммита нет |
| `scope:owner --session session-B` ещё раз | `owner: session-B (unchanged)`, ревизия та же |
| `status` (JSON) | `execution.ownerSession = "session-B"` |
| Решение в плане | `Owner session moved from session-A to session-B: The user started the plan from this session in the Workflow Kit panel` |
| `task:start N`, затем `scope:owner --session session-C` | `OWNER_BUSY`, `details.tasks = ["N"]`, nextAction «Continue the plan in its owner session.», владелец остался `session-B` |

Изменение владельца лежит в рабочем дереве плана (как после `task:block`) и попадает в
следующий коммит Kit.

Автоматические тесты задач: `workflow-kit/test/workflow-kit-owner.test.mjs` (Kit, в том числе
`OWNER_BUSY` при открытом назначении оркестрации), `agent-channel/test/turn-start.test.ts`,
`cross-review/test/author.test.ts`, `autopilot/test/owner.test.ts`,
`session-view/test/plan-cards.test.ts`.

## T006: локальная поставка 0.13.5

Установлена штатно, doctor в порядке, служба 0.13.5; проект с Kit 2.2.4 получает «Обновить
Kit» до 2.2.5 — [local-delivery.md](M31/local-delivery.md).

## Живая проверка по ОС

Сценарий одинаков на всех ОС (поведение без платформенных веток, спецификация, раздел 4).

1. В проекте Workflow Kit с Kit 2.2.5 в сессии одного провайдера (например Claude) агент
   пишет спецификацию и предлагает план (`scope:propose`); ревью проходит или отклоняется.
2. Открыть в том же проекте новую сессию другого провайдера или другой модели.
3. В левом сайдбаре новой сессии видна карточка выбора способа выполнения. Пока вы
   переписываетесь с новой сессией, карточка не пропадает и вопроса о ревью не появляется.
4. Выбрать способ в новой сессии: старая сессия перестаёт ждать («Ждёт выбора пути» уходит),
   сообщение о выборе приходит только в новую сессию.
5. Вариант: выбрать способ в старой сессии, затем открыть новую — карточка плана с «Начать
   выполнение плана» видна и в новой. Нажать её там: план начинается в новой сессии, старая
   отпущена, в плане записан новый владелец.
6. В старой сессии после начала плана видна короткая карточка «План выполняет сессия «…»» с
   «Открыть сессию», кнопка открывает новую сессию.
7. Проект со старым Kit (2.2.4): нажатие «Начать выполнение плана» не в сессии-владельце даёт
   «Обновите Kit проекта до 2.2.5…»; после «Обновить Kit» старт проходит.

| ОС | Кто проверяет | Статус |
| --- | --- | --- |
| macOS | пользователь, после поставки 0.13.5 | ожидается |
| Windows 11 x64 и ARM64 | проверяющий на Windows | ожидается |
| Linux | только CI | CI задачи T007 |
