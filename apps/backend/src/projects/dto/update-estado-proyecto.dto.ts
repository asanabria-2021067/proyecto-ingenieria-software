import { IsEnum } from 'class-validator';
import { EstadoProyecto } from '@prisma/client';

export enum EstadoProyectoCreador {
  PUBLICADO = 'PUBLICADO',
  EN_PROGRESO = 'EN_PROGRESO',
  CERRADO = 'CERRADO',
}

export class UpdateEstadoProyectoDto {
  @IsEnum(EstadoProyectoCreador)
  nuevoEstado!: EstadoProyectoCreador;
}

export const TRANSICIONES_PERMITIDAS: Record<string, EstadoProyecto[]> = {
  [EstadoProyecto.BORRADOR]: [EstadoProyecto.PUBLICADO],
  [EstadoProyecto.PUBLICADO]: [EstadoProyecto.EN_PROGRESO],
  [EstadoProyecto.EN_PROGRESO]: [EstadoProyecto.CERRADO],
};
