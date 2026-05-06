"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Icon, IconName } from "@/components/Icon";

type Item = { href: string; label: string; icon: IconName; group: string; hint?: string };

const ITEMS: Item[] = [
  { href: "/dashboard", label: "Contenus", icon: "library", group: "Bibliothèque" },
  { href: "/folders", label: "Dossiers", icon: "folder", group: "Bibliothèque" },
  { href: "/new", label: "Génération", icon: "sparkles", group: "Création" },
  { href: "/new/silo", label: "Silo SEO", icon: "silo", group: "Création" },
  { href: "/rewrite", label: "Réécriture", icon: "rewrite", group: "Création" },
  { href: "/fusion", label: "Fusion", icon: "fusion", group: "Création" },
  { href: "/domains", label: "Domaines", icon: "globe", group: "Système" },
  { href: "/console", label: "Console", icon: "terminal", group: "Système" },
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
    <aside className="w-60 shrink-0 border-r border-[var(--border)] bg-[#0a0b0e]/80 backdrop-blur flex flex-col sticky top-0 h-screen z-20">
      <div className="px-5 py-5 border-b border-[var(--border)]">
        <Link href="/dashboard" className="font-semibold tracking-tight text-[15px] flex items-center gap-2.5 group">
          <span className="relative w-7 h-7 rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center text-[12px] text-white font-bold shadow-cta">
            P
            <span className="absolute inset-0 rounded-lg ring-1 ring-white/10" />
          </span>
          <span className="text-zinc-100">PerfectContent</span>
        </Link>
        <div className="mt-1 ml-[42px] text-[10px] uppercase tracking-[0.14em] text-zinc-600">
          Pipeline SEO
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-5 overflow-y-auto">
        {GROUPS.map((g) => (
          <div key={g} className="space-y-0.5">
            <div className="px-3 mb-1.5 text-[10px] uppercase tracking-[0.12em] text-zinc-600 font-medium">
              {g}
            </div>
            {ITEMS.filter((it) => it.group === g).map((it) => {
              const active = pathname === it.href || pathname?.startsWith(it.href + "/");
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`group relative px-3 py-2 rounded-lg text-[13px] flex items-center gap-2.5 transition-all ${
                    active
                      ? "bg-accent-600/15 text-white"
                      : "text-zinc-400 hover:bg-[#13141a] hover:text-zinc-100"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-accent-400" />
                  )}
                  <Icon
                    name={it.icon}
                    size={16}
                    className={active ? "text-accent-300" : "text-zinc-500 group-hover:text-zinc-300"}
                  />
                  <span className="truncate">{it.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-[var(--border)]">
        <button
          onClick={logout}
          className="w-full px-3 py-2 rounded-lg text-[12px] text-zinc-500 hover:bg-[#13141a] hover:text-white text-left transition flex items-center gap-2"
        >
          <Icon name="logout" size={14} className="text-zinc-600" />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
