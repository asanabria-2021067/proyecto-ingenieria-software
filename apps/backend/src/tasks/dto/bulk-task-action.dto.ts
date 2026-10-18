import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  Min,
  ValidateIf,
} from 'class-validator';
import { EstadoTarea } from '@prisma/client';

/**
 * HU-202/T-383: acciones masivas del tablero. Mover = cambiar de columna
 * (estadoTarea); asignar o quitar la asignación; agregar o quitar etiquetas
 * sin tocar las demás que ya tenga cada tarea.
 */
export const ACCIONES_MASIVAS_TAREA = [
  'MOVER',
  'ASIGNAR',
  'DESASIGNAR',
  'AGREGAR_ETIQUETAS',
  'QUITAR_ETIQUETAS',
] as const;

export type AccionMasivaTarea = (typeof ACCIONES_MASIVAS_TAREA)[number];

/** Tope por operación: acota el trabajo bajo el lock del proyecto (timeout de la transacción). */
export const MAX_TAREAS_ACCION_MASIVA = 100;

const ACCIONES_CON_ETIQUETAS: readonly AccionMasivaTarea[] = ['AGREGAR_ETIQUETAS', 'QUITAR_ETIQUETAS'];

export class BulkTaskActionDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_TAREAS_ACCION_MASIVA)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  idsTareas!: number[];

  @IsIn(ACCIONES_MASIVAS_TAREA, {
    message: `accion debe ser uno de: ${ACCIONES_MASIVAS_TAREA.join(', ')}`,
  })
  accion!: AccionMasivaTarea;

  // Cada campo se exige solo para su acción; en las demás se ignora.
  @ValidateIf((dto: BulkTaskActionDto) => dto.accion === 'MOVER')
  @IsEnum(EstadoTarea, {
    message: `estadoTarea debe ser uno de: ${Object.values(EstadoTarea).join(', ')}`,
  })
  estadoTarea?: EstadoTarea;

  @ValidateIf((dto: BulkTaskActionDto) => dto.accion === 'ASIGNAR')
  @IsInt()
  @Min(1)
  idUsuario?: number;

  @ValidateIf((dto: BulkTaskActionDto) => ACCIONES_CON_ETIQUETAS.includes(dto.accion))
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  idsEtiquetas?: number[];
}
