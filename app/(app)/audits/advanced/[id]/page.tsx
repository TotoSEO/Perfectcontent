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
  AnchorLowDiversityBody,
  AnchorEmptyBody,
  PrioritySlideBody,
} from "@/components/audit/advanced/SlideContent";
import { CircularGauge } from "@/components/audit/advanced/CircularGauge";
import { DownloadIcon, PrinterIcon } from "@/components/audit/advanced/Icons";
import { VBT, VBT_TYPO } from "@/lib/audit/brand";
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
  // Separate state for PDF so the two buttons can run independently
  // (XLSX is fast, PDF can take 30-60 s for a 49-slide deck).
  const [exportingPdf, setExportingPdf] = useState(false);
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
        // Legacy audits saved before the diagnostics field was added —
        // give the exporter a safe default so the Exclusions sheet
        // still renders with zeros instead of crashing.
        diagnostics: audit.summary.diagnostics || {
          pagination_excluded_count: 0,
          html_pages_count: audit.summary.html_count || 0,
          indexable_html_count: 0,
          contextual_links_count: 0,
          editorial_links_count: 0,
          empty_editorial_anchor_count: 0,
        },
      };
      const { exportAdvancedToXlsx } = await import("@/lib/audit/advanced/export");
      await exportAdvancedToXlsx(fullReport, audit.name);
    } catch (e) {
      setExportErr(String(e));
    } finally {
      setExporting(false);
    }
  }

  async function exportPdf() {
    if (!audit) return;
    setExportingPdf(true);
    setExportErr(null);
    try {
      const { exportDeckToPdf } = await import("@/lib/audit/advanced/export-pdf");
      // The browser print dialog handles the rest. The user picks
      // "Save as PDF" from the destination dropdown.
      await exportDeckToPdf(audit.name, "[data-deck-root]");
    } catch (e) {
      setExportErr(`Échec export PDF : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExportingPdf(false);
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
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={exportPdf}
            disabled={exportingPdf}
            className="btn-primary text-sm inline-flex items-center gap-2"
            title="Ouvre la boîte de dialogue d'impression. Choisissez « Enregistrer au format PDF » comme destination pour télécharger le fichier."
          >
            <PrinterIcon size={15} color="currentColor" />
            {exportingPdf ? "Ouverture du dialogue…" : "Exporter en PDF"}
          </button>
          <button
            onClick={exportXlsx}
            disabled={exporting || !audit.issues}
            className="btn-secondary text-sm inline-flex items-center gap-2"
            title="Exporte le fichier .xlsx complet avec un onglet par sous-catégorie de problème et un onglet de priorisation."
          >
            <DownloadIcon size={15} color="currentColor" />
            {exporting ? "Export en cours…" : "Exporter le fichier XLSX"}
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

      {/* data-deck-root is the anchor the PDF exporter walks to find every
          slide. Each direct child below wraps a slide and carries
          data-pdf-slide, so the exporter snapshots each in DOM order. */}
      <div className="space-y-6" data-deck-root>
        {slides.map((s, i) => {
          if (s.kind === "cover") {
            // Use the live counts so the cover stays in sync with the
            // actual deck (4.4) : the slide count is the number of
            // slides currently rendered, and the issues count comes
            // from the audit's stored issues table.
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                variant="cover"
                footer={audit.source_filename ? `Source : ${audit.source_filename}` : "Audit technique avancé SEO"}
              >
                <div className="flex-1 grid grid-cols-12 gap-10 min-h-0 items-center">
                  <div className="col-span-7 min-w-0 space-y-7">
                    <div
                      className="uppercase"
                      style={{
                        color: VBT.terracotta600,
                        fontWeight: 700,
                        fontSize: VBT_TYPO.caption,
                        letterSpacing: "0.32em",
                      }}
                    >
                      Audit technique SEO · Édition avancée
                    </div>
                    <h1
                      className="leading-[1.02]"
                      style={{
                        fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
                        fontWeight: 800,
                        fontSize: 64,
                        letterSpacing: "-0.03em",
                        color: VBT.ink,
                        wordBreak: "break-word",
                      }}
                    >
                      {audit.name}
                    </h1>
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: 140,
                        background: `linear-gradient(90deg, ${VBT.terracotta600}, ${VBT.amber400})`,
                      }}
                    />
                    <div
                      style={{
                        color: VBT.inkSoft,
                        fontWeight: 500,
                        fontSize: VBT_TYPO.body + 1,
                      }}
                    >
                      Préparé le {generatedDate}
                      {audit.summary?.domain && (
                        <span style={{ color: VBT.terracotta600, fontWeight: 600 }}>
                          {" · "}
                          {(() => { try { return new URL(audit.summary.domain).hostname; } catch { return audit.summary.domain; } })()}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-6 pt-3">
                      <BigStat label="URLs analysées" value={s.url_count.toLocaleString("fr-FR")} />
                      <BigStat label="Catégories" value={s.sections_count} />
                      <BigStat label="Problèmes" value={totalIssues.toLocaleString("fr-FR")} />
                      <BigStat label="Slides" value={total} />
                    </div>
                  </div>
                  {/* Right column : hero circular gauge (4.12) */}
                  <div className="col-span-5 flex items-center justify-center min-w-0">
                    <CircularGauge score={audit.summary!.global_score} size={340} thickness={20} />
                  </div>
                </div>
              </AdvSlide>
            );
          }
          if (s.kind === "summary") {
            const pillTone: "ok" | "warn" | "bad" =
              s.global_score >= 80 ? "ok" :
              s.global_score >= 50 ? "warn" : "bad";
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                title="Synthèse — score par catégorie"
                rightHeader={
                  <SectionPill tone={pillTone}>
                    Score global {s.global_score}/100
                  </SectionPill>
                }
                footer={`${audit.url_count.toLocaleString("fr-FR")} URLs · ${totalIssues.toLocaleString("fr-FR")} problèmes`}
              >
                <div className="flex-1 grid grid-cols-2 gap-x-12 gap-y-5 content-center pb-2 min-h-0">
                  {s.sections.map((c) => (
                    <SummaryBar key={c.id} c={c} />
                  ))}
                </div>
              </AdvSlide>
            );
          }
          if (s.kind === "section-cover") {
            const sectionIndex = audit.summary!.sections.findIndex((x) => x.id === s.section_id);
            const part = `Partie ${sectionIndex + 1} sur ${audit.summary!.sections.length}`;
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                variant="section-cover"
                footer="Couverture de partie"
              >
                {/* The "Partie X sur N" line appears once on the section
                    cover (4.3) — the body renders it inside the eyebrow
                    lockup, the footer carries only the generic label. */}
                <SectionCoverBody slide={s} partOf={part} />
              </AdvSlide>
            );
          }
          if (s.kind === "data") {
            const sec = audit.summary!.sections.find((x) => x.id === s.section_id);
            const tone =
              s.issues_count === 0 ? "ok" :
              s.issues_count > 500 ? "bad" :
              "warn";
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                title={s.title}
                subtitle={sec?.label}
                rightHeader={
                  s.issues_count > 0
                    ? <SectionPill tone={tone}>{s.issues_count.toLocaleString("fr-FR")} problème{s.issues_count > 1 ? "s" : ""}</SectionPill>
                    : <SectionPill tone="ok">Aucun problème</SectionPill>
                }
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
          if (s.kind === "anchor-low-diversity") {
            const sec = audit.summary!.sections.find((x) => x.id === s.section_id);
            const tone: "ok" | "warn" | "bad" =
              s.total_concerned === 0 ? "ok" :
              s.total_concerned > 50 ? "bad" : "warn";
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                title={s.title}
                subtitle={sec?.label}
                rightHeader={
                  s.total_concerned > 0
                    ? <SectionPill tone={tone}>{s.total_concerned.toLocaleString("fr-FR")} URLs concernées</SectionPill>
                    : <SectionPill tone="ok">Diversité OK</SectionPill>
                }
                footer={sec?.label}
              >
                <AnchorLowDiversityBody slide={s} />
              </AdvSlide>
            );
          }
          if (s.kind === "anchor-empty") {
            const sec = audit.summary!.sections.find((x) => x.id === s.section_id);
            const tone: "ok" | "warn" | "bad" =
              s.total_empty_links === 0 ? "ok" :
              s.total_empty_links > 100 ? "bad" : "warn";
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                title={s.title}
                subtitle={sec?.label}
                rightHeader={
                  s.total_empty_links > 0
                    ? <SectionPill tone={tone}>{s.total_empty_links.toLocaleString("fr-FR")} liens vides</SectionPill>
                    : <SectionPill tone="ok">Aucune ancre vide</SectionPill>
                }
                footer={sec?.label}
              >
                <AnchorEmptyBody slide={s} />
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
    <div className="min-w-0">
      <div
        className="uppercase truncate"
        style={{
          color: VBT.zinc,
          fontWeight: 700,
          fontSize: VBT_TYPO.micro,
          letterSpacing: "0.2em",
        }}
        title={label}
      >
        {label}
      </div>
      <div
        className="tabular-nums mt-2"
        style={{
          color: VBT.terracotta700,
          fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
          fontSize: 44,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SummaryBar({ c }: { c: { id: string; label: string; score: number; weight: number; summary: string } }) {
  // Semantic palette (4.6) for at-a-glance status reading on the synthesis slide.
  const fill =
    c.score >= 80 ? VBT.sigGreen :
    c.score >= 50 ? VBT.sigOrange : VBT.sigRed;
  return (
    <div className="space-y-2 min-w-0">
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span
          className="font-semibold truncate"
          style={{
            color: VBT.ink,
            fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
            fontSize: VBT_TYPO.body,
            letterSpacing: "-0.01em",
          }}
          title={c.label}
        >
          {c.label}
        </span>
        <span className="tabular-nums shrink-0" style={{ color: VBT.zinc, fontSize: VBT_TYPO.bodySm }}>
          <strong style={{ color: fill, fontWeight: 800, fontSize: VBT_TYPO.body + 2 }}>{c.score}</strong>
          <span className="ml-0.5" style={{ color: VBT.zinc }}>/100</span>
          <span className="ml-3 uppercase" style={{ color: VBT.zinc, fontSize: VBT_TYPO.micro, letterSpacing: "0.14em", fontWeight: 600 }}>
            poids {c.weight}
          </span>
        </span>
      </div>
      <div className="h-3 rounded-full overflow-hidden" style={{ background: VBT.paperEdge }}>
        <div
          className="h-full"
          style={{
            width: `${c.score}%`,
            background: `linear-gradient(90deg, ${fill}DD, ${fill})`,
          }}
        />
      </div>
      <div
        style={{
          color: VBT.inkSoft,
          fontSize: VBT_TYPO.bodySm,
          lineHeight: 1.5,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {c.summary}
      </div>
    </div>
  );
}
