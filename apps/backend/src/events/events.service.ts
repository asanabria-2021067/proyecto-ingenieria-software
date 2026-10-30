import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoProyecto, Prisma, type ModalidadEvento, type TipoEvento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

/**
 * Contrato público (HU-169/T-263): nunca expone idCreador, recordatorioEnviadoEn
 * ni otros campos internos de agenda del recordatorio.
 */
const EVENT_SELECT = {
  idEvento: true,
  idProyecto: true,
  tituloEvento: true,
  descripcionEvento: true,
  fechaInicio: true,
  fechaFin: true,
  antelacionMinutos: true,
  modalidad: true,
  ubicacionLat: true,
  ubicacionLng: true,
  ubicacionNombre: true,
  linkSesion: true,
  rolesDestino: true,
  tipoEvento: true,
  invitados: true,
  // HU-195: null = evento del proyecto; con valor, reunión de Administración (ver `origen`).
  idReunion: true,
} as const;

export type OrigenEvento = 'PROYECTO' | 'ADMINISTRACION';

/** HU-195 (T-360): marca de dónde viene el evento; el cliente no ofrece editar los de Administración. */
function conOrigen<T extends { idReunion?: number | null }>(evento: T): T & { origen: OrigenEvento } {
  return { ...evento, origen: typeof evento.idReunion === 'number' ? 'ADMINISTRACION' : 'PROYECTO' };
}

/**
 * HU-195: una reunión de Administración se proyecta una vez por proyecto; quien
 * está en dos de esos proyectos la vería dos veces. Se conserva la proyección
 * del menor idProyecto (la misma a la que enlaza su aviso) y los eventos
 * ordinarios pasan intactos.
 */
function unaPorReunion<T extends { idReunion?: number | null; idProyecto: number }>(eventos: T[]): T[] {
  const elegida = new Map<number, number>();
  for (const e of eventos) {
    if (typeof e.idReunion !== 'number') continue;
    const actual = elegida.get(e.idReunion);
    if (actual === undefined || e.idProyecto < actual) elegida.set(e.idReunion, e.idProyecto);
  }
  return eventos.filter((e) => typeof e.idReunion !== 'number' || elegida.get(e.idReunion) === e.idProyecto);
}

/**
 * G01 (UI-01): única `select` permitida para un evento visto desde un
 * calendario compartido. Nunca pide descripción, enlace, ubicación,
 * invitados, rolesDestino ni antelación: compartir la agenda no es permiso
 * de lectura sobre el proyecto.
 */
export const EVENT_SHARED_SELECT = {
  idEvento: true,
  idProyecto: true,
  tituloEvento: true,
  fechaInicio: true,
  fechaFin: true,
  tipoEvento: true,
  modalidad: true,
  proyecto: { select: { idProyecto: true, tituloProyecto: true } },
  // Solo para no repetir una reunión multiproyecto; `proyectarEventoCompartido` nunca lo copia.
  idReunion: true,
} as const satisfies Prisma.EventoProyectoSelect;

export type EventoCompartidoFila = Prisma.EventoProyectoGetPayload<{ select: typeof EVENT_SHARED_SELECT }>;

/**
 * Contrato de un evento en la agenda compartida. `DETALLE` solo cuando quien
 * recibe tiene acceso propio al proyecto; si no, `OCUPADO`: horario sin
 * identidad (ni título, ni tipo, ni proyecto).
 */
export type EventoCompartido =
  | {
      idEvento: number;
      fechaInicio: Date;
      fechaFin: Date;
      visibilidad: 'DETALLE';
      tituloEvento: string;
      tipoEvento: TipoEvento;
      modalidad: ModalidadEvento;
      proyecto: { idProyecto: number; tituloProyecto: string };
    }
  | { idEvento: number; fechaInicio: Date; fechaFin: Date; visibilidad: 'OCUPADO' };

/**
 * Construye el DTO compartido campo por campo (allowlist): aunque la fila
 * traiga más columnas, nunca se copian por spread.
 */
export function proyectarEventoCompartido(fila: EventoCompartidoFila, puedeVerDetalle: boolean): EventoCompartido {
  const base = { idEvento: fila.idEvento, fechaInicio: fila.fechaInicio, fechaFin: fila.fechaFin };
  if (!puedeVerDetalle) {
    return { ...base, visibilidad: 'OCUPADO' };
  }
  return {
    ...base,
    visibilidad: 'DETALLE',
    tituloEvento: fila.tituloEvento,
    tipoEvento: fila.tipoEvento,
    modalidad: fila.modalidad,
    proyecto: { idProyecto: fila.proyecto.idProyecto, tituloProyecto: fila.proyecto.tituloProyecto },
  };
}

