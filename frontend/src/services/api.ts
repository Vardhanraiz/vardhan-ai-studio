import type {
  AgentTask,
  AuditLog,
  ChatMessage,
  Conversation,
  FileNode,
  HealthResponse,
  ModelConfig,
  ModelsStatusResponse,
  Project,
  SystemInfo,
  TerminalResult,
} from "../types";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      detail = (await res.text()) || detail;
    }
    throw new Error(detail);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  // System
  getHealth: () => apiFetch<HealthResponse>("/api/v1/health"),
  getSystemInfo: () => apiFetch<SystemInfo>("/api/v1/system/info"),
  getAuditLogs: (limit = 40) => apiFetch<AuditLog[]>(`/api/v1/audit-logs?limit=${limit}`),

  // Projects
  listProjects: () => apiFetch<Project[]>("/api/v1/projects"),
  createProject: (payload: { name: string; slug?: string; description?: string; tech_stack?: string }) =>
    apiFetch<Project>("/api/v1/projects", { method: "POST", body: JSON.stringify(payload) }),
  updateProject: (id: number, payload: { name?: string; description?: string; tech_stack?: string; mark_opened?: boolean }) =>
    apiFetch<Project>(`/api/v1/projects/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteProject: (id: number) =>
    apiFetch<void>(`/api/v1/projects/${id}`, { method: "DELETE" }),

  // Models & Ollama
  getModelsStatus: () => apiFetch<ModelsStatusResponse>("/api/v1/models/status"),
  updateModelConfig: (payload: Partial<ModelConfig> & { openai_compat_api_key?: string }) =>
    apiFetch<{ config: ModelConfig }>("/api/v1/models/config", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  pullModel: (model_name: string, approved: boolean) =>
    apiFetch<{ pulled: boolean; approval_required?: boolean; status?: string; message?: string }>(
      "/api/v1/models/pull",
      { method: "POST", body: JSON.stringify({ model_name, approved }) }
    ),

  // Chat
  listConversations: () => apiFetch<Conversation[]>("/api/v1/chat/conversations"),
  createConversation: (payload: { title: string; project_id?: number | null }) =>
    apiFetch<Conversation>("/api/v1/chat/conversations", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getMessages: (conversationId: number) =>
    apiFetch<ChatMessage[]>(`/api/v1/chat/conversations/${conversationId}/messages`),
  deleteConversation: (conversationId: number) =>
    apiFetch<void>(`/api/v1/chat/conversations/${conversationId}`, { method: "DELETE" }),
  sendChat: (payload: {
    conversation_id?: number | null;
    project_id?: number | null;
    message: string;
    model_name?: string;
    attached_files?: { path: string; content: string }[];
  }) =>
    apiFetch<{ conversation_id: number; model: string; reply: ChatMessage }>("/api/v1/chat/send", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  runCodeAction: (payload: {
    action: "explain" | "refactor" | "generate" | "sql" | "commit_message";
    code: string;
    language?: string;
    instruction?: string;
    model_name?: string;
  }) =>
    apiFetch<{ action: string; model: string; result: string }>("/api/v1/chat/code-action", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Files
  getFileTree: (projectId: number) =>
    apiFetch<{ project_id: number; slug: string; tree: FileNode[] }>(
      `/api/v1/projects/${projectId}/files/tree`
    ),
  readFile: (projectId: number, path: string) =>
    apiFetch<{ path: string; content: string; language: string; size: number }>(
      `/api/v1/projects/${projectId}/files/content?path=${encodeURIComponent(path)}`
    ),
  createFile: (projectId: number, payload: { path: string; type: "file" | "directory"; content?: string }) =>
    apiFetch(`/api/v1/projects/${projectId}/files/create`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  saveFile: (projectId: number, payload: { path: string; content: string }) =>
    apiFetch<{ path: string; language: string; size: number; backup_path: string; unified_diff: string }>(
      `/api/v1/projects/${projectId}/files/save`,
      { method: "PUT", body: JSON.stringify(payload) }
    ),
  searchFiles: (projectId: number, query: string) =>
    apiFetch<{ query: string; count: number; matches: { path: string; line: number; preview: string }[] }>(
      `/api/v1/projects/${projectId}/files/search`,
      { method: "POST", body: JSON.stringify({ query }) }
    ),
  deleteFile: (projectId: number, path: string, confirm = true) =>
    apiFetch(`/api/v1/projects/${projectId}/files?path=${encodeURIComponent(path)}&confirm=${confirm}`, {
      method: "DELETE",
    }),

  // Agent
  listAgentTasks: (projectId?: number) =>
    apiFetch<AgentTask[]>(
      projectId ? `/api/v1/agent/tasks?project_id=${projectId}` : "/api/v1/agent/tasks"
    ),
  planAgentTask: (payload: { project_id: number; instruction: string; model_name?: string }) =>
    apiFetch<AgentTask>("/api/v1/agent/plan", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  approveAgentChanges: (taskId: number, change_ids?: number[]) =>
    apiFetch<AgentTask>(`/api/v1/agent/tasks/${taskId}/approve`, {
      method: "POST",
      body: JSON.stringify({ change_ids: change_ids ?? null }),
    }),
  rejectAgentChanges: (taskId: number, change_ids?: number[]) =>
    apiFetch<AgentTask>(`/api/v1/agent/tasks/${taskId}/reject`, {
      method: "POST",
      body: JSON.stringify({ change_ids: change_ids ?? null }),
    }),
  revertAgentChange: (taskId: number, changeId: number) =>
    apiFetch<AgentTask>(`/api/v1/agent/tasks/${taskId}/changes/${changeId}/revert`, {
      method: "POST",
    }),

  // Terminal
  runTerminal: (payload: { project_id: number; command: string; approved: boolean; timeout_sec?: number }) =>
    apiFetch<TerminalResult>("/api/v1/terminal/run", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // App Builder
  buildApplication: (payload: {
    app_name: string;
    prompt: string;
    frontend_stack: string;
    backend_stack: string;
    database_stack: string;
  }) =>
    apiFetch<{
      project: Project;
      entities: string[];
      created_files: string[];
      preview_file: string;
      checks: { name: string; passed: boolean; detail: string }[];
      verified: boolean;
      run_instructions: string[];
    }>("/api/v1/builder/generate", { method: "POST", body: JSON.stringify(payload) }),

  // Debugger
  analyzeError: (payload: { error_text: string; project_id?: number | null; file_path?: string | null }) =>
    apiFetch<{
      parsed: {
        category: string;
        primary_message: string;
        frames: { file: string; line: number; symbol: string }[];
        highlights: string[];
      };
      file_path: string;
      has_source_context: boolean;
      ai_available: boolean;
      ai_analysis: string;
      ai_error: string | null;
    }>("/api/v1/debugger/analyze", { method: "POST", body: JSON.stringify(payload) }),

  // Database
  listDatabases: (projectId: number) =>
    apiFetch<{ databases: { path: string; size_bytes: number }[] }>(
      `/api/v1/projects/${projectId}/database/list`
    ),
  inspectDatabase: (projectId: number, dbPath: string) =>
    apiFetch<{
      database: string;
      table_count: number;
      tables: {
        name: string;
        row_count: number;
        columns: { name: string; type: string; notnull: boolean; primary_key: boolean }[];
        create_sql: string;
        crud_sql: Record<string, string>;
      }[];
      relationships: { from_table: string; from_column: string; to_table: string; to_column: string }[];
    }>(`/api/v1/projects/${projectId}/database/schema?db_path=${encodeURIComponent(dbPath)}`),
  runSql: (
    projectId: number,
    payload: { db_path: string; sql: string; approved: boolean; create_if_missing?: boolean }
  ) =>
    apiFetch<{
      executed: boolean;
      approval_required: boolean;
      reason?: string;
      columns: string[];
      rows: unknown[][];
      row_count: number;
    }>(`/api/v1/projects/${projectId}/database/query`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Testing
  detectTestFrameworks: (projectId: number) =>
    apiFetch<{ frameworks: { framework: string; command: string; type: string }[] }>(
      `/api/v1/projects/${projectId}/tests/frameworks`
    ),
  runTests: (projectId: number, payload: { framework: string; command: string; approved: boolean }) =>
    apiFetch<TerminalResult & { report: { framework: string; status: "passed" | "failed"; passed: number; failed: number; exit_code: number | null } | null }>(
      `/api/v1/projects/${projectId}/tests/run`,
      { method: "POST", body: JSON.stringify(payload) }
    ),
  generateTests: (projectId: number, payload: { target_file: string; test_type: "unit" | "integration" | "browser" }) =>
    apiFetch<{ target_file: string; test_type: string; ai_available: boolean; generated_tests: string; error: string | null }>(
      `/api/v1/projects/${projectId}/tests/generate`,
      { method: "POST", body: JSON.stringify(payload) }
    ),

  // Git & GitHub
  getGitOverview: (projectId: number) =>
    apiFetch<{
      status: { initialized: boolean; branch: string | null; changes: { code: string; path: string }[]; clean?: boolean };
      branches: { name: string; current: boolean }[];
      commits: { hash: string; author: string; date: string; message: string }[];
      diff: string;
    }>(`/api/v1/projects/${projectId}/git/overview`),
  initGit: (projectId: number) =>
    apiFetch(`/api/v1/projects/${projectId}/git/init`, { method: "POST" }),
  switchBranch: (projectId: number, payload: { branch_name: string; create: boolean }) =>
    apiFetch(`/api/v1/projects/${projectId}/git/branch`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  commitGit: (projectId: number, payload: { message: string; approved: boolean }) =>
    apiFetch<{ committed: boolean; approval_required?: boolean; message?: string; output?: string }>(
      `/api/v1/projects/${projectId}/git/commit`,
      { method: "POST", body: JSON.stringify(payload) }
    ),
  cloneRepo: (payload: { repo_url: string; project_name: string; slug: string; approved: boolean }) =>
    apiFetch<{ cloned: boolean; approval_required?: boolean; project_id?: number; message?: string }>(
      "/api/v1/git/clone",
      { method: "POST", body: JSON.stringify(payload) }
    ),

  // Deployment
  getDeployPlan: (projectId: number, target: string) =>
    apiFetch<{
      detected_stack: string;
      build_command: string;
      start_command: string;
      environment_variables: string[];
      target: string;
      pricing_note: string;
      config_filename: string;
      config_content: string;
      dockerfile: string;
      steps: string[];
      verification_note: string;
    }>(`/api/v1/projects/${projectId}/deploy/plan?target=${encodeURIComponent(target)}`),
};

export function createChatWebSocket(): WebSocket {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(`${protocol}//${window.location.host}/api/v1/ws/chat`);
}
