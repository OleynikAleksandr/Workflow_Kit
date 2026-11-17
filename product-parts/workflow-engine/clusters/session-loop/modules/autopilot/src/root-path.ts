// The project root a host ticket is bound to (M39 F002). The service names a project by its
// registered folder, the Kit child by the root it resolved itself; on Windows the two may differ
// by the 8.3 short name (`C:\Users\RUNNER~1\…` against `C:\Users\runneradmin\…`), the case of the
// letters, the slashes and a trailing separator. The native realpath expands short names; on
// win32 the comparison also ignores case and separators. The platform is a parameter.
import { realpathSync } from 'node:fs';
import path from 'node:path';

/** The real path of a root: native realpath (expands 8.3 names on Windows), else the JS one, else the text. */
export function realRoot(root: string): string {
  try {
    return realpathSync.native(root);
  } catch {
    try {
      return realpathSync(root);
    } catch {
      return root;
    }
  }
}

/** The comparable form of a root on a platform. */
export function rootKey(root: string, platform: NodeJS.Platform = process.platform): string {
  const real = realRoot(root);
  if (platform !== 'win32') return path.posix.normalize(real).replace(/(.)\/+$/u, '$1');
  // `\\?\C:\…` of a long native path is the same folder as `C:\…`.
  const plain = real.replace(/^\\\\\?\\(?!UNC\\)/u, '');
  return path.win32.normalize(plain).replace(/(.)[\\/]+$/u, '$1').toLowerCase();
}

/** Whether two roots name the same project folder on the platform. */
export function sameRoot(left: string, right: string, platform: NodeJS.Platform = process.platform): boolean {
  return rootKey(left, platform) === rootKey(right, platform);
}
