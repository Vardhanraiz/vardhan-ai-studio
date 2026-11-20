import { useCallback, useEffect, useState } from "react";
import { Download, GitBranch, GitCommit, RefreshCw, Sparkles } from "lucide-react";
import { api } from "../services/api";
import type { ConfirmDialogOptions, Project, ToastType } from "../types";

interface GitHubPageProps {
  activeProject: Project | null;
  onRefreshProjects: () => Promise<void>;
  onLogOutput: (msg: string) => void;
  showToast?: (msg: string, type?: ToastType) => void;
  showConfirm?: (options: ConfirmDialogOptions) => void;
}

export function GitHubPage({
  activeProject,
  onRefreshProjects,
  onLogOutput,
  showToast,
  showConfirm,
}: GitHubPageProps) {
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof api.getGitOverview>> | null>(null);
  const [commitMsg, setCommitMsg] = useState("");
  const [branchName, setBranchName] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneName, setCloneName] = useState("");
  const [cloneSlug, setCloneSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadGit = useCallback(async () => {
    if (!activeProject) return;
    try {
      const data = await api.getGitOverview(activeProject.id);
      setOverview(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to inspect Git");
    }
  }, [activeProject]);

  useEffect(() => {
    setOverview(null);
    loadGit();
  }, [loadGit]);

  const handleInit = async () => {
    if (!activeProject) return;
    await api.initGit(activeProject.id);
    await loadGit();
    onLogOutput(`Initialized Git repository in workspace/${activeProject.relative_path}`);
  };

  const handleCommit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !commitMsg.trim()) return;

    const executeCommit = async () => {
      try {
        await api.commitGit(activeProject.id, { message: commitMsg.trim(), approved: true });
        showToast?.(`Created commit: "${commitMsg.trim()}"`, "success");
        setCommitMsg("");
        await loadGit();
        onLogOutput(`Created Git commit in ${activeProject.slug}.`);
      } catch (err) {
        showToast?.("Git commit failed", "error");
        setError(err instanceof Error ? err.message : "Commit failed");
      }
    };

    if (showConfirm) {
      showConfirm({
        title: "Approve Git Commit",
        message: `Confirm creating Git commit in '${activeProject.slug}' with message:\n\n"${commitMsg.trim()}"`,
        confirmLabel: "Approve & Commit",
        variant: "primary",
        onConfirm: executeCommit,
      });
      return;
    }

    if (window.confirm(`Approve creating Git commit?\n\nMessage: ${commitMsg.trim()}`)) {
      executeCommit();
    }
  };

  const handleGenerateCommitMessage = async () => {
    if (!overview?.diff) {
      setError("No unstaged/staged diff to summarize.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.runCodeAction({
        action: "commit_message",
        code: overview.diff.slice(0, 6000),
        language: "diff",
      });
      setCommitMsg(res.result.split("\n")[0].replace(/^["'`]|["'`]$/g, "").trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI commit message failed");
    } finally {
      setBusy(false);
    }
  };

  const handleBranch = async (create: boolean) => {
    if (!activeProject || !branchName.trim()) return;
    try {
      await api.switchBranch(activeProject.id, { branch_name: branchName.trim(), create });
      setBranchName("");
      await loadGit();
      onLogOutput(`Switched/created branch '${branchName.trim()}'.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Branch operation failed");
    }
  };

  const handleClone = (e: React.FormEvent) => {
    e.preventDefault();

    const executeClone = async () => {
      try {
        await api.cloneRepo({
          repo_url: cloneUrl.trim(),
          project_name: cloneName.trim(),
          slug: cloneSlug.trim(),
          approved: true,
        });
        showToast?.(`Cloned repository into workspace/${cloneSlug.trim()}`, "success");
        setCloneUrl("");
        setCloneName("");
        setCloneSlug("");
        await onRefreshProjects();
        onLogOutput(`Cloned repository into workspace/${cloneSlug.trim()}`);
      } catch (err) {
        showToast?.("Repository clone failed", "error");
        setError(err instanceof Error ? err.message : "Clone failed");
      }
    };

    if (showConfirm) {
      showConfirm({
        title: "Approve Remote Git Clone",
        message: `Approve cloning remote repository:\n${cloneUrl.trim()}\n\nTarget directory: workspace/${cloneSlug.trim()}`,
        confirmLabel: "Approve Clone",
        variant: "primary",
        onConfirm: executeClone,
      });
      return;
    }

    if (window.confirm(`Approve cloning remote repository?\n\n${cloneUrl}`)) {
      executeClone();
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-indigo-400" />
            GitHub &amp; Git Integration
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Official local Git CLI integration with explicit approval for commits and clones. No PATs stored in frontend code.
          </p>
        </div>
        {activeProject && (
          <button
            type="button"
            onClick={loadGit}
            className="p-2 rounded-lg border border-slate-300 dark:border-slate-700"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
          {error}
        </div>
      )}

      {activeProject && overview && !overview.status.initialized && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-5 flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm">Git is not initialized in {activeProject.name}</div>
            <p className="text-xs text-slate-500 mt-0.5">Initialize a local repository to track changes, branches, and commits.</p>
          </div>
          <button
            type="button"
            onClick={handleInit}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
          >
            Initialize Git Repo
          </button>
        </div>
      )}

      {activeProject && overview?.status.initialized && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">
                Branch: <span className="font-mono text-indigo-400">{overview.status.branch}</span>
              </span>
              <span className="text-xs text-slate-500">{overview.status.changes.length} changed files</span>
            </div>

            <div className="flex gap-2">
              <input
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="Branch name (e.g., feature/auth)"
                className="flex-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5"
              />
              <button
                type="button"
                onClick={() => handleBranch(true)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => handleBranch(false)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs"
              >
                Switch
              </button>
            </div>

            <form onSubmit={handleCommit} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Commit Changes</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleGenerateCommitMessage}
                  className="text-xs text-indigo-400 hover:underline inline-flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  AI Commit Message
                </button>
              </div>
              <input
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                placeholder="feat: implement employee API endpoints"
                className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5"
              >
                <GitCommit className="w-3.5 h-3.5" />
                Stage All &amp; Commit (With Approval)
              </button>
            </form>

            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1.5">Working Tree Changes</div>
              {overview.status.changes.length === 0 ? (
                <p className="text-xs text-slate-500">Working tree clean.</p>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {overview.status.changes.map((c, i) => (
                    <div key={i} className="text-xs font-mono flex gap-2">
                      <span className="text-amber-400 w-6">{c.code}</span>
                      <span className="truncate">{c.path}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 space-y-3">
            <h2 className="text-sm font-semibold">Commit History</h2>
            {overview.commits.length === 0 ? (
              <p className="text-xs text-slate-500">No commits yet.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {overview.commits.map((c) => (
                  <div
                    key={c.hash}
                    className="rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between font-mono text-[11px] text-slate-500">
                      <span className="text-indigo-400">{c.hash}</span>
                      <span>{c.date}</span>
                    </div>
                    <div className="font-medium mt-0.5">{c.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Clone Public GitHub Repo */}
      <form
        onSubmit={handleClone}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 space-y-3"
      >
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Download className="w-4 h-4 text-cyan-400" />
          Clone GitHub Repository into Sandboxed Workspace
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            value={cloneUrl}
            onChange={(e) => setCloneUrl(e.target.value)}
            required
            placeholder="https://github.com/owner/repo.git"
            className="text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
          />
          <input
            value={cloneName}
            onChange={(e) => setCloneName(e.target.value)}
            required
            placeholder="Project Name"
            className="text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
          />
          <input
            value={cloneSlug}
            onChange={(e) => setCloneSlug(e.target.value)}
            required
            placeholder="folder-slug"
            className="text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono"
          />
        </div>
        <button
          type="submit"
          className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
        >
          Clone Repository (With Approval)
        </button>
      </form>
    </div>
  );
}
