"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { Content } from "@/lib/types";

const STATUS_TONE: Record<string, string> = {
  analysis: "bg-ink-800 text-zinc-400 border-ink-700",
  generated: "bg-emerald-700/30 text-emerald-200 border-emerald-700",
  editing: "bg-blue-700/30 text-blue-200 border-blue-700",
  archived: "bg-ink-800 text-zinc-500 border-ink-700",
};

const TYPE_LABELS: Record<string, string> = {
  blog: "Blog",
  category: "Catégorie",
  product: "Produit",
  service_lp: "Service / LP",
};

export default function DashboardPage() {
  const { data: contents } = useSWR<Content[]>("/api/contents", fetcher, {
    refreshInterval: 5000,
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "archived">("active");

  const filtered = (contents || []).filter((c) => {
    if (filter === "active" && c.status === "archived") return false;
    if (filter === "archived" && c.status !== "archived") return false;
    if (search && !c.keyword.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <h1 className="text-2xl font-semibold">Contenus</h1>
        <Link
          href="/new"
          className="bg-accent-600 hover:bg-accent-500 px-3 py-2 rounded text-sm font-medium"
        >
          + Nouveau lot
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrer par mot-clé…"
          className="bg-ink-900 border border-ink-800 rounded px-3 py-2 text-sm flex-1 min-w-[240px]"
        />
        <div className="flex gap-1 text-xs">
          {(["active", "archived", "all"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-2.5 py-1 rounded border ${
                filter === k
                  ? "border-accent-500 bg-accent-500/20 text-white"
                  : "border-ink-800 text-zinc-500 hover:text-white"
              }`}
            >
              {k === "active" ? "Actifs" : k === "archived" ? "Archivés" : "Tous"}
            </button>
          ))}
        </div>
      </div>

      {!contents && <p className="text-zinc-500">Chargement…</p>}
      {contents && filtered.length === 0 && (
        <div className="border border-dashed border-ink-800 rounded-xl p-10 text-center text-zinc-500 space-y-2">
          {contents.length === 0 ? (
            <>
              <p>Aucun contenu pour l'instant.</p>
              <Link
                href="/new"
                className="inline-block text-accent-500 hover:underline text-sm"
              >
                Créer ton premier lot →
              </Link>
            </>
          ) : (
            <p>Rien ne correspond à ce filtre.</p>
          )}
        </div>
      )}
      {filtered.length > 0 && (
        <ul className="divide-y divide-ink-800 border border-ink-800 rounded-xl overflow-hidden">
          {filtered.map((c) => (
            <li key={c.id}>
              <Link
                href={`/contents/${c.id}`}
                className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-ink-800/40"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {c.chosen_title || c.keyword}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {TYPE_LABELS[c.content_type] || c.content_type}
                    {c.intent ? ` · ${c.intent}` : ""}
                  </div>
                </div>
                <span
                  className={`text-xs border rounded px-2 py-0.5 ${
                    STATUS_TONE[c.status] || STATUS_TONE.analysis
                  }`}
                >
                  {c.status}
                </span>
                {c.coverage_score != null && (
                  <span className="text-xs text-zinc-400 tabular-nums">
                    {Number(c.coverage_score).toFixed(0)}%
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
