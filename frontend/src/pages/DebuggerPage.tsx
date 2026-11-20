import { useState } from "react";
import { Bug, Search } from "lucide-react";
import { MessageContent } from "../components/CodeBlock";
import { api } from "../services/api";
import type { Project } from "../types";

interface DebuggerPageProps {
  activeProject: Project | null;
  onLogError: (source: string, msg: string) => void;
}

export function DebuggerPage({ activeProject, onLogError }: DebuggerPageProps) {
  const [errorText, setErrorText] = useState("");
  const [filePath, setFilePath] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.analyzeError>> | null>(null);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!errorText.trim()) return;
    setBusy(true);
    try {
      const res = await api.analyzeError({
        error_text: errorText,
        project_id: activeProject?.id ?? null,
        file_path: filePath.trim() || null,
      });
      setResult(res);
      if (res.parsed.primary_message) {
        onLogError(`Debugger (${res.parsed.category})`, res.parsed.primary_message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Bug className="w-5 h-5 text-rose-400" />
          AI Debugging Assistant
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Parses Python exceptions, JavaScript/TypeScript/React stack traces, API failures, and SQLite/SQL errors with root-cause and fix suggestions.
        </p>
      </div>

      <form
        onSubmit={handleAnalyze}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 space-y-3"
      >
        <textarea
          rows={6}
          value={errorText}
          onChange={(e) => setErrorText(e.target.value)}
          required
          placeholder="Paste a stack trace, compiler error, API response error, or SQLite exception here..."
          className="w-full font-mono text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3"
        />
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            placeholder="Optional project file path for extra context (e.g., backend/main.py)"
            className="flex-1 min-w-[220px] text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
          />
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            {busy ? "Analyzing..." : "Analyze Error"}
          </button>
        </div>
      </form>

      {result && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-semibold px-2 py-0.5 rounded bg-rose-500/15 text-rose-400">
                {result.parsed.category}
              </span>
              <span className="text-sm font-mono font-semibold">{result.parsed.primary_message}</span>
            </div>

            {result.parsed.frames.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-500">Extracted Stack Frames</div>
                {result.parsed.frames.map((f, idx) => (
                  <div key={idx} className="text-xs font-mono text-slate-400">
                    {f.file}:{f.line} {f.symbol ? `(${f.symbol})` : ""}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4">
            <h2 className="text-sm font-semibold mb-2">AI Root Cause &amp; Suggested Fix</h2>
            {result.ai_available ? (
              <MessageContent content={result.ai_analysis} />
            ) : (
              <p className="text-xs text-amber-400">
                Local AI model unavailable ({result.ai_error}). Deterministic stack-frame parsing completed above; start Ollama to enable AI fix suggestions.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
