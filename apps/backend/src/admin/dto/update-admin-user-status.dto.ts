import { IsIn } from 'class-validator';
import { EstadoUsuario } from '@prisma/client';

export const ESTADOS_ASIGNABLES_POR_ADMIN = [
  EstadoUsuario.ACTIVO,
  EstadoUsuario.INACTIVO,
  EstadoUsuario.BLOQUEADO,
] as const;

export class UpdateAdminUserStatusDto {
  @IsIn(ESTADOS_ASIGNABLES_POR_ADMIN)
  estado!: EstadoUsuario;
}
