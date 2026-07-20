import { Injectable, NotFoundException } from '@nestjs/common';
import { EstadoTarea, Prioridad, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TasksAuthorizationService } from './tasks-authorization.service';

/**
 * Select único reutilizado por listado y detalle: hito, rolProyecto,
 * asignación activa (filtrada por desasignadaEn: null, con el usuario
 * asignado en campos seguros), etiquetas planas vía la tabla intermedia y
 * el conteo de comentarios no eliminados — todo en una sola consulta
 * Prisma, sin N+1.
 */
const TASK_SELECT = {
  idTarea: true,
  idProyecto: true,
  idHito: true,
  idRolProyecto: true,
  tituloTarea: true,
  descripcionTarea: true,
  estadoTarea: true,
  prioridad: true,
  creadaPor: true,
  fechaCreacion: true,
  fechaLimite: true,
  actualizadaEn: true,
  tiempoEstimadoHoras: true,
  hito: {
    select: { idHito: true, tituloHito: true },
  },
  rolProyecto: {
    select: { idRolProyecto: true, nombreRol: true },
  },
  asignaciones: {
    where: { desasignadaEn: null },
    select: {
      idAsignacion: true,
      idUsuario: true,
      fechaAsignacion: true,
      usuario: {
        select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true },
      },
    },
  },
  etiquetas: {
    select: {
      etiqueta: {
        select: { idEtiqueta: true, nombreEtiqueta: true, nombreNormalizado: true, color: true },
      },
    },
  },
  _count: {
    select: { comentarios: { where: { eliminadoEn: null } } },
  },
} satisfies Prisma.TareaSelect;

type TareaRow = Prisma.TareaGetPayload<{ select: typeof TASK_SELECT }>;

interface UsuarioResumenPublico {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
}

interface AsignacionActivaPublica {
  idAsignacion: number;
  idUsuario: number;
  fechaAsignacion: Date;
  usuario: UsuarioResumenPublico;
}

interface RolProyectoResumenPublico {
  idRolProyecto: number;
  nombreRol: string;
}

interface HitoResumenPublico {
  idHito: number;
  tituloHito: string;
}

interface EtiquetaPublica {
  idEtiqueta: number;
  nombreEtiqueta: string;
  nombreNormalizado: string;
  color: string;
}

export interface TareaPublica {
  idTarea: number;
  idProyecto: number;
  idHito: number | null;
  idRolProyecto: number | null;
  tituloTarea: string;
  descripcionTarea: string | null;
  estadoTarea: EstadoTarea;
  prioridad: Prioridad;
  creadaPor: number;
  fechaCreacion: Date;
  fechaLimite: string | null;
  actualizadaEn: Date | null;
  tiempoEstimadoHoras: number | null;
  asignacionActiva: AsignacionActivaPublica | null;
  rolProyecto: RolProyectoResumenPublico | null;
  hito: HitoResumenPublico | null;
  etiquetas: EtiquetaPublica[];
  cantidadComentarios: number;
}

/**
 * Prisma devuelve las columnas @db.Date como Date a medianoche UTC del día
 * calendario almacenado (verificado empíricamente contra la base local:
 * una fila con fecha_limite = DATE '2026-12-25' se lee como
 * 2026-12-25T00:00:00.000Z). Usar getters locales reinterpreta ese instante
 * en la zona horaria del proceso y puede desplazar el día (confirmado con
 * TZ=America/Guatemala: getFullYear/getMonth/getDate devolvían 24, no 25).
 * Por eso se extrae siempre con toISOString(), que es UTC por definición.
 */
function toDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function mapTarea(row: TareaRow): TareaPublica {
  const asignacion = row.asignaciones[0];
  const etiquetas = row.etiquetas
    .map((tareaEtiqueta) => tareaEtiqueta.etiqueta)
    .sort((a, b) => a.nombreNormalizado.localeCompare(b.nombreNormalizado));

  return {
    idTarea: row.idTarea,
    idProyecto: row.idProyecto,
    idHito: row.idHito,
    idRolProyecto: row.idRolProyecto,
    tituloTarea: row.tituloTarea,
    descripcionTarea: row.descripcionTarea,
    estadoTarea: row.estadoTarea,
    prioridad: row.prioridad,
    creadaPor: row.creadaPor,
    fechaCreacion: row.fechaCreacion,
    fechaLimite: toDateOnly(row.fechaLimite),
    actualizadaEn: row.actualizadaEn,
    tiempoEstimadoHoras: row.tiempoEstimadoHoras,
    asignacionActiva: asignacion
      ? {
          idAsignacion: asignacion.idAsignacion,
          idUsuario: asignacion.idUsuario,
          fechaAsignacion: asignacion.fechaAsignacion,
          usuario: asignacion.usuario,
        }
      : null,
    rolProyecto: row.rolProyecto,
    hito: row.hito,
    etiquetas,
    cantidadComentarios: row._count.comentarios,
  };
}

const PRIORITY_ORDER: Record<Prioridad, number> = {
  ALTA: 0,
  MEDIA: 1,
  BAJA: 2,
};

/**
 * Orden de negocio: ALTA > MEDIA > BAJA; dentro de la misma prioridad,
 * fecha límite más próxima primero (comparación de strings YYYY-MM-DD, ya
 * normalizados por mapTarea), tareas sin fecha al final, e idTarea
 * ascendente como desempate estable. Se ordena en memoria tras una única
 * consulta; no existe ninguna columna de posición manual.
 */
function compareTareas(a: TareaPublica, b: TareaPublica): number {
  const prioridadDiff = PRIORITY_ORDER[a.prioridad] - PRIORITY_ORDER[b.prioridad];
  if (prioridadDiff !== 0) {
    return prioridadDiff;
  }

  if (a.fechaLimite !== b.fechaLimite) {
    if (a.fechaLimite === null) return 1;
    if (b.fechaLimite === null) return -1;
    return a.fechaLimite < b.fechaLimite ? -1 : 1;
  }

  return a.idTarea - b.idTarea;
}

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private tasksAuthorization: TasksAuthorizationService,
  ) {}

  async findAll(projectId: number, userId: number): Promise<TareaPublica[]> {
    await this.tasksAuthorization.assertCanListProjectTasks(projectId, userId);

    const rows = await this.prisma.tarea.findMany({
      where: { idProyecto: projectId, eliminadoEn: null },
      select: TASK_SELECT,
    });

    return rows.map(mapTarea).sort(compareTareas);
  }

  async findOne(projectId: number, taskId: number, userId: number): Promise<TareaPublica> {
    await this.tasksAuthorization.assertCanReadTask(projectId, taskId, userId);

    // Se repiten los filtros de proyecto y soft delete aunque
    // assertCanReadTask ya validó la tarea, para cubrir el caso de que
    // cambie entre la autorización y esta lectura final.
    const row = await this.prisma.tarea.findFirst({
      where: { idTarea: taskId, idProyecto: projectId, eliminadoEn: null },
      select: TASK_SELECT,
    });

    if (!row) {
      throw new NotFoundException(
        `Tarea con id ${taskId} no encontrada en el proyecto ${projectId}`,
      );
    }

    return mapTarea(row);
  }
}
