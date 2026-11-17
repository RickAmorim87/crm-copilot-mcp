export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Thin client for the legacy Customers API.
 * The MCP server authenticates with its OWN least-privilege service token.
 * It never forwards tokens received from the model or the end user (no token passthrough).
 */
export function createApiClient({ baseUrl, token, timeoutMs = 10_000 }) {
  if (!token) throw new Error('MCP_SERVICE_TOKEN is required');

  async function request(method, path, body) {
    let res;
    try {
      res = await fetch(new URL(path, baseUrl), {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new ApiError(503, `Customers API unreachable: ${e.message}`);
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const retry = res.headers.get('retry-after');
      const msg = res.status === 429 && retry ? `${data.error} (retry-after: ${retry}s)` : data.error || res.statusText;
      throw new ApiError(res.status, msg, data.details);
    }
    return data;
  }

  return {
    list: (params = {}) => {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
      return request('GET', `/customers${qs ? `?${qs}` : ''}`);
    },
    get: (id) => request('GET', `/customers/${encodeURIComponent(id)}`),
    create: (data) => request('POST', '/customers', data),
    update: (id, patch) => request('PUT', `/customers/${encodeURIComponent(id)}`, patch),
    remove: (id) => request('DELETE', `/customers/${encodeURIComponent(id)}`),
    stats: () => request('GET', '/customers/stats'),
  };
}
