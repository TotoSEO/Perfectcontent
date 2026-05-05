// Empty string = same-origin relative URLs.
// On Vercel, frontend and Python serverless functions share the same domain
// (vercel.json routes /api/* to api/index.py), so no base URL is needed in
// production. In dev, set NEXT_PUBLIC_API_BASE=http://localhost:8000.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export type ApiOptions = Omit<RequestInit, "body"> & { json?: unknown };

export async function api<T = unknown>(
  path: string,
  opts: ApiOptions = {}
): Promise<T> {
  const { json, headers, ...rest } = opts;
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(headers || {}),
    },
    body: json !== undefined ? JSON.stringify(json) : undefined,
    ...rest,
  });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
    throw new Error("unauthenticated");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

export const fetcher = <T,>(path: string) => api<T>(path);
