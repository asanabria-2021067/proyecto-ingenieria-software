import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AsignacionTarea, EstadoTarea, Prisma, RepeticionTarea } from '@prisma/client';
import type { ProjectLockRow, ProjectTransactionContext } from '../common/project-policy/project-transaction.service';
import { calcularProgresoHito } from '../common/hito-progreso';

export function lockedProject(ctx: Pick<ProjectTransactionContext, 'project'>): ProjectLockRow {
  if (!ctx.project) {
    throw new NotFoundException('Proyecto no encontrado');
  }
  return ctx.project;
}

/**
 * A12: sincroniza `Hito.estadoHito` con el progreso real derivado de sus
 * tareas vigentes — misma fórmula única que `ProjectsService.calcularAvanceHitos`
 * (vía `calcularProgresoHito`, src/common/hito-progreso.ts), nunca una
 * segunda definición. Se llama SIEMPRE dentro de la misma transacción que
 * acaba de escribir `estadoTarea`, así que la consulta ve el estado ya
 * comprometido (no el anterior). Acotado por `idHito`: una sola consulta
 * (`tarea.findMany` filtrado por ese Hito, `eliminadoEn: null`) y una sola
 * escritura (`hito.update`) — nunca recorre otros Hitos ni otros
 * proyectos. El caller es responsable de solo invocar esto cuando la
 * tarea realmente tiene `idHito !== null`.
 */
export async function syncHitoEstado(tx: Prisma.TransactionClient, idHito: number): Promise<void> {
  const tareasHito = await tx.tarea.findMany({
    where: { idHito, eliminadoEn: null },
    select: { estadoTarea: true },
  });
  const { estadoHito } = calcularProgresoHito(tareasHito);
  await tx.hito.update({
    where: { idHito },
    data: { estadoHito },
  });
}

/**
 * Crea la fila activa de AsignacionTarea y traduce ÚNICAMENTE la
 * violación reconocida del índice parcial asignacion_tarea_activa_unique
 * a 409; cualquier otro error (otro P2002, P2003, P2025, errores de
 * conexión, errores genéricos) se relanza sin cambios. Único punto de
 * `tx.asignacionTarea.create` en assign(): se reutiliza tanto para la
 * asignación inicial como para la reasignación, de modo que el manejo de
 * la colisión no se duplica ni se olvida en ninguno de los dos caminos.
 */
export async function createActiveAssignment(
  tx: Prisma.TransactionClient,
  data: {
    idTarea: number;
    idUsuario: number;
    idParticipacion: number;
    asignadoPor: number;
    desasignadaEn: null;
  },
): Promise<AsignacionTarea> {
  try {
    return await tx.asignacionTarea.create({ data });
  } catch (error) {
    if (isActiveAssignmentCollision(error)) {
      throw new ConflictException('La tarea ya tiene una asignación activa');
    }
    throw error;
  }
}

/**
 * Reconoce específicamente la violación del índice parcial
 * asignacion_tarea_activa_unique (Tarea 9), reproducida empíricamente
 * contra PostgreSQL real antes de escribir este detector (Tarea 26):
 * Prisma 6.19.2 no expone el nombre del índice parcial en `error.meta`
 * para esta violación — solo entrega `modelName` y `target` (las
 * columnas involucradas, en snake_case real de la base: `id_tarea`). Por
 * eso no basta `error.code === 'P2002'`: se exige además que el modelo
 * sea AsignacionTarea y que el target sea exactamente ['id_tarea'], la
 * combinación más estrecha posible con la metadata realmente disponible.
 * Un P2002 de otro modelo u otro target, un P2003 (FK), un P2025
 * (registro no encontrado) o cualquier error sin esa forma exacta
 * devuelven false y se relanzan sin cambios por el llamador.
 */
function isActiveAssignmentCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  if (error.code !== 'P2002') {
    return false;
  }

  const modelName = error.meta?.modelName;
  const target = error.meta?.target;

  return (
    modelName === 'AsignacionTarea' &&
    Array.isArray(target) &&
    target.length === 1 &&
    target[0] === 'id_tarea'
  );
}

/**
 * MEJ-47: siguiente ocurrencia (fecha UTC de calendario). En mensual el dia se
 * ajusta al ultimo del mes, pero siempre se ancla a `diaAncla` (el dia de la
 * fecha original) para que 31-ene no degrade a 28 para siempre.
 */
export function sumarRepeticion(fecha: Date, repeticion: RepeticionTarea, diaAncla = fecha.getUTCDate()): Date {
  const d = new Date(fecha);
  if (repeticion === RepeticionTarea.DIARIA) {
    d.setUTCDate(d.getUTCDate() + 1);
  } else if (repeticion === RepeticionTarea.SEMANAL) {
    d.setUTCDate(d.getUTCDate() + 7);
  } else {
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(diaAncla, ultimo));
  }
  return d;
}

/**
 * MEJ-48: valida la tarea bloqueante: del mismo proyecto, vigente, distinta de
 * la propia y sin ciclos (se recorre la cadena de bloqueantes; una cadena que
 * regrese a `idTarea` es un ciclo). `idTarea` es null al crear. Solo el primer
 * eslabon debe existir: un eslabon posterior eliminado ya no bloquea y corta
 * el recorrido (no hay ciclo posible a traves de el).
 */
export async function assertBloqueanteValido(
  tx: Prisma.TransactionClient,
  projectId: number,
  idTarea: number | null,
  idBloqueante: number,
): Promise<void> {
  if (idTarea !== null && idBloqueante === idTarea) {
    throw new BadRequestException('Una tarea no puede estar bloqueada por sí misma');
  }
  const vistos = new Set<number>();
  let actual: number | null = idBloqueante;
  while (actual !== null && !vistos.has(actual)) {
    vistos.add(actual);
    if (idTarea !== null && actual === idTarea) {
      throw new BadRequestException('La dependencia crearía un ciclo entre tareas');
    }
    const fila: { idProyecto: number; idTareaBloqueante: number | null; eliminadoEn: Date | null } | null =
      await tx.tarea.findFirst({
        where: { idTarea: actual },
        select: { idProyecto: true, idTareaBloqueante: true, eliminadoEn: true },
      });
    if (!fila || fila.idProyecto !== projectId) {
      throw new BadRequestException('La tarea bloqueante no existe en este proyecto');
    }
    if (fila.eliminadoEn) {
      if (actual === idBloqueante) throw new BadRequestException('La tarea bloqueante no existe en este proyecto');
      return;
    }
    actual = fila.idTareaBloqueante;
  }
}

/**
 * MEJ-48: una tarea bloqueada solo puede volver/permanecer en POR_HACER hasta
 * que su bloqueante esté HECHO. Un bloqueante eliminado ya no bloquea. Recibe
 * las filas ya leídas por la autorización: sin bloqueante no hay consulta extra.
 */
export async function assertNoBloqueada(
  tx: Prisma.TransactionClient,
  tareas: { tituloTarea?: string; idTareaBloqueante?: number | null }[],
  estado: EstadoTarea,
): Promise<void> {
  if (estado === EstadoTarea.POR_HACER) return;
  for (const tarea of tareas) {
    if (tarea.idTareaBloqueante == null) continue;
    const bloqueante = await tx.tarea.findFirst({
      where: { idTarea: tarea.idTareaBloqueante, eliminadoEn: null, estadoTarea: { not: EstadoTarea.HECHO } },
      select: { tituloTarea: true },
    });
    if (bloqueante) {
      throw new ConflictException(
        `La tarea "${tarea.tituloTarea ?? ''}" está bloqueada por "${bloqueante.tituloTarea}" hasta que esa tarea esté en Hecho.`,
      );
    }
  }
}
