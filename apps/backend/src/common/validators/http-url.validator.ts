import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * G07 (OWASP25-C027 + C001): contrato único de las URL que escribe un
 * usuario (perfil y proyecto). Solo se aceptan URL absolutas http(s) con
 * host, tal como las interpreta el navegador (WHATWG URL), sin espacios ni
 * caracteres de control con los que un esquema peligroso podría disfrazarse
 * (`java\tscript:`, ` javascript:`). `javascript:`, `data:`, `vbscript:`,
 * `file:`, `ftp:` o cualquier esquema propio se rechazan.
 *
 * Vacío: `undefined`/`null` los deja pasar `@IsOptional()` como hasta ahora,
 * y la cadena vacía se acepta porque significa «sin enlace» (es lo que el
 * perfil devuelve para un campo vacío y lo que envían los clientes previos);
 * nunca produce un enlace. Los datos ya guardados no se tocan.
 */

export const ALLOWED_URL_PROTOCOLS: readonly string[] = ['http:', 'https:'];

const INVISIBLE_CHARACTERS = /[​-‍⁠]/;

/** Espacios (incluido el BOM), invisibles de ancho cero y caracteres de control C0/C1. */
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

export function isHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0 || hasUnsafeCharacter(value)) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return ALLOWED_URL_PROTOCOLS.includes(url.protocol) && url.hostname.length > 0;
}

export function isHttpUrlOrEmpty(value: unknown): boolean {
  return value === '' || isHttpUrl(value);
}

export function IsHttpUrl(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isHttpUrl',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: `${String(propertyName)} debe ser una URL http:// o https://`, ...options },
      validator: { validate: (value: unknown) => isHttpUrlOrEmpty(value) },
    });
  };
}
