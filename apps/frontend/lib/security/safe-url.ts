/**
 * G07 (OWASP25-C027): enlaces que escribe un usuario (perfil y proyecto).
 *
 * - `safeExternalHref`: solo devuelve un href para una URL absoluta http(s)
 *   con host, tal como la interpreta el navegador, y sin espacios ni
 *   caracteres de control con los que un esquema peligroso podría disfrazarse.
 *   Cualquier otro valor (datos anteriores a la validación del backend:
 *   `javascript:`, `data:`, `vbscript:`, texto suelto) devuelve null y la UI lo
 *   muestra como texto inerte. No basta un `startsWith('http')`: un esquema
 *   propio como `https-app:` o un valor con espacios o controles lo pasarían.
 * - `normalizeUrlInput`: lo que envía un formulario. Recorta espacios y manda
 *   `undefined` para un campo vacío (el DTO lo trata como «sin cambio»), nunca
 *   una cadena en blanco.
 */

const INVISIBLE_CHARACTERS = /[​-‍⁠]/;

function hasUnsafeCharacter(value: string): boolean {
  if (/\s/.test(value) || INVISIBLE_CHARACTERS.test(value)) {
    return true;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
      return true;
    }
  }
  return false;
}

export function safeExternalHref(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0 || hasUnsafeCharacter(value)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.hostname.length === 0) {
    return null;
  }
  return url.href;
}

export function normalizeUrlInput(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
