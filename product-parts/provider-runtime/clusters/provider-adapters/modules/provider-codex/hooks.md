# provider-codex: доверие и хуки

Часть контракта модуля [provider-codex](module.md): доверие папке Codex, хуки проекта и их
одобрение Kit. Поведение одинаковое на macOS, Linux и Windows; на Windows ключи одобрения
сравниваются без учёта регистра и вида слэшей (`sameHookKey`), у хука Kit сравнивается его
`commandWindows`, у хука Harness — `command` (другой команды для Windows у него нет).

- **Доверие** (D7): `trust(project)` читает `trust_level` из `config.toml`
  (доверие к `/` или к домашней папке не считается). `previewTrust`
  показывает ключ `projects."<путь>".trust_level = "trusted"`, точки
  автозапуска (`.codex/hooks.json`: чужие хуки `hook`, хуки Kit и хук Harness `kit-hook`
  с событием и командой; `.codex/config.toml` проекта) и выдаёт токен,
  связанный с отпечатком (путь, текущий `trust_level`, текст `hooks.json`,
  наличие конфига проекта). `grantTrust` принимает только этот токен
  (`invalid-token`, `preview-stale`), делает копию `config.toml`
  (`backupFile`, каталог `backups`), пишет ключ через `codex app-server`
  `config/value/write { keyPath, value: "trusted", mergeStrategy: "upsert" }`
  и перечитывает файл (`not-recorded` с `details.backup`, если ключа нет).
  Путь с `"`, `\` или управляющими символами — `unsupported-path`.
- **Хуки**: `hooks(project)` — свой разбор `.codex/hooks.json`
  (позиционные ключи `<abs>/.codex/hooks.json:<event_snake>:<группа>:<i>`)
  плюс `hooks/list { cwds: [путь] }` (только хуки с `sourcePath` этого
  проекта: `currentHash`, `trustStatus` → `approved` (`trusted`,
  `managed`) | `pending` (`untrusted`) | `modified` | `unknown`).
  `hooks/list` вызывается, только если папка доверена и `hooks.json` есть,
  и только при изменении mtime `hooks.json` или `config.toml` (одно чтение
  на проект одновременно; первое ждётся до 2 с, дальше «проверяется…»).
  Хуки Kit — записи с командой, точно равной одной из `KIT_HOOK_COMMANDS`,
  и хук Harness с командой, точно равной `HARNESS_CODEX_HOOK_COMMAND` (он
  доставляет пакет восстановления, M21); изменённая вручную команда хуком Kit
  не считается. В контракте они
  показываются одним `kitHook` (запись SessionStart) с общим статусом:
  `approved` — только когда одобрены все хуки Kit, иначе статус первого
  неодобренного; в списке `hooks` — только чужие. `complete: true`
  только при доверенной папке и одобренном хуке Kit; иначе `false` и
  заметка с причиной и словами «список сессий неполон».
- **approveHooks** одобряет только хук Kit: `command` должна совпасть с
  `KIT_HOOK_COMMAND` (`not-kit-hook`), папка доверена (`not-trusted`), хеш
  — с текущим `currentHash` свежего `hooks/list` (`hash-changed`, в
  `details.current` — текущие хеши). Запись — копия `config.toml`, затем
  `config/value/write { keyPath: hooks.state."<key>".trusted_hash, value:
  <hash>, mergeStrategy: "upsert" }` и проверка новым `hooks/list`.
  Вместе с подтверждённым хуком SessionStart одобряются хуки Stop и
  UserPromptSubmit той же структуры и хук Harness (команды точно по шаблону
  Kit или `HARNESS_CODEX_HOOK_COMMAND`, хеш — текущий из `hooks/list`; любые
  поля записи, например `additionalContextLimit`, входят в хеш). Без этого
  Codex не запускает хук Harness у пользователя без приложения Harness AI. Чужие
  хуки показываются с командой и хешем, но не одобряются; уже одобренный
  хук повторно не пишется.
