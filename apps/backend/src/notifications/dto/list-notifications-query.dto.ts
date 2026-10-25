import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TipoNotificacion } from '@prisma/client';

/**
 * HU-198 (T-370): filtro por tipos reales del enum, en CSV (`tipos=A,B`) o
 * repetido (`tipos=A&tipos=B`). La categoría visual (p. ej. «Tareas») la
 * traduce el cliente con su catálogo de preference-groups.ts: el servidor no
 * mantiene una segunda taxonomía. Un valor vacío o desconocido es 400.
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
}
