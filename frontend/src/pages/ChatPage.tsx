import { useEffect, useRef, useState } from "react";
import { Paperclip, Plus, Send, Trash2, X } from "lucide-react";
import { MessageContent } from "../components/CodeBlock";
import { api, createChatWebSocket } from "../services/api";
import type { ChatMessage, Conversation, ModelsStatusResponse, Project } from "../types";

interface ChatPageProps {
  activeProject: Project | null;
  modelsStatus: ModelsStatusResponse | null;
  onLogError: (source: string, message: string) => void;
}

export function ChatPage({ activeProject, modelsStatus, onLogError }: ChatPageProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [selectedModel, setSelectedModel] = useState(
    modelsStatus?.config.default_model || "qwen2.5-coder:1.5b"
  );
  const [attachedFiles, setAttachedFiles] = useState<{ path: string; content: string }[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const loadConversations = async () => {
    try {
      const list = await api.listConversations();
      setConversations(list);
    } catch {
      // ignore initial load error
    }
  };

  useEffect(() => {
    loadConversations();
    return () => {
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (modelsStatus?.config.default_model) {
      setSelectedModel(modelsStatus.config.default_model);
    }
  }, [modelsStatus?.config.default_model]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const openConversation = async (convId: number) => {
    setActiveConvId(convId);
    setErrorMsg(null);
    const msgs = await api.getMessages(convId);
    setMessages(msgs);
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      setErrorMsg("Attached file must be under 512 KB.");
      return;
    }
    const content = await file.text();
    setAttachedFiles((prev) => [...prev, { path: file.name, content }]);
    e.target.value = "";
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const prompt = input.trim();
    if (!prompt || streaming) return;

    setErrorMsg(null);
    setInput("");
    setStreaming(true);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: prompt },
      { role: "assistant", content: "" },
    ]);

    const filesToSend = [...attachedFiles];
    setAttachedFiles([]);

    try {
      const ws = createChatWebSocket();
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            conversation_id: activeConvId,
            project_id: activeProject?.id ?? null,
            message: prompt,
            model_name: selectedModel,
            attached_files: filesToSend,
          })
        );
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "start") {
          setActiveConvId(data.conversation_id);
        } else if (data.type === "token") {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              next[next.length - 1] = { ...last, content: last.content + data.token };
            }
            return next;
          });
        } else if (data.type === "done") {
          setStreaming(false);
          loadConversations();
          ws.close();
        } else if (data.type === "error") {
          setStreaming(false);
          setErrorMsg(data.detail);
          onLogError("AI Chat", data.detail);
          setMessages((prev) => prev.slice(0, -1));
          ws.close();
        }
      };

      ws.onerror = () => {
        setStreaming(false);
        const msg = "WebSocket streaming error. Ensure backend and Ollama are running.";
        setErrorMsg(msg);
        onLogError("AI Chat", msg);
      };
    } catch (err) {
      setStreaming(false);
      const msg = err instanceof Error ? err.message : "Chat failed";
      setErrorMsg(msg);
      onLogError("AI Chat", msg);
    }
  };

  const handleDeleteConv = async (id: number) => {
    await api.deleteConversation(id);
    if (activeConvId === id) {
      setActiveConvId(null);
      setMessages([]);
    }
    loadConversations();
  };

  const availableModels = Array.from(
    new Set([
      selectedModel,
      ...(modelsStatus?.ollama.models.map((m) => m.name) ?? []),
      "qwen2.5-coder:1.5b",
    ])
  );

  return (
    <div className="h-full flex overflow-hidden">
      {/* Conversations list */}
      <aside className="w-60 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50/70 dark:bg-slate-950/60 shrink-0">
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Conversations
          </span>
          <button
            type="button"
            onClick={() => {
              setActiveConvId(null);
              setMessages([]);
              setErrorMsg(null);
            }}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800"
            title="New conversation"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center justify-between rounded-lg px-2.5 py-2 text-xs cursor-pointer ${
                activeConvId === conv.id
                  ? "bg-indigo-600/20 text-indigo-600 dark:text-indigo-300 font-medium"
                  : "hover:bg-slate-200/70 dark:hover:bg-slate-800/70"
              }`}
              onClick={() => openConversation(conv.id)}
            >
              <span className="truncate">{conv.title}</span>
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  handleDeleteConv(conv.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-semibold">AI Coding Chat Assistant</h1>
            <p className="text-xs text-slate-500">
              Streaming via local WebSocket • Attached project files are sandbox-delimited
            </p>
          </div>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5"
          >
            {availableModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="max-w-xl mx-auto mt-12 text-center space-y-4">
              <h2 className="text-lg font-semibold">Ask any programming, SQL, or debugging question</h2>
              <p className="text-xs text-slate-500">
                Powered locally by Ollama ({selectedModel}). No paid API keys required.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                {[
                  "Write a FastAPI CRUD router with Pydantic v2 validation for employees",
                  "Generate SQLite tables with foreign keys for departments and employees",
                  "Explain Python async/await vs threading for FastAPI endpoints",
                  "Write a React TypeScript hook for debounced search input",
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => setInput(sample)}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-indigo-500/60 text-xs text-slate-600 dark:text-slate-300"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-3xl rounded-xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <MessageContent content={msg.content || (streaming ? "Thinking..." : "")} />
                </div>
              </div>
            ))
          )}
          {errorMsg && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-400">
              {errorMsg}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={handleSend}
          className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2 bg-white/80 dark:bg-slate-950/80"
        >
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attachedFiles.map((f, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-slate-200 dark:bg-slate-800"
                >
                  {f.path}
                  <button
                    type="button"
                    onClick={() => setAttachedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <label className="p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
              <Paperclip className="w-4 h-4 text-slate-500" />
              <input type="file" className="hidden" onChange={handleUploadFile} />
            </label>
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask to generate code, refactor, explain errors, or write SQL... (Enter to send)"
              className="flex-1 resize-none rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium inline-flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
