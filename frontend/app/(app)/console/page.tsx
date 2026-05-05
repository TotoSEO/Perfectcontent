"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";

type Log = {
  id: number;
  ts: string | null;
  level: "info" | "warn" | "error";
  module: string | null;
  message: string;
  meta: Record<string, unknown> | null;
};

const TONE: Record<Log["level"], string> = {
  info: "text-zinc-300",
  warn: "text-amber-300",
  error: "text-red-300",
};

export default function ConsolePage() {
  const [level, setLevel] = useState<"all" | Log["level"]>("all");
  const [search, setSearch] = useState("");

  const path =
    level === "all"
      ? "/api/logs?limit=200"
      : `/api/logs?limit=200&level=${level}`;
  const { data: logs, mutate } = useSWR<Log[]>(path, fetcher, {
    refreshInterval: 4000,
  });

  const filtered = (logs || []).filter(
    (l) => !search || l.message.toLowerCase().includes(search.toLowerCase()) ||
           (l.module || "").toLowerCase().includes(search.toLowerCase())
  );

  async function clear() {
    if (!confirm("Effacer les logs de plus d'une heure ?")) return;
    await api("/api/logs", { method: "DELETE" });
    mutate();
  }

  function copyAll() {
    const text = filtered
      .map(
        (l) =>
          `[${l.ts}] ${l.level.toUpperCase()} ${l.module || ""} — ${l.message}` +
          (l.meta ? ` ${JSON.stringify(l.meta)}` : "")
      )
      .join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Console</h1>
        <div className="flex gap-2 text-xs">
          <button
            onClick={copyAll}
            className="px-2.5 py-1 rounded border border-ink-800 hover:bg-ink-800 text-zinc-400"
          >
            Copier tout
          </button>
          <button
            onClick={clear}
            className="px-2.5 py-1 rounded border border-ink-800 hover:bg-ink-800 text-red-400"
          >
            Vider (&gt;1h)
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrer (mot-clé, module…)"
          className="bg-ink-900 border border-ink-800 rounded px-3 py-2 text-sm flex-1 min-w-[240px]"
        />
        <div className="flex gap-1 text-xs">
          {(["all", "info", "warn", "error"] as const).map((lv) => (
            <button
              key={lv}
              onClick={() => setLevel(lv)}
              className={`px-2.5 py-1 rounded border ${
                level === lv
                  ? "border-accent-500 bg-accent-500/20 text-white"
                  : "border-ink-800 text-zinc-500 hover:text-white"
              }`}
            >
              {lv}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden">
        {!logs && <p className="p-4 text-sm text-zinc-500">Chargement…</p>}
        {logs && filtered.length === 0 && (
          <p className="p-4 text-sm text-zinc-500">Aucun log.</p>
        )}
        {filtered.length > 0 && (
          <ul className="divide-y divide-ink-800 font-mono text-xs max-h-[70vh] overflow-y-auto">
            {filtered.map((l) => (
              <li key={l.id} className="px-3 py-2 hover:bg-ink-800/50">
                <span className="text-zinc-500">
                  {l.ts ? new Date(l.ts).toLocaleTimeString() : "—"}
                </span>{" "}
                <span className={`uppercase ${TONE[l.level]}`}>{l.level}</span>{" "}
                <span className="text-accent-500">{l.module || ""}</span>{" "}
                <span>{l.message}</span>
                {l.meta && Object.keys(l.meta).length > 0 && (
                  <pre className="mt-1 text-[10px] text-zinc-500 whitespace-pre-wrap">
                    {JSON.stringify(l.meta, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
