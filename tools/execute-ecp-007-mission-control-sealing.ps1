param(
  [string]$OpenClawRepoPath = "C:\Atlas\Projects\openclaw",
  [string]$LabRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-GitRepo {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath
  )

  $resolved = (Resolve-Path -LiteralPath $RepoPath).Path
  if (-not (Test-Path -LiteralPath (Join-Path $resolved ".git"))) {
    throw "Path is not a git repository: $resolved"
  }
  return $resolved
}

function Invoke-GitText {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath,
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  Push-Location $RepoPath
  try {
    $output = (& git @Arguments) | Out-String
    return $output.Trim()
  }
  finally {
    Pop-Location
  }
}

function Invoke-NativeCapture {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath,
    [Parameter(Mandatory = $true)]
    [string]$Command
  )

  Push-Location $RepoPath
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $lines = & powershell -NoProfile -ExecutionPolicy Bypass -Command $Command 2>&1
    $exitCode = $LASTEXITCODE
    return [PSCustomObject]@{
      command = $Command
      exitCode = $exitCode
      output = @($lines | ForEach-Object { [string]$_ })
    }
  }
  finally {
    $ErrorActionPreference = $previous
    Pop-Location
  }
}

$openClawRepo = Resolve-GitRepo -RepoPath $OpenClawRepoPath
$timestamp = [DateTimeOffset]::UtcNow.ToString("yyyyMMddTHHmmssZ")
if ([string]::IsNullOrWhiteSpace($LabRoot)) {
  $parent = Split-Path -Parent $openClawRepo
  $LabRoot = Join-Path $parent "ecp-007-mission-control-sealing-$timestamp"
}

$evidenceRoot = Join-Path $LabRoot "evidence"
New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null

$head = Invoke-GitText -RepoPath $openClawRepo -Arguments @("rev-parse", "HEAD")
$branch = Invoke-GitText -RepoPath $openClawRepo -Arguments @("branch", "--show-current")
$headSubject = Invoke-GitText -RepoPath $openClawRepo -Arguments @("show", "-s", "--format=%s", $head)
$headTagsRaw = Invoke-GitText -RepoPath $openClawRepo -Arguments @("tag", "--points-at", $head)
$headTags = if ([string]::IsNullOrWhiteSpace($headTagsRaw)) { @() } else { @($headTagsRaw -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) }
$targetTags = @($headTags | Where-Object { $_ -like "ecp-007-mission-control-seal-*" })

$changedFilesRaw = Invoke-GitText -RepoPath $openClawRepo -Arguments @("show", "--name-only", "--pretty=format:", $head)
$changedFiles = @($changedFilesRaw -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

$requiredFiles = @(
  "ui/src/ui/views/overview-mission-control.ts",
  "ui/src/ui/views/overview.ts",
  "ui/src/ui/views/overview.render.test.ts",
  "ui/src/i18n/locales/en.ts"
)

$missingRequired = @()
foreach ($required in $requiredFiles) {
  if (-not ($changedFiles -contains $required)) {
    $missingRequired += $required
  }
}

$validation = Invoke-NativeCapture -RepoPath $openClawRepo -Command "node scripts/run-vitest.mjs ui/src/ui/views/overview.render.test.ts"

$sealRecord = [PSCustomObject]@{
  generatedAt = [DateTimeOffset]::UtcNow.ToString("o")
  openClawRepoPath = $openClawRepo
  openClawBranch = $branch
  sealedCommit = $head
  sealedCommitSubject = $headSubject
  headTags = $headTags
  matchingEcp007Tags = $targetTags
  changedFileCount = $changedFiles.Count
  changedFiles = $changedFiles
  requiredFiles = $requiredFiles
  missingRequiredFiles = $missingRequired
}

$validationRecord = [PSCustomObject]@{
  generatedAt = [DateTimeOffset]::UtcNow.ToString("o")
  command = $validation.command
  exitCode = $validation.exitCode
  output = $validation.output
  status = if ($validation.exitCode -eq 0) { "PASS" } else { "FAIL" }
}

$summary = [PSCustomObject]@{
  generatedAt = [DateTimeOffset]::UtcNow.ToString("o")
  labRoot = $LabRoot
  evidenceRoot = $evidenceRoot
  openClawSealedCommit = $head
  openClawSealedTag = if ($targetTags.Count -gt 0) { $targetTags[0] } else { "" }
  requiredFileCoverage = if ($missingRequired.Count -eq 0) { "PASS" } else { "FAIL" }
  focusedValidationStatus = $validationRecord.status
  finalSealingDecision = if ($missingRequired.Count -eq 0 -and $targetTags.Count -gt 0 -and $validation.exitCode -eq 0) { "SEALED" } else { "NOT SEALED" }
  finalValidationDecision = if ($missingRequired.Count -eq 0 -and $targetTags.Count -gt 0 -and $validation.exitCode -eq 0) { "PASS" } else { "FAIL" }
  ecp007CompletionStatus = if ($missingRequired.Count -eq 0 -and $targetTags.Count -gt 0 -and $validation.exitCode -eq 0) { "COMPLETE" } else { "INCOMPLETE" }
}

$sealRecord | ConvertTo-Json -Depth 8 | Out-File -FilePath (Join-Path $evidenceRoot "openclaw-seal-record.json") -Encoding utf8
$validationRecord | ConvertTo-Json -Depth 8 | Out-File -FilePath (Join-Path $evidenceRoot "focused-validation-record.json") -Encoding utf8
$summary | ConvertTo-Json -Depth 8 | Out-File -FilePath (Join-Path $evidenceRoot "ecp-007-mission-control-sealing-summary.json") -Encoding utf8

Write-Host "ECP-007 Mission Control implementation sealing"
Write-Host "Lab root: $LabRoot"
Write-Host "OpenClaw commit: $head"
Write-Host "OpenClaw matching tag count: $($targetTags.Count)"
Write-Host "Required file coverage: $($summary.requiredFileCoverage)"
Write-Host "Focused validation status: $($summary.focusedValidationStatus)"
Write-Host "Final sealing decision: $($summary.finalSealingDecision)"
Write-Host "Final validation decision: $($summary.finalValidationDecision)"
Write-Host "Summary: $(Join-Path $evidenceRoot 'ecp-007-mission-control-sealing-summary.json')"

if ($summary.finalValidationDecision -ne "PASS") {
  exit 1
}

exit 0