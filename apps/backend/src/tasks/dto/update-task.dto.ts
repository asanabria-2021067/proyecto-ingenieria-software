import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Prioridad } from '@prisma/client';
import { IsFutureCalendarDate } from './validators/is-future-calendar-date.validator';

// No se usa `PartialType` de `@nestjs/mapped-types` porque el paquete no
// está instalado en el proyecto y esta tarea no debe agregar dependencias.
// Se sigue el mismo patrón ya usado entre CreateProjectDto/UpdateProjectDto:
// una clase independiente que repite las reglas de los campos compartidos.
//
// Ningún campo usa @IsOptional(): esa decoración trata `null` igual que
// `undefined` (omite la validación en ambos casos), lo que aceptaría `null`
// silenciosamente en campos que deben rechazarlo. Se usa @ValidateIf en su
// lugar para distinguir explícitamente omisión (undefined, válido siempre)
// de envío explícito de `null` (inválido, salvo en idHito/idRolProyecto).
export class UpdateTaskDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'tituloTarea no puede estar vacío' })
  @MaxLength(150)
  tituloTarea?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(5000)
  descripcionTarea?: string;

  // Se valida únicamente cuando se envía; si se omite, no se toca la fecha
  // ya almacenada (el DTO nunca consulta la base de datos). `null` se
  // rechaza explícitamente: fechaLimite no admite retirarse.
  @ValidateIf((_object, value) => value !== undefined)
  @IsFutureCalendarDate()
  fechaLimite?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(Prioridad, {
    message: `prioridad debe ser uno de: ${Object.values(Prioridad).join(', ')}`,
  })
  prioridad?: Prioridad;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(1000)
  tiempoEstimadoHoras?: number;

  // `null` retira la relación; `undefined` (campo omitido) la conserva;
  // cualquier otro valor debe validarse como entero positivo.
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsInt()
  @Min(1)
  idHito?: number | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsInt()
  @Min(1)
  idRolProyecto?: number | null;

  // No incluye idUsuarioAsignado: la asignación/reasignación tendrá
  // endpoints independientes (Tarea 12).
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  idsEtiquetas?: number[];
}
