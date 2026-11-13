# M27: нативный визуальный эталон Claude

## Визуальный контракт (заполняет T001)

Эталон зафиксирован 13.11.2026: Claude Desktop 5.11492.2 → Code → Remote Control
собственных пробных бесед, CLI 2.1.323, тёмная тема. После выдачи пользователем
разрешения codex системный AX_TRUSTED=true; меню открыты средствами Accessibility
и CGEvent. Первоначальный блокер доступа устранён. Светлого native PNG нет: светлая
тема Kit проверяется по токенам/контрасту/раскладке, pixel match для неё не заявляется.
Терминальный TUI служит семантическим proof, не визуальной заменой Desktop.

| Состояние | Исходный PNG и смысл | Версия / плотность | Контракт интерфейса |
| --- | --- | --- | --- |
| composer | [native-composer-dark.png](native-composer-dark.png) | Desktop 5.11492.2, CLI 2.1.323; 3084×2098 px, окно 1542×1049 logical, DPR=2 | Модель/effort/Ultracode и отдельный mode справа под полем ввода; контекст/лимиты отдельные |
| model | [native-model-dark.png](native-model-dark.png) | те же версия/плотность | Компактное меню: Opus 5.5, Fable 5.2, Sonnet 5.5, Haiku 5.5; текущая галочка, горячие клавиши 1–4; ниже Effort и More models |
| effort/ultra | [native-effort-dark.png](native-effort-dark.png) | те же | Вложенное меню Effort: пояснение, Low/Medium/High/Extra/Max, Recommended у medium этой модели; после разделителя отдельный Ultracode toggle |
| more models | [native-more-models-dark.png](native-more-models-dark.png) | те же | Вложенное More models: Fable 5.1, Haiku 4.5, Sonnet 5, Opus 5, Fable 5, Opus 4.8/4.7/4.6, Sonnet 4.6 |
| fast | [native-fast-dark.png](native-fast-dark.png) | те же, выбрана Opus 5.5, без генерации | В аккаунте пробы native GUI не предлагает fast даже на Opus; CLI /fast явно требует usage credits. Это PNG отсутствия опции, не выдуманное меню скорости |
| mode | [native-mode-dark.png](native-mode-dark.png) | те же | Отдельный popover Mode: Auto / Manual / Accept edits / Plan с описаниями и галочкой; bypass отсутствует |
| disabled | [native-disabled-dark.png](native-disabled-dark.png) | те же | После остановки native беседа архивирована: composer заменён причиной This session is archived и кнопкой Unarchive; меню управления отсутствуют |

PNG сохранены без редактирования через capture_window(max_dimension=0).
DPR=2 — отношение исходного PNG к rect окна CoreGraphics. Пробные беседы — только
собственные; боковая панель рабочих проектов/ревьюера не использовалась для управления.
Подробные native/read-back/очистка — [доказательства](../../evidence/M27-claude-native-controls.md).

### Геометрия и поведение

- Постоянный footer — текстовые кнопки модели и effort (Ultracode дописывается
  отдельно при включении), затем mode, затем индикатор лимитов. Без гигантского
  списка всех настроек, reset, Подробнее и зелёного технического success-текста.
- Model popover около 160 CSS px шириной, строки около 28 CSS px. Effort и Mode
  около 320 CSS px, радиус около 12 CSS px, шрифт около 14 CSS px; эти величины
  измерены по PNG и уточняются попиксельным сравнением T006, не являются CSS native.
- В тёмной теме панель меню около #303030, hover около #454545, основной текст
  светлый, пояснения приглушённые, галочка синяя; Anthropic Sans с системным fallback.
- Effort здесь **список, не slider**. Нельзя переносить range/шесть точек из ChatGPT.
  Внутренние low/medium/high/xhigh/max подписываются Low/Medium/High/Extra/Max.
  Рекомендованный уровень зависит от модели; Medium на текущих 5.5 подтверждён PNG.
- Ultracode — отдельный switch в том же submenu. Native ответ on/off сохраняет
  base effort high. Raw ultra старого M25 не становится шестым пунктом.
- Вложенные меню открываются по hover (CGEvent mouseMoved; AXPress одного не хватило)
  и доступны кликом/клавиатурой/touch. При нехватке места submenu раскрывается с другой
  стороны; на узком экране допустима вложенная карточка в одном popover с возвратом.
- Один корневой popover, Esc закрывает вложенный уровень/меню и возвращает фокус,
  outside закрывает. Режим — отдельное меню, Plan не самостоятельный переключатель.
- В Kit touch-цели увеличиваются до 44 CSS px без изменения структуры: это
  требование доступности, а не заявление пиксельного совпадения desktop на iPad.
- Fast в проверенном аккаунте не рисуется активным/доступным. Причина при необходимости
  читаема: native требует usage credits. Не включать кредиты, не предлагать обход.
- Состав моделей берётся из подтверждённого native каталога; приведённые имена
  фиксируют снимок аккаунта, не служат постоянным allowlist для других пользователей.

### Проверка T005/T006

T005 повторяет модель → Effort / More models и отдельный Mode, а не терминальный
slider. Текущие отметки, disabled/reason и описания приходят от Claude adapter.
Polling сохраняет DOM, ввод и фокус. Успешный POST тихий; ошибка читается у composer.
Пять размеров Kit: 1920×1080, 1280×800, 1024×768, 768×400, 375×667; отдельно 200% CSS.
Это responsive QA, не растяжение native PNG. Pixel QA — только тёмная тема того же
компонента/состояния и DPR; светлая — только token QA. Эмуляция не считается живой
проверкой iPad/Windows. Перед delivery P0/P1/P2 исправлены, design-qa.md: passed.
