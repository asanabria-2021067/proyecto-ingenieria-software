import { safeExternalHref } from '@/lib/security/safe-url';

export type ErroresOrganizacion = Partial<Record<'nombre' | 'descripcion' | 'sitioWeb' | 'logo', string>>;

/** Mismos límites que `CreateOrganizationDto`. */
export function validarDatosOrganizacion({ nombre, descripcion }: { nombre: string; descripcion: string }): ErroresOrganizacion {
  const errores: ErroresOrganizacion = {};
  const limpio = nombre.trim();
  if (limpio.length < 3) errores.nombre = 'El nombre debe tener al menos 3 caracteres.';
  else if (limpio.length > 120) errores.nombre = 'El nombre no puede superar 120 caracteres.';
  if (descripcion.trim().length > 2000) errores.descripcion = 'La descripción no puede superar 2000 caracteres.';
  return errores;
}

/** Opcional; si se escribe debe ser una URL http(s) válida. */
export function validarSitioWeb(sitioWeb: string): ErroresOrganizacion {
  const valor = sitioWeb.trim();
  if (!valor) return {};
  if (valor.length > 255) return { sitioWeb: 'El sitio web no puede superar 255 caracteres.' };
  return safeExternalHref(valor) ? {} : { sitioWeb: 'Escribe una dirección que empiece con http:// o https://.' };
}

/** Misma regla que la foto de perfil: cualquier imagen (`accept="image/*"`). */
export function validarLogo(archivo: Pick<File, 'type'> | null): ErroresOrganizacion {
  if (archivo && !archivo.type.startsWith('image/')) return { logo: 'El logo debe ser una imagen.' };
  return {};
}
