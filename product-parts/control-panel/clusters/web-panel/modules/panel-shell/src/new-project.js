// @ts-check
// Screens «Новый проект» (name in the projects root) and «Открыть папку проекта» (folder picker).
// The screen keeps one DOM tree so typed text survives polling. T008 replaces it by the wizard.
import { api } from './api.js';
import { code, h, notice, plainInput } from './dom.js';
import { createFolderPicker, showError } from './folder-picker.js';

/**
 * @typedef {object} NewProjectScreen
 * @property {HTMLElement} element
 * @property {(mode: 'create' | 'open', root: string) => void} show
 */

/**
 * @param {{ onDone: (projectId: string) => void, onCancel: () => void }} options
 * @returns {NewProjectScreen}
 */
export function createNewProjectScreen(options) {
  const title = h('h2', {}, ['Новый проект']);
  const lead = h('p', {}, []);
  const rootLine = h('div', { class: 'sub' });
  const message = h('div', { class: 'notice', role: 'status' });
  message.hidden = true;

  const nameInput = plainInput({ id: 'project-name', name: 'name', maxlength: '100', 'aria-label': 'Имя проекта' });
  const createButton = /** @type {HTMLButtonElement} */ (h('button', { type: 'submit', class: 'btn btn-primary wide' }, ['Создать']));
  const createForm = h('form', {}, [
    rootLine,
    h('div', { class: 'field' }, [h('label', { for: 'project-name' }, ['Имя проекта']), nameInput]),
    createButton,
  ]);
  createForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (createButton.disabled) return;
    createButton.disabled = true;
    notice(message, 'muted', '');
    try {
      const result = await api('POST', '/api/projects', { name: nameInput.value });
      nameInput.value = '';
      options.onDone(String(result?.project?.id ?? ''));
    } catch (error) {
      showError(message, error);
    } finally {
      createButton.disabled = false;
    }
  });

  const picker = createFolderPicker({
    idPrefix: 'open-picker',
    async onPick(path) {
      const result = await api('POST', '/api/projects/open', { path });
      options.onDone(String(result?.project?.id ?? ''));
    },
    onClose: options.onCancel,
  });

  const cancel = h('button', { type: 'button', class: 'text-btn' }, ['Отмена']);
  cancel.addEventListener('click', options.onCancel);

  const element = h('div', { class: 'panel panel-form' }, [title, lead, createForm, picker.element, message, cancel]);
  /** @type {string | null} */
  let shown = null;

  return {
    element,
    show(mode, root) {
      rootLine.replaceChildren('Папка для проектов: ', root ? code(root) : '—');
      if (shown === mode) return;
      shown = mode;
      notice(message, 'muted', '');
      const open = mode === 'open';
      title.textContent = open ? 'Открыть папку проекта' : 'Новый проект';
      lead.textContent = open ? 'Выберите папку проекта внутри домашней папки.' : 'Укажите имя проекта: папка появится в папке для проектов.';
      createForm.hidden = open;
      cancel.hidden = open;
      picker.element.hidden = !open;
      if (open) void picker.open();
      else nameInput.focus();
    },
  };
}
