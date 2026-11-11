import { beforeEach, describe, expect, it, vi } from 'vitest';

const enviar = vi.fn();

// The rest of the environment stays real: the global test setup also uses the database.
vi.mock('../config/env.js', async (importOriginal) => {
  const { env } = await importOriginal<typeof import('../config/env.js')>();
  return { env: { ...env, NODE_ENV: 'production', RESEND_API_KEY: 're_test', MAIL_FROM: 'Praxis <no-responder@praxis.invalid>' } };
});
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: enviar };
  },
}));

const { enviarCorreo } = await import('./mailer.js');

describe('mailer en producción', () => {
  beforeEach(() => enviar.mockReset());

  it('RF-21: envía por Resend con el remitente configurado', async () => {
    enviar.mockResolvedValue({ data: { id: '1' }, error: null });

    await enviarCorreo({ para: 'a@x.invalid', asunto: 'Hola', html: '<p>Hola</p>', texto: 'Hola' });

    expect(enviar).toHaveBeenCalledWith({
      from: 'Praxis <no-responder@praxis.invalid>',
      to: 'a@x.invalid',
      subject: 'Hola',
      html: '<p>Hola</p>',
      text: 'Hola',
    });
  });

  it('RF-21: un fallo de Resend se propaga como error', async () => {
    enviar.mockResolvedValue({ data: null, error: { name: 'application_error', message: 'boom' } });

    await expect(enviarCorreo({ para: 'a@x.invalid', asunto: 'Hola', html: '', texto: '' })).rejects.toThrow(/boom/);
  });
});
