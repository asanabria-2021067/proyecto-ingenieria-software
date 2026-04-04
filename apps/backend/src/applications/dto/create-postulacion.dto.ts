import { IsInt, IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class CreatePostulacionDto {
  @IsInt()
  @IsNotEmpty()
  idUsuarioPostulante!: number;

  @IsInt()
  @IsNotEmpty()
  idRolProyecto!: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(40)
  @MaxLength(1000)
  justificacion!: string;
}
