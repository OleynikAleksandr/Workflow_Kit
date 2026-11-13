# M25: проверенные факты о параметрах сессии

Приложение к [спецификации M25](../planning/M25-session-parameters.md). Пробы 13.11.2026 на macOS:
codex-cli 0.167.2, демон Codex 0.169.0, Claude Code 2.1.323. Пометки: **[проверено]** —
получено на устройстве; **[схема]** — есть в `codex app-server generate-ts --experimental`,
не вызывалось; **[документация]** — заявлено в документации Claude Code.

## 1. ChatGPT (Codex): чтение

| Что | Источник | Статус |
| --- | --- | --- |
| Модель, усилие | `thread/read { threadId }` → `thread.model`, `thread.reasoningEffort`; работает для `notLoaded` | **[проверено]** |
| Путь файла сессии | `thread/read` → `thread.path` | **[проверено]** |
| Имена моделей, уровни усилия, скорости | `model/list` → `displayName`, `supportedReasoningEfforts[]`, `defaultReasoningEffort`, `serviceTiers[]`, `hidden` | **[проверено]** |
| Режимы | `collaborationMode/list` → `plan`, `default` (экспериментальный) | **[проверено]** |
| Профили разрешений | `permissionProfile/list` → `:read-only`, `:workspace`, `:danger-full-access`, поле `allowed` | **[проверено]** |
| Лимиты | `account/rateLimits/read` → `rateLimits.primary`, `secondary`: `usedPercent`, `windowDurationMins`, `resetsAt` (секунды эпохи) | **[проверено]**: одно окно 10 080 минут |
| Настройки в файле сессии | Запись `turn_context` (`model`, `effort`, `approval_policy`, `sandbox_policy.type`, `collaboration_mode.mode`) — на каждый ход | **[проверено]** |
| Настройки в файле сессии | Событие `thread_settings_applied` → `thread_settings` (`model`, `reasoning_effort`, `service_tier`, `approval_policy`, `permission_profile`, `collaboration_mode`) — на ход и на каждое изменение без хода | **[проверено]** |
| Контекст в файле сессии | Событие `token_count` → `info.model_context_window`, `info.last_token_usage.total_tokens` | **[проверено]**: 258 400 и 24 052 |
| Контекст по протоколу | Уведомление `thread/tokenUsage/updated` — только подписанному соединению | **[проверено]** |
| Полные настройки по протоколу | Ответ `thread/resume`: `approvalPolicy`, `sandbox`, `activePermissionProfile`, `collaborationMode`, `serviceTier`; тред при этом загружается | **[проверено]** |

Значения `permission_profile` в файле: `{ "type": "disabled" }` при полном доступе;
`{ "type": "managed", "file_system": { "entries": [{ …, "access": "read" }] } }` при
`:read-only`. Вид `:workspace` и правило распознавания —
[правила](M25-session-parameters-rules.md), раздел 4.

Модели (видимые): `gpt-6.1-sol` (по умолчанию), `gpt-6-astra`, `gpt-6.1-terra`, `gpt-6-sol`,
`gpt-6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`. Усилия: `low`, `medium`, `high`,
`xhigh`, `max`, `ultra` (у моделей `luna` нет `ultra`). Скорость: `priority`.
`displayName` пишется вразнобой: `GPT-6.1-Sol`, но `GPT-6.1 Terra`; приложение показывает
`GPT-6.1 Sol`.

## 2. ChatGPT (Codex): изменение

Все шаги — на тестовых тредах в отдельной папке; треды удалены (`thread/delete`).

- Соединение с `capabilities.experimentalApi: true` демон принимает. **[проверено]**
- `thread/settings/update { threadId, model?, effort?, serviceTier?, collaborationMode?,
  permissions? }` отвечает `{}` и рассылает `thread/settings/updated` с полным
  `threadSettings`. **[проверено]**
- Демон значения **не проверяет**: принял несуществующую модель и усилие `ultra` у модели,
  которая его не поддерживает. Проверять обязан Kit. **[проверено]**
- `collaborationMode: { mode, settings: { model, reasoning_effort, developer_instructions } }`
  заменяет модель и усилие значениями из `settings`. **[проверено]**
- Изменение без хода сразу пишется в файл сессии событием `thread_settings_applied`
  и переживает выгрузку треда: `thread/read` и `thread/resume` после выгрузки вернули
  новые значения. **[проверено]**
