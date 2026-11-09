// @ts-check
// The "System" card: version, OS, Node.js, data directory, access addresses, service status,
// instance, autostart, launcher, icon and program paths (from service-installer, D11).
import { registerCard } from './cards.js';
import { code, facts, h, pill } from './dom.js';

/**
 * @typedef {object} ServiceStatus
 * @property {boolean} implemented
 * @property {boolean} installed
 * @property {boolean} running
 * @property {boolean} autostart
 * @property {string} mechanism
 * @property {string} note
 * @property {'default' | 'development'} [instance]
 * @property {string | null} [version]
 * @property {string} [autostartEntry]
 * @property {ManagedItem} [launcher]
 * @property {ManagedItem} [icon]
 * @property {Record<string, string>} [programs]
 * @property {string[]} [programNames] every program the service looks for, found or not
 */

/**
 * @typedef {object} ManagedItem
 * @property {string} path
 * @property {boolean} present
 */

/** @type {Record<string, string>} */
const MECHANISMS = {
  launchagent: 'LaunchAgent',
  'systemd-user': 'systemd (пользовательский unit)',
  'xdg-autostart': 'XDG autostart',
  'hkcu-run': 'ключ HKCU Run',
};

/**
 * @typedef {object} SystemSection
 * @property {string} version
 * @property {{ label: string }} os
 * @property {string} node
 * @property {string} hostname
 * @property {string} dataDir
 * @property {boolean} dataDirOverridden
 * @property {string[]} addresses
 * @property {string} startedAt
 * @property {ServiceStatus} service
 */

/**
 * @param {ServiceStatus | undefined} service
 * @returns {Node}
 */
function serviceValue(service) {
  if (!service) return pill('нет данных', 'muted');
  if (!service.implemented) return h('span', {}, [pill('не установлена', 'muted'), ' ', h('small', {}, [service.note])]);
  const state = service.running ? pill('работает', 'ok') : pill(service.installed ? 'остановлена' : 'не установлена', 'warn');
  const install = service.installed ? `установлена версия ${service.version ?? '?'}` : 'не установлена';
  return h('span', {}, [state, ' ', h('small', {}, [install]), h('br', {}, []), h('small', { class: 'muted' }, [service.note])]);
}

/**
 * @param {ServiceStatus | undefined} service
 * @returns {Node}
 */
function instanceValue(service) {
  if (!service || !service.implemented) return pill('нет данных', 'muted');
  if (service.instance === 'development') return h('span', {}, [pill('разработка', 'warn'), ' ', h('small', {}, ['WFK_DATA_DIR'])]);
  return pill('установка', 'ok');
}

/**
 * Launcher or icon: path and whether it is in place; a development instance never gets them.
 * @param {ServiceStatus | undefined} service
 * @param {ManagedItem | undefined} item
 * @returns {Node}
 */
function managedValue(service, item) {
  if (!service || !service.implemented || !item) return pill('нет данных', 'muted');
  if (service.instance === 'development') return h('small', { class: 'muted' }, ['не ставится в экземпляре разработки']);
  return h('span', {}, [item.present ? pill('есть', 'ok') : pill('нет', 'muted'), ' ', code(item.path)]);
}

/**
 * @param {ServiceStatus | undefined} service
 * @returns {Node}
 */
function autostartValue(service) {
  if (!service || !service.implemented) return pill('нет данных', 'muted');
  const label = MECHANISMS[service.mechanism] ?? service.mechanism;
  const state = service.autostart ? pill('зарегистрирован', 'ok') : pill('не зарегистрирован', 'muted');
  return h('span', {}, [label, ' ', state, ...(service.autostartEntry ? [' ', code(service.autostartEntry)] : [])]);
}

/**
 * @param {ServiceStatus | undefined} service
 * @returns {Node}
 */
function programList(service) {
  const programs = service?.programs ?? {};
  // The service names the programs it looks for; an older service reports the found ones only.
  const names = Array.isArray(service?.programNames) ? service.programNames : Object.keys(programs);
  if (Object.keys(programs).length === 0) return h('small', {}, ['сохраняются командой wfk install']);
  return h(
    'ul',
    { class: 'plain' },
    names.map((name) => h('li', {}, [`${name}: `, programs[name] ? code(programs[name]) : pill('не найдена', 'muted')])),
  );
}

/**
 * @param {string[] | undefined} addresses
 * @returns {Node}
 */
function addressList(addresses) {
  if (!addresses || addresses.length === 0) return pill('нет', 'muted');
  return h('ul', { class: 'plain' }, addresses.map((a) => h('li', {}, [code(a)])));
}

/**
 * @param {string | undefined} iso
 * @returns {string}
 */
function formatTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('ru-RU');
}

registerCard({
  id: 'system',
  title: 'Система',
  order: 0,
  select: (state) => state['system'],
  /** @param {SystemSection | undefined} system */
  render(system) {
    if (!system) return h('p', { class: 'muted' }, ['Нет данных о системе.']);
    const dataDir = system.dataDirOverridden
      ? h('span', {}, [code(system.dataDir), ' ', pill('WFK_DATA_DIR', 'warn')])
      : code(system.dataDir);
    return facts([
      ['Версия', system.version],
      ['ОС', system.os?.label ?? '—'],
      ['Компьютер', system.hostname ?? '—'],
      ['Node.js', system.node ?? '—'],
      ['Каталог данных', dataDir],
      ['Адреса панели', addressList(system.addresses)],
      ['Служба', serviceValue(system.service)],
      ['Экземпляр', instanceValue(system.service)],
      ['Автозапуск', autostartValue(system.service)],
      ['Запускатель', managedValue(system.service, system.service?.launcher)],
      ['Значок', managedValue(system.service, system.service?.icon)],
      ['Программы', programList(system.service)],
      ['Запущен', formatTime(system.startedAt)],
    ]);
  },
});
