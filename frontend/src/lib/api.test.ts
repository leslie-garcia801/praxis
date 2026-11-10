import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../test/msw/server';
import { ApiError, apiFetch, downloadFile } from './api';

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

describe('downloadFile', () => {
  const createObjectURL = vi.fn(() => 'blob:fake-url');
  const revokeObjectURL = vi.fn();
  let anchorClick: ReturnType<typeof vi.spyOn>;
  let downloaded: { href: string; download: string } | undefined;

  beforeEach(() => {
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    downloaded = undefined;
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = { href: this.href, download: this.download };
    });
  });

  afterEach(() => {
    anchorClick.mockRestore();
    vi.unstubAllGlobals();
  });

  it('POSTs, saves the blob under the Content-Disposition filename and returns it', async () => {
    let method = '';
    server.use(
      http.post('*/api/archivo', ({ request }) => {
        method = request.method;
        return new HttpResponse(new Blob(['%PDF-1.7']), {
          headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="qr-hospital-alfa.pdf"' },
        });
      }),
    );

    await expect(downloadFile('/api/archivo', { method: 'POST' })).resolves.toBe('qr-hospital-alfa.pdf');

    expect(method).toBe('POST');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(downloaded).toMatchObject({ href: 'blob:fake-url', download: 'qr-hospital-alfa.pdf' });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
  });

  it('falls back to a generic filename when the header is missing', async () => {
    server.use(http.post('*/api/archivo', () => new HttpResponse(new Blob(['x']))));
    await expect(downloadFile('/api/archivo', { method: 'POST' })).resolves.toBe('descarga');
  });

  it('throws ApiError with the API contract on a JSON error body, without downloading', async () => {
    server.use(
      http.post('*/api/archivo', () =>
        HttpResponse.json({ error: { code: 'NO_ENCONTRADO', message: 'La institución no existe.' } }, { status: 404 }),
      ),
    );

    await expect(downloadFile('/api/archivo', { method: 'POST' })).rejects.toMatchObject({
      status: 404,
      code: 'NO_ENCONTRADO',
      message: 'La institución no existe.',
    });
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('uses the Spanish fallback message when the error body is not the API contract', async () => {
    server.use(http.post('*/api/archivo', () => new HttpResponse('Bad Gateway', { status: 502 })));
    await expect(downloadFile('/api/archivo', { method: 'POST' })).rejects.toMatchObject({
      status: 502,
      code: 'UNKNOWN_ERROR',
      message: 'No se pudo completar la solicitud. Intenta de nuevo.',
    });
  });

  it('rejects absolute URLs', async () => {
    await expect(downloadFile('https://example.com/x', { method: 'POST' })).rejects.toThrow(/relative \/api/);
  });
});
