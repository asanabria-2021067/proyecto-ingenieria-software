import { IsEnum } from 'class-validator';
import { EstadoUsuario } from '@prisma/client';

export class UpdateAdminUserStatusDto {
  @IsEnum(EstadoUsuario)
  estado!: EstadoUsuario;
}
