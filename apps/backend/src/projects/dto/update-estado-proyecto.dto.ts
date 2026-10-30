import { IsEnum } from 'class-validator';
import { EstadoProyecto } from '@prisma/client';

/**
 * C032 (06 v2 §31/§33): el líder solo transita PUBLICADO→EN_PROGRESO.
 * PUBLICADO lo escribe únicamente la revisión administrativa
 * (POST /revisiones/proyectos/:id/resolver) y CERRADO la revisión de cierre
 * (approveClosure); ninguno es destino de una ruta del líder.
 */
export enum EstadoProyectoCreador {
  EN_PROGRESO = 'EN_PROGRESO',
}

export class UpdateEstadoProyectoDto {
  @IsEnum(EstadoProyectoCreador)
  nuevoEstado!: EstadoProyectoCreador;
}

export const TRANSICIONES_PERMITIDAS: Record<string, EstadoProyecto[]> = {
  [EstadoProyecto.BORRADOR]: [],
  [EstadoProyecto.PUBLICADO]: [EstadoProyecto.EN_PROGRESO],
  [EstadoProyecto.EN_PROGRESO]: [],
};
