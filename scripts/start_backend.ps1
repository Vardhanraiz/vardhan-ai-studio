<#
.SYNOPSIS
    Starts the Vardhan AI Studio FastAPI backend server using the local virtualenv.
#>

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $ProjectRoot "backend"
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Error "Virtual environment not found at $VenvPython. Run Phase 2 setup first."
    exit 1
}

Push-Location $BackendDir
try {
    & $VenvPython -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
} finally {
    Pop-Location
}
