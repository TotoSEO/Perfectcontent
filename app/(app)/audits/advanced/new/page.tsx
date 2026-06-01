"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Folder } from "@/lib/types";
import { parseInterneHtmlCsv, inferDomain } from "@/lib/audit/advanced/parse-internal";
import { parseIssuesZip, type IssuesParseResult } from "@/lib/audit/advanced/parse-issues";
import { parseAnchorsCsv, type AnchorsParseResult } from "@/lib/audit/advanced/parse-anchors";
import { parseImagesAllCsv, type ImagesAllParseResult } from "@/lib/audit/advanced/parse-images-all";
import { analyzeAdvanced } from "@/lib/audit/advanced/analyze";
import type { AdvReport } from "@/lib/audit/advanced/types";

type Stage =
  | "idle"
  | "parsing-internal"
  | "parsing-issues"
  | "parsing-anchors"
  | "parsing-images"
  | "fetching-site"
  | "analyzing"
  | "saving";

// No artificial row cap any more : the XLSX is a client deliverable and
// must carry every row. Vercel function bodies are capped at ~4.5 MB, so
// we still apply a very-high safety ceiling per subcategory to avoid
// catastrophic 413s on edge-case audits; 50 000 rows × ~250 B ≈ 12.5 MB
// which is over the limit, so we cap there as a last resort. Realistic
// audits (a few thousand rows per category) flow through untouched.
const MAX_ISSUES_PER_CAT = 50_000;

const UPLOAD_GUIDE: Array<{
  num: number;
  filename: string;
  source: string;
  purpose: string;
}> = [
  {
    num: 1,
    filename: "interne_html.csv",
    source: "Onglet Interne → filtre HTML → Exporter",
    purpose: "Métadonnées de chaque page (title, meta, H1/H2, canonical, profondeur, temps de réponse, poids HTML, liens entrants/sortants, indexabilité).",
  },
  {
    num: 2,
    filename: "rapports_problemes.zip",
    source: "Exporter en bloc → Problèmes → Tous (puis compresser le dossier en ZIP)",
    purpose: "Détection des problèmes catégorisés par SF : doublons title/meta/H1/H2, codes HTTP, hreflang, canonical, images sans alt, noindex, sauts de hiérarchie…",
  },
  {
    num: 3,
    filename: "liens_entrants_tous.csv",
    source: "Exporter en bloc → Liens → Liens entrants Tous",
    purpose: "Tous les liens internes du site avec leur ancre + sélecteur HTML. Filtré automatiquement (Hyperlink + interne + hors nav/header/footer/menu) pour calculer le score de diversité des ancres par page.",
  },
  {
    num: 4,
    filename: "images_tous.csv",
    source: "Onglet Images → filtre Tous → Exporter",
    purpose: "Toutes les images crawlées avec leur poids, dimensions et nombre de pages référençantes : utilisé pour la slide de poids des images (distribution complète, pas uniquement > 100 Ko).",
  },
];

