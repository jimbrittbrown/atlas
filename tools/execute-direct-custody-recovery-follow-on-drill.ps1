param(
  [string]$AtlasRepoPath = ".",
  [string]$OpenClawRepoPath = "..\openclaw",
  [string]$PriorEvidenceRoot = "C:\Atlas\Projects\ecp-003-credential-operations-20260706T015304Z\evidence",
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
    }
  }

  $item = Get-Item -LiteralPath $LiteralPath
  if ($item.PSIsContainer) {
    return [PSCustomObject]@{
      path = $LiteralPath
      exists = $true
      type = "directory"
      itemCount = (Get-ChildItem -Force -LiteralPath $LiteralPath | Measure-Object).Count
    }
  }

  return [PSCustomObject]@{
    path = $LiteralPath
    exists = $true
    type = "file"
    itemCount = 1
  }
}

function Get-PropertyNames {
  param($Object)

  if ($null -eq $Object) {
    return @()
  }

  return @($Object.PSObject.Properties | Select-Object -ExpandProperty Name)
}

function Get-CmdKeyTargets {
  $targets = @()
  try {
    $targets = @(
      cmdkey /list |
        Select-String "Target:" |
        ForEach-Object {
          if ($_.Line -match "Target:\s*(.+)$") {
            $Matches[1].Trim()
          }
        }
    )
  }
  catch {
    $targets = @()
  }

  return @($targets | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Get-OpenClawProfileEvidence {
  param(
    [Parameter(Mandatory = $true)]
    [string]$UserHome
  )

  $configPath = Join-Path $UserHome ".openclaw\openclaw.json"
  $modelsPath = Join-Path $UserHome ".openclaw\agents\main\agent\models.json"
  $credentialsPath = Join-Path $UserHome ".openclaw\credentials"
  $envPath = Join-Path $UserHome ".openclaw\.env"
  $pluginsPath = Join-Path $UserHome ".openclaw\agents\main\agent\plugins"
  $sqlitePath = Join-Path $UserHome ".openclaw\agents\main\agent\openclaw-agent.sqlite"

  $config = $null
  if (Test-Path -LiteralPath $configPath) {
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  }

  $authProfileNames = @()
  $authProviderNames = @()
  $gatewayAuthKeys = @()
  $gatewayAuthTokenPresent = $false

  if ($null -ne $config -and $null -ne $config.auth -and $null -ne $config.auth.profiles) {
    $authProfileNames = Get-PropertyNames -Object $config.auth.profiles
    $authProviderNames = @(
      $authProfileNames |
        ForEach-Object { ($_ -split ":", 2)[0] } |
        Sort-Object -Unique
    )
  }

  if ($null -ne $config -and $null -ne $config.gateway -and $null -ne $config.gateway.auth) {
    $gatewayAuthKeys = Get-PropertyNames -Object $config.gateway.auth
    $gatewayAuthTokenPresent = ($gatewayAuthKeys -contains "token") -and -not [string]::IsNullOrWhiteSpace([string]$config.gateway.auth.token)
  }

  return [PSCustomObject]@{
    configPath = Get-PathPresence -LiteralPath $configPath
    modelsPath = Get-PathPresence -LiteralPath $modelsPath
    credentialsPath = Get-PathPresence -LiteralPath $credentialsPath
    envPath = Get-PathPresence -LiteralPath $envPath
    pluginsPath = Get-PathPresence -LiteralPath $pluginsPath
    sqlitePath = Get-PathPresence -LiteralPath $sqlitePath
    gatewayAuthKeys = $gatewayAuthKeys
    gatewayAuthTokenPresent = $gatewayAuthTokenPresent
    authProfileNames = $authProfileNames
    authProviderNames = $authProviderNames
  }
}

function New-FollowOnRecord {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Class,
    [Parameter(Mandatory = $true)]
    [string]$PriorResult,
    [Parameter(Mandatory = $true)]
    [string]$Result,
    [Parameter(Mandatory = $true)]
    [string]$ClosureStatus,
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
    priorResult = $PriorResult
    followOnResult = $Result
    closureStatus = $ClosureStatus
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
  $LabRoot = Join-Path $parent "ecp-003-direct-custody-follow-on-$timestamp"
}

$evidenceDir = Join-Path $LabRoot "evidence"
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null

$registerPath = Join-Path $atlasRepo.path "docs\security\credential-custody-register-2026-07-05.json"
$register = Get-Content -LiteralPath $registerPath -Raw | ConvertFrom-Json
$classes = @($register.classes)

$priorCoveragePath = Join-Path $PriorEvidenceRoot "direct-recovery-coverage.json"
$priorCoverageRaw = Get-Content -LiteralPath $priorCoveragePath -Raw | ConvertFrom-Json
$priorCoverage = if ($priorCoverageRaw -is [System.Array]) {
  $priorCoverageRaw
}
else {
  @($priorCoverageRaw)
}
$priorById = @{}
foreach ($entry in $priorCoverage) {
  $priorById[$entry.id] = $entry
}

$userHome = [Environment]::GetFolderPath("UserProfile")
$cmdKeyTargets = Get-CmdKeyTargets
$globalHelperRaw = & git config --global --get credential.helper 2>$null
$globalHelper = if ($null -eq $globalHelperRaw) {
  ""
}
else {
  "$globalHelperRaw".Trim()
}

$opCli = [bool](Get-Command op -ErrorAction SilentlyContinue)
$ghCli = [bool](Get-Command gh -ErrorAction SilentlyContinue)
$opAccountAvailable = $false
$ghAuthenticated = $false

if ($opCli) {
  try {
    $accountList = op account list --format json 2>$null
    $opAccountAvailable = ($LASTEXITCODE -eq 0) -and -not [string]::IsNullOrWhiteSpace("$accountList")
  }
  catch {
    $opAccountAvailable = $false
  }
}

if ($ghCli) {
  try {
    $null = gh auth status 2>&1
    $ghAuthenticated = ($LASTEXITCODE -eq 0)
  }
  catch {
    $ghAuthenticated = $false
  }
}

$sshDir = Join-Path $userHome ".ssh"
$sshDirExists = Test-Path -LiteralPath $sshDir
$sshPublicKeyCount = 0
$sshPrivateKeyCandidateCount = 0
if ($sshDirExists) {
  $sshEntries = @(Get-ChildItem -Force -LiteralPath $sshDir)
  $sshPublicKeyCount = @($sshEntries | Where-Object { $_.Name -like "*.pub" }).Count
  $sshPrivateKeyCandidateCount = @(
    $sshEntries |
      Where-Object {
        -not $_.PSIsContainer -and
        $_.Name -notlike "*.pub" -and
        $_.Name -notlike "known_hosts*" -and
        $_.Name -notlike "config"
      }
  ).Count
}

$profileEvidence = Get-OpenClawProfileEvidence -UserHome $userHome

$originUrls = @()
Push-Location $openClawRepo.path
try {
  $originUrls = @(& git remote get-url --all origin 2>$null)
}
finally {
  Pop-Location
}

$hostEvidence = [PSCustomObject]@{
  capturedAt = [DateTimeOffset]::UtcNow.ToString("o")
  priorEvidenceRoot = $PriorEvidenceRoot
  atlasRepo = $atlasRepo
  openClawRepo = $openClawRepo
  gitCredentialHelperConfigured = -not [string]::IsNullOrWhiteSpace($globalHelper)
  gitCredentialHelper = if ([string]::IsNullOrWhiteSpace($globalHelper)) { $null } else { $globalHelper }
  originUrls = $originUrls
  cmdKeySummary = [PSCustomObject]@{
    targetCount = $cmdKeyTargets.Count
    hasGitHubTarget = @($cmdKeyTargets | Where-Object { $_ -match "github" }).Count -gt 0
    hasOpenClawNamedTarget = @($cmdKeyTargets | Where-Object { $_ -match "openclaw" }).Count -gt 0
    hasGenericGitTarget = @($cmdKeyTargets | Where-Object { $_ -match "git|https://" }).Count -gt 0
  }
  sshSummary = [PSCustomObject]@{
    directoryPresent = $sshDirExists
    publicKeyCount = $sshPublicKeyCount
    privateKeyCandidateCount = $sshPrivateKeyCandidateCount
  }
  custodyTooling = [PSCustomObject]@{
    opCliAvailable = $opCli
    opAccountAvailable = $opAccountAvailable
    ghCliAvailable = $ghCli
    ghAuthenticated = $ghAuthenticated
  }
  openClawProfile = $profileEvidence
}

$followOnResults = @()
foreach ($class in $classes) {
  $priorEntry = $priorById[$class.id]
  $priorResult = if ($null -eq $priorEntry) { "UNKNOWN" } else { [string]$priorEntry.result }
  switch ($class.id) {
    "repository-access" {
      $observed = @()
      if ($hostEvidence.gitCredentialHelperConfigured) {
        $observed += "git credential helper configured"
      }
      if (@($originUrls).Count -gt 0) {
        $observed += "openclaw origin remote configured"
      }
      if ($hostEvidence.cmdKeySummary.hasGitHubTarget) {
        $observed += "github credential-manager target present"
      }
      if ($hostEvidence.sshSummary.privateKeyCandidateCount -gt 0) {
        $observed += "ssh identity candidate present"
      }

      $result = if ($hostEvidence.cmdKeySummary.hasGitHubTarget -or $hostEvidence.sshSummary.privateKeyCandidateCount -gt 0) {
        "PASS"
      }
      elseif ($observed.Count -gt 0) {
        "PARTIAL PASS"
      }
      else {
        "FAIL"
      }

      $closureStatus = if ($result -eq $priorResult) { "unchanged" } else { "narrowed" }
      $summary = if ($result -eq "PASS") {
        "A local repository-access recovery surface is present through either a provider-specific credential-manager target or a live SSH identity, which closes the host-side direct-recovery gap for repository access."
      }
      else {
        "The host proves remote targeting and credential-helper configuration for repository access, but not the presence of a provider-specific credential entry or recoverable authenticated write identity."
      }
      $gap = if ($result -eq "PASS") {
        "No remaining host-side gap observed in this session."
      }
      else {
        "No GitHub-scoped credential-manager target, secure-store retrieval event, or recoverable authenticated write identity was exercised in this session."
      }

      $followOnResults += New-FollowOnRecord -Class $class -PriorResult $priorResult -Result $result -ClosureStatus $closureStatus -EvidenceSummary $summary -Gap $gap -ObservedSurfaces $observed
    }
    "vps-infrastructure" {
      $followOnResults += New-FollowOnRecord -Class $class -PriorResult $priorResult -Result "FAIL" -ClosureStatus "unchanged" -EvidenceSummary "No authoritative VPS account, host, or vault session was available from this delegated host session." -Gap "The follow-on drill still had no direct infrastructure custody retrieval path to exercise." -ObservedSurfaces @()
    }
    "backup-archive" {
      $followOnResults += New-FollowOnRecord -Class $class -PriorResult $priorResult -Result "FAIL" -ClosureStatus "unchanged" -EvidenceSummary "No authoritative archive-access or backup-vault session was available from this delegated host session." -Gap "The follow-on drill still had no direct archive credential retrieval path to exercise." -ObservedSurfaces @()
    }
    "provider-model-api" {
      $observed = @()
      if ($profileEvidence.modelsPath.exists) {
        $observed += "models.json present"
      }
      if (@($profileEvidence.authProviderNames).Count -gt 0) {
        $observed += "auth profile reference present"
      }
      if ($profileEvidence.envPath.exists) {
        $observed += ".openclaw .env present"
      }
      if ($hostEvidence.custodyTooling.opAccountAvailable) {
        $observed += "1Password account session available"
      }
      if ($hostEvidence.custodyTooling.ghAuthenticated) {
        $observed += "GitHub CLI authenticated"
      }

      $result = if ($profileEvidence.envPath.exists -or $hostEvidence.custodyTooling.opAccountAvailable -or $hostEvidence.custodyTooling.ghAuthenticated) {
        "PASS"
      }
      elseif ($observed.Count -gt 0) {
        "PARTIAL PASS"
      }
      else {
        "FAIL"
      }

      $closureStatus = if ($result -eq $priorResult) {
        "unchanged"
      }
      elseif ($result -eq "PASS") {
        "closed"
      }
      else {
        "narrowed"
      }

      $summary = if ($result -eq "PASS") {
        "A direct provider-credential recovery surface exists locally or through an authenticated custody tool, so provider-model API recovery can be exercised without exposing raw values."
      }
      else {
        "The host now shows concrete provider-adjacent auth-profile references in addition to runtime model metadata, but not a direct provider secret retrieval surface."
      }
      $gap = if ($result -eq "PASS") {
        "No remaining host-side gap observed in this session."
      }
      else {
        "No direct retrieval from GitHub Actions, 1Password, local .env custody, or another authoritative provider-secret store was available in this session."
      }

      $followOnResults += New-FollowOnRecord -Class $class -PriorResult $priorResult -Result $result -ClosureStatus $closureStatus -EvidenceSummary $summary -Gap $gap -ObservedSurfaces $observed
    }
    "service-environment-channel" {
      $observed = @()
      if ($profileEvidence.configPath.exists) {
        $observed += "openclaw.json present"
      }
      if ($profileEvidence.gatewayAuthTokenPresent) {
        $observed += "gateway auth token present in config"
      }
      if ($profileEvidence.pluginsPath.exists) {
        $observed += "agent plugins directory present"
      }
      if ($profileEvidence.sqlitePath.exists) {
        $observed += "agent sqlite present"
      }

      $result = if ($profileEvidence.gatewayAuthTokenPresent) { "PASS" } elseif ($observed.Count -gt 0) { "PARTIAL PASS" } else { "FAIL" }
      $closureStatus = if ($result -eq $priorResult) {
        "unchanged"
      }
      elseif ($result -eq "PASS") {
        "closed"
      }
      else {
        "narrowed"
      }
      $summary = if ($result -eq "PASS") {
        "The live OpenClaw profile contains a direct local gateway-auth token path in approved runtime configuration, which closes the earlier host-side recovery gap for this credential class without exposing the token value."
      }
      else {
        "OpenClaw runtime state is present locally, but no direct token-bearing configuration path was available in this session."
      }
      $gap = if ($result -eq "PASS") {
        "No remaining host-side gap observed for the local gateway/channel recovery surface exercised in this session."
      }
      else {
        "The follow-on drill still could not observe a direct token-bearing local configuration or dedicated credentials path for this class."
      }

      $followOnResults += New-FollowOnRecord -Class $class -PriorResult $priorResult -Result $result -ClosureStatus $closureStatus -EvidenceSummary $summary -Gap $gap -ObservedSurfaces $observed
    }
    "emergency-recovery-decryption" {
      $followOnResults += New-FollowOnRecord -Class $class -PriorResult $priorResult -Result "FAIL" -ClosureStatus "unchanged" -EvidenceSummary "No recovery-key or decryption-material custody session was available from this delegated host session." -Gap "The follow-on drill still had no direct recovery/decryption material retrieval path to exercise." -ObservedSurfaces @()
    }
    default {
      $followOnResults += New-FollowOnRecord -Class $class -PriorResult $priorResult -Result "FAIL" -ClosureStatus "unchanged" -EvidenceSummary "Unhandled class." -Gap "No evidence recorded." -ObservedSurfaces @()
    }
  }
}

$passCount = @($followOnResults | Where-Object { $_.followOnResult -eq "PASS" }).Count
$partialCount = @($followOnResults | Where-Object { $_.followOnResult -eq "PARTIAL PASS" }).Count
$failCount = @($followOnResults | Where-Object { $_.followOnResult -eq "FAIL" }).Count
$closedCount = @($followOnResults | Where-Object { $_.closureStatus -eq "closed" }).Count
$narrowedCount = @($followOnResults | Where-Object { $_.closureStatus -eq "narrowed" }).Count

$overallResult = if ($failCount -eq 0) {
  "PASS"
}
elseif ($passCount -gt 0 -or $partialCount -gt 0) {
  "PARTIAL PASS"
}
else {
  "FAIL"
}

$ecrR3Status = if ($failCount -eq 0 -and $partialCount -eq 0) {
  "CLOSE"
}
else {
  "KEEP OPEN"
}

$summary = [PSCustomObject]@{
  generatedAt = [DateTimeOffset]::UtcNow.ToString("o")
  labRoot = $LabRoot
  priorEvidenceRoot = $PriorEvidenceRoot
  atlasRepoPath = $atlasRepo.path
  openClawRepoPath = $openClawRepo.path
  overallResult = $overallResult
  ecrR3RecommendedStatus = $ecrR3Status
  directRecoveryPassCount = $passCount
  directRecoveryPartialCount = $partialCount
  directRecoveryFailCount = $failCount
  closureClosedCount = $closedCount
  closureNarrowedCount = $narrowedCount
  classesCovered = $classes.Count
}

$hostEvidence | ConvertTo-Json -Depth 8 | Out-File -FilePath (Join-Path $evidenceDir "host-direct-custody-evidence.json") -Encoding utf8
$followOnResults | ConvertTo-Json -Depth 8 | Out-File -FilePath (Join-Path $evidenceDir "direct-custody-class-results.json") -Encoding utf8
$summary | ConvertTo-Json -Depth 8 | Out-File -FilePath (Join-Path $evidenceDir "direct-custody-follow-on-summary.json") -Encoding utf8

Write-Host "Direct custody recovery follow-on drill"
Write-Host "Lab root: $LabRoot"
Write-Host "Direct recovery pass count: $passCount"
Write-Host "Direct recovery partial count: $partialCount"
Write-Host "Direct recovery fail count: $failCount"
Write-Host "Closure closed count: $closedCount"
Write-Host "Closure narrowed count: $narrowedCount"
Write-Host "ECR-R3 recommended status: $ecrR3Status"
Write-Host "Summary: $(Join-Path $evidenceDir 'direct-custody-follow-on-summary.json')"

if ($overallResult -eq "FAIL") {
  exit 1
}

exit 0