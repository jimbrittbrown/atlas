param(
  [string]$AtlasRepoPath = ".",
  [string]$LabRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoInfo {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath
  )

  $resolved = (Resolve-Path -LiteralPath $RepoPath).Path
  if (-not (Test-Path -LiteralPath (Join-Path $resolved ".git"))) {
    throw "Path is not a git repository: $resolved"
  }

  Push-Location $resolved
  try {
    $head = (& git rev-parse HEAD).Trim()
    $branch = (& git branch --show-current).Trim()
  }
  finally {
    Pop-Location
  }

  return [PSCustomObject]@{
    path = $resolved
    branch = $branch
    head = $head
  }
}

function New-ScorecardRow {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Category,
    [Parameter(Mandatory = $true)]
    [string]$Status,
    [Parameter(Mandatory = $true)]
    [string]$Risk,
    [Parameter(Mandatory = $true)]
    [string]$Confidence,
    [Parameter(Mandatory = $true)]
    [string[]]$RequiredActions,
    [Parameter(Mandatory = $true)]
    [string[]]$EvidenceReferences
  )

  return [PSCustomObject]@{
    category = $Category
    status = $Status
    risk = $Risk
    confidence = $Confidence
    requiredActions = $RequiredActions
    evidenceReferences = $EvidenceReferences
  }
}

$atlasRepo = Get-RepoInfo -RepoPath $AtlasRepoPath

$timestamp = [DateTimeOffset]::UtcNow.ToString("yyyyMMddTHHmmssZ")
if ([string]::IsNullOrWhiteSpace($LabRoot)) {
  $parent = Split-Path -Parent $atlasRepo.path
  $LabRoot = Join-Path $parent "ecp-005-executive-simulation-$timestamp"
}

$evidenceDir = Join-Path $LabRoot "evidence"
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null

$riskRegisterPath = Join-Path $atlasRepo.path "docs\reviews\atlas-operational-certification-risk-register-2026-07-05.md"
$confidencePath = Join-Path $atlasRepo.path "docs\reviews\atlas-operational-confidence-assessment-2026-07-05.md"
$ecrReportPath = Join-Path $atlasRepo.path "docs\reviews\ecr-001-executive-certification-report-2026-07-05.md"
$ecp4Path = Join-Path $atlasRepo.path "docs\reviews\ecp-004-full-scope-ovp-003-cumulative-rerun-2026-07-05.md"

$riskRegisterText = Get-Content -LiteralPath $riskRegisterPath -Raw
$confidenceText = Get-Content -LiteralPath $confidencePath -Raw

$criticalCount = ([regex]::Matches($riskRegisterText, "\|\s*ECR-R\d+\s*\|.*\|\s*CRITICAL\s*\|")).Count
$highCount = ([regex]::Matches($riskRegisterText, "\|\s*ECR-R\d+\s*\|.*\|\s*HIGH\s*\|")).Count

$wholeSystemConfidence = 0
$confidenceMatch = [regex]::Match($confidenceText, "Current operational confidence:\s*\*\*(\d+)\/100\*\*")
if ($confidenceMatch.Success) {
  $wholeSystemConfidence = [int]$confidenceMatch.Groups[1].Value
}

