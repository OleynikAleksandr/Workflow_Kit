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
