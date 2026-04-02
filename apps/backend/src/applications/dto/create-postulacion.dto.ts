import { IsInt, IsString, IsNotEmpty, MinLength } from 'class-validator';

export class CreatePostulacionDto {
  @IsInt()
  idRolProyecto!: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(20)
  justificacion!: string;
}
