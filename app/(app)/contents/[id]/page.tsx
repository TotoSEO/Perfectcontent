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
import { PromptViewerButton } from "@/components/PromptViewer";
import { SerpAnalysisButton } from "@/components/SerpAnalysis";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

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
  const [savedAt, setSavedAt] = useState<number | null>(null);

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
      setSavedAt(Date.now());
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

  const justSaved = savedAt && Date.now() - savedAt < 2200;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadein">
      <div className="lg:col-span-2 space-y-4 min-w-0">
        <div className="card p-5 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Contenu</div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-50 mt-1 break-words">
              {content.chosen_title || content.keyword}
            </h1>
            <div className="text-xs text-zinc-500 mt-1.5 flex flex-wrap items-center gap-2">
              <span className="font-mono text-zinc-400">{content.keyword}</span>
              {content.intent && (
                <>
                  <span className="text-zinc-700">·</span>
                  <span>{content.intent}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CoverageBadge score={content.coverage_score} />
            <CopyEverythingButton
              title={chosen?.title ?? content.chosen_title ?? ""}
              meta={chosen?.meta ?? content.chosen_meta ?? ""}
              slug={content.slug ?? ""}
              html={html}
            />
            <SerpAnalysisButton contentId={id!} />
            <PromptViewerButton contentId={id!} />
            <button
              onClick={archive}
              className="btn-ghost px-2.5 py-1.5 text-xs"
              title="Archiver"
            >
              <Icon name="archive" size={12} />
              Archiver
            </button>
            <button
              onClick={remove}
              className="btn-danger px-2.5 py-1.5 text-xs"
              title="Supprimer"
            >
              <Icon name="trash" size={12} />
              Supprimer
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="btn-primary px-3.5 py-2 text-sm"
            >
              {saving ? (
                <>
                  <Icon name="spinner" size={14} /> Enregistrement…
                </>
              ) : justSaved ? (
                <>
                  <Icon name="check" size={14} /> Enregistré
                </>
              ) : (
                <>
                  <Icon name="save" size={14} /> Enregistrer
                </>
              )}
            </button>
          </div>
        </div>

        {variants.length > 0 && (
          <div className="card overflow-hidden">
            <div className="card-section">
              <h2 className="label">Variantes title / meta</h2>
              <span className="text-[11px] text-zinc-500 tabular-nums">{variants.length}</span>
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {variants.map((v, i) => (
                <li key={i}>
                  <label
                    className={`block px-4 py-3 cursor-pointer transition-colors ${
                      chosenIdx === i
                        ? "bg-accent-500/10"
                        : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        chosenIdx === i
                          ? "border-accent-400 bg-accent-500/20"
                          : "border-[var(--border-strong)]"
                      }`}>
                        {chosenIdx === i && <span className="w-1.5 h-1.5 rounded-full bg-accent-400" />}
                      </span>
                      <input
                        type="radio"
                        name="title"
                        className="sr-only"
                        checked={chosenIdx === i}
                        onChange={() => setChosenIdx(i)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-medium ${chosenIdx === i ? "text-white" : "text-zinc-200"}`}>
                          {v.title}
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5">{v.meta}</div>
                      </div>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ContentEditor html={html} onChange={setHtml} />

        <div className="flex flex-wrap gap-2 text-xs">
          <a
            href={`${API_BASE}/srv/contents/${id}/export?format=html`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary px-3 py-2 text-xs"
          >
            <Icon name="download" size={12} />
            Export HTML
          </a>
          <a
            href={`${API_BASE}/srv/contents/${id}/export?format=md`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary px-3 py-2 text-xs"
          >
            <Icon name="download" size={12} />
            Export Markdown
          </a>
        </div>

        <CompetitorsPanel contentId={id!} />
      </div>

      <div className="lg:col-span-1 space-y-4 min-w-0">
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
          <details className="card group">
            <summary className="card-section cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <h3 className="label">Schema recommandé</h3>
              <Icon
                name="chevron-right"
                size={14}
                className="text-zinc-500 transition-transform group-open:rotate-90"
              />
            </summary>
            <pre className="text-xs p-4 overflow-auto text-zinc-400 max-h-72">
              {JSON.stringify(content.schema_recommendations, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}


function CopyEverythingButton({
  title,
  meta,
  slug,
  html,
}: {
  title: string;
  meta: string;
  slug: string;
  html: string;
}) {
  const [copied, setCopied] = useState(false);

  function htmlToText(input: string): string {
    if (typeof window === "undefined") return input;
    const doc = new DOMParser().parseFromString(input, "text/html");
    doc.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
    const out: string[] = [];
    function walk(node: Node, prefix = "") {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent || "";
        if (t.trim()) out.push(t);
        return;
      }
      if (!(node instanceof Element)) return;
      const tag = node.tagName.toLowerCase();
      if (tag === "h1") { out.push("\n# " + (node.textContent || "").trim() + "\n"); return; }
      if (tag === "h2") { out.push("\n## " + (node.textContent || "").trim() + "\n"); return; }
      if (tag === "h3") { out.push("\n### " + (node.textContent || "").trim() + "\n"); return; }
      if (tag === "p")  { out.push((node.textContent || "").trim() + "\n"); return; }
      if (tag === "li") { out.push("- " + (node.textContent || "").trim()); return; }
      if (tag === "table") {
        const rows = Array.from(node.querySelectorAll("tr"));
        out.push("");
        for (const r of rows) {
          const cells = Array.from(r.querySelectorAll("th,td")).map((c) => (c.textContent || "").trim());
          out.push("| " + cells.join(" | ") + " |");
        }
        out.push("");
        return;
      }
      node.childNodes.forEach((c) => walk(c, prefix));
    }
    doc.body.childNodes.forEach((c) => walk(c));
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  async function copy() {
    const body = htmlToText(html || "");
    const payload =
      `Title : ${title}\n` +
      `Metadescription : ${meta}\n` +
      `Slug : ${slug}\n\n` +
      body;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = payload;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); } catch { /* noop */ }
      ta.remove();
      setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <button
      onClick={copy}
      className="btn-ghost px-2.5 py-1.5 text-xs"
      title="Copie title + metadescription + slug + contenu prêt à coller dans un Google Doc"
    >
      <Icon name="copy" size={12} />
      {copied ? "Copié ✓" : "Copier le contenu"}
    </button>
  );
}
