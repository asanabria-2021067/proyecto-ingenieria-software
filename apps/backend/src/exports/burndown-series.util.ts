import type { SprintBurndownDto } from '../sprints/dto/sprint-burndown.dto';

/**
 * T-260 (HU-164): port EXACTO de `construirSerie`
 * (apps/frontend/components/projects/burndown-chart.tsx) — misma lógica de
 * fechas/interpolación, sin ninguna dependencia de React/DOM, para que el
 * burndown dibujado en el PDF nunca diverja del que se ve en pantalla. Si
 * `construirSerie` cambia en el frontend, este archivo debe cambiar junto
 * con él.
 */
export type EjeBurndown = 'puntos' | 'tareas';

export interface PuntoBurndown {
  fecha: string;
  ideal: number | null;
  real: number | null;
}

const UN_DIA_MS = 24 * 60 * 60 * 1000;

/** Día calendario UTC de un ISO string — mismo ancla que `@db.Date` en el backend. */
function diaUTC(iso: string): number {
  const fecha = new Date(iso);
  return Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
}

/**
 * Construye la serie del gráfico: un punto POR CADA DÍA entre `fechaInicio`
 * y el último día relevante (la fecha planeada de fin si existe, si no el
 * último día con instantánea). `real` viene únicamente de una instantánea
 * que exista para ese día exacto — un día sin fila queda en `null`, nunca
 * interpolado. `ideal` es la recta desde el total inicial hasta 0 en la
 * fecha planeada; sin `fechaFinPlaneada` no hay línea ideal (todo `null`).
 */
export function construirSerieBurndown(burndown: SprintBurndownDto, eje: EjeBurndown): PuntoBurndown[] {
  const inicio = diaUTC(burndown.fechaInicio);
  const finPlaneado = burndown.fechaFinPlaneada ? diaUTC(burndown.fechaFinPlaneada) : null;
  const ultimaInstantanea =
    burndown.instantaneas.length > 0
      ? diaUTC(burndown.instantaneas[burndown.instantaneas.length - 1].fecha)
      : inicio;
  const fin = Math.max(finPlaneado ?? ultimaInstantanea, ultimaInstantanea, inicio);

  const totalInicial =
    eje === 'puntos' ? burndown.puntosHistoriaPlanificadosTotal : burndown.tareasPlanificadasTotal;
  const duracionDias = finPlaneado !== null ? Math.max(1, (finPlaneado - inicio) / UN_DIA_MS) : null;

  const porDia = new Map<number, number>();
  for (const instantanea of burndown.instantaneas) {
    const valor = eje === 'puntos' ? instantanea.puntosHistoriaRestantes : instantanea.tareasPendientes;
    porDia.set(diaUTC(instantanea.fecha), valor);
  }

  const serie: PuntoBurndown[] = [];
  for (let dia = inicio; dia <= fin; dia += UN_DIA_MS) {
    const transcurridos = (dia - inicio) / UN_DIA_MS;
    const ideal =
      duracionDias === null ? null : Math.max(0, Math.round(totalInicial * (1 - transcurridos / duracionDias)));
    serie.push({
      fecha: new Date(dia).toISOString(),
      ideal,
      real: porDia.has(dia) ? (porDia.get(dia) as number) : null,
    });
  }
  return serie;
}
