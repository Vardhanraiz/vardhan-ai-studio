@echo off
title Push Vardhan AI Studio to GitHub
echo =======================================================
echo          Push Vardhan AI Studio to GitHub
echo =======================================================
echo.
cd /d "%~dp0"

echo [1/3] Ensuring Git remote is set...
git remote set-url origin https://github.com/Vardhanraiz/vardhan-ai-studio.git

echo [2/3] Checking current branch...
git branch -M main

echo [3/3] Pushing code to https://github.com/Vardhanraiz/vardhan-ai-studio ...
echo (If prompted by Windows Git Credential Manager, click 'Sign in with your browser')
echo.
git push -u origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo =======================================================
    echo  SUCCESS! Your code is now live on GitHub:
    echo  https://github.com/Vardhanraiz/vardhan-ai-studio
    echo =======================================================
) else (
    echo.
    echo =======================================================
    echo  Push failed or waiting. Please ensure:
    echo  1. You created the empty repository at:
    echo     https://github.com/new  (Name: vardhan-ai-studio)
    echo  2. You signed into your GitHub account: Vardhanraiz
    echo =======================================================
)
echo.
pause
