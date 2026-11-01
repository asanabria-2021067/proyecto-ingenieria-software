import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { CargoJunta, NivelPermisoJunta } from '@prisma/client';

export class AsignarJuntaDto {
  @IsInt()
  idUsuario!: number;

  @IsEnum(CargoJunta)
  cargo!: CargoJunta;

  /** Sin valor se usa el nivel por defecto del cargo. */
  @IsOptional()
  @IsEnum(NivelPermisoJunta)
  nivelPermiso?: NivelPermisoJunta;
}

export class ActualizarJuntaDto {
  @IsOptional()
  @IsEnum(CargoJunta)
  cargo?: CargoJunta;

  @IsOptional()
  @IsEnum(NivelPermisoJunta)
  nivelPermiso?: NivelPermisoJunta;
}
