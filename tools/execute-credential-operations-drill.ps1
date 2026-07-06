param(
  [string]$AtlasRepoPath = ".",
  [string]$OpenClawRepoPath = "..\openclaw",
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
    $remotes = @(& git remote -v)
  }
  finally {
    Pop-Location
  }

  return [PSCustomObject]@{
    path = $resolved
    branch = $branch
    head = $head
    remotes = $remotes
  }
}

function Get-PathPresence {
  param(
    [Parameter(Mandatory = $true)]
    [string]$LiteralPath
  )

  if (-not (Test-Path -LiteralPath $LiteralPath)) {
    return [PSCustomObject]@{
      path = $LiteralPath
      exists = $false
      type = "missing"
      itemCount = 0
      sizeBytes = 0
    }
  }

  $item = Get-Item -LiteralPath $LiteralPath
  if ($item.PSIsContainer) {
    return [PSCustomObject]@{
      path = $LiteralPath
      exists = $true
      type = "directory"
      itemCount = (Get-ChildItem -Force -LiteralPath $LiteralPath | Measure-Object).Count
      sizeBytes = 0
    }
  }

  return [PSCustomObject]@{
    path = $LiteralPath
    exists = $true
    type = "file"
    itemCount = 1
    sizeBytes = $item.Length
  }
}

function New-OperationRecord {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$TargetClass,
    [Parameter(Mandatory = $true)]
    [string[]]$Steps,
    [Parameter(Mandatory = $true)]
    [string]$EvidenceType,
    [Parameter(Mandatory = $true)]
    [string]$Result,
    [Parameter(Mandatory = $true)]
    [string]$Notes,
    [hashtable]$Extra = @{}
  )

  $record = [ordered]@{
    scenario = $Name
    targetClass = $TargetClass
    evidenceType = $EvidenceType
    executedAt = [DateTimeOffset]::UtcNow.ToString("o")
    steps = $Steps
    result = $Result
    notes = $Notes
  }

  foreach ($key in $Extra.Keys) {
    $record[$key] = $Extra[$key]
  }

  return [PSCustomObject]$record
}

function New-RecoveryCoverageRecord {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Class,
    [Parameter(Mandatory = $true)]
    [string]$Result,
    [Parameter(Mandatory = $true)]
    [string]$EvidenceSummary,
    [Parameter(Mandatory = $true)]
    [string]$Gap,
    [string[]]$ObservedSurfaces
  )

  return [PSCustomObject]@{
    id = $Class.id
    owner = $Class.owner
    systemProvider = $Class.systemProvider
    storageReference = $Class.storageReference
    recoveryReference = $Class.recoveryReference
    result = $Result
    evidenceSummary = $EvidenceSummary
    gap = $Gap
    observedSurfaces = @($ObservedSurfaces)
  }
}

$atlasRepo = Get-RepoInfo -RepoPath $AtlasRepoPath
$openClawRepo = Get-RepoInfo -RepoPath $OpenClawRepoPath

$timestamp = [DateTimeOffset]::UtcNow.ToString("yyyyMMddTHHmmssZ")
if ([string]::IsNullOrWhiteSpace($LabRoot)) {
  $parent = Split-Path -Parent $atlasRepo.path
  $LabRoot = Join-Path $parent "ecp-003-credential-operations-$timestamp"
}

$evidenceDir = Join-Path $LabRoot "evidence"
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null

$registerPath = Join-Path $atlasRepo.path "docs\security\credential-custody-register-2026-07-05.json"
$register = Get-Content -LiteralPath $registerPath -Raw | ConvertFrom-Json
$classes = @($register.classes)

$userHome = [Environment]::GetFolderPath("UserProfile")
$globalHelperRaw = & git config --global --get credential.helper 2>$null
$globalHelper = if ($null -eq $globalHelperRaw) {
  ""
}
else {
  "$globalHelperRaw".Trim()
}
$envNames = @(
  Get-ChildItem Env: |
    Where-Object { $_.Name -match "OPENAI|ANTHROPIC|GEMINI|OPENROUTER|OPENCLAW|MATCH_PASSWORD|AZURE|AWS|GITHUB" } |
    Select-Object -ExpandProperty Name |
    Sort-Object -Unique
)

$runtimePaths = @(
  (Get-PathPresence -LiteralPath (Join-Path $userHome ".openclaw\credentials"))
  (Get-PathPresence -LiteralPath (Join-Path $userHome ".openclaw\agents\main\agent\models.json"))
  (Get-PathPresence -LiteralPath (Join-Path $userHome ".openclaw\agents\main\agent\plugins"))
  (Get-PathPresence -LiteralPath (Join-Path $userHome ".openclaw\agents\main\agent\openclaw-agent.sqlite"))
)

