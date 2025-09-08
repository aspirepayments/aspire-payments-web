const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000/v1';

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : '{}',
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body?: any): Promise<T> {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000/v1';
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : '{}',
  });
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body?: any): Promise<T> {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000/v1';
  const p = path.startsWith('/') ? path : `/${path}`;
  const res = await fetch(`${API_BASE}${p}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : '{}',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PUT ${p} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}