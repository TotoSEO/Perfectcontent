"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { HelpIcon } from "@/components/Tooltip";

type Opportunity = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  priority: number;
  cluster_id: number;
  count_exact: number;
  count_semi: number;
  occurrences: [number, number][];
};

type ParseResponse = {
  total_rows: number;
  opportunities: Opportunity[];
  all_queries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
};

type RewriteResponse = {
  rewritten: string;
  cost: number;
  input_tokens: number;
  output_tokens: number;
};

const CLUSTER_COLORS = [
  "#7c84ff", "#10b981", "#f59e0b", "#ec4899",
  "#06b6d4", "#a78bfa", "#f97316", "#14b8a6",
];

export default function OptimizePage() {
  const [csvText, setCsvText] = useState("");
  const [csvName, setCsvName] = useState<string>("");
  const [content, setContent] = useState("");
  const [parsed, setParsed] = useState<ParseResponse | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseLoading, setParseLoading] = useState(false);

  const [rewritten, setRewritten] = useState<string | null>(null);
  const [rewriteCost, setRewriteCost] = useState<number>(0);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── CSV upload ────────────────────────────────────────────────────────────
  async function onCsvFile(file: File) {
    setCsvName(file.name);
    setParseError(null);
    const text = await file.text();
    setCsvText(text);
    await runParse(text, content);
  }

  async function runParse(csv: string, body: string) {
    if (!csv.trim()) return;
    setParseLoading(true);
    setParseError(null);
    try {
      const res = await api<ParseResponse>("/srv/optimize/parse-csv", {
        method: "POST",
        json: { csv_text: csv, content: body },
      });
      setParsed(res);
      // Auto-check every returned opportunity by default — that matches the
      // user's "show 10 most interesting" rule. They can uncheck a row if
      // they don't want it integrated.
      setPicked(new Set(res.opportunities.map((o) => o.query)));
    } catch (e) {
      setParseError(String(e));
      setParsed(null);
    } finally {
      setParseLoading(false);
    }
  }

  // ── Live recount whenever content changes ────────────────────────────────
  // Debounced server call. The endpoint is fast (no LLM, just BM25-like
  // counting) so this stays responsive even on long content.
  const recountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!csvText) return;
    if (recountTimer.current) clearTimeout(recountTimer.current);
    recountTimer.current = setTimeout(async () => {
      try {
        const res = await api<{ opportunities: Opportunity[] }>(
          "/srv/optimize/recount",
          { method: "POST", json: { csv_text: csvText, content } },
        );
        // Keep recount state of user picks: drop queries that disappeared
        // (priority change pushed them out of the top), keep what was
        // checked, and DON'T auto-re-check what the user manually unchecked.
        // We track previously-known queries so we can only auto-check
        // genuinely new entries (rare — happens when priority order shifts).
        setPicked((prev) => {
          const oldQueries = new Set(
            (parsed?.opportunities || []).map((o) => o.query),
          );
          const valid = new Set(res.opportunities.map((o) => o.query));
          const next = new Set<string>();
          for (const q of prev) if (valid.has(q)) next.add(q);
          // Auto-check entries that are TRULY new (i.e., were not in the
          // previous opportunities list at all). Anything the user unchecked
          // stays unchecked.
          for (const o of res.opportunities) {
            if (!oldQueries.has(o.query) && !next.has(o.query)) {
              next.add(o.query);
            }
          }
          return next;
        });
        setParsed((prev) =>
          prev ? { ...prev, opportunities: res.opportunities } : prev,
        );
      } catch {
        /* recount errors are non-fatal */
      }
    }, 500);
    return () => {
      if (recountTimer.current) clearTimeout(recountTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  // ── Rewrite ───────────────────────────────────────────────────────────────
  const opportunities = parsed?.opportunities || [];
  const pickedTerms = useMemo(
    () => opportunities.filter((o) => picked.has(o.query)),
    [opportunities, picked],
  );
  const ready = content.trim().length > 30 && pickedTerms.length > 0;

  async function rewrite() {
    if (!ready) return;
    setRewriteLoading(true);
    setRewriteError(null);
    setRewritten(null);
    try {
      const res = await api<RewriteResponse>("/srv/optimize/rewrite", {
        method: "POST",
        json: {
          content,
          terms: pickedTerms.map((t) => ({
            query: t.query,
            count_exact: t.count_exact,
            count_semi: t.count_semi,
          })),
        },
      });
      setRewritten(res.rewritten);
      setRewriteCost(res.cost);
    } catch (e) {
      setRewriteError(String(e));
    } finally {
      setRewriteLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page-shell space-y-6">
      <header className="animate-rise">
        <div className="eyebrow mb-2 inline-flex items-center gap-2">
          <Icon name="audit" size={11} />
          Optimisation
        </div>
        <h1 className="h-page">Optimisation GSC</h1>
        <p className="h-sub max-w-2xl">
          Donne ton export CSV de Google Search Console (filtré sur une page),
          colle le contenu de cette page et l'algorithme te ressort les 10
          mots-clés les plus prioritaires à intégrer.
          {" "}
          <strong className="text-zinc-300">
            Source : étude Thot SEO — pages contenant le terme exact ou
            semi-exact rankent ×1.7 dans le top 10 et ×2.2 dans le top 3, avec
            rendements décroissants au-delà d'1 occurrence.
          </strong>
        </p>
      </header>

      {/* CSV upload */}
      <section
        className="card p-5 space-y-3 animate-rise"
        style={{ animationDelay: "60ms" }}
      >
        <div className="flex items-center justify-between">
          <span className="label inline-flex items-center gap-2">
            <Icon name="download" size={11} />
            Étape 1 — Importer ton export GSC
            <HelpIcon
              content="Dans Google Search Console : Performance → filtre Page → ton URL → onglet Requêtes → bouton Exporter (CSV ou Excel). Le fichier contient automatiquement Query / Clicks / Impressions / CTR / Position."
            />
          </span>
          {csvName && (
            <span className="text-[11px] text-zinc-500 truncate max-w-[280px]">
              {csvName}
              {parsed && ` · ${parsed.total_rows} requêtes`}
            </span>
          )}
        </div>

        {!csvName ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add("border-accent-500/50");
            }}
            onDragLeave={(e) =>
              e.currentTarget.classList.remove("border-accent-500/50")
            }
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("border-accent-500/50");
              const file = e.dataTransfer.files[0];
              if (file) onCsvFile(file);
            }}
            className="border border-dashed border-[var(--border)] hover:border-accent-500/40 rounded-xl p-8 text-center cursor-pointer hover:bg-accent-500/[0.03] transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-accent-500/10 border border-accent-500/30 inline-flex items-center justify-center text-accent-300 mb-2">
              <Icon name="download" size={16} />
            </div>
            <div className="text-sm text-zinc-200">
              Glisse-dépose ton CSV ici, ou clique pour le sélectionner
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">
              Format GSC standard : Query / Clicks / Impressions / CTR / Position
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onCsvFile(f);
              }}
              className="hidden"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setCsvName("");
                setCsvText("");
                setParsed(null);
                setPicked(new Set());
                setParseError(null);
              }}
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              <Icon name="x" size={11} />
              Changer de fichier
            </button>
            {parseLoading && (
              <span className="text-xs text-zinc-400 inline-flex items-center gap-1.5">
                <Icon name="spinner" size={11} />
                Analyse…
              </span>
            )}
          </div>
        )}

        {parseError && (
          <div className="card border-red-700/50 bg-red-500/10 text-red-100 p-3 text-sm flex items-start gap-2">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
            <span>{parseError}</span>
          </div>
        )}
      </section>

      {/* Content + Keyword table */}
      {parsed && (
        <section
          className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-rise"
          style={{ animationDelay: "120ms" }}
        >
          {/* Content editor */}
          <div className="card overflow-hidden flex flex-col">
            <div className="card-section">
              <span className="label inline-flex items-center gap-2">
                <Icon name="edit" size={11} />
                Étape 2 — Coller le contenu de la page
              </span>
              <span className="text-[11px] text-zinc-500 tabular-nums">
                {wordCount(content)} mot{wordCount(content) > 1 ? "s" : ""}
              </span>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Colle ici le contenu HTML ou texte de ta page. Les compteurs se mettent à jour en direct."
              spellCheck={false}
              className="w-full bg-transparent px-5 py-4 text-[13.5px] leading-relaxed text-zinc-100 focus:outline-none resize-none flex-1"
              style={{ minHeight: 480 }}
            />
          </div>

          {/* Keyword table */}
          <div className="card overflow-hidden flex flex-col">
            <div className="card-section">
              <span className="label inline-flex items-center gap-2">
                <Icon name="sparkles" size={11} />
                Étape 3 — Mots-clés prioritaires
                <HelpIcon content="Top 10 par défaut. Si la page n'a que peu de variétés sémantiques, on étend jusqu'à 15 pour ramener au moins 3 angles distincts. Coche / décoche les termes que Claude doit intégrer." />
              </span>
              <span className="text-[11px] text-zinc-500 tabular-nums">
                {pickedTerms.length} / {opportunities.length} cochés
              </span>
            </div>
            {opportunities.length === 0 ? (
              <div className="p-6 text-sm text-zinc-500 text-center">
                Aucun mot-clé scoré. Vérifie que le CSV est bien filtré.
              </div>
            ) : (
              <div className="overflow-y-auto" style={{ maxHeight: 530 }}>
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-[#10121a]/95 backdrop-blur">
                    <tr className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                      <th className="text-left px-3 py-2.5 w-8"></th>
                      <th className="text-left px-3 py-2.5">Requête</th>
                      <th className="text-right px-2 py-2.5 w-14">Imp.</th>
                      <th className="text-right px-2 py-2.5 w-14">Pos.</th>
                      <th className="text-right px-2 py-2.5 w-12">Clics</th>
                      <th className="text-right px-3 py-2.5 w-16">Compte</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {opportunities.map((o) => {
                      const checked = picked.has(o.query);
                      const total = o.count_exact + o.count_semi;
                      const status: "missing" | "low" | "ok" =
                        total === 0 ? "missing" : total >= 2 ? "ok" : "low";
                      const statusColor =
                        status === "missing"
                          ? "text-red-300"
                          : status === "low"
                          ? "text-amber-300"
                          : "text-emerald-300";
                      const clusterColor =
                        CLUSTER_COLORS[
                          o.cluster_id % CLUSTER_COLORS.length
                        ];
                      return (
                        <tr
                          key={o.query}
                          className={`group hover:bg-white/[0.025] transition-colors ${
                            checked ? "" : "opacity-60"
                          }`}
                        >
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setPicked((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(o.query);
                                  else next.delete(o.query);
                                  return next;
                                });
                              }}
                              className="accent-accent-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-3 py-2.5 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ background: clusterColor }}
                                title={`Cluster #${o.cluster_id}`}
                              />
                              <span className="text-[13px] text-zinc-100 truncate">
                                {o.query}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-right text-[12px] tabular-nums text-zinc-300">
                            {o.impressions.toLocaleString("fr-FR")}
                          </td>
                          <td className="px-2 py-2.5 text-right text-[12px] tabular-nums text-zinc-400">
                            {o.position.toFixed(1)}
                          </td>
                          <td className="px-2 py-2.5 text-right text-[12px] tabular-nums text-zinc-400">
                            {o.clicks}
                          </td>
                          <td
                            className={`px-3 py-2.5 text-right text-[12px] font-semibold tabular-nums ${statusColor}`}
                          >
                            {o.count_exact > 0 && `${o.count_exact}×`}
                            {o.count_exact > 0 && o.count_semi > 0 && " "}
                            {o.count_semi > 0 && (
                              <span className="text-[10px] opacity-70">
                                +{o.count_semi}≈
                              </span>
                            )}
                            {total === 0 && "0"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="px-4 py-2.5 text-[10px] text-zinc-500 border-t border-[var(--border)] flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                manquant
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                1× (peu)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                ≥ 2× (ok)
              </span>
              <span className="ml-auto opacity-70">
                <code className="text-zinc-300">N×</code> exact ·{" "}
                <code className="text-zinc-300">+N≈</code> semi
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Rewrite trigger */}
      {parsed && (
        <section
          className="card p-5 flex flex-wrap items-center justify-between gap-4 sticky bottom-3 backdrop-blur-md animate-rise"
          style={{ animationDelay: "180ms" }}
        >
          <div className="text-xs text-zinc-500">
            <div className="text-zinc-300 font-medium text-sm">
              {pickedTerms.length} terme{pickedTerms.length > 1 ? "s" : ""} sélectionné{pickedTerms.length > 1 ? "s" : ""}
            </div>
            <div className="mt-0.5">
              Claude Sonnet · ~$0.04 par réécriture · garde la structure
              intacte, intègre uniquement, autorise +/-2 paragraphes max
            </div>
          </div>
          <button
            onClick={rewrite}
            disabled={!ready || rewriteLoading}
            className="btn-primary"
          >
            {rewriteLoading ? (
              <>
                <Icon name="spinner" size={14} />
                Réécriture…
              </>
            ) : (
              <>
                <Icon name="sparkles" size={14} />
                Réécrire avec ces termes
              </>
            )}
          </button>
        </section>
      )}

      {rewriteError && (
        <div className="card border-red-700/50 bg-red-500/10 text-red-100 p-3 text-sm flex items-start gap-2 animate-rise">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          <span>{rewriteError}</span>
        </div>
      )}

      {rewritten && (
        <section
          className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-rise"
          style={{ animationDelay: "60ms" }}
        >
          <div className="card overflow-hidden flex flex-col">
            <div className="card-section">
              <span className="label">Avant</span>
              <span className="text-[11px] text-zinc-500 tabular-nums">
                {wordCount(content)} mots
              </span>
            </div>
            <pre
              className="px-5 py-4 text-[13px] leading-relaxed text-zinc-300 whitespace-pre-wrap break-words font-sans overflow-y-auto"
              style={{ maxHeight: 600 }}
            >
              {content}
            </pre>
          </div>
          <div className="card overflow-hidden flex flex-col border-emerald-500/30">
            <div className="card-section bg-emerald-500/[0.03]">
              <span className="label inline-flex items-center gap-2 text-emerald-200">
                <Icon name="check" size={11} />
                Après — termes intégrés
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-500 tabular-nums">
                  {wordCount(rewritten)} mots · ${rewriteCost.toFixed(4)}
                </span>
                <CopyButton text={rewritten} />
              </div>
            </div>
            <pre
              className="px-5 py-4 text-[13px] leading-relaxed text-zinc-100 whitespace-pre-wrap break-words font-sans overflow-y-auto"
              style={{ maxHeight: 600 }}
            >
              {rewritten}
            </pre>
          </div>
        </section>
      )}
    </div>
  );
}

function wordCount(s: string): number {
  return s.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  }
  return (
    <button onClick={copy} className="text-[11px] text-zinc-500 hover:text-emerald-300 transition-colors inline-flex items-center gap-1">
      <Icon name="copy" size={10} />
      {copied ? "Copié ✓" : "Copier"}
    </button>
  );
}
