# M26 / T001: проверенный контракт нативного доступа

## Источники и границы

Проверка 13.11.2026 на macOS: ChatGPT 26.1106.51428, демон Codex 0.169.0.
Скриншоты и уточнения пользователя задают вид и размещение. Семантика подтверждена
[Permissions](https://learn.chatgpt.com/docs/permission-modes) и
[Auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review), страницы прочитаны
через OpenAI Docs. Дополнительно прочитана [справка app-server](https://learn.chatgpt.com/docs/app-server).

Оба первых пресета сохраняют workspace-границу; отличаются адресатом подтверждений.
Автоматический проверяющий — штатная функция Codex. Реальные запросы одобрения во время
проб не создавались: проверены настройка, сохранение и read-back, а не качество решений
самого проверяющего. Kit не одобряет запросы самостоятельно.

Точные запросы и данные — [persistent roundtrip](../../evidence/M26/access-persistent-roundtrip.json),
[проверка инвариантов](../../evidence/M26/access-proof-unload-not-observed.json) и
[новое соединение](../../evidence/M26/access-fresh-connection.json).

## Канонические пресеты

Поля одного thread/settings/update; threadId — только id целевой сессии.
Opaque значения access для Kit: ask, auto, full. Эти id не равны filesystem-профилям.

| access | Подпись | permissions | approvalPolicy | approvalsReviewer |
| --- | --- | --- | --- | --- |
| ask | Запрашивать разрешение | :workspace | on-request | user |
| auto | Подтверждать за меня | :workspace | on-request | auto_review |
| full | Полный доступ | :danger-full-access | never | user |

Каждый набор принят настоящим thread/settings/update. thread/resume вернул тот же
профиль, политику и проверяющего. Сохранились gpt-6.1-sol, low, priority, режим default
и специальная контрольная строка developer_instructions. Первый ход перед пробами
создавал сохранённый тред и отвечал одним словом без инструментов.

Для auto новое соединение после закрытия исходного также прочитало on-request,
auto_review и :workspace. Старое имя guardian_subagent принимается API, но чтение
канонизирует его в auto_review. Неизвестный reviewer отклоняется с -32600; это enum,
в отличие от некоторых свободных строк модели, которые валидирует сам Kit.

После первого ответа и после переключений публичная фабрика createParameterParts
вернула из штатного читателя метаданных fromTurn false, approval_policy,
approvals_reviewer и permission_profile. Для workspace профиль managed/restricted,
для полного доступа — disabled. Agent не загружал в контекст текст переписки.

## Распознавание текущего значения

- ask: точный известный workspace-профиль M25 + on-request + user.
- auto: тот же workspace-профиль + on-request + auto_review (старый alias канонизируется).
- full: точный danger-full-access + never. Reviewer user — проверенный канонический
  набор записи. При never автоматическая проверка не вызывается; известный reviewer
  auto_review не создаёт ограничений доступа, но такое сочетание отдельно не менялось пробой.
  До дополнительного теста распознавать его консервативно как «Особые разрешения».
- read-only не является ask. Иная policy, granular-объект, неопознанный reviewer,
  нестандартный filesystem/network или недостаточные данные — «Особые разрешения»,
  без отметки одного из трёх пресетов. Не подставлять reviewer из глобальных defaults.

Из текущих метаданных нужно читать весь эффективный набор. Если последняя запись
не содержит reviewer/profile, отсутствие поля не означает user/workspace: сохранять
последнее явно сообщённое значение штатным tail-читателем либо показывать неизвестность.
GET не должен делать thread/resume или запускать программы ради этой информации.

## Доступность и ограничения

Снимок [catalogs.json](../../evidence/M26/catalogs.json): requirements null,
guardian_approval — stable, enabled true; все три permissionProfile/list.allowed true.
Это состояние этой машины, не разрешение обходить управляемую политику на другой.

До предложения/применения access учитывать:

1. Свежую возможность изменения сессии M25: общий доступ active/unsupported и файл сессии.
2. permissionProfile/list для cwd проекта: workspace нужен обоим первым пресетам,
   danger-full-access — полному; allowed false блокирует вариант.
3. configRequirements/read: допустимость approval policy и approvals reviewer.
4. Действующее guardian_approval: явный запрет блокирует auto. Не включать feature и
   не переписывать пользовательский config.toml ради появления варианта.

Недоступный источник требований/проверяющего не трактовать как разрешение на auto.
T002 уточняет точные поля nullable requirements по фактическому ответу/типам и тестам;
при неизвестной форме вариант отключается с причиной. Итог перепроверяется после RPC,
а не выводится из ответа {}. Нужны серверные проверки confirmed true для full;
подтверждение интерфейса не заменяет их. Kit сохраняет отказы сервера без обхода.

## Остальные контролы

[model/list](../../evidence/M26/catalogs.json) вернул восемь моделей без следующей
страницы. Усилия берутся из supportedReasoningEfforts, скорость из serviceTiers:
Sol/Astra сейчас 2x, Terra и часть остальных — 1.5x. У Luna нет ultra.
Default используется только существующим согласованием совместимости при смене модели.
Кнопку сброса пользователь исключил. «Подробнее» также исключено; адрес справки
не является зависимостью реализации.

Название модели открывает отдельный список под полем ввода — прямое уточнение
пользователя, не вложенный экран внутри карточки. Оставшиеся визуальные состояния
проверяются по оригинальным PNG с этими согласованными отличиями.

## ОС и живые проверки

Семантика таблицы и публичный JSON-контракт одинаковы на macOS, Linux и Windows
x64/ARM64. Здесь проверен настоящий демон только на macOS. Ветки путей, требования,
отказы и сохранение полей должны проверяться T002 с injected linux/win32.
Живые macOS/iPad — пользователь; Windows — проверяющий на Windows; Linux — CI.
