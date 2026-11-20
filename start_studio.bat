@echo off
title Vardhan AI Studio Launcher
echo =======================================================
echo          VARDHAN AI STUDIO - Unified AI Platform
echo =======================================================
echo.
cd /d "%~dp0"

echo [1/3] Checking Ollama local model service...
where ollama >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo Ollama detected. Ensuring background service is active...
    start /min "" ollama serve
) else (
    echo Ollama not found in PATH (optional). Local AI features will connect if started.
)

echo.
echo [2/3] Starting FastAPI Backend on http://127.0.0.1:8000 ...
start "Vardhan AI Backend (FastAPI)" powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0scripts\start_backend.ps1"

echo.
echo [3/3] Starting React + Vite Frontend on http://127.0.0.1:5173 ...
start "Vardhan AI Frontend (Vite)" cmd /c "cd /d %~dp0frontend && npm.cmd run dev"

echo.
echo =======================================================
echo Vardhan AI Studio is starting up!
echo   Frontend UI : http://127.0.0.1:5173
echo   Backend API : http://127.0.0.1:8000
echo   API Docs    : http://127.0.0.1:8000/docs
echo =======================================================
echo.
timeout /t 3 /nobreak >nul
start http://127.0.0.1:5173