/**
 * HU-184: un evento con invitados solo lo ven ellos y el líder del proyecto;
 * sin invitados lo ve todo el proyecto (comportamiento previo).
 */
export function filtroVisibilidadEvento(userId: number): Prisma.EventoProyectoWhereInput {
  return {
    OR: [{ invitados: { isEmpty: true } }, { invitados: { has: userId } }, { proyecto: { creadoPor: userId } }],
  };
}

/**
 * HU-169 (T-263): CRUD de EventoProyecto. Mismo patrón de permisos que
 * LabelsService (líder crea/edita/cancela; líder o participante ACTIVO ve),
 * sin ProjectTransactionService: un evento de calendario no comparte las
 * invariantes de concurrencia de horas/etiquetas que justifican ese lock.
 */
@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async findAllForProject(projectId: number, userId: number) {
    await this.assertCanRead(projectId, userId);
    const eventos = await this.prisma.eventoProyecto.findMany({
      where: { idProyecto: projectId, eliminadoEn: null, ...filtroVisibilidadEvento(userId) },
      select: EVENT_SELECT,
      orderBy: { fechaInicio: 'asc' },
    });
    return eventos.map(conOrigen);
  }

  /** GET /usuarios/me/eventos?desde&hasta — misma vista global que /usuarios/me/tareas. */
  async findForUserInRange(userId: number, desde: string, hasta: string) {
    const idsProyectos = await this.projectIdsForUser(userId);
    // Solapamiento con [desde, hasta]: el evento empieza antes de que
    // termine el rango y termina después de que empiece.
    const rango = { fechaInicio: { lte: new Date(hasta) }, fechaFin: { gte: new Date(desde) } };
    const select = { ...EVENT_SELECT, proyecto: { select: { idProyecto: true, tituloProyecto: true } } } as const;

    const ordinarios = idsProyectos.length === 0 ? [] : await this.prisma.eventoProyecto.findMany({
      where: { idProyecto: { in: idsProyectos }, eliminadoEn: null, ...rango, ...filtroVisibilidadEvento(userId) },
      select,
      orderBy: { fechaInicio: 'asc' },
    });
    const historicos = (await this.tieneEquipoCerrado(userId))
      ? await this.prisma.eventoProyecto.findMany({ where: { ...this.filtroReunionHistorica(userId, idsProyectos), ...rango }, select, orderBy: { fechaInicio: 'asc' } })
      : [];

    return unaPorReunion([...ordinarios, ...historicos])
      .sort((a, b) => a.fechaInicio.getTime() - b.fechaInicio.getTime())
      .map(conOrigen);
  }

  /**
   * HU-195 (T-360/T-364): el equipo histórico de un proyecto CERRADO (sus
   * COMPLETADO) ve las reuniones de Administración convocadas para ese
   * proyecto, y SOLO esas: no se reabren los eventos ordinarios del proyecto
   * cerrado ni se amplía la regla de lectura de proyectos cerrados.
   */
  private filtroReunionHistorica(userId: number, excluir: number[]): Prisma.EventoProyectoWhereInput {
    return {
      idReunion: { not: null },
      eliminadoEn: null,
      reunion: { canceladaEn: null },
      idProyecto: { notIn: excluir },
      proyecto: {
        eliminadoEn: null,
        estadoProyecto: EstadoProyecto.CERRADO,
        roles: { some: { participaciones: { some: { idUsuario: userId, estadoParticipacion: 'COMPLETADO' } } } },
      },
    };
  }

  private async tieneEquipoCerrado(userId: number): Promise<boolean> {
    const fila = await this.prisma.participacionProyecto.findFirst({
      where: { idUsuario: userId, estadoParticipacion: 'COMPLETADO', rolProyecto: { proyecto: { estadoProyecto: EstadoProyecto.CERRADO, eliminadoEn: null } } },
      select: { idParticipacion: true },
    });
    return !!fila;
  }

  /**
   * G01 (UI-01): agenda del propietario vista por quien recibe su calendario
   * compartido. Los proyectos son los del propietario, pero la visibilidad se
   * evalúa contra quien mira: un evento con invitados solo aparece si quien
   * mira está invitado (sin heredar el bypass de líder del propietario), y el
   * detalle (título, tipo, modalidad, proyecto) solo si quien mira tiene
   * acceso propio a ese proyecto; si no, se devuelve como OCUPADO.
   */
  async findSharedInRange(ownerId: number, viewerId: number, desde: string, hasta: string): Promise<EventoCompartido[]> {
    const [idsPropietario, idsReceptor] = await Promise.all([
      this.projectIdsForUser(ownerId),
      this.projectIdsForUser(viewerId),
    ]);
    if (idsPropietario.length === 0) return [];

    const filas = await this.prisma.eventoProyecto.findMany({
      where: {
        idProyecto: { in: idsPropietario },
        eliminadoEn: null,
        fechaInicio: { lte: new Date(hasta) },
        fechaFin: { gte: new Date(desde) },
        // Restricción por invitados contra quien mira, nunca contra el propietario.
        OR: [{ invitados: { isEmpty: true } }, { invitados: { has: viewerId } }],
      },
      select: EVENT_SHARED_SELECT,
      orderBy: { fechaInicio: 'asc' },
    });
    const comunes = new Set(idsReceptor);
    return unaPorReunion(filas).map((fila) => proyectarEventoCompartido(fila, comunes.has(fila.idProyecto)));
  }

  async create(projectId: number, userId: number, dto: CreateEventDto) {
    const proyecto = await this.getProjectOrThrow(projectId);
    this.assertLeader(proyecto, userId);
    this.assertProyectoNoCerrado(proyecto, 'No se puede crear un evento en un proyecto cerrado');
    this.assertFechaFinPosterior(dto.fechaInicio, dto.fechaFin);
    this.assertFechaInicioNoPasada(dto.fechaInicio);
    const invitados = await this.normalizarInvitados(projectId, proyecto.creadoPor, dto.invitados);

    return conOrigen(await this.prisma.eventoProyecto.create({
      data: {
        idProyecto: projectId,
        idCreador: userId,
        tituloEvento: dto.tituloEvento,
        descripcionEvento: dto.descripcionEvento,
        fechaInicio: new Date(dto.fechaInicio),
        fechaFin: new Date(dto.fechaFin),
        antelacionMinutos: dto.antelacionMinutos ?? 60,
        modalidad: dto.modalidad ?? 'VIRTUAL',
        ubicacionLat: dto.ubicacionLat,
        ubicacionLng: dto.ubicacionLng,
        ubicacionNombre: dto.ubicacionNombre,
        linkSesion: dto.linkSesion,
        rolesDestino: dto.rolesDestino ?? [],
        tipoEvento: dto.tipoEvento ?? 'OTRO',
        invitados,
      },
      select: EVENT_SELECT,
    }));
  }

  async update(projectId: number, eventId: number, userId: number, dto: UpdateEventDto) {
    const proyecto = await this.getProjectOrThrow(projectId);
    this.assertLeader(proyecto, userId);
    this.assertProyectoNoCerrado(proyecto);
    const actual = await this.getEventOrThrow(projectId, eventId);
    this.assertNoEsReunionAdministracion(actual);

    if (dto.fechaInicio !== undefined || dto.fechaFin !== undefined) {
      this.assertFechaFinPosterior(
        dto.fechaInicio ?? actual.fechaInicio.toISOString(),
        dto.fechaFin ?? actual.fechaFin.toISOString(),
      );
    }

    // G04 (UI-35): en los metadatos de modalidad, `null` explícito limpia el
    // dato y la omisión lo conserva (un cliente antiguo que no los envía no
    // borra nada). Lo que no se permite es dejar sin ubicación o sin enlace un
    // evento cuya modalidad resultante sí los necesita.
    const modalidadFinal = dto.modalidad ?? actual.modalidad;
    const requiereUbicacion = modalidadFinal === 'PRESENCIAL' || modalidadFinal === 'MIXTA';
    const requiereLink = modalidadFinal === 'VIRTUAL' || modalidadFinal === 'MIXTA';
    if (requiereUbicacion && (dto.ubicacionLat === null || dto.ubicacionLng === null)) {
      throw new BadRequestException('Un evento presencial o híbrido necesita su ubicación en el mapa');
    }
    if (requiereLink && dto.linkSesion === null) {
      throw new BadRequestException('Un evento virtual o híbrido necesita el enlace de la sesión');
    }

    const data: Prisma.EventoProyectoUpdateInput = { actualizadoEn: new Date() };
    if (dto.tituloEvento !== undefined) data.tituloEvento = dto.tituloEvento;
    if (dto.descripcionEvento !== undefined) data.descripcionEvento = dto.descripcionEvento;
    if (dto.antelacionMinutos !== undefined) data.antelacionMinutos = dto.antelacionMinutos;
    if (dto.fechaFin !== undefined) data.fechaFin = new Date(dto.fechaFin);
    if (dto.modalidad !== undefined) data.modalidad = dto.modalidad;
    if (dto.ubicacionLat !== undefined) data.ubicacionLat = dto.ubicacionLat;
    if (dto.ubicacionLng !== undefined) data.ubicacionLng = dto.ubicacionLng;
    if (dto.ubicacionNombre !== undefined) data.ubicacionNombre = dto.ubicacionNombre;
    if (dto.linkSesion !== undefined) data.linkSesion = dto.linkSesion;
    if (dto.rolesDestino !== undefined) data.rolesDestino = dto.rolesDestino;
    if (dto.tipoEvento !== undefined) data.tipoEvento = dto.tipoEvento;
    if (dto.invitados !== undefined) {
      const invitados = await this.normalizarInvitados(projectId, proyecto.creadoPor, dto.invitados);
      data.invitados = invitados;
      // G04 (UI-22): si la audiencia CRECE (alguien nuevo en la lista, o la
      // lista se vacía y el evento vuelve a ser de todo el proyecto), quien
      // entra tarde se quedaba sin recordatorio cuando este ya se había
      // enviado. Se reabre el recordatorio; EventsReminderService solo avisa a
      // quien todavía no tiene aviso de este evento para esta hora de inicio,
      // así que los ya notificados no reciben un duplicado. El diálogo manda
      // `invitados` en cada edición: por eso se compara contra el valor real
      // (cambiar solo el título, o quitar a alguien, no reabre nada).
      if (this.audienciaCrece(actual.invitados, invitados)) {
        data.recordatorioEnviadoEn = null;
      }
    }
    // T-265: mover fechaInicio invalida el recordatorio ya agendado/enviado
    // contra la fecha vieja — se resetea para que EventsReminderService lo
    // recalcule contra la fecha nueva, nunca reenvía el viejo. El diálogo del
    // frontend manda fechaInicio en cada edición (también al solo cambiar el
    // título), así que el reset debe comparar contra el valor real, no contra
    // "vino en el DTO", o un recordatorio ya enviado se reenvía sin que la
    // fecha haya cambiado.
    if (dto.fechaInicio !== undefined) {
      const nuevaFechaInicio = new Date(dto.fechaInicio);
      if (nuevaFechaInicio.getTime() !== actual.fechaInicio.getTime()) {
        this.assertFechaInicioNoPasada(dto.fechaInicio);
        data.recordatorioEnviadoEn = null;
      }
      data.fechaInicio = nuevaFechaInicio;
    }

    return conOrigen(await this.prisma.eventoProyecto.update({
      where: { idEvento: eventId },
      data,
      select: EVENT_SELECT,
    }));
  }

  /** DELETE = cancelar (soft delete). T-265: excluye el evento de cualquier recordatorio pendiente. */
  async remove(projectId: number, eventId: number, userId: number): Promise<void> {
    const proyecto = await this.getProjectOrThrow(projectId);
    this.assertLeader(proyecto, userId);
    this.assertProyectoNoCerrado(proyecto);
    this.assertNoEsReunionAdministracion(await this.getEventOrThrow(projectId, eventId));

    await this.prisma.eventoProyecto.update({
      where: { idEvento: eventId },
      data: { eliminadoEn: new Date() },
    });
  }

  /**
   * HU-184: invitados sin duplicados y solo integrantes del proyecto (líder o
   * participante ACTIVO). Un id ajeno es un 400, no se descarta en silencio:
   * el líder debe enterarse de que esa persona no recibirá el evento.
   */
  private async normalizarInvitados(projectId: number, leaderId: number, invitados?: number[]): Promise<number[]> {
    const unicos = [...new Set(invitados ?? [])];
    if (unicos.length === 0) return [];

    const participaciones = await this.prisma.participacionProyecto.findMany({
      where: { idUsuario: { in: unicos }, estadoParticipacion: 'ACTIVO', rolProyecto: { idProyecto: projectId } },
      select: { idUsuario: true },
    });
    const integrantes = new Set([leaderId, ...participaciones.map((p) => p.idUsuario)]);
    if (unicos.some((id) => !integrantes.has(id))) {
      throw new BadRequestException('Solo puedes invitar a integrantes activos del proyecto');
    }
    return unicos;
  }

  /**
   * ¿Hay alguien que antes no recibía el evento y ahora sí? `[]` significa
   * "todo el proyecto": pasar de una lista a `[]` amplía; pasar de `[]` a una
   * lista restringe (los invitados son siempre integrantes, ya estaban dentro).
   */
  private audienciaCrece(antes: number[], ahora: number[]): boolean {
    if (antes.length === 0) return false;
    if (ahora.length === 0) return true;
    return ahora.some((id) => !antes.includes(id));
  }

  private assertFechaFinPosterior(fechaInicio: string, fechaFin: string): void {
    if (new Date(fechaFin).getTime() <= new Date(fechaInicio).getTime()) {
      throw new BadRequestException('La fecha y hora de fin debe ser posterior a la fecha y hora de inicio');
    }
  }

  private assertFechaInicioNoPasada(fechaInicio: string): void {
    if (new Date(fechaInicio).getTime() < Date.now()) {
      throw new BadRequestException('La fecha y hora de inicio no puede ser anterior al momento actual');
    }
  }

  /** Proyectos donde el usuario es líder o participante ACTIVO (público: lo reutiliza la agenda compartida). */
  async projectIdsForUser(userId: number): Promise<number[]> {
    const proyectos = await this.prisma.proyecto.findMany({
      where: {
        eliminadoEn: null,
        OR: [
          { creadoPor: userId },
          {
            roles: {
              some: { participaciones: { some: { idUsuario: userId, estadoParticipacion: 'ACTIVO' } } },
            },
          },
        ],
      },
      select: { idProyecto: true },
    });
    return proyectos.map((p) => p.idProyecto);
  }

  private assertProyectoNoCerrado(
    proyecto: { estadoProyecto: EstadoProyecto },
    mensaje = 'No se puede modificar un evento de un proyecto cerrado',
  ): void {
    if (proyecto.estadoProyecto === EstadoProyecto.CERRADO) {
      throw new ConflictException(mensaje);
    }
  }

  private async getProjectOrThrow(projectId: number) {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto: projectId, eliminadoEn: null },
      select: { idProyecto: true, creadoPor: true, estadoProyecto: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${projectId} no encontrado`);
    }
    return proyecto;
  }

  private assertLeader(proyecto: { creadoPor: number }, userId: number): void {
    if (proyecto.creadoPor !== userId) {
      throw new ForbiddenException('No eres el líder de este proyecto');
    }
  }

  /** HU-195: la proyección de una reunión de Administración solo se gestiona desde /admin/reuniones. */
  private assertNoEsReunionAdministracion(evento: { idReunion: number | null }): void {
    if (typeof evento.idReunion === 'number') {
      throw new ForbiddenException('Es una reunión de Administración: solo Administración puede modificarla o cancelarla');
    }
  }

  private async assertCanRead(projectId: number, userId: number): Promise<void> {
    const proyecto = await this.getProjectOrThrow(projectId);
    if (proyecto.creadoPor === userId) {
      return;
    }
    const participacion = await this.prisma.participacionProyecto.findFirst({
      where: {
        idUsuario: userId,
        estadoParticipacion: 'ACTIVO',
        rolProyecto: { idProyecto: projectId },
      },
      select: { idParticipacion: true },
    });
    if (!participacion) {
      throw new ForbiddenException('No tienes acceso a los eventos de este proyecto');
    }
  }

  private async getEventOrThrow(projectId: number, eventId: number) {
    const evento = await this.prisma.eventoProyecto.findFirst({
      where: { idEvento: eventId, idProyecto: projectId, eliminadoEn: null },
      select: EVENT_SELECT,
    });
    if (!evento) {
      throw new NotFoundException(`Evento con id ${eventId} no encontrado en el proyecto ${projectId}`);
    }
    return evento;
  }
}
