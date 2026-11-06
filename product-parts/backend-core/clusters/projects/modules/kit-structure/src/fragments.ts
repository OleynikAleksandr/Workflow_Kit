// Managed fragments of the Kit structure v2: how each one is found in its file and written.
import { createHash } from 'node:crypto';
import { HookConfigError, expectedKitHooksText, formatJson, kitHooksText, withKitHooks } from './hook-config.ts';
import { appendMarkedSection, findMarkedSection, normalizeEol, renderMarkedSection, replaceMarkedSection } from './markers.ts';
import {
  AGENTS_BEGIN,
  AGENTS_END,
  AGENTS_SECTION,
  CLAUDE_MD,
  CLUSTER_TEMPLATE,
  GITIGNORE_BEGIN,
  GITIGNORE_BLOCK,
  GITIGNORE_END,
  MODULE_TEMPLATE,
  PRODUCT_PARTS_README,
  PRODUCT_PART_TEMPLATE,
} from './templates.ts';
import type { HookClient } from './templates.ts';

/** Ids of the managed fragments, in report order. */
export type FragmentId =
  | 'agents-section'
  | 'claude-md'
  | 'claude-hook'
  | 'codex-hook'
  | 'gitignore-block'
  | 'product-parts-readme'
  | 'template-product-part'
  | 'template-cluster'
  | 'template-module';

/** How a fragment lives in its file. */
export type FragmentKind = 'section' | 'block' | 'hook' | 'file';

/** A fragment file Kit cannot read safely; installing is refused and nothing is written. */
export class FragmentError extends Error {
  readonly code: 'invalid-json' | 'bad-markers' | 'bad-shape';

  constructor(code: FragmentError['code'], message: string) {
    super(message);
    this.name = 'FragmentError';
    this.code = code;
  }
}

/** Definition of one managed fragment. */
export interface FragmentSpec {
  id: FragmentId;
  /** Path relative to the project root, with forward slashes. */
  path: string;
  kind: FragmentKind;
  /** Hashed in the manifest; false only for CLAUDE.md, which belongs to the user once created. */
  hashed: boolean;
  /** The normalized managed text Kit writes; its sha256 is the expected hash. */
  expected: string;
  /** The current managed text of the file, or undefined when the fragment is absent. */
  extract(fileText: string | undefined): string | undefined;
  /** New file text with the fragment written; text Kit does not manage is kept. */
  write(fileText: string | undefined): string;
}

/** sha256 of a managed text as lowercase hex. */
export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function markedSpec(id: FragmentId, file: string, kind: 'section' | 'block', begin: string, end: string, body: string): FragmentSpec {
  return {
    id,
    path: file,
    kind,
    hashed: true,
    expected: body,
    extract(text) {
      if (text === undefined) return undefined;
      const section = findMarkedSection(text, begin, end);
      if (section.kind === 'broken') throw new FragmentError('bad-markers', `${file}: ${section.reason}`);
      return section.kind === 'found' ? section.body : undefined;
    },
    write(text) {
      const rendered = renderMarkedSection(begin, end, body);
      if (text === undefined) return `${rendered}\n`;
      const section = findMarkedSection(text, begin, end);
      if (section.kind === 'broken') throw new FragmentError('bad-markers', `${file}: ${section.reason}`);
      return section.kind === 'found' ? replaceMarkedSection(text, section, rendered) : appendMarkedSection(text, rendered);
    },
  };
}

function parseJson(file: string, text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new FragmentError('invalid-json', `${file}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
}

function hookSpec(id: FragmentId, file: string, client: HookClient): FragmentSpec {
  const shapeError = (error: unknown): never => {
    if (error instanceof HookConfigError) throw new FragmentError('bad-shape', `${file}: ${error.message}`);
    throw error;
  };
  return {
    id,
    path: file,
    kind: 'hook',
    hashed: true,
    expected: expectedKitHooksText(client),
    extract(text) {
      if (text === undefined) return undefined;
      try {
        return kitHooksText(parseJson(file, text));
      } catch (error) {
        return shapeError(error);
      }
    },
    write(text) {
      try {
        const config = text === undefined ? undefined : parseJson(file, text);
        return formatJson(withKitHooks(config, client), text);
      } catch (error) {
        return shapeError(error);
      }
    },
  };
}

function fileSpec(id: FragmentId, file: string, content: string, hashed = true): FragmentSpec {
  return {
    id,
    path: file,
    kind: 'file',
    hashed,
    expected: content,
    extract: (text) => (text === undefined ? undefined : normalizeEol(text)),
    write: () => content,
  };
}

/** Path of product-parts/README.md, which is managed only when Kit created it. */
export const PRODUCT_PARTS_README_PATH = 'product-parts/README.md';

/** All fragments of the structure v2. */
export const FRAGMENTS: readonly FragmentSpec[] = [
  markedSpec('agents-section', 'AGENTS.md', 'section', AGENTS_BEGIN, AGENTS_END, AGENTS_SECTION),
  fileSpec('claude-md', 'CLAUDE.md', CLAUDE_MD, false),
  hookSpec('claude-hook', '.claude/settings.json', 'claude'),
  hookSpec('codex-hook', '.codex/hooks.json', 'codex'),
  markedSpec('gitignore-block', '.gitignore', 'block', GITIGNORE_BEGIN, GITIGNORE_END, GITIGNORE_BLOCK),
  fileSpec('product-parts-readme', PRODUCT_PARTS_README_PATH, PRODUCT_PARTS_README),
  fileSpec('template-product-part', '.workflow-kit/templates/product-part.md', PRODUCT_PART_TEMPLATE),
  fileSpec('template-cluster', '.workflow-kit/templates/cluster.md', CLUSTER_TEMPLATE),
  fileSpec('template-module', '.workflow-kit/templates/module.md', MODULE_TEMPLATE),
];
