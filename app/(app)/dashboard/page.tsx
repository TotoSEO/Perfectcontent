"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { Content } from "@/lib/types";
import { HelpIcon } from "@/components/Tooltip";

const STATUS_TONE: Record<string, string> = {
  analysis: "bg-ink-800 text-zinc-400 border-ink-700",
  generated: "bg-emerald-700/30 text-emerald-200 border-emerald-700",
  editing: "bg-blue-700/30 text-blue-200 border-blue-700",
  archived: "bg-ink-800 text-zinc-500 border-ink-700",
};

const TYPE_META: Record<string, { label: string; emoji: string }> = {
  blog: { label: "Blog", emoji: "📝" },
  category: { label: "Catégorie", emoji: "🗂️" },
  product: { label: "Produit", emoji: "🛒" },
  service_lp: { label: "Service / LP", emoji: "🎯" },
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

  const stats = (contents || []).reduce(
    (acc, c) => {
      if (c.status !== "archived") acc.active++;
      if (c.coverage_score != null) {
        acc.covSum += Number(c.coverage_score);
        acc.covN++;
      }
      return acc;
    },
    { active: 0, covSum: 0, covN: 0 }
  );

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="bg-gradient-to-r from-accent-600/20 via-accent-600/10 to-transparent border border-ink-800 rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Tes contenus</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Lance un nouveau lot, retrouve tes générations passées, édite et exporte.
            </p>
          </div>
          <Link
            href="/new"
            className="bg-accent-600 hover:bg-accent-500 px-4 py-2 rounded-lg text-sm font-medium shadow-md shadow-accent-500/20"
          >
            ✨ Nouveau lot
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
          <Stat label="Total" value={(contents || []).length} />
          <Stat label="Actifs" value={stats.active} />
          <Stat
            label="Couverture moyenne"
            value={stats.covN > 0 ? `${Math.round(stats.covSum / stats.covN)}%` : "—"}
            help="Moyenne du score de couverture sémantique sur tes contenus."
          />
        </div>
      </header>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Filtrer par mot-clé…"
          className="bg-ink-900 border border-ink-800 rounded-lg px-3 py-2 text-sm flex-1 min-w-[240px] focus:outline-none focus:border-accent-500"
        />
        <div className="flex gap-1 text-xs">
          {(["active", "archived", "all"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-lg border transition ${
                filter === k
                  ? "border-accent-500 bg-accent-500/20 text-white"
                  : "border-ink-800 text-zinc-500 hover:text-white hover:border-ink-700"
              }`}
            >
              {k === "active" ? "Actifs" : k === "archived" ? "Archivés" : "Tous"}
            </button>
          ))}
        </div>
      </div>

      {!contents && <p className="text-zinc-500 text-sm">Chargement…</p>}
      {contents && filtered.length === 0 && (
        <EmptyState empty={contents.length === 0} />
      )}
      {filtered.length > 0 && (
        <ul className="divide-y divide-ink-800 border border-ink-800 rounded-xl overflow-hidden bg-ink-900/40">
          {filtered.map((c) => {
            const meta = TYPE_META[c.content_type] || { label: c.content_type, emoji: "•" };
            return (
              <li key={c.id}>
                <Link
                  href={`/contents/${c.id}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-ink-800/50 transition"
                >
                  <span className="text-lg">{meta.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {c.chosen_title || c.keyword}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {meta.label}
                      {c.intent ? ` · ${c.intent}` : ""}
                      {c.chosen_title ? ` · ${c.keyword}` : ""}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] border rounded-full px-2 py-0.5 ${
                      STATUS_TONE[c.status] || STATUS_TONE.analysis
                    }`}
                  >
                    {c.status}
                  </span>
                  {c.coverage_score != null && (
                    <span
                      className="text-xs text-zinc-300 tabular-nums bg-ink-800 px-2 py-0.5 rounded-full"
                      title="Score de couverture sémantique"
                    >
                      {Number(c.coverage_score).toFixed(0)}%
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, help }: { label: string; value: number | string; help?: string }) {
  return (
    <div className="bg-ink-900/60 border border-ink-800 rounded-xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 inline-flex items-center">
        {label}
        {help && <HelpIcon content={help} />}
      </div>
      <div className="text-xl font-semibold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

function EmptyState({ empty }: { empty: boolean }) {
  if (!empty) {
    return (
      <div className="border border-dashed border-ink-800 rounded-2xl p-10 text-center text-zinc-500 text-sm">
        Rien ne correspond à ce filtre.
      </div>
    );
  }
  return (
    <div className="border border-dashed border-ink-800 rounded-2xl p-10 text-center space-y-3">
      <div className="text-4xl">📝</div>
      <div className="text-zinc-300">Aucun contenu pour l'instant.</div>
      <p className="text-zinc-500 text-sm max-w-md mx-auto">
        Lance ton premier lot : tu colles tes mots-clés (un par ligne) dans
        la catégorie qui va bien (blog, fiche produit, …) et le pipeline
        fait le reste.
      </p>
      <Link
        href="/new"
        className="inline-block bg-accent-600 hover:bg-accent-500 px-4 py-2 rounded-lg text-sm font-medium mt-2"
      >
        ✨ Créer mon premier lot
      </Link>
    </div>
  );
}
