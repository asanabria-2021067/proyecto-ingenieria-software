/**
 * T-240 (HU-160): contrato de `GET /proyectos/:projectId/sprints/:sprintId/burndown`.
 *
 * `fechaInicio`/`fechaFinPlaneada` anclan la línea IDEAL (recta desde el
 * total planeado en `fechaInicio` hasta 0 en `fechaFinPlaneada`); el front
 * nunca la calcula desde las instantáneas. `fechaFinPlaneada` puede ser
 * `null` en un Sprint creado antes de HU-160 — en ese caso no hay línea
 * ideal que dibujar.
 *
 * `tareasPlanificadasTotal`/`puntosHistoriaPlanificadosTotal` son el total
 * planeado (todas las tareas del Sprint, HECHO o no): para un Sprint
 * `CERRADO` son las columnas congeladas por T-239 (`*Cierre`); para uno
 * `ACTIVO`/`EN_FINALIZACION` se recalculan en vivo — mismo criterio de
 * congelamiento que `getSprintsAnalytics`.
 *
 * `instantaneas` viene tal cual T-238 las guardó, ordenadas por `fecha`,
 * SIN rellenar ningún hueco: un día sin fila es un hueco real, y decidir
 * qué hacer con él (mostrarlo como corte en la línea) es responsabilidad
 * exclusiva del front — este contrato nunca inventa un valor.
 */
export interface SprintBurndownInstantaneaDto {
  fecha: string;
  tareasPendientes: number;
  tareasCompletadas: number;
  puntosHistoriaRestantes: number;
}

export interface SprintBurndownDto {
  idSprint: number;
  fechaInicio: string;
  fechaFinPlaneada: string | null;
  tareasPlanificadasTotal: number;
  puntosHistoriaPlanificadosTotal: number;
  instantaneas: SprintBurndownInstantaneaDto[];
}
