import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/** A directory served under a URL prefix (the panel is mounted at "/"). */
export interface StaticMount {
  /** URL prefix starting and ending with "/". */
  prefix: string;
  /** Absolute directory with the files. */
  dir: string;
  /** File served for the bare prefix (default index.html). */
  index?: string;
}

/** Only these file types are served; source files such as .ts stay private. */
export const STATIC_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

/** A file found for a request path. */
export interface StaticFile {
  file: string;
  contentType: string;
  body: Buffer;
}

/** Validates and normalizes a mount; the longest prefix wins when several match. */
export function normalizeMount(mount: StaticMount): StaticMount {
  if (!mount.prefix.startsWith('/') || !mount.prefix.endsWith('/')) {
    throw new Error(`Static prefix must start and end with /: ${mount.prefix}`);
  }
  if (!path.isAbsolute(mount.dir)) throw new Error(`Static directory must be absolute: ${mount.dir}`);
  return { prefix: mount.prefix, dir: path.resolve(mount.dir), index: mount.index ?? 'index.html' };
}

/**
 * Finds the file for a decoded URL path among the mounts. Hidden segments, "..",
 * unknown extensions and paths outside the mount directory resolve to undefined.
 */
export async function findStaticFile(mounts: readonly StaticMount[], urlPath: string): Promise<StaticFile | undefined> {
  const sorted = [...mounts].sort((a, b) => b.prefix.length - a.prefix.length);
  const mount = sorted.find((m) => urlPath.startsWith(m.prefix));
  if (!mount) return undefined;
  let relative = urlPath.slice(mount.prefix.length);
  if (relative === '') relative = mount.index ?? 'index.html';
  const segments = relative.split('/');
  if (segments.some((s) => s === '' || s.startsWith('.') || s.includes('\\') || s.includes('\0'))) return undefined;
  const contentType = STATIC_TYPES[path.extname(relative).toLowerCase()];
  if (!contentType) return undefined;
  const file = path.resolve(mount.dir, ...segments);
  if (!file.startsWith(mount.dir + path.sep)) return undefined;
  try {
    const info = await stat(file);
    if (!info.isFile()) return undefined;
    return { file, contentType, body: await readFile(file) };
  } catch {
    return undefined;
  }
}
