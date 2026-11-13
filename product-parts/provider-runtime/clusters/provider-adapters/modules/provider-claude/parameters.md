# Параметры Claude в диалоге (M25)

`Provider.readParameters(project, localId)` находит сессию проекта штатным findSession,
берёт локальный session_id и путь транскрипта из журнала хука, затем читает снимок строки
состояния, транскрипт через общий jsonl-tail и общий файл лимитов провайдера. Программ
не запускает. Публичные createClaudeParameterReader и claudeModelLabel доступны для тестов.
Capability sessionParameters явная; updateParameters недоступна, editable всегда false.

Из снимка — display_name/id модели, effort.level, used_percentage, context_window_size,
total_input_tokens. Без снимка — message.model и effort последнего assistant;
claude-opus-5-5 отображается как Opus 5.5; неизвестное имя остаётся идентификатором.
Режим — permission-mode.permissionMode, включая редкую запись глубже мегабайта.
Порядок: модель, усилие, режим; подписи усилий Low/Medium/High/Extra/Max/Ultracode,
режимов Auto/Plan/Accept edits/Ask/Bypass/Don't ask/Manual. Неизвестные значения не теряются.
Шрифт — стек Anthropic Sans с системным fallback, кольцо справа с синей дугой.
Общие окна five_hour/seven_day с прошедшим resets_at скрываются; данные не выдумываются.

## Запуск и возобновление

Каждый startSessionProcess создаёт свой `<logs>/claude/session-<ref>.settings.json`
с флагом wx до запуска; файл не переписывается. Передаёт путь через
WFK_STATUSLINE_SETTINGS в session.exp / ConPTY host, которые добавляют --settings
к запуску Claude. Окружение папки remote-control --spawn=same-dir этого флага не получает.

statusLine содержит команду стабильного запускателя Kit и padding/refreshInterval первой
пользовательской настройки local → project → user. Сама обёртка пропускается. Полный
пользовательский command остаётся в её файле и исполняется командой `wfk statusline`.
Параллельные проекты получают разные файлы и свои значения отступа/частоты.

На Windows используется `node "<LOCALAPPDATA>/Workflow Kit/wfk.mjs" statusline --client claude`
с forward-slash путём стабильного запускателя; bare node из PATH службы работает и в Git
Bash, и в PowerShell. Настроенный CLAUDE_CODE_GIT_BASH_PATH переносится через отдельную
WFK_STATUSLINE_BASH и восстанавливается ConPTY host после очистки родительских CLAUDE*;
прочие переменные родительской Claude-сессии по-прежнему не возвращаются.

## Поведение на ОС

| macOS | Linux | Windows x64/ARM64 |
| --- | --- | --- |
| expect session.exp добавляет --settings, стабильный ~/.local/bin/wfk | то же | parseHostArgs/host.ts добавляют --settings, стабильный wfk.mjs через node |
| снимки и транскрипт без программ | то же | то же, путь снимка по injected win32 |

Автоматически проверены: две параллельные сессии, отдельные файлы и свойства, цепочка
снимок/пользовательская строка/чтение, read-only параметры и редкий режим, ConPTY argv,
сохранение переменной Git Bash; старые сценарии диалогов и Stop сохраняются.
Живая проверка установленной строки и снимка после установки — T008; пользователь
проверяет macOS, проверяющий — Windows, Linux — CI.
