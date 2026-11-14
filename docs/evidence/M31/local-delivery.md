# M31: локальная поставка 0.13.5

14.11.2026, T006. Подтверждение пользователя «Подтверждаю выпуск.» записано в
`task:start --confirmed`. Приёмка, закрытие и push в этой задаче не выполнялись.

## Сборка и установка

```sh
npm test                      # 1022 + 58 тестов (1 пропущен), 0 ошибок
node tools/kit-build/build.ts --check   # Kit 2.2.5 is up to date (6f4fab8d98dd)
node bin/wfk.mjs install      # app/0.13.5 вместо 0.13.4, удалена старая 0.13.3
~/.local/bin/wfk doctor --installed
```

Doctor: все строки `ok`, «всё в порядке», служба 0.13.5 (`/api/health`, pid 1508).

## Проверка установленной копии

- В `app/0.13.5`: `session-view/src/plan-cards.js`, `foreign-card.js`,
  `autopilot/src/owner.ts`, бандл `kit-bundle/vendor/workflow-kit-2.2.5.mjs.gz`.
- Служба видит Kit проектов: зарегистрированный проект с Kit 2.2.4 получил предложение
  «Обновить Kit» до 2.2.5 (`kitUpdate.action = update`). Перенос владельца из чужой сессии
  заработает в проекте после этого обновления; до него такой старт даёт `kit-outdated`.

## Поведение на ОС

| macOS | Linux | Windows x64/ARM64 |
| --- | --- | --- |
| Установлено и проверено | CI | CI; живая установка — проверяющий на Windows |
