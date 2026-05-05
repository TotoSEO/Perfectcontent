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
      await api("/api/auth/login", { method: "POST", json: { password } });
      router.push("/dashboard");
    } catch (err) {
      setError("Mot de passe invalide.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-accent-600/20 via-transparent to-transparent pointer-events-none" />
      <form
        onSubmit={submit}
        className="relative w-full max-w-sm space-y-4 bg-ink-900/80 backdrop-blur border border-ink-800 rounded-2xl p-8 shadow-xl"
      >
        <div className="text-center">
          <div className="text-3xl mb-2">✨</div>
          <h1 className="text-2xl font-semibold">PerfectContent</h1>
          <p className="text-xs text-zinc-500 mt-1 uppercase tracking-wider">
            Pipeline SEO single-user
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 block">
            Mot de passe d'accès
          </label>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-ink-800 border border-ink-700 rounded-lg px-3 py-2.5 focus:outline-none focus:border-accent-500"
          />
        </div>

        {error && (
          <div className="text-sm text-red-300 bg-red-900/30 border border-red-700/40 rounded px-3 py-2">
            {error}
          </div>
        )}

        <button
          disabled={loading || !password}
          className="w-full bg-accent-600 hover:bg-accent-500 disabled:opacity-50 rounded-lg px-3 py-2.5 font-medium shadow-md shadow-accent-500/20"
        >
          {loading ? "Connexion…" : "Entrer"}
        </button>
      </form>
    </div>
  );
}
