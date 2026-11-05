// @ts-check
// The "System" card: version, OS, Node.js, data directory, access addresses, service status.
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
 */

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
  if (service.running) return pill('работает', 'ok');
  return pill(service.installed ? 'остановлена' : 'не установлена', 'warn');
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
      ['Запущен', formatTime(system.startedAt)],
    ]);
  },
});
