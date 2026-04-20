import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateComentarioDto {
  @IsOptional()
  @IsInt()
  idProyecto?: number;

  @IsOptional()
  @IsInt()
  idTarea?: number;

  @IsOptional()
  @IsInt()
  idHito?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  contenido!: string;
}
