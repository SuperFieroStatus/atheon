const BASE = '/api';

async function request<T = any>(method: string, path: string, body?: any): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>('GET', p),
  post: <T = any>(p: string, b?: any) => request<T>('POST', p, b),
  put: <T = any>(p: string, b?: any) => request<T>('PUT', p, b),
  patch: <T = any>(p: string, b?: any) => request<T>('PATCH', p, b),
  del: <T = any>(p: string, b?: any) => request<T>('DELETE', p, b),
};
