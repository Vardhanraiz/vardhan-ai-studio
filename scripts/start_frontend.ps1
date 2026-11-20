<#
.SYNOPSIS
    Starts the Vardhan AI Studio React + Vite frontend development server.
#>

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $ProjectRoot "frontend"

Push-Location $FrontendDir
try {
    npm.cmd run dev
} finally {
    Pop-Location
}
