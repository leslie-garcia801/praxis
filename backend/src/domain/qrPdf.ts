import QRCode from 'qrcode';
import { renderizarPdf } from '../lib/pdf.js';

// RF-13: the QR encodes `{FRONTEND_ORIGIN}/s/{token}`, without a double slash when the origin ends in "/".
export function urlQr(origen: string, token: string): string {
  return `${origen.replace(/\/+$/, '')}/s/${token}`;
}

// ASCII-safe slug for the download filename (header values cannot carry accents).
export function slugArchivo(nombre: string): string {
  const slug = nombre
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'institucion';
}

type DatosPdfQr = { nombre: string; url: string; codigoCorto: string };

// Letter-size printable sheet, black on white: institution, large QR, short code and a student instruction (RF-13, RF-15).
export async function generarPdfQr({ nombre, url, codigoCorto }: DatosPdfQr): Promise<Buffer> {
  const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 800, color: { dark: '#000000', light: '#FFFFFF' } });
  return renderizarPdf({
    pageSize: 'LETTER',
    pageMargins: [54, 72, 54, 54],
    defaultStyle: { font: 'Helvetica', color: '#000000' },
    info: { title: `QR de ${nombre}` },
    content: [
      { text: nombre, fontSize: 28, bold: true, alignment: 'center', margin: [0, 0, 0, 24] },
      { image: qr, width: 340, alignment: 'center', margin: [0, 0, 0, 24] },
      { text: 'Escanea con la app Praxis', fontSize: 18, alignment: 'center', margin: [0, 0, 0, 6] },
      { text: 'o escribe este código:', fontSize: 14, alignment: 'center', margin: [0, 0, 0, 12] },
      { text: codigoCorto, fontSize: 64, bold: true, characterSpacing: 8, alignment: 'center' },
    ],
  });
}
