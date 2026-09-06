import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ProjectTransactionService,
  type ProjectLockRow,
  type ProjectTransactionContext,
} from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import { UpsertHourAdjustmentDto } from './dto/upsert-hour-adjustment.dto';

/**
 * C071/C072 (06 v2 §11): ajuste del líder sobre un tramo cerrado. Es
 * APPEND-ONLY en importe, base, justificación y autor: corregir NO reescribe
 * la fila vigente, la anula y crea un sucesor enlazado por `idAjusteAnterior`,
 * ambas cosas en la misma transacción. Nada se borra nunca.
 *
 * El ajuste jamás toca el reporte del integrante ni `AsignacionTarea.horasReales`:
 * la propuesta del tramo se COMPONE como caché + delta vigente. Confundir
 * ambas capas es exactamente lo que este diseño impide.
 */

export interface AjusteHoraPublico {
  idAjusteHora: number;
  idAsignacion: number;
  deltaHoras: string;
  horasBase: string;
  /** Caché observada + delta de este ajuste: lo que el líder propone. */
  propuesta: string;
  justificacion: string | null;
  idAutor: number;
  creadoEn: Date;
  anuladoEn: Date | null;
  anuladoPor: number | null;
  idAjusteAnterior: number | null;
  vigente: boolean;
}

const AJUSTE_SELECT = {
  idAjusteHora: true,
  idAsignacion: true,
  deltaHoras: true,
  horasBase: true,
  justificacion: true,
  idAutor: true,
  creadoEn: true,
  anuladoEn: true,
  anuladoPor: true,
  idAjusteAnterior: true,
} satisfies Prisma.AjusteHoraTareaSelect;

type AjusteRow = Prisma.AjusteHoraTareaGetPayload<{ select: typeof AJUSTE_SELECT }>;

function mapAjuste(row: AjusteRow): AjusteHoraPublico {
  return {
    idAjusteHora: row.idAjusteHora,
    idAsignacion: row.idAsignacion,
    deltaHoras: row.deltaHoras.toFixed(2),
    horasBase: row.horasBase.toFixed(2),
    propuesta: row.horasBase.plus(row.deltaHoras).toFixed(2),
    justificacion: row.justificacion,
    idAutor: row.idAutor,
    creadoEn: row.creadoEn,
    anuladoEn: row.anuladoEn,
    anuladoPor: row.anuladoPor,
    idAjusteAnterior: row.idAjusteAnterior,
    vigente: row.anuladoEn === null,
  };
}

/**
 * La bitácora guarda JSON: las fechas viajan en ISO y los Decimal como string
 * con dos posiciones, para que el detalle sea legible sin reconstruir tipos.
 */
function snapshotAjuste(row: AjusteRow): Record<string, string | number | boolean | null> {
  const publico = mapAjuste(row);
  return {
    ...publico,
    creadoEn: publico.creadoEn.toISOString(),
    anuladoEn: publico.anuladoEn?.toISOString() ?? null,
  };
}

@Injectable()
export class TaskHourAdjustmentsService {
  private readonly logger = new Logger(TaskHourAdjustmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly readPolicy: ProjectReadPolicyService,
    private readonly notifications: NotificationsService,
    private readonly bitacoraEventos?: BitacoraEventosService,
  ) {}

  private lockedProject(ctx: Pick<ProjectTransactionContext, 'project'>): ProjectLockRow {
    if (!ctx.project) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return ctx.project;
  }

