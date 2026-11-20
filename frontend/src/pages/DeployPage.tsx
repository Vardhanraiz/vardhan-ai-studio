import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Rocket } from "lucide-react";
import { MessageContent } from "../components/CodeBlock";
import { api } from "../services/api";
import type { Project } from "../types";

const TARGETS = ["Vercel", "Netlify", "Render", "Hugging Face Spaces", "AWS", "Microsoft Azure"];

interface DeployPageProps {
  activeProject: Project | null;
}

export function DeployPage({ activeProject }: DeployPageProps) {
  const [target, setTarget] = useState("Render");
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof api.getDeployPlan>> | null>(null);

  const loadPlan = useCallback(async () => {
    if (!activeProject) return;
    const res = await api.getDeployPlan(activeProject.id, target);
    setPlan(res);
  }, [activeProject, target]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  if (!activeProject) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-sm text-slate-500">
        Select an active project to detect its stack and generate deployment configs.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Rocket className="w-5 h-5 text-indigo-400" />
          Deployment Assistant
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Auto-detects project type, generates Dockerfiles and platform configs, lists env vars, and clearly notes paid cloud tiers.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TARGETS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTarget(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
              target === t
                ? "border-indigo-500 bg-indigo-600 text-white"
                : "border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {plan && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 space-y-2 text-xs">
            <div className="font-semibold text-sm">Detected Stack: {plan.detected_stack}</div>
            <div>
              <span className="text-slate-500">Build command:</span>{" "}
              <code className="font-mono">{plan.build_command}</code>
            </div>
            <div>
              <span className="text-slate-500">Start command:</span>{" "}
              <code className="font-mono">{plan.start_command}</code>
            </div>
            <div>
              <span className="text-slate-500">Environment variables:</span>{" "}
              {plan.environment_variables.map((v) => (
                <span key={v} className="font-mono px-1.5 py-0.5 mr-1 rounded bg-slate-100 dark:bg-slate-800">
                  {v}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 text-amber-400 pt-1">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{plan.pricing_note}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4">
              <h2 className="text-sm font-semibold mb-2">Platform Config ({plan.config_filename})</h2>
              <MessageContent content={`\`\`\`\n${plan.config_content}\n\`\`\``} />
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4">
              <h2 className="text-sm font-semibold mb-2">Dockerfile</h2>
              <MessageContent content={`\`\`\`dockerfile\n${plan.dockerfile}\n\`\`\``} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 space-y-2">
            <h2 className="text-sm font-semibold">Deployment Steps ({plan.target})</h2>
            <ol className="list-decimal list-inside text-xs space-y-1 text-slate-600 dark:text-slate-300">
              {plan.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <p className="text-[11px] text-slate-500 pt-1">{plan.verification_note}</p>
          </div>
        </div>
      )}
    </div>
  );
}
