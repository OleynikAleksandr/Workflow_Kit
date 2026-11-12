# Кластер: workflow-engine / kit-host

## Назначение

Kit как внешний процесс: бандл приложения (Kit 2.2.4, собирается в этом репозитории из
`product-parts/kit-core`, M22), запуск команд Kit в проекте, кэш их результатов, модели
карточек для панели (спецификация, раздел 8) и обновление Kit проекта с его экрана.

## Модули

| Модуль | Обязанность |
| --- | --- |
| [kit-bundle](modules/kit-bundle/module.md) | сжатый бандл Kit 2.2.4 и его происхождение, распаковка в каталог данных с проверкой SHA-256 |
| [kit-runner](modules/kit-runner/module.md) | команды Kit (`inspect`/`install` бандлом приложения, остальные — бандлом проекта), слежение за файлами плана, раздел `workflow` |
| [plan-view](modules/plan-view/module.md) | модель карточки плана из `status` и карточки выбора из `scope:proposal` |
| [kit-update](modules/kit-update/module.md) | версия Kit проекта (раздел `kitUpdate`), `POST /api/projects/:id/kit/update` и одобрение хуков Kit Codex после обновления (M22) |

Зависимости внутри кластера: `kit-runner` → `plan-view` (модели и типы
результатов Kit); `kit-update` → `kit-runner` (типы) и `kit-bundle`
(`KIT_VERSION`); `kit-bundle` подключается в `cli`, бандл передаётся в
`kit-runner` функцией `appBundle`.

## Границы

- Команды Kit выполняются через `runCommand` из `process-supervisor`
  (без оболочки, с тайм-аутом); ошибки возвращаются значением, не
  исключением.
- Опрос панели (`GET /api/state`) команд Kit не запускает.
