import type { TipoActividad } from '@/lib/types/attendance';

/** Etiquetas en español del enum `TipoActividad` (REUNION|JORNADA|TALLER|OTRO), compartidas por el diálogo y la lista. */
export const TIPO_ACTIVIDAD_LABEL: Record<TipoActividad, string> = {
  REUNION: 'Reunión',
  JORNADA: 'Jornada',
  TALLER: 'Taller',
  OTRO: 'Otro',
};

export const TIPOS_ACTIVIDAD_OPCIONES: { value: TipoActividad; label: string }[] = (
  Object.keys(TIPO_ACTIVIDAD_LABEL) as TipoActividad[]
).map((value) => ({ value, label: TIPO_ACTIVIDAD_LABEL[value] }));
