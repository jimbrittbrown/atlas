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
  $SummaryPath = Join-Path $EvidenceRoot "ovp-006-simulation-summary.json"
}

$resolvedSummary = (Resolve-Path -LiteralPath $SummaryPath).Path
$resolvedEvidenceRoot = if ([string]::IsNullOrWhiteSpace($EvidenceRoot)) {
  Split-Path -Parent $resolvedSummary
}
else {
  (Resolve-Path -LiteralPath $EvidenceRoot).Path
}

$requiredFiles = @(
  "ovp-006-simulation-summary.json",
  "promotion-item.json",
  "lifecycle-record.json",
  "governance-approval-record.json"
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
  $lifecycleRaw = Get-Content -LiteralPath (Join-Path $resolvedEvidenceRoot "lifecycle-record.json") -Raw | ConvertFrom-Json
  $lifecycle = if ($lifecycleRaw -is [System.Array]) { $lifecycleRaw } else { @($lifecycleRaw) }
  $approval = Get-Content -LiteralPath (Join-Path $resolvedEvidenceRoot "governance-approval-record.json") -Raw | ConvertFrom-Json

  $requiredStages = @("Observation", "Experiment", "Validated", "Recommended", "Best Practice", "Atlas Standard")
  foreach ($stage in $requiredStages) {
    if (-not (@($lifecycle | Select-Object -ExpandProperty stage) -contains $stage)) {
      $errors += "missing lifecycle stage: $stage"
    }
  }

  if ($summary.finalPromotionDecision -ne "APPROVED") {
    $errors += "expected final promotion decision APPROVED but found $($summary.finalPromotionDecision)"
  }
  if ([string]::IsNullOrWhiteSpace([string]$approval.governanceTriggerInvoked)) {
    $errors += "governance trigger is missing"
  }
  if ($summary.finalValidationDecision -ne "PASS") {
    $errors += "summary finalValidationDecision must be PASS"
  }
}

Write-Output "OVP-006 institute promotion validation package check"
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
Write-Output "PASS: OVP-006 promotion-validation evidence package is structurally complete."
exit 0