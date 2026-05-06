"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Slide, ScoreBadge, KpiTile } from "@/components/audit/Slide";
import { BarChart, DonutChart, Histogram } from "@/components/audit/Charts";
import type { CategoryReport } from "@/lib/audit/types";

type AuditOut = {
  id: string;
  name: string;
  source_filename: string | null;
  url_count: number;
  score: number | null;
  summary: {
    schema_version: number;
    generated_at: string;
    global_score: number;
    categories: Omit<CategoryReport, "issues_full">[];
  } | null;
  issues: { categories: Record<string, CategoryReport["issues_full"]> } | null;
  created_at: string;
};

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-yellow-50 text-yellow-700 border-yellow-200",
  info: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

export default function AuditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const { data: audit, mutate } = useSWR<AuditOut>(
    id ? `/srv/audits/${id}` : null,
    fetcher,
  );
  const [exporting, setExporting] = useState(false);

  const slides = useMemo(() => {
    if (!audit?.summary) return [];
    return [
      { kind: "cover" } as const,
      { kind: "summary" } as const,
      ...audit.summary.categories.map((c) => ({ kind: "category" as const, category: c })),
    ];
  }, [audit]);

  const total = slides.length;

  async function exportXlsx() {
    if (!audit?.issues) return;
    setExporting(true);
    try {
      const { exportIssuesToXlsx } = await import("@/lib/audit/export");
      await exportIssuesToXlsx(audit.name, audit.issues.categories, audit.summary?.categories || []);
    } finally {
      setExporting(false);
    }
  }

  async function deleteAudit() {
    if (!confirm("Supprimer cet audit ?")) return;
    await api(`/srv/audits/${id}`, { method: "DELETE" });
    router.push("/audits");
  }

  if (!audit) return <p className="text-zinc-500">Chargement…</p>;
  if (!audit.summary) return <p className="text-zinc-500">Cet audit n'a pas de rapport.</p>;

  return (
    <div className="space-y-4 max-w-[1320px] mx-auto animate-fadein">
      {/* Header / actions */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="label mb-1.5">Audit technique</div>
          <h1 className="text-[26px] font-semibold tracking-tight truncate">{audit.name}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {audit.url_count} URLs · score global{" "}
            <strong className={
              audit.summary.global_score >= 80 ? "text-emerald-300" :
              audit.summary.global_score >= 50 ? "text-amber-300" :
              "text-red-300"
            }>
              {audit.summary.global_score}/100
            </strong>
            {" · généré le "}{new Date(audit.summary.generated_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportXlsx} disabled={exporting} className="btn-primary text-sm">
            {exporting ? "Export…" : "📊 Exporter les problèmes"}
          </button>
          <button onClick={deleteAudit} className="btn-ghost text-xs">
            Supprimer
          </button>
        </div>
      </header>

      <p className="text-xs text-zinc-500">
        💡 Chaque slide est en 16:9 — tu fais un screenshot et tu colles direct dans Google Slides.
      </p>

      {/* Slides */}
      <div className="space-y-6">
        {slides.map((s, i) => {
          if (s.kind === "cover") {
            return (
              <Slide
                key={i}
                index={i}
                total={total}
                title={`Audit technique SEO`}
                subtitle="Rapport"
                rightHeader={<ScoreBadge score={audit.summary!.global_score} />}
                footer={audit.source_filename ? `Source : ${audit.source_filename}` : ""}
              >
                <div className="flex-1 flex flex-col justify-center items-start gap-6 pb-4">
                  <h1 className="text-6xl font-bold tracking-tight text-zinc-900 max-w-[14ch] leading-tight">
                    {audit.name}
                  </h1>
                  <div className="flex gap-8 text-zinc-700">
                    <BigStat label="URLs analysées" value={audit.url_count.toLocaleString("fr-FR")} />
                    <BigStat label="Catégories" value={audit.summary!.categories.length} />
                    <BigStat
                      label="Problèmes détectés"
                      value={
                        Object.values(audit.issues?.categories || {}).reduce(
                          (acc, cur) => acc + cur.length,
                          0,
                        )
                      }
                    />
                  </div>
                </div>
              </Slide>
            );
          }
          if (s.kind === "summary") {
            return (
              <Slide
                key={i}
                index={i}
                total={total}
                title="Synthèse — score par catégorie"
                rightHeader={<ScoreBadge score={audit.summary!.global_score} />}
                footer={`${audit.url_count} URLs analysées`}
              >
                <div className="flex-1 grid grid-cols-2 gap-x-10 gap-y-3 content-center pb-4">
                  {audit.summary!.categories.map((c) => (
                    <CategoryBar key={c.id} c={c} />
                  ))}
                </div>
              </Slide>
            );
          }
          // Category slide
          const c = s.category;
          return (
            <Slide
              key={i}
              index={i}
              total={total}
              title={c.label}
              subtitle={`Catégorie ${audit.summary!.categories.findIndex(x => x.id === c.id) + 1} / ${audit.summary!.categories.length}`}
              rightHeader={<ScoreBadge score={c.score} />}
              footer={c.summary || ""}
            >
              <div className="flex-1 grid grid-cols-12 gap-8 pb-4 min-h-0">
                {/* Left: KPIs + chart */}
                <div className="col-span-5 flex flex-col gap-5 min-w-0">
                  <div className="grid grid-cols-2 gap-2">
                    {c.kpis.map((k, j) => (
                      <KpiTile key={j} label={k.label} value={k.value} tone={k.tone || "ok"} />
                    ))}
                  </div>
                  {c.chart && <CategoryChart chart={c.chart} />}
                </div>
                {/* Right: top issues table */}
                <div className="col-span-7 min-w-0 flex flex-col">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-zinc-500 mb-2">
                    Top {Math.min(c.top_issues.length, 8)} problèmes
                  </div>
                  {c.top_issues.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center rounded-lg border border-dashed border-emerald-200 bg-emerald-50 text-emerald-600 text-sm">
                      ✓ Aucun problème détecté dans cette catégorie
                    </div>
                  ) : (
                    <IssuesTable rows={c.top_issues.slice(0, 8)} columns={c.columns} />
                  )}
                </div>
              </div>
            </Slide>
          );
        })}
      </div>
    </div>
  );
}

function BigStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="text-4xl font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}

function CategoryBar({ c }: { c: Omit<CategoryReport, "issues_full"> }) {
  const tone =
    c.score >= 80 ? "bg-emerald-500" :
    c.score >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-zinc-800">{c.label}</span>
        <span className="tabular-nums text-zinc-500">
          <strong className={
            c.score >= 80 ? "text-emerald-600" :
            c.score >= 50 ? "text-amber-600" : "text-red-600"
          }>{c.score}</strong>/100
        </span>
      </div>
      <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
        <div className={`h-full ${tone} transition-all`} style={{ width: `${c.score}%` }} />
      </div>
      <div className="text-xs text-zinc-500 truncate">{c.summary}</div>
    </div>
  );
}

function CategoryChart({ chart }: { chart: NonNullable<CategoryReport["chart"]> }) {
  if (chart.type === "donut") {
    if (!chart.segments.length) {
      return <div className="text-xs text-zinc-400">Aucune donnée à représenter.</div>;
    }
    return <DonutChart segments={chart.segments} size={200} thickness={32} />;
  }
  if (chart.type === "bar") {
    return <BarChart bars={chart.bars} max={chart.max} width={300} />;
  }
  return <Histogram bins={chart.bins} />;
}

function IssuesTable({
  rows,
  columns,
}: {
  rows: CategoryReport["top_issues"];
  columns: CategoryReport["columns"];
}) {
  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden">
      <table className="w-full text-[11px] table-fixed">
        <thead className="bg-zinc-50">
          <tr>
            <th className="text-left px-2.5 py-1.5 w-16 uppercase tracking-wider text-[10px] text-zinc-500 font-medium">Sév.</th>
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left px-2.5 py-1.5 uppercase tracking-wider text-[10px] text-zinc-500 font-medium"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-zinc-100">
              <td className="px-2.5 py-1.5">
                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider border ${SEVERITY_TONE[r.severity] || ""}`}>
                  {r.severity}
                </span>
              </td>
              {columns.map((col) => {
                const v = r[col.key];
                return (
                  <td
                    key={col.key}
                    className="px-2.5 py-1.5 truncate text-zinc-800"
                    title={v == null ? "" : String(v)}
                  >
                    {v == null || v === "" ? "—" : String(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
