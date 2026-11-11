// RF-13: the institution QR encodes `${origin}/s/${token}` (backend/src/domain/qrPdf.ts).
// The token is base64url (backend generarCredencialesQr); it is never shown on screen.

export const MENSAJE_QR_AJENO = 'Este código QR no es de Praxis';

export type QrParseResult = { ok: true; token: string } | { ok: false; message: string };

const TOKEN_REGEX = /^[A-Za-z0-9_-]{16,200}$/;

export function parseQr(texto: string): QrParseResult {
  const invalido: QrParseResult = { ok: false, message: MENSAJE_QR_AJENO };
  let url: URL;
  try {
    url = new URL(texto.trim());
  } catch {
    return invalido;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return invalido;
  const match = /^\/s\/([^/]+)\/?$/.exec(url.pathname);
  const token = match?.[1];
  if (!token || !TOKEN_REGEX.test(token)) return invalido;
  return { ok: true, token };
}
