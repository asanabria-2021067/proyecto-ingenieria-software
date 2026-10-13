import type { TipoEntidadBitacora } from '@/lib/types/bitacora';

/**
 * T-223/T-224 (HU-156): la etiqueta de la bitácora agrupa por `tipoEntidad`
 * —el campo que el backend ya asigna a cada evento— en vez de mapear cada uno
 * de los ~34 `tipoEvento` a mano. REVISION_CIERRE y DOCUMENTO_CIERRE comparten
 * tono y texto («Cierre»): siguen siendo distinguibles por su icono propio.
 * `ENTIDAD_TONE` es un tono `pill-*` de app/global.css; la forma la pone `.pill`.
 */
export const ENTIDAD_TONE: Record<TipoEntidadBitacora, string> = {
  TAREA: 'pill-blue',
  SPRINT: 'pill-violet',
  PROYECTO: 'pill-sage',
  APELACION_LIDERAZGO: 'pill-amber',
  REVISION_CIERRE: 'pill-neutral',
  DOCUMENTO_CIERRE: 'pill-neutral',
};

export const ENTIDAD_LABEL: Record<TipoEntidadBitacora, string> = {
  TAREA: 'Tarea',
  SPRINT: 'Sprint',
  PROYECTO: 'Proyecto',
  APELACION_LIDERAZGO: 'Liderazgo',
  REVISION_CIERRE: 'Cierre',
  DOCUMENTO_CIERRE: 'Cierre',
};
