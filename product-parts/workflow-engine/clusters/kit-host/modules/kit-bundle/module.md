# Модуль: kit-bundle

Часть `workflow-engine`, кластер `kit-host`. Алиас импорта: `#kit-bundle`.

## Назначение

Бандл Harness Workflow Kit, с которым служба ставит и проверяет процесс Kit
в проектах (спецификация, раздел 8.1). С Kit 2.2.4 бандл собирается в этом
репозитории из исходников `product-parts/kit-core` командой
`npm run build:kit` ([tools/kit-build](../../../../../../tools/kit-build/README.md),
M22 2.5). В модуле лежат gzip (`vendor/workflow-kit-<версия>.mjs.gz`: двоичный
файл, проверка длины файлов его пропускает), `vendor/PROVENANCE` (кем и из чего
собран, дайджест исходников, число строк, SHA-256 распакованного файла) и
`src/bundle-meta.ts` — константы, которые пишет сборка; руками их не правят.

## Публичный интерфейс (`src/index.ts`)

- `KIT_VERSION` (`2.3.3`, M39 T004: правила агента с границей автопилота и единым правилом публикации, тексты `next` при живом запуске, решатель ядра с разрешением, полный `capability`; 2.3.2, M39 T003: `task:defer-delivery` — начатая поставка возвращается в TODO для раунда исправлений; 2.3.1, M39 T002: разрешение автопилота, host-only команды через IPC-тикет родителя, `task:start --autopilot-run`; 2.3.0, M39 T001: блок `automation` scope, `scope:proposal --digest` и `scope:choose --expected-digest`; 2.2.7, M38: `install --update --with` для файлов структуры приложения; 2.2.6, M37: папка входных файлов `.harness/inputs/`, подсказка `next` и отказ `close` с путями; 2.2.5, M31: `scope:owner`), `KIT_SHA256`, `KIT_SOURCE_DIGEST` — из
  `src/bundle-meta.ts`; `KIT_SOURCE_DIGEST` — дайджест исходников Kit
  (`kitSourceDigest` сборки).
- `vendorBundleFile()` — путь gzip в модуле; `unpackedBundleFile(appDir)` —
  `<appDir>/kit/workflow-kit-<KIT_VERSION>.mjs`.
- `ensureKitBundle({ appDir, vendorFile?, sha256? }) → KitBundle`
  (`file`, `version`, `sha256`): распакованный файл с верным хешем
  используется как есть; иначе gzip распаковывается, хеш проверяется,
  файл пишется атомарно (0644, каталоги 0700).
- `kitBundleProvider(options) → () => Promise<KitBundle>` — ленивый вызов
  `ensureKitBundle` с запоминанием успеха; ошибка не запоминается.
- `KitBundleError` (`code: 'KIT_NO_BUNDLE'`): нет gzip, он не
  распаковывается или хеш не совпадает. Сообщение — по-русски, для панели.

## Инварианты

- Исполняется только файл, чей SHA-256 совпал с `KIT_SHA256`.
- Обновление Kit — правка исходников `kit-core` и `npm run build:kit`: сборка
  заменяет gzip, `PROVENANCE` и `bundle-meta.ts` вместе. Тест
  `tools/kit-build` не пропускает исходники без пересборки.

## Зависимости

`#data-store` (`writeFileAtomic`).

## Тесты

- `test/bundle.test.ts` — распаковка vendor-бандла и его хеш.
- `test/delivery-defer.test.ts` (M39 T003) — настоящий бандл на временном git-проекте: красный CI
  начатой поставки T012 → `task:defer-delivery` (до него безопасные отказы для DONE-задачи,
  устаревшей ревизии и грязного дерева) → `plan:extend` с `round: "new"`, fixes и новой поставкой
  D002 → `task:update` делает T012 зависимой от D002; порядок `fixes → DOCS-R2 → D002 → T012`, без
  `TASK_ORDER`/`ROUND_OPEN`, T012 не стартует до D002, коммиты DONE-задач неизменны. Второй сценарий:
  установка с активным scope, помеченная в манифесте как Kit 2.3.1 (`KIT_OUTDATED`), штатно
  обновляется `install --update`: задачи, владелец и история сохраняются, новая команда работает.
  Прежний бандл в CI недоступен (клон глубины 1), поэтому старая версия задаётся манифестом.
