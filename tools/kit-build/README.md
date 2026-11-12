# kit-build

Сборка бандла Kit из исходников этого репозитория (спецификация
[M22](../../docs/planning/M22-kit-source.md), раздел 2.5).

```sh
npm run build:kit            # собрать, проверить и записать бандл в kit-bundle
node tools/kit-build/build.ts --check   # только сравнить с записанным бандлом
```

## Что делает `npm run build:kit`

1. Читает `KIT_VERSION` из
   `product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts`.
2. esbuild (`devDependencies`, точная версия) собирает `workflow-kit/src/workflow-kit-cli.ts`
   в один ESM-файл для Node (`--bundle --platform=node --format=esm --target=node22`), из
   корня репозитория: пути в комментариях бандла относительные.
3. Отказ, если сборка взяла файл вне `product-parts/kit-core/.../modules/` или в бандле есть
   импорт не `node:*`.
4. Проба (`smokeBundle`): `help`, `status` и `validate` пустой папки (`NOT_INSTALLED`),
   `install` во временный git-проект (временный `GIT_CONFIG_GLOBAL`), затем `validate` и
   `doctor` установленного проекта. На Windows установленный Kit запускается `node
   .harness/workflow/runtime/workflow.mjs` (запускатель там — `workflow.cmd`), на macOS и
   Linux — `scripts/workflow`.
5. Пишет в `product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle`:
   `vendor/workflow-kit-<версия>.mjs.gz` (gzip прежних версий удаляется), `vendor/PROVENANCE`
   и `src/bundle-meta.ts` (`KIT_VERSION`, `KIT_SHA256`, `KIT_SOURCE_DIGEST`).

`--check` собирает в память и завершается с кодом 1, если версия, дайджест исходников или
SHA-256 бандла не совпадают с записанными.

## Дайджест исходников

`kitSourceDigest(root)` — SHA-256 по всем `modules/*/src/*.ts` Kit в порядке POSIX-путей:
путь, `\0`, текст (CRLF читается как LF), `\0`. Он одинаков на macOS, Linux и Windows.

## Тест

`test/kit-build.test.ts` идёт в группе `npm run test:kit` вместе с тестами Kit; `npm test`
запускает сначала `test:app` (тесты приложения, они чувствительны к нагрузке), потом
`test:kit` — так тяжёлые тесты Kit не мешают тестам приложения. Проверяется: версия, дайджест и SHA-256 пересборки
совпадают с `bundle-meta.ts`, `PROVENANCE` совпадает с текстом сборки, список исходников,
отказ для импорта не `node:*`, проба с `win32` (установленный Kit через node) и с платформой
процесса. Правка исходников Kit без `npm run build:kit` не проходит проверки коммита.

## Поведение на ОС

Сборка одинакова на всех ОС (esbuild для darwin, linux и win32, x64 и arm64; файлы с LF по
`.gitattributes`). Различие одно — как проба запускает установленный Kit (пункт 4).
