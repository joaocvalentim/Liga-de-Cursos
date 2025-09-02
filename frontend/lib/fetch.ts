export async function fetchJSON<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${typeof input === 'string' ? input : ''}`);
  return res.json() as Promise<T>;
}
