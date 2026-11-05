// @ts-check
// The "Projects" card: list of projects, creating a project in the projects root and opening an
// existing folder chosen from a list. The card keeps one DOM tree so typed text survives polling.
import { api } from './api.js';
import { registerCard, requestRefresh } from './cards.js';
import { code, h, notice, pill, plainInput } from './dom.js';
import { createFolderPicker, showError } from './folder-picker.js';

/**
 * @typedef {object} ProjectView
 * @property {string} id
 * @property {string} name
 * @property {string} path
 * @property {'created' | 'opened'} source
 * @property {string} createdAt
 * @property {boolean} missing
 */

/**
 * @typedef {object} ProjectsSection
 * @property {string} root
 * @property {string} home
 * @property {ProjectView[]} projects
 * @property {string} [error]
 */

/** @type {ReturnType<typeof build> | undefined} */
let view;

/**
 * Builds the persistent card tree once.
 */
function build() {
  const rootLine = h('p', { class: 'muted root-line' });
  const sectionError = h('div', { class: 'notice', role: 'alert' });
  sectionError.hidden = true;
  const list = h('ul', { class: 'project-list', role: 'list' });

  const nameInput = plainInput({
    id: 'project-name',
    name: 'name',
    placeholder: 'Имя нового проекта',
    maxlength: '100',
    'aria-label': 'Имя нового проекта',
  });
  const createButton = /** @type {HTMLButtonElement} */ (h('button', { type: 'submit', class: 'btn btn-primary' }, ['Создать']));
  const createForm = h('form', { class: 'inline-form' }, [nameInput, createButton]);
  const openButton = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn' }, ['Открыть существующую папку…']));
  const message = h('div', { class: 'notice', role: 'status' });
  message.hidden = true;

  const picker = createFolderPicker({
    async onPick(path) {
      const result = await api('POST', '/api/projects/open', { path });
      closePicker();
      const name = result?.project?.name ?? path;
      notice(message, 'ok', result?.existing ? `Проект «${name}» уже в списке` : `Проект «${name}» открыт`);
      requestRefresh();
    },
    onClose: closePicker,
  });

  function closePicker() {
    picker.element.hidden = true;
    openButton.hidden = false;
  }

  openButton.addEventListener('click', () => {
    notice(message, 'muted', '');
    picker.element.hidden = false;
    openButton.hidden = true;
    void picker.open();
  });

  createForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (createButton.disabled) return;
    createButton.disabled = true;
    notice(message, 'muted', '');
    try {
      const result = await api('POST', '/api/projects', { name: nameInput.value });
      nameInput.value = '';
      notice(message, 'ok', `Проект «${result?.project?.name ?? ''}» создан: ${result?.project?.path ?? ''}`);
      requestRefresh();
    } catch (error) {
      showError(message, error);
    } finally {
      createButton.disabled = false;
    }
  });

  const element = h('div', { class: 'projects' }, [
    rootLine,
    sectionError,
    list,
    h('div', { class: 'projects-actions' }, [
      h('label', { class: 'field-label', for: 'project-name' }, ['Новый проект']),
      createForm,
      openButton,
    ]),
    picker.element,
    message,
  ]);
  return { element, rootLine, sectionError, list, message };
}

/**
 * Removes a project from the list after a confirmation; the folder stays on disk.
 * @param {ProjectView} project
 * @param {HTMLButtonElement} button
 * @param {HTMLElement} message
 */
async function removeProject(project, button, message) {
  const question = `Убрать проект «${project.name}» из списка?\n\nПапка останется на диске:\n${project.path}`;
  if (!window.confirm(question)) return;
  button.disabled = true;
  try {
    await api('DELETE', `/api/projects/${encodeURIComponent(project.id)}`);
    notice(message, 'ok', `Проект «${project.name}» убран из списка, папка осталась на месте`);
    requestRefresh();
  } catch (error) {
    showError(message, error);
    button.disabled = false;
  }
}

/**
 * One row of the project list.
 * @param {ProjectView} project
 * @param {HTMLElement} message
 * @returns {HTMLElement}
 */
function projectRow(project, message) {
  const remove = /** @type {HTMLButtonElement} */ (
    h('button', { type: 'button', class: 'btn btn-quiet', title: 'Папка останется на диске' }, ['Убрать из списка'])
  );
  remove.addEventListener('click', () => void removeProject(project, remove, message));
  return h('li', { class: 'project' }, [
    h('div', { class: 'project-main' }, [
      h('div', { class: 'project-title' }, [
        h('strong', {}, [project.name]),
        ' ',
        pill(project.source === 'created' ? 'создан' : 'открыт', 'muted'),
        project.missing ? ' ' : null,
        project.missing ? pill('папка не найдена', 'warn') : null,
      ]),
      code(project.path),
    ]),
    remove,
  ]);
}

registerCard({
  id: 'projects',
  title: 'Проекты',
  order: 10,
  wide: true,
  select: (state) => state['projects'],
  /** @param {ProjectsSection | { error: string } | undefined} data */
  render(data) {
    view ??= build();
    const section = /** @type {Partial<ProjectsSection>} */ (data ?? {});
    view.rootLine.replaceChildren(
      'Новые проекты создаются в ',
      section.root ? code(section.root) : '—',
    );
    notice(view.sectionError, 'error', section.error ? `Список проектов недоступен: ${section.error}` : '');
    const projects = section.projects ?? [];
    if (projects.length === 0) {
      view.list.replaceChildren(h('li', { class: 'muted empty' }, ['Проектов пока нет: создайте новый или откройте папку.']));
    } else {
      const message = view.message;
      view.list.replaceChildren(...projects.map((project) => projectRow(project, message)));
    }
    return view.element;
  },
});
