# Managed by Harness Workflow Kit. Do not edit.
$ErrorActionPreference = 'Stop'
$root = (& git rev-parse --show-toplevel 2>$null)
if (-not $root) { $root = Split-Path -Parent $PSScriptRoot }
$kit = Join-Path $root '.harness/workflow/runtime/workflow.mjs'
function Test-Runtime([string]$Path, [string]$Mode) {
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return $false }
  if ($Mode -eq 'electron') { $env:ELECTRON_RUN_AS_NODE = '1' } else { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
  & $Path -e "process.exit(Number(process.versions.node.split('.')[0])>=22?0:1)" 2>$null | Out-Null
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
[Console]::Error.WriteLine('Workflow Kit needs Node.js 22+ (or open the project in Harness AI once).')
exit 127
