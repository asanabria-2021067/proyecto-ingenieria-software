/**
 * HU-158 (T-232): presenta un importe de horas que el backend ya calculó
 * («12.50» → «12.5 h», «0.00» → «0 h»). Solo recorta los ceros decimales del
 * string: nunca lo convierte a número ni lo redondea, así que no puede
 * alterar la contabilidad.
 */
export function formatearHoras(valor: string): string {
  const [entera, decimales = ''] = valor.trim().split('.');
  const significativos = decimales.replace(/0+$/, '');
  return `${significativos ? `${entera}.${significativos}` : entera} h`;
}
