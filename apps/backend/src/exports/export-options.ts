import { BadRequestException } from '@nestjs/common';

/**
 * Revisión del PR (HU-164): opciones que el usuario elige al exportar —
 * tamaño de fuente, color de las tablas, qué datos incluir, rango de fechas
 * y gráficas. Todo llega por query string y se valida aquí, en la frontera:
 * un valor fuera del catálogo es un 400, nunca un default silencioso.
 */
export const FUENTES = ['pequena', 'mediana', 'grande'] as const;
export const COLORES_TABLA = ['gris', 'azul', 'verde', 'rojo'] as const;
export const SECCIONES = ['miembros', 'avance', 'burndown'] as const;
export const GRAFICAS = ['barras', 'pastel'] as const;

export type FuenteExport = (typeof FUENTES)[number];
export type ColorTabla = (typeof COLORES_TABLA)[number];
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
  colorTablas: 'gris',
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

/** Tonos oscuros: el encabezado va con texto blanco y se distingue también en blanco y negro. */
export function colorTablaRgb(color: ColorTabla): [number, number, number] {
  return {
    gris: [70, 70, 70],
    azul: [30, 64, 140],
    verde: [22, 101, 52],
    rojo: [153, 27, 27],
  }[color] as [number, number, number];
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

function fecha(valor: unknown, campo: string): Date | null {
  if (valor === undefined || valor === '') {
    return null;
  }
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new BadRequestException(`${campo} debe tener el formato AAAA-MM-DD`);
  }
  const parsed = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== valor) {
    throw new BadRequestException(`${campo} no es una fecha válida`);
  }
  return parsed;
}

export function parseExportOptions(query: Record<string, unknown>): ExportOptions {
  const secciones = lista(query.secciones, SECCIONES, 'secciones', [...SECCIONES]);
  if (secciones.length === 0) {
    throw new BadRequestException('Selecciona al menos un dato para exportar');
  }
  const desde = fecha(query.desde, 'desde');
  const hasta = fecha(query.hasta, 'hasta');
  if (desde && hasta && desde.getTime() > hasta.getTime()) {
    throw new BadRequestException('desde no puede ser posterior a hasta');
  }
  return {
    fuente: elegir(query.fuente, FUENTES, 'fuente', DEFAULT_EXPORT_OPTIONS.fuente),
    colorTablas: elegir(query.color, COLORES_TABLA, 'color', DEFAULT_EXPORT_OPTIONS.colorTablas),
    secciones,
    graficas: lista(query.graficas, GRAFICAS, 'graficas', []),
    desde,
    hasta,
  };
}
