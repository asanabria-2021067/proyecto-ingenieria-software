import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectTransactionService } from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import { TasksAuthorizationService } from './tasks-authorization.service';
import { lockedProject } from './tasks-writes.helpers';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import type { CreateChecklistItemDto, UpdateChecklistItemDto } from './dto/checklist-item.dto';

export const MAX_ITEMS_CHECKLIST = 50;

const ITEM_SELECT = { idItem: true, texto: true, completado: true } as const;

const EVENTOS_HISTORIAL: string[] = [
  TipoEventoBitacora.TASK_CREATED,
  TipoEventoBitacora.TASK_UPDATED,
  TipoEventoBitacora.TASK_STATUS_CHANGED,
  TipoEventoBitacora.TASK_ASSIGNED,
  TipoEventoBitacora.TASK_REASSIGNED,
];

const ESTADO_TEXTO: Record<string, string> = {
  POR_HACER: 'Por hacer',
  EN_PROGRESO: 'En progreso',
  EN_REVISION: 'En revisión',
  HECHO: 'Hecho',
};

const CAMPO_TEXTO: Record<string, string> = {
  tituloTarea: 'el título',
  descripcionTarea: 'la descripción',
  prioridad: 'la prioridad',
  tiempoEstimadoHoras: 'las horas estimadas',
  puntosHistoria: 'los puntos de historia',
  idHito: 'el hito',
  idRolProyecto: 'el rol',
  idTareaBloqueante: 'la tarea que la bloquea',
  repeticion: 'la repetición',
};

export interface EntradaHistorialTarea {
  idAuditoria: number;
  tipo: string;
  descripcion: string;
  fecha: Date;
  actor: { idUsuario: number; nombre: string; apellido: string } | null;
}

type Json = Record<string, unknown> | null;

/**
 * MEJ-6 (checklist) y MEJ-10 (historial de la tarea). El checklist lo editan
 * el lider y el asignado activo (misma regla que cambiar el estado); el
 * historial lee la bitacora de auditoria ya existente, sin tabla nueva.
 */
