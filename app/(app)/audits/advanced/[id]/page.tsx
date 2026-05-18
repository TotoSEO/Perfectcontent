"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { AdvSlide, SectionPill } from "@/components/audit/advanced/AdvSlide";
import {
  DataSlideBody,
  InfoSlideBody,
  SectionCoverBody,
  RecoSlideBody,
  AnchorBarsBody,
  AnchorTableBody,
  PrioritySlideBody,
} from "@/components/audit/advanced/SlideContent";
import { VbtLogo } from "@/components/audit/Logo";
import { ScoreBadge } from "@/components/audit/Slide";
import { VBT } from "@/lib/audit/brand";
import type { AdvReport, AdvSlide as AdvSlideType, AdvSubcategory } from "@/lib/audit/advanced/types";

type AuditOut = {
  id: string;
  name: string;
  source_filename: string | null;
  url_count: number;
  score: number | null;
  summary: (Omit<AdvReport, "slides" | "sections"> & {
    sections: (Omit<AdvReport["sections"][number], "subcategories"> & {
      subcategories: Omit<AdvSubcategory, "issues_full">[];
    })[];
    slides: AdvSlideType[];
  }) | null;
  issues: { categories: Record<string, AdvSubcategory["issues_full"]> } | null;
  created_at: string;
};

