@echo off
title Vardhan AI Studio - Live Internet Tunnel Launcher
echo =======================================================
echo     VARDHAN AI STUDIO - Live Public Internet Tunnel
echo =======================================================
echo.
cd /d "%~dp0"

echo [1/4] Checking Ollama local model service...
where ollama >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo Ollama detected. Ensuring background service is active...
    start /min "" ollama serve
) else (
    echo Ollama not found in PATH (optional). Local AI features will connect if started.
)

echo.
echo [2/4] Starting FastAPI Backend on http://127.0.0.1:8000 ...
start "Vardhan AI Backend (FastAPI)" powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0scripts\start_backend.ps1"

echo.
echo [3/4] Starting React + Vite Frontend on http://0.0.0.0:5173 ...
start "Vardhan AI Frontend (Vite)" cmd /c "cd /d %~dp0frontend && npm.cmd run dev"

echo.
echo [4/4] Starting Cloudflare Live Tunnel...
echo Generating secure public HTTPS link for your studio...
echo.
timeout /t 4 /nobreak >nul
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:5173
