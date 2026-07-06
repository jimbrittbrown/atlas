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
  $SummaryPath = Join-Path $EvidenceRoot "direct-custody-follow-on-summary.json"
}

$resolvedSummary = (Resolve-Path -LiteralPath $SummaryPath).Path
$resolvedEvidenceRoot = if ([string]::IsNullOrWhiteSpace($EvidenceRoot)) {
  Split-Path -Parent $resolvedSummary
}
else {
  (Resolve-Path -LiteralPath $EvidenceRoot).Path
}

$requiredFiles = @(
  "direct-custody-follow-on-summary.json",
  "host-direct-custody-evidence.json",
  "direct-custody-class-results.json"
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
  $hostEvidence = Get-Content -LiteralPath (Join-Path $resolvedEvidenceRoot "host-direct-custody-evidence.json") -Raw | ConvertFrom-Json
  $classResultsRaw = Get-Content -LiteralPath (Join-Path $resolvedEvidenceRoot "direct-custody-class-results.json") -Raw | ConvertFrom-Json
  $classResults = if ($classResultsRaw -is [System.Array]) {
    $classResultsRaw
  }
  else {
    @($classResultsRaw)
  }

  if ($summary.classesCovered -ne 6) {
    $errors += "expected classesCovered=6 but found $($summary.classesCovered)"
  }
  if ($classResults.Count -ne 6) {
    $errors += "expected 6 class results but found $($classResults.Count)"
  }
  if (-not $hostEvidence.atlasRepo.path) {
    $errors += "host evidence missing atlasRepo.path"
  }
  if (-not $hostEvidence.openClawRepo.path) {
    $errors += "host evidence missing openClawRepo.path"
  }
  if ($summary.ecrR3RecommendedStatus -notin @("CLOSE", "KEEP OPEN")) {
    $errors += "unexpected ECR-R3 recommendation: $($summary.ecrR3RecommendedStatus)"
  }
}

Write-Output "Direct custody recovery follow-on validation"
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
Write-Output "PASS: direct custody follow-on evidence package is structurally complete."
exit 0