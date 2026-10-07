import { IsBoolean, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { TipoNotificacion } from '@prisma/client';

export class UpdatePreferenciaNotificacionDto {
  @IsEnum(TipoNotificacion)
  tipo!: TipoNotificacion;

  // Valor crudo: la conversión implícita global haría de "false" un true.
  @Transform(({ obj }) => obj.activa)
  @IsBoolean()
  activa!: boolean;
}