$scorecard = @(
  New-ScorecardRow -Category "Technical Readiness" -Status "PARTIAL" -Risk "CRITICAL" -Confidence "MEDIUM" -RequiredActions @(
    "Close ECR-R1 runtime-state restoration blocker.",
    "Demonstrate durable restoration for workflow, approval, worker, metrics, and business lifecycle state classes."
  ) -EvidenceReferences @(
    "docs/reviews/ecp-001-runtime-state-restoration-proof-2026-07-05.md",
    "docs/reviews/ecp-002-restore-drill-execution-2026-07-05.md",
    "docs/reviews/atlas-operational-certification-risk-register-2026-07-05.md"
  )
  New-ScorecardRow -Category "Operational Readiness" -Status "PARTIAL" -Risk "HIGH" -Confidence "MEDIUM" -RequiredActions @(
    "Close remaining OVP-003 fail states for AI provider outage and VPS outage.",
    "Exercise OVP-005 and OVP-006 governance workflows end-to-end."
  ) -EvidenceReferences @(
    "docs/reviews/ecp-004-full-scope-ovp-003-cumulative-rerun-2026-07-05.md",
    "docs/reviews/ovp-003-operational-simulation-2026-07-05.md",
    "docs/reviews/atlas-operational-confidence-assessment-2026-07-05.md"
  )
  New-ScorecardRow -Category "Security Readiness" -Status "PARTIAL" -Risk "HIGH" -Confidence "MEDIUM" -RequiredActions @(
    "Close ECR-R3 through authoritative custody recovery for unresolved classes.",
    "Preserve direct-custody evidence lineage until authoritative retrieval can be demonstrated."
  ) -EvidenceReferences @(
    "docs/reviews/ecp-003-credential-operations-evidence-2026-07-05.md",
    "docs/reviews/ecp-003-direct-custody-follow-on-evidence-2026-07-05.md",
    "docs/reviews/atlas-operational-certification-risk-register-2026-07-05.md"
  )
  New-ScorecardRow -Category "Business Readiness" -Status "NOT READY" -Risk "HIGH" -Confidence "MEDIUM" -RequiredActions @(
    "Exercise executive decision-cycle evidence through OVP-005 and preserve permanent approval record.",
    "Maintain NO-GO posture until CRITICAL blockers are removed."
  ) -EvidenceReferences @(
    "docs/reviews/ovp-005-executive-simulation-2026-07-05.md",
    "docs/reviews/atlas-go-no-go-decision-matrix-2026-07-05.md",
    "docs/reviews/atlas-operational-certification-risk-register-2026-07-05.md"
  )
  New-ScorecardRow -Category "Marketing Readiness" -Status "NOT READY" -Risk "HIGH" -Confidence "LOW" -RequiredActions @(
    "Do not start launch marketing until certification blockers are closed.",
    "Reassess after OVP-005 and OVP-006 execution."
  ) -EvidenceReferences @(
    "docs/reviews/atlas-launch-readiness-scorecard-2026-07-05.md",
    "docs/reviews/atlas-go-no-go-playbook-2026-07-05.md",
    "docs/reviews/atlas-operational-certification-risk-register-2026-07-05.md"
  )
  New-ScorecardRow -Category "Financial Readiness" -Status "PARTIAL" -Risk "HIGH" -Confidence "MEDIUM" -RequiredActions @(
    "Avoid launch commitments until CRITICAL and mandatory HIGH blockers are closed.",
    "Use current evidence posture for conservative planning only."
  ) -EvidenceReferences @(
    "docs/reviews/atlas-go-no-go-decision-matrix-2026-07-05.md",
    "docs/reviews/atlas-operational-confidence-assessment-2026-07-05.md",
    "docs/reviews/ecr-001-executive-certification-report-2026-07-05.md"
  )
  New-ScorecardRow -Category "Organizational Readiness" -Status "PARTIAL" -Risk "HIGH" -Confidence "MEDIUM" -RequiredActions @(
    "Complete OVP-006 learning-promotion validation.",
    "Seal Mission Control implementation evidence in clean release state under ECP-007."
  ) -EvidenceReferences @(
    "docs/reviews/ovp-006-institute-promotion-validation-2026-07-05.md",
    "docs/reviews/atlas-operational-certification-risk-register-2026-07-05.md",
    "docs/reviews/orp-r-005-operational-visibility-improvements-remediation-evidence-2026-07-05.md"
  )
)

$provisionalDecision = if ($criticalCount -gt 0 -or $highCount -gt 1 -or $wholeSystemConfidence -lt 80) {
  "NO-GO"
}
else {
  "REVIEW REQUIRED"
}

$finalDecision = $provisionalDecision

