"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Icon } from "@/components/Icon";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/srv/auth/login", { method: "POST", json: { password } });
      router.push("/dashboard");
    } catch {
      setError("Mot de passe invalide.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-[var(--bg)]">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(99,102,241,0.22), transparent 70%), radial-gradient(ellipse 60% 40% at 50% 100%, rgba(124,132,255,0.10), transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(ellipse 60% 50% at 50% 50%, black 30%, transparent 80%)",
        }}
      />

      <form
        onSubmit={submit}
        className="relative w-full max-w-sm card-elevated p-8 space-y-5 animate-fadein"
      >
        <div className="text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-400 to-accent-700 flex items-center justify-center text-white font-bold text-lg shadow-cta ring-1 ring-white/10">
            P
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-50">PerfectContent</h1>
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              Pipeline SEO single-user
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="label inline-flex items-center gap-1.5">
            <Icon name="lock" size={11} className="text-zinc-500" />
            Mot de passe
          </label>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div className="text-xs text-red-300 bg-red-500/10 border border-red-700/40 rounded-lg px-3 py-2 inline-flex items-center gap-2">
            <Icon name="alert" size={12} />
            {error}
          </div>
        )}

        <button
          disabled={loading || !password}
          className="btn-primary w-full"
        >
          {loading ? (
            <>
              <Icon name="spinner" size={14} /> Connexion…
            </>
          ) : (
            <>Entrer</>
          )}
        </button>

        <p className="text-[10px] text-center text-zinc-600">
          Accès privé. Aucune création de compte.
        </p>
      </form>
    </div>
  );
}
