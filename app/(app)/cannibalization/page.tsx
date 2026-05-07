"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { HelpIcon } from "@/components/Tooltip";

type GscIn = {
  clicks?: number | null;
  impressions?: number | null;
  position?: number | null;
  ctr?: number | null;
};

type WinnerScore = {
  url: string;
  total: number;
  authority: number;
  performance: number;
  quality: number;
  freshness: number;
  breakdown: { weights: { auth: number; perf: number; qual: number; fresh: number } };
};

type Probe = {
  url: string;
  fetched: boolean;
  error: string | null;
  title: string | null;
  h1: string | null;
  h2: string[];
  h3: string[];
  word_count: number;
  paragraphs_count: number;
  lists_count: number;
  tables_count: number;
  has_faq_schema: boolean;
  has_article_schema: boolean;
  has_product_schema: boolean;
  canonical_url: string | null;
  canonical_resolved: boolean;
  noindex: boolean;
  is_paginated: boolean;
  last_modified: string | null;
  body_excerpt: string;
  entities: string[];
  internal_links_in: number;
  url_depth: number;
};

type Signals = {
  cos_kw_a: number;
  cos_kw_b: number;
  cos_a_b: number;
  jaccard_headings: number;
  ngram_overlap: number;
  entity_overlap: number;
  serp_a_position: number | null;
  serp_b_position: number | null;
  serp_both_top20: boolean;
  canonical_resolved: boolean;
  intent_diverge: boolean;
};

type Report = {
  keyword: string;
  a: Probe;
  b: Probe;
  signals: Signals;
  probability: number;
  severity: number;
  winner: "A" | "B" | null;
  winner_gap: number;
  winner_reason: string;
  score_a: WinnerScore;
  score_b: WinnerScore;
  verdict: "cannibalize_strong" | "cannibalize_weak" | "ok_differentiated";
  confidence: number;
  action: string;
  merge_plan: string[];
  risks: string[];
  cost: number;
  notes: string[];
};

const ACTION_LABELS: Record<string, string> = {
  merge_b_into_a_301: "Fusionner B → A + 301",
  merge_a_into_b_301: "Fusionner A → B + 301",
  canonical_b_to_a: "Canonical B → A",
  canonical_a_to_b: "Canonical A → B",
  differentiate: "Différencier l'intention",
  noindex_b: "Noindex B",
  noindex_a: "Noindex A",
  no_action: "Aucune action",
};

const VERDICT_LABELS: Record<string, string> = {
  cannibalize_strong: "Cannibalisation forte",
  cannibalize_weak: "Cannibalisation faible",
  ok_differentiated: "Pages différenciées",
};

