"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";

type Item = { href: string; label: string; icon: string; group?: string };

const ITEMS: Item[] = [
  { href: "/dashboard", label: "Contenus", icon: "▣", group: "Bibliothèque" },
  { href: "/folders", label: "Dossiers", icon: "▫", group: "Bibliothèque" },
  { href: "/new", label: "Génération", icon: "✦", group: "Création" },
  { href: "/new/silo", label: "Silo", icon: "◧", group: "Création" },
  { href: "/rewrite", label: "Réécriture", icon: "↻", group: "Création" },
  { href: "/fusion", label: "Fusion", icon: "⊕", group: "Création" },
  { href: "/domains", label: "Domaines", icon: "◇", group: "Système" },
  { href: "/console", label: "Console", icon: "▸", group: "Système" },
];

const GROUPS = ["Bibliothèque", "Création", "Système"];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    try { await api("/srv/auth/logout", { method: "POST" }); } catch { /* noop */ }
    router.push("/login");
  }

  return (
    <aside className="w-60 shrink-0 border-r border-[#25252a] bg-[#0e0e11] flex flex-col sticky top-0 h-screen">
      <div className="px-5 py-5 border-b border-[#25252a]">
        <div className="font-semibold tracking-tight text-[15px] flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center text-[11px] text-white font-bold">P</span>
          PerfectContent
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-5 overflow-y-auto">
        {GROUPS.map((g) => (
          <div key={g} className="space-y-0.5">
            <div className="px-3 mb-1 text-[10px] uppercase tracking-[0.08em] text-zinc-600 font-medium">
              {g}
            </div>
            {ITEMS.filter((it) => it.group === g).map((it) => {
              const active = pathname === it.href || pathname?.startsWith(it.href + "/");
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`group px-3 py-2 rounded-lg text-[13px] flex items-center gap-2.5 transition-all ${
                    active
                      ? "bg-accent-600/15 text-white"
                      : "text-zinc-400 hover:bg-[#1c1c20] hover:text-zinc-100"
                  }`}
                >
                  <span className={`text-[12px] ${active ? "text-accent-400" : "text-zinc-600 group-hover:text-zinc-400"}`}>
                    {it.icon}
                  </span>
                  <span>{it.label}</span>
                  {active && <span className="ml-auto w-1 h-4 rounded-full bg-accent-500" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-[#25252a]">
        <button
          onClick={logout}
          className="w-full px-3 py-2 rounded-lg text-[12px] text-zinc-500 hover:bg-[#1c1c20] hover:text-white text-left transition flex items-center gap-2"
        >
          <span className="text-zinc-700">↗</span> Déconnexion
        </button>
      </div>
    </aside>
  );
}
