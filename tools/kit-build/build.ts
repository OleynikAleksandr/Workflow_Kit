// npm run build:kit — builds the Kit bundle from product-parts/kit-core and vendors it into
// kit-bundle; `--check` only builds in memory and fails when the vendored bundle is stale.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildKitBundle, kitSourceDigest, readKitVersion, smokeBundle, writeBundleFiles } from './kit-build.ts';
import { KIT_SHA256, KIT_SOURCE_DIGEST, KIT_VERSION } from '#kit-bundle';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function main(args: string[]): Promise<number> {
  const check = args.includes('--check');
  const version = readKitVersion(root);
  const digest = kitSourceDigest(root);
  const bundle = await buildKitBundle(root);
  if (check) {
    const stale = [
      version !== KIT_VERSION ? `version ${version} ≠ ${KIT_VERSION}` : null,
      digest !== KIT_SOURCE_DIGEST ? 'the sources changed' : null,
      bundle.sha256 !== KIT_SHA256 ? 'the bundle differs' : null,
    ].filter((line): line is string => line !== null);
    if (stale.length > 0) {
      console.error(`kit-build: the vendored bundle is stale (${stale.join('; ')}). Run npm run build:kit.`);
      return 1;
    }
    console.log(`kit-build: Kit ${version} is up to date (${bundle.sha256.slice(0, 12)}).`);
    return 0;
  }
  const problems = smokeBundle(bundle.text);
  if (problems.length > 0) {
    console.error(`kit-build: the smoke run of the bundle failed:\n${problems.join('\n')}`);
    return 1;
  }
  const written = writeBundleFiles(root, version, bundle, digest);
  console.log(`kit-build: Kit ${version}, ${bundle.lines} lines, sha256 ${bundle.sha256}\n${written.join('\n')}`);
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
