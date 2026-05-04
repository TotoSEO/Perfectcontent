"use client";

import { useEffect, useState } from "react";
import { subscribeSSE } from "@/lib/sse";

type State = {
  status: string;
  pages_done: number;
  pages_total: number;
  cost: number;
  error?: string | null;
};

export function DomainProgress({ id }: { id: string }) {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    const unsub = subscribeSSE<State>(`/api/domains/${id}/progress`, setState);
    return unsub;
  }, [id]);

  if (!state) return <p className="text-xs text-zinc-500">En attente…</p>;

  const pct =
    state.pages_total > 0 ? Math.round((state.pages_done / state.pages_total) * 100) : 0;

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
