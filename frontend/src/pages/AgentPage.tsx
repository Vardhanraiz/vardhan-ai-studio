import { useCallback, useEffect, useState } from "react";
import { Bot, CheckCircle2, Play, RotateCcw, ShieldAlert, XCircle } from "lucide-react";
import { api } from "../services/api";
import type { AgentTask, Project, ToastType } from "../types";

interface AgentPageProps {
  activeProject: Project | null;
  onTasksChange: (tasks: AgentTask[]) => void;
  onLogOutput: (msg: string) => void;
  showToast?: (msg: string, type?: ToastType) => void;
}

export function AgentPage({ activeProject, onTasksChange, onLogOutput, showToast }: AgentPageProps) {
  const [instruction, setInstruction] = useState("");
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (!activeProject) {
      setTasks([]);
      onTasksChange([]);
      return;
    }
    const list = await api.listAgentTasks(activeProject.id);
    setTasks(list);
    onTasksChange(list);
  }, [activeProject, onTasksChange]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handlePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !instruction.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const task = await api.planAgentTask({
        project_id: activeProject.id,
        instruction: instruction.trim(),
      });
      setInstruction("");
      await loadTasks();
      showToast?.(`Agent generated plan #${task.id} (${task.changes.length} changes)`, "info");
      onLogOutput(`Agent created plan #${task.id} (${task.changes.length} proposed file changes).`);
    } catch (err) {
      showToast?.("Agent planning failed", "error");
      setError(err instanceof Error ? err.message : "Agent planning failed");
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async (taskId: number, changeIds?: number[]) => {
    try {
      const updated = await api.approveAgentChanges(taskId, changeIds);
      await loadTasks();
      showToast?.(`Approved changes on Task #${updated.id}`, "success");
      onLogOutput(`Approved changes on agent task #${updated.id} (status: ${updated.status}).`);
    } catch (err) {
      showToast?.("Failed to apply approved changes", "error");
    }
  };

  const handleReject = async (taskId: number, changeIds?: number[]) => {
    try {
      const updated = await api.rejectAgentChanges(taskId, changeIds);
      await loadTasks();
      showToast?.(`Rejected changes on Task #${updated.id}`, "info");
      onLogOutput(`Rejected changes on agent task #${updated.id}.`);
    } catch (err) {
      showToast?.("Failed to reject changes", "error");
    }
  };

  const handleRevert = async (taskId: number, changeId: number) => {
    try {
      await api.revertAgentChange(taskId, changeId);
      await loadTasks();
      showToast?.(`Reverted change #${changeId} to backup`, "info");
      onLogOutput(`Reverted change #${changeId} from backup.`);
    } catch (err) {
      showToast?.("Failed to revert change", "error");
    }
  };

  if (!activeProject) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-center text-sm text-slate-500">
        Select an active project first to run the Autonomous Coding Agent.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-400" />
            Autonomous Coding Agent
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Inspects <code className="font-mono">workspace/{activeProject.relative_path}</code>, creates an implementation plan, generates unified diffs, and waits for your explicit approval before writing files.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-xs font-medium">
          <ShieldAlert className="w-4 h-4" />
          Approval &amp; Backups Enforced
        </div>
      </div>

      <form
        onSubmit={handlePlan}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 space-y-3"
      >
        <textarea
          rows={3}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          required
          placeholder="Describe what you want the coding agent to build, refactor, or fix in this project..."
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-sm"
        />
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || !instruction.trim()}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium inline-flex items-center gap-2"
        >
          <Play className="w-4 h-4" />
          {busy ? "Analyzing Project & Planning..." : "Generate Plan & Proposed Diffs"}
        </button>
      </form>

      <div className="space-y-4">
        {tasks.map((task) => {
          const hasPending = task.changes.some((c) => c.status === "pending");
          return (
            <div
              key={task.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-mono text-slate-500">
                    Task #{task.id} • Model: {task.model_name}
                  </div>
                  <h3 className="font-semibold text-base mt-0.5">{task.instruction}</h3>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-400 font-medium">
                  {task.status}
                </span>
              </div>

              {task.summary && (
                <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-950 rounded-lg p-3">
                  {task.summary}
                </p>
              )}

              {task.plan.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Implementation Plan
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-xs text-slate-700 dark:text-slate-300">
                    {task.plan.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              {task.changes.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Proposed File Changes ({task.changes.length})
                    </span>
                    {hasPending && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleApprove(task.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approve &amp; Apply All
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(task.id)}
                          className="px-3 py-1.5 rounded-lg border border-rose-500/50 text-rose-400 hover:bg-rose-500/10 text-xs font-medium inline-flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject All
                        </button>
                      </div>
                    )}
                  </div>

                  {task.changes.map((ch) => (
                    <div
                      key={ch.id}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden"
                    >
                      <div className="px-3 py-2 bg-slate-100 dark:bg-slate-950 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold">{ch.file_path}</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 uppercase text-[10px]">
                            {ch.change_type}
                          </span>
                          <span className="text-slate-500">{ch.status}</span>
                        </div>
                        <div className="flex gap-1.5">
                          {ch.status === "pending" && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApprove(task.id, [ch.id])}
                                className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReject(task.id, [ch.id])}
                                className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {ch.status === "applied" && (
                            <button
                              type="button"
                              onClick={() => handleRevert(task.id, ch.id)}
                              className="px-2 py-1 rounded border border-amber-500/50 text-amber-400 hover:bg-amber-500/10 inline-flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Revert Backup
                            </button>
                          )}
                        </div>
                      </div>
                      <pre className="p-3 text-xs font-mono overflow-x-auto bg-slate-950 text-slate-200 max-h-60">
                        {ch.unified_diff || ch.proposed_content}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
