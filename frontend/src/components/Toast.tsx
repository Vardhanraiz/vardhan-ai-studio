import { useEffect } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import type { ToastItem } from "../types";

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const config = {
    success: {
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />,
      border: "border-emerald-500/40 bg-white/95 dark:bg-slate-900/95",
      badge: "bg-emerald-500/10 text-emerald-500",
    },
    error: {
      icon: <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />,
      border: "border-rose-500/40 bg-white/95 dark:bg-slate-900/95",
      badge: "bg-rose-500/10 text-rose-500",
    },
    warning: {
      icon: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />,
      border: "border-amber-500/40 bg-white/95 dark:bg-slate-900/95",
      badge: "bg-amber-500/10 text-amber-500",
    },
    info: {
      icon: <Info className="w-4 h-4 text-indigo-500 shrink-0" />,
      border: "border-indigo-500/40 bg-white/95 dark:bg-slate-900/95",
      badge: "bg-indigo-500/10 text-indigo-500",
    },
  }[toast.type];

  return (
    <div
      className={`pointer-events-auto rounded-xl border p-3.5 shadow-xl backdrop-blur-md flex items-start justify-between gap-3 transition-all ${config.border}`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="mt-0.5">{config.icon}</div>
        <p className="text-xs font-medium text-slate-800 dark:text-slate-100 leading-snug break-words">
          {toast.message}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
