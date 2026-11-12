import pdfmake from 'pdfmake';

export type TDocumentDefinitions = Parameters<typeof pdfmake.createPdf>[0];

// Documents embed only data-URL images and standard fonts: deny remote access and any local file but those font names.
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((ruta) => /^Helvetica(-[A-Za-z]+)?$/.test(ruta));

// Standard PDF fonts (WinAnsi covers Spanish accents and ñ): no font files to ship.
const FUENTES = { Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' } };

export const FUENTE_PDF = 'Helvetica';

export async function renderizarPdf(definicion: TDocumentDefinitions): Promise<Buffer> {
  pdfmake.setFonts(FUENTES);
  return pdfmake.createPdf(definicion).getBuffer();
}
