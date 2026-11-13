# M27: локальная поставка 0.13.0

13.11.2026. T007, прямое согласие пользователя на самостоятельное выполнение всего
плана до нового релиза записано в task:start --confirmed. Приёмка/закрытие/main push
не выполнялись. README полностью перечитан DOCS; setup/usage/installation сверены,
в T007 обновлены на 0.13.0 без удаления истории.

## Сборка и установка

Команды из репозитория:

```sh
npm run build:kit
node bin/wfk.mjs install
/Users/oleksandroliinyk/.local/bin/wfk doctor --installed
```

Kit 2.2.4, 13242 lines, sha256
56aeed885eca6277e095acf5c0004d723c817b0372cc3876b4171ccf627b3479.
Установлено app/0.13.0 вместо 0.12.1, удалена старая 0.12.0; запускатель/значок/LaunchAgent
созданы штатным установщиком. /api/health и /api/state: version 0.13.0, service pid 94479.
Doctor: все строки ok, итог «всё в порядке», общий доступ ChatGPT «Работает».
Native runtime Node24.21.0; Claude2.1.323; зависимости не менялись.

## Установленный код и совместимость

- installed-browser.json: настоящий ES/CSS с :4747, I/O-only fixture, desktop
  1542×1049/DPR2 и touch 375×667. Модель/Effort/More/Mode/Ultracode, error/quiet success,
  focus/draft/keyboard/bounds, touch 44, browser/CSP 0. Screenshots claude-*-installed*.png.
- installed-legacy-hosts.json: два работающих host текущего проекта возвращают
  editable false с причиной отсутствия нового host; они не перезапускались.
- installed-health.json и installed-cleanup.json: четыре прежних Claude PID и времена
  старта совпали до/после установки и smoke. Нативные рабочие/ревьюер процессы сохранены.

## Native smoke установленной 0.13.0

createApp/createClaudeProvider и все host scripts импортированы из установленной
копии в `Library/Application Support/Workflow Kit/app/0.13.0`, без observer override.
Отдельная временная папка/служба, штатные hooks/trust/settings, никакого SDK-клона.

installed-native-roundtrip.json: новый host, 11 операций с последующим resume,
13 моделей после каждого, defaults прежние. Effort Medium/High, Ultracode on/off,
Plan/Auto, More models Sonnet5 и возврат Sonnet5.5/high. Один Sonnet5.5/fast=false
ход ответил OK; очередь получила sentinel ровно 1 раз в prompt-hook, Stop 0.
После stop/resume тот же local c99c88b2-782a-40ed-8d99-e95979480420 и remote
session_01EyVab65eQu3GLTfeQ26vAB, прежние 2 сообщения истории; новый host PID 97511,
Claude 97514 и новый каталог. Повторные Medium/High прошли без генерации.

Суммарный бюджет M27: T001 2 + T006 1 + T007 1 = 4/4, все Sonnet, fastfalse;
другие диагностические host не имели firstMessage и не генерировали. Кредиты не включались.

Cleanup: собственные процессы 0, trust false, defaults прежние; native Unarchive
подтверждён, удаления серверной карточки не заявляем. Временные папки/службы source
и installed smoke остановлены/удалены; основная служба 0.13.0 продолжает работать.

## Границы

Visual QA прошла в T006; live пользовательских macOS/iPad и Windows отдельно.
Linux — CI. Windows пока имеет статус реализации/injected tests, а не live approval.
Коммит T007 — SHA поставки. CI этого точного SHA записывает следующая T008;
локальный doctor не заменяет CI, приёмку, закрытие или публикацию main.
