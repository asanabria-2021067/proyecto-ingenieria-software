import { BadRequestException } from '@nestjs/common';

export const ADJUNTO_MAX_BYTES = 10 * 1024 * 1024;

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** Lista blanca: MIME permitido -> extensiones aceptadas para ese MIME. */
export const ADJUNTO_TIPOS: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'application/pdf': ['pdf'],
  [DOCX]: ['docx'],
  [XLSX]: ['xlsx'],
  [PPTX]: ['pptx'],
};

const empieza = (buf: Buffer, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

/** Detecta el MIME por firma (magic bytes); null si no es un tipo de la lista blanca. */
export function detectarMime(buf: Buffer): string | null {
  if (empieza(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (empieza(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (empieza(buf, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || empieza(buf, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) {
    return 'image/gif';
  }
  if (empieza(buf, [0x52, 0x49, 0x46, 0x46]) && empieza(buf, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (empieza(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  if (empieza(buf, [0x50, 0x4b, 0x03, 0x04])) {
    // OOXML: zip con [Content_Types].xml y exactamente una raiz word/, xl/ o ppt/.
    const texto = buf.toString('latin1');
    if (!texto.includes('[Content_Types].xml')) return null;
    const tipos = [
      ['word/', DOCX],
      ['xl/', XLSX],
      ['ppt/', PPTX],
    ].filter(([raiz]) => texto.includes(raiz));
    return tipos.length === 1 ? tipos[0][1] : null;
  }
  return null;
}

/** Nombre seguro para mostrar y guardar: sin rutas, sin caracteres de control. */
export function sanitizarNombre(original: string): string {
  // multer decodifica el nombre como latin1; se recupera el UTF-8 original.
  const utf8 = Buffer.from(original, 'latin1').toString('utf8');
  const esLatin1 = ![...original].some((c) => c.charCodeAt(0) > 0xff);
  const base = (esLatin1 && !utf8.includes('�') ? utf8 : original)
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f\u0080-\u009f<>:"|?*‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim();
  if (!base) return 'archivo';
  if (base.length <= 120) return base;
  const punto = base.lastIndexOf('.');
  const ext = punto > 0 ? base.slice(punto).slice(0, 10) : '';
  return base.slice(0, 120 - ext.length) + ext;
}

export interface ArchivoSubido {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

/** Valida tamano real, firma, MIME declarado y extension; devuelve datos confiables. */
export function validarAdjunto(file: ArchivoSubido): { mime: string; nombre: string } {
  if (file.buffer.length === 0) throw new BadRequestException('El archivo está vacío');
  if (file.buffer.length > ADJUNTO_MAX_BYTES) {
    throw new BadRequestException('El archivo supera el máximo de 10 MB');
  }
  const mime = detectarMime(file.buffer);
  if (!mime) throw new BadRequestException('Tipo de archivo no permitido');
  if (file.mimetype !== mime) {
    throw new BadRequestException('El tipo declarado no coincide con el contenido del archivo');
  }
  const nombre = sanitizarNombre(file.originalname);
  const ext = nombre.includes('.') ? nombre.split('.').pop()!.toLowerCase() : '';
  if (!ADJUNTO_TIPOS[mime].includes(ext)) {
    throw new BadRequestException('La extensión no coincide con el contenido del archivo');
  }
  return { mime, nombre };
}