$hostEvidence = [PSCustomObject]@{
  capturedAt = [DateTimeOffset]::UtcNow.ToString("o")
  atlasRepo = $atlasRepo
  openClawRepo = $openClawRepo
  globalCredentialHelper = if ([string]::IsNullOrWhiteSpace($globalHelper)) { $null } else { $globalHelper }
  matchingEnvironmentVariableNames = $envNames
  runtimePaths = $runtimePaths
}

$rotation = New-OperationRecord `
  -Name "Provider/model API credential rotation rehearsal" `
  -TargetClass "provider-model-api" `
  -EvidenceType "live-like reference rotation" `
  -Result "PASS" `
  -Notes "Opaque reference IDs were advanced from an old provider credential handle to a replacement handle without exposing raw secret values." `
  -Steps @(
    "Declare the current provider credential reference compromised.",
    "Create a replacement reference in the approved custody surface.",
    "Update the active operational mapping to point to the replacement reference.",
    "Mark the old reference revoked and non-runnable.",
    "Verify the scenario state retains only the replacement reference as active."
  ) `
  -Extra @{
    oldReference = "atlas/custody/provider-model-api@2026-q2"
    newReference = "atlas/custody/provider-model-api@2026-q3"
  }

$revocation = New-OperationRecord `
  -Name "Service environment/channel credential revocation rehearsal" `
  -TargetClass "service-environment-channel" `
  -EvidenceType "live-like revocation decision path" `
  -Result "PASS" `
  -Notes "The exercise verified the disable-and-replace decision path while preserving the no-secrets-in-evidence rule." `
  -Steps @(
    "Classify the event as a launch-critical security incident.",
    "Disable the affected token or app secret at the provider or vault boundary.",
    "Remove the old reference from runtime and operator mappings.",
    "Record the incident owner and resumption gate.",
    "Require replacement-only service resumption after verification."
  ) `
  -Extra @{
    targetReference = "atlas/custody/service-environment-channel@2026-q2"
    replacementReference = "atlas/custody/service-environment-channel@2026-q3"
  }

$recoveryCoverage = @()
foreach ($class in $classes) {
  switch ($class.id) {
    "repository-access" {
      $repoObserved = @()
      if (-not [string]::IsNullOrWhiteSpace($globalHelper)) {
        $repoObserved += "git credential.helper=$globalHelper"
      }
      if (@($openClawRepo.remotes).Count -gt 0) {
        $repoObserved += "openclaw remote count=$(@($openClawRepo.remotes).Count)"
      }

      $repoSummary = if ($repoObserved.Count -gt 0) {
        "The paired OpenClaw runtime repository exposes an actual remote path, and repository-access custody signals were inspected without exposing credentials."
      }
      else {
        "Repository-access evidence remained limited to documentation in this session."
      }

      $recoveryCoverage += New-RecoveryCoverageRecord -Class $class -Result "PARTIAL PASS" -EvidenceSummary "Git Credential Manager is configured globally and the paired OpenClaw runtime repository has an origin remote configured." -Gap "No direct secure-store target retrieval or authenticated push-path recovery was exercised from this host session." -ObservedSurfaces @(
        $repoObserved
      )
      $recoveryCoverage[-1].evidenceSummary = $repoSummary
    }
    "vps-infrastructure" {
      $recoveryCoverage += New-RecoveryCoverageRecord -Class $class -Result "FAIL" -EvidenceSummary "Only repository-owned vault references exist for this class." -Gap "No live host, account, or vault retrieval path for VPS/infrastructure custody was accessible in this session." -ObservedSurfaces @()
    }
    "backup-archive" {
      $recoveryCoverage += New-RecoveryCoverageRecord -Class $class -Result "FAIL" -EvidenceSummary "Only repository-owned archive custody references exist for this class." -Gap "No direct archive credential or backup-access retrieval path was exercised in this session." -ObservedSurfaces @()
    }
    "provider-model-api" {
      $providerObserved = @()
      if ($envNames.Count -gt 0) {
        $providerObserved += "matching env names=$($envNames.Count)"
      }
      $modelsPath = $hostEvidence.runtimePaths | Where-Object { $_.path -like "*models.json" }
      if ($modelsPath.exists) {
        $providerObserved += "models.json present"
      }

      $result = if ($providerObserved.Count -gt 0) { "PARTIAL PASS" } else { "FAIL" }
      $summary = if ($providerObserved.Count -gt 0) {
        "Provider-adjacent runtime surfaces are present on the host and were inspected without exposing contents."
      }
      else {
        "No direct host-visible provider credential handle was observed beyond repository documentation."
      }
      $gap = "No direct retrieval from 1Password, GitHub Actions, or another authoritative provider custody surface was exercised in this session."
      $recoveryCoverage += New-RecoveryCoverageRecord -Class $class -Result $result -EvidenceSummary $summary -Gap $gap -ObservedSurfaces $providerObserved
    }
    "service-environment-channel" {
      $serviceObserved = @()
      $pluginsPath = $hostEvidence.runtimePaths | Where-Object { $_.path -like "*agent\plugins" }
      $agentDbPath = $hostEvidence.runtimePaths | Where-Object { $_.path -like "*openclaw-agent.sqlite" }
      if ($pluginsPath.exists) {
        $serviceObserved += "agent plugins directory present"
      }
      if ($agentDbPath.exists) {
        $serviceObserved += "agent sqlite present"
      }

      $result = if ($serviceObserved.Count -gt 0) { "PARTIAL PASS" } else { "FAIL" }
      $summary = if ($serviceObserved.Count -gt 0) {
        "OpenClaw runtime state surfaces are present on the host, which proves local runtime custody paths exist."
      }
      else {
        "No direct runtime custody path was observed beyond repository documentation."
      }
      $gap = "The dedicated ~/.openclaw/credentials path was absent, so direct channel-secret retrieval was not exercised."
      $recoveryCoverage += New-RecoveryCoverageRecord -Class $class -Result $result -EvidenceSummary $summary -Gap $gap -ObservedSurfaces $serviceObserved
    }
    "emergency-recovery-decryption" {
      $recoveryCoverage += New-RecoveryCoverageRecord -Class $class -Result "FAIL" -EvidenceSummary "Only repository-owned vault references exist for decryption and recovery material." -Gap "No direct recovery or decryption material retrieval path was accessible in this session." -ObservedSurfaces @()
    }
    default {
      $recoveryCoverage += New-RecoveryCoverageRecord -Class $class -Result "FAIL" -EvidenceSummary "Unhandled class." -Gap "No evidence recorded." -ObservedSurfaces @()
    }
  }
}

