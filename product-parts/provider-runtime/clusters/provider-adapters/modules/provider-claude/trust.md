# Claude: доверие к папке (D7)

Раздел вынесен из [module.md](module.md) дословно (перед M47), чтобы контракт модуля
оставался в пределах размера документа.

### Доверие (D7)

- `trust(project)` — `~/.claude.json` → `projects["<путь>"].
  hasTrustDialogAccepted`: для Remote Control считается только точный ключ
  папки. Если доверена родительская папка (например, `~`), а сама папка —
  нет: `{ trusted: false, inherited: { from: <родитель>, note:
  'интерактивный Claude не спросит, Remote Control требует доверия папки' } }`
  (`INHERITED_NOTE`; ближайший доверенный родитель вверх до `/`). Нет файла
  — `false` с пометкой, битый JSON — `null`; после `grantTrust` — путь
  копии (`backup`) до перезапуска службы.
- `previewTrust(project)` — записываемые ключи, `inherited`, точки
  автозапуска папки (хуки `.claude/settings.json` и
  `.claude/settings.local.json` — хук Kit помечен, разрешения
  `permissions.allow` и `bypassPermissions`, MCP
  `enableAllProjectMcpServers`, `enabledMcpjsonServers`, серверы
  `.mcp.json`, команды `statusLine`, `apiKeyHelper`, …, чужие хуки
  `.codex/hooks.json`; нечитаемый JSON — точка `invalid`) и внешние импорты
  CLAUDE.md (`imports.ts`; `\ ` в `@путь` — пробел, иной `\` — часть пути Windows). Если внешние импорты есть, а в записи папки нет
  `hasClaudeMdExternalIncludesWarningShown: true`, — в `writes` ключи
  `hasClaudeMdExternalIncludesApproved: true` и
  `hasClaudeMdExternalIncludesWarningShown: true`: импорты разрешаются по
  умолчанию, вопроса нет (`choices: []`; решение пользователя 2026-11-06 —
  настройка принадлежит приложению Claude). Явный ответ
  `{ 'external-imports': 'deny' }` в `grantTrust` по-прежнему запрещает их;
  другой ответ — `invalid-choice`. Решённый раньше выбор — заметка
  «решение уже записано».
  Токен (`claude:<id проекта>`) привязан к отпечатку: содержимое файлов
  автозапуска, тексты файлов памяти и импортов, список импортов, доверие и
  решение об импортах.
- Внешние импорты (`scanExternalImports(папка, home)`): файлы памяти
  проекта — `CLAUDE.md`, `CLAUDE.local.md`, `.claude/CLAUDE.md`,
  `.claude/rules/**/*.md` самой папки и всех родительских папок до `/`
  (пользовательские `~/.claude/CLAUDE.md` и `~/.claude/rules` пропускаются);
  ссылки `@путь` вне блоков и строк кода (`@~/…` — от дома, остальные — от
  файла со ссылкой, `\ ` — пробел, `#…` отбрасывается), рекурсивно до
  глубины 5; внешний импорт — существующий файл вне папки проекта
  (например, `~/CLAUDE.md` → `~/AGENTS.md`).
- `grantTrust(project, token, choices)` диалогов не проходит и `claude` не
  запускает. Токен одноразовый (`invalid-token`); изменение папки,
  импортов, доверия или решения после показа — `preview-changed`; битый
  файл — `config-broken`; нет ответа на обязательный выбор —
  `choice-required` (400), неизвестный выбор или ответ — `invalid-choice`
  (400); записывать нечего — `{ trusted: true, note }`. Иначе: копия
  `~/.claude.json` (`backupFile`, `<backups>/.claude.json-<hash>/`), затем
  `patchProjectEntry` (`config-writer.ts`) сливает в
  `projects["<папка>"]` ключи `hasTrustDialogAccepted: true` и (если
  импорты ждали решения) `hasClaudeMdExternalIncludesApproved: <не deny>`,
  `hasClaudeMdExternalIncludesWarningShown: true`; остальное содержимое
  файла не меняется. Запись атомарна: временный файл рядом с теми же
  правами (новый файл — 0600), JSON с отступом 2, перед `rename` файл
  сверяется с прочитанным (если Claude успел записать — начать заново с
  его версии), после — читается и проверяется. Потеря записи из-за
  параллельной записи Claude — повтор, всего до 3 попыток
  (`CONFIG_WRITE_ATTEMPTS`), затем `trust-lost` (`details: { backup }`,
  подсказка с путём копии). Символическая ссылка `~/.claude.json`
  сохраняется (пишется её цель). Итог — `{ trusted: true, backup, note? }`
  (`note` — «внешние импорты CLAUDE.md разрешены/запрещены»).
