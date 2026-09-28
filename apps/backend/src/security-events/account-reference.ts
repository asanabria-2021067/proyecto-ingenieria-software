import { createHmac, hkdfSync } from 'node:crypto';
import { getJwtSecret } from '../config/jwt-secret';

/**
 * G05 (OWASP25-C037): referencia seudónima de una cuenta que NO existe, para
 * correlacionar intentos contra el mismo correo sin guardarlo en claro.
 *
 * HMAC-SHA256 del correo normalizado con una clave DERIVADA (HKDF, etiqueta
 * propia) del JWT_SECRET ya validado por G01: no hay un secreto nuevo que
 * gestionar ni una clave en el código, y la etiqueta separa este uso de la
 * firma de tokens. Se guardan 16 hex (64 bits): suficiente para correlacionar,
 * inútil para recuperar el correo sin la clave. Rotar JWT_SECRET cambia las
 * referencias (aceptable: solo correlacionan dentro de la vida del secreto).
 */
const INFO = 'uvgenius/security-events/account-reference/v1';

function derivedKey(): Buffer {
  return Buffer.from(hkdfSync('sha256', getJwtSecret(), Buffer.alloc(0), INFO, 32));
}

/** null si no hay clave disponible: la auditoría nunca debe romper el login. */
export function accountReference(correo: string): string | null {
  try {
    return createHmac('sha256', derivedKey()).update(correo.trim().toLowerCase()).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}
