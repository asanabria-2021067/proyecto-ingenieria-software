import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * La foto de perfil es la `secure_url` que devuelve Cloudinary al subirla
 * (`https://res.cloudinary.com/<cloud>/...`). Solo se aceptan URL https de ese
 * host y de ese cloud: si CLOUDINARY_CLOUD_NAME está definido el primer segmento
 * debe coincidir; si no, basta cualquier segmento válido.
 *
 * Vacío: `undefined`/`null` los deja pasar `@IsOptional()`; la cadena vacía se
 * acepta porque significa «sin foto» (es lo que el perfil devuelve cuando no hay
 * foto). Los datos ya guardados no se tocan.
 */

const CLOUD_SEGMENT = /^[A-Za-z0-9_-]+$/;

export function isCloudinaryUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0 || /[\s\u0000-\u001f\u007f-\u009f]/.test(value)) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.username || url.password || url.port) {
    return false;
  }
  const cloud = url.pathname.split('/')[1] ?? '';
  const expected = process.env.CLOUDINARY_CLOUD_NAME;
  return expected ? cloud === expected : CLOUD_SEGMENT.test(cloud);
}

export function isCloudinaryUrlOrEmpty(value: unknown): boolean {
  return value === '' || isCloudinaryUrl(value);
}

export function IsCloudinaryUrl(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isCloudinaryUrl',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: `${String(propertyName)} debe ser una URL https://res.cloudinary.com/...`, ...options },
      validator: { validate: (value: unknown) => isCloudinaryUrlOrEmpty(value) },
    });
  };
}
