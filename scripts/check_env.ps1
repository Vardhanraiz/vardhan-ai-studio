<#
.SYNOPSIS
    Validates the local Windows development environment and Phase 1 project structure
    for Vardhan AI Studio.
#>

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

# Refresh PATH from Windows registry so newly installed tools are detected immediately
$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$userPath;$machinePath"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Vardhan AI Studio - Environment & Structure Validator" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Project Root: $ProjectRoot`n"

# 1. Hardware Summary
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$totalRamGb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
$freeRamGb = [math]::Round($os.FreePhysicalMemory / 1MB, 2)

Write-Host "[System]" -ForegroundColor Yellow
Write-Host "  OS       : $($os.Caption) ($($os.Version))"
Write-Host "  CPU      : $($cpu.Name)"
Write-Host "  RAM      : $totalRamGb GB total ($freeRamGb GB free)"
if ($freeRamGb -lt 1.5) {
    Write-Host "  WARNING  : Low free RAM ($freeRamGb GB). Close unused apps when running local models." -ForegroundColor DarkYellow
}

# 2. Tool Checks
Write-Host "`n[Dependencies]" -ForegroundColor Yellow

function Check-Tool {
    param(
        [string]$Name,
        [string]$Command,
        [string[]]$VersionArgs,
        [bool]$RequiredNow = $true
    )

    $cmdInfo = Get-Command $Command -ErrorAction SilentlyContinue
    if (-not $cmdInfo) {
        $label = if ($RequiredNow) { "MISSING" } else { "MISSING (needed later)" }
        $color = if ($RequiredNow) { "Red" } else { "DarkYellow" }
        Write-Host ("  {0,-10} : {1}" -f $Name, $label) -ForegroundColor $color
        return $false
    }

    if ($cmdInfo.Source -like "*\Microsoft\WindowsApps\python*.exe") {
        Write-Host ("  {0,-10} : MISSING (Windows Store stub only)" -f $Name) -ForegroundColor Red
        return $false
    }

    try {
        $lines = & $Command @VersionArgs 2>&1 | ForEach-Object { "$_".Trim() } | Where-Object { $_ -ne "" }
        $versionLine = ($lines | Where-Object { $_ -match "version|v\d+|\d+\.\d+" } | Select-Object -Last 1)
        $text = if ($versionLine) { $versionLine } else { ($lines | Select-Object -First 1) }
        if ($text -match "Python was not found") {
            Write-Host ("  {0,-10} : MISSING (Windows Store stub only)" -f $Name) -ForegroundColor Red
            return $false
        }
        Write-Host ("  {0,-10} : OK ($text)" -f $Name) -ForegroundColor Green
        return $true
    } catch {
        Write-Host ("  {0,-10} : ERROR ($($_.Exception.Message))" -f $Name) -ForegroundColor Red
        return $false
    }
}

$hasNode   = Check-Tool -Name "Node.js" -Command "node"    -VersionArgs @("--version")
$hasNpm    = Check-Tool -Name "npm"     -Command "npm.cmd" -VersionArgs @("--version")
$hasGit    = Check-Tool -Name "Git"     -Command "git"     -VersionArgs @("--version")
$hasPython = Check-Tool -Name "Python"  -Command "python"  -VersionArgs @("--version") -RequiredNow $true
$hasOllama = Check-Tool -Name "Ollama"  -Command "ollama"  -VersionArgs @("--version") -RequiredNow $false

# 3. Project Structure Verification
Write-Host "`n[Project Structure]" -ForegroundColor Yellow

$expectedPaths = @(
    "frontend/src/components",
    "frontend/src/pages",
    "frontend/src/layouts",
    "frontend/src/hooks",
    "frontend/src/services",
    "frontend/src/editor",
    "frontend/src/styles",
    "backend/app/api",
    "backend/app/core",
    "backend/app/models",
    "backend/app/schemas",
    "backend/app/services",
    "backend/app/agents",
    "backend/app/tools",
    "backend/app/database",
    "backend/app/security",
    "workspace",
    "tests/backend",
    "tests/frontend",
    "tests/validation",
    "docs",
    "scripts",
    "README.md",
    ".gitignore",
    ".env.example"
)

$missingPaths = @()
foreach ($rel in $expectedPaths) {
    $full = Join-Path $ProjectRoot $rel
    if (-not (Test-Path $full)) {
        $missingPaths += $rel
    }
}

if ($missingPaths.Count -eq 0) {
    Write-Host "  Structure : OK ($($expectedPaths.Count)/$($expectedPaths.Count) paths verified)" -ForegroundColor Green
} else {
    Write-Host "  Structure : FAILED ($($missingPaths.Count) missing paths)" -ForegroundColor Red
    foreach ($m in $missingPaths) {
        Write-Host "    - Missing: $m" -ForegroundColor Red
    }
}

# 4. Summary
Write-Host "`n[Summary]" -ForegroundColor Yellow
if ($missingPaths.Count -gt 0) {
    Write-Host "  Phase 1 structure check FAILED." -ForegroundColor Red
    exit 1
}

if (-not $hasPython) {
    Write-Host "  Action needed before Phase 2: Install Python 3.12 (winget install -e --id Python.Python.3.12)" -ForegroundColor DarkYellow
}
if (-not $hasOllama) {
    Write-Host "  Action needed before Phase 4: Install Ollama (winget install -e --id Ollama.Ollama)" -ForegroundColor DarkYellow
}
if ($hasNode -and $hasNpm -and $hasGit -and $missingPaths.Count -eq 0) {
    Write-Host "  Phase 1 baseline structure & core tooling verified." -ForegroundColor Green
}
exit 0
