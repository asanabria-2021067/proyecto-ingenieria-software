import { NivelInsignia } from '@prisma/client';

export const INSIGNIAS_EVENTO = 'insignias.recalcular';

export type ClaveInsignia =
  | 'tareas'
  | 'horas'
  | 'cerrados'
  | 'liderados'
  | 'postulaciones'
  | 'comentarios'
  | 'sprints';

/**
 * Qué usuarios se recalculan: `idUsuarios` explícitos, los asignados a una
 * tarea (`idTarea`) o el equipo de un proyecto (`idProyecto`: líder y todos
 * los que alguna vez participaron).
 */
export interface InsigniasRecalcularEvent {
  claves: ClaveInsignia[];
  idUsuarios?: number[];
  idTarea?: number;
  idProyecto?: number;
}

export interface InsigniaDef {
  clave: ClaveInsignia;
  nombre: string;
  descripcion: string;
  icono: string;
  umbrales: [number, number, number, number];
}

export const NIVELES: readonly NivelInsignia[] = ['BRONCE', 'PLATA', 'ORO', 'DIAMANTE'];

export const CATALOGO_INSIGNIAS: readonly InsigniaDef[] = [
  { clave: 'tareas', nombre: 'Tareas completadas', descripcion: 'Tareas en Hecho en las que estuviste asignado.', icono: 'CheckCircle2', umbrales: [1, 10, 50, 100] },
  { clave: 'horas', nombre: 'Horas acreditadas', descripcion: 'Horas de participación aprobadas y acreditadas.', icono: 'Clock', umbrales: [5, 25, 100, 250] },
  { clave: 'cerrados', nombre: 'Proyectos cerrados', descripcion: 'Proyectos cerrados en los que participaste como integrante.', icono: 'FolderCheck', umbrales: [1, 3, 5, 10] },
  { clave: 'liderados', nombre: 'Proyectos liderados', descripcion: 'Proyectos cerrados que lideraste.', icono: 'Crown', umbrales: [1, 2, 4, 8] },
  { clave: 'postulaciones', nombre: 'Postulaciones aceptadas', descripcion: 'Postulaciones a roles que fueron aceptadas.', icono: 'UserCheck', umbrales: [1, 3, 5, 10] },
  { clave: 'comentarios', nombre: 'Comentarios en tareas', descripcion: 'Comentarios que escribiste en tareas.', icono: 'MessageSquare', umbrales: [5, 25, 100, 250] },
  { clave: 'sprints', nombre: 'Sprints completados', descripcion: 'Sprints cerrados en los que completaste al menos una tarea.', icono: 'Flag', umbrales: [1, 5, 10, 20] },
];

export const NOMBRE_NIVEL: Record<NivelInsignia, string> = {
  BRONCE: 'Bronce',
  PLATA: 'Plata',
  ORO: 'Oro',
  DIAMANTE: 'Diamante',
};

/** Posición del nivel (0 = sin nivel). */
export function rangoNivel(nivel: NivelInsignia | null): number {
  return nivel === null ? 0 : NIVELES.indexOf(nivel) + 1;
}

/** Mayor nivel cuyo umbral alcanza el progreso; null si no llega al de Bronce. */
export function nivelPara(progreso: number, umbrales: readonly number[]): NivelInsignia | null {
  let nivel: NivelInsignia | null = null;
  umbrales.forEach((umbral, i) => {
    if (progreso >= umbral) nivel = NIVELES[i];
  });
  return nivel;
}
