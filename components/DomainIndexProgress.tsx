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
 *
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
          const next = await api<State>(`/api/domains/${id}/index-chunk?limit=30`, {
            method: "POST",
          });
          setState(next);
          if (["ready", "error"].includes(next.status)) break;
          // Tiny pause to avoid hammering Vercel if a chunk completes super fast
          await new Promise((r) => setTimeout(r, 500));
        } catch {
          // Network blip: back off and retry
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
    <div className="space-y-1">
      <div className="h-1.5 bg-ink-800 rounded">
        <div
          className="h-1.5 bg-accent-500 rounded"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="text-xs text-zinc-500">
        {state.status} · {state.pages_done}/{state.pages_total} · ${state.cost.toFixed(4)}
        {state.error ? ` · ${state.error}` : ""}
      </div>
    </div>
  );
}
