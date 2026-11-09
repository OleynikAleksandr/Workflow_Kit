// @ts-check
// Popup menus («⋯» of projects and sessions): one menu at a time, closed by an outside click,
// Escape or a choice. Position is set through the CSSOM (CSP allows no inline style attributes).
import { h } from './dom.js';

/**
 * @typedef {object} MenuItem
 * @property {string} label
 * @property {string} [hint] Second line under the label.
 * @property {boolean} [disabled]
 * @property {() => void} onSelect
 */

/** @type {HTMLElement | null} */
let current = null;
/** @type {(() => void) | null} */
let detach = null;

/** Closes the open popup menu, if any. */
export function closeMenu() {
  current?.remove();
  current = null;
  detach?.();
  detach = null;
}

/**
 * Opens a popup menu under an anchor; "-" items are separators.
 * @param {HTMLElement} anchor
 * @param {Array<MenuItem | '-'>} items
 */
export function openMenu(anchor, items) {
  const again = current?.dataset['anchor'] === anchor.dataset['menuId'];
  closeMenu();
  if (again && anchor.dataset['menuId']) return;
  const id = anchor.dataset['menuId'] ?? `m${Math.random().toString(36).slice(2)}`;
  anchor.dataset['menuId'] = id;
  const menu = h('div', { class: 'popup', role: 'menu', 'data-anchor': id });
  for (const item of items) {
    if (item === '-') {
      menu.append(h('hr'));
      continue;
    }
    const button = /** @type {HTMLButtonElement} */ (
      h('button', { type: 'button', class: 'menu-item', role: 'menuitem' }, [
        h('span', {}, [item.label, item.hint ? h('small', {}, [item.hint]) : null]),
      ])
    );
    button.disabled = Boolean(item.disabled);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      closeMenu();
      item.onSelect();
    });
    menu.append(button);
  }
  document.body.append(menu);
  const box = anchor.getBoundingClientRect();
  const width = menu.offsetWidth;
  const left = Math.max(8, Math.min(box.right - width, window.innerWidth - width - 8));
  menu.style.left = `${left + window.scrollX}px`;
  menu.style.top = `${box.bottom + 4 + window.scrollY}px`;
  current = menu;
  const outside = (/** @type {Event} */ event) => {
    if (event.target instanceof Node && (menu.contains(event.target) || anchor.contains(event.target))) return;
    closeMenu();
  };
  const escape = (/** @type {KeyboardEvent} */ event) => {
    if (event.key === 'Escape') closeMenu();
  };
  setTimeout(() => document.addEventListener('click', outside), 0);
  document.addEventListener('keydown', escape);
  detach = () => {
    document.removeEventListener('click', outside);
    document.removeEventListener('keydown', escape);
  };
  /** @type {HTMLElement | null} */ (menu.querySelector('button:not(:disabled)'))?.focus();
}
