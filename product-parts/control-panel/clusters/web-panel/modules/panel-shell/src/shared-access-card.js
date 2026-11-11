// @ts-check
// The «Общий доступ к чатам» card of the settings (spec M12 section 2.2): one card per provider
// with a shared access. «Настроить» shows the preview of every write and writes only after the
// second press; the other buttons open the macOS sharing settings or the connections of the
// ChatGPT app, check again or remove what Kit wrote. On Windows (M13 section 2.3) the card shows
// the administrator script, its path and the command to copy; Kit never runs it. The model is in
// shared-access-model.js.
import { api } from './api.js';
import { registerCardGroup, requestRefresh } from './cards.js';
import { code, h, notice, pill } from './dom.js';
import { adminNote, operationNote, removeConfirm, sharedAccessOf, sharedAccessProviders, sharedButtons, sharedOperation, sharedSummary, sharedTone } from './shared-access-model.js';

/** @typedef {import('./shared-access-model.js').SharedAccessData} SharedAccessData */
/** @typedef {import('./shared-access-model.js').SharedOperation} SharedOperation */

/**
 * @typedef {object} Preview
 * @property {Array<{ file: string, description: string, value?: unknown }>} writes
 * @property {string} token
 * @property {string[]} notes
 */

/** @type {Map<string, { node: HTMLElement, draw: (data: { shared: SharedAccessData | null, op: SharedOperation | null }) => void }>} */
const views = new Map();

/** @param {string} provider */
function base(provider) {
  return `/api/providers/${encodeURIComponent(provider)}/shared-access`;
}

/**
 * The stable node of a provider card: the open preview and messages survive the polls.
 * @param {string} provider
 */
function view(provider) {
  const known = views.get(provider);
  if (known) return known;
  const head = h('div', { class: 'row' });
  const summary = h('p', { class: 'muted' });
  const manual = h('div');
  const adminArea = h('div');
  const buttons = h('div', { class: 'actions' });
  const previewArea = h('div');
  const message = h('div', { class: 'notice', role: 'status' });
  message.hidden = true;
  const node = h('div', {}, [head, summary, manual, adminArea, buttons, previewArea, message]);
  /** @type {Preview | null} */
  let preview = null;
  let scriptShown = false;
  // The message shows the note of an operation (M14): it goes as soon as the operation ends.
  let opShown = false;
  /** @type {{ shared: SharedAccessData | null, op: SharedOperation | null }} */
  let last = { shared: null, op: null };

  /** @param {string} title @param {() => Promise<void>} run */
  const act = async (title, run) => {
    notice(message, 'muted', '');
    try {
      await run();
    } catch (error) {
      const hint = /** @type {{ hint?: string }} */ (error).hint;
      notice(message, 'error', `${title}: ${error instanceof Error ? error.message : String(error)}`, hint ? { hint } : {});
    }
    requestRefresh();
  };

  const drawPreview = () => {
    if (!preview) return previewArea.replaceChildren();
    const write = h('button', { type: 'button', class: 'btn primary' }, ['Записать']);
    const cancel = h('button', { type: 'button', class: 'btn' }, ['Отмена']);
    const token = preview.token;
    write.addEventListener('click', () =>
      void act('Не удалось настроить', async () => {
        preview = null;
        drawPreview();
        await api('POST', `${base(provider)}/apply`, { token });
        notice(message, 'muted', 'Настройка запущена…');
      }));
    cancel.addEventListener('click', () => {
      preview = null;
      drawPreview();
    });
    const items = preview.writes.map((w) => h('li', {}, [code(w.file), ' — ', w.description]));
    previewArea.replaceChildren(
      h('div', { class: 'panel' }, [
        h('p', {}, [preview.writes.length > 0 ? 'Kit запишет (копии файлов — в каталоге данных):' : 'Записывать нечего: всё уже на месте.']),
        h('ul', {}, items),
        ...preview.notes.map((note) => h('p', { class: 'muted' }, [note])),
        h('div', { class: 'actions' }, [write, cancel]),
      ]),
    );
  };

  /** @param {import('./shared-access-model.js').SharedAccessButton} button */
  const press = (button) => {
    if (button.id === 'setup') {
      return void act('Не удалось открыть предпросмотр', async () => {
        preview = await api('GET', `${base(provider)}/preview`);
        drawPreview();
      });
    }
    if (button.id === 'show-script') {
      scriptShown = !scriptShown;
      return draw(last);
    }
    if (button.id === 'copy-command') {
      const command = last.shared?.admin?.command ?? '';
      return void act('Не удалось скопировать команду', async () => {
        await navigator.clipboard.writeText(command);
        notice(message, 'muted', 'Команда скопирована: вставьте её в PowerShell, запущенный от имени администратора.');
      });
    }
    if (button.id === 'remote-login' || button.id === 'connections') {
      return void act('Не удалось открыть', () => api('POST', `${base(provider)}/open`, { target: button.id }));
    }
    if (button.id === 'remove' && !window.confirm(removeConfirm(last.shared))) return;
    if (button.id === 'remove') return void act('Не удалось убрать настройку', () => api('POST', `${base(provider)}/remove`));
    return void act('Не удалось проверить', () => api('POST', `${base(provider)}/recheck`, {}, 30_000));
  };

  /** @param {{ shared: SharedAccessData | null, op: SharedOperation | null }} data */
  const draw = (data) => {
    last = data;
    const { shared, op } = last;
    head.replaceChildren(pill(shared?.label ?? 'Не проверено', sharedTone(shared)), ' ', h('small', { class: 'muted' }, [`подключение ${shared?.alias ?? 'wfk-local'}`]));
    summary.replaceChildren(sharedSummary(shared));
    manual.replaceChildren(
      ...(shared?.manualProfile
        ? [h('p', {}, ['Вставьте этот блок в профиль вашей оболочки (Kit его не меняет):']), h('pre', { class: 'path' }, [shared.manualProfile])]
        : []),
    );
    const step = shared?.admin ?? null;
    const note = adminNote(shared);
    adminArea.replaceChildren(
      ...(step && note
        ? [
            h('p', {}, [note]),
            h('pre', { class: 'path' }, [step.command]),
            ...(scriptShown ? [h('p', { class: 'muted' }, ['Файл: ', code(step.file)]), h('pre', { class: 'path' }, [step.text])] : []),
          ]
        : []),
    );
    const running = op?.status === 'running' || op?.status === 'queued';
    buttons.replaceChildren(
      ...sharedButtons(shared).map((button) => {
        const label = button.id === 'show-script' && scriptShown ? 'Скрыть скрипт' : button.label;
        const node = h('button', { type: 'button', class: button.primary ? 'btn primary' : 'btn' }, [label]);
        if (running) node.setAttribute('disabled', '');
        node.addEventListener('click', () => press(button));
        return node;
      }),
    );
    const opNote = operationNote(op);
    if (opNote) {
      notice(message, opNote.tone, opNote.text);
      opShown = true;
    } else if (opShown || message.textContent === 'Настройка запущена…') {
      notice(message, 'muted', '');
      opShown = false;
    }
  };

  const entry = { node, draw };
  views.set(provider, entry);
  return entry;
}

registerCardGroup({
  id: 'shared-access',
  order: 5,
  items: (state) => sharedAccessProviders(state).map((p) => ({ id: p.id, title: `Общий доступ к чатам · ${p.label}` })),
  select: (state, provider) => ({ shared: sharedAccessOf(state, provider), op: sharedOperation(state, provider) }),
  render(data, _state, provider) {
    const entry = view(provider);
    entry.draw(data);
    return entry.node;
  },
});
