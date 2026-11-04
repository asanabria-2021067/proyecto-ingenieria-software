import { applyDecorators } from '@nestjs/common';
import { TipoPreguntaPostulacion } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const MAX_PREGUNTAS_POR_ROL = 5;
export const MAX_RESPUESTA_CORTA = 200;
export const MAX_RESPUESTA_LARGA = 2000;

/** MEJ-97: pregunta propia del líder para un rol (la pregunta general es `justificacion`). */
export class PreguntaRolDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El enunciado de la pregunta es requerido' })
  @MaxLength(200, { message: 'El enunciado no puede superar 200 caracteres' })
  enunciado!: string;

  @IsEnum(TipoPreguntaPostulacion, {
    message: `tipo debe ser uno de: ${Object.values(TipoPreguntaPostulacion).join(', ')}`,
  })
  tipo!: TipoPreguntaPostulacion;

  @IsBoolean()
  obligatoria!: boolean;
}

/** `preguntas` opcional de un rol: hasta 5. */
export const PreguntasDelRol = () =>
  applyDecorators(
    IsOptional(),
    IsArray(),
    ArrayMaxSize(MAX_PREGUNTAS_POR_ROL, { message: `Un rol admite hasta ${MAX_PREGUNTAS_POR_ROL} preguntas` }),
    ValidateNested({ each: true }),
    Type(() => PreguntaRolDto),
  );

export const preguntasCreate = (preguntas: PreguntaRolDto[] | undefined) =>
  preguntas?.length
    ? { create: preguntas.map((p, orden) => ({ enunciado: p.enunciado, tipo: p.tipo, obligatoria: p.obligatoria, orden })) }
    : undefined;
