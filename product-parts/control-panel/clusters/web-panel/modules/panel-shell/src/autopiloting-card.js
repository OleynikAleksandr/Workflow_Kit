// @ts-check
// The «Автопилотирование» card of «Настройки» (spec M39 ui section 2): the three modes as native
// radio buttons, the review switch, the status of the write. Settings live in the service (shared by
// every panel), never in the browser; the card shows the newest revision it saw.
import { api } from './api.js';
import { requestRefresh } from './cards.js';
import { h, notice } from './dom.js';
import { AUTOPILOTING_MODES, DEFAULTS_HINT, REVIEW_CAPTION, REVIEW_LABEL, autopilotingOf, newerSettings, refusalOf, settingsOf } from './autopiloting-model.js';

/** @typedef {import('./autopiloting-model.js').AutopilotingSettings} AutopilotingSettings */

/** @returns {{ element: HTMLElement, render: (state: Record<string, unknown>) => void }} */
export function createAutopilotingCard() {
  /** @type {AutopilotingSettings | null} */
  let known = null;
  let saving = false;
  /** @type {{ mode: string, review: boolean } | null} */
  let queued = null;
  const radios = AUTOPILOTING_MODES.map((m) => /** @type {HTMLInputElement} */ (h('input', { type: 'radio', name: 'wfk-autopiloting-mode', value: m.mode })));
  const review = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox' }));
  const status = h('div', { class: 'notice', role: 'status' });
  status.hidden = true;
  const options = h('fieldset', { class: 'ap-options' }, [
    h('legend', {}, ['Режим']),
    ...AUTOPILOTING_MODES.map((m, i) => h('label', { class: 'ap-option' }, [radios[i], h('span', {}, [h('b', {}, [m.label]), h('small', {}, [m.caption])])])),
  ]);
  const reviewRow = h('label', { class: 'ap-option ap-review' }, [review, h('span', {}, [h('b', {}, [REVIEW_LABEL]), h('small', {}, [REVIEW_CAPTION])])]);
  const element = h('section', { class: 'panel', 'aria-labelledby': 'autopiloting-title' }, [
    h('h2', { id: 'autopiloting-title' }, ['Автопилотирование']),
    h('p', { class: 'muted' }, [DEFAULTS_HINT]),
    options,
    reviewRow,
    status,
  ]);

  const draw = () => {
    const enabled = known !== null;
    radios.forEach((radio, i) => {
      radio.checked = enabled && known?.mode === AUTOPILOTING_MODES[i]?.mode;
      radio.disabled = !enabled;
    });
    review.checked = Boolean(known?.review);
    review.disabled = !enabled;
  };

  /** @param {{ mode: string, review: boolean }} want */
  const save = async (want) => {
    if (saving) {
      queued = want;
      return;
    }
    saving = true;
    notice(status, 'muted', 'Сохраняется…');
    try {
      const answer = await api('POST', '/api/settings/autopiloting', { expectedRevision: known?.revision ?? 0, ...want });
      known = newerSettings(known, settingsOf(answer));
      notice(status, 'ok', 'Сохранено');
    } catch (error) {
      const refused = refusalOf(/** @type {any} */ (error));
      known = newerSettings(known, refused.current);
      queued = null;
      notice(status, 'error', refused.text);
    } finally {
      saving = false;
      const next = queued;
      queued = null;
      if (next) void save(next);
      else draw();
      requestRefresh();
    }
  };

  const changed = () => {
    const mode = radios.find((radio) => radio.checked)?.value ?? known?.mode ?? 'off';
    void save({ mode, review: review.checked });
  };
  for (const radio of radios) radio.addEventListener('change', changed);
  review.addEventListener('change', changed);
  draw();

  return {
    element,
    render(state) {
      const { settings, error } = autopilotingOf(state);
      known = newerSettings(known, settings);
      // The user's own choice stays on screen while it is being written.
      if (!saving) draw();
      if (error && !saving && status.hidden) notice(status, 'error', `Файл настроек не читается: ${error}`);
    },
  };
}
