"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Domain, Folder } from "@/lib/types";
import { CountryPicker } from "@/components/CountryPicker";
import { HelpIcon } from "@/components/Tooltip";

// Mirror of backend/app/services/slug.slugify — kept simple, FR-friendly.
const FILLER = new Set([
  "de","du","des","le","la","les","l","un","une","et","ou","à","a","au","aux",
  "en","dans","sur","pour","par","avec","sans",
  "the","an","and","or","of","to","in","on","for",
]);
function slugify(text: string, max = 60): string {
  if (!text) return "";
  const ascii = text.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const cleaned = ascii.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!cleaned) return "";
  let toks = cleaned.split(/\s+/).filter((t) => t && !FILLER.has(t));
  if (!toks.length) toks = cleaned.split(/\s+/);
  let out = toks.join("-");
  if (out.length > max) out = out.slice(0, max).replace(/-[^-]*$/, "");
  return out;
}
function joinUrl(base: string, slug: string, trailing: boolean): string {
  const b = base.replace(/\/+$/, "") + "/";
  let out = b + slug.replace(/^\/+/, "");
  if (trailing && !out.endsWith("/")) out += "/";
  return out;
}

type SatRow = { kw: string; slug: string; auto: boolean };

export default function NewSiloPage() {
  const router = useRouter();
  const { data: domains } = useSWR<Domain[]>("/srv/domains", fetcher);
  const { data: folders } = useSWR<Folder[]>("/srv/folders", fetcher);

  const [usePillarUrl, setUsePillarUrl] = useState(false);
  const [pillarKw, setPillarKw] = useState("");
  const [pillarUrl, setPillarUrl] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://");
  const [trailing, setTrailing] = useState(true);
  const [satText, setSatText] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const [locationCode, setLocationCode] = useState(2250);
  const [languageCode, setLanguageCode] = useState("fr");
  const [domainId, setDomainId] = useState<string>("");
  const [folderId, setFolderId] = useState<string>("");
  const [useHaiku, setUseHaiku] = useState(false);
  const [generateImage, setGenerateImage] = useState(false);
  const [costCap, setCostCap] = useState<number | "">(2.5);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const satKws = useMemo(
    () => satText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
    [satText],
  );

  const sats: SatRow[] = useMemo(
    () =>
      satKws.map((kw) => {
        const auto = slugify(kw);
        const ov = overrides[kw];
        return { kw, slug: ov ?? auto, auto: ov === undefined };
      }),
    [satKws, overrides],
  );

  const pillarSlug = useMemo(() => (usePillarUrl ? "" : slugify(pillarKw)), [pillarKw, usePillarUrl]);
  const pillarFinalUrl = usePillarUrl ? pillarUrl : joinUrl(baseUrl, pillarSlug, trailing);

  // Validation
  const baseUrlOk = /^https?:\/\/.+/i.test(baseUrl) && baseUrl !== "https://";
  const pillarOk = usePillarUrl
    ? /^https?:\/\/.+/i.test(pillarUrl)
    : pillarKw.trim().length > 0;
  const satsOk = sats.length >= 2;
  const allSlugs = new Set<string>();
  let dupSlug: string | null = null;
  for (const s of sats) {
    if (allSlugs.has(s.slug)) { dupSlug = s.slug; break; }
    allSlugs.add(s.slug);
  }
  if (!usePillarUrl && pillarSlug && allSlugs.has(pillarSlug)) dupSlug = pillarSlug;

  const canSubmit = baseUrlOk && pillarOk && satsOk && !dupSlug && !busy;

  // Cost estimate (rough, mirrors cost.py default ranges)
  const perArticleLow = useHaiku ? 0.05 : 0.12;
  const perArticleHigh = useHaiku ? 0.10 : 0.22;
  const totalCount = sats.length + (usePillarUrl ? 0 : 1);
  const estLow = totalCount * perArticleLow;
  const estHigh = totalCount * perArticleHigh;

  function setSlug(kw: string, slug: string) {
    setOverrides((prev) => ({ ...prev, [kw]: slug }));
  }
  function resetSlug(kw: string) {
    setOverrides((prev) => {
      const out = { ...prev };
      delete out[kw];
      return out;
    });
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ silo_id: string }>("/srv/silos", {
        method: "POST",
        json: {
          pillar_keyword: usePillarUrl ? null : pillarKw.trim(),
          pillar_external_url: usePillarUrl ? pillarUrl.trim() : null,
          base_url: baseUrl.trim(),
          trailing_slash: trailing,
          satellites: sats.map((s) => ({ keyword: s.kw, slug: s.slug })),
          domain_id: domainId || null,
          folder_id: folderId || null,
          location_code: locationCode,
          language_code: languageCode,
          use_haiku: useHaiku,
          generate_image: generateImage,
          cost_cap: costCap === "" ? null : Number(costCap),
        },
      });
      router.push(`/silos/${res.silo_id}`);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <span className="text-accent-400">◧</span> Nouveau silo SEO
        </h1>
        <p className="text-sm text-zinc-500">
          Une page pilier + N articles satellites, générés en parallèle, déjà maillés
          entre eux. Le pilier introduit chaque sous-thème et pousse vers son article ;
          chaque satellite pointe vers le pilier dans ses 3 premiers paragraphes et
          tisse des liens contextuels naturels vers les voisins thématiques.
        </p>
      </header>

      {/* Pillar */}
      <section className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4">
        <h2 className="text-xs uppercase tracking-wider text-zinc-500">
          1. Page pilier
        </h2>
        <div className="flex gap-2 text-sm">
          <button
            onClick={() => setUsePillarUrl(false)}
            className={`px-3 py-1.5 rounded border ${!usePillarUrl ? "border-accent-500 bg-accent-500/10 text-accent-200" : "border-ink-700 text-zinc-400"}`}
          >
            Générer le pilier
          </button>
          <button
            onClick={() => setUsePillarUrl(true)}
            className={`px-3 py-1.5 rounded border ${usePillarUrl ? "border-accent-500 bg-accent-500/10 text-accent-200" : "border-ink-700 text-zinc-400"}`}
          >
            Pilier déjà existant (URL)
          </button>
        </div>

        {!usePillarUrl ? (
          <Field label="Mot-clé pilier (= la requête sur laquelle le silo doit ranker)" help="Ex : « meilleure cafetière ». Cet article sera plus long et présentera chacun des satellites.">
            <input
              type="text"
              value={pillarKw}
              onChange={(e) => setPillarKw(e.target.value)}
              placeholder="meilleure cafetière"
              className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
            />
          </Field>
        ) : (
          <Field label="URL de la page pilier existante" help="Tous les satellites pointeront vers cette URL avec des ancres diversifiées.">
            <input
              type="url"
              value={pillarUrl}
              onChange={(e) => setPillarUrl(e.target.value)}
              placeholder="https://striq.fr/blog/cafetiere/"
              className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2 font-mono text-xs"
            />
          </Field>
        )}
      </section>

      {/* Base URL */}
      <section className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4">
        <h2 className="text-xs uppercase tracking-wider text-zinc-500">
          2. URL de base des articles
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <Field label="Base URL" help="Slug de chaque article ajouté après. Ex : https://striq.fr/blog/  →  https://striq.fr/blog/cafetiere-grain/">
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://striq.fr/blog/"
              className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2 font-mono text-xs"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm pb-2.5">
            <input
              type="checkbox"
              checked={trailing}
              onChange={(e) => setTrailing(e.target.checked)}
            />
            <code>/</code> à la fin de l'URL
          </label>
        </div>
        {!usePillarUrl && pillarSlug && baseUrlOk && (
          <div className="text-xs text-zinc-500">
            URL pilier prévue :{" "}
            <code className="text-accent-300">{pillarFinalUrl}</code>
          </div>
        )}
      </section>

      {/* Satellites */}
      <section className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4">
        <h2 className="text-xs uppercase tracking-wider text-zinc-500">
          3. Mots-clés satellites <span className="text-zinc-600">(un par ligne)</span>
        </h2>
        <textarea
          value={satText}
          onChange={(e) => setSatText(e.target.value)}
          rows={6}
          placeholder={"meilleure cafetière à grain\ncomment choisir une cafetière expresso\ncafetière filtre vs capsule\n..."}
          className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2 font-mono text-xs resize-y"
        />
        {sats.length > 0 && (
          <div className="border border-ink-800 rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-zinc-500 bg-ink-900/80">
                <tr>
                  <th className="text-left px-3 py-2">Mot-clé</th>
                  <th className="text-left px-3 py-2 w-1/3">Slug (éditable)</th>
                  <th className="text-left px-3 py-2">URL générée</th>
                </tr>
              </thead>
              <tbody>
                {sats.map((s) => {
                  const url = joinUrl(baseUrl, s.slug, trailing);
                  const dup = dupSlug === s.slug;
                  return (
                    <tr key={s.kw} className="border-t border-ink-800">
                      <td className="px-3 py-2 text-zinc-200">{s.kw}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <input
                            value={s.slug}
                            onChange={(e) => setSlug(s.kw, e.target.value)}
                            className={`flex-1 bg-ink-800 border rounded px-2 py-1 font-mono ${
                              dup ? "border-red-500 text-red-300" : "border-ink-700"
                            }`}
                          />
                          {!s.auto && (
                            <button
                              onClick={() => resetSlug(s.kw)}
                              className="text-[10px] text-zinc-500 hover:text-zinc-300"
                              title="Restaurer le slug auto"
                            >
                              ↺
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-zinc-500 truncate font-mono">{url}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {dupSlug && (
              <div className="px-3 py-2 text-xs text-red-300 bg-red-500/5 border-t border-red-500/20">
                ⚠ Slug dupliqué : <code>{dupSlug}</code> — modifie-le pour qu'il soit unique.
              </div>
            )}
          </div>
        )}
      </section>

      {/* Common params */}
      <section className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4">
        <h2 className="text-xs uppercase tracking-wider text-zinc-500">
          4. Paramètres communs
        </h2>
        <CountryPicker
          countryCode={locationCode}
          languageCode={languageCode}
          onChange={(c, l) => { setLocationCode(c); setLanguageCode(l); }}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Domaine indexé (optionnel)" help="Sert juste pour le contexte SERP — le maillage interne du silo s'auto-construit, indépendamment de l'index.">
            <select
              value={domainId}
              onChange={(e) => setDomainId(e.target.value)}
              className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
            >
              <option value="">(aucun)</option>
              {(domains || []).filter((d) => d.status === "ready").map((d) => (
                <option key={d.id} value={d.id}>{d.hostname}</option>
              ))}
            </select>
          </Field>
          <Field label="Dossier de classement" help="Tous les contenus du silo seront classés ici.">
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
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useHaiku} onChange={(e) => setUseHaiku(e.target.checked)} />
            🪶 Haiku 4.5 (-66 % de coût)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={generateImage} onChange={(e) => setGenerateImage(e.target.checked)} />
            🖼️ Image par article
          </label>
          <Field label="Plafond / article ($)" help="Garde-fou par job. Au-delà, l'article s'arrête en 'capped'.">
            <input
              type="number"
              step={0.05}
              value={costCap}
              onChange={(e) => setCostCap(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
            />
          </Field>
        </div>
      </section>

      <div className="bg-ink-900 border border-ink-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 sticky bottom-3 backdrop-blur">
        <div className="text-sm">
          {totalCount === 0 ? (
            <span className="text-zinc-500">Configure le pilier et au moins 2 satellites.</span>
          ) : (
            <>
              <div className="font-medium">
                {totalCount} contenu{totalCount > 1 ? "s" : ""} à générer
                {usePillarUrl ? "" : " (1 pilier + " + sats.length + " satellites)"}
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">
                Estimation totale :{" "}
                <strong className="text-zinc-200">${estLow.toFixed(2)}</strong> –{" "}
                <strong className="text-zinc-200">${estHigh.toFixed(2)}</strong>
              </div>
            </>
          )}
        </div>
        <button
          disabled={!canSubmit}
          onClick={submit}
          className="bg-accent-600 hover:bg-accent-500 disabled:opacity-40 px-5 py-2.5 rounded font-medium text-sm"
        >
          {busy ? "Lancement…" : "Lancer le silo"}
        </button>
      </div>

      {err && (
        <div className="bg-red-900/30 border border-red-700 text-red-100 p-3 rounded-xl text-sm">
          {err}
        </div>
      )}
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
