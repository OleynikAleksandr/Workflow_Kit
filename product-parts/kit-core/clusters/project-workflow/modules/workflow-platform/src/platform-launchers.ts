/** Project-relative location of the bundled Workflow Kit inside a project. */
export const KIT_BUNDLE_PATH = ".harness/workflow/runtime/workflow.mjs";
const MISSING_RUNTIME_MESSAGE =
  "Workflow Kit needs Node.js 22+ (or open the project in Harness AI once).";
const VERSION_CHECK =
  "process.exit(Number(process.versions.node.split('.')[0])>=22?0:1)";

/** POSIX sh launcher (`scripts/workflow`); also used by Git for Windows hooks. */
export function posixLauncher(): string {
  return `#!/bin/sh
# Managed by Harness Workflow Kit. Do not edit.
set -eu
root=$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/.." && pwd))
kit="$root/${KIT_BUNDLE_PATH}"
try_runtime() {
  candidate=$1
  mode=$2
  shift 2
  [ -n "$candidate" ] && [ -x "$candidate" ] || return 1
  if [ "$mode" = electron ]; then
    ELECTRON_RUN_AS_NODE=1 "$candidate" -e "${VERSION_CHECK}" >/dev/null 2>&1 || return 1
    ELECTRON_RUN_AS_NODE=1 exec "$candidate" "$kit" "$@"
  fi
  env -u ELECTRON_RUN_AS_NODE "$candidate" -e "${VERSION_CHECK}" >/dev/null 2>&1 || return 1
  exec env -u ELECTRON_RUN_AS_NODE "$candidate" "$kit" "$@"
}
if [ -n "\${HARNESS_WORKFLOW_NODE:-}" ]; then
  try_runtime "$HARNESS_WORKFLOW_NODE" node "$@" || true
fi
runtime_file="$root/.harness/workflow/local/runtime"
if [ -f "$runtime_file" ]; then
  try_runtime "$(sed -n 1p "$runtime_file")" "$(sed -n 2p "$runtime_file")" "$@" || true
fi
try_runtime "$(command -v node 2>/dev/null || true)" node "$@" || true
for candidate in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
  try_runtime "$candidate" node "$@" || true
done
echo "${MISSING_RUNTIME_MESSAGE}" >&2
exit 127
`;
}

/** PowerShell launcher (`scripts/workflow.ps1`). */
export function powershellLauncher(): string {
  return `# Managed by Harness Workflow Kit. Do not edit.
$ErrorActionPreference = 'Stop'
$root = (& git rev-parse --show-toplevel 2>$null)
if (-not $root) { $root = Split-Path -Parent $PSScriptRoot }
$kit = Join-Path $root '${KIT_BUNDLE_PATH}'
function Test-Runtime([string]$Path, [string]$Mode) {
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return $false }
  if ($Mode -eq 'electron') { $env:ELECTRON_RUN_AS_NODE = '1' } else { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
  & $Path -e "${VERSION_CHECK}" 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}
$candidates = @()
if ($env:HARNESS_WORKFLOW_NODE) { $candidates += ,@($env:HARNESS_WORKFLOW_NODE, 'node') }
$runtimeFile = Join-Path $root '.harness/workflow/local/runtime'
if (Test-Path -LiteralPath $runtimeFile) {
  $lines = @(Get-Content -LiteralPath $runtimeFile)
  $mode = if ($lines.Count -gt 1) { $lines[1] } else { 'node' }
  $candidates += ,@($lines[0], $mode)
}
$onPath = Get-Command node -ErrorAction SilentlyContinue
if ($onPath) { $candidates += ,@($onPath.Source, 'node') }
$candidates += ,@((Join-Path $env:ProgramFiles 'nodejs/node.exe'), 'node')
foreach ($candidate in $candidates) {
  if (Test-Runtime $candidate[0] $candidate[1]) {
    & $candidate[0] $kit @args
    exit $LASTEXITCODE
  }
}
[Console]::Error.WriteLine('${MISSING_RUNTIME_MESSAGE}')
exit 127
`;
}

/** CMD launcher (`scripts/workflow.cmd`): delegates to the PowerShell launcher. */
export function cmdLauncher(): string {
  return [
    "@echo off",
    "rem Managed by Harness Workflow Kit. Do not edit.",
    'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0workflow.ps1" %*',
    "exit /b %ERRORLEVEL%",
    "",
  ].join("\r\n");
}
