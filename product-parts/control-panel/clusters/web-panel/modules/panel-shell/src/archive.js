// @ts-check
// «Архив» (opened from the «Архив» card of the settings), modelled on the archive of Workflow
// Pilot: projects and sessions side by side; a click selects a row, ⌘/Ctrl toggles, Shift selects
// a range; the toolbar acts on the selection. Projects: back to the active ones, out of the list
// (the folder stays) or deleted from disk after typing the exact name. Sessions: back to the tree
// or out of Workflow Kit's lists (the chat stays in the app).
import { h } from './dom.js';
import { selectRows } from './selection.js';
import { shortPath } from './view-model.js';

/** @typedef {import('./selection.js').ArchivedSessionRow} ArchivedSessionRow */
/** @typedef {{ id: string, name: string, path: string, missing?: boolean, archivedAt?: string }} ArchivedProject */

/**
 * @typedef {object} ArchiveHandlers
 * @property {(projects: ArchivedProject[]) => Promise<void>} restoreProjects
 * @property {(projects: ArchivedProject[]) => Promise<void>} forgetProjects
 * @property {(project: ArchivedProject, confirm: string) => Promise<boolean>} deleteProject
 * @property {(sessions: ArchivedSessionRow[]) => Promise<void>} restoreSessions
 * @property {(sessions: ArchivedSessionRow[]) => Promise<void>} forgetSessions
 * @property {() => void} close
 */

/**
 * @param {string} label
 * @param {string} cls
 * @param {() => void} onClick
 * @returns {HTMLButtonElement}
 */
function button(label, cls, onClick) {
  const node = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: cls }, [label]));
  node.addEventListener('click', onClick);
  return node;
}

/**
 * A selectable list of one column; items are rows with an id.
 * @param {string} label
 * @param {(item: any) => Node[]} rowContent
 * @param {() => void} onChange
 */
function createColumnList(label, rowContent, onChange) {
  /** @type {any[]} */
  let items = [];
  /** @type {string[]} */
  let selected = [];
  /** @type {string | null} */
  let anchor = null;
  const list = h('ul', { class: 'archive-list', role: 'listbox', 'aria-multiselectable': 'true', 'aria-label': label });
  function draw() {
    if (items.length === 0) {
      list.replaceChildren(h('li', { class: 'archive-empty' }, ['Пусто']));
      return;
    }
    list.replaceChildren(
      ...items.map((item) => {
        const on = selected.includes(item.id);
        const row = h('li', { class: `archive-item${on ? ' selected' : ''}`, role: 'option', 'aria-selected': String(on), tabindex: '0' }, rowContent(item));
        row.addEventListener('click', (event) => {
          const next = selectRows(items.map((i) => i.id), selected, anchor, item.id, { toggle: event.metaKey || event.ctrlKey, range: event.shiftKey });
          selected = next.selected;
          anchor = next.anchor;
          draw();
          onChange();
        });
        row.addEventListener('keydown', (event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            row.click();
          }
        });
        return row;
      }),
    );
  }
  return {
    list,
    /** @param {any[]} next */
    set(next) {
      items = next;
      const ids = next.map((i) => i.id);
      selected = selected.filter((id) => ids.includes(id));
      if (anchor && !ids.includes(anchor)) anchor = null;
      draw();
    },
    /** @returns {any[]} */
    chosen() {
      return items.filter((i) => selected.includes(i.id));
    },
    clear() {
      selected = [];
      anchor = null;
      draw();
    },
  };
}

/**
 * @param {ArchiveHandlers} handlers
 * @returns {{ element: HTMLElement, render: (projects: ArchivedProject[], sessions: ArchivedSessionRow[], home: string, providerNames: string) => void }}
 */
