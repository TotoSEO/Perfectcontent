import { SSE_BASE } from "./api";

export function subscribeSSE<T>(
  path: string,
  onMessage: (data: T) => void,
  onError?: (err: Event) => void
): () => void {
  const es = new EventSource(`${SSE_BASE}${path}`, { withCredentials: true });
  es.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data) as T);
    } catch {
      // ignore keepalives / malformed
    }
  };
  es.onerror = (err) => {
    onError?.(err);
  };
  return () => es.close();
}
