// @ts-check
import { h } from './dom.js';
import { DEFAULT_WIDTH, NARROW_WIDTH, WIDTH_KEY, keyboardWidth, sidebarWidth, widthRange } from './layout-model.js';

/** A resizable desktop sidebar and the same DOM in a keyboard-accessible narrow drawer.
 * @param {HTMLElement} side @param {HTMLElement} main
 */
export function createPanelLayout(side, main) {
  const open = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'sidebar-open', 'aria-expanded': 'false', 'aria-controls': 'project-sidebar' }, ['☰  Проекты и план']));
  const close = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'icon sidebar-close', 'aria-label': 'Закрыть проекты и план' }, ['✕']));
  const backdrop = h('div', { class: 'sidebar-backdrop', 'aria-hidden': 'true' });
  const separator = h('div', { class: 'sidebar-separator', role: 'separator', tabindex: '0', 'aria-label': 'Ширина боковой панели', 'aria-orientation': 'vertical', 'aria-controls': 'project-sidebar' });
  side.id = 'project-sidebar';
  side.querySelector('.brand')?.append(close);
  main.prepend(open);
  const element = h('div', { class: 'app' }, [side, separator, main, backdrop]);
  let stored = '';
  try { stored = localStorage.getItem(WIDTH_KEY) ?? ''; } catch { /* Session-only size. */ }
  let preferred = sidebarWidth(stored, Math.max(window.innerWidth, 928));
  let width = preferred;
  let narrow = window.innerWidth <= NARROW_WIDTH;
  let opened = false;
  let routeKey = '';
  /** @type {HTMLElement | null} */
  let returnFocus = null;
  /** @type {{ id: number, x: number, width: number } | null} */
  let drag = null;

  function save() {
    preferred = width;
    try { localStorage.setItem(WIDTH_KEY, String(width)); } catch { /* Private mode. */ }
  }

  function applyWidth() {
    width = sidebarWidth(preferred, window.innerWidth);
    element.style.setProperty('--sidebar-width', `${width}px`);
    const range = widthRange(window.innerWidth);
    separator.setAttribute('aria-valuemin', String(range.min));
    separator.setAttribute('aria-valuemax', String(range.max));
    separator.setAttribute('aria-valuenow', String(width));
  }

  /** @param {boolean} value @param {boolean} [restore] */
  function setOpen(value, restore = true) {
    opened = value && narrow;
    element.classList.toggle('sidebar-visible', opened);
    open.setAttribute('aria-expanded', String(opened));
    main.inert = opened;
    side.inert = narrow && !opened;
    if (opened) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : open;
      side.setAttribute('role', 'dialog');
      side.setAttribute('aria-modal', 'true');
      side.setAttribute('aria-label', 'Проекты и план');
      close.focus({ preventScroll: true });
    } else {
      side.removeAttribute('role');
      side.removeAttribute('aria-modal');
      side.removeAttribute('aria-label');
      if (restore && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      returnFocus = null;
    }
  }

  function finishDrag() {
    if (!drag) return;
    if (separator.hasPointerCapture(drag.id)) separator.releasePointerCapture(drag.id);
    drag = null;
    element.classList.remove('sidebar-dragging');
    save();
  }

  function resize() {
    const wasNarrow = narrow;
    narrow = window.innerWidth <= NARROW_WIDTH;
    if (narrow !== wasNarrow) {
      finishDrag();
      const focusWasHidden = narrow && side.contains(document.activeElement);
      setOpen(false, false);
      if (focusWasHidden) open.focus({ preventScroll: true });
    }
    side.inert = narrow && !opened;
    applyWidth();
    const viewport = window.visualViewport;
    element.style.setProperty('--viewport-height', `${viewport?.height ?? window.innerHeight}px`);
    element.style.setProperty('--viewport-top', `${viewport?.offsetTop ?? 0}px`);
  }

  separator.addEventListener('pointerdown', (event) => {
    if (narrow || event.button !== 0) return;
    event.preventDefault();
    separator.focus();
    drag = { id: event.pointerId, x: event.clientX, width };
    separator.setPointerCapture(event.pointerId);
    element.classList.add('sidebar-dragging');
  });
  separator.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    preferred = drag.width + event.clientX - drag.x;
    applyWidth();
  });
  separator.addEventListener('pointerup', finishDrag);
  separator.addEventListener('pointercancel', finishDrag);
  separator.addEventListener('lostpointercapture', finishDrag);
  separator.addEventListener('keydown', (event) => {
    const next = keyboardWidth(width, event.key, window.innerWidth);
    if (next === null || narrow) return;
    event.preventDefault();
    preferred = next;
    applyWidth();
    save();
  });
  separator.addEventListener('dblclick', () => {
    preferred = DEFAULT_WIDTH;
    applyWidth();
    save();
  });
  open.addEventListener('click', () => setOpen(true));
  close.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  element.addEventListener('keydown', (event) => {
    if (!opened) return;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
    if (event.key !== 'Tab') return;
    const items = Array.from(side.querySelectorAll('button, input, textarea, select, a[href], summary, [tabindex="0"]'))
      .filter((n) => n instanceof HTMLElement && !n.closest('[hidden]') && n.getClientRects().length && !n.matches(':disabled'));
    const first = /** @type {HTMLElement} */ (items[0] ?? close);
    const last = /** @type {HTMLElement} */ (items.at(-1) ?? close);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('scroll', resize);
  resize();

  return {
    element,
    /** @param {string} key @param {boolean} session */
    setRoute(key, session) {
      main.classList.toggle('is-session', session);
      if (key !== routeKey) { routeKey = key; main.scrollTop = 0; setOpen(false); }
    },
    /** @param {boolean} attention */
    setAttention(attention) {
      open.classList.toggle('needs-attention', attention);
      open.setAttribute('aria-label', attention ? 'Проекты и план — требуется внимание' : 'Проекты и план');
    },
  };
}
