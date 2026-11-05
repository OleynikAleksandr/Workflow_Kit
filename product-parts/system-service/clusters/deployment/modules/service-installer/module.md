# Модуль: service-installer

Часть `system-service`, кластер `deployment`. Алиас импорта:
`#service-installer`.

## Назначение

Развёртывание и управление службой Workflow Kit (спецификация, раздел 9).
В T001 — заглушка: даёт статус службы для карточки «Система» и принимает
команды `install`, `uninstall`, `service …` от модуля `cli`, ничего не
меняя в системе.

## Публичный интерфейс (`src/index.ts`)

- `getServiceStatus(platform?) → ServiceStatus` — `implemented: false`,
  `installed: false`, `running: false`, `autostart: false`, `mechanism`
  (`launchagent` / `systemd-user` / `hkcu-run`), `note` (текст для панели).
- `runServiceCommand(command) → Promise<ServiceCommandResult>` —
  `{ ok, exitCode, message }`; `status` — статус заглушки (код 0),
  `install`, `uninstall`, `start`, `stop` — «не реализовано (задача T008)»,
  код 2.
- `autostartMechanism(platform)`, `NOT_IMPLEMENTED` («не реализовано»).
- Типы `ServiceStatus`, `ServiceCommand`, `ServiceCommandResult`,
  `AutostartMechanism`.

## Инварианты

- Заглушка не обращается к системе: ни файлов, ни внешних программ.
- Форма `ServiceStatus` и `ServiceCommandResult` сохраняется в T008;
  `implemented` станет `true`.

## Дальше

T008: копия приложения в `app/<версия>/`, автозапуск по ОС, запускатель
`wfk` и значок, настоящий статус службы и автозапуска, тесты на подставных
программах.
