import { useState } from "react";
import { FolderOpen, FolderPlus, Trash2 } from "lucide-react";
import { api } from "../services/api";
import type { ConfirmDialogOptions, NavSection, Project, ToastType } from "../types";

interface ProjectsPageProps {
  projects: Project[];
  activeProject: Project | null;
  onRefresh: () => Promise<void>;
  onSelectProject: (project: Project) => void;
  onNavigate: (section: NavSection) => void;
  onLogOutput: (line: string) => void;
  showToast?: (msg: string, type?: ToastType) => void;
  showConfirm?: (options: ConfirmDialogOptions) => void;
}

export function ProjectsPage({
  projects,
  activeProject,
  onRefresh,
  onSelectProject,
  onNavigate,
  onLogOutput,
  showToast,
  showConfirm,
}: ProjectsPageProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [techStack, setTechStack] = useState("Python FastAPI, React, SQLite");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createProject({
        name: name.trim(),
        description: description.trim(),
        tech_stack: techStack.trim(),
      });
      setName("");
      setDescription("");
      await onRefresh();
      onSelectProject(created);
      showToast?.(`Created project '${created.name}'`, "success");
      onLogOutput(`Created sandboxed project '${created.name}' at workspace/${created.relative_path}`);
    } catch (err) {
      showToast?.("Failed to create project", "error");
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (project: Project) => {
    const executeDelete = async () => {
      try {
        await api.deleteProject(project.id);
        await onRefresh();
        showToast?.(`Unregistered '${project.name}' (files preserved on disk).`, "info");
        onLogOutput(`Unregistered project '${project.name}' (files preserved on disk).`);
      } catch (err) {
        showToast?.(`Failed to unregister ${project.name}`, "error");
        setError(err instanceof Error ? err.message : "Failed to unregister project");
      }
    };

    if (showConfirm) {
      showConfirm({
        title: "Unregister Project?",
        message: `Are you sure you want to unregister '${project.name}' from Vardhan AI Studio?\n\nAll project files inside workspace/${project.relative_path} will remain safe on your computer.`,
        confirmLabel: "Unregister Project",
        variant: "warning",
        onConfirm: executeDelete,
      });
      return;
    }

    if (window.confirm(`Unregister '${project.name}' from Studio? (Files on disk will be preserved.)`)) {
      executeDelete();
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Projects &amp; Workspaces</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          All projects live safely inside the sandboxed <code className="font-mono">workspace/</code> root with path-traversal protection.
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-5 space-y-4"
      >
        <div className="flex items-center gap-2 font-semibold text-sm">
          <FolderPlus className="w-4 h-4 text-indigo-400" />
          Create New Local Project
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Project Name (e.g., Inventory API)"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
          />
          <input
            value={techStack}
            onChange={(e) => setTechStack(e.target.value)}
            placeholder="Tech Stack (e.g., React, FastAPI, SQLite)"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short project description"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium"
        >
          {busy ? "Creating..." : "Create Sandboxed Project"}
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {projects.map((project) => {
          const isActive = activeProject?.id === project.id;
          return (
            <div
              key={project.id}
              className={`rounded-xl border p-4 flex flex-col justify-between gap-3 ${
                isActive
                  ? "border-indigo-500 bg-indigo-500/5"
                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70"
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-base">{project.name}</h3>
                  {isActive && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-medium">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs font-mono text-slate-500 mt-1">workspace/{project.relative_path}</p>
                {project.description && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">{project.description}</p>
                )}
                {project.tech_stack && (
                  <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-2">{project.tech_stack}</p>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectProject(project);
                      onNavigate("editor");
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Open in Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectProject(project);
                      onNavigate("agent");
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs"
                  >
                    Agent
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(project)}
                  title="Unregister project"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
