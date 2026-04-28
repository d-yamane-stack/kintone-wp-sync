/**
 * WORKER_API_URL (Render server.js) へのリクエストに
 * API認証キーを自動付与するラッパー関数
 *
 * 使い方:
 *   import { workerFetch } from '@/lib/workerFetch';
 *   const res = await workerFetch('/api/jobs/column', { method: 'POST', body: JSON.stringify(body) });
 */
export function workerFetch(path, options = {}) {
  const base   = process.env.WORKER_API_URL || 'http://localhost:3000';
  const apiKey = process.env.API_SECRET_KEY  || '';

  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key':    apiKey,
      ...(options.headers || {}),
    },
  });
}
