import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Datos públicos de una persona en la lista de calendarios compartidos. */
const USUARIO_RESUMEN = {
  idUsuario: true,
  nombre: true,
  apellido: true,
  correo: true,
  fotoUrl: true,
} as const;

/**
 * HU-184: compartir el calendario propio (eventos de mis proyectos y fechas
 * límite de mis tareas) en solo lectura. No requiere aceptación: existir la
 * fila es estar compartido. Quien recibe ve exactamente lo que el
 * propietario ve en su calendario (mismo filtro de EventsService) y nunca
 * puede editar.
 */
@Injectable()
export class CalendarSharesService {
  private readonly logger = new Logger(CalendarSharesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** GET /usuarios/me/calendario/compartidos */
  async listar(userId: number) {
    const [porMi, conmigo] = await Promise.all([
      this.prisma.calendarioCompartido.findMany({
        where: { idPropietario: userId, invitado: { estado: 'ACTIVO' } },
        select: { invitado: { select: USUARIO_RESUMEN } },
        orderBy: { creadoEn: 'asc' },
      }),
      this.prisma.calendarioCompartido.findMany({
        where: { idInvitado: userId, propietario: { estado: 'ACTIVO' } },
        select: { propietario: { select: USUARIO_RESUMEN } },
        orderBy: { creadoEn: 'asc' },
      }),
    ]);
    return {
      compartidoPorMi: porMi.map((fila) => fila.invitado),
      compartidosConmigo: conmigo.map((fila) => fila.propietario),
    };
  }

  /** POST /usuarios/me/calendario/compartidos — idempotente: compartir dos veces no duplica ni vuelve a notificar. */
  async compartir(userId: number, idInvitado: number) {
    if (idInvitado === userId) {
      throw new BadRequestException('No puedes compartir el calendario contigo mismo');
    }
    const invitado = await this.prisma.usuario.findFirst({
      where: { idUsuario: idInvitado, estado: 'ACTIVO' },
      select: USUARIO_RESUMEN,
    });
    if (!invitado) {
      throw new NotFoundException('Usuario no encontrado');
    }

    try {
      await this.prisma.calendarioCompartido.create({ data: { idPropietario: userId, idInvitado } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return invitado; // ya estaba compartido
      }
      throw error;
    }

    await this.notificarCompartido(userId, idInvitado);
    return invitado;
  }

  /** DELETE /usuarios/me/calendario/compartidos/:idUsuario */
  async dejarDeCompartir(userId: number, idInvitado: number) {
    const { count } = await this.prisma.calendarioCompartido.deleteMany({
      where: { idPropietario: userId, idInvitado },
    });
    return { eliminado: count > 0 };
  }

  /** GET /usuarios/me/calendario/compartidos-conmigo/:idPropietario/agenda?desde&hasta */
  async agendaCompartida(userId: number, idPropietario: number, desde: string, hasta: string) {
    const compartido = await this.prisma.calendarioCompartido.findFirst({
      where: { idPropietario, idInvitado: userId, propietario: { estado: 'ACTIVO' } },
      select: { idCalendarioCompartido: true },
    });
    if (!compartido) {
      throw new ForbiddenException('Este calendario no está compartido contigo');
    }

    const [eventos, tareas] = await Promise.all([
      this.events.findForUserInRange(idPropietario, desde, hasta),
      this.prisma.tarea.findMany({
        where: {
          eliminadoEn: null,
          estadoTarea: { not: 'HECHO' },
          // fechaLimite es @db.Date (medianoche UTC): se compara por día, no por instante.
          fechaLimite: { gte: new Date(desde.slice(0, 10)), lte: new Date(hasta.slice(0, 10)) },
          asignaciones: { some: { idUsuario: idPropietario } },
          proyecto: { eliminadoEn: null },
        },
        select: {
          idTarea: true,
          tituloTarea: true,
          estadoTarea: true,
          prioridad: true,
          fechaLimite: true,
          proyecto: { select: { idProyecto: true, tituloProyecto: true } },
        },
        orderBy: { fechaLimite: 'asc' },
      }),
    ]);
    return { eventos, tareas };
  }

  /** La notificación es un efecto secundario: si falla, compartir ya quedó hecho. */
  private async notificarCompartido(userId: number, idInvitado: number): Promise<void> {
    try {
      const propietario = await this.prisma.usuario.findUnique({
        where: { idUsuario: userId },
        select: { nombre: true, apellido: true },
      });
      const ownerName = propietario ? `${propietario.nombre} ${propietario.apellido}` : 'Alguien';
      await this.notifications.notifyFromTemplate([idInvitado], 'CALENDARIO_COMPARTIDO', { ownerId: userId, ownerName });
    } catch (error) {
      this.logger.warn(
        `No se pudo notificar el calendario compartido a ${idInvitado}: ${(error as Error)?.message ?? error}`,
      );
    }
  }
}
