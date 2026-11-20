export type NavSection =
  | "dashboard"
  | "projects"
  | "chat"
  | "editor"
  | "agent"
  | "builder"
  | "database"
  | "testing"
  | "github"
  | "debugger"
  | "deploy"
  | "settings";

export interface HealthResponse {
  status: "ok" | "degraded";
  app_name: string;
  version: string;
  database: "ok" | "error";
  workspace_ready: boolean;
  timestamp: string;
}

export interface SystemInfo {
  app_name: string;
  version: string;
  environment: string;
  python_version: string;
  platform: string;
  database_dialect: string;
  workspace_folder_name: string;
  ai_provider: string;
  ollama_base_url: string;
  ollama_default_model: string;
  api_auth_enabled: boolean;
  external_cloud_configured: boolean;
  project_count: number;
  audit_log_count: number;
}

export interface Project {
  id: number;
  name: string;
  slug: string;
  description: string;
  relative_path: string;
  tech_stack: string;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
}

export interface AuditLog {
  id: number;
  action: string;
  actor: string;
  target_path: string;
  status: string;
  details: string;
  created_at: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  language?: string;
  children?: FileNode[];
}

export interface OpenTab {
  path: string;
  language: string;
  content: string;
  savedContent: string;
}

export interface ModelConfig {
  ai_provider: "ollama" | "openai_compat";
  default_model: string;
  ollama_base_url: string;
  temperature: number;
  top_p: number;
  num_ctx: number;
  openai_compat_base_url: string;
  openai_compat_model: string;
  openai_compat_has_key: boolean;
}

export interface OllamaModel {
  name: string;
  size_mb: number;
  modified_at: string;
  family: string;
  parameter_size: string;
  quantization: string;
}

export interface RecommendedModel {
  name: string;
  size_hint: string;
  ram_note: string;
  recommended: boolean;
}

export interface ModelsStatusResponse {
  config: ModelConfig;
  ollama: {
    installed: boolean;
    binary_path: string;
    running: boolean;
    version: string | null;
    base_url: string;
    models: OllamaModel[];
    error: string | null;
    recommended_models: RecommendedModel[];
  };
}

export interface Conversation {
  id: number;
  project_id: number | null;
  title: string;
  mode: string;
  model_name: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id?: number;
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string;
}

export interface ProposedChange {
  id: number;
  file_path: string;
  change_type: "create" | "edit";
  rationale: string;
  unified_diff: string;
  proposed_content: string;
  status: "pending" | "applied" | "rejected" | "reverted";
  backup_path: string;
}

export interface AgentTask {
  id: number;
  project_id: number;
  instruction: string;
  model_name: string;
  status: string;
  plan: string[];
  activity_log: { timestamp: string; step: string; detail: string }[];
  summary: string;
  created_at: string;
  updated_at: string;
  changes: ProposedChange[];
}

export interface TerminalResult {
  executed: boolean;
  approval_required: boolean;
  risk_level: "safe" | "requires_approval" | "blocked";
  reason: string;
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  duration_ms: number;
}

export interface TestReport {
  framework: string;
  status: "passed" | "failed";
  passed: number;
  failed: number;
  exit_code: number | null;
}

export interface DiagnosticItem {
  id: string;
  source: string;
  severity: "error" | "warning" | "info";
  message: string;
  timestamp: string;
}

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "primary";
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

export interface PromptDialogOptions {
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void | Promise<void>;
  onCancel?: () => void;
}
