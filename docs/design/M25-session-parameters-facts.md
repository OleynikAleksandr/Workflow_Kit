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
`:read-only`. Вид для `:workspace` не снят — снять при реализации.

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

Не проверено: показывает ли приложение ChatGPT изменение из Kit в своих переключателях и
не отправляет ли оно свои значения со следующим ходом. Это живая проверка приёмки.

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
