param(
    [string]$InventoryPath = "docs/reviews/atlas-runtime-state-restoration-inventory-2026-07-05.json"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $InventoryPath)) {
    throw "Inventory not found: $InventoryPath"
}

$inventory = Get-Content -LiteralPath $InventoryPath -Raw | ConvertFrom-Json

$requiredIds = @(
    "institutional-governance-artifacts",
    "workflow-orchestration-state",
    "approval-decision-state",
    "worker-execution-state",
    "metric-history-state",
    "learning-governance-state",
    "business-lifecycle-state"
)

$allowedStatuses = @(
    "satisfied-at-artifact-scope",
    "partially-satisfied",
    "not-satisfied"
)

$errors = New-Object System.Collections.Generic.List[string]

if ($inventory.version -ne 1) {
    $errors.Add("Inventory version must equal 1.")
}

if (-not $inventory.classes) {
    $errors.Add("Inventory classes array is missing.")
}

$classes = @($inventory.classes)

foreach ($requiredId in $requiredIds) {
    $entry = $classes | Where-Object { $_.id -eq $requiredId } | Select-Object -First 1
    if (-not $entry) {
        $errors.Add("Missing required state class: $requiredId")
        continue
    }

    foreach ($field in @("owner", "criticality", "currentDurability", "restorationProcedure", "restartReconciliationEvidence", "certificationStatus")) {
        $value = $entry.$field
        if ([string]::IsNullOrWhiteSpace([string]$value)) {
            $errors.Add("State class '$requiredId' missing required field: $field")
        }
    }

    if ($allowedStatuses -notcontains [string]$entry.certificationStatus) {
        $errors.Add("State class '$requiredId' has invalid certificationStatus: $($entry.certificationStatus)")
    }

    $refs = @($entry.evidenceRefs)
    if ($refs.Count -eq 0) {
        $errors.Add("State class '$requiredId' must include at least one evidenceRef")
    }
}

$statusCounts = @{}
foreach ($status in $allowedStatuses) {
    $statusCounts[$status] = @($classes | Where-Object { $_.certificationStatus -eq $status }).Count
}

Write-Host "Runtime-state restoration inventory validation"
Write-Host "Inventory: $InventoryPath"
Write-Host "Required classes: $($requiredIds.Count)"
Write-Host "Found classes: $($classes.Count)"
Write-Host "Satisfied at artifact scope: $($statusCounts['satisfied-at-artifact-scope'])"
Write-Host "Partially satisfied: $($statusCounts['partially-satisfied'])"
Write-Host "Not satisfied: $($statusCounts['not-satisfied'])"
Write-Host "Errors: $($errors.Count)"

if ($errors.Count -gt 0) {
    foreach ($error in $errors) {
        Write-Host "ERROR: $error"
    }
    exit 1
}

Write-Host ""
Write-Host "PASS: runtime-state restoration inventory includes all required state classes and required evidence fields."