export function createArchiveScreen(handlers) {
  let home = '';
  let busy = false;
  const projectCount = h('span', { class: 'count' });
  const sessionCount = h('span', { class: 'count' });

  const projects = createColumnList('Проекты в архиве', (/** @type {ArchivedProject} */ p) => [
    h('strong', {}, [p.name, p.missing ? h('span', { class: 'tag' }, ['папки нет']) : null]),
    h('small', {}, [shortPath(p.path, home)]),
  ], () => update());
  const sessions = createColumnList('Сессии в архиве', (/** @type {ArchivedSessionRow} */ s) => [
    h('strong', {}, [s.name, h('span', { class: `badge ${s.provider}` }, [s.providerLabel])]),
    h('small', {}, [[s.projectName, s.when].filter(Boolean).join(' · ')]),
  ], () => update());

  /** @param {() => Promise<unknown>} work */
  const run = async (work) => {
    if (busy) return;
    busy = true;
    update();
    try {
      await work();
    } finally {
      busy = false;
      update();
    }
  };

  const restore = button('Вернуть в активные', 'btn primary', () => void run(async () => {
    await handlers.restoreProjects(projects.chosen());
    projects.clear();
  }));
  const forget = button('Убрать из списка', 'btn', () => void run(async () => {
    await handlers.forgetProjects(projects.chosen());
    projects.clear();
  }));
  const remove = button('Удалить с диска…', 'btn danger', () => openDelete());
  const restoreSessions = button('Вернуть', 'btn primary', () => void run(async () => {
    await handlers.restoreSessions(sessions.chosen());
    sessions.clear();
  }));
  const forgetSessions = button('Убрать из списка', 'btn', () => void run(async () => {
    await handlers.forgetSessions(sessions.chosen());
    sessions.clear();
  }));

  const deleteName = h('strong');
  const deletePath = h('p', { class: 'hint' });
  const confirmInput = /** @type {HTMLInputElement} */ (h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Имя проекта для подтверждения' }));
  const confirmDelete = button('Удалить безвозвратно', 'btn danger solid', () => {
    const [project] = projects.chosen();
    if (!project) return;
    void run(async () => {
      if (await handlers.deleteProject(project, confirmInput.value)) {
        deletePanel.hidden = true;
        projects.clear();
      }
    });
  });
  const deleteText = h('p', {}, ['']);
  const deletePanel = h('section', { class: 'archive-delete' }, [
    deleteName,
    deletePath,
    deleteText,
    confirmInput,
    h('div', { class: 'row' }, [confirmDelete, button('Отмена', 'btn', () => {
      deletePanel.hidden = true;
      update();
    })]),
  ]);
  deletePanel.hidden = true;
  confirmInput.addEventListener('input', () => update());

  function openDelete() {
    const [project] = projects.chosen();
    if (!project) return;
    deleteName.textContent = `Удалить «${project.name}» с диска?`;
    deletePath.textContent = project.path;
    confirmInput.value = '';
    deletePanel.hidden = false;
    update();
    confirmInput.focus();
  }

  function update() {
    const p = projects.chosen();
    const s = sessions.chosen();
    restore.disabled = busy || p.length === 0;
    forget.disabled = busy || p.length === 0;
    remove.disabled = busy || p.length !== 1 || !deletePanel.hidden;
    restoreSessions.disabled = busy || s.length === 0;
    forgetSessions.disabled = busy || s.length === 0;
    const [one] = p;
    if (!deletePanel.hidden && (p.length !== 1 || !one)) deletePanel.hidden = true;
    confirmDelete.disabled = busy || !one || confirmInput.value !== one.name;
  }

  const close = button('✕', 'icon close', () => handlers.close());
  close.title = 'Закрыть архив';
  close.setAttribute('aria-label', 'Закрыть архив');
  const element = h('div', { class: 'screen archive' }, [
    h('div', { class: 'screen-head with-close' }, [
      h('div', {}, [h('h1', {}, ['Архив']), h('div', { class: 'sub' }, ['Shift — диапазон · ⌘/Ctrl — отдельные записи'])]),
      close,
    ]),
    h('div', { class: 'archive-columns' }, [
      h('section', { class: 'archive-column' }, [h('h2', {}, ['Проекты ', projectCount]), h('div', { class: 'row' }, [restore, forget, remove]), projects.list, deletePanel]),
      h('section', { class: 'archive-column' }, [h('h2', {}, ['Сессии ', sessionCount]), h('div', { class: 'row' }, [restoreSessions, forgetSessions]), sessions.list]),
    ]),
  ]);

  return {
    element,
    render(nextProjects, nextSessions, nextHome, providerNames) {
      home = nextHome;
      deleteText.textContent = `Папка проекта со всем содержимым будет удалена с диска безвозвратно. Чаты в ${providerNames} останутся. Для подтверждения введите точное имя проекта.`;
      projectCount.textContent = String(nextProjects.length);
      sessionCount.textContent = String(nextSessions.length);
      projects.set(nextProjects);
      sessions.set(nextSessions.map((s) => ({ ...s, id: `${s.projectId}\u0000${s.key}` })));
      update();
    },
  };
}
