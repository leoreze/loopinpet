import { getToken, logout } from './auth.js';

async function request(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    logout();
    throw new Error('Sessão expirada.');
  }

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    throw new Error(body?.error || body?.message || 'Erro na requisição.');
  }

  return body;
}

export const api = {
  get: (url) => request(url),
  post: (url, data) => request(url, { method: 'POST', body: JSON.stringify(data || {}) }),
  put: (url, data) => request(url, { method: 'PUT', body: JSON.stringify(data || {}) }),
  patch: (url, data) => request(url, { method: 'PATCH', body: JSON.stringify(data || {}) }),
  delete: (url) => request(url, { method: 'DELETE' })
};
