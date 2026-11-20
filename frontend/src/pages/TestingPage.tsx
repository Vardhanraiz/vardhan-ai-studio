import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Play, Sparkles, TestTube2, XCircle } from "lucide-react";
import { MessageContent } from "../components/CodeBlock";
import { api } from "../services/api";
import type { ConfirmDialogOptions, Project, TestReport, ToastType } from "../types";

interface TestingPageProps {
  activeProject: Project | null;
  onTestReport: (report: TestReport, output: string) => void;
  onLogOutput: (msg: string) => void;
  showToast?: (msg: string, type?: ToastType) => void;
  showConfirm?: (options: ConfirmDialogOptions) => void;
}

export function TestingPage({
  activeProject,
  onTestReport,
  onLogOutput,
  showToast,
  showConfirm,
}: TestingPageProps) {
  const [frameworks, setFrameworks] = useState<{ framework: string; command: string; type: string }[]>([]);
  const [runOutput, setRunOutput] = useState<string>("");
  const [lastReport, setLastReport] = useState<TestReport | null>(null);
  const [running, setRunning] = useState(false);

  const [targetFile, setTargetFile] = useState("backend/main.py");
  const [testType, setTestType] = useState<"unit" | "integration" | "browser">("unit");
  const [generated, setGenerated] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [genBusy, setGenBusy] = useState(false);

  const loadFrameworks = useCallback(async () => {
    if (!activeProject) return;
    const res = await api.detectTestFrameworks(activeProject.id);
    setFrameworks(res.frameworks);
  }, [activeProject]);

  useEffect(() => {
    setLastReport(null);
    setRunOutput("");
    loadFrameworks();
  }, [loadFrameworks]);

  const handleRunSuite = (fw: { framework: string; command: string }) => {
    if (!activeProject) return;

    const executeRun = async () => {
      setRunning(true);
      try {
        const res = await api.runTests(activeProject.id, {
          framework: fw.framework,
          command: fw.command,
          approved: true,
        });
        const combined = `${res.stdout}\n${res.stderr}`.trim();
        setRunOutput(combined || "(no output)");
        if (res.report) {
          setLastReport(res.report);
          onTestReport(res.report, combined);
          const isPassed = res.report.status === "passed";
          showToast?.(
            `${fw.framework.toUpperCase()}: ${res.report.passed} passed, ${res.report.failed} failed`,
            isPassed ? "success" : "error"
          );
          onLogOutput(`Test run (${fw.framework}): ${res.report.passed} passed, ${res.report.failed} failed`);
        }
      } catch (err) {
        showToast?.(`Failed to run ${fw.framework} tests`, "error");
      } finally {
        setRunning(false);
      }
    };

    if (showConfirm) {
      showConfirm({
        title: `Approve Running ${fw.framework.toUpperCase()} Tests`,
        message: `Run test command inside workspace/${activeProject.slug}?\n\nCommand:\n${fw.command}`,
        confirmLabel: "Approve & Run",
        variant: "primary",
        onConfirm: executeRun,
      });
      return;
    }

    if (!window.confirm(`Approve running test command in ${activeProject.slug}?\n\n${fw.command}`)) {
      return;
    }
    executeRun();
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !targetFile.trim()) return;
    setGenBusy(true);
    setGenError(null);
    setGenerated(null);
    try {
      const res = await api.generateTests(activeProject.id, {
        target_file: targetFile.trim(),
        test_type: testType,
      });
      if (!res.ai_available) {
        setGenError(res.error || "Local Ollama model unavailable.");
        showToast?.("AI model unavailable for test generation", "warning");
      } else {
        setGenerated(res.generated_tests);
        showToast?.(`Generated ${testType} tests for ${targetFile}`, "success");
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Test generation failed");
      showToast?.("Failed to generate tests", "error");
    } finally {
      setGenBusy(false);
    }
  };

  if (!activeProject) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-sm text-slate-500">
        Select an active project to detect, generate, and run tests.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <TestTube2 className="w-5 h-5 text-indigo-400" />
          AI Testing Agent
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Supports Pytest, Vitest, Node test runner, and Playwright with explicit command approval.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 space-y-3">
        <h2 className="text-sm font-semibold">Detected Test Suites</h2>
        {frameworks.length === 0 ? (
          <p className="text-xs text-slate-500">
            No test framework detected yet in {activeProject.slug}. Generate tests below or add pytest/vitest files.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {frameworks.map((fw) => (
              <div
                key={fw.framework}
                className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm uppercase">{fw.framework}</div>
                  <div className="text-xs text-slate-500">{fw.type}</div>
                  <div className="text-[11px] font-mono text-slate-400 truncate mt-1">{fw.command}</div>
                </div>
                <button
                  type="button"
                  disabled={running}
                  onClick={() => handleRunSuite(fw)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium inline-flex items-center gap-1 shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  Run
                </button>
              </div>
            ))}
          </div>
        )}

        {lastReport && (
          <div className="flex items-center gap-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-4 py-2.5 text-xs">
            {lastReport.status === "passed" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-500" />
            )}
            <span className="font-semibold uppercase">{lastReport.framework}</span>
            <span className="text-emerald-500 font-medium">Passed: {lastReport.passed}</span>
            <span className="text-rose-400 font-medium">Failed: {lastReport.failed}</span>
            <span className="text-slate-500">Exit code: {lastReport.exit_code}</span>
          </div>
        )}

        {runOutput && (
          <pre className="p-3 rounded-lg bg-slate-950 text-slate-200 text-xs font-mono overflow-x-auto max-h-64">
            {runOutput}
          </pre>
        )}
      </div>

      <form
        onSubmit={handleGenerate}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 space-y-3"
      >
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          Generate AI Tests for Project File
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            value={targetFile}
            onChange={(e) => setTargetFile(e.target.value)}
            placeholder="Relative file path (e.g., backend/main.py)"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono"
          />
          <select
            value={testType}
            onChange={(e) => setTestType(e.target.value as "unit" | "integration" | "browser")}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
          >
            <option value="unit">Unit Tests (Pytest / Vitest)</option>
            <option value="integration">Integration Tests</option>
            <option value="browser">Browser Tests (Playwright)</option>
          </select>
          <button
            type="submit"
            disabled={genBusy}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium"
          >
            {genBusy ? "Generating Tests..." : "Generate Tests"}
          </button>
        </div>
        {genError && <p className="text-xs text-rose-400">{genError}</p>}
        {generated && (
          <div className="pt-2">
            <MessageContent content={generated} />
          </div>
        )}
      </form>
    </div>
  );
}
