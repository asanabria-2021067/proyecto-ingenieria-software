import { MotivoRechazoPostulacion } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum EstadoPostulacionUpdate {
  ACEPTADA = 'ACEPTADA',
  RECHAZADA = 'RECHAZADA',
}

export class UpdateEstadoPostulacionDto {
  @IsEnum(EstadoPostulacionUpdate)
  estadoPostulacion!: EstadoPostulacionUpdate;

  /** MEJ-99: obligatorio al rechazar (lo exige el servicio); se ignora al aceptar. */
  @IsOptional()
  @IsEnum(MotivoRechazoPostulacion, {
    message: `motivoRechazo debe ser uno de: ${Object.values(MotivoRechazoPostulacion).join(', ')}`,
  })
  motivoRechazo?: MotivoRechazoPostulacion;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comentarioResolucion?: string;
}
