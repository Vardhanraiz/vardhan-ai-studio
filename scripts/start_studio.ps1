<#
.SYNOPSIS
    Launches both the FastAPI backend (port 8000) and Vite frontend (port 5173)
    for Vardhan AI Studio on Windows.
#>

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "Starting Vardhan AI Studio..." -ForegroundColor Cyan
Write-Host "  Backend API : http://127.0.0.1:8000 (Swagger: /docs)" -ForegroundColor Green
Write-Host "  Frontend UI : http://127.0.0.1:5173" -ForegroundColor Green

$backendJob = Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-File", "$ProjectRoot\scripts\start_backend.ps1" -PassThru
Start-Sleep -Seconds 2
$frontendJob = Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-File", "$ProjectRoot\scripts\start_frontend.ps1" -PassThru

Write-Host "Launched Backend (PID $($backendJob.Id)) and Frontend (PID $($frontendJob.Id))." -ForegroundColor Cyan
