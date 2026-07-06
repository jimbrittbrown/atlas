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
  $SummaryPath = Join-Path $EvidenceRoot "credential-operations-summary.json"
}

$resolvedSummary = (Resolve-Path -LiteralPath $SummaryPath).Path
$resolvedEvidenceRoot = if ([string]::IsNullOrWhiteSpace($EvidenceRoot)) {
  Split-Path -Parent $resolvedSummary
}
else {
  (Resolve-Path -LiteralPath $EvidenceRoot).Path
}

$requiredFiles = @(
  "credential-operations-summary.json",
  "host-evidence.json",
  "rotation-scenario.json",
  "revocation-scenario.json",
  "direct-recovery-coverage.json"
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
  $hostEvidence = Get-Content -LiteralPath (Join-Path $resolvedEvidenceRoot "host-evidence.json") -Raw | ConvertFrom-Json
  $rotation = Get-Content -LiteralPath (Join-Path $resolvedEvidenceRoot "rotation-scenario.json") -Raw | ConvertFrom-Json
  $revocation = Get-Content -LiteralPath (Join-Path $resolvedEvidenceRoot "revocation-scenario.json") -Raw | ConvertFrom-Json
  $recoveryCoverageRaw = Get-Content -LiteralPath (Join-Path $resolvedEvidenceRoot "direct-recovery-coverage.json") -Raw | ConvertFrom-Json
  $recoveryCoverage = if ($recoveryCoverageRaw -is [System.Array]) {
    $recoveryCoverageRaw
  }
  else {
    @($recoveryCoverageRaw)
  }

  if ($summary.classesCovered -ne 6) {
    $errors += "expected classesCovered=6 but found $($summary.classesCovered)"
  }
  if ($rotation.result -ne "PASS") {
    $errors += "rotation scenario did not PASS"
  }
  if ($revocation.result -ne "PASS") {
    $errors += "revocation scenario did not PASS"
  }
  if ($recoveryCoverage.Count -ne 6) {
    $errors += "expected 6 direct recovery coverage entries but found $($recoveryCoverage.Count)"
  }
  if (-not $hostEvidence.atlasRepo.path) {
    $errors += "host evidence missing atlasRepo.path"
  }
  if (-not $hostEvidence.openClawRepo.path) {
    $errors += "host evidence missing openClawRepo.path"
  }
}

Write-Output "Credential operations drill validation"
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
Write-Output "PASS: credential operations drill evidence package is structurally complete."
exit 0