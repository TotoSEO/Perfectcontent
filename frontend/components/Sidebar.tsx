"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/new", label: "Nouveau contenu" },
  { href: "/domains", label: "Domaines" },
  { href: "/folders", label: "Dossiers" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 shrink-0 border-r border-ink-800 bg-ink-900 p-4 flex flex-col gap-1">
      <div className="px-2 py-3 text-xs uppercase tracking-wider text-zinc-500">
        PerfectContent
      </div>
      {items.map((it) => {
        const active = pathname === it.href || pathname?.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`px-3 py-2 rounded text-sm ${
              active ? "bg-ink-800 text-white" : "text-zinc-400 hover:bg-ink-800/50"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </aside>
  );
}
