// @ts-check
// Model of the folder picker roots (spec M14 section 2.7), without DOM: which root the listed
// folder belongs to and whether it may be picked there.

/**
 * @typedef {object} FolderRoot
 * @property {string} name Label: «Домой», "D:\", a volume name.
 * @property {string} path
 * @property {'home' | 'drive'} kind
 */

/**
 * @typedef {object} RootState
 * @property {FolderRoot | undefined} root The root that holds the listed folder.
 * @property {boolean} atRoot The listed folder is the root itself.
 * @property {boolean} canPick The listed folder may be chosen.
 * @property {string} note A hint for the picker, empty when nothing to say.
 */

/**
 * Comparable form: Windows paths (with a backslash or a drive letter) ignore case.
 * @param {string} value
 */
function comparable(value) {
  return value.includes('\\') || /^[A-Za-z]:/.test(value) ? value.toLowerCase() : value;
}

/**
 * True when child is the folder or lies inside it.
 * @param {string} child
 * @param {string} folder
 */
function within(child, folder) {
  const c = comparable(child);
  const f = comparable(folder);
  if (c === f) return true;
  const sep = folder.includes('\\') ? '\\' : '/';
  return c.startsWith(f.endsWith(sep) ? f : f + sep);
}

/**
 * State of the picker for a listing: the current root, whether the listed folder can be
 * picked (never home itself; a drive root only with allowDriveRoot) and a hint.
 * @param {{ path: string, parent: string | null, roots?: FolderRoot[] }} listing
 * @param {boolean} [allowDriveRoot] The projects folder may be the root of another drive.
 * @returns {RootState}
 */
export function rootState(listing, allowDriveRoot = false) {
  const roots = listing.roots ?? [];
  const exact = roots.find((r) => comparable(r.path) === comparable(listing.path));
  const root = exact ?? roots.find((r) => within(listing.path, r.path));
  const atRoot = listing.parent === null;
  if (!atRoot) return { root, atRoot, canPick: true, note: '' };
  if (root?.kind === 'drive') {
    return allowDriveRoot
      ? { root, atRoot, canPick: true, note: '' }
      : { root, atRoot, canPick: false, note: 'Это корень диска: выберите папку на нём.' };
  }
  return { root, atRoot, canPick: false, note: 'Это домашняя папка: выберите папку внутри неё.' };
}
