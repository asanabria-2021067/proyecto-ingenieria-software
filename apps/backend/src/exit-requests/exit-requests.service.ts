import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { EstadoSolicitudSalida, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { HoursRecognitionService } from '../sprints/hours-recognition.service';
import { SprintsContextService } from '../sprints/sprints-context.service';
import { ExitRequestsAuthorizationService } from './exit-requests.authorization.service';
import { ExitRequestsContextService } from './exit-requests.context.service';

@Injectable()
export class ExitRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly authorization: ExitRequestsAuthorizationService,
    private readonly context: ExitRequestsContextService,
    private readonly hoursRecognition?: HoursRecognitionService,
    private readonly sprintsContext?: SprintsContextService,
  ) {}

  async createSolicitudSalida(idProyecto: number, idUsuario: number, motivo: string) {
    await this.authorization.assertCanCreateSolicitudSalida(idProyecto, idUsuario);

    const motivoLimpio = motivo.trim();
    if (motivoLimpio.length === 0) {
      throw new BadRequestException('motivo no puede estar vacío');
    }

    const solicitudAbierta = await this.prisma.solicitudSalidaProyecto.findFirst({
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
      return await this.prisma.solicitudSalidaProyecto.create({
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
  }

  async getExitPreparationSummary(idProyecto: number, actorUserId: number) {
    await this.context.getProjectOrThrow(idProyecto);

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
    const resultado = await this.prisma.$transaction(async (tx) => {
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
    });

    return resultado;
  }

  async cancelExitPreparation(idProyecto: number, actorUserId: number) {
    const resultado = await this.prisma.$transaction(async (tx) => {
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
    });

    return resultado;
  }

  async approveSolicitudSalida(idProyecto: number, idSolicitud: number, liderId: number) {
    const proyecto = await this.authorization.assertProjectLeader(idProyecto, liderId);
    const solicitud = await this.context.getPendingSolicitudSalidaOrThrow(idProyecto, idSolicitud);

    const tareasPendientes = await this.prisma.asignacionTarea.count({
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

    const ahora = new Date();
    return this.prisma.$transaction(async (tx) => {
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
      if (!sprint) {
        throw new ConflictException('No hay un Sprint activo en este proyecto');
      }

      const participacionesActivas = await tx.participacionProyecto.findMany({
        where: {
          idUsuario: solicitud.idUsuario,
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto },
        },
        select: { idParticipacion: true },
        orderBy: { idParticipacion: 'asc' },
      });

      for (const participacion of participacionesActivas) {
        await this.hoursRecognition.recognizeParticipationHours(tx, {
          projectId: idProyecto,
          sprintId: sprint.idSprint,
          participationId: participacion.idParticipacion,
        });
      }

      await tx.participacionProyecto.updateMany({
        where: {
          idUsuario: solicitud.idUsuario,
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto },
        },
        data: { estadoParticipacion: 'RETIRADO', fechaSalida: ahora },
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
    const proyecto = await this.authorization.assertProjectLeader(idProyecto, liderId);
    const solicitud = await this.context.getPendingSolicitudSalidaOrThrow(idProyecto, idSolicitud);

    return this.prisma.$transaction(async (tx) => {
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
