"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Domain, Folder } from "@/lib/types";
import { CountryPicker } from "@/components/CountryPicker";
import { HelpIcon } from "@/components/Tooltip";
import { Icon } from "@/components/Icon";

// Mirror of backend/app/services/slug.slugify — keep in sync.
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
  const [domainId, setDomainId] = useState("");
  const [folderId, setFolderId] = useState("");
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
  const pillarSlug = usePillarUrl ? "" : slugify(pillarKw);
  const pillarFinalUrl = usePillarUrl ? pillarUrl : joinUrl(baseUrl, pillarSlug, trailing);

  const baseUrlOk = /^https?:\/\/.+/i.test(baseUrl) && baseUrl !== "https://";
  const pillarOk = usePillarUrl
    ? /^https?:\/\/.+/i.test(pillarUrl)
    : pillarKw.trim().length > 0;
  const satsOk = sats.length >= 2;
  const slugSet = new Set<string>();
  let dupSlug: string | null = null;
  for (const s of sats) {
    if (slugSet.has(s.slug)) { dupSlug = s.slug; break; }
    slugSet.add(s.slug);
  }
  if (!usePillarUrl && pillarSlug && slugSet.has(pillarSlug)) dupSlug = pillarSlug;
  const canSubmit = baseUrlOk && pillarOk && satsOk && !dupSlug && !busy;

  const totalCount = sats.length + (usePillarUrl ? 0 : 1);
  const perLow = useHaiku ? 0.05 : 0.12;
  const perHigh = useHaiku ? 0.10 : 0.22;
  const estLow = totalCount * perLow;
  const estHigh = totalCount * perHigh;

  function setSlug(kw: string, slug: string) {
    setOverrides((prev) => ({ ...prev, [kw]: slug }));
  }
  function resetSlug(kw: string) {
    setOverrides((prev) => { const o = { ...prev }; delete o[kw]; return o; });
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
    <div className="space-y-7 animate-fadein">
      <header>
        <div className="eyebrow mb-2">Création</div>
        <h1 className="h-page flex items-center gap-2">
          <Icon name="silo" size={24} className="text-accent-400" />
          Nouveau silo SEO
        </h1>
        <p className="h-sub max-w-2xl">
          Une page pilier (à générer ou existante) + N satellites, tous générés en
          parallèle et déjà maillés. Le pilier introduit chaque satellite ; chaque
          satellite pointe vers le pilier dans ses 3 premiers paragraphes et tisse
          des liens contextuels naturels vers ses voisins.
        </p>
      </header>

      {/* Live silo schema preview */}
      <SiloSchema
        pillarLabel={usePillarUrl ? "(URL existante)" : pillarKw || "—"}
        satellites={sats.map((s) => s.kw)}
      />

      {/* PILIER */}
      <Card title="Page pilier" stepIndex={1}>
        <div className="inline-flex bg-white/[0.025] border border-[var(--border)] rounded-lg p-0.5 text-xs">
          {[
            { id: "kw", label: "Générer le pilier", val: false },
            { id: "url", label: "Pilier déjà existant", val: true },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setUsePillarUrl(opt.val)}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                usePillarUrl === opt.val
                  ? "bg-accent-600/20 text-white"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {!usePillarUrl ? (
          <Field label="Mot-clé pilier" help="La requête sur laquelle le silo doit ranker. Ex : « meilleure cafetière ».">
            <input
              type="text"
              value={pillarKw}
              onChange={(e) => setPillarKw(e.target.value)}
              placeholder="meilleure cafetière"
              className="input"
            />
          </Field>
        ) : (
          <Field label="URL de la page pilier existante" help="Tous les satellites pointeront vers cette URL avec des ancres diversifiées.">
            <input
              type="url"
              value={pillarUrl}
              onChange={(e) => setPillarUrl(e.target.value)}
              placeholder="https://striq.fr/blog/cafetiere/"
              className="input font-mono text-xs"
            />
          </Field>
        )}
      </Card>

      {/* URL DE BASE */}
      <Card title="URL de base des articles" stepIndex={2}>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <Field label="Base URL" help="Le slug de chaque article s'ajoute après. Ex : https://striq.fr/blog/  →  https://striq.fr/blog/cafetiere-grain/">
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://striq.fr/blog/"
              className="input font-mono text-xs"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-zinc-300 pb-2.5 whitespace-nowrap">
            <input
              type="checkbox"
              checked={trailing}
              onChange={(e) => setTrailing(e.target.checked)}
              className="accent-accent-500"
            />
            <code className="bg-white/[0.025] px-1.5 py-0.5 rounded text-xs">/</code>
            à la fin
          </label>
        </div>
        {!usePillarUrl && pillarSlug && baseUrlOk && (
          <div className="text-xs text-zinc-500">
            URL pilier prévue :{" "}
            <code className="text-accent-300 break-all">{pillarFinalUrl}</code>
          </div>
        )}
      </Card>

      {/* SATELLITES */}
      <Card
        title={`Mots-clés satellites${sats.length ? ` (${sats.length})` : ""}`}
        subtitle="un par ligne"
        stepIndex={3}
      >
        <textarea
          value={satText}
          onChange={(e) => setSatText(e.target.value)}
          rows={5}
          placeholder={"meilleure cafetière à grain\ncomment choisir une cafetière expresso\ncafetière filtre vs capsule"}
          className="input font-mono text-xs leading-relaxed resize-y min-h-[100px]"
        />
        {sats.length > 0 && (
          <div className="border border-[var(--border)] rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-[0.06em] text-zinc-500 bg-white/[0.025]">
                <tr>
                  <th className="text-left px-3 py-2.5 w-1/3">Mot-clé</th>
                  <th className="text-left px-3 py-2.5 w-[260px]">Slug (éditable)</th>
                  <th className="text-left px-3 py-2.5">URL générée</th>
                </tr>
              </thead>
              <tbody>
                {sats.map((s) => {
                  const url = joinUrl(baseUrl, s.slug, trailing);
                  const dup = dupSlug === s.slug;
                  return (
                    <tr
                      key={s.kw}
                      className="border-t border-[var(--border)] hover:bg-white/[0.05]"
                    >
                      <td className="px-3 py-2 text-zinc-200">{s.kw}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <input
                            value={s.slug}
                            onChange={(e) => setSlug(s.kw, e.target.value)}
                            className={`flex-1 bg-white/[0.025] border rounded px-2 py-1 font-mono focus:outline-none focus:border-accent-500 ${
                              dup ? "border-red-500 text-red-300" : "border-[var(--border)]"
                            }`}
                          />
                          {!s.auto && (
                            <button
                              onClick={() => resetSlug(s.kw)}
                              className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5"
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
                ⚠ Slug dupliqué : <code className="bg-red-500/10 px-1 rounded">{dupSlug}</code> — modifie-le pour qu'il soit unique.
              </div>
            )}
          </div>
        )}
      </Card>

      {/* PARAMÈTRES COMMUNS */}
      <Card title="Paramètres communs" stepIndex={4}>
        <CountryPicker
          countryCode={locationCode}
          languageCode={languageCode}
          onChange={(c, l) => { setLocationCode(c); setLanguageCode(l); }}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Domaine indexé" help="Optionnel. Sert juste pour le contexte SERP — le maillage interne du silo s'auto-construit indépendamment de l'index.">
            <select
              value={domainId}
              onChange={(e) => setDomainId(e.target.value)}
              className="input"
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
              className="input"
            >
              <option value="">(aucun)</option>
              {folders?.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ToggleRow
            checked={useHaiku}
            onChange={setUseHaiku}
            label="🪶 Haiku 4.5"
            sub="−66 % de coût"
          />
          <ToggleRow
            checked={generateImage}
            onChange={setGenerateImage}
            label="🖼️ Image"
            sub="par article"
          />
          <Field label="Plafond / article ($)" help="Garde-fou par job. Au-delà, l'article s'arrête en 'capped'.">
            <input
              type="number"
              step={0.05}
              value={costCap}
              onChange={(e) => setCostCap(e.target.value === "" ? "" : Number(e.target.value))}
              className="input"
            />
          </Field>
        </div>
      </Card>

      {/* STICKY CTA */}
      <div className="card-elevated p-4 flex flex-wrap items-center justify-between gap-3 sticky bottom-3 backdrop-blur-md">
        <div className="text-sm">
          {totalCount === 0 ? (
            <span className="text-zinc-500">Configure le pilier et au moins 2 satellites.</span>
          ) : (
            <>
              <div className="font-medium tabular-nums text-zinc-100">
                {totalCount} contenu{totalCount > 1 ? "s" : ""} à générer
                <span className="text-zinc-500 font-normal">
                  {!usePillarUrl ? ` · 1 pilier + ${sats.length} satellites` : ` · ${sats.length} satellites`}
                </span>
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">
                Estimation totale :{" "}
                <strong className="text-zinc-200 tabular-nums">${estLow.toFixed(2)}</strong>
                {" – "}
                <strong className="text-zinc-200 tabular-nums">${estHigh.toFixed(2)}</strong>
              </div>
            </>
          )}
        </div>
        <button disabled={!canSubmit} onClick={submit} className="btn-primary">
          {busy ? (
            <>
              <Icon name="spinner" size={14} /> Lancement…
            </>
          ) : (
            <>
              <Icon name="play" size={14} /> Lancer le silo
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
    </div>
  );
}

function SiloSchema({ pillarLabel, satellites }: { pillarLabel: string; satellites: string[] }) {
  const n = satellites.length;
  return (
    <div className="card px-6 py-5">
      <div className="flex flex-col items-center gap-3">
        <div className="px-4 py-2 rounded-lg border border-accent-500/40 bg-accent-500/10 text-accent-200 text-xs font-medium tracking-wide uppercase max-w-[400px] text-center">
          ◉ Pilier · <span className="text-accent-100 font-semibold normal-case tracking-normal">{pillarLabel || "—"}</span>
        </div>
        <div className="text-zinc-700 text-xs">↓ {n || "?"} lien{n > 1 ? "s sortants" : " sortant"} contextuels</div>
        <div className="flex flex-wrap gap-2 justify-center max-w-3xl">
          {n === 0 ? (
            <div className="text-zinc-600 text-xs italic">Ajoute des mots-clés satellites ↓</div>
          ) : (
            satellites.slice(0, 16).map((s, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-200 text-[11px] truncate max-w-[180px]"
                title={s}
              >
                ○ {s}
              </span>
            ))
          )}
          {n > 16 && <span className="text-xs text-zinc-500 self-center">+{n - 16} autres</span>}
        </div>
        {n >= 2 && (
          <div className="text-[10px] text-zinc-600 italic">
            Chaque satellite pointe vers le pilier (intro) + ses voisins thématiques contextuellement
          </div>
        )}
      </div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  stepIndex,
  children,
}: {
  title: string;
  subtitle?: string;
  stepIndex?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="label flex items-center gap-2">
          {stepIndex != null && (
            <span className="w-5 h-5 rounded-full bg-white/[0.04] border border-[var(--border-strong)] inline-flex items-center justify-center text-[10px] text-zinc-300">
              {stepIndex}
            </span>
          )}
          {title}
          {subtitle && <span className="text-zinc-600 lowercase font-normal">— {subtitle}</span>}
        </h2>
      </div>
      {children}
    </section>
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

function ToggleRow({
  checked,
  onChange,
  label,
  sub,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sub?: string;
}) {
  return (
    <label className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
      checked ? "border-accent-500/40 bg-accent-500/5" : "border-[var(--border)] bg-white/[0.025] hover:bg-white/[0.05]"
    }`}>
      <div className="flex flex-col">
        <span className="text-sm text-zinc-200">{label}</span>
        {sub && <span className="text-[10px] text-zinc-500">{sub}</span>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-accent-500"
      />
    </label>
  );
}
