import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  Bot,
  Bug,
  Code2,
  Database,
  FolderKanban,
  GitBranch,
  LayoutDashboard,
  MessageSquare,
  Moon,
  PanelBottom,
  PanelRight,
  Play,
  Rocket,
  Settings,
  Sparkles,
  Sun,
  Terminal as TerminalIcon,
  TestTube2,
} from "lucide-react";
import { MessageContent } from "../components/CodeBlock";
import { api } from "../services/api";
import type {
  AgentTask,
  AuditLog,
  DiagnosticItem,
  ModelsStatusResponse,
  NavSection,
  Project,
  TerminalResult,
  TestReport,
} from "../types";

interface StudioLayoutProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  projects: Project[];
  activeProject: Project | null;
  onSelectProject: (project: Project | null) => void;
  modelsStatus: ModelsStatusResponse | null;
  auditLogs: AuditLog[];
  agentTasks: AgentTask[];
  diagnostics: DiagnosticItem[];
  outputLines: string[];
  lastTestRun: { report: TestReport; output: string } | null;
  darkMode: boolean;
  onToggleTheme: () => void;
  onLogOutput: (line: string) => void;
  onLogError: (source: string, message: string) => void;
  children: ReactNode;
}

const NAV_ITEMS: { id: NavSection; label: string; icon: typeof LayoutDashboard; shortcut?: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, shortcut: "1" },
  { id: "projects", label: "Projects", icon: FolderKanban, shortcut: "2" },
  { id: "chat", label: "AI Chat", icon: MessageSquare, shortcut: "3" },
  { id: "editor", label: "Code Editor", icon: Code2, shortcut: "4" },
  { id: "agent", label: "Agent Mode", icon: Bot, shortcut: "5" },
  { id: "builder", label: "App Builder", icon: Sparkles, shortcut: "6" },
  { id: "database", label: "Database", icon: Database, shortcut: "7" },
  { id: "testing", label: "Testing", icon: TestTube2, shortcut: "8" },
  { id: "github", label: "GitHub", icon: GitBranch, shortcut: "9" },
  { id: "debugger", label: "Debugger", icon: Bug },
  { id: "deploy", label: "Deploy", icon: Rocket },
  { id: "settings", label: "Settings", icon: Settings },
];