- Работает для загруженного треда и без подписки соединения. **[проверено]**
- Тред без единого хода не имеет файла сессии: `thread/resume` отвечает
  `no rollout found`. **[проверено]**
- `turn/start` принимает `model`, `effort`, `approvalPolicy`, `sandboxPolicy`, `serviceTier`
  «для этого и следующих ходов» (стабильная часть). **[схема]**
- `turn/settings/update` меняет идущий ход (экспериментальный). **[схема]**

Живая проба T001 подтвердила показ изменённых параметров и их применение к ходу
из приложения ChatGPT, а также обратное направление. Подробности — раздел 7.

## 3. Claude: чтение

| Что | Источник | Статус |
| --- | --- | --- |
| Строка состояния вызывается в сессии, которую запустила панель (`claude --remote-control` под pty) | Кэш пользовательского скрипта строки состояния обновлялся для такой сессии во время пробы | **[проверено]** |
| Поля входа строки состояния | `model.id`, `model.display_name`, `effort.level`, `context_window.context_window_size`, `context_window.used_percentage`, `fast_mode`, `rate_limits.five_hour` и `seven_day` с `used_percentage` и `resets_at` | **[проверено]** по журналу пользовательского скрипта (2.1.314) |
| Режима разрешений во входе строки состояния нет | Тот же журнал | **[проверено]** |
| Режим | Транскрипт, записи `{"type":"permission-mode","permissionMode":"auto"}` | **[проверено]** |
| Модель и усилие последнего ответа | Транскрипт, записи `assistant`: `message.model`, `effort` | **[проверено]** |
| Токены последнего ответа | Транскрипт, `message.usage` (`input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`); размера окна нет | **[проверено]** |
| Лимитов в транскрипте нет | Поиск по ключам | **[проверено]** |
| Настройка `statusLine` одна; приоритет: командная строка (`--settings`) → локальные → проектные → пользовательские | settings.md | **[документация]** |
| Частота вызова: старт, после ответа, смена режима, `refreshInterval`; задержка 300 мс | statusline.md | **[документация]** |
| `rate_limits` есть только на подписке и после первого ответа | statusline.md | **[документация]** |

Формат транскрипта документация называет внутренним. Kit уже читает его для ленты.

## 4. Claude: изменение (не входит в M25)

- Флаги запуска `--model`, `--effort`, `--permission-mode`, `--settings` есть в
  `claude --help` 2.1.323. **[проверено]**
- В работающей сессии: `/model <имя>`, `/effort <уровень>`, Shift+Tab по кругу; внешнего API
  нет. **[документация]**

## 5. Родное оформление (скриншоты пользователя 13.11.2026, тёмная тема)

- Claude: под рамкой ввода справа — `Fable 5.2` (основной цвет), `High` (приглушённый),
  `Auto` (основной), кольцо контекста с синей дугой.
- ChatGPT: кольцо контекста (серое), значок молнии, `GPT-6.1 Sol` (основной), `Высокое`
  (приглушённый), стрелка вниз.

## 6. Пробы по ревью плана (13.11.2026)

- Без `experimentalApi` работают `thread/read`, `account/rateLimits/read`, `model/list`,
  `permissionProfile/list`; `collaborationMode/list` и `thread/settings/update` отвечают
  `-32600 … requires experimentalApi capability`. **[проверено]**
- `thread/settings/update { effort }` и `{ model }` без `collaborationMode`: демон сам
  обновляет `collaborationMode.settings.model` и `reasoning_effort` и сохраняет заданные
  `developer_instructions`. **[проверено]**
- `collaborationMode` с `developer_instructions: null`: демон подставляет встроенные
  инструкции выбранного режима (текст режима «План» — 9 156 знаков, режима «Обычный» —
  1 288); прежние свои инструкции заменяются. **[проверено]**
- `thread/settings/update { permissions }` для `:workspace`, `:danger-full-access`,
  `:read-only`: уведомление несёт `activePermissionProfile.id` и `sandboxPolicy.type`
  (`workspaceWrite`, `dangerFullAccess`, `readOnly`); структура в файле сессии —
  в правилах, раздел 4. **[проверено]**
