"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";

type Competitor = {
  rank: number;
  url: string | null;
  title: string | null;
  h1: string | null;
  h2: string[];
  h3_count: number | null;
  word_count: number | null;
  paragraphs_count: number | null;
  lists_count: number | null;
  tables_count: number | null;
  images_with_alt: number | null;
  images_without_alt: number | null;
  has_faq_schema: boolean | null;
  has_article_schema: boolean | null;
  has_product_schema: boolean | null;
  author: string | null;
  quality: number | null;
  scrape_source: string | null;
  scrape_error: string | null;
  markdown: string;
  angle: string | null;
  strength: string | null;
  weakness: string | null;
};

type ScrapeFailure = {
  url: string | null;
  error: string | null;
  source: string | null;
};

type SerpResponse = {
  job_id: string | null;
  keyword?: string;
  competitors: Competitor[];
  organic_top7: { url: string; title: string; description?: string }[];
  scrape_failures: ScrapeFailure[];
  paa: string[];
  format: { format: string | null; votes: Record<string, number>; brief: string };
  related: string[];
  common_subthemes: string[];
  rare_subthemes: string[];
  entities: string[];
  content_gaps: string[];
};

type Tab = "competitors" | "paa" | "format" | "semantic" | "related";

export function SerpAnalysisButton({ contentId }: { contentId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-400 hover:text-white"
        title="Voir ce qui a été extrait de la SERP"
      >
        SERP
      </button>
      {open && <SerpModal contentId={contentId} onClose={() => setOpen(false)} />}
    </>
  );
}

