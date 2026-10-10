import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type EstadoTarea, type Prioridad } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService, type EventoCompartido } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * G01 (UI-16, B-04): tras DELETE+POST no se vuelve a avisar a la misma persona
 * del mismo propietario dentro de esta ventana. La evidencia es la propia
 * tabla de notificaciones (persistida), no memoria del proceso.
 */
const VENTANA_RENOTIFICACION_MS = 24 * 60 * 60 * 1000;

/** Datos públicos de una persona en la lista de calendarios compartidos (sin correo). */
const USUARIO_RESUMEN = {
  idUsuario: true,
  nombre: true,
  apellido: true,
  fotoUrl: true,
} as const;

/**
 * G01 (UI-19): el correo solo se devuelve en "con quién compartí" (la
 * persona que yo elegí y que la UI muestra bajo su nombre); nunca el del
 * propietario que me compartió ni en la respuesta de compartir.
 */
const INVITADO_RESUMEN = { ...USUARIO_RESUMEN, correo: true } as const;

/** G01 (UI-01): única `select` de una tarea vista desde un calendario compartido. */
const TAREA_SHARED_SELECT = {
  idTarea: true,
  tituloTarea: true,
  estadoTarea: true,
  prioridad: true,
  fechaLimite: true,
  proyecto: { select: { idProyecto: true, tituloProyecto: true } },
} as const satisfies Prisma.TareaSelect;

type TareaCompartidaFila = Prisma.TareaGetPayload<{ select: typeof TAREA_SHARED_SELECT }>;

/** Contrato de una fecha límite en la agenda compartida (misma política que EventoCompartido). */
export type TareaCompartida =
  | {
      idTarea: number;
      fechaLimite: Date;
      visibilidad: 'DETALLE';
      tituloTarea: string;
      estadoTarea: EstadoTarea;
      prioridad: Prioridad;
      proyecto: { idProyecto: number; tituloProyecto: string };
    }
  | { idTarea: number; fechaLimite: Date; visibilidad: 'OCUPADO' };

/** Allowlist campo por campo: nunca se copia la fila por spread. */
export function proyectarTareaCompartida(fila: TareaCompartidaFila, puedeVerDetalle: boolean): TareaCompartida {
  // fechaLimite es obligatoria en la consulta (filtro gte/lte): nunca llega null.
  const base = { idTarea: fila.idTarea, fechaLimite: fila.fechaLimite as Date };
  if (!puedeVerDetalle) {
    return { ...base, visibilidad: 'OCUPADO' };
  }
  return {
    ...base,
    visibilidad: 'DETALLE',
    tituloTarea: fila.tituloTarea,
    estadoTarea: fila.estadoTarea,
    prioridad: fila.prioridad,
    proyecto: { idProyecto: fila.proyecto.idProyecto, tituloProyecto: fila.proyecto.tituloProyecto },
  };
}