  /**
   * §11: el tramo debe estar cerrado, con caché no nula, participación
   * histórica resuelta y sin consumir. La participación se exige porque el rol
   * histórico del ajuste se deriva del tramo, no del rol actual de la tarea:
   * sin ella, el ajuste no sabría a qué rol pertenece el trabajo que corrige.
   */
  private async assertAdjustableTx(
    tx: Prisma.TransactionClient,
    projectId: number,
    sprintId: number,
    assignmentId: number,
  ) {
    const tramo = await tx.asignacionTarea.findFirst({
      where: { idAsignacion: assignmentId, tarea: { idProyecto: projectId, idSprint: sprintId } },
      select: {
        idAsignacion: true,
        idTarea: true,
        idParticipacion: true,
        desasignadaEn: true,
        horasReales: true,
        reconocidoEn: true,
        origenReporte: true,
      },
    });
    if (!tramo) {
      throw new NotFoundException(
        `Asignación con id ${assignmentId} no encontrada en el Sprint ${sprintId}`,
      );
    }
    if (tramo.desasignadaEn === null) {
      throw new ConflictException('Solo se ajusta un tramo ya cerrado');
    }
    if (tramo.horasReales === null) {
      throw new ConflictException('El tramo todavía no tiene un reporte materializado');
    }
    if (tramo.idParticipacion === null) {
      throw new ConflictException('El tramo no tiene participación histórica resuelta');
    }
    if (tramo.reconocidoEn !== null) {
      throw new ConflictException('El tramo ya fue consumido y no admite ajustes');
    }
    return { ...tramo, horasReales: tramo.horasReales };
  }

  async upsert(
    projectId: number,
    sprintId: number,
    assignmentId: number,
    actorId: number,
    dto: UpsertHourAdjustmentDto,
  ): Promise<AjusteHoraPublico> {
    return this.projectTx.run(projectId, actorId, 'adjustments.upsert', async (ctx) => {
      const { tx } = ctx;
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'AJUSTE_HORA', actorId, {
        sprintId,
      });
      const tramo = await this.assertAdjustableTx(tx, projectId, sprintId, assignmentId);

      const delta = new Prisma.Decimal(dto.deltaHoras);
      const justificacion = dto.justificacion?.trim() || null;
      if (!delta.isZero() && justificacion === null) {
        throw new BadRequestException('justificacion es obligatoria cuando deltaHoras no es cero');
      }
      const base = tramo.horasReales;
      const propuesta = base.plus(delta);
      if (propuesta.isNegative()) {
        throw new BadRequestException('El total propuesto no puede ser negativo');
      }

      const vigente = await tx.ajusteHoraTarea.findFirst({
        where: { idAsignacion: assignmentId, anuladoEn: null },
        select: AJUSTE_SELECT,
      });

      // §11: un upsert que no cambia nada no es una corrección. Devuelve el
      // vigente tal cual, sin fila nueva y sin evento — así el reintento de un
      // cliente no ensucia la cadena ni la bitácora.
      if (
        vigente &&
        vigente.deltaHoras.equals(delta) &&
        vigente.horasBase.equals(base) &&
        vigente.justificacion === justificacion
      ) {
        return mapAjuste(vigente);
      }

      if (vigente) {
        const anulado = await tx.ajusteHoraTarea.updateMany({
          where: { idAjusteHora: vigente.idAjusteHora, anuladoEn: null },
          data: { anuladoEn: new Date(), anuladoPor: actorId },
        });
        if (anulado.count !== 1) {
          throw new ConflictException({
            statusCode: 409,
            code: 'AJUSTE_DESACTUALIZADO',
            message: 'El ajuste vigente cambió durante la operación; vuelve a consultarlo',
          });
        }
      }

      const creado = await this.createSuccessor(tx, {
        assignmentId,
        delta,
        base,
        justificacion,
        actorId,
        idAjusteAnterior: vigente?.idAjusteHora ?? null,
      });

      await this.bitacoraEventos?.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.TASK_HOURS_ADJUSTED,
        idActor: actorId,
        idProyecto: projectId,
        idSprint: sprintId,
        tipoEntidad: 'TAREA',
        idEntidad: tramo.idTarea,
        valorAnterior: vigente ? snapshotAjuste(vigente) : null,
        valorNuevo: snapshotAjuste(creado),
      });

      // Realtime post-commit: nunca un socket dentro de la transacción.
      ctx.effects.add({
        key: `realtime:adjust:${assignmentId}`,
        publish: () => this.publishAdjusted(projectId, sprintId, assignmentId, actorId),
      });

