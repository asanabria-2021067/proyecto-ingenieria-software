/** MEJ-34: rango [primer instante, último instante] del mes de `base` en hora local. */
export function rangoDelMes(base: Date): { desde: Date; hasta: Date } {
  return {
    desde: new Date(base.getFullYear(), base.getMonth(), 1),
    hasta: new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

export const mesSiguiente = (base: Date, delta: number) => new Date(base.getFullYear(), base.getMonth() + delta, 1);

/** Agrupa por día local (clave YYYY-MM-DD) conservando el orden de entrada. */
export function agruparPorDia<T extends { fechaInicio: string }>(eventos: T[]): [string, T[]][] {
  const mapa = new Map<string, T[]>();
  for (const e of eventos) {
    const d = new Date(e.fechaInicio);
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    mapa.set(clave, [...(mapa.get(clave) ?? []), e]);
  }
  return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));
}
