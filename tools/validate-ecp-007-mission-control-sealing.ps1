param(
  [string]$SummaryPath = "",
  [string]$EvidenceRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($SummaryPath)) {
  if ([string]::IsNullOrWhiteSpace($EvidenceRoot)) {
    throw "Provide SummaryPath or EvidenceRoot."
  }
  $SummaryPath = Join-Path $EvidenceRoot "ecp-007-mission-control-sealing-summary.json"
}

$resolvedSummary = (Resolve-Path -LiteralPath $SummaryPath).Path
$resolvedEvidenceRoot = if ([string]::IsNullOrWhiteSpace($EvidenceRoot)) {
  Split-Path -Parent $resolvedSummary
}
else {
  (Resolve-Path -LiteralPath $EvidenceRoot).Path
}

$requiredFiles = @(
  "ecp-007-mission-control-sealing-summary.json",
  "openclaw-seal-record.json",
  "focused-validation-record.json"
)

$errors = @()
foreach ($file in $requiredFiles) {
  $candidate = Join-Path $resolvedEvidenceRoot $file
  if (-not (Test-Path -LiteralPath $candidate)) {
    $errors += "missing evidence file: $file"
  }
}

if ($errors.Count -eq 0) {
  $summary = Get-Content -LiteralPath $resolvedSummary -Raw | ConvertFrom-Json
  $sealRecord = Get-Content -LiteralPath (Join-Path $resolvedEvidenceRoot "openclaw-seal-record.json") -Raw | ConvertFrom-Json
  $validation = Get-Content -LiteralPath (Join-Path $resolvedEvidenceRoot "focused-validation-record.json") -Raw | ConvertFrom-Json

  if ([string]::IsNullOrWhiteSpace([string]$summary.openClawSealedCommit)) {
    $errors += "sealed commit hash is missing"
  }
  if ([string]::IsNullOrWhiteSpace([string]$summary.openClawSealedTag)) {
    $errors += "sealed tag is missing"
  }
  if ($summary.requiredFileCoverage -ne "PASS") {
    $errors += "required file coverage must be PASS"
  }
  if ($summary.focusedValidationStatus -ne "PASS") {
    $errors += "focused validation status must be PASS"
  }
  if ($summary.finalSealingDecision -ne "SEALED") {
    $errors += "final sealing decision must be SEALED"
  }
  if ($summary.finalValidationDecision -ne "PASS") {
    $errors += "final validation decision must be PASS"
  }
  if ($summary.ecp007CompletionStatus -ne "COMPLETE") {
    $errors += "ecp007 completion status must be COMPLETE"
  }
  if (@($sealRecord.missingRequiredFiles).Count -gt 0) {
    $errors += "seal record reports missing required files"
  }
  if ([int]$validation.exitCode -ne 0) {
    $errors += "focused validation command exit code must be 0"
  }
}

Write-Output "ECP-007 Mission Control sealing package check"
Write-Output "Summary: $resolvedSummary"
Write-Output "Evidence root: $resolvedEvidenceRoot"
Write-Output "Required files: $($requiredFiles.Count)"
Write-Output "Errors: $($errors.Count)"

if ($errors.Count -gt 0) {
  Write-Output ""
  Write-Output "Failures:"
  $errors | ForEach-Object { Write-Output "- $_" }
  exit 1
}

Write-Output ""
Write-Output "PASS: ECP-007 Mission Control sealing evidence package is structurally complete."
exit 0