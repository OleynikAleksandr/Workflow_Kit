// Git hooks export repository-local variables. The suite creates foreign repos;
// never let their git commands inherit the hook's index/worktree/object database.
import { spawnSync } from 'node:child_process';
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (key.startsWith('GIT_') || key === 'HARNESS_WORKFLOW_ROOT') delete env[key];
}
const suites = [
  ['product-parts/**/test/*.test.ts', 'tools/platform-guard/test/*.test.ts'],
  ['product-parts/**/test/*.test.mjs', 'tools/kit-build/test/*.test.ts'],
];
for (const files of suites) {
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=4', ...files], { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
