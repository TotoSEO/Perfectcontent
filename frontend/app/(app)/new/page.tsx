"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { ContentType, Domain, Folder } from "@/lib/types";

const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: "blog", label: "Article de blog" },
  { value: "category", label: "Catégorie produit" },
  { value: "product", label: "Fiche produit" },
  { value: "service_lp", label: "Service / Landing page" },
];

type Estimate = { low: number; high: number };
type Conflict = {
  source: "indexed" | "draft";
  url: string | null;
  title: string | null;
  similarity: number;
};

export default function NewContentPage() {
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
  const [costCap, setCostCap] = useState<number | "">(1.0);

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const readyDomains = (domains || []).filter((d) => d.status === "ready");

  useEffect(() => {
    if (!keyword.trim()) {
      setEstimate(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const e = await api<Estimate>("/api/jobs/estimate", {
          method: "POST",
          json: {
            keyword,
            content_type: contentType,
            location_code: locationCode,
            language_code: languageCode,
            domain_id: domainId || null,
            internal_linking: internalLinking && !!domainId,
          },
        });
        setEstimate(e);
      } catch {
        setEstimate(null);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [keyword, contentType, locationCode, languageCode, domainId, internalLinking]);

  useEffect(() => {
    if (!domainId || !keyword.trim()) {
      setConflicts(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await api<{ conflicts: Conflict[] }>(
          "/api/jobs/cannibalization-check",
          {
            method: "POST",
            json: { keyword, domain_id: domainId },
          }
        );
        setConflicts(r.conflicts);
      } catch {
        setConflicts(null);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [domainId, keyword]);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const job = await api<{ id: string }>("/api/jobs", {
        method: "POST",
        json: {
          keyword,
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
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Nouveau contenu</h1>

      <div className="space-y-4 bg-ink-900 border border-ink-800 rounded-xl p-5">
        <Field label="Mot-clé">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
            placeholder="ex: meilleure cafetière à grain"
          />
        </Field>

        <Field label="Type de contenu">
          <select
            value={contentType}
            onChange={(e) => setContentType(e.target.value as ContentType)}
            className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
          >
            {CONTENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Location code (DataForSEO)">
            <input
              type="number"
              value={locationCode}
              onChange={(e) => setLocationCode(Number(e.target.value))}
              className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
            />
          </Field>
          <Field label="Langue">
            <input
              value={languageCode}
              onChange={(e) => setLanguageCode(e.target.value)}
              className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
            />
          </Field>
        </div>

        <Field label="Dossier">
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

        <Field label="Domaine cible (pour le maillage interne)">
          <select
            value={domainId}
            onChange={(e) => setDomainId(e.target.value)}
            className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
          >
            <option value="">(aucun)</option>
            {readyDomains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.hostname} ({d.pages_count} pages)
              </option>
            ))}
          </select>
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            disabled={!domainId}
            checked={internalLinking && !!domainId}
            onChange={(e) => setInternalLinking(e.target.checked)}
          />
          Maillage interne automatique
        </label>

        <Field label="Plafond de coût (USD)">
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
      </div>

      {estimate && (
        <div className="text-sm text-zinc-300">
          Estimation : <strong>${estimate.low.toFixed(3)}</strong> –{" "}
          <strong>${estimate.high.toFixed(3)}</strong>
        </div>
      )}

      {conflicts && conflicts.length > 0 && (
        <div className="bg-amber-900/30 border border-amber-700 text-amber-100 rounded p-3 text-sm space-y-1">
          <div className="font-semibold">Cannibalisation potentielle :</div>
          <ul className="list-disc list-inside">
            {conflicts.map((c, i) => (
              <li key={i}>
                {c.source === "indexed" ? c.url : c.title} —{" "}
                similarité {Math.round(c.similarity * 100)}%
              </li>
            ))}
          </ul>
        </div>
      )}

      {err && <p className="text-sm text-red-400">{err}</p>}

      <button
        disabled={!keyword || busy}
        onClick={submit}
        className="bg-accent-600 hover:bg-accent-500 disabled:opacity-50 px-4 py-2 rounded font-medium"
      >
        {busy ? "Lancement…" : "Lancer la génération"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
