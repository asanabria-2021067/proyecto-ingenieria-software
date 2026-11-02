import { afterEach, describe, expect, it, vi } from 'vitest';

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});
vi.mock('nodemailer', () => ({ createTransport }));

import { readSmtpConfig } from '../src/config/smtp-config';
import { MailService } from '../src/mail/mail.service';
import { validateEnvironment } from '../src/config/environment.validation';
import { correoJuntaAsociacion } from '../src/mail/mail-templates';

const COMPLETO = { SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', SMTP_FROM: 'no-responder@example.test' };

describe('MEJ-80: configuración SMTP', () => {
  it('sin SMTP_HOST queda desactivado y sin motivos', () => {
    expect(readSmtpConfig({})).toEqual({ config: null, motivos: [] });
  });

  it('con host, puerto y remitente queda activo; usuario y clave son opcionales pero van juntos', () => {
    expect(readSmtpConfig(COMPLETO).config).toMatchObject({ host: 'smtp.example.test', port: 587, from: 'no-responder@example.test' });
    expect(readSmtpConfig({ ...COMPLETO, SMTP_USER: 'u' }).motivos).toEqual(['SMTP_USER y SMTP_PASSWORD deben definirse juntos']);
  });

  it('una configuración a medias se desactiva con motivos y la validación del entorno no falla', () => {
    const lectura = readSmtpConfig({ SMTP_HOST: 'smtp.example.test', SMTP_PORT: 'abc' });
    expect(lectura.config).toBeNull();
    expect(lectura.motivos).toEqual(['SMTP_PORT debe ser un puerto válido', 'falta SMTP_FROM']);
    expect(() =>
      validateEnvironment({ JWT_SECRET: 'x'.repeat(40), FRONTEND_URL: 'https://app.example.test', SMTP_HOST: 'smtp.example.test', SMTP_PORT: 'abc' }),
    ).not.toThrow();
  });
});

describe('MEJ-80: MailService', () => {
  const entorno = { ...process.env };
  afterEach(() => {
    process.env = { ...entorno };
    sendMail.mockReset();
    createTransport.mockClear();
  });

  it('desactivado: no crea transporte ni envía', async () => {
    delete process.env.SMTP_HOST;
    const mail = new MailService();
    await mail.enviar('a@example.test', 'Asunto', 'Texto');
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('activado: envía desde SMTP_FROM; si el servidor falla, no lanza', async () => {
    Object.assign(process.env, COMPLETO);
    const mail = new MailService();
    sendMail.mockResolvedValueOnce({});
    await mail.enviar('a@example.test', 'Asunto', 'Texto');
    expect(sendMail).toHaveBeenCalledWith({ from: COMPLETO.SMTP_FROM, to: 'a@example.test', subject: 'Asunto', text: 'Texto' });

    sendMail.mockRejectedValueOnce(new Error('conexión rechazada'));
    await expect(mail.enviar('a@example.test', 'Asunto', 'Texto')).resolves.toBeUndefined();
  });

  it('el correo de junta distingue nombramiento y baja', () => {
    expect(correoJuntaAsociacion('AEIS', 'ASIGNADA', 'Presidente').texto).toContain('te nombró en la junta de "AEIS" como Presidente');
    expect(correoJuntaAsociacion('AEIS', 'REMOVIDA', 'Presidente').texto).toContain('te quitó de la junta');
  });
});
