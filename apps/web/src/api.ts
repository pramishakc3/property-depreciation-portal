/** Small typed wrapper around fetch. The session lives in an httpOnly cookie, so no tokens are handled in JavaScript. */
import { useCallback, useEffect, useState } from 'react';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues: { path: string; message: string }[] = [],
  ) {
    super(message);
  }

  /** Field errors keyed by field name, for showing next to form inputs. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.issues.map((i) => [i.path, i.message]));
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiRequestError(res.status, data.error ?? 'Request failed', data.issues);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: (path: string) => request<void>('DELETE', path),
};

/** Loads data for a page and reloads it when the path changes or reload() is called. */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<{ data?: T; error?: string; path?: string | null }>({});
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    let active = true;
    api
      .get<T>(path)
      .then((data) => active && setState({ data, path }))
      .catch((err: Error) => active && setState({ error: err.message, path }));
    return () => {
      active = false;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const current = state.path === path;
  return { data: current ? state.data : undefined, error: current ? state.error : undefined, loading: !current, reload };
}