export function StudioLayout({
  activeSection,
  onNavigate,
  projects,
  activeProject,
  onSelectProject,
  modelsStatus,
  auditLogs,
  agentTasks,
  diagnostics,
  outputLines,
  lastTestRun,
  darkMode,
  onToggleTheme,
  onLogOutput,
  onLogError,
  children,
}: StudioLayoutProps) {
  const [showRight, setShowRight] = useState(true);
  const [showBottom, setShowBottom] = useState(true);
  const [rightWidth, setRightWidth] = useState(300);
  const [bottomHeight, setBottomHeight] = useState(200);
  const [rightTab, setRightTab] = useState<"assistant" | "context" | "changes" | "activity" | "errors">("assistant");
  const [bottomTab, setBottomTab] = useState<"terminal" | "problems" | "output" | "tests">("terminal");

  // Integrated Terminal state
  const [termCmd, setTermCmd] = useState("");
  const [termHistory, setTermHistory] = useState<TerminalResult[]>([]);
  const [pendingCmd, setPendingCmd] = useState<string | null>(null);
  const [termBusy, setTermBusy] = useState(false);

  // Quick right-sidebar AI assistant
  const [quickPrompt, setQuickPrompt] = useState("");
  const [quickReply, setQuickReply] = useState<string | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "b") {
        e.preventDefault();
        setShowRight((v) => !v);
      } else if (key === "j") {
        e.preventDefault();
        setShowBottom((v) => !v);
      } else if (key >= "1" && key <= "9") {
        const match = NAV_ITEMS.find((item) => item.shortcut === key);
        if (match) {
          e.preventDefault();
          onNavigate(match.id);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onNavigate]);

  const startRightResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = rightWidth;
    const onMove = (mv: MouseEvent) => {
      const next = Math.min(520, Math.max(220, startW + (startX - mv.clientX)));
      setRightWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startBottomResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = bottomHeight;
    const onMove = (mv: MouseEvent) => {
      const next = Math.min(420, Math.max(120, startH + (startY - mv.clientY)));
      setBottomHeight(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const executeTerminal = async (command: string, approved: boolean) => {
    if (!activeProject || !command.trim()) return;
    setTermBusy(true);
    setPendingCmd(null);
    try {
      const res = await api.runTerminal({
        project_id: activeProject.id,
        command: command.trim(),
        approved,
      });
      if (res.approval_required) {
        setPendingCmd(command.trim());
      } else {
        setTermHistory((prev) => [...prev, res]);
        setTermCmd("");
        onLogOutput(`Terminal [${res.exit_code}]: ${res.command}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Terminal execution blocked";
      onLogError("Terminal", msg);
      setTermHistory((prev) => [
        ...prev,
        {
          executed: false,
          approval_required: false,
          risk_level: "blocked",
          reason: msg,
          command,
          cwd: activeProject.relative_path,
          stdout: "",
          stderr: msg,
          exit_code: -1,
          duration_ms: 0,
        },
      ]);
    } finally {
      setTermBusy(false);
    }
  };

  const runQuickAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPrompt.trim()) return;
    setQuickBusy(true);
    try {
      const res = await api.sendChat({
        project_id: activeProject?.id ?? null,
        message: quickPrompt.trim(),
      });
      setQuickReply(res.reply.content);
      setQuickPrompt("");
    } catch (err) {
      setQuickReply(`Error: ${err instanceof Error ? err.message : "AI offline"}`);
    } finally {
      setQuickBusy(false);
    }
  };

  const pendingChanges = agentTasks.flatMap((t) =>
    t.changes.filter((c) => c.status === "pending").map((c) => ({ taskId: t.id, ...c }))
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none">
      {/* Top Header Bar */}
      <header className="h-12 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 font-bold text-sm tracking-tight shrink-0">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 text-white flex items-center justify-center font-mono text-xs">
              VA
            </span>
            <span>Vardhan AI Studio</span>
          </div>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-800" />

          <select
            aria-label="Active Project"
            value={activeProject?.id ?? ""}
            onChange={(e) => {
              const id = Number(e.target.value);
              const found = projects.find((p) => p.id === id) ?? null;
              onSelectProject(found);
            }}
            className="text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 max-w-[220px] truncate"
          >
            <option value="">No Active Project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate("settings")}
            className="hidden sm:inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                modelsStatus?.ollama.running ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            <span className="font-mono">{modelsStatus?.config.default_model || "qwen2.5-coder:1.5b"}</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            title="Toggle Dark / Light Theme"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-800"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </button>
          <button
            type="button"
            onClick={() => setShowBottom((v) => !v)}
            title="Toggle Bottom Panel (Ctrl+J)"
            className={`p-1.5 rounded-lg ${
              showBottom ? "bg-indigo-600/20 text-indigo-400" : "hover:bg-slate-200/70 dark:hover:bg-slate-800"
            }`}
          >
            <PanelBottom className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowRight((v) => !v)}
            title="Toggle Right Sidebar (Ctrl+B)"
            className={`p-1.5 rounded-lg ${
              showRight ? "bg-indigo-600/20 text-indigo-400" : "hover:bg-slate-200/70 dark:hover:bg-slate-800"
            }`}
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Workspace Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Navigation Sidebar */}
        <nav
          aria-label="Main Navigation"
          className="w-52 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-2 flex flex-col justify-between shrink-0 overflow-y-auto"
        >
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? "bg-indigo-600 text-white"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </span>
                  {item.shortcut && (
                    <span className={`text-[10px] font-mono ${active ? "text-indigo-200" : "text-slate-400"}`}>
                      ^{item.shortcut}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="px-2 pt-3 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-500">
            Shortcuts: ^1-9 Nav • ^B Right • ^J Panel • ^S Save
          </div>
        </nav>

        {/* Center + Bottom Panel Column */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 select-text">
          <main className="flex-1 min-h-0 overflow-hidden bg-slate-50 dark:bg-slate-950">
            {children}
          </main>

          {showBottom && (
            <>
              <div
                onMouseDown={startBottomResize}
                className="h-1 bg-slate-200 dark:bg-slate-800 hover:bg-indigo-500 cursor-row-resize shrink-0"
              />
              <section
                style={{ height: `${bottomHeight}px` }}
                className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0"
              >
                <div className="px-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {(
                      [
                        { id: "terminal", label: "Terminal", icon: TerminalIcon },
                        { id: "problems", label: `Problems (${diagnostics.length})`, icon: AlertCircle },
                        { id: "output", label: "Output", icon: Activity },
                        { id: "tests", label: "Test Results", icon: TestTube2 },
                      ] as const
                    ).map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setBottomTab(tab.id)}
                          className={`px-3 py-1.5 text-xs inline-flex items-center gap-1.5 border-b-2 ${
                            bottomTab === tab.id
                              ? "border-indigo-500 text-indigo-500 dark:text-indigo-300 font-medium"
                              : "border-transparent text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 font-mono text-xs">
                  {bottomTab === "terminal" && (
                    <div className="space-y-2">
                      {!activeProject ? (
                        <p className="text-slate-500">Select an active project to use the sandboxed PowerShell terminal.</p>
                      ) : (
                        <>
                          <div className="space-y-2">
                            {termHistory.map((item, idx) => (
                              <div key={idx} className="space-y-0.5">
                                <div className="text-indigo-400">
                                  PS workspace/{item.cwd}&gt; {item.command}{" "}
                                  <span className="text-[10px] text-slate-500">
                                    (exit {item.exit_code}, {item.duration_ms}ms)
                                  </span>
                                </div>
                                {item.stdout && (
                                  <pre className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{item.stdout}</pre>
                                )}
                                {item.stderr && (
                                  <pre className="whitespace-pre-wrap text-rose-400">{item.stderr}</pre>
                                )}
                              </div>
                            ))}
                          </div>

                          {pendingCmd && (
                            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 flex items-center justify-between gap-2">
                              <span className="text-amber-400">
                                Approval required to run: <code>{pendingCmd}</code>
                              </span>
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => executeTerminal(pendingCmd, true)}
                                  className="px-2 py-1 rounded bg-amber-600 text-white"
                                >
                                  Approve &amp; Run
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPendingCmd(null)}
                                  className="px-2 py-1 rounded bg-slate-700 text-white"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              executeTerminal(termCmd, false);
                            }}
                            className="flex items-center gap-2 pt-1"
                          >
                            <span className="text-emerald-500 shrink-0">
                              PS workspace/{activeProject.relative_path}&gt;
                            </span>
                            <input
                              value={termCmd}
                              onChange={(e) => setTermCmd(e.target.value)}
                              disabled={termBusy}
                              placeholder="Enter PowerShell command (e.g., dir, git status, pytest)..."
                              className="flex-1 bg-transparent focus:outline-none text-slate-900 dark:text-slate-100"
                            />
                            <button
                              type="submit"
                              disabled={termBusy || !termCmd.trim()}
                              className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white inline-flex items-center gap-1"
                            >
                              <Play className="w-3 h-3" />
                              Run
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  )}

                  {bottomTab === "problems" && (
                    <div className="space-y-1.5">
                      {diagnostics.length === 0 ? (
                        <p className="text-slate-500">No problems detected.</p>
                      ) : (
                        diagnostics.map((d) => (
                          <div key={d.id} className="text-rose-400">
                            [{d.source}] {d.message}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {bottomTab === "output" && (
                    <div className="space-y-1">
                      {outputLines.length === 0 ? (
                        <p className="text-slate-500">Studio output log is ready.</p>
                      ) : (
                        outputLines.map((line, i) => (
                          <div key={i} className="text-slate-600 dark:text-slate-300">
                            {line}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {bottomTab === "tests" && (
                    <div>
                      {!lastTestRun ? (
                        <p className="text-slate-500">Run a test suite from Testing Agent to see results here.</p>
                      ) : (
                        <div className="space-y-2">
                          <div className="font-semibold">
                            {lastTestRun.report.framework.toUpperCase()} — Passed: {lastTestRun.report.passed} | Failed:{" "}
                            {lastTestRun.report.failed}
                          </div>
                          <pre className="whitespace-pre-wrap text-slate-400">{lastTestRun.output}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>

        {/* Resizable Right Sidebar */}
        {showRight && (
          <>
            <div
              onMouseDown={startRightResize}
              className="w-1 bg-slate-200 dark:bg-slate-800 hover:bg-indigo-500 cursor-col-resize shrink-0"
            />
            <aside
              style={{ width: `${rightWidth}px` }}
              className="border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0 select-text"
            >
              <div className="flex border-b border-slate-200 dark:border-slate-800 text-[11px] overflow-x-auto">
                {(
                  [
                    ["assistant", "AI"],
                    ["context", "Context"],
                    ["changes", `Changes (${pendingChanges.length})`],
                    ["activity", "Activity"],
                    ["errors", `Errors (${diagnostics.length})`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setRightTab(id)}
                    className={`px-2.5 py-2 border-b-2 shrink-0 ${
                      rightTab === id
                        ? "border-indigo-500 text-indigo-500 dark:text-indigo-300 font-medium"
                        : "border-transparent text-slate-500"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-3 text-xs space-y-3">
                {rightTab === "assistant" && (
                  <div className="space-y-3">
                    <form onSubmit={runQuickAssistant} className="space-y-2">
                      <textarea
                        rows={3}
                        value={quickPrompt}
                        onChange={(e) => setQuickPrompt(e.target.value)}
                        placeholder="Quick AI coding question..."
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-2 text-xs"
                      />
                      <button
                        type="submit"
                        disabled={quickBusy}
                        className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium"
                      >
                        {quickBusy ? "Asking Local AI..." : "Ask Assistant"}
                      </button>
                    </form>
                    {quickReply && <MessageContent content={quickReply} />}
                  </div>
                )}

                {rightTab === "context" && (
                  <div className="space-y-2">
                    <div className="font-semibold">Active Project Context</div>
                    {activeProject ? (
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2.5 space-y-1">
                        <div className="font-semibold">{activeProject.name}</div>
                        <div className="font-mono text-slate-500">workspace/{activeProject.relative_path}</div>
                        <div className="text-slate-400">{activeProject.tech_stack || "Custom stack"}</div>
                        <div className="text-slate-500">{activeProject.description || "No description"}</div>
                      </div>
                    ) : (
                      <p className="text-slate-500">No project selected.</p>
                    )}
                  </div>
                )}

                {rightTab === "changes" && (
                  <div className="space-y-2">
                    {pendingChanges.length === 0 ? (
                      <p className="text-slate-500">No pending agent file changes.</p>
                    ) : (
                      pendingChanges.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => onNavigate("agent")}
                          className="w-full text-left rounded-lg border border-amber-500/40 bg-amber-500/5 p-2"
                        >
                          <div className="font-mono font-semibold text-amber-400">{c.file_path}</div>
                          <div className="text-[11px] text-slate-400">
                            Task #{c.taskId} • {c.change_type} • awaiting approval
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {rightTab === "activity" && (
                  <div className="space-y-1.5">
                    {auditLogs.slice(0, 20).map((log) => (
                      <div
                        key={log.id}
                        className="rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2"
                      >
                        <div className="font-mono text-indigo-400">{log.action}</div>
                        <div className="text-[11px] text-slate-500 truncate">{log.target_path || log.status}</div>
                      </div>
                    ))}
                  </div>
                )}

                {rightTab === "errors" && (
                  <div className="space-y-2">
                    {diagnostics.length === 0 ? (
                      <p className="text-slate-500">No active errors.</p>
                    ) : (
                      diagnostics.map((d) => (
                        <div key={d.id} className="rounded bg-rose-500/10 border border-rose-500/30 p-2 text-rose-400">
                          <div className="font-semibold">{d.source}</div>
                          <div>{d.message}</div>
                        </div>
                      ))
                    )}
                    <button
                      type="button"
                      onClick={() => onNavigate("debugger")}
                      className="w-full py-1.5 rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                    >
                      Open AI Debugger
                    </button>
                  </div>
                )}
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
