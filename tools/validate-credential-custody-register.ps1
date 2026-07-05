param(
  [string]$RegisterPath = "docs/security/credential-custody-register-2026-07-05.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$requiredIds = @(
  "repository-access",
  "vps-infrastructure",
  "backup-archive",
  "provider-model-api",
  "service-environment-channel",
  "emergency-recovery-decryption"
)

if (-not (Test-Path -Path $RegisterPath)) {
  throw "Register not found: $RegisterPath"
}

$register = Get-Content -Path $RegisterPath -Raw | ConvertFrom-Json
if (-not $register.classes) {
  throw "Register has no classes array: $RegisterPath"
}

$classes = @($register.classes)
$errors = @()

foreach ($id in $requiredIds) {
  $match = @($classes | Where-Object { $_.id -eq $id })
  if ($match.Count -ne 1) {
    $errors += "required class '$id' missing or duplicated"
    continue
  }

  $entry = $match[0]
  foreach ($field in @("owner", "systemProvider", "storageReference", "rotationInterval", "revocationPath", "recoveryReference")) {
    $value = [string]$entry.$field
    if ([string]::IsNullOrWhiteSpace($value)) {
      $errors += "class '$id' has empty field '$field'"
    }
  }

  if (-not (Test-Path -Path ([string]$entry.recoveryReference))) {
    $errors += "class '$id' recoveryReference does not exist: $($entry.recoveryReference)"
  }
}

$placeholders = @($classes | Where-Object {
  ($_.storageReference -match "TBD|TODO|PLACEHOLDER") -or
  ($_.revocationPath -match "TBD|TODO|PLACEHOLDER")
})
if ($placeholders.Count -gt 0) {
  $errors += "placeholder values detected in storageReference/revocationPath"
}

Write-Output "Credential custody register validation"
Write-Output "Register: $RegisterPath"
Write-Output "Required classes: $($requiredIds.Count)"
Write-Output "Found classes: $($classes.Count)"
Write-Output "Errors: $($errors.Count)"

if ($errors.Count -gt 0) {
  Write-Output ""
  Write-Output "Failures:"
  $errors | ForEach-Object { Write-Output "- $_" }
  exit 1
}

Write-Output ""
Write-Output "PASS: credential custody register satisfies required class and field coverage checks."
exit 0
