// frontend/lib/api.ts
export const API =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "production"
    ? "https://api.betpraxis.pt"
    : "http://localhost:8000");

// opcional: helper que já junta o path e injeta o token se existir
export async function apiFetch(
  path: string,
  opts: RequestInit = {}
) {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("access") // ajusta se usas outro nome
      : null;

  const headers = {
    ...(opts.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // evita // quando alguém passa path com / no início
  const url = `${API}${path.startsWith("/") ? "" : "/"}${path}`;

  return fetch(url, { ...opts, headers });
}
