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

type Row = { id: string; keyword: string; content_type: ContentType };
type Estimate = { items: number; low_total: number; high_total: number };

function newRow(content_type: ContentType = "blog"): Row {
  return { id: crypto.randomUUID(), keyword: "", content_type };
}

export default function NewContentPage() {
  const router = useRouter();
  const { data: domains } = useSWR<Domain[]>("/api/domains", fetcher);
  const { data: folders } = useSWR<Folder[]>("/api/folders", fetcher);

  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [locationCode, setLocationCode] = useState(2250);
  const [languageCode, setLanguageCode] = useState("fr");
  const [domainId, setDomainId] = useState<string>("");
  const [folderId, setFolderId] = useState<string>("");
  const [internalLinking, setInternalLinking] = useState(true);
  const [autoValidate, setAutoValidate] = useState(true);
  const [costCap, setCostCap] = useState<number | "">(1.0);

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const readyDomains = (domains || []).filter((d) => d.status === "ready");
  const validRows = rows.filter((r) => r.keyword.trim().length > 0);

  useEffect(() => {
    if (validRows.length === 0) {
      setEstimate(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const e = await api<Estimate>("/api/jobs/batch/estimate", {
          method: "POST",
          json: {
            items: validRows.map((r) => ({
              keyword: r.keyword.trim(),
              content_type: r.content_type,
            })),
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
    }, 300);
    return () => clearTimeout(t);
  }, [
    JSON.stringify(validRows),
    locationCode,
    languageCode,
    domainId,
    internalLinking,
    autoValidate,
  ]);

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeRow(id: string) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.id !== id)));
  }
  function addRow() {
    setRows((prev) => [...prev, newRow(prev.at(-1)?.content_type)]);
  }
  function pasteBulk(text: string) {
    const newRows: Row[] = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Accept "keyword" or "keyword,type" or "keyword;type"
      const [kw, type] = trimmed.split(/[;,]\s*/);
      const ctype = (CONTENT_TYPES.find((c) => c.value === type)?.value ?? "blog") as ContentType;
      newRows.push({ id: crypto.randomUUID(), keyword: kw.trim(), content_type: ctype });
    }
    if (newRows.length > 0) {
      setRows(newRows);
      setPasteOpen(false);
    }
  }

  async function submit() {
    if (validRows.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ batch_id: string; jobs: { id: string }[] }>(
        "/api/jobs/batch",
        {
          method: "POST",
          json: {
            items: validRows.map((r) => ({
              keyword: r.keyword.trim(),
              content_type: r.content_type,
            })),
            location_code: locationCode,
            language_code: languageCode,
            domain_id: domainId || null,
            folder_id: folderId || null,
            internal_linking: internalLinking && !!domainId,
            auto_validate_blueprint: autoValidate,
            cost_cap: costCap === "" ? null : Number(costCap),
          },
        }
      );
      router.push(`/batches/${res.batch_id}`);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Nouveau lot de contenus</h1>
        <button
          onClick={() => setPasteOpen((v) => !v)}
          className="text-xs text-accent-500 hover:underline"
        >
          {pasteOpen ? "Fermer" : "Coller depuis CSV / liste"}
        </button>
      </div>

      {pasteOpen && (
        <PasteArea onApply={pasteBulk} onCancel={() => setPasteOpen(false)} />
      )}

      <div className="bg-ink-900 border border-ink-800 rounded-xl">
        <div className="grid grid-cols-[1fr_180px_40px] text-xs uppercase tracking-wider text-zinc-500 px-4 py-2 border-b border-ink-800">
          <span>Mot-clé</span>
          <span>Type</span>
          <span></span>
        </div>
        {rows.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-[1fr_180px_40px] gap-2 px-4 py-2 border-b border-ink-800 last:border-0"
          >
            <input
              value={r.keyword}
              onChange={(e) => updateRow(r.id, { keyword: e.target.value })}
              placeholder="ex: meilleure cafetière à grain"
              className="bg-ink-800 border border-ink-700 rounded px-2 py-1.5 text-sm"
            />
            <select
              value={r.content_type}
              onChange={(e) => updateRow(r.id, { content_type: e.target.value as ContentType })}
              className="bg-ink-800 border border-ink-700 rounded px-2 py-1.5 text-sm"
            >
              {CONTENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => removeRow(r.id)}
              disabled={rows.length === 1}
              className="text-zinc-500 hover:text-red-400 disabled:opacity-30 text-lg"
              title="Retirer"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={addRow}
          className="w-full text-sm text-accent-500 hover:bg-ink-800/50 py-2"
        >
          + Ajouter un mot-clé
        </button>
      </div>

      <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm uppercase tracking-wider text-zinc-500">
          Paramètres communs
        </h2>

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

        <Field label="Dossier de classement">
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

        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!domainId}
              checked={internalLinking && !!domainId}
              onChange={(e) => setInternalLinking(e.target.checked)}
            />
            Maillage interne automatique
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoValidate}
              onChange={(e) => setAutoValidate(e.target.checked)}
            />
            Auto-valider les blueprints (sans pause)
          </label>
        </div>

        <Field label="Plafond de coût par mot-clé (USD)">
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
          {estimate.items} contenu{estimate.items > 1 ? "s" : ""} → estimation totale :{" "}
          <strong>${estimate.low_total.toFixed(3)}</strong> –{" "}
          <strong>${estimate.high_total.toFixed(3)}</strong>
        </div>
      )}

      {err && <p className="text-sm text-red-400">{err}</p>}

      <button
        disabled={validRows.length === 0 || busy}
        onClick={submit}
        className="bg-accent-600 hover:bg-accent-500 disabled:opacity-50 px-4 py-2 rounded font-medium"
      >
        {busy
          ? "Lancement…"
          : `Lancer ${validRows.length} génération${validRows.length > 1 ? "s" : ""}`}
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

function PasteArea({
  onApply,
  onCancel,
}: {
  onApply: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-4 space-y-2">
      <p className="text-xs text-zinc-500">
        Une ligne par mot-clé. Format : <code>mot-clé</code> ou{" "}
        <code>mot-clé, blog</code> / <code>mot-clé, product</code> / etc.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2 text-sm font-mono"
        placeholder={"meilleure cafetière, blog\nfiltre eau pas cher, product\nlocation utilitaire, service_lp"}
      />
      <div className="flex gap-2">
        <button
          onClick={() => onApply(text)}
          className="bg-accent-600 hover:bg-accent-500 rounded px-3 py-1.5 text-sm"
        >
          Importer
        </button>
        <button onClick={onCancel} className="text-zinc-400 text-sm hover:underline">
          Annuler
        </button>
      </div>
    </div>
  );
}
