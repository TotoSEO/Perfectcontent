"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

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
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-[#0b0b0d]">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(99,102,241,0.18), transparent 70%)",
        }}
      />
      <form
        onSubmit={submit}
        className="relative w-full max-w-sm card p-8 space-y-5 shadow-2xl shadow-black/40 animate-fadein"
      >
        <div className="text-center space-y-2">
          <div className="mx-auto w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center text-white font-bold text-sm">
            P
          </div>
          <h1 className="text-xl font-semibold tracking-tight">PerfectContent</h1>
          <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">
            Pipeline SEO single-user
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="label">Mot de passe</label>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </div>

        {error && (
          <div className="text-xs text-red-300 bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          disabled={loading || !password}
          className="btn-primary w-full"
        >
          {loading ? "Connexion…" : "Entrer"}
        </button>
      </form>
    </div>
  );
}
