import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoSolicitudSalida, EstadoSprint, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { HoursRecognitionService } from '../sprints/hours-recognition.service';
import { SprintsContextService } from '../sprints/sprints-context.service';
import { ExitRequestsAuthorizationService } from './exit-requests.authorization.service';
import { ExitRequestsContextService } from './exit-requests.context.service';
import {
  ProjectTransactionService,
  type ProjectLockRow,
  type ProjectTransactionContext,
} from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';

/**
 * C044 (06 v2 §13/§32): las cinco escrituras de salida corren en el runner
 * por proyecto con la familia `SALIDA` (P/E, ambiente `NOT_FINALIZING`), y
 * cada assert de autorización y de contexto recibe el `tx` del lock. La
 * aprobación relee bajo el lock los valores definitivos (liderazgo, estado de
 * la solicitud y tareas pendientes) antes de resolver. Solicitar y continuar
 * no reconocen horas; el reconocimiento sigue viviendo únicamente en la rama
 * de aprobación, tal como está hoy.
 */
@Injectable()
export class ExitRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly authorization: ExitRequestsAuthorizationService,
    private readonly context: ExitRequestsContextService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly readPolicy: ProjectReadPolicyService,
    private readonly hoursRecognition?: HoursRecognitionService,
    private readonly sprintsContext?: SprintsContextService,
    // C083: la aprobación deja hecho funcional en bitácora dentro de la misma
    // transacción de dominio. Opcional por el mismo motivo posicional que en
    // Tasks/Sprints; en producción el módulo siempre lo provee.
    private readonly bitacoraEventos?: BitacoraEventosService,
  ) {}

  private lockedProject(ctx: Pick<ProjectTransactionContext, 'project'>): ProjectLockRow {
    if (!ctx.project) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return ctx.project;
  }

  async createSolicitudSalida(idProyecto: number, idUsuario: number, motivo: string) {
    const motivoLimpio = motivo.trim();
    if (motivoLimpio.length === 0) {
      throw new BadRequestException('motivo no puede estar vacío');
    }

    return this.projectTx.run(idProyecto, idUsuario, 'exit-requests.create', async (ctx) => {
      const { tx } = ctx;
      await this.authorization.assertCanCreateSolicitudSalida(idProyecto, idUsuario, tx);
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'SALIDA', idUsuario);

      const solicitudAbierta = await tx.solicitudSalidaProyecto.findFirst({
        where: {
          idProyecto,
          idUsuario,
          estadoSolicitud: { in: ['PREPARACION', 'PENDIENTE_LIDER'] },
        },
        select: { idSolicitud: true },
      });
      if (solicitudAbierta) {
        throw new ConflictException('Ya existe una solicitud de salida pendiente para este proyecto');
      }

      try {
        return await tx.solicitudSalidaProyecto.create({
          data: {
            idProyecto,
            idUsuario,
            motivo: motivoLimpio,
            estadoSolicitud: EstadoSolicitudSalida.PREPARACION,
          },
        });
      } catch (error) {
        if (this.isPendingExitRequestCollision(error)) {
          throw new ConflictException('Ya existe una solicitud de salida pendiente para este proyecto');
        }
        throw error;
      }
    });
  }

  /**
   * F11.1 — reader aditivo, pequeño y estable: la solicitud de salida
   * ABIERTA (PREPARACION o PENDIENTE_LIDER) del actor en este proyecto, o
   * `null` si no tiene ninguna. A diferencia de `getExitPreparationSummary`
   * (B6, acoplado a PREPARACION y que lanza 400 para cualquier otro caso),
   * este endpoint nunca lanza por "no hay solicitud abierta" — esa ausencia
   * es un resultado de lectura válido (`{ solicitud: null }`), no un error.
   * No amplía el significado de B6; es un endpoint nuevo y paralelo.
   */
  async getSolicitudSalidaAbierta(idProyecto: number, actorUserId: number) {
    await this.context.getProjectOrThrow(idProyecto);
    // C044 (§34): lectura autorizada por la política; el filtro por actor se
    // conserva, así que nunca devuelve la solicitud de otra persona.
    await this.readPolicy.assertRead(undefined, {
      projectId: idProyecto,
      actorId: actorUserId,
      scope: 'equipo',
    });

    const solicitud = await this.prisma.solicitudSalidaProyecto.findFirst({
      where: {
        idProyecto,
        idUsuario: actorUserId,
        estadoSolicitud: {
          in: [EstadoSolicitudSalida.PREPARACION, EstadoSolicitudSalida.PENDIENTE_LIDER],
        },
      },
      select: {
        idSolicitud: true,
        idProyecto: true,
        idUsuario: true,
        motivo: true,
        solicitadaEn: true,
        estadoSolicitud: true,
      },
    });

    return { solicitud };
  }

  /**
   * F14.1 — reader LEADER-FACING: todas las `SolicitudSalidaProyecto` en
   * `PENDIENTE_LIDER` del proyecto, sin importar qué usuario las presentó
   * (a diferencia de `getSolicitudSalidaAbierta`, scoped al actor). Único
   * reader de este dominio pensado para que el LÍDER vea las solicitudes de
   * OTROS, por eso exige `assertProjectLeader` en vez de limitarse a
   * `getProjectOrThrow`. `team.service.ts` delega aquí en vez de consultar
   * `Prisma.solicitudSalidaProyecto` directamente, para no duplicar el
   * dominio de exit-requests fuera de su servicio dueño (mismo precedente
   * que `TeamService.getPendingPostulations` → `ApplicationsService.findAll`
   * para B13).
   */
  async getPendingLeaderReviews(idProyecto: number, liderId: number) {
    await this.authorization.assertProjectLeader(idProyecto, liderId);

    return this.prisma.solicitudSalidaProyecto.findMany({
      where: {
        idProyecto,
        estadoSolicitud: EstadoSolicitudSalida.PENDIENTE_LIDER,
      },
      select: {
        idSolicitud: true,
        idProyecto: true,
        idUsuario: true,
        motivo: true,
        solicitadaEn: true,
        estadoSolicitud: true,
      },
      orderBy: { solicitadaEn: 'asc' },
    });
  }

  async getExitPreparationSummary(idProyecto: number, actorUserId: number) {
    await this.context.getProjectOrThrow(idProyecto);
    await this.readPolicy.assertRead(undefined, {
      projectId: idProyecto,
      actorId: actorUserId,
      scope: 'equipo',
    });

    const solicitud = await this.prisma.solicitudSalidaProyecto.findFirst({
      where: {
        idProyecto,
        idUsuario: actorUserId,
        estadoSolicitud: EstadoSolicitudSalida.PREPARACION,
      },
      select: {
        idSolicitud: true,
        idProyecto: true,
        idUsuario: true,
        estadoSolicitud: true,
        solicitadaEn: true,
      },
    });

    if (!solicitud) {
      throw new BadRequestException('No existe una solicitud de salida en estado PREPARACION');
    }

    const blockers = await this.prisma.asignacionTarea.findMany({
      where: {
        idUsuario: actorUserId,
        desasignadaEn: null,
        tarea: { idProyecto },
      },
      orderBy: [{ fechaAsignacion: 'asc' }, { idAsignacion: 'asc' }],
      select: {
        idAsignacion: true,
        idTarea: true,
        fechaAsignacion: true,
        horasReales: true,
        tarea: {
          select: {
            tituloTarea: true,
            estadoTarea: true,
          },
        },
        _count: {
          select: { registrosAvance: true },
        },
      },
    });

    const items = blockers.map((asignacion) => {
      const tieneHoras = asignacion.horasReales !== null;
      const tieneAvance = asignacion._count.registrosAvance > 0;
      return {
        idAsignacion: asignacion.idAsignacion,
        idTarea: asignacion.idTarea,
        tituloTarea: asignacion.tarea.tituloTarea,
        estadoTarea: asignacion.tarea.estadoTarea,
        fechaAsignacion: asignacion.fechaAsignacion,
        horasReales: asignacion.horasReales?.toNumber() ?? null,
        tieneHoras,
        tieneAvance,
        estadoPreparacion: tieneHoras && tieneAvance ? 'COMPLETA' : 'PENDIENTE',
      };
    });

    return {
      solicitud,
      blockers: items,
      cantidadBlockers: items.length,
      puedeContinuar: items.length === 0,
    };
  }

  async continueExitPreparation(idProyecto: number, actorUserId: number) {
    const resultado = await this.projectTx.run(
      idProyecto,
      actorUserId,
      'exit-requests.continuePreparation',
      async (ctx) => {
      const { tx } = ctx;
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'SALIDA', actorUserId);
      const solicitud = await tx.solicitudSalidaProyecto.findFirst({
        where: {
          idProyecto,
          idUsuario: actorUserId,
          estadoSolicitud: EstadoSolicitudSalida.PREPARACION,
        },
        select: {
          idSolicitud: true,
          idProyecto: true,
          idUsuario: true,
          estadoSolicitud: true,
          solicitadaEn: true,
          motivo: true,
        },
      });

      if (!solicitud) {
        throw new BadRequestException('No existe una solicitud de salida en estado PREPARACION');
      }

      const blocker = await tx.asignacionTarea.findFirst({
        where: {
          idUsuario: actorUserId,
          desasignadaEn: null,
          tarea: { idProyecto },
        },
        select: { idAsignacion: true },
      });

      if (blocker) {
        throw new ConflictException('No puedes continuar mientras tengas asignaciones de tareas vigentes');
      }

      const updated = await tx.solicitudSalidaProyecto.updateMany({
        where: {
          idSolicitud: solicitud.idSolicitud,
          idProyecto,
          idUsuario: actorUserId,
          estadoSolicitud: EstadoSolicitudSalida.PREPARACION,
        },
        data: {
          estadoSolicitud: EstadoSolicitudSalida.PENDIENTE_LIDER,
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException('La solicitud ya no está en estado PREPARACION');
      }

      return {
        idSolicitud: solicitud.idSolicitud,
        idProyecto: solicitud.idProyecto,
        idUsuario: solicitud.idUsuario,
        motivo: solicitud.motivo,
        solicitadaEn: solicitud.solicitadaEn,
        estadoSolicitud: EstadoSolicitudSalida.PENDIENTE_LIDER,
      };
      },
    );

    return resultado;
  }

  async cancelExitPreparation(idProyecto: number, actorUserId: number) {
    const resultado = await this.projectTx.run(
      idProyecto,
      actorUserId,
      'exit-requests.cancelPreparation',
      async (ctx) => {
      const { tx } = ctx;
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'SALIDA', actorUserId);
      const solicitud = await tx.solicitudSalidaProyecto.findFirst({
        where: {
          idProyecto,
          idUsuario: actorUserId,
          estadoSolicitud: EstadoSolicitudSalida.PREPARACION,
        },
        select: {
          idSolicitud: true,
          idProyecto: true,
          idUsuario: true,
          estadoSolicitud: true,
          solicitadaEn: true,
          motivo: true,
        },
      });

      if (!solicitud) {
        throw new BadRequestException('No existe una solicitud de salida en estado PREPARACION');
      }

      const updated = await tx.solicitudSalidaProyecto.updateMany({
        where: {
          idSolicitud: solicitud.idSolicitud,
          idProyecto,
          idUsuario: actorUserId,
          estadoSolicitud: EstadoSolicitudSalida.PREPARACION,
        },
        data: {
          estadoSolicitud: EstadoSolicitudSalida.CANCELADA,
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException('La solicitud ya no está en estado PREPARACION');
      }

      return {
        idSolicitud: solicitud.idSolicitud,
        idProyecto: solicitud.idProyecto,
        idUsuario: solicitud.idUsuario,
        motivo: solicitud.motivo,
        solicitadaEn: solicitud.solicitadaEn,
        estadoSolicitud: EstadoSolicitudSalida.CANCELADA,
      };
      },
    );

    return resultado;
  }

  async approveSolicitudSalida(idProyecto: number, idSolicitud: number, liderId: number) {
    // Pre-chequeo fuera del lock: rechaza de inmediato lo que ya se sabe
    // inválido (no eres líder; la solicitud no está PENDIENTE_LIDER). La
    // autoridad, sin embargo, es la transacción: dentro del lock se releen
    // liderazgo y tareas pendientes, y el CAS decide el ganador de una
    // resolución concurrente.
    await this.authorization.assertProjectLeader(idProyecto, liderId);
    await this.context.getPendingSolicitudSalidaOrThrow(idProyecto, idSolicitud);

    const ahora = new Date();
    return this.projectTx.run(idProyecto, liderId, 'exit-requests.approve', async (ctx) => {
      const { tx } = ctx;
      const proyecto = await this.authorization.assertProjectLeader(idProyecto, liderId, tx);
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'SALIDA', liderId);
      const solicitud = await tx.solicitudSalidaProyecto.findFirst({
        where: { idSolicitud, idProyecto },
      });
      if (!solicitud) {
        throw new NotFoundException(`Solicitud con id ${idSolicitud} no encontrada`);
      }

      const tareasPendientes = await tx.asignacionTarea.count({
        where: {
          idUsuario: solicitud.idUsuario,
          desasignadaEn: null,
          tarea: { idProyecto, eliminadoEn: null, estadoTarea: { not: 'HECHO' } },
        },
      });
      if (tareasPendientes > 0) {
        throw new BadRequestException(
          `No se puede aprobar la salida: el integrante tiene ${tareasPendientes} tarea(s) pendiente(s) que deben reasignarse antes de aprobar la salida`,
        );
      }

      const actualizada = {
        ...solicitud,
        estadoSolicitud: EstadoSolicitudSalida.APROBADA,
        resueltaEn: ahora,
        resueltaPor: liderId,
      };
      const resolved = await tx.solicitudSalidaProyecto.updateMany({
        where: {
          idSolicitud,
          idProyecto,
          estadoSolicitud: EstadoSolicitudSalida.PENDIENTE_LIDER,
        },
        data: { estadoSolicitud: EstadoSolicitudSalida.APROBADA, resueltaEn: ahora, resueltaPor: liderId },
      });
      if (resolved.count !== 1) {
        throw new ConflictException('La solicitud ya no está en estado PENDIENTE_LIDER');
      }
      if (!this.hoursRecognition || !this.sprintsContext) {
        throw new Error('HoursRecognitionService y SprintsContextService son requeridos para aprobar salidas');
      }

      const sprint = await this.sprintsContext.getCurrentSprint(idProyecto, tx);

      // §13: TODAS las participaciones activas del saliente en este proyecto,
      // en orden ascendente, releídas bajo el lock. Salir del proyecto es
      // salir de todos sus roles, no solo del que motivó la solicitud.
      const participacionesActivas = await tx.participacionProyecto.findMany({
        where: {
          idUsuario: solicitud.idUsuario,
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto },
        },
        select: { idParticipacion: true },
        orderBy: { idParticipacion: 'asc' },
      });

      /**
       * §13: tres ramas según el Sprint operable, y solo una reconoce horas.
       *
       *   ACTIVO           → reconocer SOLO los tramos elegibles de quien sale,
       *                      del Sprint actual, dejándolos PENDIENTE; después
       *                      retirar. Flow A omitirá después esos tramos.
       *   EN_FINALIZACION  → 409 sin escribir: una consolidación en curso no
       *                      admite que alguien se lleve tramos por debajo.
       *   Ninguno operable → retirar SIN reconocimiento nuevo. No se inventa
       *                      un Sprint ni una fila con idSprint NULL; lo que
       *                      quede pendiente pertenece a la conciliación §14.
       */
      const reconocidas: Array<{ idParticipacion: number; horasReportadas: string; horasPropuestas: string }> = [];
      if (sprint?.estado === EstadoSprint.ACTIVO) {
        const consolidadoEn = new Date();
        for (const participacion of participacionesActivas) {
          const resultado = await this.hoursRecognition.recognizeParticipationHours(tx, {
            projectId: idProyecto,
            sprintId: sprint.idSprint,
            participationId: participacion.idParticipacion,
            reconocidoEn: consolidadoEn,
          });
          if (resultado.horasParticipacion !== null) {
            reconocidas.push({
              idParticipacion: participacion.idParticipacion,
              horasReportadas: resultado.horasReportadas.toFixed(2),
              horasPropuestas: resultado.horasPropuestas.toFixed(2),
            });
          }
        }
      }
      // Sin Sprint operable NO se reconoce nada: no se fabrica un Sprint, no
      // se crea una fila con idSprint NULL y lo que quede pendiente queda para
      // la conciliación de §14. Salir entre Sprints no inventa historia.

      await tx.participacionProyecto.updateMany({
        where: {
          idUsuario: solicitud.idUsuario,
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto },
        },
        data: { estadoParticipacion: 'RETIRADO', fechaSalida: ahora },
      });

      await this.bitacoraEventos?.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.EXIT_REQUEST_APPROVED,
        idActor: liderId,
        idProyecto,
        idSprint: sprint?.idSprint ?? null,
        tipoEntidad: 'PROYECTO',
        idEntidad: idProyecto,
        valorAnterior: { estadoSolicitud: EstadoSolicitudSalida.PENDIENTE_LIDER },
        valorNuevo: {
          idSolicitud,
          idUsuario: solicitud.idUsuario,
          estadoSolicitud: EstadoSolicitudSalida.APROBADA,
          fechaSalida: ahora.toISOString(),
          participacionesRetiradas: participacionesActivas.map((fila) => fila.idParticipacion),
          // Reconocidas, NO acreditadas: quedan PENDIENTE hasta el cierre.
          reconocidas,
        },
      });

      await this.notifications.notifyFromTemplate(
        [solicitud.idUsuario],
        'PARTICIPACION_ACTUALIZADA',
        { projectTitle: proyecto.tituloProyecto, projectId: idProyecto, approved: true },
        tx,
      );
      return actualizada;
    });
  }

  async rejectSolicitudSalida(idProyecto: number, idSolicitud: number, liderId: number) {
    // Mismo criterio que la aprobación: pre-chequeo fuera, CAS bajo el lock.
    await this.authorization.assertProjectLeader(idProyecto, liderId);
    await this.context.getPendingSolicitudSalidaOrThrow(idProyecto, idSolicitud);

    return this.projectTx.run(idProyecto, liderId, 'exit-requests.reject', async (ctx) => {
      const { tx } = ctx;
      const proyecto = await this.authorization.assertProjectLeader(idProyecto, liderId, tx);
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'SALIDA', liderId);
      const solicitud = await tx.solicitudSalidaProyecto.findFirst({
        where: { idSolicitud, idProyecto },
      });
      if (!solicitud) {
        throw new NotFoundException(`Solicitud con id ${idSolicitud} no encontrada`);
      }
      const ahora = new Date();
      const actualizada = {
        ...solicitud,
        estadoSolicitud: EstadoSolicitudSalida.RECHAZADA,
        resueltaEn: ahora,
        resueltaPor: liderId,
      };
      const resolved = await tx.solicitudSalidaProyecto.updateMany({
        where: {
          idSolicitud: solicitud.idSolicitud,
          idProyecto,
          estadoSolicitud: EstadoSolicitudSalida.PENDIENTE_LIDER,
        },
        data: { estadoSolicitud: EstadoSolicitudSalida.RECHAZADA, resueltaEn: ahora, resueltaPor: liderId },
      });
      if (resolved.count !== 1) {
        throw new ConflictException('La solicitud ya no está en estado PENDIENTE_LIDER');
      }
      await this.notifications.notifyFromTemplate(
        [solicitud.idUsuario],
        'PARTICIPACION_ACTUALIZADA',
        { projectTitle: proyecto.tituloProyecto, projectId: idProyecto, approved: false },
        tx,
      );
      return actualizada;
    });
  }

  private isPendingExitRequestCollision(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }
    if (error.code !== 'P2002') {
      return false;
    }

    const modelName = error.meta?.modelName;
    const target = error.meta?.target;

    return (
      modelName === 'SolicitudSalidaProyecto' &&
      Array.isArray(target) &&
      target.length === 2 &&
      target.includes('id_proyecto') &&
      target.includes('id_usuario')
    );
  }
}
