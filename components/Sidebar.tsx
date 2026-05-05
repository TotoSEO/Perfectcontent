"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";

type Item = { href: string; label: string; icon: string; tip?: string };

const ITEMS: Item[] = [
  { href: "/dashboard", label: "Contenus", icon: "📄", tip: "Tous tes contenus générés." },
  { href: "/new", label: "Nouveau lot", icon: "✨", tip: "Lancer une génération multi mots-clés." },
  { href: "/domains", label: "Domaines", icon: "🌐", tip: "Sites indexés pour le maillage interne." },
  { href: "/folders", label: "Dossiers", icon: "📁", tip: "Organiser par client / projet." },
  { href: "/console", label: "Console", icon: "🛠", tip: "Logs de debug." },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* noop */
    }
    router.push("/login");
  }

  return (
    <aside className="w-60 shrink-0 border-r border-ink-800 bg-ink-900 flex flex-col sticky top-0 h-screen">
      <div className="px-5 py-5 border-b border-ink-800">
        <div className="font-semibold tracking-tight">PerfectContent</div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mt-0.5">
          Pipeline SEO
        </div>
      </div>

      <nav className="flex-1 p-3 flex flex-col gap-0.5">
        {ITEMS.map((it) => {
          const active = pathname === it.href || pathname?.startsWith(it.href + "/");
          return (
            <Link
              key={it.href}
              href={it.href}
              title={it.tip}
              className={`group px-3 py-2 rounded-lg text-sm flex items-center gap-2.5 transition ${
                active
                  ? "bg-accent-600/20 text-white border border-accent-500/40"
                  : "text-zinc-400 hover:bg-ink-800/60 hover:text-zinc-100 border border-transparent"
              }`}
            >
              <span className="text-base">{it.icon}</span>
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-ink-800">
        <button
          onClick={logout}
          className="w-full px-3 py-2 rounded-lg text-xs text-zinc-500 hover:bg-ink-800/60 hover:text-white text-left transition"
        >
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
