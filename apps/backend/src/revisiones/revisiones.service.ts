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
import {
  ProjectTransactionService,
  type ProjectLockRow,
  type ProjectTransactionContext,
} from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';

/**
 * C039 (06 v2 §24/§32/§39): reclamar y resolver la revisión de publicación
 * corren dentro de `ProjectTransactionService.run` con la familia
 * `PUBLICACION_REVISION` (admin, proyecto en R), cuyo actor `ADMIN` ejecuta
 * `assertAdminTx` dentro de la transacción; el lector del proyecto pasa por la
 * política de lectura histórica. `RevisionProyecto` sigue siendo una entidad
 * separada de la revisión de cierre: este módulo no depende del cierre en
 * ninguna dirección. `findAdminInbox` no cambia aquí.
 */
@Injectable()
export class RevisionesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly readPolicy: ProjectReadPolicyService,
  ) {}
  async findAdminInbox(adminId: number) {
    await this._requireAdmin(adminId);

    const [revisionesPendientes, cierresPendientes, correccionesEnviadas] = await Promise.all([
      this.prisma.revisionProyecto.findMany({
        where: { estadoRevision: 'PENDIENTE', proyecto: { estadoProyecto: EstadoProyecto.EN_REVISION } },
        select: {
          idRevisionProyecto: true,
          idProyecto: true,
          numeroEnvio: true,
          enviadaEn: true,
          idRevisor: true,
          proyecto: {
            select: {
              tituloProyecto: true,
              creadoPor: true,
              creador: { select: { nombre: true, apellido: true } },
            },
          },
        },
        orderBy: { enviadaEn: 'desc' },
      }),
      this.prisma.proyecto.findMany({
        where: { estadoProyecto: EstadoProyecto.EN_SOLICITUD_CIERRE },
        select: {
          idProyecto: true,
          tituloProyecto: true,
          creadoPor: true,
          fechaActualizacion: true,
        },
        orderBy: { fechaActualizacion: 'desc' },
      }),
      this.prisma.proyecto.findMany({
        where: { estadoProyecto: EstadoProyecto.OBSERVADO, eliminadoEn: null },
        select: {
          idProyecto: true,
          tituloProyecto: true,
          creador: { select: { nombre: true, apellido: true } },
          revisiones: {
            where: { estadoRevision: 'OBSERVADA' },
            select: {
              idRevisionProyecto: true,
              numeroEnvio: true,
              revisadaEn: true,
            },
            orderBy: { enviadaEn: 'desc' as const },
            take: 1,
          },
        },
        orderBy: { fechaActualizacion: 'desc' },
      }),
    ]);

    return { revisionesPendientes, cierresPendientes, correccionesEnviadas };
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

    // C039 (§34): política de lectura histórica antes de la autorización existente.
    await this.readPolicy.assertRead(undefined, { projectId: idProyecto, actorId: userId, scope: 'resumen' });

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
        snapshotProyecto: true,
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

  /**
   * Reclamar la revisión pendiente (E042). C039: bajo el lock del proyecto;
   * `PUBLICACION_REVISION` exige proyecto en R y actor admin (`assertAdminTx`
   * dentro de la tx). La lectura de la revisión y su CAS (`idRevisor` null →
   * admin) ocurren en la misma transacción.
   */
  async reclamar(idProyecto: number, adminId: number) {
    return this.projectTx.run(idProyecto, adminId, 'revisiones.reclamar', async (ctx) => {
      const { tx } = ctx;
      await this._requireAdmin(adminId);
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'PUBLICACION_REVISION', adminId);

      const proyecto = await tx.proyecto.findUnique({
        where: { idProyecto },
        select: { estadoProyecto: true },
      });
      if (!proyecto) {
        throw new NotFoundException(`Proyecto con id ${idProyecto} no encontrado`);
      }
      if (proyecto.estadoProyecto !== EstadoProyecto.EN_REVISION) {
        throw new BadRequestException('Solo se puede reclamar revisión en estado EN_REVISION');
      }

      const revision = await tx.revisionProyecto.findFirst({
        where: { idProyecto, estadoRevision: 'PENDIENTE' },
        select: { idRevisionProyecto: true, idRevisor: true },
      });

      if (!revision) {
        throw new NotFoundException('No hay revisión pendiente para este proyecto');
      }

      if (revision.idRevisor !== null) {
        const revisorActual = await tx.usuario.findUnique({
          where: { idUsuario: revision.idRevisor },
          select: { nombre: true, apellido: true },
        });
        throw new BadRequestException(
          `Esta revisión ya fue reclamada por ${revisorActual?.nombre ?? 'otro admin'}`,
        );
      }

      return tx.revisionProyecto.update({
        where: { idRevisionProyecto: revision.idRevisionProyecto },
        data: { idRevisor: adminId },
        select: {
          idRevisionProyecto: true,
          estadoRevision: true,
          idRevisor: true,
          numeroEnvio: true,
        },
      });
    });
  }

  /**
   * Resolver la revisión pendiente (E043). C039: toda la transición (revisión,
   * estado del proyecto y notificación en tx) corre bajo el lock del proyecto
   * en la transacción del `run`; el admin se verifica dentro de la tx.
   */
  async resolver(idProyecto: number, adminId: number, dto: ResolverRevisionDto) {
    return this.projectTx.run(idProyecto, adminId, 'revisiones.resolver', async (ctx) => {
      const { tx } = ctx;
      await this._requireAdmin(adminId);
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'PUBLICACION_REVISION', adminId);

      const revision = await tx.revisionProyecto.findFirst({
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
        await tx.revisionProyecto.update({
          where: { idRevisionProyecto: revision.idRevisionProyecto },
          data: { idRevisor: adminId },
        });
      }

      const ahora = new Date();

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

  private lockedProject(ctx: Pick<ProjectTransactionContext, 'project'>): ProjectLockRow {
    if (!ctx.project) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return ctx.project;
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
