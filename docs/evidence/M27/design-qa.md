# M27 — Claude Desktop Remote Control: Design QA

Раздел перенесён дословно из [design-qa.md](../../../design-qa.md#m27--claude-desktop-remote-control) 16.11.2026 (подготовка места перед M37).

final result: passed

Эталон: docs/design/M27/native-{composer,model,effort,more-models,mode}-dark.png,
Claude Desktop 5.11492.2 / CLI 2.1.323, 3084×2098 physical = 1542×1049 CSS, DPR2.
Реализация: настоящий composer/ES/CSS Kit на изолированном source server :48762,
подменён только provider I/O. Тот же viewport/DPR2 и соответствующие состояния:
Sonnet 5.5/Medium/Ultracode off для Effort, Auto для Mode, High для More models.
Сравниваются контролы, а не навигация и история другого приложения. Исходные PNG
не редактировались; comparison boards — отдельные кропы без растяжения.

### Совместные сравнения и исправления

В каждом board слева native, справа Kit. Открыты оба источника и совместный board:

- docs/evidence/M27/effort-comparison-initial.png: до правок отсутствовал info у Max,
  сглаживание делало текст тяжелее. [P2, исправлено] Добавлен Lucide info из той же
  ISC-библиотеки, grayscale antialiasing; скорректированы отступы описания/нижнего края.
  Повторное сравнение effort-comparison-final.png: одинаковый frame 642×466 physical,
  список/Recommended/отдельный switch совпадают по структуре, строкам и плотности.
- docs/evidence/M27/mode-comparison-initial.png: [P2, исправлено] Mode был на 22 physical
  px выше эталона. Уменьшены title margin и вертикальные padding строк. Переснято:
  mode-comparison-final.png, высота обоих frame 446 physical, четыре режима и native
  описания, галочка/shortcuts на прежних местах.
- docs/evidence/M27/more-comparison-final.png: [P2, исправлено] More models использовал
  широкую effort-панель. Теперь native узкая панель около 142 CSS, root адаптируется
  к подписи effort; порядок девяти дополнительных моделей соответствует эталону.
  Видимые frame 287×532 native и 286×534 Kit physical; это округление/граница кропа.
- [P1, исправлено] Узкая вложенная карточка расширялась после position и обрезалась.
  Теперь смена уровня/resize пересчитывает четыре границы visualViewport. На touch
  используется Back в том же popup; Home/End пропускают заголовок Back и выбирают
  первый/последний контроль текущего уровня.

### Обязательные поверхности fidelity

Типографика: 14/18px, Anthropic Sans с согласованным системным fallback, weight 400,
сглаживание как у Electron. Сохраняется небольшое отличие метрик fallback шрифта
и платформенного rasterizer — P3, не повод копировать закрытый шрифт приложения.
Раскладка: model+effort, независимый Mode и синий context ring; submenu и геометрия
проверены focused boards. Нет Claude slider, reset, Подробнее или success-подстрочника.
Цвета: dark #303030/#454545, светлый текст, приглушённые пояснения и синий tick;
light — белая поверхность и контрастные токены, без заявления native light pixel match.
Качество assets: исходные raster PNG сохранены, новые изображения продукта не нужны;
значки — существующий Lucide/ISC, info взят из официального Lucide 0.468.0.
Copy: native модели/Low/Medium/High/Extra/Max, Recommended, Ultracode и четыре
native Mode descriptions. Причины провайдера читаемы; fast account restriction не обойдён.

### Интеракции и responsive

browser-responsive.json: dark/light на 1920×1080,1280×800,1024×768,768×400,375×667;
дополнительно 640×400 CSS/DPR2 — эквивалент CSS-площади 1280×800 при 200%.
Это не проверка системного zoom Safari. Screenshots claude-{effort,mode,more}-
{dark,light}-<width>x<height>.png; все popup внутри четырёх границ, touch 44 проверен.
Browser/CSP errors: 0. Проверены nested menus, один popup, hover/click/touch, Esc,
ArrowLeft/Right, Home/End, возврат focus, ошибки и quiet success, draft, Ultracode
без замены High. Polling >5с сохранил DOM/focus строки High; тест не пересоздаёт меню.

M26/R2 native-controls.browser.js повторно прошёл обе темы: thumb drag из центра
в обе стороны/за трек, preview до release и один POST после, polling во время
захвата, Home/End, отмены, ошибка, тихий success и сохранение draft. Kimi fallback
и общие composer/channel сценарии проверяет обязательный профиль. Никакая эмуляция
не называется живым iPad/Windows тестом.

### Границы и checklist

P0/P1/P2 закрыты, финальные совместные сравнения повторно открыты. Остались P3:
платформенные метрики fallback font и субпиксельное округление borders. Нативная
macOS проба backend выполнена агентом отдельно (native-production-final.json),
пользовательская приёмка macOS/iPad — после релиза; Windows — проверяющий, Linux — CI.
Светлого native source нет: он не заменён выдуманным изображением.

- [x] Native source и Kit capture при одинаковом viewport/состоянии/DPR.
- [x] Совместные focused comparisons после правок, все пять fidelity поверхностей.
- [x] Обе темы/пять размеров/200%-эквивалент, keyboard/touch/ошибки и M26 regression.
- [ ] Отдельная пользовательская приёмка и live Windows tester после установки.

M27 final result: passed
