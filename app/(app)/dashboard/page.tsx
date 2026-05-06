"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { Content } from "@/lib/types";
import { HelpIcon } from "@/components/Tooltip";
import { SkeletonList } from "@/components/Skeleton";
import { Icon } from "@/components/Icon";

const STATUS_TONE: Record<string, string> = {
  analysis: "border-zinc-700 text-zinc-400 bg-zinc-800/40",
  generated: "border-emerald-700/50 text-emerald-300 bg-emerald-500/10",
  editing: "border-blue-700/50 text-blue-300 bg-blue-500/10",
  archived: "border-zinc-700 text-zinc-500 bg-zinc-800/30",
};

const STATUS_LABELS: Record<string, string> = {
  analysis: "Analyse",
  generated: "Généré",
  editing: "En édition",
  archived: "Archivé",
};

const TYPE_LABELS: Record<string, string> = {
  blog: "Blog",
  category: "Catégorie",
  product: "Produit",
  service_lp: "Service / LP",
};

export default function DashboardPage() {
  const { data: contents } = useSWR<Content[]>("/srv/contents", fetcher, {
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
    <div className="space-y-8 animate-fadein">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Bibliothèque</div>
          <h1 className="h-page">Tes contenus</h1>
          <p className="h-sub max-w-xl">
            Lance un nouveau lot, retrouve tes générations passées, édite et exporte.
          </p>
        </div>
        <Link href="/new" className="btn-primary">
          <Icon name="plus" size={14} />
          Nouveau lot
        </Link>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Total" value={(contents || []).length} />
        <Stat label="Actifs" value={stats.active} />
        <Stat
          label="Couverture moyenne"
          value={stats.covN > 0 ? `${Math.round(stats.covSum / stats.covN)}%` : "—"}
          help="Moyenne du score de couverture sémantique sur tes contenus."
        />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[260px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
            <Icon name="search" size={14} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer par mot-clé…"
            className="input pl-9"
          />
        </div>
        <div className="inline-flex bg-[#13141a] border border-[var(--border)] rounded-lg p-0.5 gap-0.5">
          {(["active", "archived", "all"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                filter === k
                  ? "bg-accent-600/20 text-white"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {k === "active" ? "Actifs" : k === "archived" ? "Archivés" : "Tous"}
            </button>
          ))}
        </div>
      </div>

      {!contents && <SkeletonList rows={5} />}
      {contents && filtered.length === 0 && (
        <EmptyState empty={contents.length === 0} />
      )}
      {filtered.length > 0 && (
        <ul className="card divide-y divide-[var(--border)] overflow-hidden">
          {filtered.map((c) => {
            const label = TYPE_LABELS[c.content_type] || c.content_type;
            const statusLabel = STATUS_LABELS[c.status] || c.status;
            return (
              <li key={c.id}>
                <Link
                  href={`/contents/${c.id}`}
                  className="group flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-[#13141a] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-[14px] text-zinc-100 group-hover:text-white">
                      {c.chosen_title || c.keyword}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>{label}</span>
                      {c.intent && (
                        <>
                          <span className="text-zinc-700">·</span>
                          <span>{c.intent}</span>
                        </>
                      )}
                      {c.chosen_title && (
                        <>
                          <span className="text-zinc-700">·</span>
                          <span className="font-mono text-zinc-600">{c.keyword}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className={`chip ${STATUS_TONE[c.status] || STATUS_TONE.analysis}`}>
                    {statusLabel}
                  </span>
                  {c.coverage_score != null && (
                    <span
                      className="chip-soft tabular-nums"
                      title="Score de couverture sémantique"
                    >
                      {Number(c.coverage_score).toFixed(0)}%
                    </span>
                  )}
                  <Icon name="chevron-right" size={14} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
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
    <div className="card card-hover p-4">
      <div className="label inline-flex items-center">
        {label}
        {help && <HelpIcon content={help} />}
      </div>
      <div className="text-[28px] font-semibold mt-1.5 tabular-nums tracking-tight text-zinc-50">
        {value}
      </div>
    </div>
  );
}

function EmptyState({ empty }: { empty: boolean }) {
  if (!empty) {
    return (
      <div className="card p-12 text-center text-zinc-500 text-sm border-dashed">
        Rien ne correspond à ce filtre.
      </div>
    );
  }
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name="sparkles" size={20} />
      </div>
      <div className="text-zinc-100 font-medium">Aucun contenu pour l'instant</div>
      <p className="text-zinc-500 text-sm max-w-md mx-auto leading-relaxed">
        Lance ton premier lot. Tu colles tes mots-clés dans la catégorie qui va bien
        et le pipeline fait le reste.
      </p>
      <Link href="/new" className="btn-primary inline-flex">
        <Icon name="plus" size={14} />
        Créer mon premier lot
      </Link>
    </div>
  );
}