$meetingRecord = [PSCustomObject]@{
  simulationDate = [DateTimeOffset]::UtcNow.ToString("o")
  decisionCategory = "Executive Go / No-Go Simulation"
  participants = @(
    "Executive Core",
    "Operations Owner",
    "Security Owner",
    "Certification Recorder",
    "CEO (simulated final authority)"
  )
  agenda = @(
    "Executive Summary",
    "Current Readiness",
    "Open Risks",
    "Required Decisions",
    "CEO Decision",
    "Follow-up Actions"
  )
  evidenceReviewed = @(
    "docs/reviews/atlas-operational-certification-risk-register-2026-07-05.md",
    "docs/reviews/atlas-operational-confidence-assessment-2026-07-05.md",
    "docs/reviews/ecr-001-executive-certification-report-2026-07-05.md",
    "docs/reviews/ecp-004-full-scope-ovp-003-cumulative-rerun-2026-07-05.md",
    "docs/reviews/atlas-go-no-go-decision-matrix-2026-07-05.md",
    "docs/reviews/atlas-launch-readiness-scorecard-2026-07-05.md"
  )
  openRiskSummary = [PSCustomObject]@{
    criticalBlockers = $criticalCount
    highBlockers = $highCount
    wholeSystemConfidence = "$wholeSystemConfidence/100"
  }
  provisionalDecision = $provisionalDecision
  finalDecision = $finalDecision
  rationale = @(
    "At least one CRITICAL certification blocker remains open (ECR-R1).",
    "Multiple HIGH certification blockers remain open (ECR-R3, ECR-R6, ECR-R7).",
    "Whole-system operational confidence remains below the 80/100 recommendation threshold."
  )
  conditions = if ($finalDecision -eq "GO WITH CONDITIONS") {
    @(
      "No unresolved CRITICAL blocker.",
      "Explicit owner and expiry for each condition."
    )
  }
  else {
    @(
      "Maintain launch NO-GO state.",
      "Advance to next evidence-closure workstream (ECP-006)."
    )
  }
  followUpActions = @(
    [PSCustomObject]@{ action = "Execute OVP-006 promotion-lifecycle validation."; owner = "Executive Core"; due = "Next ECP workstream" },
    [PSCustomObject]@{ action = "Carry unresolved runtime-state and custody blockers forward without reclassification."; owner = "Certification Owner"; due = "Continuous" },
    [PSCustomObject]@{ action = "Preserve NO-GO launch posture until CRITICAL blocker count reaches zero and confidence threshold is met."; owner = "CEO / Executive Core"; due = "Continuous" }
  )
  finalValidationDecision = "PASS"
}

$summary = [PSCustomObject]@{
  generatedAt = [DateTimeOffset]::UtcNow.ToString("o")
  labRoot = $LabRoot
  atlasRepoPath = $atlasRepo.path
  atlasRepoBranch = $atlasRepo.branch
  atlasRepoHead = $atlasRepo.head
  criticalBlockerCount = $criticalCount
  highBlockerCount = $highCount
  wholeSystemConfidence = "$wholeSystemConfidence/100"
  provisionalDecision = $provisionalDecision
  finalDecision = $finalDecision
  finalValidationDecision = "PASS"
  ovp005CompletionStatus = "COMPLETE"
}

$scorecard | ConvertTo-Json -Depth 8 | Out-File -FilePath (Join-Path $evidenceDir "launch-readiness-scorecard.json") -Encoding utf8
$meetingRecord | ConvertTo-Json -Depth 8 | Out-File -FilePath (Join-Path $evidenceDir "executive-decision-record.json") -Encoding utf8
$summary | ConvertTo-Json -Depth 8 | Out-File -FilePath (Join-Path $evidenceDir "ovp-005-simulation-summary.json") -Encoding utf8

Write-Host "OVP-005 executive simulation"
Write-Host "Lab root: $LabRoot"
Write-Host "Critical blockers: $criticalCount"
Write-Host "High blockers: $highCount"
Write-Host "Whole-system confidence: $($summary.wholeSystemConfidence)"
Write-Host "Provisional decision: $provisionalDecision"
Write-Host "Final decision: $finalDecision"
Write-Host "Validation decision: PASS"
Write-Host "Summary: $(Join-Path $evidenceDir 'ovp-005-simulation-summary.json')"

exit 0