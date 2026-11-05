import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
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
import { Prioridad, RepeticionTarea } from '@prisma/client';
import { MAX_RESPONSABLES_ADICIONALES } from './set-responsables.dto';
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

  // HU-160/T-240: story points de la tarea, base de la velocidad y del eje
  // del burndown. Opcional: una tarea sin puntos aporta 0 al eje de puntos
  // pero sigue contando en el eje de número de tareas.
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  puntosHistoria?: number;

  @IsInt()
  @Min(1)
  idHito!: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  idRolProyecto?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  idUsuarioAsignado?: number;

  // MEJ-109: responsables ademas de idUsuarioAsignado (el principal).
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_RESPONSABLES_ADICIONALES)
  @IsInt({ each: true })
  @Min(1, { each: true })
  idsResponsablesAdicionales?: number[];

  // MEJ-106: crea la tarea como subtarea de esta (un solo nivel).
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  idTareaPadre?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  idsEtiquetas?: number[];

  // MEJ-48: tarea que debe estar HECHO antes de iniciar esta.
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  idTareaBloqueante?: number;

  // MEJ-47: la tarea se repite; el cron crea una copia por ocurrencia.
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(RepeticionTarea)
  repeticion?: RepeticionTarea;

  // MEJ-6/52: items iniciales del checklist (p. ej. al crear desde una plantilla).
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @Transform(({ value }) => (Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim() : v)) : value))
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(200, { each: true })
  checklist?: string[];
}
