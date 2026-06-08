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
  SynthesisRadarBody,
  RobotsCurrentBody,
  RobotsImprovedBody,
  SitemapOverviewBody,
  SitemapGapsBody,
  SitemapSfBody,
  PageSpeedBody,
  CustomSlideBody,
} from "@/components/audit/advanced/SlideContent";
import { CircularGauge } from "@/components/audit/advanced/CircularGauge";
import { DownloadIcon, PrinterIcon } from "@/components/audit/advanced/Icons";
import { VBT, VBT_TYPO, VBT_FONT, hardShadow } from "@/lib/audit/brand";
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
  const { data: audit, error: loadErr, mutate } = useSWR<AuditOut>(
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
  // Per-slide AI state for the new synthesis / robots / sitemap slides.
  // Each is lazy: the user clicks "Générer" on the slide, the call goes
  // out, and the slide swaps from skeleton to filled in place.
  const [synthBusy, setSynthBusy] = useState(false);
  const [synthAi, setSynthAi] = useState<{ intro: string; best: string[]; worst: string[] } | null>(null);
  const [synthErr, setSynthErr] = useState<string | null>(null);
  const [robotsBusy, setRobotsBusy] = useState(false);
  const [robotsAi, setRobotsAi] = useState<{
    is_good: boolean;
    current_analysis: string;
    issues: string[];
    improved_content: string | null;
    improvements: string[];
  } | null>(null);
  const [robotsErr, setRobotsErr] = useState<string | null>(null);
  const [sitemapBusy, setSitemapBusy] = useState(false);
  const [sitemapAi, setSitemapAi] = useState<{
    fetched: boolean;
    sitemap_url_count: number;
    indexable_count: number;
    missing_count: number;
    overview: string;
    gaps_summary: string | null;
    gap_breakdown: { label: string; count: number }[];
    last_modified: string | null;
    error: string | null;
  } | null>(null);
  const [sitemapErr, setSitemapErr] = useState<string | null>(null);
  const [sitemapSfBusy, setSitemapSfBusy] = useState(false);
  const [sitemapSfAi, setSitemapSfAi] = useState<{ overview: string; recommendation: string } | null>(null);
  const [sitemapSfErr, setSitemapSfErr] = useState<string | null>(null);

  // ── In-app slide editor ────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  // When non-null, this is the working copy of the raw stored slides that
  // the editor mutates. The display `slides` derives from it.
  const [editedSlides, setEditedSlides] = useState<AdvSlideType[] | null>(null);
  const [savingEdits, setSavingEdits] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

  const isAdvanced = audit?.summary?.audit_type === "advanced";

  // The raw slide list the display layer reads from : the editor's working
  // copy when editing, otherwise the stored slides.
  const baseSlides = useMemo<AdvSlideType[]>(
    () => editedSlides ?? (audit?.summary?.slides as AdvSlideType[] | undefined) ?? [],
    [editedSlides, audit],
  );

  // Pre-process slides: stitch the audit name into the cover, the AI
  // narrative into the priority slide, and the on-demand AI fields into
  // each of the synthesis / robots / sitemap slides.
  const slides = useMemo<AdvSlideType[]>(() => {
    if (!baseSlides.length) return [];
    const out: AdvSlideType[] = [];
    for (const s of baseSlides) {
      if (s.kind === "cover") {
        out.push({ ...s, audit_name: audit?.name ?? s.audit_name });
        continue;
      }
      if (s.kind === "priority") {
        out.push({ ...s, ai_summary: aiSummary ?? s.ai_summary, ai_summary_error: aiErr });
        continue;
      }
      if (s.kind === "synthesis-radar") {
        out.push({
          ...s,
          ai_intro: synthAi?.intro ?? s.ai_intro,
          ai_best: synthAi?.best ?? s.ai_best,
          ai_worst: synthAi?.worst ?? s.ai_worst,
          ai_intro_error: synthErr,
        });
        continue;
      }
      if (s.kind === "robots-current") {
        out.push({
          ...s,
          ai_overview: robotsAi?.current_analysis ?? s.ai_overview,
          ai_issues: robotsAi?.issues ?? s.ai_issues,
          ai_is_good: robotsAi?.is_good ?? s.ai_is_good,
          ai_error: robotsErr,
        });
        continue;
      }
      if (s.kind === "robots-improved") {
        // Drop this slide if the AI marks the file as already good.
        if (robotsAi?.is_good) continue;
        out.push({
          ...s,
          improved_content: robotsAi?.improved_content ?? s.improved_content,
          ai_improvements: robotsAi?.improvements ?? s.ai_improvements,
        });
        continue;
      }
      if (s.kind === "sitemap-overview") {
        out.push({
          ...s,
          ai_overview: sitemapAi?.overview ?? s.ai_overview,
          url_count: sitemapAi?.sitemap_url_count ?? s.url_count,
          indexable_count: sitemapAi?.indexable_count ?? s.indexable_count,
          missing_count: sitemapAi?.missing_count ?? s.missing_count,
          last_modified: sitemapAi?.last_modified ?? s.last_modified,
          ai_error: sitemapErr || sitemapAi?.error || null,
        });
        continue;
      }
      if (s.kind === "sitemap-gaps") {
        // Drop the gaps slide if nothing is missing.
        if ((sitemapAi?.missing_count ?? s.missing_count) === 0) continue;
        out.push({
          ...s,
          missing_count: sitemapAi?.missing_count ?? s.missing_count,
          ai_gaps_summary: sitemapAi?.gaps_summary ?? s.ai_gaps_summary,
          breakdown: sitemapAi?.gap_breakdown ?? s.breakdown,
        });
        continue;
      }
      if (s.kind === "sitemap-sf") {
        out.push({
          ...s,
          ai_overview: sitemapSfAi?.overview ?? s.ai_overview,
          ai_recommendation: sitemapSfAi?.recommendation ?? s.ai_recommendation,
          ai_error: sitemapSfErr,
        });
        continue;
      }
      out.push(s);
    }
    return out;
  }, [baseSlides, audit, aiSummary, aiErr, synthAi, synthErr, robotsAi, robotsErr, sitemapAi, sitemapErr, sitemapSfAi, sitemapSfErr]);
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

  async function generateSynthesis() {
    if (!audit?.summary) return;
    setSynthBusy(true);
    setSynthErr(null);
    try {
      const res = await api<{ intro: string; best: string[]; worst: string[] }>("/srv/audits/synthesis-overview", {
        method: "POST",
        json: {
          audit_name: audit.name,
          domain: audit.summary.domain,
          global_score: Number(audit.score || 0),
          sections: audit.summary.sections.map((s) => ({ label: s.label, score: s.score, weight: s.weight })),
        },
        timeoutMs: 45_000,
      });
      setSynthAi({ intro: res.intro, best: res.best, worst: res.worst });
    } catch (e) {
      setSynthErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSynthBusy(false);
    }
  }

  async function generateRobotsAnalysis() {
    if (!audit?.summary?.robots_txt_pasted) return;
    setRobotsBusy(true);
    setRobotsErr(null);
    try {
      const res = await api<{
        is_good: boolean;
        current_analysis: string;
        issues: string[];
        improved_content: string | null;
        improvements: string[];
      }>("/srv/audits/robots-analysis", {
        method: "POST",
        json: {
          domain: audit.summary.domain,
          content: audit.summary.robots_txt_pasted,
        },
        timeoutMs: 90_000,
      });
      setRobotsAi(res);
    } catch (e) {
      setRobotsErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRobotsBusy(false);
    }
  }

  async function generateSitemapAnalysis() {
    if (!audit?.summary?.sitemap_url) return;
    setSitemapBusy(true);
    setSitemapErr(null);
    try {
      // Pull the indexable URLs from the saved issues table (perimeter
      // comparison). They're not in the summary so we read the audit's
      // /issues partition lazily here.
      // For simplicity, we send no URLs and rely on the backend's path
      // grouping when missing > 0. (Full URL list would balloon the
      // payload past Vercel's 4.5MB limit.) Instead, we send the count
      // and a sampled set of indexables when available.
      const indexable = collectIndexableUrls(audit);
      const res = await api<{
        fetched: boolean;
        sitemap_url_count: number;
        indexable_count: number;
        missing_count: number;
        overview: string;
        gaps_summary: string | null;
        gap_breakdown: { label: string; count: number }[];
        last_modified: string | null;
        error: string | null;
      }>("/srv/audits/sitemap-analysis", {
        method: "POST",
        json: {
          domain: audit.summary.domain,
          sitemap_url: audit.summary.sitemap_url,
          indexable_urls: indexable,
        },
        timeoutMs: 90_000,
      });
      setSitemapAi(res);
    } catch (e) {
      setSitemapErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSitemapBusy(false);
    }
  }

  async function generateSitemapSfAnalysis() {
    if (!audit?.summary) return;
    const sfSlide = (audit.summary.slides as AdvSlideType[]).find((s) => s.kind === "sitemap-sf") as
      | Extract<AdvSlideType, { kind: "sitemap-sf" }>
      | undefined;
    if (!sfSlide) return;
    setSitemapSfBusy(true);
    setSitemapSfErr(null);
    try {
      const res = await api<{ overview: string; recommendation: string }>("/srv/audits/sitemap-sf-analysis", {
        method: "POST",
        json: {
          domain: audit.summary.domain,
          content_url_count: sfSlide.content_url_count,
          indexable_count: sfSlide.indexable_count,
          non_indexable_count: sfSlide.non_indexable_count,
          non_200_count: sfSlide.non_200_count,
          sitemap_file_count: sfSlide.sitemap_file_count,
          breakdown: sfSlide.breakdown,
        },
        timeoutMs: 60_000,
      });
      setSitemapSfAi({ overview: res.overview, recommendation: res.recommendation });
    } catch (e) {
      setSitemapSfErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSitemapSfBusy(false);
    }
  }

  async function exportXlsx() {
    if (!audit?.issues || !audit.summary) return;
    setExporting(true);
    setExportErr(null);
    try {
      const { exportAdvancedToXlsx } = await import("@/lib/audit/advanced/export");
      await exportAdvancedToXlsx(buildFullReport(), audit.name);
    } catch (e) {
      setExportErr(String(e));
    } finally {
      setExporting(false);
    }
  }

  // Rebuild the full AdvReport (with hydrated issue rows) for the exporters.
  // Both XLSX and Markdown exporters consume this shape.
  function buildFullReport(): AdvReport {
    const fullSections = audit!.summary!.sections.map((s) => ({
      ...s,
      subcategories: s.subcategories.map((sub) => ({
        ...sub,
        issues_full: audit!.issues!.categories[sub.id] || [],
      })),
    }));
    return {
      ...audit!.summary!,
      sections: fullSections,
      // Use the live (possibly edited) slides : capture user text edits +
      // anchor exclusions in the export.
      slides: slides,
      diagnostics: audit!.summary!.diagnostics || {
        pagination_excluded_count: 0,
        html_pages_count: audit!.summary!.html_count || 0,
        indexable_html_count: 0,
        contextual_links_count: 0,
        editorial_links_count: 0,
        empty_editorial_anchor_count: 0,
      },
    };
  }

  const [exportingMd, setExportingMd] = useState(false);
  async function exportMarkdown() {
    if (!audit?.issues || !audit.summary) return;
    setExportingMd(true);
    setExportErr(null);
    try {
      const { exportAdvancedToMarkdown } = await import("@/lib/audit/advanced/export-md");
      await exportAdvancedToMarkdown(buildFullReport(), audit.name);
    } catch (e) {
      setExportErr(`Échec export Markdown : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExportingMd(false);
    }
  }

  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);

  async function exportPdf() {
    if (!audit) return;
    setExportingPdf(true);
    setExportErr(null);
    setPdfProgress(null);
    try {
      const { exportDeckToPdf } = await import("@/lib/audit/advanced/export-pdf");
      // Programmatic, full-bleed PDF : one slide = one 1600x900 page.
      // No print dialog, no margins, downloads directly.
      await exportDeckToPdf(audit.name, "[data-deck-root]", (current, total) => {
        setPdfProgress({ current, total });
      });
    } catch (e) {
      setExportErr(`Échec export PDF : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExportingPdf(false);
      setPdfProgress(null);
    }
  }

  async function deleteAudit() {
    if (!confirm("Supprimer cet audit ?")) return;
    await api(`/srv/audits/${id}`, { method: "DELETE" });
    router.push("/audits/advanced");
  }

  // ── Editor operations (mutate the working copy `editedSlides`) ──────────
  function enterEdit() {
    // Deep-clone the *displayed* slides so any AI text already generated is
    // captured into the editable copy ; reset the cover name to "" so it
    // doesn't get baked in (it's re-stitched from audit.name at display).
    const clone: AdvSlideType[] = JSON.parse(JSON.stringify(slides));
    for (const s of clone) {
      if (s.kind === "cover") s.audit_name = "";
    }
    setEditedSlides(clone);
    setEditMode(true);
    setEditErr(null);
  }
  function cancelEdit() {
    setEditedSlides(null);
    setEditMode(false);
    setEditErr(null);
  }
  function updateSlideField(index: number, key: string, value: string) {
    setEditedSlides((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index], [key]: value } as AdvSlideType;
      return next;
    });
  }
  function deleteSlide(index: number) {
    setEditedSlides((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }
  function moveSlide(index: number, dir: -1 | 1) {
    setEditedSlides((prev) => {
      if (!prev) return prev;
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }
  function addCustomAfter(index: number) {
    setEditedSlides((prev) => {
      if (!prev) return prev;
      const slide: AdvSlideType = {
        kind: "custom",
        title: "Nouvelle slide",
        body: "Saisis ton texte ici.\n\nUtilise une ligne vide pour séparer les paragraphes, ou commence chaque ligne par « - » pour une liste à puces.",
        eyebrow: "Note",
      };
      const next = [...prev];
      next.splice(index + 1, 0, slide);
      return next;
    });
  }

  // Toggle a destination URL in the anchor-low-diversity slide's exclusion
  // list. Excluded URLs are skipped in the visible top-4 ; the next-worst
  // URL takes their place. Persisted on "Enregistrer les modifications".
  function toggleAnchorExclusion(index: number, destination: string) {
    if (!editMode) {
      // First click in non-edit mode : enter edit mode so the user sees
      // the exclusion footer + can save. We seed editedSlides from the
      // current slides (same logic as the manual "Modifier" button).
      const clone: AdvSlideType[] = JSON.parse(JSON.stringify(slides));
      for (const s of clone) {
        if (s.kind === "cover") s.audit_name = "";
      }
      setEditedSlides(clone);
      setEditMode(true);
    }
    setEditedSlides((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const s = next[index];
      if (s?.kind !== "anchor-low-diversity") return prev;
      const current = new Set(s.excluded_destinations || []);
      if (current.has(destination)) current.delete(destination);
      else current.add(destination);
      next[index] = { ...s, excluded_destinations: [...current] };
      return next;
    });
  }

  async function saveEdits() {
    if (!audit?.summary || !editedSlides) return;
    setSavingEdits(true);
    setEditErr(null);
    try {
      const newSummary = { ...audit.summary, slides: editedSlides };
      await api(`/srv/audits/${id}`, {
        method: "PATCH",
        json: { summary: newSummary },
        timeoutMs: 60_000,
      });
      // Reflect locally + revalidate the SWR cache.
      await mutate({ ...audit, summary: newSummary }, { revalidate: true });
      setEditMode(false);
      setEditedSlides(null);
    } catch (e) {
      setEditErr(`Échec de l'enregistrement : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingEdits(false);
    }
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
          Cet audit a été créé en mode "classique" : il est visible sur la page <a href={`/audits/${audit.id}`} className="underline">audit technique</a>.
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
          {editMode ? (
            <>
              <button
                onClick={saveEdits}
                disabled={savingEdits}
                className="btn-primary text-sm"
              >
                {savingEdits ? "Enregistrement…" : "✓ Enregistrer les modifications"}
              </button>
              <button onClick={cancelEdit} disabled={savingEdits} className="btn-secondary text-sm">
                Annuler
              </button>
            </>
          ) : (
            <>
              <button
                onClick={enterEdit}
                className="btn-secondary text-sm inline-flex items-center gap-2"
                title="Modifier les textes, ajouter, supprimer ou réordonner des slides."
              >
                ✎ Modifier
              </button>
              <button
                onClick={exportPdf}
                disabled={exportingPdf}
                className="btn-primary text-sm inline-flex items-center gap-2"
                title="Génère et télécharge un PDF plein écran (une slide par page). Aucune boîte de dialogue."
              >
                <PrinterIcon size={15} color="currentColor" />
                {exportingPdf
                  ? pdfProgress
                    ? `Génération ${pdfProgress.current}/${pdfProgress.total}…`
                    : "Préparation…"
                  : "Exporter en PDF"}
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
              <button
                onClick={exportMarkdown}
                disabled={exportingMd || !audit.issues}
                className="btn-secondary text-sm inline-flex items-center gap-2"
                title="Exporte un .md complet (scores, slides, échantillons d'issues, priorités). Destiné à être relu par une IA pour un contrôle d'incohérences."
              >
                <DownloadIcon size={15} color="currentColor" />
                {exportingMd ? "Export en cours…" : "Exporter en Markdown (IA)"}
              </button>
              <button onClick={deleteAudit} className="btn-ghost text-xs">Supprimer</button>
            </>
          )}
        </div>
      </header>

      {exportErr && (
        <div className="card border-red-700/50 bg-red-900/20 text-red-100 p-3 text-sm">
          Échec export : {exportErr}
        </div>
      )}
      {editErr && (
        <div className="card border-red-700/50 bg-red-900/20 text-red-100 p-3 text-sm">
          {editErr}
        </div>
      )}

      {editMode ? (
        <div className="card border-accent-600/40 bg-accent-600/10 text-accent-100 p-3 text-sm flex items-center gap-2">
          ✎ Mode édition : modifie les textes sous chaque slide, réordonne avec ↑↓, supprime, ou ajoute une slide de texte. La prévisualisation se met à jour en direct. N&apos;oublie pas d&apos;enregistrer.
        </div>
      ) : (
        <p className="text-xs text-zinc-500">
          💡 Chaque slide est en 16:9 : capture-la et colle-la directement dans tes Google Slides client.
        </p>
      )}

      {/* data-deck-root is the anchor the PDF exporter walks to find every
          slide. Each direct child below wraps a slide and carries
          data-pdf-slide, so the exporter snapshots each in DOM order. */}
      <div className="space-y-6" data-deck-root>
        {slides.map((s, i) => {
          const slideNode = (() => {
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
                footer="Audit technique avancé SEO"
              >
                <div className="flex-1 grid grid-cols-12 gap-10 min-h-0 items-center">
                  <div className="col-span-7 min-w-0 space-y-6">
                    {/* Brand lockup : logo + kicker. Logo file lives at
                        /visibilitea/logo.png (copied from the design system
                        ZIP : transparent PNG, terracotta + amber leaves). */}
                    <div className="flex items-center gap-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/visibilitea/logo.png"
                        alt="Visibili'tea"
                        style={{ height: 56, width: "auto", objectFit: "contain" }}
                      />
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          style={{ width: 22, height: 2, background: VBT.terracotta500, borderRadius: 2 }}
                        />
                        <span
                          className="uppercase"
                          style={{
                            color: VBT.terracotta600,
                            fontWeight: 600,
                            fontSize: VBT_TYPO.caption,
                            letterSpacing: "0.24em",
                            fontFamily: VBT_FONT.mono,
                          }}
                        >
                          Audit technique SEO
                        </span>
                      </div>
                    </div>
                    <h1
                      className="leading-[1.0]"
                      style={{
                        fontFamily: VBT_FONT.display,
                        fontWeight: 800,
                        fontSize: 60,
                        letterSpacing: "-0.02em",
                        color: VBT.ink,
                        wordBreak: "break-word",
                        // 2-line cap so a long client name (3+ lines) never
                        // pushes the BigStat row out of the slide box.
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                      title={audit.name}
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
                        fontFamily: VBT_FONT.body,
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
                    <div className="grid grid-cols-2 gap-5 pt-3" style={{ maxWidth: 460 }}>
                      <BigStat label="URLs analysées" value={s.url_count.toLocaleString("fr-FR")} />
                      <BigStat label="Catégories de problèmes" value={s.sections_count} />
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
            // Legacy slide (older audits). Newer audits emit synthesis-radar.
            const pillTone: "ok" | "warn" | "bad" =
              s.global_score >= 80 ? "ok" :
              s.global_score >= 50 ? "warn" : "bad";
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                title="Synthèse : score par catégorie"
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
          if (s.kind === "synthesis-radar") {
            const pillTone: "ok" | "warn" | "bad" =
              s.global_score >= 80 ? "ok" :
              s.global_score >= 50 ? "warn" : "bad";
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                title="Synthèse de l&rsquo;audit"
                rightHeader={
                  <SectionPill tone={pillTone}>
                    Score global {s.global_score}/100
                  </SectionPill>
                }
                footer={`${audit.url_count.toLocaleString("fr-FR")} URLs · ${totalIssues.toLocaleString("fr-FR")} problèmes`}
              >
                <SynthesisRadarBody slide={s} onRequestAi={generateSynthesis} busy={synthBusy} />
              </AdvSlide>
            );
          }
          if (s.kind === "robots-current") {
            const tone: "ok" | "warn" | "bad" = s.ai_is_good ? "ok" : "warn";
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                title="Robots.txt"
                subtitle="Indexabilité & crawl"
                rightHeader={
                  <SectionPill tone={tone}>
                    {s.ai_is_good ? "Fichier propre" : "À nettoyer"}
                  </SectionPill>
                }
                footer="Indexabilité & crawl"
              >
                <RobotsCurrentBody slide={s} onRequestAi={generateRobotsAnalysis} busy={robotsBusy} />
              </AdvSlide>
            );
          }
          if (s.kind === "robots-improved") {
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                title="Robots.txt recommandé"
                subtitle="Indexabilité & crawl"
                rightHeader={<SectionPill tone="ok">Reco IA</SectionPill>}
                footer="Indexabilité & crawl"
              >
                <RobotsImprovedBody slide={s} />
              </AdvSlide>
            );
          }
          if (s.kind === "sitemap-overview") {
            const tone: "ok" | "warn" | "bad" =
              s.missing_count === 0 ? "ok" :
              s.missing_count > 200 ? "bad" : "warn";
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                title="Sitemap.xml"
                subtitle="Indexabilité & crawl"
                rightHeader={
                  <SectionPill tone={tone}>
                    {s.url_count > 0 ? `${s.url_count.toLocaleString("fr-FR")} URLs` : "À analyser"}
                  </SectionPill>
                }
                footer="Indexabilité & crawl"
              >
                <SitemapOverviewBody slide={s} onRequestAi={generateSitemapAnalysis} busy={sitemapBusy} />
              </AdvSlide>
            );
          }
          if (s.kind === "sitemap-gaps") {
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                title="Sitemap.xml : pages absentes"
                subtitle="Indexabilité & crawl"
                rightHeader={
                  <SectionPill tone="bad">
                    {s.missing_count.toLocaleString("fr-FR")} URLs
                  </SectionPill>
                }
                footer="Indexabilité & crawl"
              >
                <SitemapGapsBody slide={s} />
              </AdvSlide>
            );
          }
          if (s.kind === "sitemap-sf") {
            const tone: "ok" | "warn" | "bad" =
              s.issues_count === 0 ? "ok" :
              s.issues_count > 200 ? "bad" : "warn";
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                title="Sitemap.xml"
                subtitle="Indexabilité & crawl"
                rightHeader={
                  <SectionPill tone={tone}>
                    {s.issues_count > 0
                      ? `${s.issues_count.toLocaleString("fr-FR")} URLs à corriger`
                      : "Sitemap propre"}
                  </SectionPill>
                }
                footer="Indexabilité & crawl"
              >
                <SitemapSfBody slide={s} onRequestAi={generateSitemapSfAnalysis} busy={sitemapSfBusy} />
              </AdvSlide>
            );
          }
          if (s.kind === "pagespeed") {
            const tone: "ok" | "warn" | "bad" =
              s.performance_score == null ? "warn" :
              s.performance_score >= 90 ? "ok" :
              s.performance_score >= 50 ? "warn" : "bad";
            let host = s.url;
            try { host = new URL(s.url).hostname + new URL(s.url).pathname; } catch { /* keep raw */ }
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                title="PageSpeed Insights"
                subtitle={host}
                rightHeader={
                  s.performance_score != null
                    ? <SectionPill tone={tone}>Performance {s.performance_score}/100</SectionPill>
                    : <SectionPill tone="warn">Non disponible</SectionPill>
                }
                footer="Performance"
              >
                <PageSpeedBody slide={s} />
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
                    cover (4.3) : the body renders it inside the eyebrow
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
                <AnchorLowDiversityBody
                  slide={s}
                  editMode={editMode}
                  onExclude={(dest) => toggleAnchorExclusion(i, dest)}
                />
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
                subtitle={`${sec?.label} : Recommandations`}
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
          if (s.kind === "custom") {
            return (
              <AdvSlide
                key={i}
                index={i}
                total={total}
                title={s.title || "Slide"}
                subtitle={s.eyebrow || "Note"}
                footer="Note"
              >
                <CustomSlideBody slide={s} />
              </AdvSlide>
            );
          }
          return null;
          })();
          if (!slideNode) return null;
          return (
            <div key={i}>
              {slideNode}
              {editMode && (
                <SlideEditorCard
                  slide={s}
                  index={i}
                  total={total}
                  onField={updateSlideField}
                  onDelete={deleteSlide}
                  onMove={moveSlide}
                  onAddAfter={addCustomAfter}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Pull indexable URLs from the saved issues table. We use the canonical
// subcategory (which records the "Sans canonical" + "Cross-canonical"
// signals on the HTML perimeter) as a proxy for "every HTML page we know
// about". Capped to 5 000 to keep the sitemap-analysis payload tractable.
function collectIndexableUrls(audit: AuditOut): string[] {
  const out = new Set<string>();
  if (!audit?.issues?.categories) return [];
  // Any category that contains URLs we crawled qualifies — we just need
  // a snapshot of the crawl. We pull from a few high-coverage categories.
  const sources = [
    "canonical",
    "depth",
    "title_length",      // new split sheet (was "titles_meta_basic")
    "metadesc_length",
    "titles_meta_basic", // kept for older audits
    "internal_linking_overview",
    "orphan_pages",
  ];
  for (const k of sources) {
    const rows = audit.issues.categories[k] || [];
    for (const r of rows) {
      const u = r?.url;
      if (typeof u === "string" && u.startsWith("http")) out.add(u);
      if (out.size >= 5000) return Array.from(out);
    }
  }
  return Array.from(out);
}

function BigStat({ label, value }: { label: string; value: string | number }) {
  // Sticker stat card : ink border + hard shadow (DS look).
  return (
    <div
      className="min-w-0"
      style={{
        background: VBT.paper,
        border: `1.5px solid ${VBT.ink}`,
        borderRadius: 14,
        boxShadow: hardShadow(3),
        padding: "12px 14px",
      }}
    >
      <div
        className="tabular-nums"
        style={{
          color: VBT.terracotta600,
          fontFamily: VBT_FONT.display,
          fontSize: 40,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        className="uppercase mt-1.5"
        style={{
          color: VBT.ink2,
          fontWeight: 700,
          fontSize: VBT_TYPO.micro,
          letterSpacing: "0.1em",
          lineHeight: 1.25,
          fontFamily: VBT_FONT.title,
        }}
        title={label}
      >
        {label}
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
            fontFamily: VBT_FONT.title,
            fontSize: VBT_TYPO.body,
            letterSpacing: "-0.01em",
          }}
          title={c.label}
        >
          {c.label}
        </span>
        <span className="tabular-nums shrink-0" style={{ color: VBT.zinc, fontSize: VBT_TYPO.bodySm }}>
          <strong style={{ color: fill, fontWeight: 800, fontSize: VBT_TYPO.subhead, fontFamily: VBT_FONT.display }}>{c.score}</strong>
          <span className="ml-0.5" style={{ color: VBT.zinc, fontFamily: VBT_FONT.mono, fontSize: VBT_TYPO.caption }}>/100</span>
          <span className="ml-3 uppercase" style={{ color: VBT.zinc, fontSize: VBT_TYPO.micro, letterSpacing: "0.12em", fontWeight: 600, fontFamily: VBT_FONT.mono }}>
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

// ── In-app slide editor ───────────────────────────────────────────────────

type EditField = { key: string; label: string; value: string; multiline: boolean };

// Returns the editable plain-text fields for a given slide kind. We only
// expose free-text the consultant would want to tweak ; structural data
// (KPIs, tables, charts) stays derived from the crawl.
function editableFields(slide: AdvSlideType): EditField[] {
  const f: EditField[] = [];
  const s = slide as unknown as Record<string, unknown>;
  const str = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : "");
  switch (slide.kind) {
    case "custom":
      f.push({ key: "eyebrow", label: "Sur-titre", value: str("eyebrow"), multiline: false });
      f.push({ key: "title", label: "Titre", value: str("title"), multiline: false });
      f.push({ key: "body", label: "Texte (ligne vide = nouveau paragraphe, « - » = puce)", value: str("body"), multiline: true });
      break;
    case "data":
    case "info":
    case "anchor-low-diversity":
    case "anchor-empty":
      f.push({ key: "title", label: "Titre", value: str("title"), multiline: false });
      f.push({ key: "description", label: "Description", value: str("description"), multiline: true });
      if ("takeaway" in s) f.push({ key: "takeaway", label: "À retenir", value: str("takeaway"), multiline: true });
      break;
    case "synthesis-radar":
      f.push({ key: "ai_intro", label: "Introduction (synthèse)", value: str("ai_intro"), multiline: true });
      break;
    case "robots-current":
      f.push({ key: "title", label: "Titre", value: str("title"), multiline: false });
      f.push({ key: "ai_overview", label: "Analyse du robots.txt", value: str("ai_overview"), multiline: true });
      break;
    case "robots-improved":
      f.push({ key: "improved_content", label: "robots.txt recommandé", value: str("improved_content"), multiline: true });
      break;
    case "sitemap-overview":
      f.push({ key: "ai_overview", label: "Analyse du sitemap", value: str("ai_overview"), multiline: true });
      break;
    case "sitemap-sf":
      f.push({ key: "ai_overview", label: "Analyse du sitemap", value: str("ai_overview"), multiline: true });
      f.push({ key: "ai_recommendation", label: "Enjeu & action à mener", value: str("ai_recommendation"), multiline: true });
      break;
    case "sitemap-gaps":
      f.push({ key: "ai_gaps_summary", label: "Résumé des absences", value: str("ai_gaps_summary"), multiline: true });
      break;
    case "priority":
      f.push({ key: "title", label: "Titre", value: str("title"), multiline: false });
      f.push({ key: "ai_summary", label: "Synthèse consultant", value: str("ai_summary"), multiline: true });
      break;
    case "section-cover":
      f.push({ key: "title", label: "Titre de section", value: str("title"), multiline: false });
      break;
    case "reco":
      f.push({ key: "title", label: "Titre", value: str("title"), multiline: false });
      break;
    default:
      break;
  }
  return f;
}

const KIND_LABEL: Record<string, string> = {
  cover: "Couverture",
  "synthesis-radar": "Synthèse",
  summary: "Synthèse",
  "section-cover": "Couverture de section",
  data: "Données",
  info: "Information",
  "anchor-low-diversity": "Ancres peu variées",
  "anchor-empty": "Ancres vides",
  "anchor-bars": "Ancres",
  "anchor-table": "Ancres",
  "robots-current": "Robots.txt",
  "robots-improved": "Robots.txt amélioré",
  "sitemap-overview": "Sitemap",
  "sitemap-gaps": "Sitemap (absences)",
  "sitemap-sf": "Sitemap",
  pagespeed: "PageSpeed Insights",
  reco: "Recommandations",
  priority: "Priorisation",
  custom: "Slide libre",
};

function SlideEditorCard({
  slide,
  index,
  total,
  onField,
  onDelete,
  onMove,
  onAddAfter,
}: {
  slide: AdvSlideType;
  index: number;
  total: number;
  onField: (index: number, key: string, value: string) => void;
  onDelete: (index: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onAddAfter: (index: number) => void;
}) {
  const fields = editableFields(slide);
  const canDelete = slide.kind !== "cover";
  return (
    <div className="card border-accent-600/30 bg-[#16161a] p-4 mt-2 mb-2 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-accent-600/20 border border-accent-500/30 text-accent-200 font-medium">
            Slide {index + 1} / {total}
          </span>
          <span className="text-zinc-500">{KIND_LABEL[slide.kind] || slide.kind}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            className="btn-ghost text-xs px-2 py-1 disabled:opacity-30"
            title="Monter"
          >↑</button>
          <button
            onClick={() => onMove(index, 1)}
            disabled={index === total - 1}
            className="btn-ghost text-xs px-2 py-1 disabled:opacity-30"
            title="Descendre"
          >↓</button>
          <button
            onClick={() => onAddAfter(index)}
            className="btn-ghost text-xs px-2 py-1"
            title="Ajouter une slide de texte après celle-ci"
          >＋ Texte</button>
          {canDelete && (
            <button
              onClick={() => { if (confirm("Supprimer cette slide ?")) onDelete(index); }}
              className="btn-ghost text-xs px-2 py-1 text-red-300 hover:text-red-200"
              title="Supprimer"
            >🗑</button>
          )}
        </div>
      </div>

      {fields.length === 0 ? (
        <p className="text-xs text-zinc-500 italic">
          Cette slide n&apos;a pas de texte libre éditable (contenu dérivé du crawl). Tu peux la déplacer, la supprimer, ou ajouter une slide de texte.
        </p>
      ) : (
        <div className="space-y-2.5">
          {fields.map((field) => (
            <label key={field.key} className="block space-y-1">
              <span className="label text-[11px]">{field.label}</span>
              {field.multiline ? (
                <textarea
                  value={field.value}
                  onChange={(e) => onField(index, field.key, e.target.value)}
                  className={`input w-full text-[13px] leading-relaxed ${field.key === "improved_content" || field.key === "body" ? "font-mono text-[12px]" : ""}`}
                  rows={field.key === "improved_content" ? 10 : field.key === "body" ? 6 : 3}
                  spellCheck={false}
                />
              ) : (
                <input
                  type="text"
                  value={field.value}
                  onChange={(e) => onField(index, field.key, e.target.value)}
                  className="input w-full text-[13px]"
                />
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
