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
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 bg-ink-900 border border-ink-800 rounded-xl p-6"
      >
        <h1 className="text-xl font-semibold">PerfectContent</h1>
        <p className="text-sm text-zinc-400">Mot de passe d'accès</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          disabled={loading}
          className="w-full bg-accent-600 hover:bg-accent-500 disabled:opacity-50 rounded px-3 py-2 font-medium"
        >
          {loading ? "..." : "Entrer"}
        </button>
      </form>
    </div>
  );
}
