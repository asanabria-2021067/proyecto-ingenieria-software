import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_PREGUNTAS_POR_ROL, MAX_RESPUESTA_LARGA } from './pregunta-rol.dto';

/** MEJ-97: respuesta a una pregunta del rol; el límite por tipo (corto 200, largo 2000) lo valida el servicio. */
export class RespuestaPreguntaDto {
  @IsInt()
  @IsPositive()
  idPregunta!: number;

  @IsString()
  @MaxLength(MAX_RESPUESTA_LARGA)
  respuesta!: string;
}

export class CreatePostulacionDto {
  @IsInt()
  @IsPositive()
  idRolProyecto!: number;

  /** Pregunta general fija: «¿Por qué te gustaría participar?». */
  @IsString()
  @IsNotEmpty()
  @MinLength(40)
  @MaxLength(1000)
  justificacion!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PREGUNTAS_POR_ROL)
  @ValidateNested({ each: true })
  @Type(() => RespuestaPreguntaDto)
  respuestas?: RespuestaPreguntaDto[];
}
