# Модуль: kit-bundle

Часть `workflow-engine`, кластер `kit-host`. Алиас импорта: `#kit-bundle`.

## Назначение

Бандл Harness Workflow Kit 2.2.3, с которым служба ставит и проверяет
процесс Kit в проектах (спецификация, раздел 8.1). В репозитории лежит
gzip (`vendor/workflow-kit-2.2.3.mjs.gz`: двоичный файл, проверка длины
файлов его пропускает) и `vendor/PROVENANCE` — откуда он взят: harness-ai
`7afe27ad`, `dist/workflow-kit/workflow.mjs`, 10801 строка, SHA-256
распакованного файла
`8891de2ff127deae1819f132123ca12cbd98af77dec666c44209366ea925497e`.

## Публичный интерфейс (`src/index.ts`)

- `KIT_VERSION` (`2.2.3`), `KIT_SHA256`, `KIT_SOURCE_COMMIT`.
- `vendorBundleFile()` — путь gzip в модуле; `unpackedBundleFile(appDir)` —
  `<appDir>/kit/workflow-kit-2.2.3.mjs`.
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
- Обновление Kit — замена gzip и `PROVENANCE` вместе с константами модуля.

## Зависимости

`#data-store` (`writeFileAtomic`).
