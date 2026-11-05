import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { PANEL_ASSETS_DIR } from '#panel-shell';
import { PROVIDER_CARDS_ASSETS_DIR, PROVIDER_CARDS_PREFIX, providerCardsMount } from '../src/index.ts';

const FILES = ['provider-cards.js', 'model.js', 'card-model.js', 'render.js', 'provider-cards.css'];

test('the provider cards files are mounted under /provider-cards/', async () => {
  assert.deepEqual(providerCardsMount(), { prefix: '/provider-cards/', dir: PROVIDER_CARDS_ASSETS_DIR });
  for (const name of FILES) assert.ok((await stat(path.join(PROVIDER_CARDS_ASSETS_DIR, name))).isFile(), name);
});

test('the panel shell loads the extension and its stylesheet', async () => {
  const app = await readFile(path.join(PANEL_ASSETS_DIR, 'app.js'), 'utf8');
  assert.ok(app.includes(`'${PROVIDER_CARDS_PREFIX}provider-cards.js'`));
  const html = await readFile(path.join(PANEL_ASSETS_DIR, 'index.html'), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="provider-cards\/provider-cards.css"/);
});

test('the cards know no particular provider and never use innerHTML', async () => {
  for (const name of FILES.filter((f) => f.endsWith('.js'))) {
    const source = await readFile(path.join(PROVIDER_CARDS_ASSETS_DIR, name), 'utf8');
    assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML/, name);
    assert.doesNotMatch(source, /['"](claude|codex)['"]/i, `${name} has no provider-specific code`);
    // Browser files import only their neighbours: the shell's helpers are injected by install().
    for (const match of source.matchAll(/^import .* from '([^']+)';$/gm)) assert.match(match[1] ?? '', /^\.\/[a-z-]+\.js$/, name);
  }
  const entry = await readFile(path.join(PROVIDER_CARDS_ASSETS_DIR, 'provider-cards.js'), 'utf8');
  assert.match(entry, /export function install\(shell\)/);
  assert.match(entry, /registerCardGroup\(/);
});
