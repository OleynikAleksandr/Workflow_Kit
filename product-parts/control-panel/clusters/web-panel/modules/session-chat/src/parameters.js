// @ts-check
import { createEffortCard } from './effort-card.js';
import { errorText } from './chat-model.js';
import { contextText, createParameterPoll, limitTone, menuSections, parametersUrl, percent, safeAccent, safeFont } from './parameters-model.js';
/** @typedef {import('#provider-registry').SessionParameters} Parameters */
/** @typedef {import('#provider-registry').ParameterOption} Option */
/** @param {{ shell: import('./session-chat.js').Shell, projectId: string, key: string, provider: string,
 * fallback: HTMLElement, report: (text: string, tone: 'muted' | 'ok' | 'error') => void }} options */
export function createParameters({ shell, projectId, key, provider, fallback, report }) {
  const { h } = shell.dom;
  const icon = (/** @type {string} */ name) => h('span', { class: `sc-icon sc-icon-${name}`, 'aria-hidden': 'true' });
  const host = h('div', { class: 'sc-parameter-host' });
  const row = h('div', { class: 'sc-parameter-row' });
  const trigger = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'sc-parameter-trigger', 'aria-label': 'Параметры сессии' }));
  const meter = h('span', { class: 'sc-meter', 'aria-hidden': 'true' });
  const ring = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'sc-context-button' }, [meter]));
  const limits = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'sc-parameter-limits', 'aria-label': 'Лимиты подписки' }));
  host.append(fallback);
  /** @type {Parameters | null} */ let data = null;
  /** @type {HTMLElement | null} */ let popup = null;
  /** @type {HTMLElement | null} */ let anchor = null;
  /** @type {{update: () => void, destroy: () => void} | null} */ let nativeView = null;
  let popupKind = '';
  let busy = false, showing = false, menu = false, readError = false;
  /** @type {{ id: string, option: Option } | null} */ let confirmation = null;
  const url = parametersUrl(projectId, provider, key);
  const poll = createParameterPoll(() => shell.api('GET', url), apply, error => { readError = true; report(errorText(error), 'error'); });
  /** @param {HTMLElement} container @param {HTMLElement[]} nodes */
  function reconcile(container, nodes) {
    nodes.forEach((node, index) => { if (container.childNodes[index] !== node) container.insertBefore(node, container.childNodes[index] ?? null); });
    while (container.childNodes.length > nodes.length) container.lastChild?.remove();
  }
  function close(focus = true) {
    nativeView?.destroy(); nativeView = null; popupKind = '';
    popup?.remove(); popup = null; menu = false; confirmation = null;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard);
    window.removeEventListener('resize', position); window.visualViewport?.removeEventListener('resize', position); window.visualViewport?.removeEventListener('scroll', position);
    if (focus && anchor?.isConnected) anchor.focus();
    anchor = null;
  }
  function outside(/** @type {PointerEvent} */ event) { if (popup && event.target instanceof Node && !popup.contains(event.target) && !anchor?.contains(event.target)) close(false); }
  function position() {
    if (!popup || !anchor) return;
    const a = anchor.getBoundingClientRect();
    const editor = host.closest('.sc-compose')?.querySelector('.sc-editor')?.getBoundingClientRect();
    const viewport = window.visualViewport;
    const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    popup.style.maxWidth = `${Math.max(0, width - 16)}px`;
    popup.style.maxHeight = `${Math.max(44, height - 16)}px`;
    const box = popup.getBoundingClientRect();
    const popupLeft = Math.max(left + 8, Math.min(a.right - box.width, left + width - box.width - 8));
    popup.style.left = `${popupLeft}px`; popup.style.setProperty('--sc-popup-left', `${popupLeft}px`);
    const below = popupKind === 'models' && editor ? editor.bottom + 6 : a.bottom + 6;
    const above = (popupKind === 'models' && editor ? editor.top : a.top) - box.height - 8;
    const desired = popupKind === 'models' ? (below + box.height <= top + height - 8 ? below : above) : (above >= top + 8 ? above : below);
    popup.style.top = `${Math.max(top + 8, Math.min(desired, top + height - box.height - 8))}px`;
  }
  function keyboard(/** @type {KeyboardEvent} */ event) {
    if (!popup) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.target instanceof HTMLInputElement && event.target.type === 'range') return;
    if (event.key === 'Tab') { close(false); return; }
    const buttons = Array.from(popup.querySelectorAll('button')).filter(b => !b.disabled);
    if (!buttons.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const current = buttons.findIndex(b => b === document.activeElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index]?.focus();
  }
  function openPopup(/** @type {HTMLElement} */ button, /** @type {boolean} */ isMenu) {
    close(false); anchor = button; menu = isMenu;
    popup = h('div', { class: 'sc-parameter-popup', role: isMenu ? 'menu' : 'dialog', 'aria-label': isMenu ? 'Изменить параметры' : button.getAttribute('aria-label') || 'Состояние сессии' });
    document.body.append(popup); trigger.setAttribute('aria-expanded', String(isMenu));
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', keyboard); window.addEventListener('resize', position); window.visualViewport?.addEventListener('resize', position); window.visualViewport?.addEventListener('scroll', position);
    return popup;
  }
  function renderMenu(focus = true) {
    if (!popup || !data) return;
    const previous = /** @type {HTMLElement | null} */ (document.activeElement);
    const previousKey = previous?.dataset['option'];
    if (nativeView) { nativeView.update(); return; }
    popup.replaceChildren(); popup.setAttribute('aria-busy', String(busy));
    if (confirmation) {
      popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', 'Подтверждение разрешений');
      popup.append(h('p', {}, [confirmation.option.confirm || 'Продолжить?']));
      for (const label of ['Продолжить', 'Отмена']) {
        const button = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'sc-parameter-choice' }, [label])); button.disabled = busy;
        button.addEventListener('click', () => { if (label === 'Отмена') { confirmation = null; renderMenu(); } else if (confirmation) void change(confirmation.id, confirmation.option, true); }); popup.append(button);
      }
    } else {
      popup.setAttribute('role', 'menu'); popup.setAttribute('aria-label', 'Изменить параметры');
      for (const section of menuSections(data).filter(s => popupKind !== 'models' || ['model', 'mode'].includes(s.id))) {
        if (popupKind !== 'models' || section.id === 'mode') popup.append(h('div', { class: 'sc-parameter-heading', role: 'presentation' }, [section.title]));
        if (!section.options.length) popup.append(h('p', { class: 'sc-parameter-unavailable' }, [`${section.label}${section.reason ? ` — ${section.reason}` : ''}`]));
        for (const option of section.options) {
          const button = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'sc-parameter-choice', role: 'menuitemradio', 'aria-checked': String(option.selected), 'data-option': `${section.id}:${option.value}` }, [
            h('span', {}, [option.label, option.description ? h('small', {}, [option.description]) : null, option.disabled && option.reason ? h('small', {}, [option.reason]) : null]),
            option.selected ? icon('check') : null,
          ]));
          button.disabled = busy || option.disabled === true; button.setAttribute('aria-disabled', String(button.disabled));
          button.addEventListener('click', () => { if (option.confirm) { confirmation = { id: section.id, option }; renderMenu(); } else void change(section.id, option); }); popup.append(button);
        }
      }
    }
    position();
    if (focus) {
      const buttons = Array.from(popup.querySelectorAll('button')).filter(b => !b.disabled);
      const selected = buttons.find(b => b.dataset['option'] === previousKey) ?? buttons.find(b => b.getAttribute('aria-checked') === 'true') ?? buttons[0]; selected?.focus();
    }
  }
  async function change(/** @type {string} */ id, /** @type {Option} */ option, confirmed = false, closeAfter = true) {
    if (busy) return; const focused = /** @type {HTMLElement | null} */ (document.activeElement); busy = true; poll.invalidate(); renderMenu(false);
    report('Меняю параметры…', 'muted');
    try {
      const answer = await shell.api('POST', url, { change: { [id]: option.value, ...(confirmed ? { confirmed: true } : {}) } });
      apply({ supported: true, parameters: answer.parameters });
      report(['Параметры обновлены', ...(answer.parameters?.notes ?? [])].join('. '), 'ok'); if (closeAfter) close();
    } catch (error) { report(errorText(error), 'error'); }
    finally { busy = false; if (popup) { renderMenu(false); if (focused?.isConnected && popup.contains(focused)) focused.focus({ preventScroll: true }); } await poll.refresh(); }
  }
  /** @param {any} answer */
  function apply(answer) {
    if (readError) { readError = false; report('', 'muted'); }
    if (answer?.supported === false) { close(false); data = null; host.replaceChildren(fallback); return; }
    if (!answer?.parameters || !Array.isArray(answer.parameters.items)) return;
    const previous = JSON.stringify(data?.items); data = /** @type {Parameters} */ (answer.parameters);
    const font = safeFont(data.style?.font); host.style.fontFamily = font || '';
    const accent = safeAccent(data.style?.accent); if (accent) meter.style.setProperty('--sc-context-accent', accent); else meter.style.removeProperty('--sc-context-accent');
    meter.style.setProperty('--sc-context-angle', `${(percent(data.context?.usedPercent) ?? 0) * 3.6}deg`);
    ring.setAttribute('aria-label', contextText(data.context));
    trigger.replaceChildren();
    for (const item of data.items.filter(i => i.inRow)) {
      if (item.id === 'speed' && item.icon === 'zap') trigger.append(icon('zap'));
      else trigger.append(h('span', { class: `sc-parameter-value sc-parameter-${item.tone === 'muted' ? 'muted' : 'primary'}`, title: item.title }, [item.label]));
    }
    if (data.editable) { trigger.append(icon('chevron-down')); trigger.setAttribute('aria-haspopup', 'menu'); }
    else trigger.removeAttribute('aria-haspopup');
    trigger.setAttribute('aria-label', `${data.items.filter(i => i.inRow).map(i => i.title).join('; ')}${data.reason ? `. ${data.reason}` : ''}`);
    reconcile(row, data.style?.ring === 'last' ? [trigger, ring] : [ring, trigger]);
    limits.replaceChildren();
    for (const [index, limit] of (data.limits ?? []).entries()) {
      if (index) limits.append(' · ');
      limits.append(h('span', { 'data-tone': limitTone(limit.usedPercent) }, [`${limit.label} ${Math.round(limit.usedPercent)} %`]));
    }
    reconcile(host, data.limits?.length ? [limits, row] : [row]);
    nativeView?.update();
    if (menu && !confirmation && previous !== JSON.stringify(data.items)) renderMenu();
  }
  function openModels() {
    const element = openPopup(trigger, true); popupKind = 'models';
    element.classList.add('sc-native-models-popup'); element.setAttribute('aria-label', 'Выбрать модель'); renderMenu();
  }
  function openEffort() {
    const element = openPopup(trigger, false); popupKind = 'effort';
    element.classList.add('sc-native-effort-popup'); element.style.fontFamily = host.style.fontFamily;
    element.setAttribute('aria-label', 'Модель и уровень размышлений');
    const card = createEffortCard({ h, data: () => data, busy: () => busy, change: (id, option) => change(id, option, false, false), models: openModels });
    nativeView = card; element.append(card.node); position();
    element.querySelector('input')?.focus({ preventScroll: true });
  }
  trigger.addEventListener('keydown', event => { if (event.key === 'ArrowDown' && data?.editable && !popup) { event.preventDefault(); if (data.presentation?.layout === 'effort-card') openEffort(); else { openPopup(trigger, true); renderMenu(); } } });
  trigger.addEventListener('click', () => {
    if (!data) return;
    if (popup && anchor === trigger) { close(); return; }
    if (data.editable && data.presentation?.layout === 'effort-card') { openEffort(); return; }
    const element = openPopup(trigger, data.editable);
    if (data.editable) renderMenu(); else { element.append(h('p', {}, [data.reason || data.items.map(i => i.title).join(' · ')])); position(); }
  });
  ring.addEventListener('click', () => { const element = openPopup(ring, false); element.append(h('p', {}, [contextText(data?.context ?? null)])); position(); });
  limits.addEventListener('click', () => {
    const element = openPopup(limits, false);
    for (const limit of data?.limits ?? []) {
      const date = limit.resetsAt ? new Date(limit.resetsAt) : null;
      element.append(h('p', {}, [`${limit.label}: ${Math.round(limit.usedPercent)} %. Сброс: ${date && Number.isFinite(date.getTime()) ? date.toLocaleString('ru-RU') : 'нет данных'}`]));
    }
    position();
  });
  return { node: host, refresh: () => poll.refresh(),
    setVisible(/** @type {boolean} */ value) { showing = value; if (!showing) close(false); poll.visible(!busy && showing && host.isConnected && document.visibilityState === 'visible'); },
  };
}
