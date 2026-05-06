"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { SkeletonList } from "@/components/Skeleton";
import { Icon } from "@/components/Icon";

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

const DOT: Record<Log["level"], string> = {
  info: "bg-zinc-500",
  warn: "bg-amber-400",
  error: "bg-red-400",
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
    <div className="space-y-6 animate-fadein">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-2">Système</div>
          <h1 className="h-page">Console</h1>
          <p className="h-sub">
            Logs récents (max 500 entrées). Si un truc plante, copie tout et colle-moi ça.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <button onClick={copyAll} className="btn-secondary px-3 py-2 text-xs">
            <Icon name="copy" size={12} />
            Copier tout
          </button>
          <button onClick={clear} className="btn-danger px-3 py-2 text-xs">
            <Icon name="trash" size={12} />
            Vider (&gt;1h)
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[260px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
            <Icon name="search" size={14} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer par mot-clé / module…"
            className="input pl-9"
          />
        </div>
        <div className="inline-flex bg-[#13141a] border border-[var(--border)] rounded-lg p-0.5 gap-0.5">
          {(["all", "info", "warn", "error"] as const).map((lv) => (
            <button
              key={lv}
              onClick={() => setLevel(lv)}
              className={`px-3 py-1.5 rounded-md text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 ${
                level === lv
                  ? "bg-accent-600/20 text-white"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {lv !== "all" && <span className={`w-1.5 h-1.5 rounded-full ${DOT[lv as Log["level"]]}`} />}
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
          <ul className="divide-y divide-[var(--border)] font-mono text-xs max-h-[72vh] overflow-y-auto">
            {filtered.map((l) => (
              <li key={l.id} className="px-4 py-2.5 hover:bg-[#13141a] transition-colors">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full self-center ${DOT[l.level]}`} />
                  <span className="text-zinc-600 tabular-nums">
                    {l.ts ? new Date(l.ts).toLocaleTimeString() : "—"}
                  </span>
                  <span className={`uppercase tracking-wider text-[10px] font-semibold ${TONE[l.level]}`}>
                    {l.level}
                  </span>
                  {l.module && <span className="text-accent-400 text-[11px]">{l.module}</span>}
                  <span className="text-zinc-200 break-all">{l.message}</span>
                </div>
                {l.meta && Object.keys(l.meta).length > 0 && (
                  <pre className="mt-1 ml-4 text-[10px] text-zinc-500 whitespace-pre-wrap leading-relaxed">
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
