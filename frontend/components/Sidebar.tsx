"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";

const items = [
  { href: "/dashboard", label: "Contenus" },
  { href: "/new", label: "+ Nouveau lot" },
  { href: "/domains", label: "Domaines" },
  { href: "/folders", label: "Dossiers" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    router.push("/login");
  }

  return (
    <aside className="w-56 shrink-0 border-r border-ink-800 bg-ink-900 p-4 flex flex-col gap-1 sticky top-0 h-screen">
      <div className="px-2 py-3 text-xs uppercase tracking-wider text-zinc-500">
        PerfectContent
      </div>
      {items.map((it) => {
        const active = pathname === it.href || pathname?.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`px-3 py-2 rounded text-sm transition ${
              active ? "bg-ink-800 text-white" : "text-zinc-400 hover:bg-ink-800/50"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
      <div className="flex-1" />
      <button
        onClick={logout}
        className="px-3 py-2 rounded text-xs text-zinc-500 hover:bg-ink-800/50 hover:text-white text-left"
      >
        Déconnexion
      </button>
    </aside>
  );
}
