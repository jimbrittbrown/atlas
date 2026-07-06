param(
  [string]$SourceRepoPath = ".",
  [string]$LabRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$resolvedSource = (Resolve-Path -LiteralPath $SourceRepoPath).Path
if (-not (Test-Path -LiteralPath (Join-Path $resolvedSource ".git"))) {
  throw "Source path is not a git repository: $resolvedSource"
}

$timestamp = [DateTimeOffset]::UtcNow.ToString("yyyyMMddTHHmmssZ")
if ([string]::IsNullOrWhiteSpace($LabRoot)) {
  $parent = Split-Path -Parent $resolvedSource
  $LabRoot = Join-Path $parent "ecp-002-restore-drill-$timestamp"
}

$backupDir = Join-Path $LabRoot "backup"
$restoreDir = Join-Path $LabRoot "restored-atlas-repo"
$evidenceDir = Join-Path $LabRoot "evidence"
$bundlePath = Join-Path $backupDir "atlas-repo.bundle"
$summaryPath = Join-Path $evidenceDir "restore-drill-summary.json"
$artifactValidationPath = Join-Path $evidenceDir "validate-recovery-critical-artifacts.txt"
$runtimeValidationPath = Join-Path $evidenceDir "validate-runtime-state-restoration-inventory.txt"

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null

Push-Location $resolvedSource
try {
  $sourceHead = (& git rev-parse HEAD).Trim()
  $sourceBranch = (& git branch --show-current).Trim()
  $tagCount = @(& git tag).Count

  $backupTimestamp = [DateTimeOffset]::UtcNow
  & git bundle create $bundlePath --all | Out-Null

  $restoreStart = [DateTimeOffset]::UtcNow
  & git clone $bundlePath $restoreDir | Out-Null
  $restoreEnd = [DateTimeOffset]::UtcNow
}
finally {
  Pop-Location
}

Push-Location $restoreDir
try {
  $restoredHead = (& git rev-parse HEAD).Trim()
  $restoredTagCount = @(& git tag).Count

  $artifactOutput = & powershell -ExecutionPolicy Bypass -File .\tools\validate-recovery-critical-artifacts.ps1 -RequireHead 2>&1
  $artifactOutput | Out-File -FilePath $artifactValidationPath -Encoding utf8
  $artifactExit = $LASTEXITCODE

  $runtimeOutput = & powershell -ExecutionPolicy Bypass -File .\tools\validate-runtime-state-restoration-inventory.ps1 2>&1
  $runtimeOutput | Out-File -FilePath $runtimeValidationPath -Encoding utf8
  $runtimeExit = $LASTEXITCODE
}
finally {
  Pop-Location
}

$summary = [PSCustomObject]@{
  generatedAt = [DateTimeOffset]::UtcNow.ToString("o")
  sourceRepoPath = $resolvedSource
  sourceBranch = $sourceBranch
  sourceHead = $sourceHead
  backupTimestamp = $backupTimestamp.ToString("o")
  restoreStart = $restoreStart.ToString("o")
  restoreEnd = $restoreEnd.ToString("o")
  restoreDurationSeconds = [Math]::Round(($restoreEnd - $restoreStart).TotalSeconds, 2)
  bundlePath = $bundlePath
  restoreDir = $restoreDir
  sourceTagCount = $tagCount
  restoredHead = $restoredHead
  restoredTagCount = $restoredTagCount
  headsMatch = ($sourceHead -eq $restoredHead)
  recoveryArtifactValidation = [PSCustomObject]@{
    exitCode = $artifactExit
    outputPath = $artifactValidationPath
  }
  runtimeStateInventoryValidation = [PSCustomObject]@{
    exitCode = $runtimeExit
    outputPath = $runtimeValidationPath
  }
}

$summary | ConvertTo-Json -Depth 5 | Out-File -FilePath $summaryPath -Encoding utf8

Write-Host "Restore drill execution"
Write-Host "Lab root: $LabRoot"
Write-Host "Source HEAD: $sourceHead"
Write-Host "Restored HEAD: $restoredHead"
Write-Host "Heads match: $($summary.headsMatch)"
Write-Host "Restore duration seconds: $($summary.restoreDurationSeconds)"
Write-Host "Artifact validation exit code: $artifactExit"
Write-Host "Runtime-state inventory validation exit code: $runtimeExit"
Write-Host "Summary: $summaryPath"

if (-not $summary.headsMatch) {
  exit 1
}

if ($artifactExit -ne 0 -or $runtimeExit -ne 0) {
  exit 1
}

exit 0