# M30: без служебных строк в ленте Claude Desktop (проверка)

Спецификация: [M30-claude-feed-quiet.md](../planning/M30-claude-feed-quiet.md). Дата: 14.11.2026,
macOS (Apple Silicon), Claude Code 2.1.325.

## T003: живая проверка

Стенд M29: одноразовый проект Kit, изолированная служба, настоящий `session.exp` под
наблюдателем экрана, модель Haiku 5.5, один короткий ход. Все изменения идут через маршруты
панели. Переписка Claude читается из журнала одноразового проекта; после прогона сессия,
доверие, проект и журнал удалены. Результат: [M30/t003-live.json](M30/t003-live.json).

| Шаг | Время до подтверждения | Запись в переписке |
| --- | --- | --- |
| Чтение каталога (модели и уровни Haiku 5.5) | около 19 с, один раз на версию CLI | `/model` → «Set model to `Haiku 5.5` for this session only» |
| Усилие medium | 2,6 с | `/model` → «… for this session only with `medium` effort» |
| Модель Sonnet 5.5 | 2,6 с | `/model` → «Set model to `Sonnet 5.5` for this session only» |
| Уровни Sonnet 5.5 (фоновое обнаружение) | после смены модели | `/model` → «Set model to `Sonnet 5.5` …» |
| Усилие high | 2,4 с | `/model` → «… with `high` effort» |
| Модель Haiku 5.5 | 2,6 с | `/model` → «Set model to `Haiku 5.5` …» |
| Режим plan / manual | 1,1 с / 1,8 с | нет записей |

Итог по переписке: записей `/effort` — 0, «Kept model as» — 0, записей `/model` — 6. Пробы
перед M30 (спецификация, раздел 1) показали, что Claude Desktop записи `/model` с `s` не
показывает, а `/effort` и «Kept model as» показывает.

- Уровни усилия читаются из строки меню `/model`: Low, Medium, High, xHigh, Max; рекомендованный
  Medium у Haiku 5.5 и Sonnet 5.5 отмечен в меню панели.
- Хэш `~/.claude/settings.json` не изменился; процессов не осталось.

Отличие от раздела 3.2 спецификации: неизвестные уровни новой модели читаются не внутри смены
модели, а фоновым обнаружением сразу после неё (тоже `/model` и `s`), чтобы смена укладывалась
в 3 с.

Лента самого Claude Desktop — проверка пользователя на 0.13.4. Windows — проверяющий на
Windows. Linux — CI.
