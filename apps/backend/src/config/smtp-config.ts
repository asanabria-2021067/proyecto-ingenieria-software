/** MEJ-80: configuración SMTP opcional. Sin SMTP_HOST el correo queda desactivado sin romper nada. */
export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  password?: string;
  from: string;
}

export interface SmtpReading {
  config: SmtpConfig | null;
  /** Por qué quedó desactivado cuando SMTP_HOST sí está definido (vacío si no hay SMTP o está completo). */
  motivos: string[];
}

function leer(env: Record<string, unknown>, nombre: string): string | undefined {
  const valor = env[nombre];
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : undefined;
}

export function readSmtpConfig(env: Record<string, unknown>): SmtpReading {
  const host = leer(env, 'SMTP_HOST');
  if (!host) return { config: null, motivos: [] };
  const motivos: string[] = [];
  const port = Number(leer(env, 'SMTP_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) motivos.push('SMTP_PORT debe ser un puerto válido');
  const from = leer(env, 'SMTP_FROM');
  if (!from) motivos.push('falta SMTP_FROM');
  const user = leer(env, 'SMTP_USER');
  const password = leer(env, 'SMTP_PASSWORD');
  if (Boolean(user) !== Boolean(password)) motivos.push('SMTP_USER y SMTP_PASSWORD deben definirse juntos');
  if (motivos.length > 0 || !from) return { config: null, motivos };
  return { config: { host, port, user, password, from }, motivos };
}
