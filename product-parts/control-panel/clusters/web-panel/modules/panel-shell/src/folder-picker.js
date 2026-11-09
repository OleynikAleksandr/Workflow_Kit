// @ts-check
// Folder picker: browses folders inside the home folder through GET /api/folders (the backend
// refuses anything outside home) and hands the chosen folder to the caller.
import { ApiError, apiGet } from './api.js';
import { code, h, notice, plainInput } from './dom.js';

/**
 * @typedef {object} FolderEntry
 * @property {string} name
 * @property {string} path
 */

/**
 * @typedef {object} FolderListing
 * @property {string} path
 * @property {string | null} parent
 * @property {string} home
 * @property {FolderEntry[]} entries
 * @property {boolean} truncated
 */

/**
 * @typedef {object} FolderPickerOptions
 * @property {(path: string) => Promise<void>} onPick Called with the chosen folder; a rejection is shown in the picker.
 * @property {() => void} onClose Called by the "Cancel" button.
 * @property {string} [pickLabel] Text of the pick button (default «Открыть эту папку как проект»).
 * @property {string} [idPrefix] Prefix of the element ids, unique per picker on the page (default "picker").
 */

/**
 * Shows an error from the API in a message area, with the hint (macOS TCC) when present.
 * @param {HTMLElement} area
 * @param {unknown} error
 */
export function showError(area, error) {
  if (error instanceof ApiError) {
    notice(area, 'error', error.message, { hint: error.hint, items: error.blockers });
  } else {
    notice(area, 'error', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Creates the picker element; open() loads a folder (home by default).
 * @param {FolderPickerOptions} options
 * @returns {{ element: HTMLElement, open: (path?: string) => Promise<void> }}
 */
export function createFolderPicker(options) {
  /** @type {FolderListing | undefined} */
  let listing;
  let busy = false;

  const current = h('div', { class: 'picker-current' });
  const upButton = h('button', { type: 'button', class: 'btn' }, ['↑ Вверх']);
  const homeButton = h('button', { type: 'button', class: 'btn' }, ['Домой']);
  const prefix = options.idPrefix ?? 'picker';
  const hidden = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', id: `${prefix}-hidden` }));
  const pathInput = plainInput({ id: `${prefix}-path`, name: 'path', placeholder: '/Users/имя/папка', 'aria-label': 'Путь к папке' });
  const goButton = h('button', { type: 'submit', class: 'btn' }, ['Перейти']);
  const list = h('ul', { class: 'folder-list', role: 'list' });
  const message = h('div', { class: 'notice', role: 'alert' });
  message.hidden = true;
  const pickButton = h('button', { type: 'button', class: 'btn btn-primary' }, [options.pickLabel ?? 'Открыть эту папку как проект']);
  const cancelButton = h('button', { type: 'button', class: 'btn' }, ['Отмена']);
  const pathForm = h('form', { class: 'inline-form' }, [pathInput, goButton]);

  const element = h('div', { class: 'picker', hidden: '' }, [
    h('div', { class: 'picker-head' }, [current, h('div', { class: 'picker-nav' }, [upButton, homeButton])]),
    pathForm,
    h('label', { class: 'check' }, [hidden, ' Показывать скрытые папки']),
    list,
    message,
    h('div', { class: 'actions' }, [pickButton, cancelButton]),
  ]);

  /** @param {boolean} value */
  function setBusy(value) {
    busy = value;
    element.setAttribute('aria-busy', String(value));
    for (const button of [upButton, homeButton, goButton, pickButton]) {
      /** @type {HTMLButtonElement} */ (button).disabled = value;
    }
    if (!value && listing) {
      /** @type {HTMLButtonElement} */ (upButton).disabled = listing.parent === null;
      /** @type {HTMLButtonElement} */ (homeButton).disabled = listing.parent === null;
      /** @type {HTMLButtonElement} */ (pickButton).disabled = listing.parent === null;
    }
  }

  function renderListing() {
    if (!listing) return;
    current.replaceChildren(h('span', { class: 'muted' }, ['Папка: ']), code(listing.path));
    pathInput.value = listing.path;
    if (listing.entries.length === 0) {
      list.replaceChildren(h('li', { class: 'muted empty' }, ['Подпапок нет']));
    } else {
      list.replaceChildren(
        ...listing.entries.map((entry) => {
          const button = h('button', { type: 'button', class: 'folder', title: entry.path }, [
            h('span', { class: 'folder-icon', 'aria-hidden': 'true' }),
            h('span', { class: 'folder-name' }, [entry.name]),
            h('span', { class: 'chevron', 'aria-hidden': 'true' }, ['›']),
          ]);
          button.addEventListener('click', () => void load(entry.path));
          return h('li', {}, [button]);
        }),
      );
    }
    if (listing.truncated) list.append(h('li', { class: 'muted empty' }, ['Показаны не все папки']));
    if (listing.parent === null) notice(message, 'muted', 'Это домашняя папка: выберите папку внутри неё.');
  }

  /**
   * Loads one folder; on failure the previous listing stays and the error is shown.
   * @param {string} [path]
   */
  async function load(path) {
    if (busy) return;
    setBusy(true);
    notice(message, 'muted', '');
    const query = new URLSearchParams();
    if (path) query.set('path', path);
    if (hidden.checked) query.set('hidden', '1');
    try {
      listing = /** @type {FolderListing} */ (await apiGet(`/api/folders?${query.toString()}`));
      renderListing();
    } catch (error) {
      showError(message, error);
    } finally {
      setBusy(false);
    }
  }

  upButton.addEventListener('click', () => {
    if (listing?.parent) void load(listing.parent);
  });
  homeButton.addEventListener('click', () => void load());
  hidden.addEventListener('change', () => void load(listing?.path));
  pathForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void load(pathInput.value.trim());
  });
  cancelButton.addEventListener('click', () => options.onClose());
  pickButton.addEventListener('click', async () => {
    if (!listing || busy) return;
    setBusy(true);
    try {
      await options.onPick(listing.path);
    } catch (error) {
      showError(message, error);
    } finally {
      setBusy(false);
    }
  });

  return {
    element,
    open: (path) => load(path),
  };
}
