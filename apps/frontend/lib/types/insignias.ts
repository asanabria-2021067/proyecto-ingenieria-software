export type NivelInsignia = 'BRONCE' | 'PLATA' | 'ORO' | 'DIAMANTE';

/** Una insignia con el avance del usuario (GET /insignias/me y perfil público). */
export interface InsigniaDto {
  clave: string;
  nombre: string;
  descripcion: string;
  /** Nombre de un icono de lucide-react (ver INSIGNIA_ICONOS). */
  icono: string;
  /** null = bloqueada (aún no alcanza el umbral de Bronce). */
  nivel: NivelInsignia | null;
  progreso: number;
  /** Umbral de Bronce, Plata, Oro y Diamante. */
  umbrales: number[];
  /** Umbral del siguiente nivel; null con Diamante. */
  siguienteUmbral: number | null;
  /** ISO de la fecha en que se alcanzó cada nivel. */
  fechas: Record<NivelInsignia, string | null>;
}
