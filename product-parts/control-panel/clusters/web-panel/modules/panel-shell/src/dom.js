// @ts-check
// Small DOM helpers shared by the panel cards. Text is always set via textContent (no innerHTML).

/**
 * Creates an element with attributes and children.
 * @param {string} tag
 * @param {Record<string, string | undefined>} [attrs]
 * @param {Array<Node | string | null | undefined>} [children]
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    if (name === 'class') node.className = value;
    else node.setAttribute(name, value);
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/**
 * A definition list row set: label/value pairs; values may be nodes.
 * @param {Array<[string, Node | string]>} rows
 * @returns {HTMLElement}
 */
export function facts(rows) {
  const list = h('dl', { class: 'facts' });
  for (const [label, value] of rows) {
    list.append(h('dt', {}, [label]), h('dd', {}, [value]));
  }
  return list;
}

/**
 * A status pill: tone is ok, warn, error or muted.
 * @param {string} text
 * @param {'ok' | 'warn' | 'error' | 'muted'} tone
 * @returns {HTMLElement}
 */
export function pill(text, tone) {
  return h('span', { class: `pill pill-${tone}` }, [text]);
}

/**
 * Monospace text that wraps long paths.
 * @param {string} text
 * @returns {HTMLElement}
 */
export function code(text) {
  return h('code', { class: 'path' }, [text]);
}

/**
 * Fills a message area: an error or note with an optional hint and list; empty text clears it.
 * @param {HTMLElement} area
 * @param {'ok' | 'error' | 'muted'} tone
 * @param {string} text
 * @param {{ hint?: string, items?: string[] }} [extra]
 */
export function notice(area, tone, text, extra = {}) {
  if (!text) {
    area.replaceChildren();
    area.hidden = true;
    return;
  }
  area.hidden = false;
  area.className = `notice notice-${tone}`;
  area.replaceChildren(h('p', {}, [text]));
  if (extra.items && extra.items.length > 0) area.append(h('ul', {}, extra.items.map((item) => h('li', {}, [item]))));
  if (extra.hint) area.append(h('p', { class: 'notice-hint' }, [extra.hint]));
}

/**
 * A text input that the iPad keyboard leaves alone (no capitalization, autocorrection or spellcheck).
 * @param {Record<string, string | undefined>} attrs
 * @returns {HTMLInputElement}
 */
export function plainInput(attrs) {
  return /** @type {HTMLInputElement} */ (
    h('input', {
      type: 'text',
      autocapitalize: 'off',
      autocorrect: 'off',
      autocomplete: 'off',
      spellcheck: 'false',
      enterkeyhint: 'go',
      ...attrs,
    })
  );
}
