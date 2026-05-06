"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { ContentType, Domain, Folder } from "@/lib/types";
import { HelpIcon } from "@/components/Tooltip";
import { RichTextarea } from "@/components/RichTextarea";
import { CountryPicker } from "@/components/CountryPicker";
import { Icon } from "@/components/Icon";

const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: "blog", label: "Article de blog" },
  { value: "category", label: "Catégorie produit" },
  { value: "product", label: "Fiche produit" },
  { value: "service_lp", label: "Service / Landing" },
];

export default function RewritePage() {
  const router = useRouter();
  const { data: domains } = useSWR<Domain[]>("/srv/domains", fetcher);
  const { data: folders } = useSWR<Folder[]>("/srv/folders", fetcher);

  const [keyword, setKeyword] = useState("");
  const [contentType, setContentType] = useState<ContentType>("blog");
  const [locationCode, setLocationCode] = useState(2250);
  const [languageCode, setLanguageCode] = useState("fr");
  const [domainId, setDomainId] = useState<string>("");
  const [folderId, setFolderId] = useState<string>("");
  const [internalLinking, setInternalLinking] = useState(true);
  const [costCap, setCostCap] = useState<number | "">(0.6);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<{ low: number; high: number; source_chars: number } | null>(null);

  const readyDomains = (domains || []).filter((d) => d.status === "ready");
  const sourceWords = source.replace(/<[^>]+>/g, "").trim().split(/\s+/).filter(Boolean).length;
  const ready = !!keyword.trim() && sourceWords >= 100;

  useEffect(() => {
    if (sourceWords < 100) {
      setEstimate(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const e = await api<{ low: number; high: number; source_chars: number }>(
          "/srv/jobs/rewrite/estimate",
          {
            method: "POST",
            json: {
              keyword: keyword || "test",
              source_content: source,
              content_type: contentType,
              location_code: locationCode,
              language_code: languageCode,
              internal_linking: internalLinking && !!domainId,
            },
          }
        );
        setEstimate(e);
      } catch {
        setEstimate(null);
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.length, internalLinking, domainId]);

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setErr(null);
    try {
      const job = await api<{ id: string }>("/srv/jobs/rewrite", {
        method: "POST",
        json: {
          keyword: keyword.trim(),
          source_content: source,
          content_type: contentType,
          location_code: locationCode,
          language_code: languageCode,
          domain_id: domainId || null,
          folder_id: folderId || null,
          internal_linking: internalLinking && !!domainId,
          cost_cap: costCap === "" ? null : Number(costCap),
        },
      });
      router.push(`/jobs/${job.id}`);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl animate-fadein">
      <header>
        <div className="eyebrow mb-2">Création</div>
        <h1 className="h-page inline-flex items-center gap-2">
          <Icon name="rewrite" size={24} className="text-accent-400" />
          Réécriture de contenu
          <HelpIcon
            side="right"
            content="Pour un contenu obsolète ou sous-performant. On scrape la SERP fraîche, on identifie les gaps et termes manquants, puis on RÉÉCRIT (pas de redémarrage à zéro) ton contenu en l'enrichissant et en corrigeant son ton."
          />
        </h1>
        <p className="h-sub max-w-2xl">
          Différent de la génération from scratch : ici, on garde l'âme du
          contenu source, on enrichit et corrige.
        </p>
      </header>

      <section className="card p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Mot-clé principal" help="Sur quel mot-clé doit performer le contenu réécrit.">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="ex: meilleure cafetière à grain"
              className="input"
            />
          </Field>
          <Field label="Type de contenu">
            <select
              value={contentType}
              onChange={(e) => setContentType(e.target.value as ContentType)}
              className="input"
            >
              {CONTENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <CountryPicker
          countryCode={locationCode}
          languageCode={languageCode}
          onChange={(c, l) => { setLocationCode(c); setLanguageCode(l); }}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Dossier (optionnel)">
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
          </Field>

          <Field label="Domaine cible (pour maillage)" help="Sélectionne un domaine indexé pour activer le maillage interne sur le contenu réécrit.">
            <select
              value={domainId}
              onChange={(e) => setDomainId(e.target.value)}
              className="input"
            >
              <option value="">(aucun)</option>
              {readyDomains.map((d) => (
                <option key={d.id} value={d.id}>{d.hostname} — {d.pages_count} pages</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
            internalLinking && !!domainId
              ? "border-accent-500/40 bg-accent-500/5"
              : "border-[var(--border)] bg-white/[0.04] hover:bg-white/[0.07]"
          } ${!domainId ? "opacity-50 cursor-not-allowed" : ""}`}>
            <div className="flex items-center gap-2">
              <Icon name="link" size={14} className="text-zinc-400" />
              <span className="text-sm text-zinc-200">Maillage interne après réécriture</span>
            </div>
            <input
              type="checkbox"
              disabled={!domainId}
              checked={internalLinking && !!domainId}
              onChange={(e) => setInternalLinking(e.target.checked)}
              className="accent-accent-500"
            />
          </label>
          <Field label="Plafond coût (USD)" help="Garde-fou. Au-delà, le job s'arrête.">
            <input
              type="number"
              step={0.05}
              value={costCap}
              onChange={(e) => setCostCap(e.target.value === "" ? "" : Number(e.target.value))}
              className="input tabular-nums"
            />
          </Field>
        </div>
      </section>

      <section className="card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="label inline-flex items-center">
            Contenu actuel à réécrire
            <HelpIcon content="Colle le contenu de la page existante. Le rich text est préservé : H1-H6, gras, italique, listes, tableaux, citations." />
          </span>
          <span className="text-[11px] text-zinc-500 tabular-nums">{sourceWords} mots</span>
        </div>
        <RichTextarea
          value={source}
          onChange={setSource}
          minHeight={320}
          placeholder="Colle ici le contenu existant de la page (titres, paragraphes, listes, tableaux…)"
        />
        {sourceWords > 0 && sourceWords < 100 && (
          <p className="text-xs text-amber-300 inline-flex items-center gap-1.5">
            <Icon name="alert" size={12} />
            Contenu trop court ({sourceWords} mots). Minimum 100 mots pour une réécriture utile.
          </p>
        )}
      </section>

      {err && (
        <div className="card border-red-700/50 bg-red-500/10 text-red-200 p-3 text-sm flex items-start gap-2">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <div className="card-elevated p-4 flex flex-wrap items-center justify-between gap-3 sticky bottom-3 backdrop-blur-md">
        <div className="text-sm">
          {!ready ? (
            <span className="text-zinc-500">
              Renseigne le mot-clé et colle un contenu de 100+ mots.
            </span>
          ) : (
            <>
              <div className="font-medium text-zinc-100">Réécriture prête à lancer</div>
              <div className="text-xs text-zinc-500 mt-0.5">
                Pipeline complet (SERP → analyse → réécriture) ~1 min
                {estimate && (
                  <>
                    {" "}· estimation <strong className="text-zinc-300 tabular-nums">${estimate.low.toFixed(3)}</strong> – <strong className="text-zinc-300 tabular-nums">${estimate.high.toFixed(3)}</strong>
                  </>
                )}
              </div>
            </>
          )}
        </div>
        <button disabled={!ready || busy} onClick={submit} className="btn-primary">
          {busy ? (
            <>
              <Icon name="spinner" size={14} /> Lancement…
            </>
          ) : (
            <>
              <Icon name="rewrite" size={14} /> Lancer la réécriture
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
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
