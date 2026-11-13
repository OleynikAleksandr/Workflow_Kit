// @ts-check
/** Native access presets remain opaque: the provider owns semantics and restrictions.
 * @param {{h: any, data: () => import('#provider-registry').SessionParameters | null,
 * busy: () => boolean, change: (id: string, option: import('#provider-registry').ParameterOption, confirmed: boolean) => Promise<void>}} args */
export function createAccessMenu({ h, data, busy, change }) {
  const icon = (/** @type {string} */ name) => h('span', { class: `sc-icon sc-icon-${name}`, 'aria-hidden': 'true' });
  const title = h('div', { class: 'sc-access-title' }, ['Как подтверждать действия ChatGPT?']);
  const rows = h('div', { class: 'sc-access-rows' });
  const prompt = h('p');
  const proceed = /** @type {HTMLButtonElement} */ (h('button', { type: 'button' }, ['Продолжить']));
  const cancel = /** @type {HTMLButtonElement} */ (h('button', { type: 'button' }, ['Отмена']));
  const confirmation = h('div', { class: 'sc-access-confirm', role: 'dialog', 'aria-label': 'Подтверждение полного доступа' }, [prompt, h('div', {}, [proceed, cancel])]);
  const reason = h('p', { class: 'sc-access-reason' });
  const node = h('div', { class: 'sc-access-menu' }, [title, rows, reason, confirmation]);
  /** @type {Map<string, {button: HTMLButtonElement, text: HTMLElement, description: HTMLElement, reason: HTMLElement, mark: HTMLElement, image: HTMLElement}>} */ const controls = new Map();
  /** @type {import('#provider-registry').ParameterOption | null} */ let pending = null;
  let destroyed = false;
  function update() {
    const access = data()?.presentation?.access;
    const options = access?.options ?? [];
    const keys = new Set(options.map(o => o.value));
    for (const [key, control] of controls) if (!keys.has(key)) { control.button.remove(); controls.delete(key); }
    for (const [index, option] of options.entries()) {
      let control = controls.get(option.value);
      if (!control) {
        const text = h('span'), description = h('small'), detail = h('small', { class: 'sc-access-reason' });
        const mark = icon('check'), image = icon(option.icon);
        const button = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'sc-access-option', role: 'menuitemradio', 'data-access': option.value }, [image, h('span', { class: 'sc-access-copy' }, [text, description, detail]), mark]));
        button.addEventListener('click', () => {
          const current = data()?.presentation?.access.options?.find(o => o.value === option.value);
          if (destroyed || busy() || !current || current.disabled) return;
          if (current.confirm) { pending = current; update(); cancel.focus(); }
          else void change('access', current, false);
        });
        control = { button, text, description, reason: detail, mark, image }; controls.set(option.value, control);
      }
      if (rows.children[index] !== control.button) rows.insertBefore(control.button, rows.children[index] ?? null);
      control.text.textContent = option.label; control.description.textContent = option.description ?? '';
      control.reason.textContent = option.disabled ? option.reason ?? '' : '';
      control.reason.hidden = !control.reason.textContent;
      control.button.disabled = busy() || option.disabled === true;
      control.button.setAttribute('aria-checked', String(option.value === access?.value));
      control.button.classList.toggle('sc-access-warning', option.icon === 'shield-alert');
      control.mark.hidden = option.value !== access?.value;
    }
    if (pending && !options.some(o => o.value === pending?.value && !o.disabled)) pending = null;
    node.setAttribute('aria-busy', String(busy()));
    reason.textContent = access?.reason ?? (!options.length ? 'Пресеты доступа недоступны' : ''); reason.hidden = !reason.textContent;
    confirmation.hidden = !pending; rows.hidden = !!pending; title.hidden = !!pending;
    prompt.textContent = pending?.confirm ?? '';
    proceed.disabled = cancel.disabled = busy();
  }
  cancel.addEventListener('click', () => { const key = pending?.value; pending = null; update(); if (key) controls.get(key)?.button.focus(); });
  proceed.addEventListener('click', () => {
    const option = data()?.presentation?.access.options?.find(o => o.value === pending?.value);
    if (option && !option.disabled && !busy() && !destroyed) void change('access', option, true);
  });
  update(); return { node, update, destroy() { destroyed = true; pending = null; } };
}
