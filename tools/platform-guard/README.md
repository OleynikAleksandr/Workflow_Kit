# platform-guard

Проверка, что код и спецификации Workflow Kit рассчитаны на macOS, Linux и Windows 11
(спецификация — [M6-cross-platform.md](../../docs/planning/M6-cross-platform.md), раздел 3).

```sh
npm run check:platforms
```

Запускается при каждом коммите (проверка `platform-guard` профиля Kit) и в CI на всех ОС.
Проверяется всё дерево: `product-parts/**/src/**` (кроме `vendor/**` и кода браузера
`product-parts/control-panel/**`), `bin/**/*.mjs` и `docs/planning/*.md`. Каждая ошибка —
строка `<файл>:<строка> <правило> <что исправить>`; код выхода 1.

## Правила

| Правило | Что требует | Как исправить |
| --- | --- | --- |
| `platform-injected` | `process.platform` — только значение по умолчанию: `?? process.platform`, `= process.platform`, `platform: process.platform` | получить платформу параметром и проверить ветки тестом с `platform: 'win32'` и `'linux'`; редкое исключение — запись в `directPlatform` с причиной |
| `os-program` | у литерала с программой одной ОС из `programNames` (первое слово или конец пути, `.exe` отбрасывается) есть запись в `programs` для этого файла | добавить запись `{file, program, darwin, linux, win32}`: что делается на каждой ОС или `не нужно: <причина>` / `не поддерживается: <причина>` |
| `spec-os-section` | у спецификации `docs/planning/*.md` вне `legacySpecs` есть раздел `## … Поведение на ОС`, где названы macOS, Linux и Windows | добавить раздел по шаблону `docs/planning/TEMPLATE.md` |
| `allowlist` | в `allowlist.json` нет устаревших записей, у записей заполнены причина и все три ОС | удалить устаревшую запись или заполнить поля |

Комментарии не проверяются. Пути в выводе и в `allowlist.json` — относительно корня и с `/`
на всех ОС. Новую программу ОС добавляют в `programNames` вместе с записями для её вызовов.

## Файлы

- `check.ts` — правила и запуск (`node tools/platform-guard/check.ts [корень]`).
- `allowlist.json` — `programNames`, `directPlatform`, `programs`, `legacySpecs`.
- `test/check.test.ts` — тесты правил на временных деревьях и проверка самого репозитория.
