"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { ContentType, Domain, Folder } from "@/lib/types";
import { HelpIcon } from "@/components/Tooltip";
import { CountryPicker } from "@/components/CountryPicker";

type Bucket = { type: ContentType; label: string; hint: string; emoji: string; color: string };

const BUCKETS: Bucket[] = [
  {
    type: "blog",
    label: "Articles de blog",
    hint: "Contenu informationnel : guides, comparatifs, tutoriels.",
    emoji: "📝",
    color: "border-blue-500/40 bg-blue-500/5",
  },
  {
    type: "category",
    label: "Catégories produit",
    hint: "Pages de listing e-commerce avec critères de choix.",
    emoji: "🗂️",
    color: "border-amber-500/40 bg-amber-500/5",
  },
  {
    type: "product",
    label: "Fiches produit",
    hint: "Description orientée décision d'achat avec FAQ courte.",
    emoji: "🛒",
    color: "border-emerald-500/40 bg-emerald-500/5",
  },
  {
    type: "service_lp",
    label: "Pages service / Landing",
    hint: "Promesse + bénéfices + preuves, structurée pour la conversion.",
    emoji: "🎯",
    color: "border-pink-500/40 bg-pink-500/5",
  },
];

const TYPE_META: Record<ContentType, { label: string; emoji: string; color: string }> = {
  blog: { label: "Blog", emoji: "📝", color: "text-blue-300 bg-blue-500/15 border-blue-500/30" },
  category: { label: "Catégorie", emoji: "🗂️", color: "text-amber-300 bg-amber-500/15 border-amber-500/30" },
  product: { label: "Produit", emoji: "🛒", color: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30" },
  service_lp: { label: "Service / LP", emoji: "🎯", color: "text-pink-300 bg-pink-500/15 border-pink-500/30" },
};

type Estimate = { items: number; low_total: number; high_total: number };

type Row = {
  id: string;
  keyword: string;
  content_type: ContentType;
  internal_linking: boolean;
  generate_image: boolean;
  use_haiku: boolean;
};

function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export default function NewContentPage() {
  const router = useRouter();
  const { data: domains } = useSWR<Domain[]>("/srv/domains", fetcher);
  const { data: folders } = useSWR<Folder[]>("/srv/folders", fetcher);

  const [texts, setTexts] = useState<Record<ContentType, string>>({
    blog: "",
    category: "",
    product: "",
    service_lp: "",
  });
  const [overrides, setOverrides] = useState<Record<string, { internal_linking?: boolean; generate_image?: boolean; use_haiku?: boolean }>>({});

  const [locationCode, setLocationCode] = useState(2250);
  const [languageCode, setLanguageCode] = useState("fr");
  const [domainId, setDomainId] = useState<string>("");
  const [folderId, setFolderId] = useState<string>("");
  const [defaultLinking, setDefaultLinking] = useState(true);
  const [defaultImage, setDefaultImage] = useState(false);
  const [defaultHaiku, setDefaultHaiku] = useState(false);
  const [autoValidate, setAutoValidate] = useState(true);
  const [costCap, setCostCap] = useState<number | "">(1.0);

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const readyDomains = (domains || []).filter((d) => d.status === "ready");

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    (Object.keys(texts) as ContentType[]).forEach((type) => {
      parseLines(texts[type]).forEach((keyword) => {
        const id = `${type}::${keyword.toLowerCase()}`;
        const ov = overrides[id] || {};
        out.push({
          id,
          keyword,
          content_type: type,
          internal_linking:
            ov.internal_linking !== undefined ? ov.internal_linking : defaultLinking && !!domainId,
          generate_image:
            ov.generate_image !== undefined ? ov.generate_image : defaultImage,
          use_haiku:
            ov.use_haiku !== undefined ? ov.use_haiku : defaultHaiku,
        });
      });
    });
    return out;
  }, [texts, overrides, defaultLinking, defaultImage, defaultHaiku, domainId]);

  const totalCount = rows.length;

  function setRow(id: string, patch: Partial<Row>) {
    setOverrides((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        ...(patch.internal_linking !== undefined && { internal_linking: patch.internal_linking }),
        ...(patch.generate_image !== undefined && { generate_image: patch.generate_image }),
        ...(patch.use_haiku !== undefined && { use_haiku: patch.use_haiku }),
      },
    }));
  }

  useEffect(() => {
    if (totalCount === 0) {
      setEstimate(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const e = await api<Estimate>("/srv/jobs/batch/estimate", {
          method: "POST",
          json: {
            items: rows.map((r) => ({
              keyword: r.keyword,
              content_type: r.content_type,
              internal_linking: r.internal_linking,
              generate_image: r.generate_image,
              use_haiku: r.use_haiku,
            })),
            location_code: locationCode,
            language_code: languageCode,
            domain_id: domainId || null,
            internal_linking: defaultLinking && !!domainId,
            generate_image: defaultImage,
            use_haiku: defaultHaiku,
            auto_validate_blueprint: autoValidate,
            cost_cap: costCap === "" ? null : Number(costCap),
          },
        });
        setEstimate(e);
      } catch {
        setEstimate(null);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalCount, locationCode, languageCode, domainId, defaultLinking, defaultImage, autoValidate]);

  async function submit() {
    if (totalCount === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ batch_id: string }>("/srv/jobs/batch", {
        method: "POST",
        json: {
          items: rows.map((r) => ({
            keyword: r.keyword,
            content_type: r.content_type,
            internal_linking: r.internal_linking,
            generate_image: r.generate_image,
          })),
          location_code: locationCode,
          language_code: languageCode,
          domain_id: domainId || null,
          folder_id: folderId || null,
          internal_linking: defaultLinking && !!domainId,
          generate_image: defaultImage,
          auto_validate_blueprint: autoValidate,
          cost_cap: costCap === "" ? null : Number(costCap),
        },
      });
      router.push(`/batches/${res.batch_id}`);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Nouveau lot de contenus</h1>
        <p className="text-sm text-zinc-500">
          Étape 1 : colle tes mots-clés dans la bonne catégorie. Étape 2 : ajuste maillage / image
          par mot-clé si besoin. Étape 3 : tu lances.
        </p>
      </header>

      {/* Step 1 — buckets */}
      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wider text-zinc-500">
          1. Coller les mots-clés
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {BUCKETS.map((b) => {
            const count = parseLines(texts[b.type]).length;
            return (
              <div
                key={b.type}
                className={`bg-ink-900 border rounded-xl overflow-hidden transition ${
                  count > 0 ? b.color : "border-ink-800"
                }`}
              >
                <div className="flex items-center justify-between px-4 py-2 border-b border-ink-800 bg-ink-900/60">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{b.emoji}</span>
                    <span className="font-medium text-sm">{b.label}</span>
                    <HelpIcon content={b.hint} />
                  </div>
                  <span className="text-xs text-zinc-500 tabular-nums">
                    {count > 0
                      ? `${count} mot${count > 1 ? "s" : ""}-clé${count > 1 ? "s" : ""}`
                      : "—"}
                  </span>
                </div>
                <textarea
                  value={texts[b.type]}
                  onChange={(e) => setTexts({ ...texts, [b.type]: e.target.value })}
                  rows={5}
                  placeholder={`un mot-clé par ligne, ex:\nmeilleure cafetière à grain\nfiltre eau pas cher`}
                  className="w-full bg-ink-900 px-4 py-3 text-sm font-mono leading-relaxed focus:outline-none resize-y min-h-[120px]"
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* Step 2 — per-row table */}
      {totalCount > 0 && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs uppercase tracking-wider text-zinc-500">
              2. Paramétrage par mot-clé
              <HelpIcon content="Décoche maillage ou image individuellement si tu veux pas pour un kw donné. Les défauts (en haut) s'appliquent à toute nouvelle ligne." />
            </h2>
            <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
              <span>Défauts :</span>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  disabled={!domainId}
                  checked={defaultLinking && !!domainId}
                  onChange={(e) => setDefaultLinking(e.target.checked)}
                />
                🔗 maillage
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={defaultImage}
                  onChange={(e) => setDefaultImage(e.target.checked)}
                />
                🖼️ image (~$0.04 / kw)
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={defaultHaiku}
                  onChange={(e) => setDefaultHaiku(e.target.checked)}
                />
                🪶 Haiku (-66 % coût)
              </label>
            </div>
          </div>

          <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-zinc-500 bg-ink-900/80">
                <tr className="border-b border-ink-800">
                  <th className="text-left px-4 py-2">Mot-clé</th>
                  <th className="text-left px-3 py-2 w-32">Type</th>
                  <th className="text-center px-3 py-2 w-20">
                    🔗
                    <HelpIcon side="bottom" content="Maillage interne automatique pour ce mot-clé." />
                  </th>
                  <th className="text-center px-3 py-2 w-20">
                    🖼️
                    <HelpIcon side="bottom" content="Génération d'image automatique pour ce mot-clé (~$0.04 si OpenAI)." />
                  </th>
                  <th className="text-center px-3 py-2 w-20">
                    🪶
                    <HelpIcon side="bottom" content="Coche pour générer ce contenu avec Claude Haiku 4.5 au lieu de Sonnet 4.6 (-66 % de coût, qualité éditoriale légèrement moindre — utile pour les contenus secondaires)." />
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const meta = TYPE_META[r.content_type];
                  return (
                    <tr key={r.id} className="border-b border-ink-800 last:border-0 hover:bg-ink-800/30">
                      <td className="px-4 py-2 font-mono text-xs">{r.keyword}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider border rounded-full px-2 py-0.5 ${meta.color}`}
                        >
                          <span>{meta.emoji}</span>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          disabled={!domainId}
                          checked={r.internal_linking && !!domainId}
                          onChange={(e) => setRow(r.id, { internal_linking: e.target.checked })}
                          title={!domainId ? "Ajoute un domaine cible pour activer le maillage" : ""}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={r.generate_image}
                          onChange={(e) => setRow(r.id, { generate_image: e.target.checked })}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={r.use_haiku}
                          onChange={(e) => setRow(r.id, { use_haiku: e.target.checked })}
                          title="Génère ce contenu avec Haiku 4.5 (moins cher, légèrement moins fin)"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Step 3 — common params */}
      <section className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500">
            3. Paramètres communs
          </h2>
          <HelpIcon content="Réglages appliqués à tous les mots-clés du lot." />
        </div>

        <CountryPicker
          countryCode={locationCode}
          languageCode={languageCode}
          onChange={(c, l) => { setLocationCode(c); setLanguageCode(l); }}
        />

        <Field label="Dossier de classement" help="Tous les contenus du lot iront dans ce dossier.">
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

        <Field label="Domaine cible" help="Sélectionne un domaine indexé pour activer le maillage interne. Décoche par mot-clé dans le tableau ci-dessus si tu veux exclure certains contenus.">
          <select
            value={domainId}
            onChange={(e) => setDomainId(e.target.value)}
            className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
          >
            <option value="">(aucun)</option>
            {readyDomains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.hostname} — {d.pages_count} pages
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoValidate}
              onChange={(e) => setAutoValidate(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Auto-valider les blueprints
              <HelpIcon content="Si coché, le pipeline ne s'arrête pas pour te faire valider chaque plan d'article. Pratique en mode batch." />
            </span>
          </label>
          <Field label="Plafond de coût / mot-clé (USD)" help="Garde-fou. Au-delà, le job s'arrête en 'capped'.">
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
            <span className="text-zinc-500">Aucun mot-clé pour l'instant.</span>
          ) : (
            <>
              <div className="font-medium">
                {totalCount} contenu{totalCount > 1 ? "s" : ""} prêt{totalCount > 1 ? "s" : ""} à lancer
              </div>
              {estimate && (
                <div className="text-xs text-zinc-400 mt-0.5">
                  Estimation totale :{" "}
                  <strong className="text-zinc-200">${estimate.low_total.toFixed(3)}</strong> –{" "}
                  <strong className="text-zinc-200">${estimate.high_total.toFixed(3)}</strong>
                </div>
              )}
            </>
          )}
        </div>
        <button
          disabled={totalCount === 0 || busy}
          onClick={submit}
          className="bg-accent-600 hover:bg-accent-500 disabled:opacity-50 px-5 py-2.5 rounded font-medium text-sm shadow"
        >
          {busy ? "Lancement…" : `Lancer la génération${totalCount > 1 ? ` (${totalCount})` : ""}`}
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
