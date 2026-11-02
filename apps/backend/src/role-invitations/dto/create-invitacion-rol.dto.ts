import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class CreateInvitacionRolDto {
  @IsInt()
  @IsPositive()
  idRolProyecto!: number;

  @IsInt()
  @IsPositive()
  idUsuario!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mensaje?: string;
}
