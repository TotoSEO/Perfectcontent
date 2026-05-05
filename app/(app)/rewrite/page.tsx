"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { ContentType, Domain, Folder } from "@/lib/types";
import { HelpIcon } from "@/components/Tooltip";
import { RichTextarea } from "@/components/RichTextarea";
import { CountryPicker } from "@/components/CountryPicker";

const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: "blog", label: "Article de blog" },
  { value: "category", label: "Catégorie produit" },
  { value: "product", label: "Fiche produit" },
  { value: "service_lp", label: "Service / Landing" },
];

export default function RewritePage() {
  const router = useRouter();
  const { data: domains } = useSWR<Domain[]>("/api/domains", fetcher);
  const { data: folders } = useSWR<Folder[]>("/api/folders", fetcher);

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
          "/api/jobs/rewrite/estimate",
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
      const job = await api<{ id: string }>("/api/jobs/rewrite", {
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
    <div className="space-y-6 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold inline-flex items-center">
          ♻️ Réécriture de contenu
          <HelpIcon
            side="right"
            content="Pour un contenu obsolète ou sous-performant. On scrape la SERP fraîche, on identifie les gaps et termes manquants, puis on RÉÉCRIT (pas de redémarrage à zéro) ton contenu en l'enrichissant et en corrigeant son ton."
          />
        </h1>
        <p className="text-sm text-zinc-500">
          Différent de la génération from scratch : ici, on garde l'âme du
          contenu source, on enrichit et corrige.
        </p>
      </header>

      <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Mot-clé principal" help="Sur quel mot-clé doit performer le contenu réécrit.">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="ex: meilleure cafetière à grain"
              className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
            />
          </Field>
          <Field label="Type de contenu">
            <select
              value={contentType}
              onChange={(e) => setContentType(e.target.value as ContentType)}
              className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
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

        <Field label="Dossier (optionnel)">
          <select
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
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
            className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
          >
            <option value="">(aucun)</option>
            {readyDomains.map((d) => (
              <option key={d.id} value={d.id}>{d.hostname} — {d.pages_count} pages</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!domainId}
              checked={internalLinking && !!domainId}
              onChange={(e) => setInternalLinking(e.target.checked)}
              className="mt-0.5"
            />
            <span>Maillage interne après réécriture</span>
          </label>
          <Field label="Plafond coût (USD)" help="Garde-fou. Au-delà, le job s'arrête.">
            <input
              type="number"
              step={0.05}
              value={costCap}
              onChange={(e) => setCostCap(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
            />
          </Field>
        </div>
      </div>

      <div className="bg-ink-900 border border-ink-800 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-zinc-500 inline-flex items-center">
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
          <p className="text-xs text-amber-300">
            Contenu trop court ({sourceWords} mots). Minimum 100 mots pour une réécriture utile.
          </p>
        )}
      </div>

      {err && (
        <div className="bg-red-900/30 border border-red-700 text-red-100 p-3 rounded-xl text-sm">
          {err}
        </div>
      )}

      <div className="bg-ink-900 border border-ink-800 rounded-xl p-4 flex items-center justify-between gap-3 sticky bottom-3 backdrop-blur">
        <div className="text-sm">
          {!ready ? (
            <span className="text-zinc-500">
              Renseigne le mot-clé et colle un contenu de 100+ mots.
            </span>
          ) : (
            <>
              <div className="font-medium">
                Réécriture prête à lancer
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                Pipeline complet (SERP → analyse → réécriture) ~1 min
                {estimate && (
                  <>
                    {" "}· estimation <strong className="text-zinc-300">${estimate.low.toFixed(3)}</strong> – <strong className="text-zinc-300">${estimate.high.toFixed(3)}</strong>
                  </>
                )}
              </div>
            </>
          )}
        </div>
        <button
          disabled={!ready || busy}
          onClick={submit}
          className="bg-accent-600 hover:bg-accent-500 disabled:opacity-50 px-5 py-2.5 rounded font-medium text-sm shadow"
        >
          {busy ? "Lancement…" : "Lancer la réécriture"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs uppercase tracking-wider text-zinc-500 inline-flex items-center">
        {label}
        {help && <HelpIcon content={help} />}
      </span>
      {children}
    </label>
  );
}
