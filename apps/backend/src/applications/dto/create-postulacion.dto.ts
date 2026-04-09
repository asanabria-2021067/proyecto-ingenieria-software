import { IsInt, IsPositive, IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class CreatePostulacionDto {
  @IsInt()
  @IsPositive()
  idUsuarioPostulante!: number;

  @IsInt()
  @IsPositive()
  idRolProyecto!: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(40)
  @MaxLength(1000)
  justificacion!: string;
}
