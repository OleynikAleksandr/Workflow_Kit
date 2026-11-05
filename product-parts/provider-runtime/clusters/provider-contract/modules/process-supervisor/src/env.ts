// Environment of child processes (D5): variables of the parent Claude session (CLAUDE*) are removed,
// otherwise a nested `claude` reports "Transcript saving is off".

/** Prefixes of variables removed from the environment of session and environment processes. */
export const STRIPPED_ENV_PREFIXES: readonly string[] = ['CLAUDE'];

/**
 * Returns a copy of env without variables whose names start with one of the prefixes
 * (case-insensitive on Windows) and without undefined values; extra is merged first.
 */
export function cleanEnv(
  env: Readonly<Record<string, string | undefined>>,
  options: { prefixes?: readonly string[]; extra?: Readonly<Record<string, string | undefined>>; platform?: NodeJS.Platform } = {},
): Record<string, string> {
  const prefixes = options.prefixes ?? STRIPPED_ENV_PREFIXES;
  const insensitive = (options.platform ?? process.platform) === 'win32';
  const strip = (name: string): boolean =>
    prefixes.some((prefix) => (insensitive ? name.toUpperCase().startsWith(prefix.toUpperCase()) : name.startsWith(prefix)));
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...env, ...options.extra })) {
    if (value !== undefined && !strip(key)) result[key] = value;
  }
  return result;
}
