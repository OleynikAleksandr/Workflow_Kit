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

- `KIT_VERSION` (`2.2.4`), `KIT_SHA256`, `KIT_SOURCE_DIGEST` — из
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
