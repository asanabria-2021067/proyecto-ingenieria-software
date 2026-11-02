/** MEJ-45: enlaces internos a un proyecto o a una tarea (`/dashboard/projects|proyectos/:id[/.../tasks|tareas/:id]`). */
export type EnlaceInterno = { tipo: 'PROYECTO'; idProyecto: number } | { tipo: 'TAREA'; idProyecto: number; idTarea: number };

const RUTA = /^\/dashboard\/(?:projects|proyectos)\/([1-9]\d{0,8})(?:\/|$)/;
const TAREA = /\/(?:tasks|tareas)\/([1-9]\d{0,8})(?:\/|$)/;

/** El cliente envia solo la ruta (sin origen, query ni hash); null si no es un enlace interno reconocido. */
export function parsearEnlaceInterno(ruta: string): EnlaceInterno | null {
  const proyecto = RUTA.exec(ruta);
  if (!proyecto) return null;
  const idProyecto = Number(proyecto[1]);
  const tarea = TAREA.exec(ruta);
  return tarea ? { tipo: 'TAREA', idProyecto, idTarea: Number(tarea[1]) } : { tipo: 'PROYECTO', idProyecto };
}
