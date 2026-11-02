import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { readSmtpConfig } from '../config/smtp-config';

/**
 * MEJ-80: envío de correo por SMTP. Sin configuración válida (SMTP_HOST/PORT/FROM, y USER/PASSWORD
 * si el servidor los pide) queda desactivado: `enviar` no hace nada. Nunca lanza: un correo caído no
 * debe romper la operación de dominio que lo originó.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly from: string | null;
  private readonly transport: Transporter | null;

  constructor() {
    const { config } = readSmtpConfig(process.env);
    this.from = config?.from ?? null;
    this.transport = config
      ? createTransport({
          host: config.host,
          port: config.port,
          secure: config.port === 465,
          // Sin timeouts nodemailer espera hasta 2 min: un SMTP caido colgaria la peticion que envia.
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 15_000,
          auth: config.user ? { user: config.user, pass: config.password } : undefined,
        })
      : null;
  }

  async enviar(para: string, asunto: string, texto: string): Promise<void> {
    if (!this.transport || !this.from) return;
    try {
      await this.transport.sendMail({ from: this.from, to: para, subject: asunto, text: texto });
    } catch (error) {
      // Sin destinatario ni contenido en el log: solo la causa.
      this.logger.warn(`No se pudo enviar un correo: ${error instanceof Error ? error.message : 'error desconocido'}`);
    }
  }
}
