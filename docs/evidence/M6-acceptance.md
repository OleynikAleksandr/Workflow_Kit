# Приёмка M6 — три ОС, релиз 0.5.1 (2026-11-09)

- Спецификация: [M6-cross-platform.md](../planning/M6-cross-platform.md); scope `m6-cross-platform`.
- Что сделано: проверка `platform-guard` при каждом коммите, CI на четырёх платформах,
  переводы строк LF, правила «Три ОС» в `AGENTS.md`, шаблон спецификации.
- Локально (macOS): `npm test` — 400 из 400, `npm run check:platforms` — ok,
  `node bin/wfk.mjs install` и `wfk doctor --installed` — «всё в порядке», служба 0.5.1.

## CI, раунд R1

Коммит `ec10f16` в ветке `ci/m6-cross-platform`,
[запуск 42641314052](https://github.com/OleynikAleksandr/Workflow_Kit/actions/runs/42641314052).
Задания Windows остановлены вручную: шаг `npm test` завис.

| Задание | Итог | Подробности |
| --- | --- | --- |
| Linux x64 | успех | typecheck, 400 тестов, `check:platforms` |
| macOS ARM64 | ошибка | 399 из 400: `kit-runner/test/kit-project.test.ts:158` — коммит в оркестрованном режиме получил `COMMIT_FAILED` (нестабильный тест) |
| Windows x64 | ошибка, зависание | 30 падений, `provider-codex/test/provider.test.ts` висит ~13 минут |
| Windows ARM64 | ошибка, зависание | 32 падения: те же и `provider-claude/test/windows.test.ts` |

Падения на Windows по модулям:

- `provider-codex` (`release`, `provider`, `ws-rpc`): поддельный демон на Unix-сокете
  во временной папке — `listen EACCES`; отсюда и зависание. `files-hooks`: ключи
  `config.toml` и хуки с путями Windows.
- `data-store`: `writeFileAtomic` при одновременной записи — `EPERM` на `rename`;
  `events.jsonl` — путь каталога состояния.
- `cli/open-link`: каталог данных теста собирается как `D:\…\C:\Users\…` — путь склеивается
  неверно; затем `Cannot read properties of undefined (reading 'stop')`.
- `kit-structure/structure`: ожидается POSIX-хук, а на Windows пишется хук Windows.
- `provider-claude` (`config`, `parts`, `windows`): импорт памяти, ключ проекта в
  `.claude.json`, доверие к родительской папке, возможности ОС.
- `project-registry`: ошибка доступа (TCC macOS) на Windows выглядит иначе.
- `project-setup`: `EBUSY` при удалении временной папки с кириллицей.

Исправления идут раундом R2 этого scope; после них — повторный запуск CI.
