# Кластер: provider-runtime / provider-adapters

## Назначение

Реализации контракта провайдера для Claude, Codex и Kimi Code: доверие к
папке, сессии, окружение, демон или сервер и хуки
(`docs/planning/M1-providers.md`, разделы 2–3;
`docs/planning/M8-kimi-provider.md`).

## Модули

| Модуль | Обязанность |
| --- | --- |
| [provider-claude](modules/provider-claude/module.md) | доверие, сессии Remote Control, окружение папки (pty через `expect`) |
| [provider-codex](modules/provider-codex/module.md) | демон app-server, доверие, одобрение хука Kit, сессии |
| [provider-kimi](modules/provider-kimi/module.md) | сервер `kimi web` службы, статус, рабочая область и доверие папке |

## Границы

- Каждый провайдер — свой каталог; провайдеры не импортируют друг друга.
- Внешние программы вызываются через внедряемый исполнитель; тесты не
  трогают настоящие `~/.claude.json`, `~/.codex` и `~/.kimi-code`.
- Записи в чужие конфиги — только после предпросмотра с токеном (D7).
