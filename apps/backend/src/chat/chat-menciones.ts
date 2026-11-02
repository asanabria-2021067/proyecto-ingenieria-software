import { extraerMenciones, normalizarMenciones } from '../comentarios/menciones/menciones.parser';

/**
 * MEJ-44: mismo formato `@[Nombre](idUsuario)` que los comentarios. Solo los
 * participantes de la conversacion pueden ser mencionados; el resto se degrada
 * a texto `@Nombre` sin rechazar el mensaje. El autor nunca se notifica a si mismo.
 */
export function prepararMencionesChat(contenido: string, participantes: number[], autorId: number) {
  const elegibles = new Set(participantes);
  const texto = normalizarMenciones(contenido, elegibles);
  const mencionados = extraerMenciones(texto)
    .map((m) => m.idUsuario)
    .filter((id) => id !== autorId);
  return { contenido: texto, mencionados };
}