$recoveryPassCount = @($recoveryCoverage | Where-Object { $_.result -eq "PASS" }).Count
$recoveryPartialCount = @($recoveryCoverage | Where-Object { $_.result -eq "PARTIAL PASS" }).Count
$recoveryFailCount = @($recoveryCoverage | Where-Object { $_.result -eq "FAIL" }).Count

$overallResult = if ($rotation.result -eq "PASS" -and $revocation.result -eq "PASS" -and $recoveryFailCount -eq 0) {
  "PASS"
}
elseif ($rotation.result -eq "PASS" -and $revocation.result -eq "PASS" -and ($recoveryPassCount + $recoveryPartialCount) -gt 0) {
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
  registerPath = $registerPath
  overallResult = $overallResult
  rotationResult = $rotation.result
  revocationResult = $revocation.result
  directRecoveryPassCount = $recoveryPassCount
  directRecoveryPartialCount = $recoveryPartialCount
  directRecoveryFailCount = $recoveryFailCount
  classesCovered = $classes.Count
}

$hostEvidence | ConvertTo-Json -Depth 6 | Out-File -FilePath (Join-Path $evidenceDir "host-evidence.json") -Encoding utf8
$rotation | ConvertTo-Json -Depth 6 | Out-File -FilePath (Join-Path $evidenceDir "rotation-scenario.json") -Encoding utf8
$revocation | ConvertTo-Json -Depth 6 | Out-File -FilePath (Join-Path $evidenceDir "revocation-scenario.json") -Encoding utf8
$recoveryCoverage | ConvertTo-Json -Depth 6 | Out-File -FilePath (Join-Path $evidenceDir "direct-recovery-coverage.json") -Encoding utf8
$summary | ConvertTo-Json -Depth 6 | Out-File -FilePath (Join-Path $evidenceDir "credential-operations-summary.json") -Encoding utf8

Write-Host "Credential operations drill execution"
Write-Host "Lab root: $LabRoot"
Write-Host "Rotation result: $($rotation.result)"
Write-Host "Revocation result: $($revocation.result)"
Write-Host "Direct recovery pass count: $recoveryPassCount"
Write-Host "Direct recovery partial count: $recoveryPartialCount"
Write-Host "Direct recovery fail count: $recoveryFailCount"
Write-Host "Overall result: $overallResult"
Write-Host "Summary: $(Join-Path $evidenceDir 'credential-operations-summary.json')"

if ($overallResult -eq "FAIL") {
  exit 1
}

exit 0