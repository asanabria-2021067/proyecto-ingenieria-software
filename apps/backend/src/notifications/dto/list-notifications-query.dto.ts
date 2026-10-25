import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateBy,
  buildMessage,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TipoNotificacion } from '@prisma/client';

/** `proyecto=ninguno`: solo los avisos cuyo payload no referencia ningún proyecto. */
export const SIN_PROYECTO = 'ninguno';

/**
 * HU-198 (T-370): filtro por tipos reales del enum, en CSV (`tipos=A,B`) o
 * repetido (`tipos=A&tipos=B`). La categoría visual (p. ej. «Tareas») la
 * traduce el cliente con su catálogo de preference-groups.ts: el servidor no
 * mantiene una segunda taxonomía. Un valor vacío o desconocido es 400.
 *
 * Sprint 10 (bandeja): `q` y `proyecto` acotan igual la lectura y el marcado
 * masivo (`leer-todas`), para que «marcar filtradas» nunca toque más de lo
 * que la lista muestra. Siempre dentro de lo del usuario de la sesión.
 */
export class NotificationTypesFilterDto {
  @IsOptional()
  // Se lee el valor crudo (`obj[key]`): la conversión implícita global no debe tocarlo antes.
  @Transform(({ obj, key }) => {
    const crudo: unknown = obj[key];
    const partes = Array.isArray(crudo) ? crudo : String(crudo).split(',');
    return partes.map((parte) => String(parte).trim());
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(Object.keys(TipoNotificacion).length)
  @IsEnum(TipoNotificacion, { each: true })
  tipos?: TipoNotificacion[];

  /** Texto libre sobre título y mensaje (ILIKE parcial). En blanco se ignora. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  q?: string;

  /** Id de proyecto referenciado en el payload (`projectId`/`idProyecto`) o `ninguno`. */
  @IsOptional()
  @Transform(({ value }) => (value === SIN_PROYECTO ? value : /^\d{1,12}$/.test(String(value)) ? Number(value) : value))
  @IsProyectoFiltro()
  proyecto?: number | typeof SIN_PROYECTO;
}

/** Entero positivo o la cadena `ninguno`; cualquier otra cosa es 400. */
function IsProyectoFiltro() {
  return ValidateBy({
    name: 'isProyectoFiltro',
    validator: {
      validate: (valor: unknown) => valor === SIN_PROYECTO || (Number.isInteger(valor) && (valor as number) > 0),
      defaultMessage: buildMessage((prefijo) => `${prefijo}proyecto debe ser un id positivo o "${SIN_PROYECTO}"`),
    },
  });
}

/** T-292: paginación opcional de GET /notificaciones; sin `page` responde la lista de siempre. */
export class ListNotificationsQueryDto extends NotificationTypesFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  /** HU-198: `true` solo leídas, `false` solo sin leer. Solo se aceptan las cadenas exactas. */
  @IsOptional()
  @Transform(({ obj, key }) => {
    const crudo: unknown = obj[key];
    return crudo === 'true' ? true : crudo === 'false' ? false : crudo;
  })
  @IsBoolean()
  leida?: boolean;

  /** Sprint 10: `asc` = más antiguas primero; por defecto `desc`. */
  @IsOptional()
  @IsIn(['asc', 'desc'])
  orden?: 'asc' | 'desc';
}
