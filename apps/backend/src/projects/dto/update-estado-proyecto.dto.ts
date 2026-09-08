import { IsEnum } from 'class-validator';
import { EstadoProyecto } from '@prisma/client';

/**
 * C032 (06 v2 §31/§33): el líder solo transita BORRADOR→PUBLICADO y
 * PUBLICADO→EN_PROGRESO. CERRADO se retira del enum y de la tabla: el
 * estado terminal lo escribe únicamente la revisión administrativa de
 * cierre (approveClosure), nunca una ruta del líder.
 */
export enum EstadoProyectoCreador {
  PUBLICADO = 'PUBLICADO',
  EN_PROGRESO = 'EN_PROGRESO',
}

export class UpdateEstadoProyectoDto {
  @IsEnum(EstadoProyectoCreador)
  nuevoEstado!: EstadoProyectoCreador;
}

export const TRANSICIONES_PERMITIDAS: Record<string, EstadoProyecto[]> = {
  [EstadoProyecto.BORRADOR]: [EstadoProyecto.PUBLICADO],
  [EstadoProyecto.PUBLICADO]: [EstadoProyecto.EN_PROGRESO],
  [EstadoProyecto.EN_PROGRESO]: [],
};
