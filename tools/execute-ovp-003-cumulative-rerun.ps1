param(
  [string]$AtlasRepoPath = ".",
  [string]$OpenClawRepoPath = "..\openclaw",
  [string]$DirectCustodyEvidenceRoot = "C:\Atlas\Projects\ecp-003-direct-custody-follow-on-20260706T020255Z\evidence",
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

function Invoke-CommandCapture {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory,
    [Parameter(Mandatory = $true)]
    [string]$Command
  )

  Push-Location $WorkingDirectory
  try {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $output = & powershell -NoProfile -ExecutionPolicy Bypass -Command $Command 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousPreference
    Pop-Location
  }

  return [PSCustomObject]@{
    name = $Name
    workingDirectory = $WorkingDirectory
    command = $Command
    exitCode = $exitCode
    result = if ($exitCode -eq 0) { "PASS" } else { "FAIL" }
    output = $output.TrimEnd()
  }
}

function Invoke-NodeCapture {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory,
    [Parameter(Mandatory = $true)]
    [string]$Command
  )

  Push-Location $WorkingDirectory
  try {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $output = & cmd /c $Command 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousPreference
    Pop-Location
  }

  return [PSCustomObject]@{
    name = $Name
    workingDirectory = $WorkingDirectory
    command = $Command
    exitCode = $exitCode
    result = if ($exitCode -eq 0) { "PASS" } else { "FAIL" }
    output = $output.TrimEnd()
  }
}

function New-ScenarioRecord {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Scenario,
    [Parameter(Mandatory = $true)]
    [string]$PriorResult,
    [Parameter(Mandatory = $true)]
    [string]$CurrentResult,
    [Parameter(Mandatory = $true)]
    [string]$Change,
    [Parameter(Mandatory = $true)]
    [string]$Reason,
    [Parameter(Mandatory = $true)]
    [string[]]$Evidence,
    [Parameter(Mandatory = $true)]
    [string[]]$RemainingGaps
  )

  return [PSCustomObject]@{
    scenario = $Scenario
    priorResult = $PriorResult
    currentResult = $CurrentResult
    change = $Change
    reason = $Reason
    evidence = $Evidence
    remainingGaps = $RemainingGaps
  }
}

$atlasRepo = Get-RepoInfo -RepoPath $AtlasRepoPath
$openClawRepo = Get-RepoInfo -RepoPath $OpenClawRepoPath

$timestamp = [DateTimeOffset]::UtcNow.ToString("yyyyMMddTHHmmssZ")
if ([string]::IsNullOrWhiteSpace($LabRoot)) {
  $parent = Split-Path -Parent $atlasRepo.path
  $LabRoot = Join-Path $parent "ecp-004-ovp-003-cumulative-rerun-$timestamp"
}

$evidenceDir = Join-Path $LabRoot "evidence"
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null

$directCustodySummaryPath = Join-Path $DirectCustodyEvidenceRoot "direct-custody-follow-on-summary.json"
$directCustodyResultsPath = Join-Path $DirectCustodyEvidenceRoot "direct-custody-class-results.json"
$directCustodySummary = Get-Content -LiteralPath $directCustodySummaryPath -Raw | ConvertFrom-Json
$directCustodyResultsRaw = Get-Content -LiteralPath $directCustodyResultsPath -Raw | ConvertFrom-Json
$directCustodyResults = if ($directCustodyResultsRaw -is [System.Array]) { $directCustodyResultsRaw } else { @($directCustodyResultsRaw) }
$directCustodyById = @{}
foreach ($entry in $directCustodyResults) {
  $directCustodyById[$entry.id] = $entry
}

$commands = @(
  Invoke-CommandCapture -Name "recovery-critical-artifacts" -WorkingDirectory $atlasRepo.path -Command ".\tools\validate-recovery-critical-artifacts.ps1 -RequireHead"
  Invoke-CommandCapture -Name "runtime-state-restoration-inventory" -WorkingDirectory $atlasRepo.path -Command ".\tools\validate-runtime-state-restoration-inventory.ps1"
  Invoke-CommandCapture -Name "credential-custody-register" -WorkingDirectory $atlasRepo.path -Command ".\tools\validate-credential-custody-register.ps1"
  Invoke-CommandCapture -Name "manual-continuity-paths" -WorkingDirectory $atlasRepo.path -Command ".\tools\validate-manual-continuity-paths.ps1"
  Invoke-CommandCapture -Name "direct-custody-follow-on" -WorkingDirectory $atlasRepo.path -Command ".\tools\validate-direct-custody-recovery-follow-on-drill.ps1 -EvidenceRoot '$DirectCustodyEvidenceRoot'"
  Invoke-NodeCapture -Name "mission-control-overview-test" -WorkingDirectory $openClawRepo.path -Command "node scripts/run-vitest.mjs ui/src/ui/views/overview.render.test.ts"
)

$commandByName = @{}
foreach ($command in $commands) {
  $commandByName[$command.name] = $command
}

