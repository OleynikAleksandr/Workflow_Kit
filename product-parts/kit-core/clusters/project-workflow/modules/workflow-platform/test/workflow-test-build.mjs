// Test support for the project-workflow cluster: transpiles the TypeScript
// sources of every cluster module into a temporary directory that keeps the
// `<module>/src/*.js` layout, so relative `.js` imports between modules
// resolve. The module list names the modules a test needs; all cluster
// modules are compiled so transitive imports always resolve.
import { readdirSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const MODULES_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const TS_SOURCE_PATTERN = /\.ts$/u;

function transpile(file) {
  return ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

function clusterModules(requested) {
  const present = readdirSync(MODULES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  return [...new Set([...requested, ...present])];
}

export async function buildWorkflowModules(modules, label = "workflow") {
  const buildRoot = path.join(process.cwd(), ".harness", "runtime");
  await mkdir(buildRoot, { recursive: true });
  const directory = await mkdtemp(path.join(buildRoot, `${label}-test-`));
  for (const moduleId of clusterModules(modules)) {
    const sourceDirectory = path.join(MODULES_ROOT, moduleId, "src");
    const targetDirectory = path.join(directory, moduleId, "src");
    await mkdir(targetDirectory, { recursive: true });
    for (const entry of readdirSync(sourceDirectory)) {
      if (TS_SOURCE_PATTERN.test(entry)) {
        await writeFile(
          path.join(targetDirectory, entry.replace(TS_SOURCE_PATTERN, ".js")),
          transpile(path.join(sourceDirectory, entry)),
          "utf8"
        );
      }
    }
  }
  return {
    directory,
    load: (moduleId, file) =>
      import(pathToFileURL(path.join(directory, moduleId, "src", file)).href),
    cleanup: () => rm(directory, { force: true, recursive: true }),
  };
}
