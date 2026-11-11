import { Resend } from 'resend';
import { env } from '../config/env.js';

// Every email goes through here (RF-21). Three modes by environment:
// - production: Resend (RESEND_API_KEY and MAIL_FROM are required by the env schema).
// - development without RESEND_API_KEY: the email is printed to the console.
// - test: emails are kept in memory (see correosEnviados / limpiarCorreos).
export type Correo = { para: string; asunto: string; html: string; texto: string };

const bandeja: Correo[] = [];

/** Emails "sent" in test mode, in order. Returns a copy. */
export const correosEnviados = (): Correo[] => [...bandeja];

/** Empties the in-memory mailbox (test mode). */
export const limpiarCorreos = (): void => {
  bandeja.length = 0;
};

let resend: Resend | undefined;

// A Resend failure is thrown: the caller decides what to do with it.
async function enviarPorResend(correo: Correo): Promise<void> {
  resend ??= new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.MAIL_FROM!,
    to: correo.para,
    subject: correo.asunto,
    html: correo.html,
    text: correo.texto,
  });
  if (error) throw new Error(`No se pudo enviar el correo: ${error.message}`);
}

export async function enviarCorreo(correo: Correo): Promise<void> {
  if (env.NODE_ENV === 'test') {
    bandeja.push(correo);
  } else if (env.RESEND_API_KEY) {
    await enviarPorResend(correo);
  } else {
    console.log(`\n--- Correo (modo desarrollo, no se envió) ---\nPara: ${correo.para}\nAsunto: ${correo.asunto}\n\n${correo.texto}\n---`);
  }
}
