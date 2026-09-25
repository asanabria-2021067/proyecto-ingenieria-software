import { BadRequestException } from '@nestjs/common';

/**
 * Revisión del PR (HU-164): opciones que el usuario elige al exportar —
 * tamaño de fuente, color de las tablas, qué datos incluir, rango de fechas
 * y gráficas. Todo llega por query string y se valida aquí, en la frontera:
 * un valor fuera del catálogo es un 400, nunca un default silencioso.
 */
export const FUENTES = ['pequena', 'mediana', 'grande'] as const;
export const SECCIONES = ['miembros', 'avance', 'burndown'] as const;
export const GRAFICAS = ['barras', 'pastel'] as const;

export type FuenteExport = (typeof FUENTES)[number];
/** Color de las tablas: hexadecimal `#RRGGBB`, elegido con el selector de color. */
export type ColorTabla = string;
export type SeccionExport = (typeof SECCIONES)[number];
export type GraficaExport = (typeof GRAFICAS)[number];

export interface ExportOptions {
  fuente: FuenteExport;
  colorTablas: ColorTabla;
  secciones: SeccionExport[];
  graficas: GraficaExport[];
  /** Día UTC inclusivo; null = sin límite inferior. */
  desde: Date | null;
  /** Día UTC inclusivo; null = sin límite superior. */
  hasta: Date | null;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  fuente: 'mediana',
  colorTablas: '#464646',
  secciones: [...SECCIONES],
  graficas: [],
  desde: null,
  hasta: null,
};

export interface FuenteTamanos {
  tabla: number;
  texto: number;
  seccion: number;
  titulo: number;
}

/** `mediana` reproduce los tamaños que el reporte ya usaba antes de esta opción. */
export function tamanosDeFuente(fuente: FuenteExport): FuenteTamanos {
  const tabla = { pequena: 8, mediana: 9, grande: 11 }[fuente];
  return { tabla, texto: tabla + 2, seccion: tabla + 4, titulo: tabla + 7 };
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function colorTablaRgb(color: ColorTabla): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [number, number, number];
}

/**
 * Color del texto del encabezado (255 blanco / 0 negro) según la luminosidad
 * del fondo elegido: con un color libre el texto blanco fijo dejaría de leerse
 * sobre uno claro (ej. un celeste). Luminancia relativa WCAG; umbral 0.179: el
 * punto donde negro y blanco dan el mismo contraste.
 */
export function textoSobreColor([r, g, b]: [number, number, number]): 0 | 255 {
  const lineal = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminancia = 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
  return luminancia > 0.179 ? 0 : 255;
}

function elegir<T extends string>(valor: unknown, catalogo: readonly T[], campo: string, defecto: T): T {
  if (valor === undefined) {
    return defecto;
  }
  if (typeof valor !== 'string' || !(catalogo as readonly string[]).includes(valor)) {
    throw new BadRequestException(`${campo} debe ser uno de: ${catalogo.join(', ')}`);
  }
  return valor as T;
}

function lista<T extends string>(valor: unknown, catalogo: readonly T[], campo: string, defecto: T[]): T[] {
  if (valor === undefined) {
    return defecto;
  }
  if (typeof valor !== 'string') {
    throw new BadRequestException(`${campo} debe ser una lista separada por comas`);
  }
  const items = valor === '' ? [] : valor.split(',').map((item) => item.trim());
  for (const item of items) {
    if (!(catalogo as readonly string[]).includes(item)) {
      throw new BadRequestException(`${campo} debe contener solo: ${catalogo.join(', ')}`);
    }
  }
  return [...new Set(items)] as T[];
}

function color(valor: unknown): ColorTabla {
  if (valor === undefined) {
    return DEFAULT_EXPORT_OPTIONS.colorTablas;
  }
  if (typeof valor !== 'string' || !HEX_COLOR.test(valor)) {
    throw new BadRequestException('color debe ser un color hexadecimal con el formato #RRGGBB');
  }
  return valor.toLowerCase();
}

function fecha(valor: unknown, campo: string): Date | null {
  if (valor === undefined || valor === '') {
    return null;
  }
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new BadRequestException(`La fecha "${campo}" debe tener el formato AAAA-MM-DD.`);
  }
  const parsed = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== valor) {
    throw new BadRequestException(`La fecha "${campo}" no es una fecha válida.`);
  }
  return parsed;
}

export function parseExportOptions(query: Record<string, unknown>): ExportOptions {
  const secciones = lista(query.secciones, SECCIONES, 'secciones', [...SECCIONES]);
  if (secciones.length === 0) {
    throw new BadRequestException('Selecciona al menos un dato para exportar');
  }
  const desde = fecha(query.desde, 'Desde');
  const hasta = fecha(query.hasta, 'Hasta');
  if (desde && hasta && desde.getTime() > hasta.getTime()) {
    throw new BadRequestException('La fecha "Desde" no puede ser posterior a la fecha "Hasta".');
  }
  return {
    fuente: elegir(query.fuente, FUENTES, 'fuente', DEFAULT_EXPORT_OPTIONS.fuente),
    colorTablas: color(query.color),
    secciones,
    graficas: lista(query.graficas, GRAFICAS, 'graficas', []),
    desde,
    hasta,
  };
}
