import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/msw/server';
import { ApiError, apiFetch } from './api';

describe('apiFetch', () => {
  it('returns the parsed JSON body on success', async () => {
    await expect(apiFetch<{ status: string }>('/api/health')).resolves.toEqual({ status: 'ok' });
  });

  it('throws ApiError with the API error contract', async () => {
    server.use(
      http.get('*/api/recurso', () =>
        HttpResponse.json(
          { error: { code: 'FORBIDDEN', message: 'No tienes permiso para realizar esta acción.' } },
          { status: 403 },
        ),
      ),
    );

    const error = await apiFetch('/api/recurso').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'No tienes permiso para realizar esta acción.',
    });
  });

  it('uses a Spanish fallback message when the body is not the API contract', async () => {
    server.use(http.get('*/api/roto', () => new HttpResponse('Bad Gateway', { status: 502 })));

    await expect(apiFetch('/api/roto')).rejects.toMatchObject({
      status: 502,
      code: 'UNKNOWN_ERROR',
      message: 'No se pudo completar la solicitud. Intenta de nuevo.',
    });
  });

  it('rejects absolute URLs so the browser never calls Railway directly', async () => {
    await expect(apiFetch('https://example.up.railway.app/api/me')).rejects.toThrow(/relative \/api/);
  });
});
