import { BadRequestException } from '@nestjs/common';
import type { ArchivoSubido } from './chat-adjuntos';

export const NOTA_VOZ_MAX_BYTES = 5 * 1024 * 1024;
export const NOTA_VOZ_MAX_SEGUNDOS = 120;

/** MIME de audio permitido -> extension con la que se guarda. */
export const NOTA_VOZ_TIPOS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

const empieza = (buf: Buffer, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

/** Detecta el audio por firma (magic bytes); null si no es uno de NOTA_VOZ_TIPOS. */
export function detectarMimeAudio(buf: Buffer): string | null {
  if (empieza(buf, [0x1a, 0x45, 0xdf, 0xa3])) return 'audio/webm';
  if (empieza(buf, [0x4f, 0x67, 0x67, 0x53])) return 'audio/ogg';
  if (empieza(buf, [0x66, 0x74, 0x79, 0x70], 4)) return 'audio/mp4';
  if (empieza(buf, [0x49, 0x44, 0x33]) || (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) {
    return 'audio/mpeg';
  }
  if (empieza(buf, [0x52, 0x49, 0x46, 0x46]) && empieza(buf, [0x57, 0x41, 0x56, 0x45], 8)) return 'audio/wav';
  return null;
}

/** Tamano real y firma; el MIME declarado (sin parametros de codec) debe coincidir. El nombre lo fija el servidor. */
export function validarNotaVoz(file: ArchivoSubido): { mime: string; nombre: string } {
  if (file.buffer.length === 0) throw new BadRequestException('La nota de voz está vacía');
  if (file.buffer.length > NOTA_VOZ_MAX_BYTES) throw new BadRequestException('La nota de voz supera el máximo de 5 MB');
  const mime = detectarMimeAudio(file.buffer);
  if (!mime) throw new BadRequestException('Tipo de audio no permitido');
  if (file.mimetype.split(';')[0].trim().toLowerCase() !== mime) {
    throw new BadRequestException('El tipo declarado no coincide con el contenido del audio');
  }
  return { mime, nombre: `nota-de-voz.${NOTA_VOZ_TIPOS[mime]}` };
}
