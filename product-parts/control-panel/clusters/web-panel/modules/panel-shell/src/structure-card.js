// @ts-check
// The "Kit structure" card: for every project the status of the Kit structure (AGENTS.md section,
// SessionStart hooks, .gitignore block, templates) and the install / update action.
import { api } from './api.js';
import { registerCard, requestRefresh } from './cards.js';
import { code, h, notice, pill } from './dom.js';
import { showError } from './folder-picker.js';

/**
 * @typedef {'ok' | 'missing' | 'modified' | 'outdated' | 'newer'} StructureStatus
 */

/**
 * @typedef {object} FragmentReport
 * @property {string} id
 * @property {string} path
 * @property {string} kind
 * @property {StructureStatus} status
 * @property {string} [error]
 */

/**
 * @typedef {object} StructureReport
 * @property {StructureStatus} status
 * @property {number} version
 * @property {number | null} installedVersion
 * @property {FragmentReport[]} fragments
 * @property {string[]} warnings
 * @property {string[]} notes
 * @property {boolean} installable
 */

/**
 * @typedef {{ id: string, name: string, path: string, missing: boolean }} ProjectView
 * @typedef {{ projects: ProjectView[], reports: Record<string, StructureReport | { error: string, code: string }> }} CardData
 */

/** @type {Record<StructureStatus, { label: string, tone: 'ok' | 'warn' | 'muted', text: string }>} */
const STATUS = {
  ok: { label: 'ok', tone: 'ok', text: 'структура Kit на месте' },
  missing: { label: 'нет', tone: 'muted', text: 'структура Kit не установлена или установлена не полностью' },
  modified: { label: 'modified', tone: 'warn', text: 'управляемый фрагмент изменён вручную; Kit его не перезаписывает' },
  outdated: { label: 'outdated', tone: 'warn', text: 'фрагмент записан старой версией Kit; можно обновить' },
  newer: { label: 'newer', tone: 'warn', text: 'фрагмент записан более новой версией Kit' },
};

/** Fragment names shown to the user. */
/** @type {Record<string, string>} */
const FRAGMENT_NAMES = {
  'agents-section': 'раздел Kit в AGENTS.md',
  'claude-md': 'CLAUDE.md',
  'claude-hook': 'хук SessionStart Claude',
  'codex-hook': 'хук SessionStart Codex',
  'gitignore-block': 'блок .gitignore',
  'product-parts-readme': 'product-parts/README.md',
  'template-product-part': 'шаблон product-part.md',
  'template-cluster': 'шаблон cluster.md',
  'template-module': 'шаблон module.md',
};

/** Project ids whose fragment list is expanded; survives re-rendering. */
const expanded = new Set();

/** @type {{ element: HTMLElement, list: HTMLElement, message: HTMLElement } | undefined} */
let view;

function build() {
  const list = h('ul', { class: 'project-list', role: 'list' });
  const message = h('div', { class: 'notice', role: 'status' });
  message.hidden = true;
  const element = h('div', { class: 'structure' }, [
    h('p', { class: 'muted root-line' }, [
      'Раздел Kit в AGENTS.md, хуки SessionStart Claude и Codex, блок .gitignore и шаблоны product-parts. Текст вне маркеров Kit не меняется.',
    ]),
    list,
    message,
  ]);
  return { element, list, message };
}

/**
 * Runs the install for a project.
 * @param {ProjectView} project
 * @param {boolean} force Overwrite fragments the user changed.
 * @param {HTMLButtonElement} button
 */
async function install(project, force, button) {
  const message = /** @type {NonNullable<typeof view>} */ (view).message;
  if (force) {
    const question = `Перезаписать изменённые фрагменты Kit в проекте «${project.name}»?\n\nПравки внутри раздела Kit и в его файлах будут заменены. Текст вне маркеров Kit не изменится.`;
    if (!window.confirm(question)) return;
  }
  button.disabled = true;
  notice(message, 'muted', '');
  try {
    const result = await api('POST', `/api/projects/${encodeURIComponent(project.id)}/structure`, { force });
    const written = Array.isArray(result?.written) ? result.written.length : 0;
    const status = result?.report?.status ?? '';
    notice(
      message,
      'ok',
      written > 0 ? `«${project.name}»: структура записана (${written} файл.), статус ${status}` : `«${project.name}»: всё уже на месте, ничего не записано`,
    );
    requestRefresh();
  } catch (error) {
    showError(message, error);
  } finally {
    button.disabled = false;
  }
}

