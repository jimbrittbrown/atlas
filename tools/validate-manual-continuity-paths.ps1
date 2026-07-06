param(
    [string]$PlaybookPath = "docs/reviews/atlas-manual-continuity-playbook-2026-07-05.md"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $PlaybookPath)) {
    throw "Playbook not found: $PlaybookPath"
}

$content = Get-Content -LiteralPath $PlaybookPath -Raw

$sections = @(
    @{
        Name = "Approval Workflow Interruption"
        RequiredHeadings = @("### Trigger", "### Authority", "### Required Evidence", "### Manual Procedure", "### Resumption Gates")
    },
    @{
        Name = "Atlas Institute Unavailable"
        RequiredHeadings = @("### Trigger", "### Authority", "### Required Evidence", "### Manual Procedure", "### Resumption Gates")
    },
    @{
        Name = "Metrics Unavailable"
        RequiredHeadings = @("### Trigger", "### Authority", "### Required Evidence", "### Manual Procedure", "### Resumption Gates")
    }
)

$errors = New-Object System.Collections.Generic.List[string]

foreach ($section in $sections) {
    $pattern = "## " + [regex]::Escape($section.Name) + "(?<body>[\s\S]*?)(?=\r?\n## |\z)"
    $match = [regex]::Match($content, $pattern)
    if (-not $match.Success) {
        $errors.Add("Missing section: $($section.Name)")
        continue
    }

    $body = $match.Groups["body"].Value
    foreach ($heading in $section.RequiredHeadings) {
        if ($body -notmatch [regex]::Escape($heading)) {
            $errors.Add("Section '$($section.Name)' missing heading: $heading")
        }
    }
}

Write-Host "Manual continuity path validation"
Write-Host "Playbook: $PlaybookPath"
Write-Host "Required sections: $($sections.Count)"
Write-Host "Errors: $($errors.Count)"

if ($errors.Count -gt 0) {
    foreach ($error in $errors) {
        Write-Host "ERROR: $error"
    }
    exit 1
}

Write-Host ""
Write-Host "PASS: manual continuity playbook covers all required continuity sections and headings."