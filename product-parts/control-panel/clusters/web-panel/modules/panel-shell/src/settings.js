// @ts-check
// «Настройки»: appearance (theme, folder for projects) and the service cards that used to fill the
// main screen (system, structure, providers). The screen stays in the DOM, hidden when not shown,
// so cards keep their state between visits.
import { api } from './api.js';
import { code, h, notice } from './dom.js';
import { createFolderPicker, showError } from './folder-picker.js';
import { THEMES, themeAttribute } from './view-model.js';

/** localStorage key of the theme choice (per device). */
export const THEME_KEY = 'wfk.theme';

/** @type {Record<string, string>} */
const THEME_LABELS = { system: 'Как в системе', light: 'Светлая', dark: 'Тёмная' };

/** @returns {string} */
export function savedTheme() {
  try {
    return localStorage.getItem(THEME_KEY) ?? 'system';
  } catch {
    return 'system';
  }
}

/** Applies the saved theme to the root element. */
export function applyTheme() {
  const value = themeAttribute(savedTheme());
  if (value) document.documentElement.dataset['theme'] = value;
  else delete document.documentElement.dataset['theme'];
}

/**
 * @param {{ onRootChanged: () => void }} options
 * @returns {{ element: HTMLElement, cards: HTMLElement, render: (root: string) => void }}
 */
export function createSettings(options) {
  const themeRow = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Тема' });
  const drawThemes = () => {
    const current = savedTheme();
    themeRow.replaceChildren(
      ...THEMES.map((theme) => {
        const node = h('button', { type: 'button', role: 'radio', 'aria-checked': String(theme === current), class: theme === current ? 'on' : '' }, [THEME_LABELS[theme] ?? theme]);
        node.addEventListener('click', () => {
          try {
            localStorage.setItem(THEME_KEY, theme);
          } catch {
            // Private mode: the choice lasts until reload.
          }
          applyTheme();
          drawThemes();
        });
        return node;
      }),
    );
  };
  drawThemes();

  const rootLine = h('div', { class: 'path-box' }, ['—']);
  const message = h('div', { class: 'notice', role: 'status' });
  message.hidden = true;
  const change = h('button', { type: 'button', class: 'btn' }, ['Изменить папку для проектов']);
  const picker = createFolderPicker({
    idPrefix: 'root-picker',
    pickLabel: 'Сделать папкой для проектов',
    async onPick(path) {
      const result = await api('POST', '/api/settings/projects-root', { path });
      picker.element.hidden = true;
      change.hidden = false;
      notice(message, 'ok', `Новые проекты будут создаваться в ${result?.root ?? path}`);
      options.onRootChanged();
    },
    onClose() {
      picker.element.hidden = true;
      change.hidden = false;
    },
  });
  change.addEventListener('click', () => {
    notice(message, 'muted', '');
    picker.element.hidden = false;
    change.hidden = true;
    void picker.open().catch((error) => showError(message, error));
  });

  const appearance = h('section', { class: 'panel' }, [
    h('h2', {}, ['Внешний вид']),
    h('div', { class: 'field' }, [h('label', {}, ['Тема']), themeRow]),
    h('div', { class: 'field' }, [h('label', {}, ['Папка для проектов']), rootLine]),
    change,
    picker.element,
    message,
  ]);
  const cards = h('div', { class: 'cards', id: 'cards', 'aria-live': 'polite' });
  const element = h('div', { class: 'screen' }, [
    h('div', { class: 'screen-head' }, [h('h1', {}, ['Настройки']), h('div', { class: 'sub' }, ['Служебные сведения: нужны, когда что-то пошло не так.'])]),
    appearance,
    cards,
  ]);
  return {
    element,
    cards,
    render(root) {
      rootLine.replaceChildren(root ? code(root) : '—');
    },
  };
}
