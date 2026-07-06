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
  $SummaryPath = Join-Path $EvidenceRoot "ovp-005-simulation-summary.json"
}

$resolvedSummary = (Resolve-Path -LiteralPath $SummaryPath).Path
$resolvedEvidenceRoot = if ([string]::IsNullOrWhiteSpace($EvidenceRoot)) {
  Split-Path -Parent $resolvedSummary
}
else {
  (Resolve-Path -LiteralPath $EvidenceRoot).Path
}

$requiredFiles = @(
  "ovp-005-simulation-summary.json",
  "launch-readiness-scorecard.json",
  "executive-decision-record.json"
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
  $scorecardRaw = Get-Content -LiteralPath (Join-Path $resolvedEvidenceRoot "launch-readiness-scorecard.json") -Raw | ConvertFrom-Json
  $scorecard = if ($scorecardRaw -is [System.Array]) { $scorecardRaw } else { @($scorecardRaw) }
  $decisionRecord = Get-Content -LiteralPath (Join-Path $resolvedEvidenceRoot "executive-decision-record.json") -Raw | ConvertFrom-Json

  if ($scorecard.Count -ne 7) {
    $errors += "expected 7 scorecard categories but found $($scorecard.Count)"
  }
  if ($summary.finalDecision -notin @("GO", "GO WITH CONDITIONS", "NO-GO", "REVIEW REQUIRED")) {
    $errors += "unexpected final decision: $($summary.finalDecision)"
  }
  if (-not $decisionRecord.participants) {
    $errors += "decision record missing participants"
  }
  if (-not $decisionRecord.evidenceReviewed) {
    $errors += "decision record missing evidenceReviewed"
  }
  if ($decisionRecord.finalValidationDecision -ne "PASS") {
    $errors += "decision record finalValidationDecision must be PASS"
  }
}

Write-Output "OVP-005 executive simulation validation"
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
Write-Output "PASS: OVP-005 executive simulation evidence package is structurally complete."
exit 0