- Строка состояния Claude на Windows запускается через Git Bash, без него — через
  PowerShell; `CLAUDE_CODE_GIT_BASH_PATH` задаёт путь к `bash.exe`; пустой вывод скрывает
  строку; тайм-аут не описан. **[документация]** (statusline.md, env-vars.md)

## 7. Живая проба T001: положительный исход (13.11.2026)

Проба на чате проекта `Workflow_Kit` (`01a1d50b-6999-7022-81c9-9f604ceea169`)
при повторно подтверждённом общем доступе `active`. **[проверено]**

1. Внешний скрипт через `thread/settings/update` изменил
   `gpt-6.1-sol` / `high` → `gpt-6-astra` / `medium`.
   `thread/read` и `thread_settings_applied` от `2026-11-13T13:17:09.192Z`
   подтвердили новую пару. **[проверено]**
2. Пользователь подтвердил: «На Mac и iPad отображается GPT-6 Astra / Среднее».
   **[наблюдение пользователя]**
3. Пользователь отправил сообщение из ChatGPT. `turn_context` от
   `2026-11-13T13:19:43.645Z` подтвердил `gpt-6-astra` / `medium`.
   **[проверено]**
4. Пользователь переключил в ChatGPT на Mac модель на GPT-6.1 Sol и усилие на
   «Высокое». Из файла сессии прочитаны `thread_settings_applied` от
   `13:20:22.871Z` (`gpt-6.1-sol` / `medium`) и `13:20:26.106Z`
   (`gpt-6.1-sol` / `high`). `turn_context` отправленного из приложения хода
   от `2026-11-13T13:20:36.420Z` и `thread/read` подтвердили итоговую пару.
   **[проверено]**

Исход по таблице раздела 1 правил M25 — **положительный**. T002 разрешена.
Скрипт пробы находится вне репозитория, функциональные файлы не менялись.

Отдельное наблюдение: iPad сообщает «занято другим приложением» при открытии
сессии. По указанию пользователя разбор отложен. Показ параметров на iPad
подтверждён его словами; успешное открытие и отправка с iPad не доказаны,
причина занятости не исследовалась. Это не подтверждение полной работоспособности iPad.
Прежняя строка параметров Kit будет заменена в T007.
Подробности — [доказательства M25](../evidence/M25-acceptance.md).

## 8. Уточнения реализации R1

- В текущем `turn_context` может не быть `service_tier`, хотя предыдущая запись
  `thread_settings_applied` сообщила priority. Отсутствие поля не доказывает стандартную
  скорость: читатель сохраняет последнее явно сообщённое значение. Образец живой
  пробы T004 вернул priority при сохранённом workspace-профиле. **[проверено]**
- Workspace-профиль содержит file_system.type restricted, read специального root,
  write рабочей папки, slash_tmp/tmpdir и дополнительные read путей служебных подпапок.
  Образец снят на временном треде вне проекта; тред и папка удалены. **[проверено]**
- Новая реализация и её автоматические проверки не являются установленной версией:
  установка 0.11.0 и CI SHA поставки фиксируются отдельными задачами. Показ строки
  и touch/клавиатура iPad требуют живой оценки пользователя.

## 9. Результат реализации R1

T001 дала положительный исход: Mac/iPad показывают внешние изменения модели/усилия,
ход из ChatGPT использует их, обратное изменение из приложения читается из файла.
T002–T007 реализованы и проверены автоматически, включая изолированный браузер;
статус локальной поставки и CI — в доказательствах, не выводится из наличия кода.

Надёжность реализации: скорость сохраняет последнее явно сообщённое значение;
незнакомые значения сбрасывают свой каталог; лимиты statusline обновляются с блокировкой
и проверкой времени; опрос строки сохраняет фокус и не работает в скрытой вкладке.
На Windows statusline запускается стабильным wfk.mjs через node из PATH службы,
что работает в Git Bash и PowerShell; процессовые маркеры удаляются перед Claude.

Проверка живой строки Claude, запущенной установленной панелью, перенесена в T008:
до установки в 0.10.0 нет новой команды statusline. T006 проверила цепочку автоматически
с подставным CLI и реальным expect. Изменение критерия записано командой task:update
по разрешению пользователя самостоятельно выбирать все действия. Живая приёмка
и сообщение iPad «занято другим приложением» остаются отдельными наблюдениями.
