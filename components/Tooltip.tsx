"use client";

import { ReactNode, useState } from "react";

export function Tooltip({
  children,
  content,
  side = "top",
}: {
  children: ReactNode;
  content: ReactNode;
  side?: "top" | "bottom" | "right" | "left";
}) {
  const [open, setOpen] = useState(false);
  const positions: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={`absolute z-50 max-w-xs whitespace-normal rounded-md border border-[var(--border-strong)] bg-[#0c0d10] px-2.5 py-1.5 text-[11px] leading-snug text-zinc-200 shadow-card pointer-events-none ${positions[side]} animate-fadein`}
        >
          {content}
        </span>
      )}
    </span>
  );
}

export function HelpIcon({ content, side = "top" }: { content: ReactNode; side?: "top" | "bottom" | "right" | "left" }) {
  return (
    <Tooltip content={content} side={side}>
      <span
        tabIndex={0}
        className="ml-1.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-[var(--border)] text-[9px] text-zinc-500 hover:text-zinc-200 hover:border-accent-500 cursor-help align-middle transition-colors"
        aria-label="Aide"
      >
        ?
      </span>
    </Tooltip>
  );
}
