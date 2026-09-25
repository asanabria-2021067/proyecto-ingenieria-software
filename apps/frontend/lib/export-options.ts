/**
 * Revisión del PR (HU-164): opciones que el usuario elige antes de exportar.
 * Los valores son exactamente los que valida el backend
 * (`apps/backend/src/exports/export-options.ts`); un valor fuera de esos
 * catálogos allá es un 400.
 */
export type FormatoExport = 'csv' | 'pdf';
export type Fuente = 'pequena' | 'mediana' | 'grande';
/** Hexadecimal `#rrggbb`, elegido con el selector de color. */
export type ColorTabla = string;
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
  color: '#464646',
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

export const SECCION_OPCIONES: ReadonlyArray<{ value: Seccion; label: string }> = [
  { value: 'miembros', label: 'Miembros y horas' },
  { value: 'avance', label: 'Avance por Sprint' },
  { value: 'burndown', label: 'Burndown de Sprints cerrados' },
];

export const GRAFICA_OPCIONES: ReadonlyArray<{ value: Grafica; label: string }> = [
  { value: 'barras', label: 'Gráfica de barras (horas por integrante)' },
  { value: 'pastel', label: 'Gráfica de pastel (distribución de horas)' },
];

export interface ContextoFechas {
  /** Día actual del usuario, AAAA-MM-DD. */
  hoy: string;
  /** Día de creación del proyecto, AAAA-MM-DD; null si no se conoce. */
  fechaCreacion: string | null;
}

export interface ErroresFechas {
  desde?: string;
  hasta?: string;
}

/** Día actual en la zona horaria del usuario, AAAA-MM-DD. */
export function hoyLocal(): string {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** Día UTC de una fecha ISO — el mismo criterio con el que el backend compara. */
export function diaDeCreacion(iso: string | null | undefined): string | null {
  return iso ? iso.slice(0, 10) : null;
}

function ddmmaaaa(dia: string): string {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}

/**
 * Errores del rango de fechas, cada uno con su tipo: anterior a la creación
 * del proyecto, posterior a hoy, o "Desde" posterior a "Hasta". El backend
 * repite estas reglas (es la autoridad); aquí se muestran antes de enviar.
 */
export function erroresDeFechas(opciones: ExportOptions, ctx: ContextoFechas): ErroresFechas {
  const { desde, hasta } = opciones;
  const errores: ErroresFechas = {};
  const antesDeCreacion = (campo: string) =>
    `La fecha "${campo}" debe ser igual o posterior a la fecha de creación del proyecto (${ddmmaaaa(ctx.fechaCreacion as string)}).`;
  const futura = (campo: string) => `La fecha "${campo}" no puede ser posterior a la fecha actual.`;

  if (desde) {
    if (ctx.fechaCreacion && desde < ctx.fechaCreacion) {
      errores.desde = antesDeCreacion('Desde');
    } else if (desde > ctx.hoy) {
      errores.desde = futura('Desde');
    } else if (hasta && desde > hasta) {
      errores.desde = 'La fecha "Desde" no puede ser posterior a la fecha "Hasta".';
    }
  }
  if (hasta) {
    if (hasta > ctx.hoy) {
      errores.hasta = futura('Hasta');
    } else if (ctx.fechaCreacion && hasta < ctx.fechaCreacion) {
      errores.hasta = antesDeCreacion('Hasta');
    }
  }
  return errores;
}

/** Primer error que impide exportar (fechas o datos), o null si las opciones son exportables. */
export function validarOpciones(
  formato: FormatoExport,
  opciones: ExportOptions,
  ctx: ContextoFechas = { hoy: hoyLocal(), fechaCreacion: null },
): string | null {
  const fechas = erroresDeFechas(opciones, ctx);
  if (fechas.desde ?? fechas.hasta) {
    return (fechas.desde ?? fechas.hasta) as string;
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
