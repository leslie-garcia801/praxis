// HTTP client for the backend. Always uses relative /api paths (same-origin, RNF-05)
// and sends the session cookie.

export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const FALLBACK_MESSAGE = 'No se pudo completar la solicitud. Intenta de nuevo.';

function assertApiPath(path: string, caller: string) {
  if (!path.startsWith('/api/')) {
    throw new Error(`${caller} expects a relative /api path, received: ${path}`);
  }
}

function toApiError(status: number, body: unknown): ApiError {
  if (isApiErrorBody(body)) {
    return new ApiError(status, body.error.code, body.error.message, body.error.details);
  }
  return new ApiError(status, 'UNKNOWN_ERROR', FALLBACK_MESSAGE);
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  assertApiPath(path, 'apiFetch');

  const headers = new Headers(init.headers);
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, { ...init, headers, credentials: 'include' });

  if (res.status === 204) return undefined as T;

  const body: unknown = await res.json().catch(() => undefined);

  if (!res.ok) throw toApiError(res.status, body);

  return body as T;
}

function filenameFrom(disposition: string | null): string {
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (!match?.[1]) return 'descarga';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

// Requests a file (any method) and saves it through a temporary object URL.
// Returns the filename taken from Content-Disposition.
export async function downloadFile(path: string, init: RequestInit = {}): Promise<string> {
  assertApiPath(path, 'downloadFile');

  const res = await fetch(path, { ...init, credentials: 'include' });

  if (!res.ok) throw toApiError(res.status, await res.json().catch(() => undefined));

  const filename = filenameFrom(res.headers.get('Content-Disposition'));
  const url = URL.createObjectURL(await res.blob());
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return filename;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = (value as { error: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}
