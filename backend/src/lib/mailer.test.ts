import { beforeEach, describe, expect, it } from 'vitest';
import { correosEnviados, enviarCorreo, limpiarCorreos } from './mailer.js';

describe('mailer en modo prueba', () => {
  beforeEach(() => limpiarCorreos());

  it('RF-21: guarda los correos en memoria en vez de enviarlos', async () => {
    await enviarCorreo({ para: 'a@x.invalid', asunto: 'Hola', html: '<p>Hola</p>', texto: 'Hola' });

    expect(correosEnviados()).toEqual([{ para: 'a@x.invalid', asunto: 'Hola', html: '<p>Hola</p>', texto: 'Hola' }]);
  });

  it('RF-21: limpiarCorreos vacía la bandeja', async () => {
    await enviarCorreo({ para: 'a@x.invalid', asunto: 'Hola', html: '', texto: '' });
    limpiarCorreos();

    expect(correosEnviados()).toHaveLength(0);
  });

  it('RF-21: correosEnviados devuelve una copia', async () => {
    await enviarCorreo({ para: 'a@x.invalid', asunto: 'Hola', html: '', texto: '' });
    correosEnviados().pop();

    expect(correosEnviados()).toHaveLength(1);
  });
});
