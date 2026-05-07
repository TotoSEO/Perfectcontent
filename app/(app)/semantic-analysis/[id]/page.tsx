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

  // Hydrate the editor with the persisted draft once the analysis loads
  useEffect(() => {
    if (!data || initialised.current) return;
    initialised.current = true;
    if (data.draft_html) setText(htmlToPlainOrText(data.draft_html));
  }, [data]);

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
            {data.status === "done" && (
              <div className="flex items-center gap-2">
                <RetryButton id={id} mutate={mutate} />
              </div>
            )}
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

  return (
    <li className="px-4 py-2.5">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[13px] text-zinc-100 font-medium truncate flex items-center gap-1.5">
          {stat.is_ngram && (
            <span className="text-[8.5px] uppercase tracking-wider text-zinc-500 bg-white/[0.04] border border-white/[0.06] px-1 rounded">
              n-gram
            </span>
          )}
          {stat.term}
        </span>
        <span className={`text-[11px] tabular-nums shrink-0 ${tones[stat.status]}`}>
          {stat.count}
          <span className="text-zinc-600">
            {" / "}
            {Math.round(stat.target)}
          </span>
        </span>
      </div>
      <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden relative">
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
