import type { InsigniaDto, NivelInsignia } from '@/lib/types/insignias';

export const NIVELES: readonly NivelInsignia[] = ['BRONCE', 'PLATA', 'ORO', 'DIAMANTE'];

export const NIVEL_NOMBRE: Record<NivelInsignia, string> = {
  BRONCE: 'Bronce',
  PLATA: 'Plata',
  ORO: 'Oro',
  DIAMANTE: 'Diamante',
};

/** Borde del círculo; los tokens `insignia-*` viven en app/global.css. */
export const NIVEL_ANILLO: Record<NivelInsignia, string> = {
  BRONCE: 'border-insignia-bronce',
  PLATA: 'border-insignia-plata',
  ORO: 'border-insignia-oro',
  DIAMANTE: 'border-insignia-diamante',
};

/** Contador de nivel: Bronce no lleva; Plata x2, Oro x3, Diamante x4. */
export function contadorNivel(nivel: NivelInsignia | null): string | null {
  const n = nivel === null ? 0 : NIVELES.indexOf(nivel) + 1;
  return n >= 2 ? `x${n}` : null;
}

/** Nivel que se alcanzará con `siguienteUmbral` (Bronce si aún no tiene ninguno); null con Diamante. */
export function siguienteNivel(nivel: NivelInsignia | null): NivelInsignia | null {
  return NIVELES[nivel === null ? 0 : NIVELES.indexOf(nivel) + 1] ?? null;
}

/** Porcentaje (0-100) hacia el siguiente nivel, medido desde el umbral del nivel actual. */
export function porcentajeSiguiente(i: Pick<InsigniaDto, 'nivel' | 'progreso' | 'umbrales' | 'siguienteUmbral'>): number {
  if (i.siguienteUmbral === null) return 100;
  const base = i.nivel === null ? 0 : i.umbrales[NIVELES.indexOf(i.nivel)];
  const tramo = i.siguienteUmbral - base;
  if (tramo <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((i.progreso - base) / tramo) * 100)));
}

/** Fecha en que se alcanzó el nivel actual, ya formateada; null si no hay nivel. */
export function fechaNivelActual(i: Pick<InsigniaDto, 'nivel' | 'fechas'>): string | null {
  const iso = i.nivel === null ? null : i.fechas[i.nivel];
  return iso ? new Date(iso).toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
}

/** Etiqueta accesible: siempre dice el nivel con palabras. */
export function etiquetaInsignia(i: Pick<InsigniaDto, 'nombre' | 'nivel' | 'progreso' | 'siguienteUmbral'>): string {
  if (i.nivel === null) {
    return `${i.nombre}, bloqueada, progreso ${i.progreso} de ${i.siguienteUmbral}`;
  }
  return `${i.nombre}, nivel ${NIVEL_NOMBRE[i.nivel]}`;
}
