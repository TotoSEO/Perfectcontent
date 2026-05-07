"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Icon, IconName } from "@/components/Icon";

type Item = { href: string; label: string; icon: IconName; group: string };

const ITEMS: Item[] = [
  { href: "/dashboard", label: "Contenus", icon: "library", group: "Bibliothèque" },
  { href: "/folders", label: "Dossiers", icon: "folder", group: "Bibliothèque" },
  { href: "/new", label: "Génération", icon: "sparkles", group: "Création" },
  { href: "/new/silo", label: "Silo SEO", icon: "silo", group: "Création" },
  { href: "/rewrite", label: "Réécriture", icon: "rewrite", group: "Création" },
  { href: "/fusion", label: "Fusion", icon: "fusion", group: "Création" },
  { href: "/audits", label: "Audit technique", icon: "audit", group: "Audit" },
  { href: "/cannibalization", label: "Cannibalisation", icon: "fusion", group: "Audit" },
  { href: "/domains", label: "Domaines", icon: "globe", group: "Système" },
  { href: "/console", label: "Console", icon: "terminal", group: "Système" },
];

const GROUPS = ["Bibliothèque", "Création", "Audit", "Système"];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    try { await api("/srv/auth/logout", { method: "POST" }); } catch { /* noop */ }
    router.push("/login");
  }

  return (
    <aside className="relative w-60 shrink-0 flex flex-col sticky top-0 h-screen z-20 glass-strong">
      {/* Right-edge highlight to fake refraction */}
      <span
        aria-hidden
        className="absolute top-0 right-0 h-full w-px"
        style={{ background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.10) 30%, rgba(255,255,255,0.10) 70%, transparent)" }}
      />

      <div className="px-5 py-5 border-b border-[var(--border)] relative">
        <Link href="/dashboard" className="font-semibold tracking-tight text-[15px] flex items-center gap-2.5 group">
          <span className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-accent-400 via-accent-500 to-accent-700 flex items-center justify-center text-[13px] text-white font-bold glow-accent ring-1 ring-white/15">
            P
          </span>
          <span className="text-zinc-50 font-bold tracking-tight">PerfectContent</span>
        </Link>
        <div className="mt-1.5 ml-[44px] text-[10px] uppercase tracking-[0.18em] text-zinc-600">
          Pipeline SEO
        </div>
      </div>

      <nav className="flex-1 px-3 py-5 flex flex-col gap-5 overflow-y-auto">
        {GROUPS.map((g) => (
          <div key={g} className="space-y-0.5">
            <div className="px-3 mb-1.5 text-[10px] uppercase tracking-[0.18em] text-zinc-600 font-semibold">
              {g}
            </div>
            {ITEMS.filter((it) => it.group === g).map((it) => {
              const active = pathname === it.href || pathname?.startsWith(it.href + "/");
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`group relative px-3 py-2 rounded-lg text-[13px] flex items-center gap-2.5 transition-all duration-200 ease-expo ${
                    active
                      ? "text-white"
                      : "text-zinc-400 hover:text-zinc-100"
                  }`}
                  style={
                    active
                      ? {
                          background:
                            "linear-gradient(180deg, rgba(124,132,255,0.18), rgba(124,132,255,0.08))",
                          border: "1px solid rgba(124,132,255,0.28)",
                          boxShadow:
                            "0 1px 0 0 rgba(255,255,255,0.10) inset, 0 0 22px -8px rgba(124,132,255,0.55)",
                        }
                      : undefined
                  }
                >
                  {!active && (
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)" }}
                    />
                  )}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-accent-300"
                      style={{ boxShadow: "0 0 12px var(--accent-glow)" }}
                    />
                  )}
                  <span className="relative z-10">
                    <Icon
                      name={it.icon}
                      size={16}
                      className={active ? "text-accent-200" : "text-zinc-500 group-hover:text-zinc-300"}
                    />
                  </span>
                  <span className="relative z-10 truncate">{it.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-[var(--border)]">
        <button
          onClick={logout}
          className="w-full px-3 py-2 rounded-lg text-[12px] text-zinc-500 hover:bg-white/5 hover:text-white text-left transition flex items-center gap-2"
        >
          <Icon name="logout" size={14} className="text-zinc-600" />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