function SerpModal({ contentId, onClose }: { contentId: string; onClose: () => void }) {
  const { data, error } = useSWR<SerpResponse>(
    `/srv/contents/${contentId}/serp`,
    fetcher,
  );
  const [tab, setTab] = useState<Tab>("competitors");

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
        className="w-full max-w-6xl max-h-[92vh] flex flex-col card overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-[#25252a] flex items-baseline justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold">Analyse SERP</h3>
            {data?.keyword && (
              <span className="chip border-[#34343b] text-zinc-400 bg-[#0e0e11]">
                {data.keyword}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-lg leading-none">
            ×
          </button>
        </div>

        {error && (
          <div className="p-5 text-sm text-red-300">Erreur : {String(error)}</div>
        )}
        {!data && !error && (
          <div className="p-10 text-sm text-zinc-500 text-center">Chargement…</div>
        )}

        {data && (
          <>
            <div className="flex border-b border-[#25252a] bg-[#0e0e11] overflow-x-auto">
              <TabBtn id="competitors" tab={tab} setTab={setTab}>
                Concurrents ({data.competitors.length}
                {data.scrape_failures.length > 0 && (
                  <>
                    {" "}
                    <span className="text-amber-400">
                      / {data.scrape_failures.length} skip
                    </span>
                  </>
                )}
                )
              </TabBtn>
              <TabBtn id="paa" tab={tab} setTab={setTab}>
                People Also Ask ({data.paa.length})
              </TabBtn>
              <TabBtn id="format" tab={tab} setTab={setTab}>
                Format détecté
              </TabBtn>
              <TabBtn id="semantic" tab={tab} setTab={setTab}>
                Sémantique
              </TabBtn>
              <TabBtn id="related" tab={tab} setTab={setTab}>
                Mots-clés associés ({data.related.length})
              </TabBtn>
            </div>
            <div className="flex-1 overflow-hidden">
              {tab === "competitors" && (
                <CompetitorsPane
                  competitors={data.competitors}
                  failures={data.scrape_failures}
                />
              )}
              {tab === "paa" && <PaaPane paa={data.paa} />}
              {tab === "format" && <FormatPane fmt={data.format} />}
              {tab === "semantic" && (
                <SemanticPane
                  common={data.common_subthemes}
                  rare={data.rare_subthemes}
                  entities={data.entities}
                  gaps={data.content_gaps}
                />
              )}
              {tab === "related" && <RelatedPane related={data.related} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TabBtn({
  id,
  tab,
  setTab,
  children,
}: {
  id: Tab;
  tab: Tab;
  setTab: (t: Tab) => void;
  children: React.ReactNode;
}) {
  const active = tab === id;
  return (
    <button
      onClick={() => setTab(id)}
      className={`px-4 py-2.5 text-xs uppercase tracking-wider whitespace-nowrap transition-colors border-b-2 ${
        active ? "border-accent-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function CompetitorsPane({
  competitors,
  failures,
}: {
  competitors: Competitor[];
  failures: ScrapeFailure[];
}) {
  const [selected, setSelected] = useState<number>(0);
  const current = competitors[selected];

  if (competitors.length === 0 && failures.length === 0) {
    return <div className="p-10 text-sm text-zinc-500 text-center">Aucun concurrent extrait.</div>;
  }

  return (
    <div className="flex h-full">
      <div className="w-72 border-r border-[#25252a] overflow-y-auto bg-[#0e0e11]">
        {competitors.map((c, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className={`w-full text-left px-4 py-3 border-b border-[#1c1c20] transition-colors ${
              selected === i ? "bg-[#1a1a1f]" : "hover:bg-[#15151a]"
            }`}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-zinc-500 tabular-nums">#{c.rank}</span>
              <span className="text-sm truncate flex-1">{c.title || c.url || "—"}</span>
            </div>
            <div className="text-[11px] text-zinc-500 truncate mt-0.5">{c.url}</div>
            <div className="flex gap-2 mt-1.5 text-[10px] text-zinc-500">
              {c.word_count != null && <span>{c.word_count} mots</span>}
              {c.scrape_source && <span>{c.scrape_source}</span>}
            </div>
          </button>
        ))}
        {failures.length > 0 && (
          <div className="px-4 py-2 border-t border-b border-[#25252a] text-[10px] uppercase tracking-wider text-amber-400/80 bg-[#1a1410]">
            Scrapes ignorés ({failures.length})
          </div>
        )}
        {failures.map((f, i) => (
          <div
            key={`fail-${i}`}
            className="px-4 py-3 border-b border-[#1c1c20] bg-[#0e0e11] opacity-70"
            title={f.error || ""}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-amber-400">×</span>
              <span className="text-sm truncate flex-1 text-zinc-400">{f.url || "—"}</span>
            </div>
            <div className="text-[11px] text-amber-400/80 truncate mt-0.5">{f.error || "—"}</div>
          </div>
        ))}
      </div>
      {current && (
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-zinc-500">Rank #{current.rank}</span>
              {current.author && (
                <span className="text-xs text-zinc-500">· {current.author}</span>
              )}
              {current.quality != null && (
                <span className="text-xs text-zinc-500">
                  · qualité {current.quality.toFixed(2)}
                </span>
              )}
            </div>
            <h4 className="text-base font-semibold mt-1">{current.title || "—"}</h4>
            {current.url && (
              <a
                href={current.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-accent-500 hover:underline break-all"
              >
                {current.url}
              </a>
            )}
            {current.h1 && current.h1 !== current.title && (
              <div className="text-sm text-zinc-300 mt-2">
                <span className="text-zinc-500">H1 :</span> {current.h1}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <Stat label="Mots" value={fmt(current.word_count)} />
            <Stat label="Paragraphes" value={fmt(current.paragraphs_count)} />
            <Stat label="H2" value={current.h2.length.toString()} />
            <Stat label="H3" value={fmt(current.h3_count)} />
            <Stat label="Listes" value={fmt(current.lists_count)} />
            <Stat label="Tableaux" value={fmt(current.tables_count)} />
            <Stat label="Images alt" value={fmt(current.images_with_alt)} />
            <Stat label="Images sans alt" value={fmt(current.images_without_alt)} />
          </div>

          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <SchemaBadge label="FAQ" on={!!current.has_faq_schema} />
            <SchemaBadge label="Article" on={!!current.has_article_schema} />
            <SchemaBadge label="Product" on={!!current.has_product_schema} />
          </div>

          {(current.angle || current.strength || current.weakness) && (
            <div className="card p-4 space-y-2">
              <div className="label">Analyse Claude</div>
              {current.angle && (
                <div className="text-sm">
                  <span className="text-zinc-500">Angle :</span> {current.angle}
                </div>
              )}
              {current.strength && (
                <div className="text-sm">
                  <span className="text-zinc-500">Force :</span> {current.strength}
                </div>
              )}
              {current.weakness && (
                <div className="text-sm">
                  <span className="text-zinc-500">Faiblesse :</span> {current.weakness}
                </div>
              )}
            </div>
          )}

          {current.h2.length > 0 && (
            <div className="space-y-1.5">
              <div className="label">H2 ({current.h2.length})</div>
              <ul className="text-sm space-y-1 list-disc list-inside text-zinc-300">
                {current.h2.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="label">
                Contenu scrapé{current.scrape_source ? ` (${current.scrape_source})` : ""}
              </span>
              {current.markdown && (
                <CopyBtn text={current.markdown} />
              )}
            </div>
            {current.scrape_error ? (
              <div className="text-sm text-red-300 bg-red-950/30 border border-red-900/40 rounded-lg p-3">
                Erreur de scraping : {current.scrape_error}
              </div>
            ) : current.markdown ? (
              <pre className="text-[12px] leading-relaxed bg-[#0e0e11] border border-[#25252a] rounded-lg p-3 max-h-[60vh] overflow-auto whitespace-pre-wrap font-mono text-zinc-300">
                {current.markdown}
              </pre>
            ) : (
              <div className="text-sm text-zinc-500">Aucun contenu scrapé.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PaaPane({ paa }: { paa: string[] }) {
  if (paa.length === 0) {
    return <div className="p-10 text-sm text-zinc-500 text-center">Aucun PAA trouvé.</div>;
  }
  return (
    <div className="overflow-y-auto p-5 h-full">
      <ul className="space-y-2">
        {paa.map((q, i) => (
          <li key={i} className="card p-3 text-sm">{q}</li>
        ))}
      </ul>
    </div>
  );
}

function FormatPane({ fmt }: { fmt: SerpResponse["format"] }) {
  const totalVotes = useMemo(
    () => Object.values(fmt.votes || {}).reduce((a, b) => a + b, 0),
    [fmt.votes],
  );
  const entries = Object.entries(fmt.votes || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="overflow-y-auto p-5 h-full space-y-4">
      <div>
        <div className="label">Format détecté</div>
        <div className="text-2xl font-semibold mt-1 capitalize">{fmt.format || "—"}</div>
      </div>
      {entries.length > 0 && (
        <div className="space-y-2">
          <div className="label">Répartition des votes ({totalVotes} concurrents)</div>
          {entries.map(([k, v]) => {
            const pct = totalVotes > 0 ? (v / totalVotes) * 100 : 0;
            return (
              <div key={k} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="capitalize">{k}</span>
                  <span className="text-zinc-500 tabular-nums">
                    {v} · {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 bg-[#1c1c20] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {fmt.brief && (
        <div className="card p-4">
          <div className="label mb-2">Consigne envoyée à Claude</div>
          <p className="text-sm leading-relaxed text-zinc-300">{fmt.brief}</p>
        </div>
      )}
    </div>
  );
}

function SemanticPane({
  common,
  rare,
  entities,
  gaps,
}: {
  common: string[];
  rare: string[];
  entities: string[];
  gaps: string[];
}) {
  return (
    <div className="overflow-y-auto p-5 h-full space-y-5">
      <Section title={`Sous-thèmes communs (${common.length})`} items={common} />
      <Section title={`Sous-thèmes rares (${rare.length})`} items={rare} />
      <Section title={`Entités (${entities.length})`} items={entities} />
      <Section title={`Content gaps (${gaps.length})`} items={gaps} />
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="label">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <span key={i} className="chip border-[#34343b] text-zinc-300 bg-[#0e0e11]">
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

function RelatedPane({ related }: { related: string[] }) {
  if (related.length === 0) {
    return <div className="p-10 text-sm text-zinc-500 text-center">Aucun mot-clé associé.</div>;
  }
  return (
    <div className="overflow-y-auto p-5 h-full">
      <div className="flex flex-wrap gap-1.5">
        {related.map((k, i) => (
          <span key={i} className="chip border-[#34343b] text-zinc-300 bg-[#0e0e11]">
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="text-sm font-medium tabular-nums truncate">{value}</div>
    </div>
  );
}

function SchemaBadge({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`chip ${
        on
          ? "border-emerald-500/40 text-emerald-300 bg-emerald-950/30"
          : "border-[#34343b] text-zinc-500 bg-[#0e0e11]"
      }`}
    >
      schema:{label} {on ? "✓" : "—"}
    </span>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* noop */
    }
  }
  return (
    <button onClick={copy} className="text-xs text-zinc-500 hover:text-zinc-200">
      {copied ? "Copié ✓" : "Copier"}
    </button>
  );
}

function fmt(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString("fr-FR");
}
