/**
 * Revisión del PR (HU-164): opciones que el usuario elige antes de exportar.
 * Los valores son exactamente los que valida el backend
 * (`apps/backend/src/exports/export-options.ts`); un valor fuera de esos
 * catálogos allá es un 400.
 */
export type FormatoExport = 'csv' | 'pdf';
export type Fuente = 'pequena' | 'mediana' | 'grande';
export type ColorTabla = 'gris' | 'azul' | 'verde' | 'rojo';
export type Seccion = 'miembros' | 'avance' | 'burndown';
export type Grafica = 'barras' | 'pastel';

export interface ExportOptions {
  fuente: Fuente;
  color: ColorTabla;
  secciones: Seccion[];
  graficas: Grafica[];
  /** AAAA-MM-DD o '' (sin límite). */
  desde: string;
  /** AAAA-MM-DD o '' (sin límite). */
  hasta: string;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  fuente: 'mediana',
  color: 'gris',
  secciones: ['miembros', 'avance', 'burndown'],
  graficas: [],
  desde: '',
  hasta: '',
};

export const FUENTE_OPCIONES: ReadonlyArray<{ value: Fuente; label: string }> = [
  { value: 'pequena', label: 'Pequeña' },
  { value: 'mediana', label: 'Mediana' },
  { value: 'grande', label: 'Grande' },
];

/** `hex` solo para la muestra en pantalla; el backend usa su propio tono oscuro por nombre. */
export const COLOR_OPCIONES: ReadonlyArray<{ value: ColorTabla; label: string; hex: string }> = [
  { value: 'gris', label: 'Gris', hex: '#464646' },
  { value: 'azul', label: 'Azul', hex: '#1e408c' },
  { value: 'verde', label: 'Verde', hex: '#166534' },
  { value: 'rojo', label: 'Rojo', hex: '#991b1b' },
];

export const SECCION_OPCIONES: ReadonlyArray<{ value: Seccion; label: string }> = [
  { value: 'miembros', label: 'Miembros y horas' },
  { value: 'avance', label: 'Avance por Sprint' },
  { value: 'burndown', label: 'Burndown de Sprints cerrados' },
];

export const GRAFICA_OPCIONES: ReadonlyArray<{ value: Grafica; label: string }> = [
  { value: 'barras', label: 'Gráfica de barras (horas por integrante)' },
  { value: 'pastel', label: 'Gráfica de pastel (distribución de horas)' },
];

/** Mensaje para mostrar bajo el formulario, o null si las opciones son exportables. */
export function validarOpciones(formato: FormatoExport, opciones: ExportOptions): string | null {
  if (opciones.desde && opciones.hasta && opciones.desde > opciones.hasta) {
    return 'La fecha "Desde" no puede ser posterior a "Hasta".';
  }
  if (formato === 'pdf' && opciones.secciones.length === 0) {
    return 'Selecciona al menos un dato para exportar.';
  }
  return null;
}

/**
 * Query string de la exportación. El CSV solo entiende el rango de fechas
 * (fuente/color/secciones/gráficas son del PDF); las gráficas se omiten si no
 * está la sección de miembros, de la que salen sus datos.
 */
export function buildExportQuery(formato: FormatoExport, opciones: ExportOptions): string {
  const params = new URLSearchParams();
  if (formato === 'pdf') {
    params.set('fuente', opciones.fuente);
    params.set('color', opciones.color);
    params.set('secciones', opciones.secciones.join(','));
    const graficas = opciones.secciones.includes('miembros') ? opciones.graficas : [];
    if (graficas.length > 0) {
      params.set('graficas', graficas.join(','));
    }
  }
  if (opciones.desde) {
    params.set('desde', opciones.desde);
  }
  if (opciones.hasta) {
    params.set('hasta', opciones.hasta);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}
