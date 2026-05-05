"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { ContentType, Domain, Folder } from "@/lib/types";
import { HelpIcon } from "@/components/Tooltip";

type Bucket = {
  type: ContentType;
  label: string;
  hint: string;
  emoji: string;
};

const BUCKETS: Bucket[] = [
  {
    type: "blog",
    label: "Articles de blog",
    hint: "Contenu informationnel : guides, comparatifs, tutoriels.",
    emoji: "📝",
  },
  {
    type: "category",
    label: "Catégories produit",
    hint: "Pages de listing e-commerce avec critères de choix.",
    emoji: "🗂️",
  },
  {
    type: "product",
    label: "Fiches produit",
    hint: "Description orientée décision d'achat avec FAQ courte.",
    emoji: "🛒",
  },
  {
    type: "service_lp",
    label: "Pages service / Landing",
    hint: "Promesse + bénéfices + preuves, structurée pour la conversion.",
    emoji: "🎯",
  },
];

type Estimate = { items: number; low_total: number; high_total: number };

function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export default function NewContentPage() {
  const router = useRouter();
  const { data: domains } = useSWR<Domain[]>("/api/domains", fetcher);
  const { data: folders } = useSWR<Folder[]>("/api/folders", fetcher);

  const [texts, setTexts] = useState<Record<ContentType, string>>({
    blog: "",
    category: "",
    product: "",
    service_lp: "",
  });
  const [locationCode, setLocationCode] = useState(2250);
  const [languageCode, setLanguageCode] = useState("fr");
  const [domainId, setDomainId] = useState<string>("");
  const [folderId, setFolderId] = useState<string>("");
  const [internalLinking, setInternalLinking] = useState(true);
  const [autoValidate, setAutoValidate] = useState(true);
  const [costCap, setCostCap] = useState<number | "">(1.0);

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const readyDomains = (domains || []).filter((d) => d.status === "ready");

  const items = (Object.keys(texts) as ContentType[]).flatMap((type) =>
    parseLines(texts[type]).map((keyword) => ({ keyword, content_type: type }))
  );
  const totalCount = items.length;
  const perBucket = BUCKETS.map((b) => ({ ...b, count: parseLines(texts[b.type]).length }));

  useEffect(() => {
    if (totalCount === 0) {
      setEstimate(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const e = await api<Estimate>("/api/jobs/batch/estimate", {
          method: "POST",
          json: {
            items,
            location_code: locationCode,
            language_code: languageCode,
            domain_id: domainId || null,
            internal_linking: internalLinking && !!domainId,
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
  }, [totalCount, locationCode, languageCode, domainId, internalLinking, autoValidate]);

  async function submit() {
    if (totalCount === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ batch_id: string }>("/api/jobs/batch", {
        method: "POST",
        json: {
          items,
          location_code: locationCode,
          language_code: languageCode,
          domain_id: domainId || null,
          folder_id: folderId || null,
          internal_linking: internalLinking && !!domainId,
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
    <div className="space-y-6 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Nouveau lot de contenus</h1>
        <p className="text-sm text-zinc-500">
          Colle tes mots-clés dans la catégorie correspondante. Un mot-clé par ligne.
          Toutes les catégories sont lancées dans le même lot.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {BUCKETS.map((b) => {
          const count = parseLines(texts[b.type]).length;
          return (
            <div
              key={b.type}
              className={`bg-ink-900 border rounded-xl overflow-hidden transition ${
                count > 0 ? "border-accent-500/60" : "border-ink-800"
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
                rows={6}
                placeholder={`un mot-clé par ligne, ex:\nmeilleure cafetière à grain\nfiltre eau pas cher`}
                className="w-full bg-ink-900 px-4 py-3 text-sm font-mono leading-relaxed focus:outline-none resize-y min-h-[140px]"
              />
            </div>
          );
        })}
      </div>

      <section className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm uppercase tracking-wider text-zinc-500">
            Paramètres communs au lot
          </h2>
          <HelpIcon content="Ces réglages s'appliquent à tous les mots-clés du lot." />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Location code (Google)"
            help="Code DataForSEO du pays/région ciblé. France = 2250, Belgique = 2056, Suisse = 2756, USA = 2840, Canada = 2124."
          >
            <input
              type="number"
              value={locationCode}
              onChange={(e) => setLocationCode(Number(e.target.value))}
              className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
            />
          </Field>
          <Field label="Langue" help="Code ISO de la langue (fr, en, es, de…).">
            <input
              value={languageCode}
              onChange={(e) => setLanguageCode(e.target.value)}
              className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
            />
          </Field>
        </div>

        <Field
          label="Dossier de classement"
          help="Tous les contenus du lot iront dans ce dossier. Crée-en un dans l'onglet Dossiers."
        >
          <select
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
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
          help="Si tu sélectionnes un domaine déjà indexé, on insérera des liens internes vers ses pages dans tes contenus. Ajoute un domaine via l'onglet Domaines."
        >
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
              disabled={!domainId}
              checked={internalLinking && !!domainId}
              onChange={(e) => setInternalLinking(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Maillage interne automatique
              <HelpIcon content="On cherche dans l'index du domaine choisi des pages sémantiquement proches de chaque section, et on insère des liens naturels avec ancre validée par Claude." />
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoValidate}
              onChange={(e) => setAutoValidate(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Auto-valider les blueprints
              <HelpIcon content="Si coché, le pipeline ne s'arrête pas pour te faire valider le plan d'article : il enchaîne directement la génération. Pratique en mode batch." />
            </span>
          </label>
        </div>

        <Field
          label="Plafond de coût par mot-clé (USD)"
          help="Si la génération d'un mot-clé dépasse ce montant, on l'arrête proprement (statut 'capped'). Garde-fou contre les surprises de facturation."
        >
          <input
            type="number"
            step={0.05}
            value={costCap}
            onChange={(e) =>
              setCostCap(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
          />
        </Field>
      </section>

      <div className="bg-ink-900 border border-ink-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {totalCount === 0 ? (
            <span className="text-zinc-500">Aucun mot-clé pour l'instant.</span>
          ) : (
            <>
              <div className="font-medium">
                {totalCount} contenu{totalCount > 1 ? "s" : ""} à générer
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                {perBucket
                  .filter((p) => p.count > 0)
                  .map((p) => `${p.count} ${p.label.toLowerCase()}`)
                  .join(" · ")}
              </div>
              {estimate && (
                <div className="text-xs text-zinc-400 mt-0.5">
                  Estimation :{" "}
                  <strong className="text-zinc-200">
                    ${estimate.low_total.toFixed(3)}
                  </strong>{" "}
                  –{" "}
                  <strong className="text-zinc-200">
                    ${estimate.high_total.toFixed(3)}
                  </strong>
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
          {busy
            ? "Lancement…"
            : `Lancer la génération${totalCount > 1 ? ` (${totalCount})` : ""}`}
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
      <span className="text-xs uppercase tracking-wider text-zinc-500 inline-flex items-center">
        {label}
        {help && <HelpIcon content={help} />}
      </span>
      {children}
    </label>
  );
}
