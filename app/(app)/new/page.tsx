"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { ContentType, Domain, Folder } from "@/lib/types";
import { Icon, IconName } from "@/components/Icon";
import { CountryPicker } from "@/components/CountryPicker";
import { HelpIcon } from "@/components/Tooltip";

type Bucket = {
  type: ContentType;
  label: string;
  hint: string;
  icon: IconName;
  glow: string; // outer glow rgb triplet
};

const BUCKETS: Bucket[] = [
  {
    type: "blog",
    label: "Article de blog",
    hint: "Guide, comparatif, tutoriel — informationnel.",
    icon: "edit",
    glow: "99, 102, 241",
  },
  {
    type: "category",
    label: "Catégorie produit",
    hint: "Page de listing e-commerce avec critères de choix.",
    icon: "library",
    glow: "245, 158, 11",
  },
  {
    type: "product",
    label: "Fiche produit",
    hint: "Description orientée décision d'achat avec FAQ courte.",
    icon: "archive",
    glow: "16, 185, 129",
  },
  {
    type: "service_lp",
    label: "Page service",
    hint: "Promesse + bénéfices + preuves, structurée pour la conversion.",
    icon: "audit",
    glow: "236, 72, 153",
  },
];

type Estimate = { items: number; low_total: number; high_total: number };

