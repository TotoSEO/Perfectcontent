"use client";

import { useEffect, useRef } from "react";

/**
 * Editable div that accepts pasted rich content (preserves H1-H6, bold, italic,
 * lists, tables, blockquotes) and exposes the inner HTML. Lighter than spinning
 * up a full TipTap instance per source — these editors are short-lived input
 * areas, not the main editor.
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

  // Keep DOM in sync only when the parent forces a reset (e.g. clear button).
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
        className="w-full bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 text-sm leading-relaxed focus:outline-none focus:border-accent-500 overflow-auto"
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
          margin-top: 0.5rem;
          margin-bottom: 0.25rem;
        }
        div[contenteditable] :global(h2) {
          font-size: 1.1rem;
          font-weight: 600;
          margin-top: 0.5rem;
        }
        div[contenteditable] :global(h3) {
          font-size: 1rem;
          font-weight: 600;
          margin-top: 0.5rem;
        }
        div[contenteditable] :global(p) {
          margin-bottom: 0.5rem;
        }
        div[contenteditable] :global(ul),
        div[contenteditable] :global(ol) {
          padding-left: 1.25rem;
          margin-bottom: 0.5rem;
        }
        div[contenteditable] :global(table) {
          border-collapse: collapse;
          margin: 0.5rem 0;
        }
        div[contenteditable] :global(th),
        div[contenteditable] :global(td) {
          border: 1px solid #3a3a42;
          padding: 0.25rem 0.5rem;
        }
        div[contenteditable] :global(blockquote) {
          border-left: 2px solid #4f46e5;
          padding-left: 0.75rem;
          color: #a1a1aa;
          margin: 0.5rem 0;
        }
        div[contenteditable] :global(strong) {
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
