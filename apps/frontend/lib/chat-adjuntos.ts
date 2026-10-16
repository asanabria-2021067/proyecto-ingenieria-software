export const CHAT_ADJUNTO_MAX_BYTES = 10 * 1024 * 1024;

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** Lista blanca (espejo de la del backend, que valida por contenido). */
const TIPOS: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'application/pdf': ['pdf'],
  [DOCX]: ['docx'],
  [XLSX]: ['xlsx'],
  [PPTX]: ['pptx'],
};

export const CHAT_ADJUNTO_ACCEPT = [...Object.keys(TIPOS), ...Object.values(TIPOS).flat().map((e) => `.${e}`)].join(',');

export type CategoriaAdjunto = 'imagen' | 'pdf' | 'word' | 'excel' | 'powerpoint';

export function categoriaAdjunto(mime: string): CategoriaAdjunto {
  if (mime.startsWith('image/')) return 'imagen';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === DOCX) return 'word';
  if (mime === XLSX) return 'excel';
  return 'powerpoint';
}

/** Mensaje de error para mostrar al usuario, o null si el archivo es valido. */
export function validarArchivoChat(file: File): string | null {
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > CHAT_ADJUNTO_MAX_BYTES) return 'El archivo supera el máximo de 10 MB.';
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (!TIPOS[file.type]?.includes(ext)) {
    return 'Tipo de archivo no permitido. Usa imágenes (JPG, PNG, WEBP, GIF), PDF, Word, Excel o PowerPoint.';
  }
  return null;
}

export function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
