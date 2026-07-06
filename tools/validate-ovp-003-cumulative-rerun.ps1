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
  $SummaryPath = Join-Path $EvidenceRoot "ovp-003-cumulative-rerun-summary.json"
}

$resolvedSummary = (Resolve-Path -LiteralPath $SummaryPath).Path
$resolvedEvidenceRoot = if ([string]::IsNullOrWhiteSpace($EvidenceRoot)) {
  Split-Path -Parent $resolvedSummary
}
else {
  (Resolve-Path -LiteralPath $EvidenceRoot).Path
}

$requiredFiles = @(
  "ovp-003-cumulative-rerun-summary.json",
  "cumulative-rerun-inputs.json",
  "scenario-results.json"
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
  $inputs = Get-Content -LiteralPath (Join-Path $resolvedEvidenceRoot "cumulative-rerun-inputs.json") -Raw | ConvertFrom-Json
  $scenarioResultsRaw = Get-Content -LiteralPath (Join-Path $resolvedEvidenceRoot "scenario-results.json") -Raw | ConvertFrom-Json
  $scenarioResults = if ($scenarioResultsRaw -is [System.Array]) { $scenarioResultsRaw } else { @($scenarioResultsRaw) }

  if ($summary.scenarioCount -ne 9) {
    $errors += "expected scenarioCount=9 but found $($summary.scenarioCount)"
  }
  if ($scenarioResults.Count -ne 9) {
    $errors += "expected 9 scenario results but found $($scenarioResults.Count)"
  }
  if (-not $inputs.atlasRepo.path) {
    $errors += "inputs missing atlasRepo.path"
  }
  if (-not $inputs.openClawRepo.path) {
    $errors += "inputs missing openClawRepo.path"
  }
  if ($summary.ecrR4RecommendedStatus -ne "CLOSE") {
    $errors += "unexpected ECR-R4 recommendation: $($summary.ecrR4RecommendedStatus)"
  }
}

Write-Output "OVP-003 cumulative rerun validation"
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
Write-Output "PASS: OVP-003 cumulative rerun evidence package is structurally complete."
exit 0