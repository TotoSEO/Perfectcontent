"use client";

import { useEffect, useRef } from "react";

/**
 * Editable div that accepts pasted rich content (preserves H1-H6, bold, italic,
 * lists, tables, blockquotes) and exposes the inner HTML.
 */
export function RichTextarea({
  value,
  onChange,
  placeholder,
  minHeight = 200,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value === "" ? "" : null]);

  return (
    <div className="relative">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        className="w-full bg-white/[0.04] border border-[var(--border)] rounded-lg px-4 py-3 text-sm leading-relaxed focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 transition-colors overflow-auto"
        style={{ minHeight }}
        data-placeholder={placeholder || "Colle ton contenu ici (HTML / texte riche supporté)"}
      />
      <style jsx>{`
        div[contenteditable]:empty::before {
          content: attr(data-placeholder);
          color: #52525b;
          pointer-events: none;
          display: block;
        }
        div[contenteditable] :global(h1) {
          font-size: 1.25rem;
          font-weight: 600;
          letter-spacing: -0.01em;
          margin-top: 0.5rem;
          margin-bottom: 0.4rem;
          color: #fafafa;
        }
        div[contenteditable] :global(h2) {
          font-size: 1.1rem;
          font-weight: 600;
          margin-top: 0.75rem;
          margin-bottom: 0.3rem;
          color: #fafafa;
        }
        div[contenteditable] :global(h3) {
          font-size: 1rem;
          font-weight: 600;
          margin-top: 0.5rem;
          color: #f4f4f5;
        }
        div[contenteditable] :global(p) {
          margin-bottom: 0.55rem;
          color: #d4d4d8;
        }
        div[contenteditable] :global(ul),
        div[contenteditable] :global(ol) {
          padding-left: 1.25rem;
          margin-bottom: 0.5rem;
        }
        div[contenteditable] :global(table) {
          border-collapse: collapse;
          margin: 0.5rem 0;
          width: 100%;
          font-size: 0.85em;
        }
        div[contenteditable] :global(th),
        div[contenteditable] :global(td) {
          border: 1px solid #23252d;
          padding: 0.4rem 0.6rem;
        }
        div[contenteditable] :global(th) {
          background: #15161b;
          font-weight: 600;
        }
        div[contenteditable] :global(blockquote) {
          border-left: 2px solid #6366f1;
          padding: 0.1rem 0 0.1rem 0.85rem;
          color: #a1a1aa;
          margin: 0.55rem 0;
          font-style: italic;
        }
        div[contenteditable] :global(strong) {
          font-weight: 600;
          color: #ffffff;
        }
        div[contenteditable] :global(a) {
          color: #7c84ff;
          text-decoration: underline;
          text-decoration-color: rgba(99, 102, 241, 0.4);
          text-underline-offset: 2px;
        }
      `}</style>
    </div>
  );
}
