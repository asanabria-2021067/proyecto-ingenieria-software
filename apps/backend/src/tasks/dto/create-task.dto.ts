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

export class CreateTaskDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'tituloTarea no puede estar vacío' })
  @MaxLength(150)
  tituloTarea!: string;

  // Campos opcionales de creación: se usa @ValidateIf en vez de @IsOptional
  // porque @IsOptional trata `null` igual que `undefined` (lo omite de la
  // validación), y esta tarea exige rechazar `null` explícitamente,
  // aceptando únicamente la omisión real del campo.
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(5000)
  descripcionTarea?: string;

  // Obligatoria: no existe un contrato previo de creación de tareas (el
  // service actual es un stub), así que no se debe depender silenciosamente
  // del default de base de datos (Prisma no define default para fechaLimite).
  @IsFutureCalendarDate()
  fechaLimite!: string;

  // Obligatoria por la misma razón: aunque `Tarea.prioridad` tiene
  // @default(MEDIA) en el schema, no hay un contrato de API previo que
  // establezca ese default como comportamiento esperado del endpoint.
  @IsEnum(Prioridad, {
    message: `prioridad debe ser uno de: ${Object.values(Prioridad).join(', ')}`,
  })
  prioridad!: Prioridad;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(1000)
  tiempoEstimadoHoras?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  idHito?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  idRolProyecto?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  idUsuarioAsignado?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  idsEtiquetas?: number[];
}