@Injectable()
export class TasksExtrasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly authorization: TasksAuthorizationService,
    private readonly readPolicy: ProjectReadPolicyService,
  ) {}

  private escribirChecklist<T>(
    projectId: number,
    taskId: number,
    userId: number,
    operacion: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.projectTx.run(projectId, userId, operacion, async (ctx) => {
      const tarea = await this.authorization.assertCanChangeTaskState(projectId, taskId, userId, ctx.tx);
      await this.policy.assertWriteTx(ctx.tx, lockedProject(ctx), 'TAREA_WRITE', userId, {
        sprintId: tarea.idSprint,
      });
      return fn(ctx.tx);
    });
  }

  private listar(tx: Prisma.TransactionClient, taskId: number) {
    return tx.tareaChecklistItem.findMany({
      where: { idTarea: taskId },
      select: ITEM_SELECT,
      orderBy: [{ orden: 'asc' }, { idItem: 'asc' }],
    });
  }

  addItem(projectId: number, taskId: number, userId: number, dto: CreateChecklistItemDto) {
    return this.escribirChecklist(projectId, taskId, userId, 'tasks.checklist.add', async (tx) => {
      const cantidad = await tx.tareaChecklistItem.count({ where: { idTarea: taskId } });
      if (cantidad >= MAX_ITEMS_CHECKLIST) {
        throw new ConflictException(`El checklist admite hasta ${MAX_ITEMS_CHECKLIST} elementos`);
      }
      await tx.tareaChecklistItem.create({ data: { idTarea: taskId, texto: dto.texto, orden: cantidad } });
      return this.listar(tx, taskId);
    });
  }

  updateItem(projectId: number, taskId: number, itemId: number, userId: number, dto: UpdateChecklistItemDto) {
    return this.escribirChecklist(projectId, taskId, userId, 'tasks.checklist.update', async (tx) => {
      const data: Prisma.TareaChecklistItemUpdateManyMutationInput = {};
      if (dto.texto !== undefined) data.texto = dto.texto;
      if (dto.completado !== undefined) data.completado = dto.completado;
      const { count } = await tx.tareaChecklistItem.updateMany({ where: { idItem: itemId, idTarea: taskId }, data });
      if (count === 0) throw new NotFoundException(`Elemento ${itemId} no encontrado en la tarea ${taskId}`);
      return this.listar(tx, taskId);
    });
  }

  removeItem(projectId: number, taskId: number, itemId: number, userId: number) {
    return this.escribirChecklist(projectId, taskId, userId, 'tasks.checklist.remove', async (tx) => {
      const { count } = await tx.tareaChecklistItem.deleteMany({ where: { idItem: itemId, idTarea: taskId } });
      if (count === 0) throw new NotFoundException(`Elemento ${itemId} no encontrado en la tarea ${taskId}`);
      return this.listar(tx, taskId);
    });
  }

  /** MEJ-10: quien creo, movio, reasigno o cambio la fecha de la tarea; misma politica de lectura que el detalle, con el scope de bitacora. */
  async historial(projectId: number, taskId: number, userId: number): Promise<EntradaHistorialTarea[]> {
    const tarea = await this.authorization.assertCanReadTask(projectId, taskId, userId);
    await this.readPolicy.assertRead(undefined, {
      projectId,
      actorId: userId,
      scope: 'bitacora',
      entitySprintId: tarea?.idSprint ?? null,
    });
    const filas = await this.prisma.bitacoraAuditoria.findMany({
      where: { tipoObjeto: 'TAREA', idObjeto: String(taskId), accion: { in: EVENTOS_HISTORIAL } },
      orderBy: [{ fechaEvento: 'desc' }, { idAuditoria: 'desc' }],
      take: 100,
      include: { usuario: { select: { idUsuario: true, nombre: true, apellido: true } } },
    });

    const idsUsuarios = new Set<number>();
    for (const fila of filas) {
      const d = (fila.detalleJson ?? {}) as Record<string, Json>;
      for (const v of [d.valorAnterior, d.valorNuevo]) {
        if (typeof v?.idUsuario === 'number') idsUsuarios.add(v.idUsuario);
      }
    }
    const usuarios = await this.prisma.usuario.findMany({
      where: { idUsuario: { in: [...idsUsuarios] } },
      select: { idUsuario: true, nombre: true, apellido: true },
    });
    const nombre = new Map(usuarios.map((u) => [u.idUsuario, `${u.nombre} ${u.apellido}`]));

    return filas.map((fila) => {
      const d = (fila.detalleJson ?? {}) as Record<string, Json>;
      return {
        idAuditoria: fila.idAuditoria,
        tipo: fila.accion,
        descripcion: this.describir(fila.accion, d.valorAnterior ?? null, d.valorNuevo ?? null, nombre),
        fecha: fila.fechaEvento,
        actor: fila.usuario,
      };
    });
  }

  private describir(accion: string, antes: Json, despues: Json, nombre: Map<number, string>): string {
    const quien = (v: Json) =>
      typeof v?.idUsuario === 'number' ? (nombre.get(v.idUsuario) ?? 'otra persona') : 'nadie';
    switch (accion) {
      case TipoEventoBitacora.TASK_CREATED:
        return 'creó la tarea';
      case TipoEventoBitacora.TASK_STATUS_CHANGED:
        return `movió la tarea de ${ESTADO_TEXTO[String(antes?.estadoTarea)] ?? '-'} a ${ESTADO_TEXTO[String(despues?.estadoTarea)] ?? '-'}`;
      case TipoEventoBitacora.TASK_ASSIGNED:
        return `asignó la tarea a ${quien(despues)}`;
      case TipoEventoBitacora.TASK_REASSIGNED:
        return `reasignó la tarea de ${quien(antes)} a ${quien(despues)}`;
      default: {
        const partes: string[] = [];
        for (const campo of Object.keys(despues ?? {})) {
          if (campo === 'fechaLimite') {
            partes.push(`la fecha límite de ${String(antes?.fechaLimite ?? 'sin fecha')} a ${String(despues?.fechaLimite)}`);
          } else if (CAMPO_TEXTO[campo]) {
            partes.push(CAMPO_TEXTO[campo]);
          }
        }
        return partes.length > 0 ? `cambió ${partes.join(', ')}` : 'editó la tarea';
      }
    }
  }
}
