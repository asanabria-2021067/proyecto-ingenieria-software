import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoProyecto, Prisma, TipoNotificacion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ProjectTransactionService,
  type ProjectLockRow,
  type ProjectTransactionContext,
} from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import { CreateMensajeRevisionDto } from './dto/create-mensaje-revision.dto';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * C038 (06 v2 §32/§34): el contenido del canal B (mensaje de revisión) se
 * escribe dentro de `ProjectTransactionService.run` con la familia
 * `MENSAJE_REVISION` (R/O/P/E; S/C bloqueado); el lector pasa por la política
 * de lectura histórica antes de la autorización existente; el acuse personal
 * (`markAsRead`) es una escritura por usuario, repetible, sin lock de proyecto
 * ni cambio de dominio o Sprint. La notificación `MENSAJE_REVISION` se
 * conserva y se emite después del commit. El comentario propio del cierre es
 * otro canal y no se toca aquí.
 */
@Injectable()
export class MensajesRevisionService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly readPolicy: ProjectReadPolicyService,
  ) {}

  async findByProyecto(idProyecto: number, userId: number) {
    const proyecto = await this.getProjectAccessContext(idProyecto);
    // C038 (§34): política de lectura histórica antes de la autorización del canal.
    await this.readPolicy.assertRead(undefined, { projectId: idProyecto, actorId: userId, scope: 'resumen' });
    await this.assertChannelBAccess(proyecto, userId, false);

    return this.prisma.mensajeRevisionProyecto.findMany({
      where: { idProyecto },
      include: {
        remitente: { select: { idUsuario: true, nombre: true, apellido: true } },
      },
      orderBy: { enviadoEn: 'asc' },
    });
  }

  async create(idProyecto: number, userId: number, dto: CreateMensajeRevisionDto) {
    const { proyecto, mensaje } = await this.projectTx.run(
      idProyecto,
      userId,
      'mensajes-revision.create',
      async (ctx) => {
        const { tx } = ctx;
        const proyecto = await this.getProjectAccessContext(idProyecto, tx);
        await this.assertChannelBAccess(proyecto, userId, true);
        await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'MENSAJE_REVISION', userId);

        if (dto.idRevision) {
          const revision = await tx.revisionProyecto.findFirst({
            where: { idRevisionProyecto: dto.idRevision, idProyecto },
            select: { idRevisionProyecto: true },
          });
          if (!revision) {
            throw new BadRequestException('La revisión indicada no pertenece al proyecto');
          }
        }

        const mensaje = await tx.mensajeRevisionProyecto.create({
          data: {
            idProyecto,
            idRemitente: userId,
            idRevision: dto.idRevision,
            contenido: dto.contenido.trim(),
          },
        });
        return { proyecto, mensaje };
      },
    );

    // Notificación existente, emitida después del commit del `run`.
    const admins = await this.prisma.usuarioRolAcceso.findMany({
      where: { rolAcceso: { nombrePerfil: 'administrador' } },
      distinct: ['idUsuario'],
      select: { idUsuario: true },
    });
    const recipients = Array.from(
      new Set([proyecto.creadoPor, ...admins.map((a) => a.idUsuario)]),
    ).filter((id) => id !== userId);

    await this.notifications.notifyUsers(recipients, {
      tipoNotificacion: TipoNotificacion.MENSAJE_REVISION,
      tituloNotificacion: 'Nuevo mensaje de revisión',
      mensajeNotificacion: `Hay un nuevo mensaje en el canal de revisión de "${proyecto.tituloProyecto}".`,
      datosJson: { idProyecto, idMensaje: mensaje.idMensaje },
    });

    return mensaje;
  }

  /**
   * Acuse personal (06 v2 §32 «Acuse personal de mensaje»): escritura por
   * usuario, repetible, que no cambia dominio ni Sprint; por eso NO adquiere
   * el lock de proyecto ni bloquea a otros actores (C038).
   */
  async markAsRead(idProyecto: number, userId: number) {
    const proyecto = await this.getProjectAccessContext(idProyecto);
    await this.assertChannelBAccess(proyecto, userId, false);

    await this.prisma.mensajeRevisionProyecto.updateMany({
      where: {
        idProyecto,
        idRemitente: { not: userId },
        leidoEn: null,
      },
      data: { leidoEn: new Date() },
    });

    return { ok: true };
  }

  private lockedProject(ctx: Pick<ProjectTransactionContext, 'project'>): ProjectLockRow {
    if (!ctx.project) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return ctx.project;
  }

  private async getProjectAccessContext(idProyecto: number, db: Db = this.prisma) {
    const proyecto = await db.proyecto.findUnique({
      where: { idProyecto },
      select: {
        idProyecto: true,
        creadoPor: true,
        tituloProyecto: true,
        estadoProyecto: true,
      },
    });
    if (!proyecto) throw new NotFoundException('Proyecto no encontrado');
    return proyecto;
  }

  private async assertChannelBAccess(
    proyecto: {
      idProyecto: number;
      creadoPor: number;
      estadoProyecto: EstadoProyecto;
    },
    userId: number,
    forWrite: boolean,
  ) {
    const isAdmin = await this.notifications.isAdmin(userId);
    const isLeader = proyecto.creadoPor === userId;
    if (!isAdmin && !isLeader) {
      throw new ForbiddenException('Solo líder o administradores pueden acceder a este canal');
    }

    if (proyecto.estadoProyecto === EstadoProyecto.BORRADOR) {
      throw new ForbiddenException('El canal de revisión aún no está habilitado');
    }

    if (
      forWrite &&
      (proyecto.estadoProyecto === EstadoProyecto.CERRADO ||
        proyecto.estadoProyecto === EstadoProyecto.CANCELADO)
    ) {
      throw new ForbiddenException('El canal está en modo solo lectura');
    }
  }
}
