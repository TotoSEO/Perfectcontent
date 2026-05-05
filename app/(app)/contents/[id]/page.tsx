"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { api, API_BASE, fetcher } from "@/lib/api";
import { Content } from "@/lib/types";
import { ContentEditor } from "@/components/ContentEditor";
import { LinkSuggestionsPanel } from "@/components/LinkSuggestionsPanel";
import { CoverageBadge } from "@/components/CoverageBadge";
import { SectionList } from "@/components/SectionList";
import { SemanticScore } from "@/components/SemanticScore";
import { ImagePanel } from "@/components/ImagePanel";
import { CompetitorsPanel } from "@/components/CompetitorsPanel";
import { useRouter } from "next/navigation";

export default function ContentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const { data: content, mutate } = useSWR<Content>(
    id ? `/srv/contents/${id}` : null,
    fetcher,
    { refreshInterval: 4000 }
  );

  const [html, setHtml] = useState("");
  const [chosenIdx, setChosenIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (content?.html) setHtml(content.html);
    if (content?.title_variants && content.chosen_title) {
      const idx = content.title_variants.findIndex(
        (v) => v.title === content.chosen_title
      );
      if (idx >= 0) setChosenIdx(idx);
    }
  }, [content?.html, content?.chosen_title, content?.title_variants]);

  if (!content) return <p className="text-zinc-500">Chargement…</p>;

  const variants = content.title_variants || [];
  const chosen = variants[chosenIdx];

  async function save() {
    setSaving(true);
    try {
      await api(`/srv/contents/${id}`, {
        method: "PATCH",
        json: {
          html,
          chosen_title: chosen?.title,
          chosen_meta: chosen?.meta,
        },
      });
      mutate();
    } finally {
      setSaving(false);
    }
  }

  async function regenSection(sectionId: string) {
    await api(`/srv/contents/${id}/regenerate-section`, {
      method: "POST",
      json: { section_id: sectionId },
    });
    setTimeout(() => mutate(), 1500);
  }

  async function archive() {
    await api(`/srv/contents/${id}`, {
      method: "PATCH",
      json: { status: "archived" },
    });
    mutate();
  }

  async function remove() {
    if (!confirm("Supprimer définitivement ce contenu ?")) return;
    await api(`/srv/contents/${id}`, { method: "DELETE" });
    router.push("/dashboard");
  }

  return (
    <div className="grid grid-cols-3 gap-6 max-w-7xl">
      <div className="col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{content.keyword}</h1>
          <div className="flex items-center gap-3">
            <CoverageBadge score={content.coverage_score} />
            <button
              onClick={archive}
              className="text-xs text-zinc-400 hover:text-white"
              title="Archiver"
            >
              Archiver
            </button>
            <button
              onClick={remove}
              className="text-xs text-red-400 hover:text-red-300"
              title="Supprimer"
            >
              Supprimer
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="bg-accent-600 hover:bg-accent-500 disabled:opacity-50 px-3 py-2 rounded text-sm"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>

        {variants.length > 0 && (
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-4 space-y-2">
            <div className="text-xs uppercase tracking-wider text-zinc-500">
              Variantes title / meta
            </div>
            {variants.map((v, i) => (
              <label
                key={i}
                className={`block border rounded p-2 cursor-pointer ${
                  chosenIdx === i
                    ? "border-accent-500 bg-accent-500/10"
                    : "border-ink-800 hover:border-ink-700"
                }`}
              >
                <input
                  type="radio"
                  name="title"
                  className="hidden"
                  checked={chosenIdx === i}
                  onChange={() => setChosenIdx(i)}
                />
                <div className="text-sm font-medium">{v.title}</div>
                <div className="text-xs text-zinc-500">{v.meta}</div>
              </label>
            ))}
          </div>
        )}

        <ContentEditor html={html} onChange={setHtml} />

        <div className="flex gap-3 text-sm">
          <a
            href={`${API_BASE}/srv/contents/${id}/export?format=html`}
            target="_blank"
            rel="noreferrer"
            className="text-accent-500 hover:underline"
          >
            Export HTML
          </a>
          <a
            href={`${API_BASE}/srv/contents/${id}/export?format=md`}
            target="_blank"
            rel="noreferrer"
            className="text-accent-500 hover:underline"
          >
            Export Markdown
          </a>
        </div>

        <CompetitorsPanel contentId={id!} />
      </div>

      <div className="col-span-1 space-y-4">
        <ImagePanel
          contentId={id!}
          imageUrl={content.image_url}
          imagePrompt={content.image_prompt ?? null}
          onUpdate={mutate}
        />
        <SemanticScore contentId={id!} html={html} />
        <SectionList html={html} onRegenerate={regenSection} />
        <LinkSuggestionsPanel links={content.internal_links} />
        {content.schema_recommendations && (
          <details className="bg-ink-900 border border-ink-800 rounded-xl p-4">
            <summary className="text-sm cursor-pointer">Schema recommandé</summary>
            <pre className="text-xs mt-2 overflow-auto">
              {JSON.stringify(content.schema_recommendations, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
