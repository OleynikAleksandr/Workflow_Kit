// @ts-check
import { effortChoice, effortOptions } from './effort-model.js';
/** @param {{ h: any, data: () => import('#provider-registry').SessionParameters | null,
 * busy: () => boolean, change: (id: string, option: import('#provider-registry').ParameterOption) => Promise<void>,
 * models: () => void }} options */
export function createEffortCard({ h, data, busy, change, models }) {
  const icon = (/** @type {string} */ name) => h('span', { class: `sc-icon sc-icon-${name}`, 'aria-hidden': 'true' });
  const speed = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'sc-effort-speed', 'aria-label': 'Быстрая скорость' }, [icon('zap')]));
  const label = h('div', { class: 'sc-effort-label' });
  const model = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'sc-effort-model', 'aria-label': 'Выбрать модель' }));
  const slider = /** @type {HTMLInputElement} */ (h('input', { type: 'range', min: '0', step: '1', class: 'sc-effort-range', 'aria-label': 'Уровень размышлений' }));
  const ticks = h('div', { class: 'sc-effort-ticks', 'aria-hidden': 'true' });
  const track = h('div', { class: 'sc-effort-track' }, [ticks, slider]);
  const reason = h('p', { class: 'sc-effort-reason' });
  const hint = h('div', { class: 'sc-speed-hint', role: 'tooltip' }); hint.hidden = true;
  const node = h('div', { class: 'sc-effort-card' }, [h('div', { class: 'sc-effort-header' }, [speed, label, model]), track, reason, hint]);
  let pointer = false, keyboard = false, submitted = false, destroyed = false;
  /** @type {import('#provider-registry').ParameterOption[]} */ let optionsList = [];
  function preview() {
    const option = effortChoice(slider.value, optionsList);
    if (option) { label.textContent = option.label; slider.setAttribute('aria-valuetext', option.label); }
    const denominator = optionsList.length - 1;
    track.style.setProperty('--sc-effort-fill', `${denominator > 0 ? 100 * Number(slider.value) / denominator : 0}%`);
  }
  async function commit() {
    if (destroyed || busy() || submitted) return;
    const option = effortChoice(slider.value, optionsList);
    const current = data()?.items.find(i => i.id === 'effort');
    if (!option || option.value === current?.value) { update(); return; }
    submitted = true;
    try { await change('effort', option); } finally { submitted = false; update(); }
  }
  function update() {
    const state = data(); if (!state) return;
    const effort = state.items.find(i => i.id === 'effort');
    const modelItem = state.items.find(i => i.id === 'model');
    const speedItem = state.items.find(i => i.id === 'speed');
    optionsList = effortOptions(state);
    const current = optionsList.findIndex(o => o.value === effort?.value);
    label.textContent = effort?.label ?? 'Нет данных';
    model.replaceChildren(document.createTextNode(modelItem?.label ?? 'Модель: нет данных'), icon('chevron-right'));
    model.disabled = busy() || !modelItem?.options?.some(o => !o.disabled);
    model.title = modelItem?.reason ?? 'Выбрать модель';
    slider.max = String(Math.max(0, optionsList.length - 1));
    slider.disabled = busy() || current < 0 || optionsList.filter(o => !o.disabled).length < 2;
    track.hidden = current < 0;
    reason.textContent = current < 0 ? effort?.reason ?? 'Усилие: нет данных' : '';
    reason.hidden = !reason.textContent;
    if (!pointer && !keyboard) { slider.value = String(Math.max(0, current)); preview(); }
    ticks.replaceChildren(...optionsList.map((_, index) => { const tick = h('span', { class: 'sc-effort-tick' }); tick.style.left = `${optionsList.length > 1 ? index / (optionsList.length - 1) * 100 : 0}%`; return tick; }));
    const next = speedItem?.options?.find(o => o.value === (speedItem.value === 'priority' ? 'standard' : 'priority'));
    speed.disabled = busy() || !next || next.disabled === true;
    speed.classList.toggle('sc-speed-on', speedItem?.value === 'priority');
    speed.setAttribute('aria-pressed', String(speedItem?.value === 'priority'));
    const text = state.presentation?.speedHint ?? speedItem?.reason ?? 'Скорость недоступна';
    speed.title = text; speed.setAttribute('aria-label', `Быстрая скорость. ${text.replace(/\n/g, '. ')}`); hint.textContent = text;
  }
  slider.addEventListener('input', preview);
  slider.addEventListener('pointerdown', event => { pointer = true; slider.setPointerCapture(event.pointerId); });
  slider.addEventListener('pointerup', () => { pointer = false; void commit(); });
  slider.addEventListener('pointercancel', () => { pointer = false; update(); });
  slider.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) keyboard = true; });
  slider.addEventListener('keyup', () => { if (keyboard) { keyboard = false; void commit(); } });
  slider.addEventListener('blur', () => { if (keyboard) { keyboard = false; void commit(); } });
  slider.addEventListener('change', () => { if (!pointer && !keyboard) void commit(); });
  speed.addEventListener('mouseenter', () => { hint.hidden = false; }); speed.addEventListener('mouseleave', () => { hint.hidden = true; });
  speed.addEventListener('focus', () => { hint.hidden = false; }); speed.addEventListener('blur', () => { hint.hidden = true; });
  speed.addEventListener('click', () => {
    const item = data()?.items.find(i => i.id === 'speed'); const next = item?.options?.find(o => o.value === (item.value === 'priority' ? 'standard' : 'priority'));
    hint.hidden = false; if (next && !next.disabled && !busy()) void change('speed', next);
  });
  model.addEventListener('click', models);
  update(); return { node, update, destroy() { destroyed = true; pointer = keyboard = false; } };
}
