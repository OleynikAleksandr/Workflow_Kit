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
| [provider-kimi](modules/provider-kimi/module.md) | сервер `kimi web` службы, статус, рабочая область и доверие папке, хук Kit в `config.toml`, сессии и доставка сообщений после конца хода, ссылка в приложение Kimi Code, Remote Control |

## Границы

- Каждый провайдер — свой каталог; провайдеры не импортируют друг друга.
- Внешние программы вызываются через внедряемый исполнитель; тесты не
  трогают настоящие `~/.claude.json`, `~/.codex` и `~/.kimi-code`.
- Записи в чужие конфиги — только после предпросмотра: доверие — с токеном
  (D7), хук Kit в `config.toml` Kimi — с показанными текстом и хешем.
- Различия провайдеров служба узнаёт из контракта (`hookDialect`, наличие
  `sendMessage`, `sessionIdle`, `resumeSession`, возможности `orchestration`
  и `reviewer`), а не по id. Claude и ChatGPT получают следующее сообщение
  ответом на удерживаемый `Stop`; Kimi — промптом, когда сессия свободна.
- Сквозные сценарии Kimi (автопилот, ревью Kimi → ChatGPT → Kimi) —
  `provider-kimi/test/scenarios.test.ts`.
