import { useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, HelpCircle, X } from "lucide-react";
import type { ConfirmDialogOptions, PromptDialogOptions } from "../types";

interface ConfirmModalProps {
  options: ConfirmDialogOptions | null;
  onClose: () => void;
}

export function ConfirmModal({ options, onClose }: ConfirmModalProps) {
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!options) return;
    confirmBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        options.onCancel?.();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [options, onClose]);

  if (!options) return null;

  const variant = options.variant || "primary";

  const iconMap = {
    danger: <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />,
    primary: <HelpCircle className="w-5 h-5 text-indigo-500 shrink-0" />,
  };

  const confirmBtnClasses = {
    danger: "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/20",
    warning: "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/20",
    primary: "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/20",
  }[variant];

  const handleConfirm = async () => {
    await options.onConfirm();
    onClose();
  };

  const handleCancel = () => {
    options.onCancel?.();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
      onClick={handleCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {iconMap[variant]}
            <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {options.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Close dialog"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
          {options.message}
        </p>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={handleCancel}
            className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
          >
            {options.cancelLabel || "Cancel"}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={handleConfirm}
            className={`px-4 py-2 text-xs font-medium rounded-lg shadow-sm transition-colors ${confirmBtnClasses}`}
          >
            {options.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface PromptModalProps {
  options: PromptDialogOptions | null;
  onClose: () => void;
}

export function PromptModal({ options, onClose }: PromptModalProps) {
  const [value, setValue] = useState(options?.defaultValue || "");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!options) return;
    setValue(options.defaultValue || "");
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        options.onCancel?.();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [options, onClose]);

  if (!options) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    await options.onConfirm(value.trim());
    onClose();
  };

  const handleCancel = () => {
    options.onCancel?.();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
      onClick={handleCancel}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="prompt-dialog-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {options.title}
          </h2>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Close dialog"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
          {options.message}
        </p>

        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={options.placeholder || "Enter value..."}
          className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={handleCancel}
            className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
          >
            {options.cancelLabel || "Cancel"}
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white shadow-sm transition-colors"
          >
            {options.confirmLabel || "Submit"}
          </button>
        </div>
      </form>
    </div>
  );
}
