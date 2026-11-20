# Vardhan AI Studio

**Unified Local-First AI Software Development Platform**

Vardhan AI Studio is a modular, open-source, local-first software development environment combining an AI Code Editor (Monaco), Autonomous Diff-Approved Coding Agent, Prompt-to-Application Builder, AI Debugging Assistant, Sandboxed PowerShell Terminal, SQLite Database Assistant, AI Testing Agent, GitHub/Git Integration, Deployment Assistant, and Local Ollama Model Management—engineered to run smoothly on modest Windows hardware (**Intel Core i3, 8 GB RAM, integrated graphics, ₹0 budget**).

---

## Implemented Modules (Phase 1 through Phase 16 — Complete)

1. **AI Chat Assistant** — Streaming WebSocket chat via local Ollama (`qwen2.5-coder:1.5b`), persistent SQLite conversation history, untrusted-file context attachment, formatted code blocks with one-click copy.
2. **AI Code Editor (Monaco)** — Multi-tab editing, syntax highlighting (Python, JS/TS, React, HTML, CSS, C#, SQL, JSON, Java), project file explorer, project-wide search, `Ctrl+S` save with automatic reversible backups, and inline AI Explain / Refactor / Generate actions.
3. **Autonomous Coding Agent** — Inspects project structure & files, generates a structured implementation plan + concrete unified diffs, requires explicit user approval before modifying files, creates automatic backups, supports one-click revert, and logs every action to the audit trail.
4. **Prompt-to-Application Builder** — Generates real runnable full-stack applications (FastAPI / Node.js / ASP.NET Core, React / HTML+CSS+JS, SQLite / PostgreSQL / SQL Server), writes SQL schemas & tests, verifies files & syntax on disk, and serves a live local HTML preview.
5. **AI Debugger** — Deterministically parses Python, JavaScript, TypeScript, React, HTTP API, and SQLite/SQL errors, loads referenced project files, and provides AI root-cause and fix suggestions.
6. **Sandboxed Terminal Agent** — Integrated Windows PowerShell terminal restricted to the active project folder with safe allowlists, destructive command blocking, explicit approval prompts for non-allowlisted commands, timeouts, and audit logging.
7. **Database Assistant** — Discovers/initializes SQLite databases, inspects tables/columns/primary keys, displays foreign-key relationships, generates CRUD SQL templates, runs safe `SELECT` queries immediately and requires approval for write/DDL statements.
8. **AI Testing Agent** — Detects Pytest, Vitest, Node test runner, and Playwright suites, runs approved tests with structured passed/failed reports, and generates AI tests for project files.
9. **GitHub & Git Integration** — Local Git initialization, status, unified diff, branch creation/switching, AI commit message generation, approved commits, commit history, and approved public HTTPS repository cloning.
10. **Deployment Assistant** — Auto-detects project stack, generates Dockerfiles and configs for Vercel, Netlify, Render, Hugging Face Spaces, AWS, and Microsoft Azure, lists environment variables, and clearly notes free vs. external paid cloud tiers.
11. **Model Management** — Detects Ollama installation & version, lists local models, pulls lightweight models on explicit user approval, configures temperature/top_p/num_ctx, and supports an optional OpenAI-compatible provider (disabled by default).
12. **Project Management & IDE Shell** — Dark/light themes, keyboard shortcuts (`Ctrl+1–9`, `Ctrl+B`, `Ctrl+J`, `Ctrl+S`), resizable right sidebar & bottom panel, and live security audit trail.

---

## Quick Start (Windows)

### 1. One-Click Launcher (Batch File)
Simply double-click:
```text
start_studio.bat
```
This automatically starts the local Ollama background service, launches the FastAPI backend on port 8000, starts the React + Vite frontend on port 5173, and opens your browser.

### 2. Live Public Internet Tunnel (Zero-Config)
To share your running studio or access it anywhere over a secure public HTTPS link:
```text
start_live_tunnel.bat
```
This automatically starts your backend, frontend, local Ollama, and a Cloudflare Tunnel providing an instant, secure public HTTPS URL (e.g. `https://<name>.trycloudflare.com`).

### 3. PowerShell Script
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_studio.ps1
```
- **Frontend IDE**: `http://127.0.0.1:5173`
- **Backend API & Swagger Docs**: `http://127.0.0.1:8000/docs`

### 2. Or Start Services Individually
```powershell
# Backend (FastAPI on port 8000)
powershell -ExecutionPolicy Bypass -File .\scripts\start_backend.ps1

# Frontend (React + Vite on port 5173)
powershell -ExecutionPolicy Bypass -File .\scripts\start_frontend.ps1
```

### 3. Enable Local AI Inference (Ollama — Free / ₹0)
Launch Ollama (or run `ollama serve`), then pull the lightweight 8 GB RAM starter model (~1 GB) from **Settings → Model Management** or via terminal:
```powershell
ollama pull qwen2.5-coder:1.5b
```

---

## Running Verification Tests

```powershell
# Environment & Phase 1 structure checks
powershell -ExecutionPolicy Bypass -File .\scripts\check_env.ps1
node --test .\tests\validation\validate_phase1.mjs

# Backend Pytest suite (27 tests covering API, sandbox security, agent, DB, terminal, git, builder, deploy)
.\backend\.venv\Scripts\python.exe -m pytest

# Frontend TypeScript check, Vitest suite & production build
cd frontend
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

---

## Security Architecture

- **Workspace Sandboxing**: All file, database, Git, and terminal operations are strictly confined to `workspace/<project_slug>` with path traversal (`..`), UNC, null-byte, symlink-escape, and Windows reserved device name (`CON`, `NUL`, `COM1`, etc.) blocking.
- **Explicit Approval Gates**: Agent file writes, non-allowlisted terminal commands, DDL/DML SQL writes, Git commits/clones, and Ollama model pulls require explicit user confirmation.
- **Reversible Backups & Audit Trail**: Overwritten/deleted files are automatically backed up to `.vardhan_backups/` and every sensitive action is recorded in SQLite `audit_logs` with secret redaction.
- **Prompt Injection Defense**: Imported project file contents are always wrapped inside `<UNTRUSTED_PROJECT_FILE>` delimiters and never treated as trusted system instructions.
- **Optional Network Auth**: Localhost-only binding (`127.0.0.1`) by default; optional `X-API-Key` enforcement (`API_AUTH_ENABLED=true`) if network access is enabled.

---

## External / Paid Services Notice

All core capabilities run locally at ₹0 cost. External OpenAI-compatible cloud APIs and paid cloud hosting tiers (AWS, Microsoft Azure, paid Vercel/Netlify/Render plans) are strictly optional and disabled by default.