export default function AdvancedAuditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const { data: audit, error: loadErr } = useSWR<AuditOut>(
    id ? `/srv/audits/${id}` : null,
    fetcher,
  );
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiErr, setAiErr] = useState<string | null>(null);

  const isAdvanced = audit?.summary?.audit_type === "advanced";

  // Pre-process slides: stitch the audit name into the cover and the AI
  // summary into the priority slide.
  const slides = useMemo<AdvSlideType[]>(() => {
    if (!audit?.summary?.slides) return [];
    return audit.summary.slides.map((s) => {
      if (s.kind === "cover") return { ...s, audit_name: audit.name };
      if (s.kind === "priority") return { ...s, ai_summary: aiSummary ?? s.ai_summary, ai_summary_error: aiErr };
      return s;
    });
  }, [audit, aiSummary, aiErr]);
  const total = slides.length;

  const totalIssues = useMemo(() => {
    if (!audit?.issues) return 0;
    return Object.values(audit.issues.categories || {}).reduce((acc, cur) => acc + (cur?.length || 0), 0);
  }, [audit]);

  async function generateAiSummary() {
    if (!audit?.summary) return;
    setAiBusy(true);
    setAiErr(null);
    try {
      const res = await api<{ summary: string; cost_usd: number }>("/srv/audits/priority-summary", {
        method: "POST",
        json: {
          audit_name: audit.name,
          domain: audit.summary.domain,
          url_count: audit.url_count,
          global_score: Number(audit.score || 0),
          section_summaries: audit.summary.sections.map((s) => ({
            label: s.label,
            score: s.score,
            weight: s.weight,
            summary: s.summary,
          })),
          priorities: audit.summary.priorities,
        },
        timeoutMs: 60_000,
      });
      setAiSummary(res.summary);
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  }

  async function exportXlsx() {
    if (!audit?.issues || !audit.summary) return;
    setExporting(true);
    setExportErr(null);
    try {
      // Re-hydrate full subcategories with issues for the export.
      const fullSections = audit.summary.sections.map((s) => ({
        ...s,
        subcategories: s.subcategories.map((sub) => ({
          ...sub,
          issues_full: audit.issues!.categories[sub.id] || [],
        })),
      }));
      const fullReport: AdvReport = {
        ...audit.summary,
        sections: fullSections,
        slides: audit.summary.slides,
      };
      const { exportAdvancedToXlsx } = await import("@/lib/audit/advanced/export");
      await exportAdvancedToXlsx(fullReport, audit.name);
    } catch (e) {
      setExportErr(String(e));
    } finally {
      setExporting(false);
    }
  }

  async function deleteAudit() {
    if (!confirm("Supprimer cet audit ?")) return;
    await api(`/srv/audits/${id}`, { method: "DELETE" });
    router.push("/audits/advanced");
  }

  if (loadErr) {
    return (
      <div className="page-shell page-shell-mid">
        <div className="card p-6 text-sm text-red-300">Audit indisponible.</div>
      </div>
    );
  }
  if (!audit) return <div className="page-shell"><p className="text-zinc-500">Chargement…</p></div>;
  if (!audit.summary) return <div className="page-shell"><p className="text-zinc-500">Cet audit n'a pas encore de rapport.</p></div>;
  if (!isAdvanced) {
    return (
      <div className="page-shell page-shell-mid">
        <div className="card p-6 text-sm text-amber-300">
          Cet audit a été créé en mode "classique" — il est visible sur la page <a href={`/audits/${audit.id}`} className="underline">audit technique</a>.
        </div>
      </div>
    );
  }

  const generatedDate = new Date(audit.summary.generated_at).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="page-shell space-y-4 animate-fadein" style={{ maxWidth: 1320 }}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="label mb-1.5 text-accent-300">Audit technique avancé</div>
          <h1 className="text-[26px] font-semibold tracking-tight truncate">{audit.name}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            <strong className="tabular-nums text-zinc-300">{audit.url_count.toLocaleString("fr-FR")}</strong> URLs ·{" "}
            score global{" "}
            <strong
              className={
                Number(audit.score) >= 80 ? "text-emerald-300" :
                Number(audit.score) >= 50 ? "text-amber-300" : "text-red-300"
              }
            >
              {audit.summary.global_score}/100
            </strong>
            {" · "}{slides.length} slides · {totalIssues} problèmes · généré le {generatedDate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportXlsx}
            disabled={exporting || !audit.issues}
            className="btn-primary text-sm"
            title="Exporte le fichier .xlsx complet avec un onglet par sous-catégorie de problème et un onglet de priorisation."
          >
            {exporting ? "Export en cours…" : "📊 Exporter le fichier XLSX"}
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

      <div className="space-y-6">
        {slides.map((s, i) => {
          if (s.kind === "cover") {
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                variant="cover"
                footer={audit.source_filename ? `Source : ${audit.source_filename}` : "Audit technique avancé SEO"}
              >
                <div className="flex-1 flex items-center justify-between gap-12 min-h-0">
                  <div className="flex-1 min-w-0 space-y-7">
                    <div
                      className="text-[12px] uppercase tracking-[0.28em]"
                      style={{ color: VBT.terracotta600, fontWeight: 700 }}
                    >
                      Audit technique SEO — Édition avancée
                    </div>
                    <h1
                      className="leading-[1.05]"
                      style={{
                        fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
                        fontWeight: 800,
                        fontSize: 60,
                        letterSpacing: "-0.025em",
                        color: VBT.ink,
                        wordBreak: "break-word",
                      }}
                    >
                      {audit.name}
                    </h1>
                    <div
                      className="text-base"
                      style={{ color: VBT.inkSoft, fontWeight: 500 }}
                    >
                      Préparé le {generatedDate}
                      {audit.summary?.domain && (
                        <span style={{ color: VBT.terracotta600 }}>
                          {" · "}
                          {(() => { try { return new URL(audit.summary.domain).hostname; } catch { return audit.summary.domain; } })()}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-10 gap-y-3 pt-2">
                      <BigStat label="URLs analysées" value={s.url_count.toLocaleString("fr-FR")} />
                      <BigStat label="Catégories" value={s.sections_count} />
                      <BigStat label="Problèmes" value={s.issues_count.toLocaleString("fr-FR")} />
                      <BigStat label="Slides" value={total} />
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-center gap-6">
                    <VbtLogo size={120} layout="stack" />
                    <ScoreBadge score={audit.summary!.global_score} />
                  </div>
                </div>
              </AdvSlide>
            );
          }
          if (s.kind === "summary") {
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                title="Synthèse — score par catégorie"
                rightHeader={<ScoreBadge score={s.global_score} />}
                footer={`${audit.url_count.toLocaleString("fr-FR")} URLs · ${totalIssues} problèmes`}
              >
                <div className="flex-1 grid grid-cols-2 gap-x-10 gap-y-3 content-center pb-2 min-h-0">
                  {s.sections.map((c) => (
                    <SummaryBar key={c.id} c={c} />
                  ))}
                </div>
              </AdvSlide>
            );
          }
          if (s.kind === "section-cover") {
            const sectionIndex = audit.summary!.sections.findIndex((x) => x.id === s.section_id);
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                variant="section-cover"
                footer={`Partie ${sectionIndex + 1} sur ${audit.summary!.sections.length}`}
              >
                <SectionCoverBody slide={s} partOf={`${audit.summary!.sections.length} parties dans le rapport`} />
              </AdvSlide>
            );
          }
          if (s.kind === "data") {
            const sec = audit.summary!.sections.find((x) => x.id === s.section_id);
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                title={s.title}
                subtitle={sec?.label}
                rightHeader={s.issues_count > 0 ? <SectionPill tone="warn">{s.issues_count} problème{s.issues_count > 1 ? "s" : ""}</SectionPill> : <SectionPill tone="ok">OK</SectionPill>}
                footer={sec?.label}
              >
                <DataSlideBody slide={s} />
              </AdvSlide>
            );
          }
          if (s.kind === "info") {
            const sec = audit.summary!.sections.find((x) => x.id === s.section_id);
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                title={s.title}
                subtitle={sec?.label}
                rightHeader={<SectionPill>Information</SectionPill>}
                footer={sec?.label}
              >
                <InfoSlideBody slide={s} />
              </AdvSlide>
            );
          }
          if (s.kind === "anchor-bars") {
            const sec = audit.summary!.sections.find((x) => x.id === s.section_id);
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                title={s.title}
                subtitle={sec?.label}
                rightHeader={s.xlsx_sheet && s.issues_count > 0 ? <SectionPill tone="warn">{s.issues_count.toLocaleString("fr-FR")} liens</SectionPill> : undefined}
                footer={sec?.label}
              >
                <AnchorBarsBody slide={s} />
              </AdvSlide>
            );
          }
          if (s.kind === "anchor-table") {
            const sec = audit.summary!.sections.find((x) => x.id === s.section_id);
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                title={s.title}
                subtitle={sec?.label}
                rightHeader={s.issues_count > 0 ? <SectionPill tone="warn">{s.rows.length} pages</SectionPill> : undefined}
                footer={sec?.label}
              >
                <AnchorTableBody slide={s} />
              </AdvSlide>
            );
          }
          if (s.kind === "reco") {
            const sec = audit.summary!.sections.find((x) => x.id === s.section_id);
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                variant="reco"
                title={s.title}
                subtitle={`${sec?.label} — Recommandations`}
                rightHeader={<SectionPill>Recommandations</SectionPill>}
                footer={sec?.label}
              >
                <RecoSlideBody slide={s} />
              </AdvSlide>
            );
          }
          if (s.kind === "priority") {
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                variant="priority"
                title={s.title}
                subtitle="Plan d'action"
                rightHeader={<SectionPill tone="warn">Top {s.items.length}</SectionPill>}
                footer="Plan d'action priorisé"
              >
                <PrioritySlideBody slide={s} onRequestAi={generateAiSummary} busy={aiBusy} />
              </AdvSlide>
            );
          }
          return null;
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
          fontSize: 36,
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SummaryBar({ c }: { c: { id: string; label: string; score: number; weight: number; summary: string } }) {
  const fill =
    c.score >= 80 ? VBT.good :
    c.score >= 50 ? VBT.amber500 : VBT.brick500;
  const textColor =
    c.score >= 80 ? VBT.good :
    c.score >= 50 ? VBT.amber600 : VBT.brick500;
  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-baseline justify-between text-sm gap-2 min-w-0">
        <span
          className="font-semibold truncate"
          style={{
            color: VBT.ink,
            fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
          }}
          title={c.label}
        >
          {c.label}
        </span>
        <span className="tabular-nums shrink-0" style={{ color: VBT.zinc }}>
          <strong style={{ color: textColor, fontWeight: 700 }}>{c.score}</strong>/100
          <span className="ml-2 text-[10px]" style={{ color: VBT.zinc }}>poids {c.weight}</span>
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
      <div
        className="text-xs"
        style={{
          color: VBT.inkSoft,
          // Avoid overflow if the summary is long.
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >{c.summary}</div>
    </div>
  );
}
