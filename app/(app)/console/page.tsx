"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { SkeletonList } from "@/components/Skeleton";

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
    level === "all" ? "/srv/logs?limit=200" : `/srv/logs?limit=200&level=${level}`;
  const { data: logs, mutate } = useSWR<Log[]>(path, fetcher, { refreshInterval: 4000 });

  const filtered = (logs || []).filter(
    (l) =>
      !search ||
      l.message.toLowerCase().includes(search.toLowerCase()) ||
      (l.module || "").toLowerCase().includes(search.toLowerCase())
  );

  async function clear() {
    if (!confirm("Effacer les logs de plus d'une heure ?")) return;
    await api("/srv/logs", { method: "DELETE" });
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
    <div className="space-y-6 max-w-5xl animate-fadein">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Console</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Logs récents (max 500 entrées). Si un truc plante, copie tout et colle-moi ça.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <button onClick={copyAll} className="btn-ghost px-3 py-2">Copier tout</button>
          <button onClick={clear} className="btn-danger px-3 py-2">Vider (&gt;1h)</button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrer par mot-clé / module…"
          className="input flex-1 min-w-[240px]"
        />
        <div className="flex bg-[#131316] border border-[#25252a] rounded-lg p-0.5">
          {(["all", "info", "warn", "error"] as const).map((lv) => (
            <button
              key={lv}
              onClick={() => setLevel(lv)}
              className={`px-3 py-1.5 rounded-md text-xs transition-all uppercase tracking-wider ${
                level === lv
                  ? "bg-accent-600/20 text-white"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {lv}
            </button>
          ))}
        </div>
      </div>

      {!logs && <SkeletonList rows={6} />}

      {logs && filtered.length === 0 && (
        <div className="card p-10 text-center text-sm text-zinc-500">Aucun log.</div>
      )}

      {filtered.length > 0 && (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-[#1f1f24] font-mono text-xs max-h-[72vh] overflow-y-auto">
            {filtered.map((l) => (
              <li key={l.id} className="px-4 py-2.5 hover:bg-[#1a1a1e]">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-zinc-600 tabular-nums">
                    {l.ts ? new Date(l.ts).toLocaleTimeString() : "—"}
                  </span>
                  <span className={`uppercase tracking-wider text-[10px] font-semibold ${TONE[l.level]}`}>
                    {l.level}
                  </span>
                  {l.module && <span className="text-accent-400 text-[11px]">{l.module}</span>}
                  <span className="text-zinc-200">{l.message}</span>
                </div>
                {l.meta && Object.keys(l.meta).length > 0 && (
                  <pre className="mt-1 text-[10px] text-zinc-500 whitespace-pre-wrap">
                    {JSON.stringify(l.meta, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
