import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface MessageContentProps {
  content: string;
}

interface Segment {
  type: "text" | "code";
  language?: string;
  value: string;
}

function parseSegments(raw: string): Segment[] {
  const regex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: raw.slice(lastIndex, match.index) });
    }
    segments.push({
      type: "code",
      language: match[1] || "code",
      value: match[2].replace(/\n$/, ""),
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < raw.length) {
    segments.push({ type: "text", value: raw.slice(lastIndex) });
  }
  return segments;
}

export function MessageContent({ content }: MessageContentProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const segments = parseSegments(content);

  const handleCopy = async (code: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  return (
    <div className="space-y-2.5 text-sm leading-relaxed">
      {segments.map((seg, idx) =>
        seg.type === "code" ? (
          <div
            key={idx}
            className="rounded-lg border border-slate-700/80 bg-slate-950 overflow-hidden my-2"
          >
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-xs text-slate-400">
              <span className="font-mono uppercase tracking-wider">{seg.language}</span>
              <button
                type="button"
                onClick={() => handleCopy(seg.value, idx)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-300"
              >
                {copiedIdx === idx ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3 overflow-x-auto text-xs font-mono text-slate-100 leading-5">
              <code>{seg.value}</code>
            </pre>
          </div>
        ) : (
          <p key={idx} className="whitespace-pre-wrap break-words">
            {seg.value}
          </p>
        )
      )}
    </div>
  );
}
