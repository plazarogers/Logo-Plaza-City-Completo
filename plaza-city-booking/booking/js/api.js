import { getLang } from './i18n.js';

export class ApiError extends Error {
  constructor(status, body) { super(body?.message || `HTTP ${status}`); this.status = status; this.code = body?.error; }
}

/** route: 'week&space=conference&from=2026-10-01' -> api.php?r=week&space=... */
async function call(method, route, body, extraHeaders = {}) {
  const res = await fetch('api.php?r=' + route, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'X-Requested-With': 'plaza-booking',
      'X-Lang': getLang(),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  if (!type.includes('json')) {
    if (!res.ok) throw new ApiError(res.status, null);
    return res.blob();
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (r, h) => call('GET', r, null, h),
  post: (r, b, h) => call('POST', r, b || {}, h),
};
