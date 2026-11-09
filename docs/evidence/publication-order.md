# Публикация после закрытия scope — релиз 0.4.8 (2026-11-09)

- Спецификация: [publication-order.md](../planning/publication-order.md); scope `publication-order`.
- Модульные тесты: `git-publish` (временные репозитории с локальным bare upstream: состояния
  `none`, `up-to-date`, `ready`, `blocked`; отказ при открытом scope и при удалённой ветке впереди,
  удалённая ветка не перезаписывается; маршрут 409 и успешная публикация), `panel-shell`
  (`publicationView`, `commitsLabel`), `cli` (`wfk project publish`, `projectOfFolder`); полный
  прогон проверок Kit при каждом коммите.
- `node bin/wfk.mjs install`, `wfk doctor --installed` — итог: всё в порядке, служба 0.4.8.
- Раздел `publication` в `/api/state` установленной службы отвечает (`{ projects: {} }`: у
  зарегистрированных проектов нет upstream, поэтому строки «GitHub» у них нет — так задумано).
- Push в этом релизе не выполнялся. Живую проверку кнопки на проекте с upstream выполняет
  пользователь (решение 09.11).
