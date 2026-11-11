# Диалоги Claude до ссылки Remote Control

Дополнение к [module.md](module.md) провайдера `provider-claude`: что Kit делает, когда
Claude в скрытом терминале сессии или окружения показывает вопрос (спецификации M5, раздел 4,
и [M15](../../../../../../docs/planning/M15-claude-promo-dialogs.md)).

## Распознавание

Диалог узнаётся по устойчивым фразам с допуском до 16 любых символов между словами:
интерфейс Claude печатает вместо пробелов сдвиги курсора (`ESC[nC`), а ConPTY на Windows
пробелы иногда вовсе теряет. Шаблоны одинаковы в `src/pty/dialogs.tcl` (macOS и Linux,
`session.exp` и `environment.exp`) и `src/pty/screen.ts` (хост Windows, `pty/host.ts`).

| Вид | Фразы | Что делает Kit |
| --- | --- | --- |
| `imports` | `CLAUDE.md file imports`, `allow external imports` | останавливает claude, `DIALOG imports` |
| `trust` | `trust this folder`, `trust the files in`, `Quick safety check` | останавливает claude, `DIALOG trust` |
| `onboarding` (M15) | `Syntax theme`, `Choose the text style`, `Select login method` | останавливает claude, `DIALOG onboarding` |
| `promo` (M15) | `Try the new …` или `Would you like to try …` и вариант `N. Not now` | выбирает «Not now», ждёт ссылку дальше |
| `unknown` | другой текст с подвалом `Enter to confirm` / `Esc to cancel` | останавливает claude, `DIALOG unknown` |

Экран выбора темы подвала не печатает, поэтому фразы `onboarding` входят в общий шаблон
диалога — иначе Kit ждал бы ссылку до тайм-аута.

## Остановка

Скрипт даёт диалогу дорисоваться (1 с тишины, не дольше 5 с), останавливает `claude` без
нажатий (TERM и закрытие pty), печатает `DIALOG <вид>` и выходит с кодом 6. Операция
завершается ошибкой `trust-dialog`, `imports-dialog`, `onboarding-dialog` или
`unknown-dialog` (`dialogError` в `src/pty.ts`): в сообщении — текст диалога с экрана, в
подсказке (`DIALOG_HINTS`) — что сделать и путь журнала; `details: { log, dialog }`.

| Вид | Сообщение | Подсказка |
| --- | --- | --- |
| `trust`, `imports` | «Claude показал …» и текст диалога | предпросмотр доверия → «Доверять», затем повторить |
| `onboarding` | «Claude не завершил первый запуск (выбор темы или вход).» | запустить `claude` в терминале, выбрать тему и войти, затем «Повторить»; путь к программе — в «Системе» |
| `unknown` | «Claude показал неизвестный диалог…» и текст | запустить `claude` в папке проекта в терминале и ответить самому |

## Ответ «Not now» (M15)

Единственное исключение из правила «Kit не нажимает клавиш»: предложение новой функции.

- Номер варианта «Not now» — цифра прямо перед текстом (`2. Not now`); вариант под курсором —
  `❯`, `›` или `>` перед `N.`, без курсора — 1 (`notNowKeys`).
- Kit нажимает стрелки (`ESC [ B` вниз, `ESC [ A` вверх) по одной с паузой 100 мс, затем
  Enter, печатает `PROMO_DECLINED <номер>`, очищает накопленный экран и заново начинает ждать
  ссылку (тайм-аут ожидания — с начала).
- За один запуск — не больше `MAX_OFFERS_DECLINED` (3) ответов; то же предложение после
  ответа (`offerQuestion`) и предложение без варианта «Not now» — диалог `unknown`.
- `parseMarkers` считает ответы (`offersDeclined`); строки остаются в журнале сессии.
- macOS и Linux: процедура `handle_dialog` в `dialogs.tcl` (вместо прежней `stop_on_dialog`)
  возвращает `declined`, и ветка диалога в `session.exp` и `environment.exp` делает
  `exp_continue`; сравнение идёт по тексту без escape-последовательностей (`plain_text`).

## Тесты

- `test/trust.test.ts` под `expect` с поддельным claude (`test/fixtures/fake-claude.mjs`,
  режимы `offer` и `theme`): «Not now» — стрелка вниз и Enter (`<лог>.offer`), сессия
  создаётся; выбор темы сразу даёт `onboarding-dialog` без нажатий.
- `test/windows.test.ts` — хост Windows с подставным терминалом: предложение из живой проверки
  0.8.1 (без пробелов), курсор ниже «Not now», повтор, четвёртое предложение, выбор темы.
