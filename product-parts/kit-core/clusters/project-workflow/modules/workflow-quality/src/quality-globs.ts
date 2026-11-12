const PLACEHOLDER_PATTERN = /\{([a-z]+)\}/gu;
const LEADING_PLACEHOLDER = /^\{([a-z]+)\}/u;
const SPECIAL_PATTERN = /[|\\{}()[\]^$+?.]/gu;

const compiled = new Map<string, { names: string[]; regex: RegExp }>();

function compile(pattern: string): { names: string[]; regex: RegExp } {
  const cached = compiled.get(pattern);
  if (cached) {
    return cached;
  }
  const names: string[] = [];
  let source = "";
  let index = 0;
  while (index < pattern.length) {
    const rest = pattern.slice(index);
    const placeholder = LEADING_PLACEHOLDER.exec(rest);
    if (placeholder?.[1]) {
      names.push(placeholder[1]);
      source += "([^/]+)";
      index += placeholder[0].length;
    } else if (rest.startsWith("**/")) {
      source += "(?:.*/)?";
      index += 3;
    } else if (rest.startsWith("**")) {
      source += ".*";
      index += 2;
    } else if (rest.startsWith("*")) {
      source += "[^/]*";
      index += 1;
    } else {
      source += (pattern[index] ?? "").replace(SPECIAL_PATTERN, "\\$&");
      index += 1;
    }
  }
  const result = { names, regex: new RegExp(`^${source}$`, "u") };
  compiled.set(pattern, result);
  return result;
}

/**
 * Matches a canonical path against a glob with `*`, `**` and `{name}`
 * captures (one path segment each). Returns the captures, or null.
 */
export function matchGlob(
  pattern: string,
  value: string
): Record<string, string> | null {
  const { names, regex } = compile(pattern);
  const match = regex.exec(value);
  if (!match) {
    return null;
  }
  return Object.fromEntries(
    names.map((name, index) => [name, match[index + 1] ?? ""])
  );
}

export function matchesAny(
  patterns: readonly string[],
  value: string
): boolean {
  return patterns.some((pattern) => matchGlob(pattern, value) !== null);
}

export function fillPlaceholders(
  template: string,
  values: Record<string, string>
): string {
  return template.replace(
    PLACEHOLDER_PATTERN,
    (whole, name: string) => values[name] ?? whole
  );
}
