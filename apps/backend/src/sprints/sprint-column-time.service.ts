import { Injectable } from '@nestjs/common';
import { EstadoTarea } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SprintsAuthorizationService } from './sprints-authorization.service';

export interface TiempoPorColumnaDto {
  idSprint: number;
  columnas: Array<{ estado: EstadoTarea; promedioHoras: number; tareas: number }>;
}

interface CambioEstado {
  en: Date;
  estado: EstadoTarea;
}

const COLUMNAS = [EstadoTarea.POR_HACER, EstadoTarea.EN_PROGRESO, EstadoTarea.EN_REVISION] as const;
const ESTADOS = new Set<string>(Object.values(EstadoTarea));

/**
 * Horas que una tarea estuvo en cada columna desde `creada` (POR_HACER, o la
 * columna en que ya estaba por cambios anteriores) recorre los cambios de estado de la bitácora; el tramo abierto
 * se cierra en `hasta`. HECHO es terminal y no se reporta como columna.
 */
export function horasPorColumna(creada: Date, cambios: CambioEstado[], hasta: Date) {
  const horas = new Map<EstadoTarea, number>();
  let estado: EstadoTarea = EstadoTarea.POR_HACER;
  let desde = creada;
  for (const cambio of [...cambios, { en: hasta, estado: EstadoTarea.HECHO }]) {
    const fin = cambio.en < desde ? desde : cambio.en;
    // Los cambios anteriores a `creada` solo fijan la columna de partida.
    if (fin > desde) horas.set(estado, (horas.get(estado) ?? 0) + (fin.getTime() - desde.getTime()) / 3_600_000);
    estado = cambio.estado;
    desde = fin;
  }
  return horas;
}

/** MEJ-120: tiempo promedio por columna del tablero, de las tareas del Sprint. */
@Injectable()
export class SprintColumnTimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: SprintsAuthorizationService,
  ) {}

  async get(projectId: number, sprintId: number, userId: number): Promise<TiempoPorColumnaDto> {
    const sprint = await this.authorization.assertCanViewSprintAnalytics(projectId, sprintId, userId);
    const tareas = await this.prisma.tarea.findMany({
      where: { idProyecto: projectId, idSprint: sprintId, eliminadoEn: null },
      select: { idTarea: true, fechaCreacion: true },
    });
    const eventos = tareas.length
      ? await this.prisma.bitacoraAuditoria.findMany({
          where: {
            accion: 'TASK_STATUS_CHANGED',
            tipoObjeto: 'TAREA',
            idObjeto: { in: tareas.map((t) => String(t.idTarea)) },
          },
          orderBy: { fechaEvento: 'asc' },
          select: { idObjeto: true, fechaEvento: true, detalleJson: true },
        })
      : [];

    const cambiosPorTarea = new Map<string, CambioEstado[]>();
    for (const evento of eventos) {
      const nuevo = (evento.detalleJson as { valorNuevo?: { estadoTarea?: string } } | null)?.valorNuevo
        ?.estadoTarea;
      if (!evento.idObjeto || !nuevo || !ESTADOS.has(nuevo)) continue;
      const lista = cambiosPorTarea.get(evento.idObjeto) ?? [];
      lista.push({ en: evento.fechaEvento, estado: nuevo as EstadoTarea });
      cambiosPorTarea.set(evento.idObjeto, lista);
    }

    const hasta = sprint.fechaCierre ?? new Date();
    const suma = new Map<EstadoTarea, { horas: number; tareas: number }>();
    for (const tarea of tareas) {
      // Una tarea arrastrada de sprints anteriores solo cuenta desde que empezó este.
      const desde = tarea.fechaCreacion > sprint.fechaInicio ? tarea.fechaCreacion : sprint.fechaInicio;
      const horas = horasPorColumna(desde, cambiosPorTarea.get(String(tarea.idTarea)) ?? [], hasta);
      for (const columna of COLUMNAS) {
        const h = horas.get(columna);
        if (h === undefined) continue;
        const acumulado = suma.get(columna) ?? { horas: 0, tareas: 0 };
        suma.set(columna, { horas: acumulado.horas + h, tareas: acumulado.tareas + 1 });
      }
    }

    return {
      idSprint: sprintId,
      columnas: COLUMNAS.map((estado) => {
        const s = suma.get(estado);
        return { estado, tareas: s?.tareas ?? 0, promedioHoras: s ? Math.round((s.horas / s.tareas) * 10) / 10 : 0 };
      }),
    };
  }
}
