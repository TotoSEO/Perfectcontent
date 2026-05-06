"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type State = {
  status: string;
  pages_total: number;
  pages_done: number;
  cost: number;
  error?: string | null;
};

/**
 * Browser-driven chunked domain indexing.
 * Calls POST /api/domains/{id}/index-chunk repeatedly (~30 URLs per call,
 * fits within Vercel's 60s function budget) until status becomes "ready".
 */
export function DomainProgress({ id, autoStart = true }: { id: string; autoStart?: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!autoStart) return;
    cancelled.current = false;
    let stopped = false;

    (async () => {
      while (!stopped && !cancelled.current) {
        try {
          const next = await api<State>(`/srv/domains/${id}/index-chunk?limit=30`, {
            method: "POST",
          });
          setState(next);
          if (["ready", "error"].includes(next.status)) break;
          await new Promise((r) => setTimeout(r, 500));
        } catch {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    })();

    return () => {
      stopped = true;
      cancelled.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, autoStart]);

  if (!state) return <p className="text-xs text-zinc-500">Démarrage de l'indexation…</p>;

  const pct =
    state.pages_total > 0
      ? Math.round((state.pages_done / state.pages_total) * 100)
      : 0;

  return (
    <div className="space-y-1.5">
      <div className="h-1.5 bg-[#15161b] rounded-full overflow-hidden">
        <div
          className="h-1.5 bg-gradient-to-r from-accent-500 to-accent-400 rounded-full transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-zinc-500 tabular-nums">
        <span>
          <span className="text-zinc-300">{state.pages_done}</span>
          <span className="text-zinc-600"> / {state.pages_total}</span>
          <span className="text-zinc-600 ml-1.5">· {state.status}</span>
        </span>
        <span>${state.cost.toFixed(4)}</span>
      </div>
      {state.error && <div className="text-xs text-red-300">{state.error}</div>}
    </div>
  );
}
