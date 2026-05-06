"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { useEffect } from "react";

export function ContentEditor({
  html,
  onChange,
}: {
  html: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: html,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    editorProps: { attributes: { class: "tt min-h-[460px] focus:outline-none" } },
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== html) {
      editor.commands.setContent(html, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  if (!editor) return null;

  return (
    <div className="card overflow-hidden">
      <Toolbar editor={editor} />
      <div className="p-5 sm:p-6">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  const btn = (label: string, action: () => boolean, active?: boolean, title?: string) => (
    <button
      onClick={action}
      title={title}
      className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
        active
          ? "border-accent-500/50 bg-accent-500/15 text-accent-200"
          : "border-[var(--border)] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.07] hover:border-[var(--border-strong)]"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-1 px-4 py-2.5 border-b border-[var(--border)] bg-white/[0.025]">
      <span className="label mr-1">Format</span>
      {btn("B", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"), "Gras")}
      {btn("I", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"), "Italique")}
      <span className="w-px h-4 bg-[var(--border)] mx-1.5" />
      {btn("H2", () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 }))}
      {btn("H3", () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive("heading", { level: 3 }))}
      <span className="w-px h-4 bg-[var(--border)] mx-1.5" />
      {btn("• Liste", () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
      {btn("1. Liste", () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
      {btn("❝ Citation", () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"))}
    </div>
  );
}