/**
 * Action buttons for a report.
 * @param {ProjectView} project
 * @param {StructureReport} report
 * @returns {HTMLElement[]}
 */
function actions(project, report) {
  /** @type {HTMLElement[]} */
  const buttons = [];
  if (report.installable) {
    const label = report.installedVersion === null ? 'Установить' : 'Обновить';
    const button = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn btn-primary' }, [label]));
    button.addEventListener('click', () => void install(project, false, button));
    buttons.push(button);
  }
  if (report.fragments.some((f) => (f.status === 'modified' || f.status === 'newer') && !f.error)) {
    const button = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn' }, ['Перезаписать изменённое…']));
    button.addEventListener('click', () => void install(project, true, button));
    buttons.push(button);
  }
  return buttons;
}

/**
 * Fragment list (collapsible).
 * @param {string} projectId
 * @param {StructureReport} report
 * @returns {HTMLElement}
 */
function fragmentList(projectId, report) {
  const rows = report.fragments.map((fragment) => {
    const info = STATUS[fragment.status] ?? STATUS.modified;
    return h('li', { class: 'fragment' }, [
      pill(info.label, info.tone),
      ' ',
      h('span', {}, [FRAGMENT_NAMES[fragment.id] ?? fragment.id]),
      ' ',
      code(fragment.path),
      fragment.error ? h('div', { class: 'error fragment-error' }, [fragment.error]) : null,
    ]);
  });
  const details = /** @type {HTMLDetailsElement} */ (
    h('details', { class: 'fragments' }, [h('summary', {}, ['Фрагменты']), h('ul', { class: 'plain' }, rows)])
  );
  details.open = expanded.has(projectId);
  details.addEventListener('toggle', () => {
    if (details.open) expanded.add(projectId);
    else expanded.delete(projectId);
  });
  return details;
}

/**
 * One project row.
 * @param {ProjectView} project
 * @param {StructureReport | { error: string, code: string } | undefined} entry
 * @returns {HTMLElement}
 */
function projectRow(project, entry) {
  const title = h('div', { class: 'project-title' }, [h('strong', {}, [project.name])]);
  const main = h('div', { class: 'project-main' }, [title, code(project.path)]);
  if (!entry) {
    title.append(' ', pill('проверяется…', 'muted'));
    return h('li', { class: 'project' }, [main]);
  }
  if ('error' in entry) {
    title.append(' ', pill('недоступна', 'muted'));
    main.append(h('div', { class: 'error' }, [entry.error]));
    return h('li', { class: 'project' }, [main]);
  }
  const info = STATUS[entry.status] ?? STATUS.modified;
  title.append(' ', pill(info.label, info.tone));
  main.append(h('div', { class: 'muted' }, [info.text]));
  for (const warning of entry.warnings) main.append(h('div', { class: 'structure-warn' }, [warning]));
  for (const note of entry.notes) main.append(h('div', { class: 'muted structure-note' }, [note]));
  main.append(fragmentList(project.id, entry));
  return h('li', { class: 'project' }, [main, h('div', { class: 'actions' }, actions(project, entry))]);
}

registerCard({
  id: 'structure',
  title: 'Структура Kit',
  order: 20,
  wide: true,
  select: (state) => {
    const projects = /** @type {{ projects?: ProjectView[] } | undefined} */ (state['projects']);
    const structure = /** @type {{ projects?: Record<string, unknown> } | undefined} */ (state['structure']);
    return { projects: projects?.projects ?? [], reports: structure?.projects ?? {} };
  },
  /** @param {CardData} data */
  render(data) {
    view ??= build();
    if (data.projects.length === 0) {
      view.list.replaceChildren(h('li', { class: 'muted empty' }, ['Нет проектов: добавьте проект в карточке «Проекты».']));
    } else {
      view.list.replaceChildren(...data.projects.map((project) => projectRow(project, data.reports[project.id])));
    }
    return view.element;
  },
});
