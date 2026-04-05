import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum EstadoPostulacionUpdate {
  ACEPTADA = 'ACEPTADA',
  RECHAZADA = 'RECHAZADA',
}

export class UpdateEstadoPostulacionDto {
  @IsEnum(EstadoPostulacionUpdate)
  estadoPostulacion!: EstadoPostulacionUpdate;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comentarioResolucion?: string;
}
