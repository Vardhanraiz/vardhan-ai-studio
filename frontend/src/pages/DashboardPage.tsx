import {
  Bot,
  Code2,
  Cpu,
  Database,
  FolderKanban,
  GitBranch,
  HardDrive,
  MessageSquare,
  Rocket,
  ShieldCheck,
  Sparkles,
  TestTube2,
} from "lucide-react";
import type { AuditLog, ModelsStatusResponse, NavSection, Project, SystemInfo } from "../types";

interface DashboardPageProps {
  systemInfo: SystemInfo | null;
  modelsStatus: ModelsStatusResponse | null;
  projects: Project[];
  activeProject: Project | null;
  auditLogs: AuditLog[];
  onNavigate: (section: NavSection) => void;
  onSelectProject: (project: Project) => void;
}

export function DashboardPage({
  systemInfo,
  modelsStatus,
  projects,
  activeProject,
  auditLogs,
  onNavigate,
  onSelectProject,
}: DashboardPageProps) {
  const ollamaRunning = modelsStatus?.ollama.running ?? false;
  const installedCount = modelsStatus?.ollama.models.length ?? 0;

  const quickModules: { id: NavSection; title: string; desc: string; icon: typeof Code2 }[] = [
    { id: "chat", title: "AI Chat Assistant", desc: "Stream code explanations, SQL, and refactoring locally", icon: MessageSquare },
    { id: "editor", title: "AI Code Editor", desc: "Multi-tab Monaco editor with file tree and AI actions", icon: Code2 },
    { id: "agent", title: "Autonomous Agent", desc: "Plan edits, review unified diffs, approve or revert safely", icon: Bot },
    { id: "builder", title: "App Builder", desc: "Generate verified full-stack apps from a single prompt", icon: Sparkles },
    { id: "database", title: "Database Assistant", desc: "Inspect SQLite schemas, ER links, and run SQL safely", icon: Database },
    { id: "testing", title: "Testing Agent", desc: "Detect & run Pytest, Vitest, Node, or Playwright suites", icon: TestTube2 },
    { id: "github", title: "GitHub & Git", desc: "Status, diffs, branches, approved commits, and clones", icon: GitBranch },
    { id: "deploy", title: "Deploy Assistant", desc: "Dockerfiles and configs for Vercel, Render, Azure & more", icon: Rocket },
  ];

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 mb-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            Local-First • ₹0 Core Budget • Sandboxed Workspace
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome to Vardhan AI Studio</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Unified AI coding editor, autonomous diff-approved agent, prompt-to-app builder, and DevOps suite optimized for Intel i3 &amp; 8 GB RAM.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onNavigate("builder")}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Build New App
          </button>
          <button
            type="button"
            onClick={() => onNavigate("projects")}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium inline-flex items-center gap-2"
          >
            <FolderKanban className="w-4 h-4" />
            Manage Projects
          </button>
        </div>
      </div>

      {/* Live Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Local AI Engine (Ollama)</span>
            <Cpu className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${ollamaRunning ? "bg-emerald-400" : "bg-amber-400"}`}
            />
            <span className="text-lg font-semibold">
              {ollamaRunning ? `Online (${installedCount} models)` : "Offline / Standby"}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
            Default: {modelsStatus?.config.default_model || systemInfo?.ollama_default_model || "qwen2.5-coder:1.5b"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Workspace Projects</span>
            <FolderKanban className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-lg font-semibold">{projects.length} Registered</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
            Active: {activeProject ? activeProject.name : "None selected"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Backend Runtime</span>
            <HardDrive className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-lg font-semibold">
            {systemInfo ? `Python ${systemInfo.python_version}` : "Connecting..."}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            DB: {systemInfo?.database_dialect || "sqlite"} • {systemInfo?.platform || "Windows"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Security &amp; Audit</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-lg font-semibold">{systemInfo?.audit_log_count ?? auditLogs.length} Events</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Cloud APIs: {systemInfo?.external_cloud_configured ? "Optional Enabled" : "Disabled (₹0 Local)"}
          </p>
        </div>
      </div>

      {/* Modules Grid */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
          Studio Modules
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {quickModules.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => onNavigate(mod.id)}
                className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 hover:border-indigo-500/60 hover:bg-slate-50 dark:hover:bg-slate-900 p-4 transition-colors"
              >
                <Icon className="w-5 h-5 text-indigo-500 dark:text-indigo-400 mb-2" />
                <div className="font-semibold text-sm">{mod.title}</div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{mod.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Projects & Audit Trail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Recent Projects</h2>
            <button
              type="button"
              onClick={() => onNavigate("projects")}
              className="text-xs text-indigo-500 hover:underline"
            >
              View all
            </button>
          </div>
          {projects.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              No projects yet. Create one in Projects or generate a complete app in App Builder.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {projects.slice(0, 5).map((p) => (
                <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-slate-500 truncate">
                      workspace/{p.relative_path} {p.tech_stack ? `• ${p.tech_stack}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectProject(p);
                      onNavigate("editor");
                    }}
                    className="px-2.5 py-1 text-xs rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white transition-colors shrink-0"
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-4">
          <h2 className="font-semibold text-sm mb-3">Recent Security Audit Trail</h2>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">No audit events recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {auditLogs.slice(0, 8).map((log) => (
                <div
                  key={log.id}
                  className="text-xs rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 px-3 py-2 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <span className="font-mono font-semibold text-indigo-500 dark:text-indigo-300">
                      {log.action}
                    </span>
                    {log.target_path && (
                      <span className="text-slate-500 ml-2 truncate">{log.target_path}</span>
                    )}
                  </div>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                      log.status === "success"
                        ? "bg-emerald-500/15 text-emerald-500"
                        : "bg-amber-500/15 text-amber-500"
                    }`}
                  >
                    {log.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
