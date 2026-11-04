import { AYUDA_ADMIN } from './admin';
import { AYUDA_COORDINADOR } from './coordinador';
import { AYUDA_ESTUDIANTE } from './estudiante';
import { AYUDA_JUNTA } from './junta';
import { AYUDA_LIDER } from './lider';
import type { PreguntaAyuda, RolAyuda } from './tipos';

export type { PreguntaAyuda, RolAyuda } from './tipos';

export const ROLES_AYUDA: readonly RolAyuda[] = ['estudiante', 'lider', 'junta', 'coordinador', 'admin'];

export const AYUDA_POR_ROL: Record<RolAyuda, PreguntaAyuda[]> = {
  estudiante: AYUDA_ESTUDIANTE,
  lider: AYUDA_LIDER,
  junta: AYUDA_JUNTA,
  coordinador: AYUDA_COORDINADOR,
  admin: AYUDA_ADMIN,
};

const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Preguntas cuyo texto contiene todas las palabras buscadas, sin distinguir tildes ni mayúsculas. Sin texto devuelve todas. */
export function buscarAyuda(preguntas: PreguntaAyuda[], texto: string): PreguntaAyuda[] {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return preguntas;
  return preguntas.filter((p) => {
    const contenido = normalizar(`${p.pregunta} ${p.respuesta}`);
    return palabras.every((palabra) => contenido.includes(palabra));
  });
}
