# Часть продукта: system-service

## Назначение

Развёртывание Workflow Kit как службы пользователя: копия приложения в
каталог данных, автозапуск (macOS LaunchAgent, Linux systemd user или XDG
autostart, Windows ключ `HKCU\…\Run`), запускатель `wfk`, значок
«Workflow Kit» и статус службы для панели (спецификация, раздел 9).

## Кластеры

| Кластер | Назначение |
| --- | --- |
| [deployment](clusters/deployment/cluster.md) | установщик, автозапуск, запускатель и значок, статус службы |

## Границы

- Не реализует HTTP и панель: только развёртывание и управление процессом
  службы.
- Тесты никогда не трогают настоящие `~/Library/LaunchAgents`, реестр Windows
  и systemd: внешние программы вызываются через внедряемый исполнитель.
- Модуль `service-installer` реализован (T008) и подключён к `cli` и
  карточке «Система» (T010): `wfk install`, `uninstall`,
  `service start|stop|status`, `open`, `doctor [--installed]`.
