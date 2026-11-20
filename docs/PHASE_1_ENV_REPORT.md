# Phase 1 — Environment Inspection Report

**Project Root**: `C:\Users\User\Desktop\sai\website\vardhan-ai-studio`  
**Inspection Date**: 2026-11-18

---

## 1. Detected Hardware & Operating System

| Component | Detected Value | Notes |
| :--- | :--- | :--- |
| **OS** | Microsoft Windows 10 Pro (Build 19045) | Compatible with Python, Node.js, Git, PowerShell, and Ollama. |
| **CPU** | Intel(R) Core(TM) i3-3220 @ 3.30 GHz | 2 cores / 4 threads (CPU-only inference; use lightweight 1.5B quantized models). |
| **Total RAM** | 7.89 GB | Matches 8 GB constraint. Keep dev footprint minimal. |
| **Free RAM (at check)** | ~0.50 GB | Close unused browser tabs/apps before running Ollama + Vite + FastAPI simultaneously. |
| **GPU** | Integrated graphics only | No CUDA/dedicated VRAM; Ollama will run on CPU. |

---

## 2. Installed Development Tools

| Tool | Status | Version | Location |
| :--- | :--- | :--- | :--- |
| **Node.js** | Installed | `v24.22.0` | `C:\Program Files\nodejs\node.exe` |
| **npm / npx** | Installed (note below) | `11.19.1` | `C:\Program Files\nodejs\npm.cmd` |
| **Git** | Installed | `2.53.0.windows.1` | `C:\Program Files\Git\cmd\git.exe` |
| **VS Code** | Installed | `1.146.0` | `%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd` |
| **winget** | Installed | Available | `%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe` |
| **Python 3** | Installed | `3.12.10` | `%LOCALAPPDATA%\Programs\Python\Python312\python.exe` |
| **pip / venv** | Installed | `pip 25.0.1` | Bundled with Python 3.12 |
| **Ollama** | Installed | `0.40.16` | `%LOCALAPPDATA%\Programs\Ollama\ollama.exe` |

### Important Windows PowerShell Note
PowerShell's execution policy is currently `Undefined` (defaults to `Restricted`). Because of this, invoking `npm` directly in PowerShell tries to execute `npm.ps1` and fails, whereas `npm.cmd` works.

---

## 3. Minimum Required Installations

### Required before Phase 2 (Backend Setup)
1. **Python 3.12 (recommended)** — Includes `pip` and `venv`:
   ```powershell
   winget install -e --id Python.Python.3.12
   ```
   After installation, open a new terminal and verify:
   ```powershell
   python --version
   pip --version
   ```
   *(If Windows still resolves the Microsoft Store stub, disable `python.exe` and `python3.exe` in Windows Settings → Apps → App execution aliases, or restart your terminal after PATH updates.)*

### Required before Phase 4 (Local AI & Chat)
2. **Ollama (Windows)**:
   ```powershell
   winget install -e --id Ollama.Ollama
   ```
   Verify after installing:
   ```powershell
   ollama --version
   ```
   *(Do not download large models automatically. In Phase 4, we will pull `qwen2.5-coder:1.5b` (~1 GB) with your confirmation.)*

### Recommended for Smooth PowerShell Workflow
3. **Allow local signed/npm PowerShell scripts for CurrentUser**:
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
   ```

---

## 4. Existing Files Preservation Check

The target folder `C:\Users\User\Desktop\sai\website` contained existing items (`medical/`, `sai vardhan/`, `medical.zip`). None of these were modified or overwritten; Vardhan AI Studio was initialized cleanly in its own dedicated subdirectory `C:\Users\User\Desktop\sai\website\vardhan-ai-studio\`.