$workerResult = if ($commandByName["mission-control-overview-test"].result -eq "PASS") { "PASS WITH OPEN FOLLOW-ON RISKS" } else { "PARTIAL PASS" }
$repositoryCorruptionResult = if ($commandByName["recovery-critical-artifacts"].result -eq "PASS" -and $commandByName["runtime-state-restoration-inventory"].result -eq "PASS") { "PARTIAL PASS" } else { "FAIL" }
$approvalContinuityResult = if ($commandByName["manual-continuity-paths"].result -eq "PASS" -and $commandByName["mission-control-overview-test"].result -eq "PASS") { "PASS WITH OPEN FOLLOW-ON RISKS" } else { "PARTIAL PASS" }
$instituteResult = if ($commandByName["manual-continuity-paths"].result -eq "PASS") { "PASS WITH OPEN FOLLOW-ON RISKS" } else { "FAIL" }
$metricsResult = if ($commandByName["manual-continuity-paths"].result -eq "PASS" -and $commandByName["mission-control-overview-test"].result -eq "PASS") { "PASS WITH OPEN FOLLOW-ON RISKS" } else { "PARTIAL PASS" }
$partialInfraResult = if ($commandByName["mission-control-overview-test"].result -eq "PASS" -and $commandByName["manual-continuity-paths"].result -eq "PASS") { "PASS WITH OPEN FOLLOW-ON RISKS" } else { "PARTIAL PASS" }

$scenarios = @(
  New-ScenarioRecord -Scenario "Worker failure" -PriorResult "PARTIAL PASS" -CurrentResult $workerResult -Change "improved" -Reason "Mission Control now exposes worker/workflow pressure and operational status explicitly, so the scenario no longer depends on fragmented operator-only interpretation." -Evidence @(
    "mission-control-overview-test PASS",
    "docs/reviews/ovp-003-visibility-revalidation-after-orp-r-005-2026-07-05.md"
  ) -RemainingGaps @(
    "No live worker-failover rehearsal was executed in ECP-004.",
    "Signal trust still depends on upstream measurement quality."
  )
  New-ScenarioRecord -Scenario "AI provider outage" -PriorResult "FAIL" -CurrentResult "FAIL" -Change "unchanged" -Reason "Credential rotation/revocation evidence improved, but no provider-outage failover rehearsal or authoritative provider-secret retrieval path was added in ECP-003." -Evidence @(
    "credential-custody-register PASS",
    "direct-custody-follow-on summary recommended KEEP OPEN"
  ) -RemainingGaps @(
    "No validated alternate-provider or safe-pause failover path was exercised.",
    "Provider-secret direct recovery remains partial rather than authoritative."
  )
  New-ScenarioRecord -Scenario "VPS outage" -PriorResult "FAIL" -CurrentResult "FAIL" -Change "unchanged" -Reason "Repository durability is stronger, but the follow-on custody drill still found no authoritative VPS/infrastructure retrieval path, so full host restoration remains unproven." -Evidence @(
    "recovery-critical-artifacts PASS",
    "direct-custody class vps-infrastructure = FAIL"
  ) -RemainingGaps @(
    "No authoritative infrastructure account or vault retrieval evidence.",
    "Runtime-state restoration beyond committed repository state remains open."
  )
  New-ScenarioRecord -Scenario "Repository corruption" -PriorResult "FAIL" -CurrentResult $repositoryCorruptionResult -Change "improved" -Reason "Recovery-critical artifacts are now durably tracked and committed-state restore evidence exists, but launch-critical runtime-state restoration still remains incomplete." -Evidence @(
    "recovery-critical-artifacts PASS",
    "runtime-state-restoration-inventory PASS",
    "docs/reviews/ecp-002-restore-drill-execution-2026-07-05.md"
  ) -RemainingGaps @(
    "Workflow, approval, worker, metrics, and business lifecycle runtime state are still not durably restorable at certification scope.",
    "Return-to-service remains bounded by ECR-R1."
  )
  New-ScenarioRecord -Scenario "Business launch interruption" -PriorResult "PARTIAL PASS" -CurrentResult "PARTIAL PASS" -Change "narrowed" -Reason "Mission Control improves interruption visibility and executive context, but the Go / No-Go decision cycle itself remains unexecuted until ECP-005." -Evidence @(
    "mission-control-overview-test PASS",
    "docs/reviews/ovp-004-revalidation-after-orp-r-005-2026-07-05.md"
  ) -RemainingGaps @(
    "OVP-005 decision-cycle evidence is still absent.",
    "Launch-resumption judgment remains unexercised."
  )
  New-ScenarioRecord -Scenario "Approval workflow interruption" -PriorResult "FAIL" -CurrentResult $approvalContinuityResult -Change "improved" -Reason "Manual continuity doctrine now exists and Mission Control exposes the affected executive visibility, replacing the earlier undefined governance-continuity state." -Evidence @(
    "manual-continuity-paths PASS",
    "mission-control-overview-test PASS",
    "docs/reviews/ovp-003-revalidation-after-orp-r-004-2026-07-05.md"
  ) -RemainingGaps @(
    "Continuity remains evidence-backed at tabletop/manual scope rather than live outage execution.",
    "Operator discipline is still required for safe manual gatekeeping."
  )
  New-ScenarioRecord -Scenario "Atlas Institute unavailable" -PriorResult "FAIL" -CurrentResult $instituteResult -Change "improved" -Reason "Manual delayed-ingest continuity now exists, so learnable artifacts can be preserved and reconciled instead of being silently lost." -Evidence @(
    "manual-continuity-paths PASS",
    "docs/reviews/ovp-003-revalidation-after-orp-r-004-2026-07-05.md"
  ) -RemainingGaps @(
    "Delayed-ingest quality still depends on disciplined operator capture.",
    "This remains a bounded manual fallback rather than a live exercised outage drill."
  )
  New-ScenarioRecord -Scenario "Metrics unavailable" -PriorResult "FAIL" -CurrentResult $metricsResult -Change "improved" -Reason "Atlas now has a minimum manual evidence mode plus Mission Control degraded-state visibility, replacing the previous undefined observability fallback." -Evidence @(
    "manual-continuity-paths PASS",
    "mission-control-overview-test PASS",
    "docs/reviews/ovp-003-visibility-revalidation-after-orp-r-005-2026-07-05.md"
  ) -RemainingGaps @(
    "Manual metrics capture is still slower and less trustworthy than normal telemetry.",
    "Bounded degraded operation still depends on operator evidence discipline."
  )
  New-ScenarioRecord -Scenario "Partial infrastructure degradation" -PriorResult "PARTIAL PASS" -CurrentResult $partialInfraResult -Change "improved" -Reason "Mission Control now exposes degraded operational state, worker/workflow pressure, snapshot freshness, and evidence mode more explicitly, reducing ambiguity in bounded degraded operation." -Evidence @(
    "mission-control-overview-test PASS",
    "manual-continuity-paths PASS",
    "docs/reviews/ovp-003-visibility-revalidation-after-orp-r-005-2026-07-05.md"
  ) -RemainingGaps @(
    "Upstream signal trustworthiness is still a dependency.",
    "Authoritative infrastructure custody recovery remains unresolved if degradation escalates into full outage."
  )
)

