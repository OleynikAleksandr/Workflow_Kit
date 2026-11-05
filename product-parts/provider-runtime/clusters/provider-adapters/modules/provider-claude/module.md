# Модуль: provider-claude

Часть `provider-runtime`, кластер `provider-adapters`. Алиас импорта:
`#provider-claude`.

## Назначение

Провайдер Claude по контракту `provider-registry`
(`docs/planning/M1-providers.md`, раздел 2): доверие к папке, сессии Remote
Control, окружение папки.

Сейчас (T004) — заглушка: статус «не реализовано», все возможности
недоступны с причиной, действий нет; сессии — только из журнала хука
(`readHookSessions(project, 'claude')`, без ссылок), поэтому сессии,
начатые в Claude Desktop в папке проекта, уже видны в `/api/state`.

## Публичный интерфейс (`src/index.ts`)

- `createProvider: ProviderFactory` — фабрика провайдера; бэкенд (`cli`,
  `DEFAULT_PROVIDERS`) регистрирует её результат в реестре.
- `PROVIDER_ID` — `claude` (ключ реестра и клиент журнала хука).

## Инварианты

- Модуль подключается к бэкенду только через `createProvider`; замена
  заглушки на реализацию не требует правок вне каталога модуля.
- Зависит от `#provider-registry` (контракт, журнал хука, токены) и
  получает всё машинное через `ProviderContext` (`runCommand`,
  `supervisor`, `dirs`, `config`, `env`).

## Дальше

T006 — реализация: `previewTrust`/`grantTrust` (pty, `expect`,
`WFK_SERVICE_SESSION=trust`, копия `~/.claude.json`), сессии
(`session.exp`, записи `providerSessionsFile`, `remoteId` по
`bridge-session`), окружение папки как особое действие проекта.
