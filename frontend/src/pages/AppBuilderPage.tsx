import { useState } from "react";
import { CheckCircle2, Eye, FolderOpen, Sparkles, XCircle } from "lucide-react";
import { api } from "../services/api";
import type { NavSection, Project, ToastType } from "../types";

interface AppBuilderPageProps {
  onProjectCreated: (project: Project) => Promise<void>;
  onNavigate: (section: NavSection) => void;
  onLogOutput: (msg: string) => void;
  showToast?: (msg: string, type?: ToastType) => void;
}

export function AppBuilderPage({
  onProjectCreated,
  onNavigate,
  onLogOutput,
  showToast,
}: AppBuilderPageProps) {
  const [appName, setAppName] = useState("Employee Management System");
  const [prompt, setPrompt] = useState(
    "Create an employee management system with login, registration, employee CRUD operations, department management and admin dashboard."
  );
  const [frontendStack, setFrontendStack] = useState("HTML/CSS/JavaScript");
  const [backendStack, setBackendStack] = useState("Python FastAPI");
  const [databaseStack, setDatabaseStack] = useState("SQLite");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.buildApplication>> | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.buildApplication({
        app_name: appName.trim(),
        prompt: prompt.trim(),
        frontend_stack: frontendStack,
        backend_stack: backendStack,
        database_stack: databaseStack,
      });
      setResult(res);
      await onProjectCreated(res.project);
      showToast?.(`Application '${res.project.name}' generated & verified (${res.created_files.length} files)!`, "success");
      onLogOutput(
        `App Builder created '${res.project.name}' (${res.created_files.length} files, verified=${res.verified}).`
      );
    } catch (err) {
      showToast?.("Failed to generate application", "error");
      setError(err instanceof Error ? err.message : "App generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          AI Prompt-to-Application Builder
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Generates real backend APIs, frontend UI, SQL schemas, tests, and verifies every file on disk before reporting completion.
        </p>
      </div>

      <form
        onSubmit={handleGenerate}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-5 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            required
            placeholder="Application Name"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
          />
          <select
            value={frontendStack}
            onChange={(e) => setFrontendStack(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
          >
            <option value="HTML/CSS/JavaScript">Frontend: HTML/CSS/JS</option>
            <option value="React">Frontend: React</option>
          </select>
          <select
            value={backendStack}
            onChange={(e) => setBackendStack(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
          >
            <option value="Python FastAPI">Backend: Python FastAPI</option>
            <option value="Node.js">Backend: Node.js</option>
            <option value="ASP.NET Core">Backend: ASP.NET Core</option>
          </select>
          <select
            value={databaseStack}
            onChange={(e) => setDatabaseStack(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
          >
            <option value="SQLite">Database: SQLite</option>
            <option value="PostgreSQL">Database: PostgreSQL</option>
            <option value="SQL Server">Database: SQL Server</option>
          </select>
        </div>

        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          required
          placeholder="Describe your application requirements, modules, and workflows..."
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-sm"
        />

        {error && <p className="text-xs text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium inline-flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          {busy ? "Generating & Verifying Application..." : "Generate & Verify Application"}
        </button>
      </form>

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm">Verification Checks</h2>
                <button
                  type="button"
                  onClick={() => onNavigate("editor")}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 text-white text-xs"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Open in Editor
                </button>
              </div>
              <div className="space-y-2">
                {result.checks.map((c, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 p-2.5 border border-slate-200 dark:border-slate-800"
                  >
                    {c.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    )}
                    <div>
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-slate-500">{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Generated Files ({result.created_files.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.created_files.map((f) => (
                    <span
                      key={f}
                      className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  How to Run Locally
                </div>
                <ol className="list-decimal list-inside text-xs font-mono space-y-1 text-slate-600 dark:text-slate-300">
                  {result.run_instructions.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="font-semibold inline-flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-indigo-400" />
                  Live Local Application Preview
                </span>
                <span className="font-mono text-slate-500">{result.preview_file}</span>
              </div>
              <iframe
                title="Generated Application Preview"
                src={`/api/v1/projects/${result.project.id}/preview/${result.preview_file}`}
                className="w-full h-[420px] bg-slate-950"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
