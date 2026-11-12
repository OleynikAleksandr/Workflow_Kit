# Workflow Kit — миграция плана Harness (`migrate:harness-plan`)

Раздел 3 документа [WorkflowKitInstallation.md](WorkflowKitInstallation.md),
вынесенный в отдельный файл, чтобы тот оставался в пределе размера документа
(28 000 байт). Владелец — модуль `workflow-installer`.

Для репозиториев с планом `harness-ai-plan-v1` (сам Harness AI):

1. Читает строки задач старого плана. Задачи `[DONE]` становятся сводкой
   закрытого раунда `R0-legacy`:
   - в `result` — список ID и названий задач;
   - в `references` — ссылка на коммит миграции.

   Сам прежний текст плана остаётся в родительском коммите.
2. Задачи `[TODO]` и `[IN_PROGRESS]` становятся задачами нового раунда:
   - `expected commit` переходит в `commitMessage`;
   - `completion: user-acceptance` превращается в обычный финал: приёмку
     через `accept`;
   - задача `package` получает вид `delivery`.
3. Новый план получает `baselineCommit` = HEAD до миграции. Коммит
   выполняется с ролью `kit-update`.
4. После миграции старые `scripts/plan.mjs` и `check-docs-sync` больше не
   используются. Их удаление — отдельная задача плана.