export default function CannibalizationPage() {
  const [keyword, setKeyword] = useState("");
  const [urlA, setUrlA] = useState("");
  const [urlB, setUrlB] = useState("");
  const [showGsc, setShowGsc] = useState(false);
  const [gscA, setGscA] = useState<GscIn>({});
  const [gscB, setGscB] = useState<GscIn>({});
  const [backlinksA, setBacklinksA] = useState<number | "">("");
  const [backlinksB, setBacklinksB] = useState<number | "">("");

  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const ready = keyword.trim() && urlA.trim() && urlB.trim();

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setErr(null);
    setReport(null);
    try {
      const cleanedGscA = sanitizeGsc(gscA);
      const cleanedGscB = sanitizeGsc(gscB);
      const r = await api<Report>("/srv/cannibalization/audit", {
        method: "POST",
        json: {
          keyword: keyword.trim(),
          url_a: urlA.trim(),
          url_b: urlB.trim(),
          gsc_a: cleanedGscA,
          gsc_b: cleanedGscB,
          backlinks_a: backlinksA === "" ? null : Number(backlinksA),
          backlinks_b: backlinksB === "" ? null : Number(backlinksB),
        },
      });
      setReport(r);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-shell space-y-6">
      <header className="animate-rise">
        <div className="eyebrow mb-2 inline-flex items-center gap-2">
          <Icon name="fusion" size={11} />
          Audit
        </div>
        <h1 className="h-page">Détecteur de cannibalisation</h1>
        <p className="h-sub max-w-2xl">
          Analyse comparée de deux pages sur un même mot-clé : signaux algorithmiques
          (cosine d'embedding, structure, SERP probe), scoring du gagnant, plan de
          fusion section par section.
        </p>
      </header>

      <section
        className="card p-5 space-y-4 animate-rise"
        style={{ animationDelay: "60ms" }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Mot-clé cible" full help="La requête sur laquelle tu suspectes la cannibalisation.">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="ex : meilleure cafetière"
              className="input"
            />
          </Field>
          <div />
          <Field label="URL A" help="Page candidate n°1.">
            <input
              value={urlA}
              onChange={(e) => setUrlA(e.target.value)}
              placeholder="https://exemple.com/cafetiere/comparatif"
              className="input"
              spellCheck={false}
            />
          </Field>
          <Field label="URL B" help="Page candidate n°2.">
            <input
              value={urlB}
              onChange={(e) => setUrlB(e.target.value)}
              placeholder="https://exemple.com/blog/quelle-cafetiere-choisir"
              className="input"
              spellCheck={false}
            />
          </Field>
        </div>

        <button
          type="button"
          onClick={() => setShowGsc((s) => !s)}
          className="text-xs text-zinc-400 hover:text-white inline-flex items-center gap-1.5 transition-colors"
        >
          <Icon
            name="chevron-right"
            size={11}
            className={`transition-transform ${showGsc ? "rotate-90" : ""}`}
          />
          Données GSC + backlinks (optionnel, mais recommandé)
        </button>

        <div
          className={`grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            showGsc ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
          style={{ overflow: "hidden" }}
        >
          <div className="min-h-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3">
              <GscBlock label="GSC — URL A" gsc={gscA} setGsc={setGscA} />
              <GscBlock label="GSC — URL B" gsc={gscB} setGsc={setGscB} />
              <Field label="Backlinks externes A" help="Optionnel — nombre de domaines référents (Ahrefs, Majestic).">
                <input
                  type="number"
                  min={0}
                  value={backlinksA}
                  onChange={(e) => setBacklinksA(e.target.value === "" ? "" : Number(e.target.value))}
                  className="input"
                />
              </Field>
              <Field label="Backlinks externes B">
                <input
                  type="number"
                  min={0}
                  value={backlinksB}
                  onChange={(e) => setBacklinksB(e.target.value === "" ? "" : Number(e.target.value))}
                  className="input"
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="text-xs text-zinc-500 flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-accent-400" />
            ~30 s d'analyse · embeddings + SERP probe + Claude · ≈ $0.03 / audit
          </div>
          <button
            onClick={submit}
            disabled={!ready || busy}
            className="btn-primary"
          >
            {busy ? (
              <>
                <Icon name="spinner" size={14} />
                Analyse…
              </>
            ) : (
              <>
                <Icon name="search" size={14} />
                Lancer l'audit
              </>
            )}
          </button>
        </div>

        {err && (
          <div className="card border-red-700/50 bg-red-500/10 text-red-100 p-3 text-sm flex items-start gap-2">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
            <span>{err}</span>
          </div>
        )}
      </section>

      {report && <ReportView report={report} />}
    </div>
  );
}

function sanitizeGsc(g: GscIn): GscIn | null {
  const cleaned: GscIn = {};
  let any = false;
  if (g.clicks !== undefined && g.clicks !== null && !Number.isNaN(g.clicks)) {
    cleaned.clicks = g.clicks;
    any = true;
  }
  if (g.impressions !== undefined && g.impressions !== null && !Number.isNaN(g.impressions)) {
    cleaned.impressions = g.impressions;
    any = true;
  }
  if (g.position !== undefined && g.position !== null && !Number.isNaN(g.position)) {
    cleaned.position = g.position;
    any = true;
  }
  if (g.ctr !== undefined && g.ctr !== null && !Number.isNaN(g.ctr)) {
    cleaned.ctr = g.ctr;
    any = true;
  }
  return any ? cleaned : null;
}

/* ----------------------------- Report view ----------------------------- */

function ReportView({ report }: { report: Report }) {
  const verdict = report.verdict;
  const verdictTone =
    verdict === "cannibalize_strong"
      ? "from-red-500/20 via-red-500/5 to-transparent border-red-500/40 text-red-100"
      : verdict === "cannibalize_weak"
      ? "from-amber-500/20 via-amber-500/5 to-transparent border-amber-500/40 text-amber-100"
      : "from-emerald-500/20 via-emerald-500/5 to-transparent border-emerald-500/40 text-emerald-100";

  return (
    <div className="space-y-5 animate-rise" style={{ animationDelay: "40ms" }}>
      {/* TOP banner */}
      <section
        className={`relative card overflow-hidden border bg-gradient-to-br ${verdictTone}`}
      >
        <div className="px-6 py-5 flex flex-wrap items-center gap-6 justify-between">
          <div className="flex items-center gap-5">
            <ScoreCircle value={report.probability} severity={report.severity} />
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] opacity-80">
                Verdict
              </div>
              <div className="text-xl font-semibold mt-0.5">
                {VERDICT_LABELS[verdict]}
              </div>
              <div className="text-xs mt-1 opacity-85">
                Confiance Claude {(report.confidence * 100).toFixed(0)} %
                {" · "}Sévérité {report.severity.toFixed(0)} / 100
                {report.signals.intent_diverge && (
                  <>
                    {" · "}<span className="font-medium">intentions divergentes</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.18em] opacity-80">
              Action recommandée
            </div>
            <div className="text-base font-semibold mt-0.5">
              {ACTION_LABELS[report.action] || report.action}
            </div>
            {report.winner && (
              <div className="text-xs mt-1 opacity-85">
                Gagnant : <strong>{report.winner}</strong>{" "}
                <span className="opacity-70">(écart {report.winner_gap.toFixed(1)} pts)</span>
              </div>
            )}
          </div>
        </div>
        {report.winner && (
          <div className="border-t border-white/10 px-6 py-3 text-sm bg-black/20">
            <span className="opacity-70">Pourquoi {report.winner} ? </span>
            {report.winner_reason}
          </div>
        )}
      </section>

      {/* Side-by-side comparison */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PageCard
          label="A"
          probe={report.a}
          score={report.score_a}
          isWinner={report.winner === "A"}
          gscPos={report.signals.serp_a_position}
        />
        <PageCard
          label="B"
          probe={report.b}
          score={report.score_b}
          isWinner={report.winner === "B"}
          gscPos={report.signals.serp_b_position}
        />
      </section>

      {/* Algo signals */}
      <section className="card overflow-hidden">
        <div className="card-section">
          <span className="label">Signaux algorithmiques</span>
          <span className="text-xs text-zinc-500">
            Probabilité {report.probability.toFixed(0)} / 100
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-[var(--border)]">
          <Signal label="cos(KW, A)" value={report.signals.cos_kw_a} format="cos" />
          <Signal label="cos(KW, B)" value={report.signals.cos_kw_b} format="cos" />
          <Signal
            label="cos(A, B)"
            value={report.signals.cos_a_b}
            format="cos"
            highlight={report.signals.cos_a_b >= 0.82}
          />
          <Signal
            label="Jaccard headings"
            value={report.signals.jaccard_headings}
            format="pct"
          />
          <Signal label="n-gram overlap" value={report.signals.ngram_overlap} format="pct" />
          <Signal
            label="entité overlap"
            value={report.signals.entity_overlap}
            format="pct"
          />
        </div>
        <div className="px-5 py-3 text-[12px] text-zinc-400 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-[var(--border)]">
          <span>
            SERP A : <strong className="text-zinc-200">{report.signals.serp_a_position ?? "—"}</strong>
            {" · "}
            SERP B : <strong className="text-zinc-200">{report.signals.serp_b_position ?? "—"}</strong>
            {report.signals.serp_both_top20 && (
              <span className="ml-2 chip-warn">les deux en top 20</span>
            )}
          </span>
          {report.signals.canonical_resolved && (
            <span className="chip-ok">canonical déjà posé</span>
          )}
        </div>
      </section>

      {/* Action plan */}
      {report.merge_plan.length > 0 && (
        <section className="card overflow-hidden">
          <div className="card-section">
            <span className="label inline-flex items-center gap-2">
              <Icon name="edit" size={11} />
              Plan d'action — {ACTION_LABELS[report.action] || report.action}
            </span>
          </div>
          <ol className="divide-y divide-[var(--border)]">
            {report.merge_plan.map((step, i) => (
              <li key={i} className="px-5 py-3.5 flex items-start gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-accent-500/15 border border-accent-500/40 text-accent-200 text-xs font-semibold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm text-zinc-200 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Risks */}
      {report.risks.length > 0 && (
        <section className="card overflow-hidden border-amber-500/25">
          <div className="card-section bg-amber-500/[0.04]">
            <span className="label inline-flex items-center gap-2 text-amber-300">
              <Icon name="alert" size={11} />
              Risques à valider avant exécution
            </span>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {report.risks.map((r, i) => (
              <li key={i} className="px-5 py-3 text-sm text-zinc-200">
                {r}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Notes */}
      {report.notes.length > 0 && (
        <div className="text-xs text-zinc-500 space-y-0.5">
          {report.notes.map((n, i) => (
            <div key={i}>· {n}</div>
          ))}
        </div>
      )}

      <div className="text-[10px] text-zinc-600 text-right tabular-nums">
        Coût audit : ${report.cost.toFixed(4)}
      </div>
    </div>
  );
}

/* ----------------------------- Sub-components ----------------------------- */

function ScoreCircle({ value, severity }: { value: number; severity: number }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, value)) / 100) * c;
  const tone =
    value >= 70 ? "#ef4444" : value >= 45 ? "#f59e0b" : "#10b981";
  return (
    <div className="relative w-[88px] h-[88px] shrink-0">
      <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
        <circle cx="44" cy="44" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
        <circle
          cx="44"
          cy="44"
          r={r}
          stroke={tone}
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${dash} ${c}`}
          style={{
            transition: "stroke-dasharray 1s cubic-bezier(0.16,1,0.3,1), stroke 600ms",
            filter: `drop-shadow(0 0 12px ${tone}80)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums leading-none">
          {value.toFixed(0)}
        </span>
        <span className="text-[9px] uppercase tracking-wider text-zinc-400 mt-0.5">
          /100
        </span>
      </div>
      <div
        className="absolute -inset-1 rounded-full opacity-60 pointer-events-none"
        aria-hidden
        style={{
          background: `radial-gradient(circle, ${tone}30 0%, transparent 70%)`,
          filter: "blur(8px)",
          opacity: severity > 50 ? 0.7 : 0.3,
        }}
      />
    </div>
  );
}

function PageCard({
  label,
  probe,
  score,
  isWinner,
  gscPos,
}: {
  label: string;
  probe: Probe;
  score: WinnerScore;
  isWinner: boolean;
  gscPos: number | null;
}) {
  return (
    <div
      className={`relative card overflow-hidden ${
        isWinner ? "ring-1 ring-accent-500/45 shadow-[0_0_36px_-12px_var(--accent-glow)]" : ""
      }`}
    >
      {isWinner && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(124,132,255,0.9), transparent)",
          }}
        />
      )}
      <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold tracking-tight ${
              isWinner
                ? "bg-accent-500/20 border border-accent-500/45 text-accent-100"
                : "bg-white/5 border border-white/10 text-zinc-300"
            }`}
          >
            {label}
          </span>
          <a
            href={probe.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-zinc-400 hover:text-accent-200 truncate min-w-0 flex-1"
            title={probe.url}
          >
            {probe.url}
          </a>
          {isWinner && (
            <span className="chip-accent shrink-0">
              <Icon name="check" size={10} />
              Gagnante
            </span>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-bold tabular-nums">{score.total.toFixed(1)}</div>
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">
            score
          </div>
        </div>
      </div>

      {!probe.fetched ? (
        <div className="p-5 text-sm text-red-300">
          <Icon name="alert" size={12} className="inline mr-1.5" />
          Page non scrapable : {probe.error}
        </div>
      ) : (
        <div className="p-5 space-y-3.5">
          <div className="text-sm font-medium text-zinc-100 line-clamp-2">
            {probe.title || probe.h1 || "—"}
          </div>
          {probe.h1 && probe.h1 !== probe.title && (
            <div className="text-xs text-zinc-400">
              <span className="text-zinc-600">H1 :</span> {probe.h1}
            </div>
          )}

          {/* Score bars */}
          <div className="space-y-1.5 pt-1">
            <ScoreBar label="Autorité" value={score.authority} />
            <ScoreBar label="Performance" value={score.performance} />
            <ScoreBar label="Qualité" value={score.quality} />
            <ScoreBar label="Fraîcheur" value={score.freshness} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <Mini label="Mots" value={probe.word_count.toLocaleString("fr-FR")} />
            <Mini label="H2" value={probe.h2.length} />
            <Mini label="Liens int." value={probe.internal_links_in} />
            <Mini label="SERP" value={gscPos ?? "—"} />
          </div>

          {(probe.canonical_resolved || probe.noindex || probe.is_paginated) && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {probe.canonical_resolved && (
                <span className="chip-ok">canonical → autre URL</span>
              )}
              {probe.noindex && <span className="chip-warn">noindex</span>}
              {probe.is_paginated && <span className="chip-soft">paginé</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex justify-between text-[11px] text-zinc-400 mb-0.5">
        <span>{label}</span>
        <span className="tabular-nums">{v.toFixed(0)}</span>
      </div>
      <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            width: `${v}%`,
            background:
              "linear-gradient(90deg, rgba(124,132,255,0.6), rgba(124,132,255,1))",
          }}
        />
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white/[0.025] border border-white/[0.06] rounded-lg px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-zinc-100 mt-0.5">{value}</div>
    </div>
  );
}

function Signal({
  label,
  value,
  format,
  highlight,
}: {
  label: string;
  value: number;
  format: "cos" | "pct";
  highlight?: boolean;
}) {
  const display = format === "cos" ? value.toFixed(3) : `${(value * 100).toFixed(0)}%`;
  const bar = Math.max(0, Math.min(1, value));
  return (
    <div
      className={`px-4 py-3 bg-[var(--bg-base)] ${
        highlight ? "ring-1 ring-inset ring-accent-500/40 bg-accent-500/[0.05]" : ""
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="text-base font-semibold tabular-nums mt-1 mb-1.5">
        {display}
      </div>
      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${bar * 100}%`,
            background: highlight
              ? "linear-gradient(90deg, rgba(239,68,68,0.6), rgba(239,68,68,1))"
              : "linear-gradient(90deg, rgba(124,132,255,0.5), rgba(124,132,255,0.95))",
          }}
        />
      </div>
    </div>
  );
}

function GscBlock({
  label,
  gsc,
  setGsc,
}: {
  label: string;
  gsc: GscIn;
  setGsc: (g: GscIn) => void;
}) {
  return (
    <div className="card p-4 space-y-2.5">
      <div className="label">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Clics" small>
          <input
            type="number"
            min={0}
            value={gsc.clicks ?? ""}
            onChange={(e) =>
              setGsc({
                ...gsc,
                clicks: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className="input"
          />
        </Field>
        <Field label="Impressions" small>
          <input
            type="number"
            min={0}
            value={gsc.impressions ?? ""}
            onChange={(e) =>
              setGsc({
                ...gsc,
                impressions: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className="input"
          />
        </Field>
        <Field label="Position moy." small>
          <input
            type="number"
            min={0}
            step={0.1}
            value={gsc.position ?? ""}
            onChange={(e) =>
              setGsc({
                ...gsc,
                position: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className="input"
          />
        </Field>
        <Field label="CTR (0-1)" small>
          <input
            type="number"
            min={0}
            max={1}
            step={0.001}
            value={gsc.ctr ?? ""}
            onChange={(e) =>
              setGsc({
                ...gsc,
                ctr: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className="input"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  help,
  full,
  small,
  children,
}: {
  label: string;
  help?: string;
  full?: boolean;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block space-y-1 ${full ? "sm:col-span-2" : ""}`}>
      <span
        className={`label inline-flex items-center ${
          small ? "text-[10px]" : ""
        }`}
      >
        {label}
        {help && <HelpIcon content={help} />}
      </span>
      {children}
    </label>
  );
}