      return mapAjuste(creado);
    });
  }

  /**
   * El índice parcial `s7_ajuste_vigente` es la última línea de defensa de la
   * cardinalidad. Si una carrera lo viola, se traduce a 409 y se ABORTA: nunca
   * se sigue ejecutando queries sobre una transacción PostgreSQL ya fallida.
   */
  private async createSuccessor(
    tx: Prisma.TransactionClient,
    input: {
      assignmentId: number;
      delta: Prisma.Decimal;
      base: Prisma.Decimal;
      justificacion: string | null;
      actorId: number;
      idAjusteAnterior: number | null;
    },
  ): Promise<AjusteRow> {
    try {
      return await tx.ajusteHoraTarea.create({
        data: {
          idAsignacion: input.assignmentId,
          deltaHoras: input.delta,
          horasBase: input.base,
          justificacion: input.justificacion,
          idAutor: input.actorId,
          idAjusteAnterior: input.idAjusteAnterior,
        },
        select: AJUSTE_SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          code: 'AJUSTE_DESACTUALIZADO',
          message: 'Otro ajuste se registró primero sobre este tramo; vuelve a consultarlo',
        });
      }
      throw error;
    }
  }

  /**
   * C072 (§11): revertir anula el vigente y deja la propuesta igual a la
   * caché reportada. Un tramo sin vigente responde 204 sin evento: no es un
   * error pedir que se deshaga algo que ya no existe.
   */
  async revert(
    projectId: number,
    sprintId: number,
    assignmentId: number,
    actorId: number,
  ): Promise<void> {
    await this.projectTx.run(projectId, actorId, 'adjustments.revert', async (ctx) => {
      const { tx } = ctx;
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'AJUSTE_HORA', actorId, {
        sprintId,
      });
      const tramo = await this.assertAdjustableTx(tx, projectId, sprintId, assignmentId);

      const vigente = await tx.ajusteHoraTarea.findFirst({
        where: { idAsignacion: assignmentId, anuladoEn: null },
        select: AJUSTE_SELECT,
      });
      if (!vigente) {
        return;
      }

      const anulado = await tx.ajusteHoraTarea.updateMany({
        where: { idAjusteHora: vigente.idAjusteHora, anuladoEn: null },
        data: { anuladoEn: new Date(), anuladoPor: actorId },
      });
      // CAS perdido: otra conexión anuló primero. No hay nada que revertir y
      // tampoco un segundo evento que emitir.
      if (anulado.count !== 1) {
        return;
      }

      await this.bitacoraEventos?.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.TASK_HOURS_ADJUSTMENT_REVERTED,
        idActor: actorId,
        idProyecto: projectId,
        idSprint: sprintId,
        tipoEntidad: 'TAREA',
        idEntidad: tramo.idTarea,
        valorAnterior: snapshotAjuste(vigente),
        valorNuevo: null,
      });

      ctx.effects.add({
        key: `realtime:adjust:${assignmentId}`,
        publish: () => this.publishAdjusted(projectId, sprintId, assignmentId, actorId),
      });
    });
  }

  /** §11: la cadena completa, anulados incluidos, en orden de creación. */
  async history(
    projectId: number,
    sprintId: number,
    assignmentId: number,
    actorId: number,
  ): Promise<AjusteHoraPublico[]> {
    await this.readPolicy.assertRead(undefined, {
      projectId,
      actorId,
      scope: 'horas',
      entitySprintId: sprintId,
    });
    const filas = await this.prisma.ajusteHoraTarea.findMany({
      where: { idAsignacion: assignmentId, asignacion: { tarea: { idProyecto: projectId, idSprint: sprintId } } },
      orderBy: { idAjusteHora: 'asc' },
      select: AJUSTE_SELECT,
    });
    return filas.map(mapAjuste);
  }

  private async publishAdjusted(
    projectId: number,
    sprintId: number,
    assignmentId: number,
    actorId: number,
  ): Promise<void> {
    try {
      await this.notifications.notifySprintHoursAdjusted(projectId, actorId, {
        projectId,
        sprintId,
        idAsignacion: assignmentId,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo emitir SPRINT_HOURS_ADJUSTED para la asignación ${assignmentId}`,
        error as Error,
      );
    }
  }
}
