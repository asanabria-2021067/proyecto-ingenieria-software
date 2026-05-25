import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EstadoProyecto } from '@prisma/client';
import { ResolverRevisionDto } from './dto/resolver-revision.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class RevisionesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}
  async findAdminInbox(adminId: number) {
    await this._requireAdmin(adminId);

    const [revisionesPendientes, cierresPendientes] = await Promise.all([
      this.prisma.revisionProyecto.findMany({
        where: { estadoRevision: 'PENDIENTE', proyecto: { estadoProyecto: EstadoProyecto.EN_REVISION } },
        select: {
          idRevisionProyecto: true,
          idProyecto: true,
          numeroEnvio: true,
          enviadaEn: true,
          idRevisor: true,
          proyecto: { select: { tituloProyecto: true, creadoPor: true } },
        },
        orderBy: { enviadaEn: 'asc' },
      }),
      this.prisma.proyecto.findMany({
        where: { estadoProyecto: EstadoProyecto.EN_SOLICITUD_CIERRE },
        select: {
          idProyecto: true,
          tituloProyecto: true,
          creadoPor: true,
          fechaActualizacion: true,
        },
        orderBy: { fechaActualizacion: 'asc' },
      }),
    ]);

    return { revisionesPendientes, cierresPendientes };
  }

  async findByProyecto(idProyecto: number, userId: number) {
    // Verificar que el proyecto existe
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto, eliminadoEn: null },
      select: { idProyecto: true, creadoPor: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${idProyecto} no encontrado`);
    }

    const esAdmin = await this._esAdmin(userId);
    if (!esAdmin && proyecto.creadoPor !== userId) {
      throw new ForbiddenException('No tienes permiso para ver las revisiones de este proyecto');
    }

    return this.prisma.revisionProyecto.findMany({
      where: { idProyecto },
      select: {
        idRevisionProyecto: true,
        estadoRevision: true,
        comentarioRevision: true,
        numeroEnvio: true,
        enviadaEn: true,
        revisadaEn: true,
        revisor: {
          select: { idUsuario: true, nombre: true, apellido: true },
        },
      },
      orderBy: { enviadaEn: 'asc' },
    });
  }

  async reclamar(idProyecto: number, adminId: number) {
    await this._requireAdmin(adminId);

    const proyecto = await this.prisma.proyecto.findUnique({
      where: { idProyecto },
      select: { estadoProyecto: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${idProyecto} no encontrado`);
    }
    if (proyecto.estadoProyecto !== EstadoProyecto.EN_REVISION) {
      throw new BadRequestException('Solo se puede reclamar revisión en estado EN_REVISION');
    }

    const revision = await this.prisma.revisionProyecto.findFirst({
      where: { idProyecto, estadoRevision: 'PENDIENTE' },
      select: { idRevisionProyecto: true, idRevisor: true },
    });

    if (!revision) {
      throw new NotFoundException('No hay revisión pendiente para este proyecto');
    }

    if (revision.idRevisor !== null) {
      const revisorActual = await this.prisma.usuario.findUnique({
        where: { idUsuario: revision.idRevisor },
        select: { nombre: true, apellido: true },
      });
      throw new BadRequestException(
        `Esta revisión ya fue reclamada por ${revisorActual?.nombre ?? 'otro admin'}`,
      );
    }

    return this.prisma.revisionProyecto.update({
      where: { idRevisionProyecto: revision.idRevisionProyecto },
      data: { idRevisor: adminId },
      select: {
        idRevisionProyecto: true,
        estadoRevision: true,
        idRevisor: true,
        numeroEnvio: true,
      },
    });
  }

  async resolver(idProyecto: number, adminId: number, dto: ResolverRevisionDto) {
    await this._requireAdmin(adminId);

    const revision = await this.prisma.revisionProyecto.findFirst({
      where: { idProyecto, estadoRevision: 'PENDIENTE' },
      select: { idRevisionProyecto: true, idRevisor: true },
    });

    if (!revision) {
      throw new NotFoundException('No hay revisión pendiente para este proyecto');
    }

    // Si otro admin ya reclamó esta revisión, bloquear
    if (revision.idRevisor !== null && revision.idRevisor !== adminId) {
      throw new ForbiddenException(
        'Esta revisión ya fue reclamada por otro administrador',
      );
    }

    // Auto-asignar al admin si aún no fue reclamada
    if (revision.idRevisor === null) {
      await this.prisma.revisionProyecto.update({
        where: { idRevisionProyecto: revision.idRevisionProyecto },
        data: { idRevisor: adminId },
      });
    }

    const ahora = new Date();

    return this.prisma.$transaction(async (tx) => {
      const revisionActualizada = await tx.revisionProyecto.update({
        where: { idRevisionProyecto: revision.idRevisionProyecto },
        data: {
          estadoRevision: dto.resultado,
          comentarioRevision: dto.comentario ?? null,
          revisadaEn: ahora,
        },
        select: {
          idRevisionProyecto: true,
          estadoRevision: true,
          comentarioRevision: true,
          numeroEnvio: true,
          revisadaEn: true,
        },
      });

      const nuevoEstadoProyecto =
        dto.resultado === 'APROBADA'
          ? EstadoProyecto.PUBLICADO
          : EstadoProyecto.OBSERVADO;

      await tx.proyecto.update({
        where: { idProyecto },
        data: {
          estadoProyecto: nuevoEstadoProyecto,
          fechaActualizacion: ahora,
          ...(dto.resultado === 'APROBADA' ? { fechaPublicacion: ahora } : {}),
        },
      });

      const proyecto = await tx.proyecto.findUnique({
        where: { idProyecto },
        select: { creadoPor: true, tituloProyecto: true },
      });

      if (proyecto) {
        if (dto.resultado === 'APROBADA') {
          await this.notifications.notifyFromTemplate(
            [proyecto.creadoPor],
            'PROYECTO_APROBADO',
            {
              projectTitle: proyecto.tituloProyecto,
              projectId: idProyecto,
              revisionId: revision.idRevisionProyecto,
            },
            tx,
          );
        } else {
          await this.notifications.notifyFromTemplate(
            [proyecto.creadoPor],
            'PROYECTO_OBSERVADO',
            {
              projectTitle: proyecto.tituloProyecto,
              projectId: idProyecto,
              revisionId: revision.idRevisionProyecto,
              comment: dto.comentario ?? null,
            },
            tx,
          );
        }
      }

      return {
        revision: revisionActualizada,
        estadoProyecto: nuevoEstadoProyecto,
      };
    });
  }

  private async _esAdmin(userId: number): Promise<boolean> {
    return this.notifications.isAdmin(userId);
  }

  private async _requireAdmin(userId: number): Promise<void> {
    const esAdmin = await this._esAdmin(userId);
    if (!esAdmin) {
      throw new ForbiddenException('Se requieren permisos de administrador');
    }
  }
}
