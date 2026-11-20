import { useEffect, useState } from "react";
import { Cpu, Download, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { api } from "../services/api";
import type { ConfirmDialogOptions, ModelsStatusResponse, ToastType } from "../types";

interface SettingsPageProps {
  modelsStatus: ModelsStatusResponse | null;
  darkMode: boolean;
  onToggleTheme: () => void;
  onRefreshModels: () => Promise<void>;
  onLogOutput: (msg: string) => void;
  showToast?: (msg: string, type?: ToastType) => void;
  showConfirm?: (options: ConfirmDialogOptions) => void;
}

export function SettingsPage({
  modelsStatus,
  darkMode,
  onToggleTheme,
  onRefreshModels,
  onLogOutput,
  showToast,
  showConfirm,
}: SettingsPageProps) {
  const [aiProvider, setAiProvider] = useState<"ollama" | "openai_compat">("ollama");
  const [defaultModel, setDefaultModel] = useState("qwen2.5-coder:1.5b");
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("http://127.0.0.1:11434");
  const [temperature, setTemperature] = useState(0.2);
  const [topP, setTopP] = useState(0.9);
  const [numCtx, setNumCtx] = useState(4096);
  const [compatUrl, setCompatUrl] = useState("");
  const [compatModel, setCompatModel] = useState("");
  const [compatKey, setCompatKey] = useState("");
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!modelsStatus) return;
    setAiProvider(modelsStatus.config.ai_provider);
    setDefaultModel(modelsStatus.config.default_model);
    setOllamaBaseUrl(modelsStatus.config.ollama_base_url);
    setTemperature(modelsStatus.config.temperature);
    setTopP(modelsStatus.config.top_p);
    setNumCtx(modelsStatus.config.num_ctx);
    setCompatUrl(modelsStatus.config.openai_compat_base_url);
    setCompatModel(modelsStatus.config.openai_compat_model);
  }, [modelsStatus]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await api.updateModelConfig({
        ai_provider: aiProvider,
        default_model: defaultModel,
        ollama_base_url: ollamaBaseUrl,
        temperature,
        top_p: topP,
        num_ctx: numCtx,
        openai_compat_base_url: compatUrl,
        openai_compat_model: compatModel,
        ...(compatKey.trim() ? { openai_compat_api_key: compatKey.trim() } : {}),
      });
      setCompatKey("");
      await onRefreshModels();
      setStatusMsg("Settings saved to local SQLite.");
      showToast?.("Settings saved to local SQLite.", "success");
      onLogOutput(`Updated model configuration (provider=${aiProvider}, default=${defaultModel}).`);
    } catch (err) {
      showToast?.("Failed to save settings", "error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to save settings");
    }
  };

  const handlePull = (modelName: string) => {
    const executePull = async () => {
      setPullingModel(modelName);
      setErrorMsg(null);
      setStatusMsg(null);
      try {
        const res = await api.pullModel(modelName, true);
        const successText = `Pulled ${modelName} (${res.status || "ready"}).`;
        setStatusMsg(successText);
        showToast?.(successText, "success");
        await onRefreshModels();
        onLogOutput(`Pulled Ollama model '${modelName}'.`);
      } catch (err) {
        showToast?.(`Failed to pull ${modelName}`, "error");
        setErrorMsg(err instanceof Error ? err.message : "Pull failed");
      } finally {
        setPullingModel(null);
      }
    };

    if (showConfirm) {
      showConfirm({
        title: "Download Ollama Model?",
        message: `Approve downloading model '${modelName}' into local Ollama?\n\nPlease verify you have enough disk space (~1 GB) and available memory.`,
        confirmLabel: "Download Model",
        variant: "primary",
        onConfirm: executePull,
      });
      return;
    }

    if (
      window.confirm(
        `Approve downloading Ollama model '${modelName}'?\n\nEnsure you have enough disk space and free RAM.`
      )
    ) {
      executePull();
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-400" />
            Model Management &amp; Studio Settings
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Local Ollama inference is the ₹0 default. Large models are never downloaded automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs"
          >
            Theme: {darkMode ? "Dark" : "Light"}
          </button>
          <button
            type="button"
            onClick={onRefreshModels}
            className="p-2 rounded-lg border border-slate-300 dark:border-slate-700"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Ollama Status */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Local Ollama Runtime</h2>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
              modelsStatus?.ollama.running
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-amber-500/15 text-amber-500"
            }`}
          >
            {modelsStatus?.ollama.running
              ? `Connected (v${modelsStatus.ollama.version})`
              : modelsStatus?.ollama.installed
              ? "Installed (Not Running)"
              : "Not Detected"}
          </span>
        </div>

        {modelsStatus?.ollama.error && (
          <p className="text-xs text-amber-400 bg-amber-500/10 rounded-lg p-2.5">
            {modelsStatus.ollama.error}
          </p>
        )}

        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1.5">
            Installed Local Models ({modelsStatus?.ollama.models.length ?? 0})
          </div>
          {modelsStatus?.ollama.models.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {modelsStatus.ollama.models.map((m) => (
                <div
                  key={m.name}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-mono font-semibold">{m.name}</div>
                    <div className="text-slate-500">
                      {m.size_mb} MB {m.parameter_size ? `• ${m.parameter_size}` : ""}{" "}
                      {m.quantization ? `• ${m.quantization}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDefaultModel(m.name)}
                    className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white"
                  >
                    Use Default
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No local models installed yet. Pull a lightweight model below.</p>
          )}
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1.5">
            Recommended Lightweight Models (8 GB RAM Friendly)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(modelsStatus?.ollama.recommended_models ?? []).map((rm) => (
              <div
                key={rm.name}
                className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-mono font-semibold">
                    {rm.name} <span className="text-slate-500 font-normal">({rm.size_hint})</span>
                  </div>
                  <div className="text-slate-500 text-[11px]">{rm.ram_note}</div>
                </div>
                <button
                  type="button"
                  disabled={pullingModel !== null}
                  onClick={() => handlePull(rm.name)}
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white inline-flex items-center gap-1 shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  {pullingModel === rm.name ? "Pulling..." : "Pull"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Parameters Form */}
      <form
        onSubmit={handleSave}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 space-y-4"
      >
        <h2 className="text-sm font-semibold">Inference Parameters &amp; Provider</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <label className="space-y-1">
            <span className="text-slate-500">Active Provider</span>
            <select
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value as "ollama" | "openai_compat")}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
            >
              <option value="ollama">Local Ollama (Free / ₹0)</option>
              <option value="openai_compat">Optional OpenAI-Compatible API (External / Paid)</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-slate-500">Default Model</span>
            <input
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              className="w-full font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-slate-500">Ollama API URL</span>
            <input
              value={ollamaBaseUrl}
              onChange={(e) => setOllamaBaseUrl(e.target.value)}
              className="w-full font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <label className="space-y-1">
            <span className="text-slate-500">Temperature ({temperature})</span>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-slate-500">Top-P ({topP})</span>
            <input
              type="number"
              step="0.05"
              min="0.1"
              max="1"
              value={topP}
              onChange={(e) => setTopP(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-slate-500">Context Window (num_ctx)</span>
            <input
              type="number"
              step="512"
              min="1024"
              max="16384"
              value={numCtx}
              onChange={(e) => setNumCtx(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
            />
          </label>
        </div>

        {aiProvider === "openai_compat" && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2 text-xs">
            <div className="font-semibold text-amber-400">
              External OpenAI-Compatible Provider (Optional — may incur external API charges)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                value={compatUrl}
                onChange={(e) => setCompatUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
              />
              <input
                value={compatModel}
                onChange={(e) => setCompatModel(e.target.value)}
                placeholder="Model ID"
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
              />
              <input
                type="password"
                value={compatKey}
                onChange={(e) => setCompatKey(e.target.value)}
                placeholder={modelsStatus?.config.openai_compat_has_key ? "Key saved (leave blank to keep)" : "API Key"}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
              />
            </div>
          </div>
        )}

        {statusMsg && <p className="text-xs text-emerald-500">{statusMsg}</p>}
        {errorMsg && <p className="text-xs text-rose-400">{errorMsg}</p>}

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            Secrets are never exposed to frontend logs or browser storage.
          </span>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            Save Configuration
          </button>
        </div>
      </form>
    </div>
  );
}
