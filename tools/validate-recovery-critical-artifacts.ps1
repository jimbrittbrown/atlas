param(
  [string]$ManifestPath = "docs/recovery-critical-artifact-manifest.txt",
  [switch]$RequireHead
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -Path $ManifestPath)) {
  throw "Manifest not found: $ManifestPath"
}

$rawLines = Get-Content -Path $ManifestPath
$entries = @(
  $rawLines |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -and -not $_.StartsWith("#") }
)

if ($entries.Count -eq 0) {
  throw "No artifact entries found in manifest: $ManifestPath"
}

$results = @()
foreach ($entry in $entries) {
  $exists = Test-Path -Path $entry

  $prevErrorAction = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & git ls-files --error-unmatch -- $entry > $null 2> $null
  $tracked = $LASTEXITCODE -eq 0

  $inHead = $false
  if ($RequireHead) {
    & git cat-file -e "HEAD:$entry" > $null 2> $null
    $inHead = $LASTEXITCODE -eq 0
  }
  $ErrorActionPreference = $prevErrorAction

  $results += [PSCustomObject]@{
    Path = $entry
    Exists = $exists
    Tracked = $tracked
    InHead = if ($RequireHead) { $inHead } else { $null }
  }
}

$missing = @($results | Where-Object { -not $_.Exists })
$untracked = @($results | Where-Object { -not $_.Tracked })
$notInHead = @()
if ($RequireHead) {
  $notInHead = @($results | Where-Object { -not $_.InHead })
}

Write-Output "Recovery-critical artifact validation"
Write-Output "Manifest: $ManifestPath"
Write-Output "Total entries: $($results.Count)"
Write-Output "Missing on disk: $($missing.Count)"
Write-Output "Not tracked by git: $($untracked.Count)"
if ($RequireHead) {
  Write-Output "Not present in HEAD: $($notInHead.Count)"
}
Write-Output ""

$results | ForEach-Object {
  if ($RequireHead) {
    Write-Output ("- {0} | exists={1} tracked={2} inHead={3}" -f $_.Path, $_.Exists, $_.Tracked, $_.InHead)
  } else {
    Write-Output ("- {0} | exists={1} tracked={2}" -f $_.Path, $_.Exists, $_.Tracked)
  }
}

$failed = ($missing.Count -gt 0) -or ($untracked.Count -gt 0) -or ($RequireHead -and ($notInHead.Count -gt 0))
if ($failed) {
  exit 1
}

Write-Output ""
Write-Output "PASS: recovery-critical artifacts are present, tracked, and HEAD-restorable."
exit 0
