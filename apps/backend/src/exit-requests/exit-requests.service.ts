import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { EstadoSolicitudSalida, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ExitRequestsAuthorizationService } from './exit-requests.authorization.service';
import { ExitRequestsContextService } from './exit-requests.context.service';

@Injectable()
export class ExitRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly authorization: ExitRequestsAuthorizationService,
    private readonly context: ExitRequestsContextService,
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
      const actualizada = await tx.solicitudSalidaProyecto.update({
        where: { idSolicitud },
        data: { estadoSolicitud: 'APROBADA', resueltaEn: ahora, resueltaPor: liderId },
      });
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
      const actualizada = await tx.solicitudSalidaProyecto.update({
        where: { idSolicitud: solicitud.idSolicitud },
        data: { estadoSolicitud: 'RECHAZADA', resueltaEn: new Date(), resueltaPor: liderId },
      });
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
