import { useCallback, useEffect, useState } from "react";
import { ConfirmModal, PromptModal } from "./components/Modal";
import { ToastContainer } from "./components/Toast";
import { CodeEditorView } from "./editor/CodeEditorView";
import { StudioLayout } from "./layouts/StudioLayout";
import { AgentPage } from "./pages/AgentPage";
import { AppBuilderPage } from "./pages/AppBuilderPage";
import { ChatPage } from "./pages/ChatPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DatabasePage } from "./pages/DatabasePage";
import { DebuggerPage } from "./pages/DebuggerPage";
import { DeployPage } from "./pages/DeployPage";
import { GitHubPage } from "./pages/GitHubPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TestingPage } from "./pages/TestingPage";
import { api } from "./services/api";
import type {
  AgentTask,
  AuditLog,
  ConfirmDialogOptions,
  DiagnosticItem,
  ModelsStatusResponse,
  NavSection,
  Project,
  PromptDialogOptions,
  SystemInfo,
  TestReport,
  ToastItem,
  ToastType,
} from "./types";

export function App() {
  const [activeSection, setActiveSection] = useState<NavSection>("dashboard");
  const [darkMode, setDarkMode] = useState(true);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [modelsStatus, setModelsStatus] = useState<ModelsStatusResponse | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);
  const [outputLines, setOutputLines] = useState<string[]>([
    "Vardhan AI Studio initialized (local-first mode).",
  ]);
  const [lastTestRun, setLastTestRun] = useState<{ report: TestReport; output: string } | null>(null);

  // Accessible in-app dialogs & toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmModal, setConfirmModal] = useState<ConfirmDialogOptions | null>(null);
  const [promptModal, setPromptModal] = useState<PromptDialogOptions | null>(null);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showConfirm = useCallback((options: ConfirmDialogOptions) => {
    setConfirmModal(options);
  }, []);

  const showPrompt = useCallback((options: PromptDialogOptions) => {
    setPromptModal(options);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  const logOutput = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setOutputLines((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 100));
  }, []);

  const logError = useCallback((source: string, message: string) => {
    setDiagnostics((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random()}`,
          source,
          severity: "error" as const,
          message,
          timestamp: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 40)
    );
  }, []);

  const refreshCoreData = useCallback(async () => {
    try {
      const [info, projs, logs] = await Promise.all([
        api.getSystemInfo(),
        api.listProjects(),
        api.getAuditLogs(30),
      ]);
      setSystemInfo(info);
      setProjects(projs);
      setAuditLogs(logs);
      setActiveProject((prev) => {
        if (prev && projs.some((p) => p.id === prev.id)) return prev;
        return projs[0] ?? null;
      });
    } catch (err) {
      logError("Backend", err instanceof Error ? err.message : "Backend API unreachable");
    }
  }, [logError]);

  const refreshModels = useCallback(async () => {
    try {
      const status = await api.getModelsStatus();
      setModelsStatus(status);
    } catch {
      // backend may still be starting
    }
  }, []);

  useEffect(() => {
    refreshCoreData();
    refreshModels();
  }, [refreshCoreData, refreshModels]);

  return (
    <>
      <StudioLayout
      activeSection={activeSection}
      onNavigate={setActiveSection}
      projects={projects}
      activeProject={activeProject}
      onSelectProject={setActiveProject}
      modelsStatus={modelsStatus}
      auditLogs={auditLogs}
      agentTasks={agentTasks}
      diagnostics={diagnostics}
      outputLines={outputLines}
      lastTestRun={lastTestRun}
      darkMode={darkMode}
      onToggleTheme={() => setDarkMode((v) => !v)}
      onLogOutput={logOutput}
      onLogError={logError}
    >
      {activeSection === "dashboard" && (
        <DashboardPage
          systemInfo={systemInfo}
          modelsStatus={modelsStatus}
          projects={projects}
          activeProject={activeProject}
          auditLogs={auditLogs}
          onNavigate={setActiveSection}
          onSelectProject={setActiveProject}
        />
      )}
      {activeSection === "projects" && (
        <ProjectsPage
          projects={projects}
          activeProject={activeProject}
          onRefresh={refreshCoreData}
          onSelectProject={setActiveProject}
          onNavigate={setActiveSection}
          onLogOutput={logOutput}
          showToast={showToast}
          showConfirm={showConfirm}
        />
      )}
      {activeSection === "chat" && (
        <ChatPage
          activeProject={activeProject}
          modelsStatus={modelsStatus}
          onLogError={logError}
        />
      )}
      {activeSection === "editor" && (
        <CodeEditorView
          activeProject={activeProject}
          darkMode={darkMode}
          onLogOutput={logOutput}
          onLogError={logError}
          showToast={showToast}
          showPrompt={showPrompt}
        />
      )}
      {activeSection === "agent" && (
        <AgentPage
          activeProject={activeProject}
          onTasksChange={setAgentTasks}
          onLogOutput={logOutput}
          showToast={showToast}
        />
      )}
      {activeSection === "builder" && (
        <AppBuilderPage
          onProjectCreated={async (proj) => {
            await refreshCoreData();
            setActiveProject(proj);
          }}
          onNavigate={setActiveSection}
          onLogOutput={logOutput}
          showToast={showToast}
        />
      )}
      {activeSection === "database" && (
        <DatabasePage activeProject={activeProject} onLogOutput={logOutput} />
      )}
      {activeSection === "testing" && (
        <TestingPage
          activeProject={activeProject}
          onTestReport={(report, output) => setLastTestRun({ report, output })}
          onLogOutput={logOutput}
          showToast={showToast}
          showConfirm={showConfirm}
        />
      )}
      {activeSection === "github" && (
        <GitHubPage
          activeProject={activeProject}
          onRefreshProjects={refreshCoreData}
          onLogOutput={logOutput}
          showToast={showToast}
          showConfirm={showConfirm}
        />
      )}
      {activeSection === "debugger" && (
        <DebuggerPage activeProject={activeProject} onLogError={logError} />
      )}
      {activeSection === "deploy" && <DeployPage activeProject={activeProject} />}
      {activeSection === "settings" && (
        <SettingsPage
          modelsStatus={modelsStatus}
          darkMode={darkMode}
          onToggleTheme={() => setDarkMode((v) => !v)}
          onRefreshModels={refreshModels}
          onLogOutput={logOutput}
          showToast={showToast}
          showConfirm={showConfirm}
        />
      )}
    </StudioLayout>
    <ConfirmModal options={confirmModal} onClose={() => setConfirmModal(null)} />
    <PromptModal options={promptModal} onClose={() => setPromptModal(null)} />
    <ToastContainer toasts={toasts} onDismiss={dismissToast} />
  </>
  );
}

export default App;
