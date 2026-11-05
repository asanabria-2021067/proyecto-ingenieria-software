/** MEJ-137: claves VAPID opcionales. Sin las tres variables el push queda deshabilitado sin romper el arranque. */
export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface VapidReading {
  config: VapidConfig | null;
  /** Por que quedo deshabilitado cuando alguna variable VAPID si esta definida (vacio si no hay ninguna o esta completo). */
  motivos: string[];
}

function leer(env: Record<string, unknown>, nombre: string): string | undefined {
  const valor = env[nombre];
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : undefined;
}

export function readVapidConfig(env: Record<string, unknown>): VapidReading {
  const publicKey = leer(env, 'VAPID_PUBLIC_KEY');
  const privateKey = leer(env, 'VAPID_PRIVATE_KEY');
  const subject = leer(env, 'VAPID_SUBJECT');
  if (!publicKey && !privateKey && !subject) return { config: null, motivos: [] };
  const motivos: string[] = [];
  if (!publicKey) motivos.push('falta VAPID_PUBLIC_KEY');
  if (!privateKey) motivos.push('falta VAPID_PRIVATE_KEY');
  if (!subject) motivos.push('falta VAPID_SUBJECT');
  else if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(subject)) motivos.push('VAPID_SUBJECT debe ser mailto: o https:');
  if (motivos.length > 0 || !publicKey || !privateKey || !subject) return { config: null, motivos };
  return { config: { publicKey, privateKey, subject }, motivos };
}