export default function NewContentHeroPage() {
  const router = useRouter();
  const { data: domains } = useSWR<Domain[]>("/srv/domains", fetcher);
  const { data: folders } = useSWR<Folder[]>("/srv/folders", fetcher);

  const [keyword, setKeyword] = useState("");
  const [contentType, setContentType] = useState<ContentType>("blog");
  const [locationCode, setLocationCode] = useState(2250);
  const [languageCode, setLanguageCode] = useState("fr");
  const [domainId, setDomainId] = useState<string>("");
  const [folderId, setFolderId] = useState<string>("");
  const [linking, setLinking] = useState(true);
  const [generateImage, setGenerateImage] = useState(false);
  const [useHaiku, setUseHaiku] = useState(false);
  const [doRefinement, setDoRefinement] = useState(false);
  const [doSchemaJsonld, setDoSchemaJsonld] = useState(false);
  const [autoValidate, setAutoValidate] = useState(true);
  const [costCap, setCostCap] = useState<number | "">(1.0);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const readyDomains = useMemo(
    () => (domains || []).filter((d) => d.status === "ready"),
    [domains],
  );

  const cleanKeyword = keyword.trim();
  const ready = cleanKeyword.length > 0;

  // Live estimate (debounced)
  useEffect(() => {
    if (!ready) {
      setEstimate(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const e = await api<Estimate>("/srv/jobs/batch/estimate", {
          method: "POST",
          json: {
            items: [
              {
                keyword: cleanKeyword,
                content_type: contentType,
                internal_linking: linking && !!domainId,
                generate_image: generateImage,
                use_haiku: useHaiku,
              },
            ],
            location_code: locationCode,
            language_code: languageCode,
            domain_id: domainId || null,
            internal_linking: linking && !!domainId,
            generate_image: generateImage,
            use_haiku: useHaiku,
            auto_validate_blueprint: autoValidate,
            cost_cap: costCap === "" ? null : Number(costCap),
          },
        });
        setEstimate(e);
      } catch {
        setEstimate(null);
      }
    }, 320);
    return () => clearTimeout(t);
  }, [
    ready,
    cleanKeyword,
    contentType,
    linking,
    generateImage,
    useHaiku,
    locationCode,
    languageCode,
    domainId,
    autoValidate,
    costCap,
  ]);

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ batch_id: string }>("/srv/jobs/batch", {
        method: "POST",
        json: {
          items: [
            {
              keyword: cleanKeyword,
              content_type: contentType,
              internal_linking: linking && !!domainId,
              generate_image: generateImage,
              use_haiku: useHaiku,
            },
          ],
          location_code: locationCode,
          language_code: languageCode,
          domain_id: domainId || null,
          folder_id: folderId || null,
          internal_linking: linking && !!domainId,
          generate_image: generateImage,
          use_haiku: useHaiku,
          auto_validate_blueprint: autoValidate,
          cost_cap: costCap === "" ? null : Number(costCap),
          do_refinement: doRefinement,
          do_schema_jsonld: doSchemaJsonld,
        },
      });
      router.push(`/batches/${res.batch_id}`);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  return (
    <ParallaxStage>
      <div className="relative max-w-3xl mx-auto pt-6 sm:pt-10 pb-24">
        {/* Floating bulk-mode link */}
        <div className="flex justify-end mb-8 sm:mb-10">
          <Link
            href="/new/bulk"
            className="group relative px-3.5 py-1.5 rounded-full text-xs font-medium text-zinc-300 hover:text-white border border-white/10 hover:border-white/25 bg-white/[0.025] hover:bg-white/[0.06] backdrop-blur-md transition-all duration-300 inline-flex items-center gap-1.5"
            title="Coller plusieurs mots-clés à la fois"
          >
            <span className="relative">
              <span className="absolute -inset-2 rounded-full bg-accent-500/0 group-hover:bg-accent-500/15 blur-md transition-all duration-300" />
              <Icon name="library" size={12} className="relative" />
            </span>
            Mode bulk
            <Icon name="arrow-right" size={11} className="opacity-60 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* HERO */}
        <header className="text-center space-y-4 mb-9 sm:mb-12">
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-[10px] uppercase tracking-[0.22em] text-accent-200 border border-accent-500/30 bg-accent-500/[0.08] animate-fadein"
            style={{ animationDelay: "0ms" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" />
            Création
          </div>
          <h1
            className="text-[34px] sm:text-[44px] leading-[1.05] font-bold tracking-tight animate-rise"
            style={{ animationDelay: "60ms" }}
          >
            <ShimmerText>Quel contenu souhaites-tu générer</ShimmerText>
            <span className="text-zinc-100">, Thomas&nbsp;?</span>
          </h1>
          <p
            className="text-sm text-zinc-400 max-w-md mx-auto animate-fadein"
            style={{ animationDelay: "180ms" }}
          >
            Choisis le format, colle ton mot-clé. Le pipeline complet —
            SERP, sémantique, rédaction — démarre en un clic.
          </p>
        </header>

        {/* TYPE PICKER */}
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-6 animate-rise"
          style={{ animationDelay: "260ms" }}
        >
          {BUCKETS.map((b, i) => {
            const active = contentType === b.type;
            return (
              <button
                key={b.type}
                onClick={() => setContentType(b.type)}
                className="bucket-btn group relative overflow-hidden rounded-2xl px-3.5 py-3.5 text-left transition-all duration-300 ease-out"
                data-active={active}
                style={
                  {
                    "--glow": b.glow,
                    animationDelay: `${280 + i * 40}ms`,
                  } as CSSProperties
                }
              >
                <span
                  aria-hidden
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 group-data-[active=true]:opacity-100 transition-opacity duration-500"
                  style={{
                    background: `radial-gradient(120% 80% at 30% 0%, rgba(${b.glow},0.20), transparent 60%)`,
                  }}
                />
                <span
                  aria-hidden
                  className="absolute inset-x-0 -top-px h-px opacity-30 group-hover:opacity-100 group-data-[active=true]:opacity-100 transition-opacity"
                  style={{
                    background: `linear-gradient(90deg, transparent, rgba(${b.glow}, 0.85), transparent)`,
                  }}
                />
                <div className="relative flex items-start gap-2.5">
                  <span
                    className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-transform duration-300 group-hover:-translate-y-0.5 group-data-[active=true]:scale-110"
                    style={{
                      background: `rgba(${b.glow}, 0.14)`,
                      border: `1px solid rgba(${b.glow}, 0.32)`,
                      color: `rgb(${b.glow})`,
                      boxShadow: active
                        ? `0 0 24px -6px rgba(${b.glow}, 0.55)`
                        : "none",
                    }}
                  >
                    <Icon name={b.icon} size={15} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-zinc-100 leading-tight truncate">
                      {b.label}
                    </div>
                    <div className="text-[10.5px] text-zinc-500 mt-0.5 leading-snug line-clamp-2">
                      {b.hint}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* KEYWORD INPUT — the hero command */}
        <div
          className="relative mb-5 animate-rise"
          style={{ animationDelay: "440ms" }}
        >
          <KeywordInput
            value={keyword}
            onChange={setKeyword}
            onSubmit={submit}
            ready={ready}
            busy={busy}
            placeholder="Renseigne le mot-clé…"
          />
        </div>

        {/* PRIMARY ACTION */}
        <div
          className="flex items-center justify-between gap-4 mb-7 animate-fadein"
          style={{ animationDelay: "520ms" }}
        >
          <div className="text-xs text-zinc-500 min-h-[18px]">
            {estimate ? (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <span className="w-1 h-1 rounded-full bg-accent-400" />
                Estimation&nbsp;
                <strong className="text-zinc-200">
                  ${estimate.low_total.toFixed(2)} – ${estimate.high_total.toFixed(2)}
                </strong>
              </span>
            ) : ready ? (
              <span className="text-zinc-600">Calcul du coût…</span>
            ) : (
              <span className="text-zinc-600">
                Tape un mot-clé pour estimer le coût.
              </span>
            )}
          </div>
          <button
            onClick={submit}
            disabled={!ready || busy}
            className="hero-cta group"
          >
            <span className="hero-cta-bg" aria-hidden />
            <span className="hero-cta-shine" aria-hidden />
            <span className="relative inline-flex items-center gap-2">
              {busy ? (
                <>
                  <Icon name="spinner" size={14} />
                  Lancement…
                </>
              ) : (
                <>
                  <Icon name="sparkles" size={14} />
                  Générer
                  <kbd className="hidden sm:inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/15 border border-white/15">
                    ⌘
                    <span>↵</span>
                  </kbd>
                </>
              )}
            </span>
          </button>
        </div>

        {/* ADVANCED — collapsed by default, opens with smooth height anim */}
        <div className="animate-fadein" style={{ animationDelay: "620ms" }}>
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-white/[0.06] hover:border-white/[0.14] bg-white/[0.02] hover:bg-white/[0.04] backdrop-blur-md transition-all"
            aria-expanded={advancedOpen}
          >
            <span className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-zinc-400">
              <Icon name="filter" size={12} />
              Paramètres avancés
            </span>
            <span
              className={`text-zinc-500 transition-transform duration-300 ${
                advancedOpen ? "rotate-90" : ""
              }`}
            >
              <Icon name="chevron-right" size={14} />
            </span>
          </button>

          <div
            className={`grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              advancedOpen ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"
            }`}
            style={{ overflow: "hidden" }}
          >
            <div className="min-h-0">
              <div className="card p-5 space-y-4">
                <CountryPicker
                  countryCode={locationCode}
                  languageCode={languageCode}
                  onChange={(c, l) => {
                    setLocationCode(c);
                    setLanguageCode(l);
                  }}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Dossier" help="Range automatiquement le contenu généré.">
                    <select
                      value={folderId}
                      onChange={(e) => setFolderId(e.target.value)}
                      className="input"
                    >
                      <option value="">(aucun)</option>
                      {folders?.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Domaine cible"
                    help="Indispensable pour activer le maillage interne."
                  >
                    <select
                      value={domainId}
                      onChange={(e) => setDomainId(e.target.value)}
                      className="input"
                    >
                      <option value="">(aucun)</option>
                      {readyDomains.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.hostname} — {d.pages_count} pages
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Toggle
                    icon="link"
                    label="Maillage"
                    hint={!domainId ? "Choisis un domaine" : undefined}
                    checked={linking && !!domainId}
                    disabled={!domainId}
                    onChange={setLinking}
                  />
                  <Toggle
                    icon="image"
                    label="Image"
                    hint="~$0.04"
                    checked={generateImage}
                    onChange={setGenerateImage}
                  />
                  <Toggle
                    icon="sparkles"
                    label="Haiku"
                    hint="−66 %"
                    checked={useHaiku}
                    onChange={setUseHaiku}
                  />
                  <Toggle
                    icon="check"
                    label="Auto-blueprint"
                    checked={autoValidate}
                    onChange={setAutoValidate}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Toggle
                    icon="edit"
                    label="Relecture Claude"
                    hint="+50 % coût"
                    checked={doRefinement}
                    onChange={setDoRefinement}
                  />
                  <Toggle
                    icon="audit"
                    label="Schema JSON-LD"
                    checked={doSchemaJsonld}
                    onChange={setDoSchemaJsonld}
                  />
                </div>
                <Field label="Plafond de coût ($)" help="Garde-fou par mot-clé.">
                  <input
                    type="number"
                    step={0.05}
                    value={costCap}
                    onChange={(e) =>
                      setCostCap(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    className="input"
                  />
                </Field>
              </div>
            </div>
          </div>
        </div>

        {err && (
          <div className="mt-6 card border-red-700/50 bg-red-500/10 text-red-100 p-3 text-sm flex items-start gap-2 animate-fadein">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
            <span>{err}</span>
          </div>
        )}
      </div>

      <style jsx>{`
        .bucket-btn {
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          box-shadow: 0 1px 0 0 rgba(255, 255, 255, 0.06) inset,
            0 12px 32px -16px rgba(0, 0, 0, 0.5);
          opacity: 0;
          animation: rise 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .bucket-btn:hover {
          transform: translateY(-2px);
          border-color: rgba(var(--glow), 0.4);
          box-shadow: 0 1px 0 0 rgba(255, 255, 255, 0.08) inset,
            0 18px 40px -14px rgba(var(--glow), 0.35),
            0 0 0 1px rgba(var(--glow), 0.18);
        }
        .bucket-btn[data-active="true"] {
          border-color: rgba(var(--glow), 0.55);
          background: rgba(var(--glow), 0.06);
          box-shadow: 0 1px 0 0 rgba(255, 255, 255, 0.1) inset,
            0 22px 48px -12px rgba(var(--glow), 0.45),
            0 0 0 1px rgba(var(--glow), 0.32);
        }

        .hero-cta {
          position: relative;
          padding: 0.85rem 1.6rem;
          border-radius: 14px;
          font-size: 0.92rem;
          font-weight: 600;
          color: white;
          letter-spacing: -0.01em;
          isolation: isolate;
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
            box-shadow 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          border: 1px solid rgba(255, 255, 255, 0.18);
          box-shadow: 0 1px 0 0 rgba(255, 255, 255, 0.25) inset,
            0 12px 32px -10px rgba(124, 132, 255, 0.5),
            0 0 0 1px rgba(124, 132, 255, 0.2);
        }
        .hero-cta-bg {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(135deg, #7c84ff 0%, #5b5fe0 50%, #8a91ff 100%);
          background-size: 200% 200%;
          animation: heroGradient 6s ease infinite;
          z-index: -1;
        }
        .hero-cta-shine {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          overflow: hidden;
          z-index: -1;
        }
        .hero-cta-shine::before {
          content: "";
          position: absolute;
          inset: -50% -100%;
          background: linear-gradient(
            115deg,
            transparent 30%,
            rgba(255, 255, 255, 0.45) 48%,
            rgba(255, 255, 255, 0.85) 50%,
            rgba(255, 255, 255, 0.45) 52%,
            transparent 70%
          );
          transform: translateX(-100%);
          transition: transform 0.9s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .hero-cta:hover:not(:disabled) {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 1px 0 0 rgba(255, 255, 255, 0.3) inset,
            0 22px 48px -10px rgba(124, 132, 255, 0.7),
            0 0 0 1px rgba(124, 132, 255, 0.45);
        }
        .hero-cta:hover:not(:disabled) .hero-cta-shine::before {
          transform: translateX(100%);
        }
        .hero-cta:active:not(:disabled) {
          transform: translateY(0) scale(0.98);
        }
        .hero-cta:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        @keyframes heroGradient {
          0%,
          100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
        @keyframes rise {
          0% {
            opacity: 0;
            transform: translateY(14px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        :global(.animate-rise) {
          opacity: 0;
          animation: rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        :global(.animate-fadein) {
          opacity: 0;
          animation: rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          :global(.animate-rise),
          :global(.animate-fadein),
          .bucket-btn,
          .hero-cta-bg {
            animation: none !important;
            opacity: 1 !important;
          }
        }
      `}</style>
    </ParallaxStage>
  );
}

/* -------------------------- Parallax background stage -------------------------- */

function ParallaxStage({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    let raf = 0;
    let tx = 0,
      ty = 0;
    function onMove(e: MouseEvent) {
      const r = el!.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      tx = nx;
      ty = ny;
      if (!raf) raf = requestAnimationFrame(apply);
    }
    function apply() {
      raf = 0;
      el!.style.setProperty("--mx", tx.toFixed(3));
      el!.style.setProperty("--my", ty.toFixed(3));
    }
    el.addEventListener("mousemove", onMove);
    return () => {
      el.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="relative -mx-4 sm:-mx-6 -my-6 px-4 sm:px-6 py-6 min-h-[calc(100vh-3rem)] overflow-hidden"
      style={
        {
          "--mx": 0,
          "--my": 0,
        } as CSSProperties
      }
    >
      {/* Layer 1 — far depth: deep aurora orbs that drift with mouse */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          transform:
            "translate3d(calc(var(--mx) * -22px), calc(var(--my) * -22px), 0)",
          transition: "transform 600ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div
          className="absolute rounded-full blur-[120px] opacity-70"
          style={{
            top: "-12%",
            left: "-8%",
            width: "55%",
            height: "55%",
            background:
              "radial-gradient(circle at 30% 30%, rgba(124,132,255,0.5), transparent 65%)",
            animation: "float1 18s ease-in-out infinite",
          }}
        />
        <div
          className="absolute rounded-full blur-[140px] opacity-60"
          style={{
            top: "10%",
            right: "-15%",
            width: "60%",
            height: "60%",
            background:
              "radial-gradient(circle at 70% 30%, rgba(168,85,247,0.4), transparent 65%)",
            animation: "float2 22s ease-in-out infinite",
          }}
        />
        <div
          className="absolute rounded-full blur-[160px] opacity-50"
          style={{
            bottom: "-20%",
            left: "20%",
            width: "70%",
            height: "70%",
            background:
              "radial-gradient(circle at 50% 70%, rgba(56,189,248,0.32), transparent 65%)",
            animation: "float3 26s ease-in-out infinite",
          }}
        />
      </div>

      {/* Layer 2 — mid depth: faint topographic relief grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.18]"
        style={{
          transform:
            "translate3d(calc(var(--mx) * -10px), calc(var(--my) * -10px), 0)",
          transition: "transform 500ms cubic-bezier(0.16, 1, 0.3, 1)",
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.18) 1px, transparent 1.5px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 35%, black 0%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 35%, black 0%, transparent 80%)",
        }}
      />

      {/* Layer 3 — near depth: cursor follower halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(440px circle at calc((var(--mx) + 0.5) * 100%) calc((var(--my) + 0.5) * 100%), rgba(124,132,255,0.10), transparent 55%)",
          transition: "background 200ms linear",
        }}
      />

      <div className="relative z-10">{children}</div>

      <style jsx>{`
        @keyframes float1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(4%, 6%) scale(1.08); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-5%, 4%) scale(1.05); }
        }
        @keyframes float3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(3%, -4%) scale(1.06); }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-hidden] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

/* -------------------------- Hero keyword input -------------------------- */

function KeywordInput({
  value,
  onChange,
  onSubmit,
  ready,
  busy,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  ready: boolean;
  busy: boolean;
  placeholder: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className="group relative rounded-2xl"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 100;
        const y = ((e.clientY - r.top) / r.height) * 100;
        e.currentTarget.style.setProperty("--lx", `${x}%`);
        e.currentTarget.style.setProperty("--ly", `${y}%`);
      }}
      style={
        {
          "--lx": "50%",
          "--ly": "50%",
        } as CSSProperties
      }
    >
      {/* Glow ring that follows mouse */}
      <div
        aria-hidden
        className="absolute -inset-px rounded-2xl opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background:
            "radial-gradient(220px circle at var(--lx) var(--ly), rgba(124,132,255,0.55), transparent 60%)",
        }}
      />
      {/* Inner gradient border */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          padding: 1,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04))",
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />
      <div className="relative flex items-center gap-3 px-5 py-4 sm:py-5 rounded-2xl bg-[rgba(14,16,24,0.78)] backdrop-blur-2xl">
        <span
          className={`shrink-0 transition-colors duration-300 ${
            ready ? "text-accent-300" : "text-zinc-500"
          }`}
        >
          <Icon name="search" size={18} />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            } else if (e.key === "Enter" && !busy) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          className="flex-1 bg-transparent text-[17px] sm:text-[18px] text-white placeholder:text-zinc-600 focus:outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors"
            title="Effacer"
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------- Helpers -------------------------- */

function ShimmerText({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        background:
          "linear-gradient(110deg, #c4c8ff 0%, #ffffff 30%, #c4c8ff 60%, #8a91ff 100%)",
        backgroundSize: "200% 100%",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        animation: "shimmerText 5.5s ease-in-out infinite",
      }}
    >
      {children}
      <style jsx>{`
        @keyframes shimmerText {
          0%,
          100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          span {
            animation: none !important;
          }
        }
      `}</style>
    </span>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="label inline-flex items-center">
        {label}
        {help && <HelpIcon content={help} />}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  icon,
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative px-3 py-2.5 rounded-xl border text-left transition-all duration-200 ${
        disabled
          ? "border-white/[0.05] bg-white/[0.02] text-zinc-700 cursor-not-allowed"
          : checked
          ? "border-accent-500/45 bg-accent-500/[0.10] text-accent-100 shadow-[0_0_24px_-12px_var(--accent-glow)]"
          : "border-white/[0.08] bg-white/[0.025] text-zinc-300 hover:border-white/[0.18] hover:bg-white/[0.05]"
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon name={icon} size={13} />
        <span className="text-[12px] font-medium">{label}</span>
      </div>
      {hint && (
        <div className="text-[10px] text-zinc-500 mt-0.5 pl-5">{hint}</div>
      )}
    </button>
  );
}
