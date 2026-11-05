# Модуль: provider-codex

Часть `provider-runtime`, кластер `provider-adapters`. Алиас импорта:
`#provider-codex`.

## Назначение

Провайдер Codex по контракту `provider-registry`
(`docs/planning/M1-providers.md`, раздел 3): демон app-server, доверие к
папке, одобрение хука, сессии.

Сейчас (T004) — заглушка: статус «не реализовано», все возможности
недоступны с причиной, действий нет; сессии — только из журнала хука
(`readHookSessions(project, 'codex')`, без ссылок).

## Публичный интерфейс (`src/index.ts`)

- `createProvider: ProviderFactory` — фабрика провайдера; бэкенд (`cli`,
  `DEFAULT_PROVIDERS`) регистрирует её результат в реестре.
- `PROVIDER_ID` — `codex` (ключ реестра и клиент журнала хука).

## Инварианты

- Модуль подключается к бэкенду только через `createProvider`; замена
  заглушки на реализацию не требует правок вне каталога модуля.
- Зависит от `#provider-registry` (контракт, журнал хука, токены) и
  получает всё машинное через `ProviderContext` (`runCommand`,
  `supervisor`, `dirs`, `config`, `env`).

## Дальше

T007 — реализация: статус демона (pid-файл и `initialize` по сокету, с
кэшем), запуск демона — особое действие провайдера, доверие с копией
`~/.codex/config.toml`, `approveHooks` только для хука Kit
(`hookCommand('codex')` из `kit-structure`), сессии (`thread/start`,
записи `providerSessionsFile`, названия из `session_index.jsonl`).
