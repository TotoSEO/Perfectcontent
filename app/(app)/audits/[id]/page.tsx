"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Slide, ScoreBadge, KpiTile } from "@/components/audit/Slide";
import { BarChart, DonutChart, Histogram } from "@/components/audit/Charts";
import { VbtLogo } from "@/components/audit/Logo";
import { VBT } from "@/lib/audit/brand";
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

const SEV_TONE: Record<string, { bg: string; fg: string }> = {
  critical: { bg: "#F8E4E0", fg: "#642720" },
  high:     { bg: "#FBE9D6", fg: "#7E411A" },
  medium:   { bg: "#FBF4DE", fg: "#7C621A" },
  low:      { bg: "#F4F1E6", fg: "#534111" },
  info:     { bg: "#F1ECE6", fg: "#5C4A41" },
};

export default function AuditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const { data: audit, error: loadErr } = useSWR<AuditOut>(
    id ? `/srv/audits/${id}` : null,
    fetcher,
  );
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const slides = useMemo(() => {
    if (!audit?.summary) return [] as Array<{ kind: "cover" } | { kind: "summary" } | { kind: "category"; category: Omit<CategoryReport, "issues_full"> }>;
    return [
      { kind: "cover" } as const,
      { kind: "summary" } as const,
      ...audit.summary.categories.map((c) => ({ kind: "category" as const, category: c })),
    ];
  }, [audit]);

  const total = slides.length;
  const totalIssues = useMemo(
    () => Object.values(audit?.issues?.categories || {}).reduce((acc, cur) => acc + (cur?.length || 0), 0),
    [audit],
  );

  async function exportXlsx() {
    if (!audit?.issues || !audit.summary) return;
    setExporting(true);
    setExportErr(null);
    try {
      const { exportIssuesToXlsx } = await import("@/lib/audit/export");
      await exportIssuesToXlsx(audit.name, audit.issues.categories, audit.summary.categories);
    } catch (e) {
      setExportErr(String(e));
    } finally {
      setExporting(false);
    }
  }

  async function deleteAudit() {
    if (!confirm("Supprimer cet audit ?")) return;
    await api(`/srv/audits/${id}`, { method: "DELETE" });
    router.push("/audits");
  }

  if (loadErr) {
    return (
      <div className="page-shell page-shell-mid">
      <div className="card p-6 text-sm text-red-300">
        Audit indisponible. Si l'erreur mentionne <code>relation "audits" does not exist</code>,
        applique la migration SQL fournie dans Supabase.
      </div>
      </div>
    );
  }
  if (!audit) return <div className="page-shell"><p className="text-zinc-500">Chargement…</p></div>;
  if (!audit.summary) return <div className="page-shell"><p className="text-zinc-500">Cet audit n'a pas encore de rapport.</p></div>;

  const generatedDate = new Date(audit.summary.generated_at).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="page-shell space-y-4 animate-fadein" style={{ maxWidth: 1320 }}>
      {/* App-side header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="label mb-1.5">Audit technique</div>
          <h1 className="text-[26px] font-semibold tracking-tight truncate">{audit.name}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            <strong className="tabular-nums text-zinc-300">{audit.url_count.toLocaleString("fr-FR")}</strong> URLs ·{" "}
            score global{" "}
            <strong
              className={
                audit.summary.global_score >= 80 ? "text-emerald-300" :
                audit.summary.global_score >= 50 ? "text-amber-300" : "text-red-300"
              }
            >
              {audit.summary.global_score}/100
            </strong>
            {" · généré le "}{generatedDate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportXlsx}
            disabled={exporting || !audit.issues}
            className="btn-primary text-sm"
            title="Télécharger un fichier .xlsx avec un onglet par catégorie de problème (importable dans Google Sheets)"
          >
            {exporting ? "Export en cours…" : "📊 Exporter les problèmes"}
          </button>
          <button onClick={deleteAudit} className="btn-ghost text-xs">Supprimer</button>
        </div>
      </header>

      {exportErr && (
        <div className="card border-red-700/50 bg-red-900/20 text-red-100 p-3 text-sm">
          Échec export : {exportErr}
        </div>
      )}

      <p className="text-xs text-zinc-500">
        💡 Chaque slide est en 16:9 — capture-la et colle-la directement dans tes Google Slides client.
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
                title="Audit technique SEO"
                variant="cover"
                footer={audit.source_filename ? `Source : ${audit.source_filename}` : "Audit technique SEO"}
              >
                <div className="flex-1 flex items-center justify-between gap-12 min-h-0">
                  <div className="flex-1 min-w-0 space-y-7">
                    <div
                      className="text-[12px] uppercase tracking-[0.28em]"
                      style={{ color: VBT.terracotta600, fontWeight: 700 }}
                    >
                      Audit technique SEO
                    </div>
                    <h1
                      className="leading-[1.05]"
                      style={{
                        fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
                        fontWeight: 800,
                        fontSize: 64,
                        letterSpacing: "-0.025em",
                        color: VBT.ink,
                      }}
                    >
                      {audit.name}
                    </h1>
                    <div
                      className="text-base"
                      style={{ color: VBT.inkSoft, fontWeight: 500 }}
                    >
                      Préparé le {generatedDate}
                    </div>
                    <div className="flex gap-10 pt-2">
                      <BigStat label="URLs analysées" value={audit.url_count.toLocaleString("fr-FR")} />
                      <BigStat label="Catégories" value={audit.summary!.categories.length} />
                      <BigStat label="Problèmes" value={totalIssues.toLocaleString("fr-FR")} />
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-center gap-6">
                    <VbtLogo size={120} layout="stack" />
                    <ScoreBadge score={audit.summary!.global_score} />
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
                footer={`${audit.url_count} URLs analysées · ${totalIssues} problèmes`}
              >
                <div className="flex-1 grid grid-cols-2 gap-x-12 gap-y-3 content-center pb-2 min-h-0">
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
              <div className="flex-1 grid grid-cols-12 gap-10 pb-3 min-h-0">
                {/* Left: KPIs + chart */}
                <div className="col-span-5 flex flex-col gap-5 min-w-0">
                  <div className="grid grid-cols-2 gap-2.5">
                    {c.kpis.map((k, j) => (
                      <KpiTile key={j} label={k.label} value={k.value} tone={k.tone || "ok"} />
                    ))}
                  </div>
                  {c.chart && <CategoryChart chart={c.chart} />}
                </div>
                {/* Right: top issues table */}
                <div className="col-span-7 min-w-0 flex flex-col">
                  <div
                    className="text-[11px] uppercase tracking-[0.16em] mb-2.5"
                    style={{ color: VBT.terracotta600, fontWeight: 700 }}
                  >
                    Top {Math.min(c.top_issues.length, 8)} problèmes
                  </div>
                  {c.top_issues.length === 0 ? (
                    <div
                      className="flex-1 flex items-center justify-center rounded-xl text-sm"
                      style={{
                        border: `1px dashed #C6D9B0`,
                        background: "#F0F6E8",
                        color: VBT.good,
                        fontWeight: 600,
                      }}
                    >
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
      <div
        className="text-[10px] uppercase tracking-[0.18em]"
        style={{ color: VBT.zinc, fontWeight: 700 }}
      >
        {label}
      </div>
      <div
        className="tabular-nums mt-1.5"
        style={{
          color: VBT.terracotta700,
          fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
          fontSize: 40,
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CategoryBar({ c }: { c: Omit<CategoryReport, "issues_full"> }) {
  const fill =
    c.score >= 80 ? VBT.good :
    c.score >= 50 ? VBT.amber500 : VBT.brick500;
  const textColor =
    c.score >= 80 ? VBT.good :
    c.score >= 50 ? VBT.amber600 : VBT.brick500;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span
          className="font-semibold"
          style={{
            color: VBT.ink,
            fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
          }}
        >
          {c.label}
        </span>
        <span className="tabular-nums" style={{ color: VBT.zinc }}>
          <strong style={{ color: textColor, fontWeight: 700 }}>{c.score}</strong>/100
        </span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: VBT.paperEdge }}>
        <div
          className="h-full transition-all"
          style={{
            width: `${c.score}%`,
            background: `linear-gradient(90deg, ${fill}DD, ${fill})`,
          }}
        />
      </div>
      <div className="text-xs truncate" style={{ color: VBT.inkSoft }}>{c.summary}</div>
    </div>
  );
}

function CategoryChart({ chart }: { chart: NonNullable<CategoryReport["chart"]> }) {
  if (chart.type === "donut") {
    if (!chart.segments.length) {
      return <div className="text-xs italic" style={{ color: VBT.zinc }}>Aucune donnée à représenter.</div>;
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
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${VBT.paperEdge}` }}>
      <table className="w-full text-[11px] table-fixed">
        <thead style={{ background: VBT.terracotta50 }}>
          <tr>
            <th
              className="text-left px-2.5 py-2 w-16 uppercase tracking-[0.1em] text-[10px]"
              style={{ color: VBT.terracotta700, fontWeight: 700 }}
            >
              Sév.
            </th>
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left px-2.5 py-2 uppercase tracking-[0.1em] text-[10px]"
                style={{ color: VBT.terracotta700, fontWeight: 700 }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const sev = SEV_TONE[r.severity] || SEV_TONE.info;
            return (
              <tr key={i} style={{ borderTop: `1px solid ${VBT.paperEdge}` }}>
                <td className="px-2.5 py-1.5">
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider"
                    style={{ background: sev.bg, color: sev.fg, fontWeight: 700 }}
                  >
                    {r.severity}
                  </span>
                </td>
                {columns.map((col) => {
                  const v = r[col.key];
                  return (
                    <td
                      key={col.key}
                      className="px-2.5 py-1.5 truncate"
                      style={{ color: VBT.ink }}
                      title={v == null ? "" : String(v)}
                    >
                      {v == null || v === "" ? "—" : String(v)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