export default function NewAdvancedAuditPage() {
  const router = useRouter();
  const { data: folders } = useSWR<Folder[]>("/srv/folders", fetcher);

  const [internalFile, setInternalFile] = useState<File | null>(null);
  const [issuesFile, setIssuesFile] = useState<File | null>(null);
  const [anchorsFile, setAnchorsFile] = useState<File | null>(null);
  const [imagesFile, setImagesFile] = useState<File | null>(null);

  const [internalRows, setInternalRows] = useState<Awaited<ReturnType<typeof parseInterneHtmlCsv>>["rows"] | null>(null);
  const [internalStats, setInternalStats] = useState<Awaited<ReturnType<typeof parseInterneHtmlCsv>>["stats"] | null>(null);
  const [issuesResult, setIssuesResult] = useState<IssuesParseResult | null>(null);
  const [anchorsResult, setAnchorsResult] = useState<AnchorsParseResult | null>(null);
  const [imagesResult, setImagesResult] = useState<ImagesAllParseResult | null>(null);
  const [siteResources, setSiteResources] = useState<AdvReport["site_resources"]>(null);
  const [report, setReport] = useState<AdvReport | null>(null);

  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState("");

  // User-provided fields for the dedicated AI-driven robots.txt and
  // sitemap.xml slides. Pasting the content here is much more reliable than
  // fetching it through a server proxy (handles auth, staging URLs, WAF).
  const [hasRobots, setHasRobots] = useState<"yes" | "no" | null>(null);
  const [robotsContent, setRobotsContent] = useState("");
  const [sitemapUrl, setSitemapUrl] = useState("");

  const [stage, setStage] = useState<Stage>("idle");
  const [err, setErr] = useState<string | null>(null);

  const busy = stage !== "idle";

  const inferReportName = useCallback((fname: string) => {
    return fname.replace(/\.csv$/i, "").replace(/interne_html_?/i, "").trim() || "Audit avancé";
  }, []);

  const allReady = !!(internalRows && issuesResult && anchorsResult && imagesResult);

  // Re-run analyze whenever inputs change : only fire when we have at least
  // file 1 + file 2 (the minimum to produce a meaningful report).
  const reanalyze = useCallback(
    (
      rows: Awaited<ReturnType<typeof parseInterneHtmlCsv>>["rows"] | null,
      issues: IssuesParseResult | null,
      anchors: AnchorsParseResult | null,
      images: ImagesAllParseResult | null,
      siteRes: AdvReport["site_resources"],
    ) => {
      if (!rows || !issues) {
        setReport(null);
        return;
      }
      const domain = inferDomain(rows);
      const r = analyzeAdvanced(rows, issues.parsed, {
        source_filename: internalFile?.name || null,
        domain,
        site_resources: siteRes,
        anchors,
        images_all: images,
        pagination_excluded: internalStats?.pagination_skipped ?? 0,
        robots_txt_pasted: hasRobots === "yes" ? robotsContent.trim() || null : null,
        sitemap_url: sitemapUrl.trim() || null,
      });
      setReport(r);
    },
    [internalFile, internalStats, hasRobots, robotsContent, sitemapUrl],
  );

  // Re-run the analyzer whenever the robots / sitemap user-provided fields
  // change but everything else is already loaded. (The file pickers each
  // re-analyze when they finish ; this handles the case where the user
  // fills the new fields *after* the files.)
  useEffect(() => {
    if (internalRows && issuesResult) {
      reanalyze(internalRows, issuesResult, anchorsResult, imagesResult, siteResources);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRobots, robotsContent, sitemapUrl]);

  // File 1
  const onPickInternal = useCallback(async (f: File) => {
    setErr(null);
    setReport(null);
    setInternalFile(f);
    if (!name) setName(inferReportName(f.name));
    setStage("parsing-internal");
    try {
      const { rows, stats } = await parseInterneHtmlCsv(f);
      setInternalStats(stats);
      if (!rows.length) {
        const headerHint = stats.headers.length
          ? `Colonnes détectées : ${stats.headers.slice(0, 12).join(", ")}${stats.headers.length > 12 ? "…" : ""}.`
          : "Aucune colonne détectée.";
        throw new Error(
          `Aucune URL exploitable. Séparateur lu : "${stats.delimiter}". ${headerHint} ` +
          `Le fichier attendu est l'export de l'onglet "Interne" filtré sur "HTML" dans Screaming Frog.`,
        );
      }
      setInternalRows(rows);
      // Auto-fetch site resources from the inferred domain.
      const origin = inferDomain(rows);
      let siteRes: AdvReport["site_resources"] = null;
      if (origin) {
        setStage("fetching-site");
        try {
          siteRes = await api<NonNullable<AdvReport["site_resources"]> & { origin: string }>(
            "/srv/audits/site-resources",
            { method: "POST", json: { origin }, timeoutMs: 45_000 },
          );
        } catch (e) {
          console.warn("site-resources fetch failed:", e);
        }
      }
      setSiteResources(siteRes);
      setStage("analyzing");
      reanalyze(rows, issuesResult, anchorsResult, imagesResult, siteRes);
    } catch (e) {
      setErr(`Échec lecture du fichier interne_html.csv : ${e instanceof Error ? e.message : e}`);
    } finally {
      setStage("idle");
    }
  }, [issuesResult, anchorsResult, imagesResult, name, inferReportName, reanalyze]);

  // File 2
  const onPickIssues = useCallback(async (f: File) => {
    setErr(null);
    setIssuesFile(f);
    setStage("parsing-issues");
    try {
      const r = await parseIssuesZip(f);
      setIssuesResult(r);
      if (r.matched_files.length === 0) {
        throw new Error(
          "Le fichier ZIP a été lu mais aucun CSV reconnu. Vérifie qu'il s'agit bien de l'export Screaming Frog en FR via Exporter en bloc → Problèmes → Tous.",
        );
      }
      setStage("analyzing");
      reanalyze(internalRows, r, anchorsResult, imagesResult, siteResources);
    } catch (e) {
      setErr(`Échec lecture du ZIP des problèmes : ${e instanceof Error ? e.message : e}`);
    } finally {
      setStage("idle");
    }
  }, [internalRows, anchorsResult, imagesResult, siteResources, reanalyze]);

  // File 3
  const onPickAnchors = useCallback(async (f: File) => {
    setErr(null);
    setAnchorsFile(f);
    setStage("parsing-anchors");
    try {
      const r = await parseAnchorsCsv(f);
      setAnchorsResult(r);
      setStage("analyzing");
      reanalyze(internalRows, issuesResult, r, imagesResult, siteResources);
    } catch (e) {
      setErr(`Échec lecture liens_entrants_tous.csv : ${e instanceof Error ? e.message : e}`);
    } finally {
      setStage("idle");
    }
  }, [internalRows, issuesResult, imagesResult, siteResources, reanalyze]);

  // File 4
  const onPickImages = useCallback(async (f: File) => {
    setErr(null);
    setImagesFile(f);
    setStage("parsing-images");
    try {
      const r = await parseImagesAllCsv(f);
      setImagesResult(r);
      setStage("analyzing");
      reanalyze(internalRows, issuesResult, anchorsResult, r, siteResources);
    } catch (e) {
      setErr(`Échec lecture images_tous.csv : ${e instanceof Error ? e.message : e}`);
    } finally {
      setStage("idle");
    }
  }, [internalRows, issuesResult, anchorsResult, siteResources, reanalyze]);

  async function save() {
    if (!report) return;
    setStage("saving");
    setErr(null);
    try {
      const subs = report.sections.flatMap((s) => s.subcategories);
      const capped: Record<string, typeof subs[number]["issues_full"]> = {};
      let truncated = 0;
      for (const sub of subs) {
        if (sub.issues_full.length > MAX_ISSUES_PER_CAT) {
          truncated += sub.issues_full.length - MAX_ISSUES_PER_CAT;
          capped[sub.id] = sub.issues_full.slice(0, MAX_ISSUES_PER_CAT);
        } else {
          capped[sub.id] = sub.issues_full;
        }
      }
      const summary = {
        audit_type: "advanced" as const,
        schema_version: report.schema_version,
        generated_at: report.generated_at,
        global_score: report.global_score,
        url_count: report.url_count,
        html_count: report.html_count,
        domain: report.domain,
        diagnostics: report.diagnostics,
        site_resources: report.site_resources,
        robots_txt_pasted: report.robots_txt_pasted,
        sitemap_url: report.sitemap_url,
        priorities: report.priorities,
        sections: report.sections.map((s) => ({
          id: s.id,
          label: s.label,
          score: s.score,
          weight: s.weight,
          summary: s.summary,
          subcategories: s.subcategories.map(({ issues_full, ...rest }) => rest),
        })),
        slides: report.slides,
      };
      const res = await api<{ id: string }>("/srv/audits", {
        method: "POST",
        json: {
          name: name.trim() || "Audit avancé",
          folder_id: folderId || null,
          source_filename: report.source_filename,
          crawl_date: null,
          url_count: report.url_count,
          score: report.global_score,
          summary,
          issues: { categories: capped },
          notes: truncated > 0
            ? `${truncated} problèmes ont été tronqués (cap à ${MAX_ISSUES_PER_CAT} par sous-catégorie).`
            : null,
        },
        timeoutMs: 120_000,
      });
      router.push(`/audits/advanced/${res.id}`);
    } catch (e) {
      setErr(`Échec sauvegarde : ${e instanceof Error ? e.message : e}`);
      setStage("idle");
    }
  }

  const totalIssues = report
    ? report.sections.reduce((s, sec) => s + sec.subcategories.reduce((acc, sub) => acc + sub.issues_full.length, 0), 0)
    : 0;

  const filledCount = [internalFile, issuesFile, anchorsFile, imagesFile].filter(Boolean).length;

  return (
    <div className="page-shell page-shell-mid space-y-6 animate-fadein">
      <header>
        <div className="label mb-1.5 text-accent-300">Audit technique avancé</div>
        <h1 className="text-[28px] font-semibold tracking-tight">Importer un crawl complet</h1>
        <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
          4 exports Screaming Frog à uploader (en français : l'outil détecte automatiquement les colonnes FR).
          Tout est traité dans ton navigateur. Le robots.txt / sitemap.xml / llms.txt sont fetchés automatiquement
          depuis le domaine détecté.
        </p>
      </header>

      {/* "How to export" guide */}
      <section className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="label">📋 Fichiers à exporter depuis Screaming Frog</h2>
          <span className="text-[11px] text-zinc-500 tabular-nums">{filledCount}/4 fichiers</span>
        </div>
        <ul className="space-y-2.5">
          {UPLOAD_GUIDE.map((g) => {
            const provided = (
              (g.num === 1 && internalFile) ||
              (g.num === 2 && issuesFile) ||
              (g.num === 3 && anchorsFile) ||
              (g.num === 4 && imagesFile)
            );
            return (
              <li key={g.num} className="grid grid-cols-[28px_1fr] gap-3 items-start">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                    provided
                      ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-300"
                      : "bg-accent-600/15 border border-accent-500/30 text-accent-300"
                  }`}
                >
                  {provided ? "✓" : g.num}
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] text-zinc-200 font-medium leading-snug">
                    <code className="text-accent-200 font-mono text-[12px] bg-[#1c1c20] px-1.5 py-0.5 rounded">{g.filename}</code>
                    <span className="text-zinc-500 ml-2 text-xs font-normal">- {g.source}</span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1 leading-relaxed">{g.purpose}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* File pickers */}
      <FilePicker
        num={1}
        label="interne_html.csv"
        hint="Onglet Interne → filtre HTML → Exporter"
        accept=".csv,text/csv"
        file={internalFile}
        onPick={onPickInternal}
        statusLine={internalStats && internalFile && (
          <>
            <span className="text-emerald-400">✓ {internalStats.total_rows.toLocaleString("fr-FR")} URLs</span>
            {" · "}{(internalFile.size / 1024 / 1024).toFixed(1)} MB
            {report?.domain && <> · domaine <code className="text-zinc-400">{(() => { try { return new URL(report.domain).hostname; } catch { return report.domain; } })()}</code></>}
          </>
        )}
      />

      <FilePicker
        num={2}
        label="rapports_problemes.zip"
        hint="Exporter en bloc → Problèmes → Tous → compresser en ZIP"
        accept=".zip,application/zip,application/x-zip-compressed"
        file={issuesFile}
        onPick={onPickIssues}
        statusLine={issuesResult && issuesFile && (
          <>
            <span className="text-emerald-400">✓ {issuesResult.matched_files.length}/{issuesResult.total_csv_files} CSV utilisés</span>
            {issuesResult.unknown_files.length > 0 && <span className="text-zinc-500"> · {issuesResult.unknown_files.length} ignorés</span>}
            {" · "}{(issuesFile.size / 1024 / 1024).toFixed(1)} MB
            {issuesResult.unknown_files.length > 0 && (
              <details className="text-[11px] text-zinc-500 mt-1.5">
                <summary className="cursor-pointer hover:text-zinc-300">
                  Voir les {issuesResult.unknown_files.length} fichiers non reconnus
                </summary>
                <div className="mt-1.5 p-2 bg-black/20 rounded font-mono text-[10px] break-all max-h-32 overflow-y-auto">
                  {issuesResult.unknown_files.slice(0, 30).map((f, i) => (
                    <div key={i}>{f.split("/").pop()}</div>
                  ))}
                  {issuesResult.unknown_files.length > 30 && (
                    <div className="text-zinc-600 mt-1">… et {issuesResult.unknown_files.length - 30} autres</div>
                  )}
                </div>
              </details>
            )}
          </>
        )}
      />

      <FilePicker
        num={3}
        label="liens_entrants_tous.csv"
        hint="Exporter en bloc → Liens → Liens entrants Tous (gros fichier, parfois 80+ Mo)"
        accept=".csv,text/csv"
        file={anchorsFile}
        onPick={onPickAnchors}
        statusLine={anchorsResult && anchorsFile && (
          <>
            <span className={anchorsResult.total_links_filtered > 0 ? "text-emerald-400" : "text-amber-400"}>
              {anchorsResult.total_links_filtered > 0 ? "✓" : "⚠"} {anchorsResult.total_links_filtered.toLocaleString("fr-FR")} liens contextuels internes
            </span>
            <span className="text-zinc-500"> ({anchorsResult.total_links_raw.toLocaleString("fr-FR")} lus)</span>
            {anchorsResult.broken_links.length > 0 && (
              <span className="text-amber-300">{" · "}{anchorsResult.broken_links.length} liens rompus détectés</span>
            )}
            {" · "}{(anchorsFile.size / 1024 / 1024).toFixed(1)} MB
            <details className="text-[11px] text-zinc-500 mt-1.5">
              <summary className="cursor-pointer hover:text-zinc-300">Détail du filtrage</summary>
              <div className="mt-1 ml-2 font-mono text-[10.5px] space-y-0.5">
                <div>• {anchorsResult.filtered_breakdown.not_hyperlink.toLocaleString("fr-FR")} non-hyperlinks (CSS, JS, images, iframes, hreflang…)</div>
                <div>• {anchorsResult.filtered_breakdown.not_body_position.toLocaleString("fr-FR")} navigation/header/footer/menu</div>
                <div>• {anchorsResult.filtered_breakdown.external.toLocaleString("fr-FR")} liens externes</div>
                <div>• {anchorsResult.filtered_breakdown.non_200.toLocaleString("fr-FR")} liens 3xx/4xx/5xx</div>
                {anchorsResult.filtered_breakdown.no_destination > 0 && (
                  <div>• {anchorsResult.filtered_breakdown.no_destination.toLocaleString("fr-FR")} lignes sans URL valide</div>
                )}
              </div>
            </details>
            {anchorsResult.total_links_filtered === 0 && anchorsResult.total_links_raw > 0 && (
              <div className="text-amber-300 mt-1 text-[11px]">
                Aucun lien contextuel après filtrage. Vérifie que ton export contient bien les colonnes <em>Type</em>, <em>Position du lien</em>, <em>Source</em>, <em>Destination</em>.
              </div>
            )}
          </>
        )}
      />

      <FilePicker
        num={4}
        label="images_tous.csv"
        hint="Onglet Images → filtre Tous → Exporter"
        accept=".csv,text/csv"
        file={imagesFile}
        onPick={onPickImages}
        statusLine={imagesResult && imagesFile && (
          <>
            <span className="text-emerald-400">✓ {imagesResult.total_count.toLocaleString("fr-FR")} images</span>
            {" · "}{(imagesFile.size / 1024 / 1024).toFixed(1)} MB
          </>
        )}
      />

      {/* === Robots.txt & sitemap.xml inputs (drive the dedicated AI slides) === */}
      <section className="card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="label">🤖 Robots.txt & sitemap.xml</h2>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed max-w-2xl">
              Colle le contenu et l&apos;URL pour que l&apos;IA produise une analyse pointue
              et une version améliorée. Beaucoup plus fiable qu&apos;un fetch (WAF, staging, auth).
            </p>
          </div>
        </div>

        {/* Robots.txt section */}
        <div className="space-y-2">
          <span className="label">Le site dispose-t-il d&apos;un robots.txt ?</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHasRobots("yes")}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                hasRobots === "yes"
                  ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-200"
                  : "bg-[#1c1c20] border border-zinc-700 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Oui, le voici
            </button>
            <button
              type="button"
              onClick={() => { setHasRobots("no"); setRobotsContent(""); }}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                hasRobots === "no"
                  ? "bg-red-500/20 border border-red-500/40 text-red-200"
                  : "bg-[#1c1c20] border border-zinc-700 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Non / je ne sais pas
            </button>
          </div>
          {hasRobots === "yes" && (
            <textarea
              value={robotsContent}
              onChange={(e) => setRobotsContent(e.target.value)}
              placeholder={"User-agent: *\nDisallow: /admin/\nSitemap: https://example.com/sitemap.xml\n…"}
              className="input font-mono text-[12px] leading-relaxed min-h-[140px] w-full"
              rows={8}
              spellCheck={false}
            />
          )}
          {hasRobots === "yes" && robotsContent.trim().length > 0 && (
            <div className="text-[11px] text-emerald-400">
              ✓ {robotsContent.trim().split("\n").length} lignes ({robotsContent.length.toLocaleString("fr-FR")} caractères)
            </div>
          )}
        </div>

        {/* Sitemap URL */}
        <div className="space-y-1.5">
          <label className="block space-y-1.5">
            <span className="label">URL du sitemap.xml (optionnel)</span>
            <input
              type="url"
              value={sitemapUrl}
              onChange={(e) => setSitemapUrl(e.target.value)}
              placeholder="https://example.com/sitemap.xml"
              className="input"
            />
          </label>
          <p className="text-[11px] text-zinc-500">
            L&apos;extracteur déplie automatiquement les sitemap-index. Compare aux URLs indexables
            du crawl pour repérer les pages absentes.
          </p>
        </div>
      </section>

      {busy && (
        <div className="card p-4 text-sm text-zinc-300 flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-accent-500 animate-pulse" />
          {stage === "parsing-internal" && "Lecture du fichier interne_html.csv…"}
          {stage === "parsing-issues" && "Extraction du ZIP et analyse des CSV…"}
          {stage === "parsing-anchors" && "Lecture de liens_entrants_tous.csv (streaming + filtrage)…"}
          {stage === "parsing-images" && "Lecture de images_tous.csv…"}
          {stage === "fetching-site" && "Récupération du robots.txt / sitemap.xml / llms.txt…"}
          {stage === "analyzing" && "Calcul du rapport…"}
          {stage === "saving" && "Enregistrement…"}
        </div>
      )}

      {err && (
        <div className="card border-red-700/50 bg-red-900/20 text-red-100 p-4 text-sm space-y-2">
          <div className="font-medium">Échec de l'import</div>
          <div className="text-red-100/90 leading-relaxed">{err}</div>
          {internalStats && internalStats.headers.length > 0 && (
            <details className="text-xs text-red-100/80 mt-2">
              <summary className="cursor-pointer hover:text-white">
                Diagnostic : {internalStats.headers.length} colonnes lues, séparateur "{internalStats.delimiter}"
              </summary>
              <div className="mt-2 p-3 bg-black/20 rounded font-mono text-[11px] break-all">
                {internalStats.headers.join(" · ")}
              </div>
            </details>
          )}
        </div>
      )}

      {report && !busy && (
        <>
          <section className="card p-5 space-y-4">
            <h2 className="label">Aperçu de l'audit</h2>
            <div className="flex flex-wrap items-center gap-6">
              <ScoreCircle score={report.global_score} />
              <div className="space-y-1.5 flex-1 min-w-[280px]">
                <div className="text-sm text-zinc-300">
                  <strong className="tabular-nums">{report.url_count.toLocaleString("fr-FR")}</strong> URLs analysées · <strong className="tabular-nums">{totalIssues.toLocaleString("fr-FR")}</strong> problèmes détectés
                </div>
                {report.site_resources && (
                  <div className="text-xs text-zinc-500">
                    robots.txt <span className={report.site_resources.robots_txt.fetched ? "text-emerald-400" : "text-red-400"}>{report.site_resources.robots_txt.fetched ? "✓" : "✗"}</span>
                    {" · "}sitemap <span className={report.site_resources.sitemap_xml.fetched ? "text-emerald-400" : "text-red-400"}>{report.site_resources.sitemap_xml.fetched ? "✓" : "✗"}</span>
                    {report.site_resources.sitemap_xml.url_count != null && <> ({report.site_resources.sitemap_xml.url_count} URLs)</>}
                    {" · "}llms.txt <span className={report.site_resources.llms_txt.fetched ? "text-emerald-400" : "text-zinc-500"}>{report.site_resources.llms_txt.fetched ? "✓" : "-"}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-500 mt-2">
                  {report.sections.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{c.label}</span>
                      <span className={`tabular-nums font-medium ${
                        c.score >= 80 ? "text-emerald-300" :
                        c.score >= 50 ? "text-amber-300" : "text-red-300"
                      }`}>{c.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {!allReady && (
              <div className="text-xs text-amber-300/90 leading-relaxed bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                ℹ️ Tu peux déjà enregistrer avec les fichiers actuels, mais ajoute les 4 fichiers pour un rapport complet
                ({!anchorsResult && "ancres internes "}{!imagesResult && (anchorsResult ? "et " : "") + "poids des images"}).
              </div>
            )}
          </section>

          <section className="card p-5 space-y-4">
            <h2 className="label">Enregistrement</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="label">Nom de l'audit</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex : visibilitea.fr : mai 2026"
                  className="input"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="label">Dossier (optionnel)</span>
                <select
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  className="input"
                >
                  <option value="">(aucun)</option>
                  {folders?.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <div className="card p-4 flex flex-wrap items-center justify-between gap-3 sticky bottom-3 backdrop-blur shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]">
            <div className="text-sm">
              <div className="font-medium">Audit avancé prêt à enregistrer</div>
              <div className="text-xs text-zinc-500 mt-0.5">
                Score global <strong className="text-zinc-200">{report.global_score}/100</strong>
                {" · "}{report.slides.length} slides · {totalIssues.toLocaleString("fr-FR")} problèmes
              </div>
            </div>
            <button onClick={save} disabled={busy} className="btn-primary">
              Enregistrer l'audit
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function FilePicker({
  num,
  label,
  hint,
  accept,
  file,
  onPick,
  statusLine,
}: {
  num: number;
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onPick: (f: File) => void;
  statusLine?: React.ReactNode;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <section
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onPick(f);
      }}
      className={`card p-6 border-dashed transition-colors ${drag ? "border-accent-500 bg-accent-500/5" : ""}`}
    >
      <div className="flex items-center gap-5">
        <div
          className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 text-xl font-mono ${
            file
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
              : "bg-accent-600/15 border-accent-500/30 text-accent-300"
          }`}
        >
          {file ? "✓" : num}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-zinc-200 font-medium mb-0.5 truncate">
            {file ? file.name : <code className="text-accent-200 font-mono text-[14px]">{label}</code>}
          </div>
          <div className="text-xs text-zinc-500 truncate">
            {statusLine || hint}
          </div>
        </div>
        <label className="btn-primary text-sm cursor-pointer shrink-0">
          <input
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
            }}
          />
          {file ? "Remplacer" : "Choisir"}
        </label>
      </div>
    </section>
  );
}

function ScoreCircle({ score }: { score: number }) {
  const tone =
    score >= 80 ? { ring: "stroke-emerald-500", text: "text-emerald-300" } :
    score >= 50 ? { ring: "stroke-amber-500", text: "text-amber-300" } :
                  { ring: "stroke-red-500", text: "text-red-300" };
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  return (
    <div className="relative w-24 h-24 shrink-0">
      <svg viewBox="0 0 90 90" className="w-full h-full -rotate-90">
        <circle cx="45" cy="45" r={r} className="stroke-[#1c1c20] fill-none" strokeWidth="6" />
        <circle
          cx="45" cy="45" r={r}
          className={`${tone.ring} fill-none transition-all`}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center ${tone.text} font-semibold tabular-nums`}>
        {score}
      </div>
    </div>
  );
}
