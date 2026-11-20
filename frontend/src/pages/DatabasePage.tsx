import { useCallback, useEffect, useState } from "react";
import { Database, Link2, Play, Plus, RefreshCw } from "lucide-react";
import { api } from "../services/api";
import type { Project } from "../types";

interface DatabasePageProps {
  activeProject: Project | null;
  onLogOutput: (msg: string) => void;
}

export function DatabasePage({ activeProject, onLogOutput }: DatabasePageProps) {
  const [dbs, setDbs] = useState<{ path: string; size_bytes: number }[]>([]);
  const [selectedDb, setSelectedDb] = useState("");
  const [newDbPath, setNewDbPath] = useState("data/studio.db");
  const [schema, setSchema] = useState<Awaited<ReturnType<typeof api.inspectDatabase>> | null>(null);
  const [sql, setSql] = useState("SELECT name FROM sqlite_master WHERE type='table';");
  const [queryResult, setQueryResult] = useState<Awaited<ReturnType<typeof api.runSql>> | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDbs = useCallback(async () => {
    if (!activeProject) return;
    const res = await api.listDatabases(activeProject.id);
    setDbs(res.databases);
    if (res.databases.length > 0 && !selectedDb) {
      setSelectedDb(res.databases[0].path);
    }
  }, [activeProject, selectedDb]);

  const loadSchema = useCallback(async () => {
    if (!activeProject || !selectedDb) return;
    try {
      const s = await api.inspectDatabase(activeProject.id, selectedDb);
      setSchema(s);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Schema inspection failed");
    }
  }, [activeProject, selectedDb]);

  useEffect(() => {
    setSelectedDb("");
    setSchema(null);
    setQueryResult(null);
    loadDbs();
  }, [activeProject, loadDbs]);

  useEffect(() => {
    loadSchema();
  }, [loadSchema]);

  const runQuery = async (approved: boolean) => {
    if (!activeProject || !selectedDb) return;
    setError(null);
    setPendingApproval(false);
    try {
      const res = await api.runSql(activeProject.id, {
        db_path: selectedDb,
        sql,
        approved,
      });
      setQueryResult(res);
      if (res.approval_required) {
        setPendingApproval(true);
      } else {
        onLogOutput(`Executed SQL on ${selectedDb} (${res.row_count} rows).`);
        await loadSchema();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "SQL error");
    }
  };

  const handleCreateDb = async () => {
    if (!activeProject || !newDbPath.trim()) return;
    try {
      await api.runSql(activeProject.id, {
        db_path: newDbPath.trim(),
        sql: "CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);",
        approved: true,
        create_if_missing: true,
      });
      setSelectedDb(newDbPath.trim());
      await loadDbs();
      onLogOutput(`Initialized SQLite database ${newDbPath.trim()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create SQLite DB");
    }
  };

  if (!activeProject) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-sm text-slate-500">
        Select an active project to inspect SQLite databases and run SQL queries.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-400" />
            Database Assistant (SQLite)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Inspect tables, visualize foreign-key relationships, generate CRUD SQL, and execute safe queries.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newDbPath}
            onChange={(e) => setNewDbPath(e.target.value)}
            className="text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5"
          />
          <button
            type="button"
            onClick={handleCreateDb}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Init SQLite DB
          </button>
          <button
            type="button"
            onClick={loadDbs}
            className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {dbs.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {dbs.map((d) => (
            <button
              key={d.path}
              type="button"
              onClick={() => setSelectedDb(d.path)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono border ${
                selectedDb === d.path
                  ? "border-indigo-500 bg-indigo-500/15 text-indigo-400"
                  : "border-slate-300 dark:border-slate-700"
              }`}
            >
              {d.path} ({Math.max(1, Math.round(d.size_bytes / 1024))} KB)
            </button>
          ))}
        </div>
      )}

      {schema && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 space-y-3">
            <h2 className="font-semibold text-sm">Tables ({schema.table_count})</h2>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {schema.tables.map((t) => (
                <div
                  key={t.name}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-sm text-indigo-400">{t.name}</span>
                    <span className="text-xs text-slate-500">{t.row_count} rows</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {t.columns.map((c) => (
                      <span
                        key={c.name}
                        className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                      >
                        {c.primary_key ? "PK " : ""}
                        {c.name}: {c.type}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {Object.entries(t.crud_sql).map(([op, stmt]) => (
                      <button
                        key={op}
                        type="button"
                        onClick={() => setSql(stmt)}
                        className="text-[10px] uppercase px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white"
                      >
                        {op}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 space-y-3">
            <h2 className="font-semibold text-sm flex items-center gap-1.5">
              <Link2 className="w-4 h-4 text-cyan-400" />
              Table Relationships ({schema.relationships.length})
            </h2>
            {schema.relationships.length === 0 ? (
              <p className="text-xs text-slate-500">No foreign key relationships defined yet.</p>
            ) : (
              <div className="space-y-2">
                {schema.relationships.map((r, i) => (
                  <div
                    key={i}
                    className="text-xs font-mono rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2"
                  >
                    {r.from_table}.{r.from_column} → {r.to_table}.{r.to_column}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedDb && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">SQL Query Runner ({selectedDb})</span>
            <button
              type="button"
              onClick={() => runQuery(false)}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium inline-flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              Run SQL
            </button>
          </div>
          <textarea
            rows={4}
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            className="w-full font-mono text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3"
          />
          {pendingApproval && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-center justify-between gap-3 text-xs">
              <span className="text-amber-400">
                Write/DDL SQL requires explicit approval before modifying the SQLite database.
              </span>
              <button
                type="button"
                onClick={() => runQuery(true)}
                className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium shrink-0"
              >
                Approve &amp; Execute
              </button>
            </div>
          )}
          {error && <p className="text-xs text-rose-400">{error}</p>}

          {queryResult?.executed && queryResult.columns.length > 0 && (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 dark:bg-slate-950 font-mono">
                  <tr>
                    {queryResult.columns.map((col) => (
                      <th key={col} className="px-3 py-2 border-b border-slate-200 dark:border-slate-800">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {queryResult.rows.map((row, idx) => (
                    <tr key={idx}>
                      {row.map((cell, cidx) => (
                        <td key={cidx} className="px-3 py-1.5 font-mono">
                          {String(cell ?? "NULL")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
