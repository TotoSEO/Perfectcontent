"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Icon } from "@/components/Icon";
import {
  SemanticChart,
  Term,
  TermStat,
  optimizationScore,
  dangerScore,
} from "@/components/SemanticChart";
import { countSurfaces, htmlToPlain, tokenize } from "@/lib/stopwords";

type Analysis = {
  id: string;
  keyword: string;
  location_code: number;
  language_code: string;
  status: "queued" | "running" | "done" | "failed";
  error: string | null;
  cost: number;
  created_at: string;
  updated_at: string;
  serp_raw: { organic_top7?: { url: string; title: string }[] } | null;
  related_keywords: { keyword: string }[] | null;
  competitors: unknown[] | null;
  common_subthemes: string[] | null;
  rare_subthemes: string[] | null;
  entities: string[] | null;
  content_gaps: string[] | null;
  term_targets: Term[] | null;
  draft_html: string | null;
};

export default function SemanticAnalysisDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, mutate } = useSWR<Analysis>(
    id ? `/srv/semantic-analyses/${id}` : null,
    fetcher,
    {
      // Poll while running so the user sees the analysis become ready
      refreshInterval: (latest) =>
        latest?.status === "running" || latest?.status === "queued" ? 3000 : 0,
    },
  );

  const targets = data?.term_targets || [];
  const [text, setText] = useState<string>("");
  const initialised = useRef(false);
  const runKicked = useRef(false);

  // Hydrate the editor with the persisted draft once the analysis loads
  useEffect(() => {
    if (!data || initialised.current) return;
    initialised.current = true;
    if (data.draft_html) setText(htmlToPlainOrText(data.draft_html));
  }, [data]);

  // Safety net: if the row is still 'queued' on arrival, the listing page's
  // fire-and-forget run might have been killed by the serverless cold-start
  // / network. Kick it again from here. Idempotent — re-running on a queued
  // or failed row is fine.
  useEffect(() => {
    if (!data || !id || runKicked.current) return;
    if (data.status === "queued") {
      runKicked.current = true;
      api(`/srv/semantic-analyses/${id}/run`, { method: "POST" }).catch(() => {});
    }
  }, [data, id]);

  // Debounced persistence of the draft
  useEffect(() => {
    if (!id || !initialised.current) return;
    const t = setTimeout(() => {
      api(`/srv/semantic-analyses/${id}`, {
        method: "PATCH",
        json: { draft_html: text },
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [text, id]);

  // Live counts — debounce by 200ms so typing fast doesn't run the regex
  // sweep on every keystroke
  const [debounced, setDebounced] = useState(text);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 180);
    return () => clearTimeout(t);
  }, [text]);

  // Build a Map<surface, count> once, then resolve each target's surfaces
  // against it. We use the same tokenizer the generator uses (mirror of
  // backend term_freq).
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    if (!debounced) return m;
    // For unigrams: tokenize once, increment map.
    for (const w of tokenize(debounced)) {
      m.set(w, (m.get(w) || 0) + 1);
    }
    return m;
  }, [debounced]);

  const stats = useMemo(() => {
    if (!targets.length) return [];
    // For unigrams use the count map directly; for n-grams fall back to
    // countSurfaces because they aren't in the token map.
    return targets.map((t) => {
      let count = 0;
      const surfaces = t.surface_forms?.length ? t.surface_forms : [t.term];
      if (t.is_ngram) {
        count = countSurfaces(debounced, surfaces);
      } else {
        for (const s of surfaces) count += counts.get(s.toLowerCase()) || 0;
      }
      const target = Math.max(0.5, t.target);
      const ratio = count / target;
      let status: "missing" | "low" | "ok" | "over" | "danger" = "ok";
      if (count === 0) status = "missing";
      else if (count < t.min) status = "low";
      else if (count > t.max && ratio <= 3) status = "over";
      else if (ratio > 3) status = "danger";
      return { ...t, count, ratio, status };
    });
  }, [targets, counts, debounced]);

  const opti = useMemo(() => optimizationScore(stats), [stats]);
  const danger = useMemo(() => dangerScore(stats), [stats]);
  const wordCount = useMemo(
    () => (debounced ? debounced.split(/\s+/).filter(Boolean).length : 0),
    [debounced],
  );

  if (!id) return null;

  return (
    <div className="page-shell space-y-5 animate-fadein">
      <div>
        <Link
          href="/semantic-analysis"
          className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
        >
          <Icon name="arrow-left" size={11} />
          Toutes les analyses
        </Link>
      </div>

      {!data ? (
        <div className="card p-12 text-center text-zinc-500 text-sm">
          Chargement…
        </div>
      ) : (
        <>
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="eyebrow mb-2">Analyse sémantique</div>
              <h1 className="h-page truncate">{data.keyword}</h1>
              <p className="h-sub">
                {targets.length > 0
                  ? `${targets.length} termes BM25 cible · ${data.language_code.toUpperCase()} · ${data.location_code}`
                  : "Pipeline en cours…"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ExplainerButton />
              {data.status === "done" && <RetryButton id={id} mutate={mutate} />}
            </div>
          </header>

          {data.status === "running" || data.status === "queued" ? (
            <RunningPanel keyword={data.keyword} />
          ) : data.status === "failed" ? (
            <FailedPanel error={data.error} id={id} mutate={mutate} />
          ) : (
            <>
              {/* SCORES */}
              <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <ScoreCard
                  label="Optimisation"
                  value={opti}
                  max={120}
                  goodFrom={75}
                  goodTo={110}
                  tone="emerald"
                  hint="Σ importance × min(1.2, count / cible). Vise 90-110."
                />
                <ScoreCard
                  label="Sur-optimisation"
                  value={danger}
                  max={100}
                  goodFrom={0}
                  goodTo={20}
                  inverted
                  tone="red"
                  hint="Pénalité quadratique au-delà de la limite max de chaque terme. Reste sous 25."
                />
                <div className="card p-4 flex flex-col justify-center">
                  <div className="label">Volume rédigé</div>
                  <div className="text-2xl font-bold tabular-nums tracking-tight text-zinc-50 mt-1">
                    {wordCount.toLocaleString("fr-FR")} mots
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1">
                    {stats.filter((s) => s.status === "ok").length} / {stats.length} termes en zone verte
                  </div>
                </div>
              </section>

              {/* PRIORITY MISSING TERMS — actionable shortlist */}
              <MissingTermsStrip stats={stats} />

              {/* CHART */}
              <section className="card p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="label">Optimisation par terme</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      Termes triés par importance · zone verte = bonne couverture
                    </div>
                  </div>
                  <Legend />
                </div>
                <SemanticChart stats={stats} height={380} />
              </section>

              {/* EDITOR + TERM LIST */}
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 card overflow-hidden flex flex-col">
                  <div className="card-section">
                    <span className="label">Ton contenu</span>
                    <span className="text-xs text-zinc-500 tabular-nums">
                      {wordCount} mots
                    </span>
                  </div>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Colle ton contenu ici, ou tape directement. Les compteurs et le graphique se mettent à jour en temps réel."
                    spellCheck={false}
                    className="w-full bg-transparent px-5 py-4 text-[14px] leading-relaxed text-zinc-100 focus:outline-none resize-none flex-1"
                    style={{ minHeight: 460 }}
                  />
                </div>
                <div className="card overflow-hidden">
                  <div className="card-section">
                    <span className="label">Termes cible</span>
                    <span className="text-xs text-zinc-500 tabular-nums">
                      {stats.length}
                    </span>
                  </div>
                  <ul className="divide-y divide-[var(--border)] max-h-[600px] overflow-y-auto">
                    {stats.map((s) => (
                      <TermRow key={s.term} stat={s} />
                    ))}
                  </ul>
                </div>
              </section>

              {/* SECONDARY DATA */}
              {(data.entities?.length || data.common_subthemes?.length || data.content_gaps?.length) && (
                <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <ChipsBlock title="Entités détectées" items={data.entities || []} />
                  <ChipsBlock title="Sous-thèmes communs" items={data.common_subthemes || []} />
                  <ChipsBlock title="Content gaps" items={data.content_gaps || []} />
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ----------------------------- Sub-components ----------------------------- */

function htmlToPlainOrText(s: string): string {
  // The draft can be plain text (we save raw textarea); but if a user
  // pasted HTML we strip it.
  if (typeof window === "undefined") return s;
  if (!s.includes("<")) return s;
  return htmlToPlain(s);
}

function ScoreCard({
  label,
  value,
  max,
  goodFrom,
  goodTo,
  tone,
  hint,
  inverted,
}: {
  label: string;
  value: number;
  max: number;
  goodFrom: number;
  goodTo: number;
  tone: "emerald" | "red";
  hint: string;
  inverted?: boolean;
}) {
  const inGood = value >= goodFrom && value <= goodTo;
  const color = inverted
    ? value > goodTo
      ? "#ef4444"
      : value > goodFrom + 10
      ? "#f59e0b"
      : "#10b981"
    : value < goodFrom - 25
    ? "#ef4444"
    : value < goodFrom
    ? "#f59e0b"
    : value > goodTo
    ? "#f97316"
    : "#10b981";

  const pct = Math.min(1, value / max);
  const r = 32;
  const c = 2 * Math.PI * r;
  const dash = pct * c;

  return (
    <div className="card p-4 relative overflow-hidden">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px opacity-50"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />
      <div className="flex items-start gap-4">
        <div className="relative w-[80px] h-[80px] shrink-0">
          <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
            <circle cx="40" cy="40" r={r} stroke="rgba(255,255,255,0.07)" strokeWidth="6" fill="none" />
            <circle
              cx="40"
              cy="40"
              r={r}
              stroke={color}
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${dash} ${c}`}
              style={{
                transition: "stroke-dasharray 700ms cubic-bezier(0.16,1,0.3,1), stroke 400ms",
                filter: `drop-shadow(0 0 10px ${color}80)`,
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold tabular-nums leading-none">{value}</span>
            <span className="text-[9px] uppercase tracking-wider text-zinc-500 mt-0.5">
              /{max}
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="label">{label}</div>
          <div
            className="text-[11px] mt-1 font-semibold tracking-wide"
            style={{ color }}
          >
            {tone === "emerald"
              ? inGood
                ? "BONNE OPTIMISATION"
                : value < goodFrom
                ? "SOUS-OPTIMISÉ"
                : "SUR-OPTIMISÉ"
              : inGood
              ? "AUCUN DANGER"
              : value > goodTo
              ? "DANGER"
              : "ATTENTION"}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1.5 leading-snug">{hint}</p>
        </div>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="hidden sm:flex items-center gap-3 text-[10px] text-zinc-400">
      <LegendItem color="rgba(239,68,68,0.4)" label="sous-opti" />
      <LegendItem color="rgba(16,185,129,0.55)" label="bonne opti" />
      <LegendItem color="rgba(245,158,11,0.55)" label="sur-opti" />
      <LegendItem color="rgba(239,68,68,0.6)" label="danger" />
    </div>
  );
}
function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3 h-3 rounded" style={{ background: color }} />
      <span>{label}</span>
    </span>
  );
}

function TermRow({ stat }: { stat: TermStat }) {
  const tones = {
    missing: "text-red-300",
    low: "text-amber-300",
    ok: "text-emerald-300",
    over: "text-orange-300",
    danger: "text-red-300",
  } as const;

  // Mini fill bar within [0, max+1]
  const cap = Math.max(stat.max + 1, stat.target * 2);
  const pct = Math.min(1, stat.count / cap);
  const barColor =
    stat.status === "ok"
      ? "#10b981"
      : stat.status === "low" || stat.status === "missing"
      ? "#ef4444"
      : stat.status === "over"
      ? "#f97316"
      : "#ef4444";

  // Surface forms beyond the canonical — what the count really sums up
  const otherSurfaces = (stat.surface_forms || [])
    .filter((s) => s.toLowerCase() !== stat.term.toLowerCase())
    .slice(0, 4);

  const allSurfacesTitle = (stat.surface_forms || [stat.term]).join(", ");

  return (
    <li
      className="px-4 py-2.5"
      title={
        otherSurfaces.length > 0
          ? `Surfaces comptées : ${allSurfacesTitle}`
          : undefined
      }
    >
      <div className="flex items-baseline justify-between gap-2 mb-0.5">
        <span className="text-[13px] text-zinc-100 font-medium truncate flex items-center gap-1.5 min-w-0">
          {stat.is_ngram && (
            <span className="text-[8.5px] uppercase tracking-wider text-zinc-500 bg-white/[0.04] border border-white/[0.06] px-1 rounded shrink-0">
              n-gram
            </span>
          )}
          <span className="truncate">{stat.term}</span>
        </span>
        <span className={`text-[11px] tabular-nums shrink-0 ${tones[stat.status]}`}>
          {stat.count}
          <span className="text-zinc-600">
            {" / "}
            {Math.max(1, Math.round(stat.target))}
          </span>
        </span>
      </div>
      {otherSurfaces.length > 0 && (
        <div className="text-[10px] text-zinc-500 truncate mb-1">
          + {otherSurfaces.join(", ")}
        </div>
      )}
      <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden relative mt-1">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct * 100}%`, background: barColor }}
        />
        {/* Min/max ticks */}
        <span
          className="absolute top-0 h-full w-px bg-white/30"
          style={{ left: `${Math.min(100, (stat.min / cap) * 100)}%` }}
          title={`min ${stat.min}`}
        />
        <span
          className="absolute top-0 h-full w-px bg-white/30"
          style={{ left: `${Math.min(100, (stat.max / cap) * 100)}%` }}
          title={`max ${stat.max}`}
        />
      </div>
    </li>
  );
}

function ChipsBlock({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="card p-4">
      <div className="label mb-2.5">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 24).map((it, i) => (
          <span key={i} className="chip">
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

function RunningPanel({ keyword }: { keyword: string }) {
  const PHASES = [
    "Récupération de la SERP DataForSEO",
    "Scraping des 7 premiers résultats",
    "Parsing structurel des concurrents",
    "Calcul BM25 sur 40 termes",
    "Détection d'entités et sous-thèmes Claude",
  ];
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setPhase((p) => Math.min(PHASES.length - 1, p + 1)),
      6000,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="card overflow-hidden relative">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(124,132,255,1), transparent)",
          animation: "shine 1.6s linear infinite",
        }}
      />
      <div className="p-8 space-y-5">
        <div className="text-center space-y-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-accent-200">
            Pipeline en cours
          </div>
          <div className="text-lg font-semibold">{keyword}</div>
          <div className="text-xs text-zinc-500">
            ~30-90 s — tu peux fermer cet onglet, on persiste tout en BD.
          </div>
        </div>
        <ul className="space-y-2 max-w-md mx-auto">
          {PHASES.map((p, i) => {
            const done = i < phase;
            const active = i === phase;
            return (
              <li
                key={i}
                className={`flex items-center gap-2.5 text-sm transition-colors ${
                  done
                    ? "text-zinc-400"
                    : active
                    ? "text-accent-200"
                    : "text-zinc-600"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                    done
                      ? "bg-accent-500/20 border border-accent-500/40 text-accent-200"
                      : active
                      ? "bg-accent-500/15 border border-accent-500/40 text-accent-200 animate-pulse"
                      : "bg-white/[0.03] border border-white/[0.08]"
                  }`}
                >
                  {done ? "✓" : active ? "·" : i + 1}
                </span>
                {p}
              </li>
            );
          })}
        </ul>
      </div>
      <style jsx>{`
        @keyframes shine {
          from {
            transform: translateX(-100%);
          }
          to {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}

function FailedPanel({
  error,
  id,
  mutate,
}: {
  error: string | null;
  id: string;
  mutate: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function retry() {
    setBusy(true);
    try {
      await api(`/srv/semantic-analyses/${id}/run`, { method: "POST" });
      mutate();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card border-red-700/40 bg-red-500/[0.03] p-6 space-y-3">
      <div className="flex items-center gap-2 text-red-300">
        <Icon name="alert" size={14} />
        <span className="font-semibold text-sm">L'analyse a échoué.</span>
      </div>
      {error && <pre className="text-xs text-zinc-400 whitespace-pre-wrap">{error}</pre>}
      <button onClick={retry} disabled={busy} className="btn-secondary px-3 py-2 text-xs">
        {busy ? <Icon name="spinner" size={12} /> : <Icon name="refresh" size={12} />}
        Relancer
      </button>
    </div>
  );
}

function RetryButton({ id, mutate }: { id: string; mutate: () => void }) {
  const [busy, setBusy] = useState(false);
  async function retry() {
    if (!confirm("Relancer l'analyse ? La SERP sera re-fetchée si le cache (24h) est expiré.")) return;
    setBusy(true);
    try {
      await api(`/srv/semantic-analyses/${id}/run`, { method: "POST" });
      mutate();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button onClick={retry} disabled={busy} className="btn-secondary px-3 py-2 text-xs">
      {busy ? <Icon name="spinner" size={12} /> : <Icon name="refresh" size={12} />}
      Re-analyser
    </button>
  );
}

/* ----------------------------- Missing terms strip ----------------------------- */

function MissingTermsStrip({ stats }: { stats: TermStat[] }) {
  const missing = useMemo(
    () =>
      stats
        .filter((s) => s.count === 0)
        .sort((a, b) => (b.importance || 0) - (a.importance || 0))
        .slice(0, 12),
    [stats],
  );
  const lowOnes = useMemo(
    () =>
      stats
        .filter((s) => s.count > 0 && s.count < s.min)
        .sort((a, b) => (b.importance || 0) - (a.importance || 0))
        .slice(0, 8),
    [stats],
  );

  if (missing.length === 0 && lowOnes.length === 0) {
    return (
      <div className="card overflow-hidden border-emerald-700/30 bg-emerald-500/[0.02]">
        <div className="px-5 py-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-sm text-emerald-200/90">
            Tous les termes prioritaires sont couverts. Tu peux affiner sur le tableau
            ci-dessous pour ramener les autres en zone verte.
          </span>
        </div>
      </div>
    );
  }

  async function copyTerm(t: string) {
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      /* noop */
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="card-section">
        <span className="label inline-flex items-center gap-2">
          <Icon name="alert" size={11} className="text-amber-400" />
          Termes prioritaires à intégrer
        </span>
        <span className="text-xs text-zinc-500">
          {missing.length} manquant{missing.length > 1 ? "s" : ""}
          {lowOnes.length > 0 && (
            <>
              {" · "}
              {lowOnes.length} sous-utilisé{lowOnes.length > 1 ? "s" : ""}
            </>
          )}
        </span>
      </div>
      <div className="px-4 py-3 space-y-2.5">
        {missing.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {missing.map((m) => (
              <button
                key={m.term}
                onClick={() => copyTerm(m.term)}
                title="Copier le terme"
                className="group relative chip border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/15 transition-colors"
              >
                {m.is_ngram && (
                  <span className="text-[8px] uppercase tracking-wider opacity-60 mr-0.5">
                    n-gram
                  </span>
                )}
                {m.term}
                <span className="ml-1 text-[9px] tabular-nums opacity-60">
                  ×{Math.max(1, Math.round(m.target))}
                </span>
                <Icon name="copy" size={9} className="ml-1 opacity-50 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        )}
        {lowOnes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {lowOnes.map((m) => (
              <button
                key={m.term}
                onClick={() => copyTerm(m.term)}
                title="Copier le terme"
                className="group chip border-amber-500/35 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15 transition-colors"
              >
                {m.term}
                <span className="ml-1 text-[9px] tabular-nums opacity-70">
                  {m.count}/{Math.max(1, Math.round(m.target))}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ----------------------------- Explainer modal ----------------------------- */

function ExplainerButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-secondary px-3 py-2 text-xs"
        title="Voir comment on calcule"
      >
        <Icon name="info" size={12} />
        Comment ça marche
      </button>
      {open && <ExplainerModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ExplainerModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto card-elevated"
      >
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between sticky top-0 bg-[var(--bg-elevated)]/95 backdrop-blur-md z-10">
          <h3 className="font-semibold text-base">Comment fonctionne l'analyse</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-lg leading-none">
            ×
          </button>
        </div>
        <div className="px-6 py-5 space-y-5 text-[13.5px] leading-relaxed text-zinc-300">
          <ExplainerSection title="1. Récupération de la SERP" badge="DataForSEO">
            <p>
              Sur ton mot-clé, on appelle DataForSEO Google Organic pour récupérer
              les <strong>7 premiers résultats organiques</strong> (top-7), avec
              leurs URLs, titres et descriptions, plus les People Also Ask et les
              SERP features. En parallèle on tire jusqu'à <strong>30 mots-clés
              associés</strong> via DataForSEO Labs (intent + volume).
            </p>
            <p className="text-xs text-zinc-500">
              Cache 24 h sur (mot-clé, location, langue) — re-runner ne re-facture pas.
            </p>
          </ExplainerSection>

          <ExplainerSection title="2. Scraping des concurrents" badge="Firecrawl + Jina">
            <p>
              Chaque URL est scrappée en parallèle. <strong>Firecrawl</strong>
              en priorité (10 s timeout) puis <strong>Jina r.jina.ai</strong>
              en fallback. Tolérance <strong>4 sur 7</strong> minimum : si plus
              de 3 pages échouent, l'analyse s'arrête proprement.
            </p>
            <p>
              Un <strong>quality-gate</strong> rejette les bot-blocks (Cloudflare,
              captcha, paywall, JS-shell), les pages &lt; 400 caractères de prose,
              et les pages &gt; 60 % de liens (menus / index). Comme ça aucune fausse
              donnée ne pollue le tableau de termes.
            </p>
          </ExplainerSection>

          <ExplainerSection title="3. Parsing structurel" badge="BeautifulSoup">
            <p>
              On retire le boilerplate (nav, footer, sidebar, share, related,
              cookie banners, sponsorisé) puis on extrait la <strong>zone de
              contenu principale</strong> (article, main, role=main, ou
              .post-content / .entry-content). Ça permet de compter mots / H2 /
              listes / tableaux uniquement sur le contenu éditorial — pas sur
              les menus.
            </p>
          </ExplainerSection>

          <ExplainerSection title="4. Tokenisation française" badge="regex + stemmer maison">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Tokenisation : regex Unicode FR, longueur min 3 caractères, on
                vire les apostrophes/tirets de bord.
              </li>
              <li>
                Stop-words : 200+ mots FR + EN + 80 termes <em>web noise</em>
                (https, com, html, menu, cookie, sitemap, …) — la liste est
                identique entre backend et frontend pour que le compteur live
                soit cohérent.
              </li>
              <li>
                Stemmer FR maison « longest-suffix-first » : 90+ suffixes (issements,
                ations, ements, ables, eurs, ières, …), 2 passes pour collapser
                pluriel → singulier → racine. Garde min 4 lettres en racine.
              </li>
              <li>
                N-grams 2 et 3 : bi-grams (les 2 tokens doivent porter du sens),
                tri-grams autorisent un stop-word au milieu (« agence DE
                marketing »).
              </li>
            </ul>
          </ExplainerSection>

          <ExplainerSection title="5. Score BM25-Okapi" badge="cœur de l'algo">
            <p>
              Pour chaque candidat (uni + bi + tri), on calcule un score{" "}
              <strong>BM25-Okapi</strong> sommé sur le corpus :
            </p>
            <pre className="text-[11.5px] leading-snug bg-[#0e0e11] border border-[#25252a] rounded-lg p-3 overflow-x-auto font-mono text-zinc-300">
{`idf(t)   = log( (N − df + 0.5) / (df + 0.5) + 1 )
tf_sat   = tf · (k1 + 1) / (tf + k1 · (1 − b + b · |d| / avgdl))
bm25     = Σ_d  idf(t) · tf_sat(t, d)
           avec k1=1.5, b=0.75 (paramètres standards)`}
            </pre>
            <p>
              <strong>BM25 vs TF-IDF</strong> : BM25 sature la fréquence (un mot
              répété 50 fois ne pèse pas 50× plus qu'un mot répété 5 fois) et
              normalise par la longueur du document. C'est ce que les SOTA
              comme YourTextGuru utilisent.
            </p>
            <p>Puis on applique 3 pondérations métier :</p>
            <pre className="text-[11.5px] leading-snug bg-[#0e0e11] border border-[#25252a] rounded-lg p-3 overflow-x-auto font-mono text-zinc-300">
{`importance = bm25
           × (0.3 + 0.7 · presence)        ← favorise les termes qui
                                              apparaissent dans BEAUCOUP
                                              de concurrents, pas qu'un seul
           × heading_boost (×1.4 si dans un H1/H2 concurrent)
           × ngram_bias    (×1.15 bigram, ×1.25 trigram)`}
            </pre>
          </ExplainerSection>

          <ExplainerSection title="6. Filtres anti-bruit" badge="précision">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>df &ge; 2</strong> : doit apparaître dans au moins 2 docs
                du corpus.
              </li>
              <li>
                <strong>presence &ge; 25 %</strong> : présent dans au moins ¼
                des concurrents — sinon ce n'est pas un terme « SEO consensus ».
              </li>
              <li>
                <strong>vowel ratio &ge; 20 %</strong> + longueur 4-22 : drop les
                artefacts genre « xxx », « hhh ».
              </li>
              <li>
                <strong>variant exclusion</strong> : on retire le mot-clé lui-même
                et ses variantes proches (sinon « cafetière » serait toujours en
                tête, ce n'est pas une cible utile).
              </li>
              <li>
                <strong>skew filter</strong> : si max &ge; 10 × moyenne, c'est un
                outlier d'un seul site → drop.
              </li>
              <li>
                <strong>density floor</strong> : si médiane &lt; 1 ET max &lt; 2
                → trop sporadique, drop.
              </li>
            </ul>
          </ExplainerSection>

          <ExplainerSection title="7. Cibles et plages" badge="par terme">
            <p>Pour chaque terme retenu on stocke :</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>cible (target)</strong> = <strong>médiane</strong> des
                fréquences sur les concurrents (médiane plutôt que moyenne →
                robuste aux outliers).
              </li>
              <li>
                <strong>min</strong> = la plus petite fréquence vue sur un
                concurrent qui l'utilise.
              </li>
              <li>
                <strong>max</strong> = la plus grande. Au-delà = sur-utilisation.
              </li>
              <li>
                <strong>importance</strong> = score normalisé 0-1, top du
                classement = 1.
              </li>
              <li>
                <strong>surface_forms</strong> = toutes les formes vues
                (« cafetière », « cafetières ») — c'est avec ça que ton compteur
                live retrouve les occurrences dans ton texte, sans avoir besoin
                de stemmer côté frontend.
              </li>
            </ul>
          </ExplainerSection>

          <ExplainerSection title="8. Statut par terme dans l'éditeur" badge="live">
            <pre className="text-[11.5px] leading-snug bg-[#0e0e11] border border-[#25252a] rounded-lg p-3 font-mono text-zinc-300">
{`MISSING   count = 0                   (rouge — à ajouter)
LOW       0 < count < min              (orange — sous-utilisé)
OK        min ≤ count ≤ max            (vert — bon)
OVER      max < count ≤ 3 × cible      (orange — sur-utilisé)
DANGER    count > 3 × cible            (rouge — risque keyword stuffing)`}
            </pre>
          </ExplainerSection>

          <ExplainerSection title="9. Score d'optimisation (0-120)" badge="vise 90-110">
            <pre className="text-[11.5px] leading-snug bg-[#0e0e11] border border-[#25252a] rounded-lg p-3 font-mono text-zinc-300">
{`opti = 100 × Σ ( importance_t × min(1.2, count_t / target_t) )
                     ───────────────────────────────────────────
                                  Σ importance_t

→ contribue proportionnellement à l'importance du terme
→ plafonne à 1.2 par terme pour ne pas récompenser le sur-emploi
→ score 100 = chaque terme est ≥ sa cible. 90-110 = zone idéale.`}
            </pre>
          </ExplainerSection>

          <ExplainerSection title="10. Score de sur-optimisation (0-100)" badge="vise &lt; 25">
            <pre className="text-[11.5px] leading-snug bg-[#0e0e11] border border-[#25252a] rounded-lg p-3 font-mono text-zinc-300">
{`pour chaque terme avec count > max :
  x = (count − max) / max
  pen = min(1, x²)            ← saturating quadratique

danger = 100 × Σ (importance_t × pen_t) / Σ importance_t

→ 0 quand tous les termes restent dans leur plage
→ croît rapidement dès qu'on dépasse max sur des termes importants
→ &gt; 25 = signal de keyword stuffing potentiel.`}
            </pre>
          </ExplainerSection>

          <ExplainerSection title="11. Entités et sous-thèmes (Claude Sonnet)">
            <p>
              En plus de BM25, on appelle Claude Sonnet sur la fiche structurée
              des concurrents pour extraire :
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Sous-thèmes communs</strong> (présents dans la majorité
                des concurrents) — à couvrir.
              </li>
              <li>
                <strong>Sous-thèmes rares</strong> (1-2 concurrents seulement) —
                opportunités de différenciation.
              </li>
              <li>
                <strong>Entités nommées</strong> (marques, produits, personnes,
                lieux).
              </li>
              <li>
                <strong>Content gaps</strong> — questions et angles que les
                concurrents oublient.
              </li>
            </ul>
            <p className="text-xs text-zinc-500">
              Cette étape est <strong>tolérante aux pannes</strong> : si Claude
              échoue, l'analyse se livre quand même avec les 40 termes BM25, qui
              sont la donnée actionnable principale.
            </p>
          </ExplainerSection>

          <ExplainerSection title="12. Cohérence backend ↔ frontend" badge="zéro drift">
            <p>
              Le compteur live de l'éditeur utilise le <strong>même
              tokenizer</strong>, la <strong>même liste de stop-words</strong>{" "}
              et le <strong>même comptage par surface</strong> que le backend.
              Le frontend ne stemme pas — il match les surfaces exactes que le
              backend a vues dans le corpus, donc « cafetière » et « cafetières »
              sont comptés ensemble si les deux ont été vus. Pas de divergence
              possible entre ce que l'algo cible et ce que ton score affiche.
            </p>
          </ExplainerSection>
        </div>
      </div>
    </div>
  );
}

function ExplainerSection({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h4 className="text-[13px] font-semibold text-zinc-100 inline-flex items-center gap-2">
        {title}
        {badge && (
          <span className="text-[9px] uppercase tracking-[0.14em] text-accent-200 bg-accent-500/15 border border-accent-500/30 px-1.5 py-0.5 rounded">
            {badge}
          </span>
        )}
      </h4>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
