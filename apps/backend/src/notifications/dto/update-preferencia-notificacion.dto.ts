import { IsBoolean, IsEnum } from 'class-validator';
import { TipoNotificacion } from '@prisma/client';

export class UpdatePreferenciaNotificacionDto {
  @IsEnum(TipoNotificacion)
  tipo!: TipoNotificacion;

  @IsBoolean()
  activa!: boolean;
}
