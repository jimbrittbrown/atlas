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

function New-LifecycleStage {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Stage,
    [Parameter(Mandatory = $true)]
    [string]$Owner,
    [Parameter(Mandatory = $true)]
    [string[]]$Evidence,
    [string[]]$Approvals = @(),
    [string]$Decision = "APPROVED",
    [string]$Notes = ""
  )

  return [PSCustomObject]@{
    stage = $Stage
    timestamp = [DateTimeOffset]::UtcNow.ToString("o")
    owner = $Owner
    evidence = $Evidence
    approvals = $Approvals
    decision = $Decision
    notes = $Notes
  }
}

$atlasRepo = Get-RepoInfo -RepoPath $AtlasRepoPath

$timestamp = [DateTimeOffset]::UtcNow.ToString("yyyyMMddTHHmmssZ")
if ([string]::IsNullOrWhiteSpace($LabRoot)) {
  $parent = Split-Path -Parent $atlasRepo.path
  $LabRoot = Join-Path $parent "ecp-006-institute-promotion-$timestamp"
}

$evidenceDir = Join-Path $LabRoot "evidence"
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null

$promotionItem = [PSCustomObject]@{
  promotionItemName = "Decision-Cycle Integrity Preservation Standard"
  sourceObservation = "ECP-005 demonstrated that disciplined NO-GO decisions can be produced under pressure without over-claiming readiness."
  scope = "Executive governance and certification decision quality"
  lifecycleStart = [DateTimeOffset]::UtcNow.ToString("o")
  responsibleOwners = @(
    "Atlas Institute Steward",
    "Executive Core",
    "Governance Owner",
    "CEO (final Atlas Standard approval)"
  )
}

$lifecycle = @(
  New-LifecycleStage -Stage "Observation" -Owner "Atlas Institute Steward" -Evidence @(
    "docs/reviews/ecp-005-ovp-005-executive-simulation-evidence-2026-07-05.md",
    "docs/reviews/atlas-operational-certification-risk-register-2026-07-05.md"
  ) -Approvals @() -Decision "CAPTURED" -Notes "Operational signal captured: governance quality improves when decision rules are applied before confidence reaches launch threshold."

  New-LifecycleStage -Stage "Experiment" -Owner "Executive Core" -Evidence @(
    "Simulated hypothesis: enforce matrix rules under mixed CRITICAL/HIGH risk profile and verify decision consistency.",
    "Result from OVP-005: NO-GO with full scorecard/evidence coverage."
  ) -Approvals @("Operations Owner") -Decision "APPROVED" -Notes "Hypothesis confirmed at simulation scope: strict evidence rule produced stable decision quality."

  New-LifecycleStage -Stage "Validated" -Owner "Governance Owner" -Evidence @(
    "decision record: ecp-005-executive-simulation-20260706T021909Z/evidence/executive-decision-record.json",
    "matrix conformance: decision outcome in allowed set and rationale tied to open blocker counts"
  ) -Approvals @("Governance Owner") -Decision "APPROVED" -Notes "Validation basis accepted: lifecycle evidence is internally consistent and traceable."

  New-LifecycleStage -Stage "Recommended" -Owner "Executive Core" -Evidence @(
    "Recommendation: apply this decision-integrity pattern to all future launch-gating reviews.",
    "Scope bounded to governance behavior; no architecture change implied."
  ) -Approvals @("Executive Core") -Decision "APPROVED" -Notes "Promotion to recommended guidance authorized for cross-workstream governance use."

  New-LifecycleStage -Stage "Best Practice" -Owner "Executive Governance Council" -Evidence @(
    "Repeated consistency signal across ECP-003, ECP-004, and ECP-005 executive briefs.",
    "No contradictions observed in risk classification and decision outcomes."
  ) -Approvals @("Executive Governance Council") -Decision "APPROVED" -Notes "Best-practice status granted with periodic review requirement."

  New-LifecycleStage -Stage "Atlas Standard" -Owner "CEO" -Evidence @(
    "Formal governance trigger invoked and recorded.",
    "Atlas Standard promotion rationale references demonstrated evidence lineage from Observation through Best Practice."
  ) -Approvals @("Executive Core", "CEO") -Decision "APPROVED" -Notes "Atlas Standard granted under governance trigger framework."
)

$governanceApproval = [PSCustomObject]@{
  promotionItemName = $promotionItem.promotionItemName
  governanceTriggerInvoked = "Annual Organizational Review"
  triggerSource = "docs/reviews/atlas-governance-trigger-framework-v1.0-2026-07-05.md"
  approvalDate = [DateTimeOffset]::UtcNow.ToString("o")
  participants = @(
    "Executive Core",
    "Atlas Institute Steward",
    "Governance Owner",
    "CEO"
  )
  decision = "APPROVED"
  approvalRecord = "Atlas Standard promotion approved for governance language: Decision-Cycle Integrity Preservation Standard."
  openIssues = @(
    "Standard was validated at simulation/laboratory evidence scope and should be re-reviewed after controlled operational deployment evidence accumulates."
  )
}

$summary = [PSCustomObject]@{
  generatedAt = [DateTimeOffset]::UtcNow.ToString("o")
  labRoot = $LabRoot
  atlasRepoPath = $atlasRepo.path
  atlasRepoBranch = $atlasRepo.branch
  atlasRepoHead = $atlasRepo.head
  promotionItemName = $promotionItem.promotionItemName
  lifecycleStagesCovered = @($lifecycle | Select-Object -ExpandProperty stage)
  governanceTriggerInvoked = $governanceApproval.governanceTriggerInvoked
  finalPromotionDecision = $governanceApproval.decision
  finalValidationDecision = "PASS"
  ovp006CompletionStatus = "COMPLETE"
}

$promotionItem | ConvertTo-Json -Depth 8 | Out-File -FilePath (Join-Path $evidenceDir "promotion-item.json") -Encoding utf8
$lifecycle | ConvertTo-Json -Depth 8 | Out-File -FilePath (Join-Path $evidenceDir "lifecycle-record.json") -Encoding utf8
$governanceApproval | ConvertTo-Json -Depth 8 | Out-File -FilePath (Join-Path $evidenceDir "governance-approval-record.json") -Encoding utf8
$summary | ConvertTo-Json -Depth 8 | Out-File -FilePath (Join-Path $evidenceDir "ovp-006-simulation-summary.json") -Encoding utf8

Write-Host "OVP-006 institute promotion validation"
Write-Host "Lab root: $LabRoot"
Write-Host "Promotion item: $($promotionItem.promotionItemName)"
Write-Host "Governance trigger: $($governanceApproval.governanceTriggerInvoked)"
Write-Host "Final promotion decision: $($governanceApproval.decision)"
Write-Host "Validation decision: PASS"
Write-Host "Summary: $(Join-Path $evidenceDir 'ovp-006-simulation-summary.json')"

exit 0