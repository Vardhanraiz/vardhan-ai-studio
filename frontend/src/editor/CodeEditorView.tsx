import { useCallback, useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FilePlus,
  Folder,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { MessageContent } from "../components/CodeBlock";
import { api } from "../services/api";
import type { FileNode, OpenTab, Project, PromptDialogOptions, ToastType } from "../types";

interface CodeEditorViewProps {
  activeProject: Project | null;
  darkMode: boolean;
  onLogOutput: (msg: string) => void;
  onLogError: (source: string, msg: string) => void;
  showToast?: (msg: string, type?: ToastType) => void;
  showPrompt?: (options: PromptDialogOptions) => void;
}

export function CodeEditorView({
  activeProject,
  darkMode,
  onLogOutput,
  onLogError,
  showToast,
  showPrompt,
}: CodeEditorViewProps) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [newFilePath, setNewFilePath] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ path: string; line: number; preview: string }[]>([]);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [statusNote, setStatusNote] = useState<string>("");
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const loadTree = useCallback(async () => {
    if (!activeProject) return;
    try {
      const res = await api.getFileTree(activeProject.id);
      setTree(res.tree);
    } catch (err) {
      onLogError("File Explorer", err instanceof Error ? err.message : "Failed to load tree");
    }
  }, [activeProject, onLogError]);

  useEffect(() => {
    setTabs([]);
    setActivePath(null);
    setSearchResults([]);
    loadTree();
  }, [loadTree]);

  const openFile = async (path: string) => {
    if (!activeProject) return;
    const existing = tabs.find((t) => t.path === path);
    if (existing) {
      setActivePath(path);
      return;
    }
    try {
      const data = await api.readFile(activeProject.id, path);
      setTabs((prev) => [
        ...prev,
        { path: data.path, language: data.language, content: data.content, savedContent: data.content },
      ]);
      setActivePath(data.path);
    } catch (err) {
      onLogError("Editor", err instanceof Error ? err.message : "Unable to open file");
    }
  };

  const activeTab = tabs.find((t) => t.path === activePath) ?? null;

  const saveActiveFile = useCallback(async () => {
    if (!activeProject || !activeTab) return;
    try {
      const res = await api.saveFile(activeProject.id, {
        path: activeTab.path,
        content: activeTab.content,
      });
      setTabs((prev) =>
        prev.map((t) => (t.path === activeTab.path ? { ...t, savedContent: t.content } : t))
      );
      setStatusNote(`Saved ${activeTab.path} (${res.size} bytes)`);
      showToast?.(`Saved ${activeTab.path} (${res.size} bytes)`, "success");
      onLogOutput(`Saved ${activeTab.path} (backup: ${res.backup_path || "new file"})`);
    } catch (err) {
      showToast?.(`Failed to save ${activeTab.path}`, "error");
      onLogError("Editor Save", err instanceof Error ? err.message : "Save failed");
    }
  }, [activeProject, activeTab, onLogError, onLogOutput, showToast]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveActiveFile();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveActiveFile]);

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !newFilePath.trim()) return;
    try {
      await api.createFile(activeProject.id, { path: newFilePath.trim(), type: "file", content: "" });
      const created = newFilePath.trim();
      setNewFilePath("");
      await loadTree();
      await openFile(created);
      showToast?.(`Created file ${created}`, "success");
      onLogOutput(`Created file ${created}`);
    } catch (err) {
      showToast?.("Failed to create file", "error");
      onLogError("Create File", err instanceof Error ? err.message : "Create failed");
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !searchQuery.trim()) return;
    const res = await api.searchFiles(activeProject.id, searchQuery.trim());
    setSearchResults(res.matches);
  };

  const executeAiAction = async (action: "explain" | "refactor" | "generate", customInstruction = "") => {
    if (!activeTab) return;
    const selection = editorRef.current?.getSelection();
    const model = editorRef.current?.getModel();
    const selectedCode =
      selection && model && !selection.isEmpty()
        ? model.getValueInRange(selection)
        : activeTab.content.slice(0, 6000);

    setAiBusy(true);
    setAiResponse(null);
    try {
      const res = await api.runCodeAction({
        action,
        code: selectedCode,
        language: activeTab.language,
        instruction: customInstruction,
      });
      setAiResponse(res.result);
      showToast?.(`AI ${action} completed`, "info");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI action failed";
      setAiResponse(`Error: ${msg}`);
      showToast?.(`AI ${action} failed`, "error");
      onLogError("Editor AI", msg);
    } finally {
      setAiBusy(false);
    }
  };

  const runAiAction = async (action: "explain" | "refactor" | "generate") => {
    if (!activeTab) return;

    if (action === "generate") {
      if (showPrompt) {
        showPrompt({
          title: "Generate Code with AI",
          message: "Describe the function, logic, or component to generate in this file:",
          placeholder: "e.g. Write an async helper function to process order records",
          confirmLabel: "Generate Code",
          onConfirm: async (instruction) => {
            await executeAiAction("generate", instruction);
          },
        });
        return;
      }
      const instruction = window.prompt("Describe the function or code to generate:") || "";
      if (!instruction) return;
      await executeAiAction("generate", instruction);
      return;
    }

    await executeAiAction(action);
  };

  const renderNodes = (nodes: FileNode[], depth = 0) =>
    nodes.map((node) => {
      if (node.type === "directory") {
        const isOpen = expanded[node.path] ?? depth === 0;
        return (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => setExpanded((prev) => ({ ...prev, [node.path]: !isOpen }))}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              className="w-full flex items-center gap-1.5 py-1 pr-2 text-xs hover:bg-slate-200/70 dark:hover:bg-slate-800/70 text-left"
            >
              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">{node.name}</span>
            </button>
            {isOpen && node.children && renderNodes(node.children, depth + 1)}
          </div>
        );
      }
      const isSelected = activePath === node.path;
      return (
        <button
          key={node.path}
          type="button"
          onClick={() => openFile(node.path)}
          style={{ paddingLeft: `${depth * 12 + 24}px` }}
          className={`w-full flex items-center gap-1.5 py-1 pr-2 text-xs text-left ${
            isSelected
              ? "bg-indigo-600/20 text-indigo-500 dark:text-indigo-300 font-medium"
              : "hover:bg-slate-200/70 dark:hover:bg-slate-800/70"
          }`}
        >
          <FileCode2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
      );
    });

  if (!activeProject) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-center">
        <div className="max-w-md space-y-2">
          <h2 className="text-lg font-semibold">No Project Selected</h2>
          <p className="text-xs text-slate-500">
            Select an active project from the top bar or create one in Projects / App Builder to edit files in Monaco Editor.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* File Explorer + Search */}
      <aside className="w-64 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50/70 dark:bg-slate-950/60 shrink-0">
        <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 truncate">
            {activeProject.name}
          </span>
          <button
            type="button"
            onClick={loadTree}
            title="Refresh files"
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <form onSubmit={handleCreateFile} className="p-2 border-b border-slate-200 dark:border-slate-800 flex gap-1">
          <input
            value={newFilePath}
            onChange={(e) => setNewFilePath(e.target.value)}
            placeholder="new/file.py"
            className="flex-1 min-w-0 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1"
          />
          <button
            type="submit"
            title="Create file"
            className="p-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
        </form>

        <form onSubmit={handleSearch} className="p-2 border-b border-slate-200 dark:border-slate-800 flex gap-1">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in project..."
            className="flex-1 min-w-0 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1"
          />
          <button
            type="submit"
            title="Search files"
            className="p-1.5 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        </form>

        {searchResults.length > 0 && (
          <div className="max-h-36 overflow-y-auto border-b border-slate-200 dark:border-slate-800 p-2 space-y-1 bg-indigo-500/5">
            <div className="flex items-center justify-between text-[10px] font-semibold text-indigo-400">
              <span>{searchResults.length} MATCHES</span>
              <button type="button" onClick={() => setSearchResults([])}>
                Clear
              </button>
            </div>
            {searchResults.slice(0, 20).map((m, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => openFile(m.path)}
                className="w-full text-left text-[11px] hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded px-1.5 py-0.5 truncate"
              >
                <span className="font-mono text-indigo-400">{m.path}:{m.line}</span> {m.preview}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-1">
          {tree.length === 0 ? (
            <p className="text-xs text-slate-500 p-3">Empty project. Create a file above.</p>
          ) : (
            renderNodes(tree)
          )}
        </div>
      </aside>

      {/* Monaco Editor Pane */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Tabs & Toolbar */}
        <div className="border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-100/70 dark:bg-slate-900/80 px-2 gap-2">
          <div className="flex items-center overflow-x-auto">
            {tabs.map((tab) => {
              const dirty = tab.content !== tab.savedContent;
              const isCurrent = tab.path === activePath;
              return (
                <div
                  key={tab.path}
                  onClick={() => setActivePath(tab.path)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs cursor-pointer border-r border-slate-200 dark:border-slate-800 shrink-0 ${
                    isCurrent
                      ? "bg-white dark:bg-slate-950 font-medium text-indigo-500 dark:text-indigo-300"
                      : "text-slate-500 hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <span>{tab.path.split("/").pop()}</span>
                  {dirty && <span className="w-2 h-2 rounded-full bg-amber-400" />}
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      const next = tabs.filter((t) => t.path !== tab.path);
                      setTabs(next);
                      if (activePath === tab.path) {
                        setActivePath(next[next.length - 1]?.path ?? null);
                      }
                    }}
                    className="hover:text-rose-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {activeTab && (
            <div className="flex items-center gap-1.5 py-1 shrink-0">
              <button
                type="button"
                onClick={() => runAiAction("explain")}
                disabled={aiBusy}
                className="px-2 py-1 rounded text-xs bg-slate-200 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white inline-flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Explain
              </button>
              <button
                type="button"
                onClick={() => runAiAction("refactor")}
                disabled={aiBusy}
                className="px-2 py-1 rounded text-xs bg-slate-200 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white inline-flex items-center gap-1"
              >
                <Wand2 className="w-3.5 h-3.5" />
                Refactor
              </button>
              <button
                type="button"
                onClick={() => runAiAction("generate")}
                disabled={aiBusy}
                className="px-2 py-1 rounded text-xs bg-slate-200 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white"
              >
                Generate
              </button>
              <button
                type="button"
                onClick={saveActiveFile}
                className="px-2.5 py-1 rounded text-xs bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1 font-medium"
              >
                <Save className="w-3.5 h-3.5" />
                Save
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {activeTab ? (
            <div className="flex-1 min-h-0">
              <Editor
                height="100%"
                language={activeTab.language}
                theme={darkMode ? "vs-dark" : "light"}
                value={activeTab.content}
                onMount={(editor) => {
                  editorRef.current = editor;
                }}
                onChange={(val) => {
                  setTabs((prev) =>
                    prev.map((t) => (t.path === activeTab.path ? { ...t, content: val ?? "" } : t))
                  );
                }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  tabSize: 2,
                  automaticLayout: true,
                  wordWrap: "on",
                }}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
              Select a file from the explorer or create a new file to start editing.
            </div>
          )}

          {aiResponse && (
            <div className="h-52 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-indigo-400">AI Code Assistant Output</span>
                <button
                  type="button"
                  onClick={() => setAiResponse(null)}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  Close
                </button>
              </div>
              <MessageContent content={aiResponse} />
            </div>
          )}
        </div>

        {statusNote && (
          <div className="px-3 py-1 text-[11px] border-t border-slate-200 dark:border-slate-800 text-emerald-500 bg-slate-50 dark:bg-slate-950">
            {statusNote}
          </div>
        )}
      </div>
    </div>
  );
}
