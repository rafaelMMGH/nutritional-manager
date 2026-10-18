// Browser-side helpers for calling the app's API routes (mutations and the legacy views' reads).

export async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    ...options,
    headers: options.body instanceof Blob ? options.headers : { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(body.error || "Request failed");
  }
  const type = res.headers.get("content-type") || "";
  return type.includes("application/json") ? res.json() : res.text();
}

export function getErrorMessage(err: unknown, fallback = "No se pudo completar la accion") {
  return err instanceof Error ? err.message : fallback;
}

export function formatAnswer(answer: { answer: string; context_used: string; sources: string[] }) {
  return `${answer.answer}\n\nContexto usado: ${answer.context_used}\nFuentes: ${answer.sources.join(", ") || "sin fuentes"}`;
}
