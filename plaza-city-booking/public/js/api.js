export class ApiError extends Error {
  constructor(status, body) { super(body?.message || `HTTP ${status}`); this.status = status; this.code = body?.error; }
}
async function call(method, url, body, headers = {}) {
  const res = await fetch(url, {
    method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
export const api = {
  get: (u, h) => call('GET', u, null, h),
  post: (u, b, h) => call('POST', u, b || {}, h),
  patch: (u, b, h) => call('PATCH', u, b || {}, h),
};
