"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Folder } from "@/lib/types";
import { parseInternalCsv } from "@/lib/audit/parse";
import { analyze } from "@/lib/audit/analyze";
import type { Report } from "@/lib/audit/types";

export default function NewAuditPage() {
  const router = useRouter();
  const { data: folders } = useSWR<Folder[]>("/srv/folders", fetcher);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"idle" | "parsing" | "analyzing" | "saving">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [parseStats, setParseStats] = useState<Awaited<ReturnType<typeof parseInternalCsv>>["stats"] | null>(null);

  const onPickFile = useCallback(async (f: File) => {
    setErr(null);
    setReport(null);
    setParseStats(null);
    setFile(f);
    if (!name) {
      const inferred = f.name.replace(/\.csv$/i, "").replace(/internal_all_?/i, "").trim() || "Audit";
      setName(inferred || "Audit");
    }
    setBusy(true);
    try {
      setStage("parsing");
      const { rows, stats } = await parseInternalCsv(f);
      setParseStats(stats);
      if (!rows.length) {
        const headerHint = stats.headers.length
          ? `Colonnes détectées : ${stats.headers.slice(0, 12).join(", ")}${stats.headers.length > 12 ? "…" : ""}.`
          : "Aucune colonne détectée — le fichier est peut-être vide ou mal formaté.";
        const sepHint = `Séparateur lu : "${stats.delimiter}". `;
        const skippedHint = stats.rows_without_url > 0
          ? `${stats.rows_without_url} lignes ont été ignorées car elles n'avaient pas de colonne URL/Address valide. `
          : "";
        throw new Error(
          `Aucune URL exploitable dans le fichier. ${sepHint}${skippedHint}${headerHint} ` +
          `Dans Screaming Frog, exporte depuis l'onglet "Internal" avec le filtre "HTML" → bouton Export en haut à droite.`,
        );
      }
      setStage("analyzing");
      const r = analyze(rows, { source_filename: stats.filename });
      setReport(r);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
      setStage("idle");
    }
  }, [name]);

  function onInputFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onPickFile(f);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onPickFile(f);
  }

  // Vercel serverless functions cap request bodies at ~4.5 MB. A massive
  // crawl (50k URLs, all broken) could blow past that if we shipped every
  // issue verbatim. Cap each category to 500 rows after sorting by severity
  // — far more than enough for client deliverables, and the Excel export
  // works off this same persisted set so it stays under the limit too.
  const MAX_ISSUES_PER_CAT = 500;
  const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

  async function save() {
    if (!report) return;
    setBusy(true);
    setStage("saving");
    setErr(null);
    try {
      const cappedIssues: Record<string, typeof report.categories[number]["issues_full"]> = {};
      let truncated = 0;
      for (const c of report.categories) {
        const sorted = [...c.issues_full].sort(
          (a, b) =>
            SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
        );
        if (sorted.length > MAX_ISSUES_PER_CAT) truncated += sorted.length - MAX_ISSUES_PER_CAT;
        cappedIssues[c.id] = sorted.slice(0, MAX_ISSUES_PER_CAT);
      }
      const res = await api<{ id: string }>("/srv/audits", {
        method: "POST",
        json: {
          name: name.trim() || "Audit",
          folder_id: folderId || null,
          source_filename: report.source_filename,
          crawl_date: report.crawl_date,
          url_count: report.url_count,
          score: report.global_score,
          summary: {
            schema_version: report.schema_version,
            generated_at: report.generated_at,
            global_score: report.global_score,
            categories: report.categories.map(({ issues_full, ...c }) => c),
          },
          issues: { categories: cappedIssues },
          notes: truncated > 0
            ? `${truncated} problèmes ont été tronqués (cap à ${MAX_ISSUES_PER_CAT} par catégorie pour rester sous la limite serveur).`
            : null,
        },
      });
      router.push(`/audits/${res.id}`);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
      setStage("idle");
    }
  }

  return (
    <div className="space-y-6 max-w-4xl animate-fadein">
      <header>
        <div className="label mb-1.5">Audit technique</div>
        <h1 className="text-[28px] font-semibold tracking-tight">Importer un crawl</h1>
        <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
          Dépose le CSV exporté depuis Screaming Frog (onglet <strong>Internal</strong>,
          filtre <strong>HTML</strong>, <strong>Export</strong>). Le fichier est analysé
          dans ton navigateur — rien d'autre que le rapport calculé n'est envoyé au serveur.
        </p>
      </header>

      {/* Upload area */}
      <section
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`card p-10 border-dashed transition-colors text-center ${
          drag ? "border-accent-500 bg-accent-500/5" : ""
        }`}
      >
        <div className="mx-auto w-14 h-14 rounded-2xl bg-accent-600/15 border border-accent-500/30 flex items-center justify-center mb-4">
          <span className="text-accent-400 text-2xl">⇪</span>
        </div>
        <div className="text-zinc-200 font-medium mb-1">
          {file ? file.name : "Dépose ton fichier internal_all.csv"}
        </div>
        <div className="text-xs text-zinc-500 mb-4">
          {file
            ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
            : "Glisse-dépose ou clique pour sélectionner."}
        </div>
        <label className="btn-primary inline-flex cursor-pointer">
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onInputFile}
          />
          {file ? "Remplacer" : "Choisir un fichier"}
        </label>
      </section>

      {busy && (
        <div className="card p-4 text-sm text-zinc-300 flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-accent-500 animate-pulse" />
          {stage === "parsing" && "Lecture du CSV…"}
          {stage === "analyzing" && "Analyse des données…"}
          {stage === "saving" && "Enregistrement…"}
        </div>
      )}

      {err && (
        <div className="card border-red-700/50 bg-red-900/20 text-red-100 p-4 text-sm space-y-2">
          <div className="font-medium">Échec de l'import</div>
          <div className="text-red-100/90 leading-relaxed">{err}</div>
          {parseStats && parseStats.headers.length > 0 && (
            <details className="text-xs text-red-100/80 mt-2">
              <summary className="cursor-pointer hover:text-white">
                Diagnostic technique ({parseStats.headers.length} colonnes lues, séparateur "{parseStats.delimiter}")
              </summary>
              <div className="mt-2 p-3 bg-black/20 rounded font-mono text-[11px] break-all">
                {parseStats.headers.join(" · ")}
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
              <div className="space-y-1.5 flex-1 min-w-[240px]">
                <div className="text-sm text-zinc-300">
                  <strong className="tabular-nums">{report.url_count}</strong> URLs analysées
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-500">
                  {report.categories.map((c) => (
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
                  placeholder="ex : striq.fr — mai 2026"
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
              <div className="font-medium">Audit prêt à enregistrer</div>
              <div className="text-xs text-zinc-500 mt-0.5">
                Score global <strong className="text-zinc-200">{report.global_score}/100</strong>
                {" · "}
                {report.categories.reduce((s, c) => s + c.issues_full.length, 0)} problèmes détectés
              </div>
            </div>
            <button onClick={save} disabled={busy} className="btn-primary">
              {busy ? "Enregistrement…" : "Enregistrer l'audit"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ScoreCircle({ score }: { score: number }) {
  const tone =
    score >= 80 ? { ring: "stroke-emerald-500", text: "text-emerald-300" } :
    score >= 50 ? { ring: "stroke-amber-500", text: "text-amber-300" } :
                  { ring: "stroke-red-500",   text: "text-red-300" };
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