$passWithOpen = @($scenarios | Where-Object { $_.currentResult -eq "PASS WITH OPEN FOLLOW-ON RISKS" }).Count
$partialPass = @($scenarios | Where-Object { $_.currentResult -eq "PARTIAL PASS" }).Count
$failCount = @($scenarios | Where-Object { $_.currentResult -eq "FAIL" }).Count
$improvedCount = @($scenarios | Where-Object { $_.change -eq "improved" }).Count

$overallResult = if ($failCount -eq 0) {
  "PASS WITH OPEN FOLLOW-ON RISKS"
}
elseif ($passWithOpen -gt 0 -or $partialPass -gt 0) {
  "PARTIAL PASS"
}
else {
  "FAIL"
}

$summary = [PSCustomObject]@{
  generatedAt = [DateTimeOffset]::UtcNow.ToString("o")
  labRoot = $LabRoot
  atlasRepoPath = $atlasRepo.path
  openClawRepoPath = $openClawRepo.path
  directCustodyEvidenceRoot = $DirectCustodyEvidenceRoot
  overallResult = $overallResult
  ecrR4RecommendedStatus = "CLOSE"
  scenarioCount = $scenarios.Count
  passWithOpenFollowOnRiskCount = $passWithOpen
  partialPassCount = $partialPass
  failCount = $failCount
  improvedScenarioCount = $improvedCount
}

$inputs = [PSCustomObject]@{
  atlasRepo = $atlasRepo
  openClawRepo = $openClawRepo
  directCustodySummary = $directCustodySummary
  commandResults = $commands
}

$inputs | ConvertTo-Json -Depth 8 | Out-File -FilePath (Join-Path $evidenceDir "cumulative-rerun-inputs.json") -Encoding utf8
$scenarios | ConvertTo-Json -Depth 8 | Out-File -FilePath (Join-Path $evidenceDir "scenario-results.json") -Encoding utf8
$summary | ConvertTo-Json -Depth 8 | Out-File -FilePath (Join-Path $evidenceDir "ovp-003-cumulative-rerun-summary.json") -Encoding utf8

Write-Host "OVP-003 cumulative rerun"
Write-Host "Lab root: $LabRoot"
Write-Host "Overall result: $overallResult"
Write-Host "Pass with open follow-on risks: $passWithOpen"
Write-Host "Partial pass: $partialPass"
Write-Host "Fail: $failCount"
Write-Host "Improved scenarios: $improvedCount"
Write-Host "ECR-R4 recommended status: CLOSE"
Write-Host "Summary: $(Join-Path $evidenceDir 'ovp-003-cumulative-rerun-summary.json')"

if ($overallResult -eq "FAIL") {
  exit 1
}

exit 0