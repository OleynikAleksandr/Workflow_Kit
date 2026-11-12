// The vendored Kit bundle matches its sources (spec M22 section 2.5): a change of
// product-parts/kit-core without `npm run build:kit` fails here, on every OS.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { KIT_SHA256, KIT_SOURCE_DIGEST, KIT_VERSION, vendorBundleFile } from '#kit-bundle';
import { BUNDLE_MODULE, KIT_MODULES, buildKitBundle, foreignImports, kitSourceDigest, kitSourceFiles, metaText, provenanceText, readKitVersion, smokeBundle } from '../kit-build.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const stale = 'the vendored Kit bundle is stale: run npm run build:kit';

test('the Kit version, the source digest and the bundle hash match the vendored bundle', async () => {
  assert.equal(readKitVersion(root), KIT_VERSION, stale);
  assert.equal(kitSourceDigest(root), KIT_SOURCE_DIGEST, stale);
  const bundle = await buildKitBundle(root);
  assert.equal(bundle.sha256, KIT_SHA256, stale);
  assert.equal(path.basename(vendorBundleFile()), `workflow-kit-${KIT_VERSION}.mjs.gz`);
  const provenance = readFileSync(path.join(root, ...BUNDLE_MODULE.split('/'), 'vendor', 'PROVENANCE'), 'utf8');
  assert.equal(provenance, provenanceText(KIT_VERSION, bundle, KIT_SOURCE_DIGEST));
  const meta = readFileSync(path.join(root, ...BUNDLE_MODULE.split('/'), 'src', 'bundle-meta.ts'), 'utf8');
  assert.equal(meta.replace(/\r\n/g, '\n'), metaText(KIT_VERSION, bundle, KIT_SOURCE_DIGEST));
});

test('the sources are the src files of the Kit modules, sorted by POSIX path', () => {
  const files = kitSourceFiles(root);
  assert.ok(files.length > 90, `${files.length} files`);
  assert.deepEqual(files, [...files].sort());
  for (const file of files) assert.match(file, new RegExp(`^${KIT_MODULES}/workflow-[a-z-]+/src/[^/]+\\.ts$`));
});

test('only Node built-ins may be imported by the bundle', () => {
  const text = ['import { readFileSync } from "node:fs";', 'import path from "node:path";', 'import lodash from "lodash";', 'export { x } from "./local.js";', 'const m = await import("chalk");', ''].join('\n');
  assert.deepEqual(foreignImports(text), ['./local.js', 'chalk', 'lodash']);
  assert.deepEqual(foreignImports('import { a } from "node:url";\n'), []);
});

test('the smoke run installs the bundle into a git project and runs it there; win32 runs the installed runtime with node', async () => {
  const bundle = await buildKitBundle(root);
  assert.deepEqual(smokeBundle(bundle.text, 'win32'), []);
  assert.deepEqual(smokeBundle(bundle.text), []);
  assert.notDeepEqual(smokeBundle('process.exit(3);\n', 'win32'), []);
});
