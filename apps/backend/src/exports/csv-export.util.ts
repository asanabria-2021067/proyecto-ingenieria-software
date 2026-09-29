/**
 * T-259 (HU-164): serializador manual de CSV. No hay librería de CSV en el
 * proyecto (json2csv/papaparse/etc.); para un archivo de un par de columnas
 * por integrante, escribirlo a mano evita una dependencia nueva y deja el
 * control completo sobre el punto que de verdad rompe estos archivos:
 * codificación y separador en Excel en español.
 *
 * - BOM UTF-8 al inicio: sin él, Excel en Windows adivina la codificación y
 *   un acento o una ñ se ve como un carácter roto.
 * - `;` como separador: Excel en español usa `,` como separador decimal, así
 *   que interpreta un CSV separado por `,` como una sola columna.
 * - CRLF por fila: el fin de línea que Excel espera en Windows.
 */
const CSV_SEPARATOR = ';';
const CSV_BOM = '﻿';
const CSV_LINE_BREAK = '\r\n';

/**
 * G07 (VM1-N06 · OWASP A04/A05:2025): Excel y LibreOffice ejecutan como
 * fórmula una celda que empieza con =, +, -, @, TAB o CR (inyección CSV:
 * HYPERLINK, DDE). Un apóstrofo delante la deja como texto; se aplica a las
 * celdas de texto ANTES del escape CSV. Los números (horas) no cambian.
 */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

export function neutralizeCsvFormula(value: string): string {
  return FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix)) ? `'${value}` : value;
}

function escapeCsvField(value: string): string {
  if (value.includes('"') || value.includes(CSV_SEPARATOR) || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Serializa filas ya completas (sin distinguir cabecera): cada una se neutraliza y se escapa igual. */
export function buildCsvFromRows(rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  const lineas = rows.map((fila) =>
    fila.map((celda) => escapeCsvField(typeof celda === 'string' ? neutralizeCsvFormula(celda) : String(celda))).join(CSV_SEPARATOR),
  );
  return CSV_BOM + lineas.join(CSV_LINE_BREAK) + CSV_LINE_BREAK;
}

export function buildCsv(headers: string[], rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  return buildCsvFromRows([headers, ...rows]);
}

/**
 * Mismo motivo documentado en tasks.service.ts#toDateOnly y
 * team.service.ts#toDateOnly: una columna `@db.Date` se lee como medianoche
 * UTC del día calendario almacenado, así que `toISOString()` es la única
 * extracción segura del día — un getter local podría desplazarlo según la
 * zona horaria del proceso. Aquí solo se reformatea ese día a DD/MM/AAAA,
 * el formato legible que pide T-259.
 */
export function formatFechaCsv(value: Date | null): string {
  if (!value) {
    return '';
  }
  const [anio, mes, dia] = value.toISOString().slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}
