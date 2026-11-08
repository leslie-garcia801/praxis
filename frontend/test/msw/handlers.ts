import { http, HttpResponse } from 'msw';

// Default mocked API responses. Tests override them with server.use(...).
export const handlers = [http.get('*/api/health', () => HttpResponse.json({ status: 'ok' }))];
