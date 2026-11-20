import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("Vardhan AI Studio Frontend", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/v1/system/info")) {
          return new Response(
            JSON.stringify({
              app_name: "Vardhan AI Studio",
              version: "1.0.0",
              environment: "development",
              python_version: "3.12.10",
              platform: "Windows 10",
              database_dialect: "sqlite",
              workspace_folder_name: "workspace",
              ai_provider: "ollama",
              ollama_base_url: "http://127.0.0.1:11434",
              ollama_default_model: "qwen2.5-coder:1.5b",
              api_auth_enabled: false,
              external_cloud_configured: false,
              project_count: 1,
              audit_log_count: 2,
            }),
            { status: 200 }
          );
        }
        if (url.includes("/api/v1/projects")) {
          return new Response(
            JSON.stringify([
              {
                id: 1,
                name: "Demo App",
                slug: "demo-app",
                description: "Sample project",
                relative_path: "demo-app",
                tech_stack: "React, FastAPI, SQLite",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                last_opened_at: null,
              },
            ]),
            { status: 200 }
          );
        }
        if (url.includes("/api/v1/audit-logs")) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (url.includes("/api/v1/models/status")) {
          return new Response(
            JSON.stringify({
              config: {
                ai_provider: "ollama",
                default_model: "qwen2.5-coder:1.5b",
                ollama_base_url: "http://127.0.0.1:11434",
                temperature: 0.2,
                top_p: 0.9,
                num_ctx: 4096,
                openai_compat_base_url: "",
                openai_compat_model: "",
                openai_compat_has_key: false,
              },
              ollama: {
                installed: true,
                binary_path: "ollama.exe",
                running: true,
                version: "0.40.16",
                base_url: "http://127.0.0.1:11434",
                models: [],
                error: null,
                recommended_models: [],
              },
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders dashboard, all primary navigation modules, and switches views cleanly", async () => {
    render(<App />);

    expect(screen.getByText("Vardhan AI Studio")).toBeInTheDocument();
    expect(screen.getByText("Welcome to Vardhan AI Studio")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Python 3.12.10")).toBeInTheDocument();
    });

    const nav = within(screen.getByRole("navigation", { name: "Main Navigation" }));

    // Navigate to App Builder
    fireEvent.click(nav.getByRole("button", { name: /App Builder/i }));
    expect(screen.getByText("AI Prompt-to-Application Builder")).toBeInTheDocument();

    // Navigate to Debugger
    fireEvent.click(nav.getByRole("button", { name: /Debugger/i }));
    expect(screen.getByText("AI Debugging Assistant")).toBeInTheDocument();

    // Navigate to Settings
    fireEvent.click(nav.getByRole("button", { name: /Settings/i }));
    expect(screen.getByText(/Model Management & Studio Settings/i)).toBeInTheDocument();
  });

  it("toggles dark/light theme and bottom panel tabs", async () => {
    render(<App />);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    fireEvent.click(screen.getByTitle("Toggle Dark / Light Theme"));
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /Output/i }));
    expect(screen.getByText(/Vardhan AI Studio initialized/i)).toBeInTheDocument();
  });

  it("opens Tailwind in-app Confirm Modal when unregistering a project and displays toast", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Python 3.12.10")).toBeInTheDocument();
    });

    const nav = within(screen.getByRole("navigation", { name: "Main Navigation" }));
    fireEvent.click(nav.getByRole("button", { name: /Projects/i }));

    expect(screen.getByText("Projects & Workspaces")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Demo App" })).toBeInTheDocument();

    const deleteBtn = screen.getByTitle("Unregister project");
    fireEvent.click(deleteBtn);

    // Modal dialog is in the document
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Unregister Project?")).toBeInTheDocument();

    // Confirm button in the modal
    const confirmBtn = screen.getByRole("button", { name: "Unregister Project" });
    fireEvent.click(confirmBtn);

    // Toast appears
    await waitFor(() => {
      expect(screen.getByText(/Unregistered 'Demo App'/i)).toBeInTheDocument();
    });
  });
});