/**
 * HU-184: compartir el calendario propio (eventos de mis proyectos y fechas
 * límite de mis tareas) en solo lectura. No requiere aceptación: existir la
 * fila es estar compartido. G01 (UI-01): quien recibe NO ve lo mismo que el
 * propietario: la agenda se calcula con sus propios permisos
 * (`EventsService.findSharedInRange`, `tareasCompartidas`) y con una
 * proyección mínima; nunca puede editar.
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
        select: { invitado: { select: INVITADO_RESUMEN } },
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

  /**
   * POST /usuarios/me/calendario/compartidos — idempotente: compartir dos veces no duplica ni vuelve a notificar.
   *
   * G04 (UI-20, B-11): política de destinatarios vigente: cualquier usuario
   * con estado ACTIVO que no sea uno mismo (INACTIVO, BLOQUEADO o inexistente
   * responden el mismo 404, sin revelar cuál es el caso). El buscador del
   * diálogo no ofrece administradores, pero este endpoint no los excluye:
   * hacerlo es una decisión de producto que no está aprobada (pendiente de
   * Angel/PO), así que no se añade por inferencia.
   */
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

  /**
   * DELETE /usuarios/me/calendario/compartidos-conmigo/:idPropietario
   * G01 (UI-31): quien recibe un calendario puede quitárselo. El actor sale
   * del token y solo se borra SU fila con ese propietario: nunca toca
   * comparticiones de terceros. Idempotente, como dejarDeCompartir.
   */
  async dejarDeRecibir(userId: number, idPropietario: number) {
    const { count } = await this.prisma.calendarioCompartido.deleteMany({
      where: { idPropietario, idInvitado: userId },
    });
    return { eliminado: count > 0 };
  }

  /**
   * GET /usuarios/me/calendario/compartidos-conmigo/:idPropietario/agenda?desde&hasta
   * Solo con una fila vigente (propietario, yo): revocar la compartición hace
   * que la siguiente petición reciba 403. Ambos ids salen del token y de la
   * ruta; la respuesta son los contratos discriminados (DETALLE | OCUPADO).
   */
  async agendaCompartida(
    userId: number,
    idPropietario: number,
    desde: string,
    hasta: string,
  ): Promise<{ eventos: EventoCompartido[]; tareas: TareaCompartida[] }> {
    const compartido = await this.prisma.calendarioCompartido.findFirst({
      where: { idPropietario, idInvitado: userId, propietario: { estado: 'ACTIVO' } },
      select: { idCalendarioCompartido: true },
    });
    if (!compartido) {
      throw new ForbiddenException('Este calendario no está compartido contigo');
    }

    const [eventos, tareas] = await Promise.all([
      this.events.findSharedInRange(idPropietario, userId, desde, hasta),
      this.tareasCompartidas(idPropietario, userId, desde, hasta),
    ]);
    return { eventos, tareas };
  }

  /**
   * G01 (UI-01, B-02): fechas límite del propietario solo en proyectos donde
   * hoy es líder o participante ACTIVO (una asignación vieja no da acceso), y
   * con la misma política que los eventos: detalle solo si quien mira tiene
   * acceso propio al proyecto; si no, OCUPADO sin título ni proyecto.
   */
  private async tareasCompartidas(
    idPropietario: number,
    idReceptor: number,
    desde: string,
    hasta: string,
  ): Promise<TareaCompartida[]> {
    const [idsPropietario, idsReceptor] = await Promise.all([
      this.events.projectIdsForUser(idPropietario),
      this.events.projectIdsForUser(idReceptor),
    ]);
    if (idsPropietario.length === 0) return [];

    const filas = await this.prisma.tarea.findMany({
      where: {
        eliminadoEn: null,
        estadoTarea: { not: 'HECHO' },
        // fechaLimite es @db.Date (medianoche UTC): se compara por día, no por instante.
        fechaLimite: { gte: new Date(desde.slice(0, 10)), lte: new Date(hasta.slice(0, 10)) },
        asignaciones: { some: { idUsuario: idPropietario } },
        proyecto: { eliminadoEn: null, idProyecto: { in: idsPropietario } },
      },
      select: TAREA_SHARED_SELECT,
      orderBy: { fechaLimite: 'asc' },
    });
    const comunes = new Set(idsReceptor);
    return filas.map((fila) => proyectarTareaCompartida(fila, comunes.has(fila.proyecto.idProyecto)));
  }

  /** La notificación es un efecto secundario: si falla, compartir ya quedó hecho. */
  private async notificarCompartido(userId: number, idInvitado: number): Promise<void> {
    try {
      const reciente = await this.prisma.notificacion.findFirst({
        where: {
          idUsuario: idInvitado,
          tipoNotificacion: 'CALENDARIO_COMPARTIDO',
          creadaEn: { gte: new Date(Date.now() - VENTANA_RENOTIFICACION_MS) },
          datosJson: { path: ['ownerId'], equals: userId },
        },
        select: { idNotificacion: true },
      });
      if (reciente) return; // ya avisado hace menos de 24 h: compartir sigue siendo válido, solo no se repite el aviso
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
