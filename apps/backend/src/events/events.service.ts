import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoProyecto, Prisma } from '@prisma/client';
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
} as const;

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
    return this.prisma.eventoProyecto.findMany({
      where: { idProyecto: projectId, eliminadoEn: null },
      select: EVENT_SELECT,
      orderBy: { fechaInicio: 'asc' },
    });
  }

  /** GET /usuarios/me/eventos?desde&hasta — misma vista global que /usuarios/me/tareas. */
  async findForUserInRange(userId: number, desde: string, hasta: string) {
    const idsProyectos = await this.projectIdsForUser(userId);
    if (idsProyectos.length === 0) return [];

    return this.prisma.eventoProyecto.findMany({
      where: {
        idProyecto: { in: idsProyectos },
        eliminadoEn: null,
        // Solapamiento con [desde, hasta]: el evento empieza antes de que
        // termine el rango y termina después de que empiece.
        fechaInicio: { lte: new Date(hasta) },
        fechaFin: { gte: new Date(desde) },
      },
      select: {
        ...EVENT_SELECT,
        proyecto: { select: { idProyecto: true, tituloProyecto: true } },
      },
      orderBy: { fechaInicio: 'asc' },
    });
  }

  async create(projectId: number, userId: number, dto: CreateEventDto) {
    const proyecto = await this.getProjectOrThrow(projectId);
    this.assertLeader(proyecto, userId);
    if (proyecto.estadoProyecto === EstadoProyecto.CERRADO) {
      throw new ConflictException('No se puede crear un evento en un proyecto cerrado');
    }
    this.assertFechaFinPosterior(dto.fechaInicio, dto.fechaFin);

    return this.prisma.eventoProyecto.create({
      data: {
        idProyecto: projectId,
        idCreador: userId,
        tituloEvento: dto.tituloEvento,
        descripcionEvento: dto.descripcionEvento,
        fechaInicio: new Date(dto.fechaInicio),
        fechaFin: new Date(dto.fechaFin),
        antelacionMinutos: dto.antelacionMinutos ?? 60,
      },
      select: EVENT_SELECT,
    });
  }

  async update(projectId: number, eventId: number, userId: number, dto: UpdateEventDto) {
    const proyecto = await this.getProjectOrThrow(projectId);
    this.assertLeader(proyecto, userId);
    const actual = await this.getEventOrThrow(projectId, eventId);

    if (dto.fechaInicio !== undefined || dto.fechaFin !== undefined) {
      this.assertFechaFinPosterior(
        dto.fechaInicio ?? actual.fechaInicio.toISOString(),
        dto.fechaFin ?? actual.fechaFin.toISOString(),
      );
    }

    const data: Prisma.EventoProyectoUpdateInput = { actualizadoEn: new Date() };
    if (dto.tituloEvento !== undefined) data.tituloEvento = dto.tituloEvento;
    if (dto.descripcionEvento !== undefined) data.descripcionEvento = dto.descripcionEvento;
    if (dto.antelacionMinutos !== undefined) data.antelacionMinutos = dto.antelacionMinutos;
    if (dto.fechaFin !== undefined) data.fechaFin = new Date(dto.fechaFin);
    // T-265: mover fechaInicio invalida el recordatorio ya agendado/enviado
    // contra la fecha vieja — se resetea para que EventsReminderService lo
    // recalcule contra la fecha nueva, nunca reenvía el viejo.
    if (dto.fechaInicio !== undefined) {
      data.fechaInicio = new Date(dto.fechaInicio);
      data.recordatorioEnviadoEn = null;
    }

    return this.prisma.eventoProyecto.update({
      where: { idEvento: eventId },
      data,
      select: EVENT_SELECT,
    });
  }

  /** DELETE = cancelar (soft delete). T-265: excluye el evento de cualquier recordatorio pendiente. */
  async remove(projectId: number, eventId: number, userId: number): Promise<void> {
    const proyecto = await this.getProjectOrThrow(projectId);
    this.assertLeader(proyecto, userId);
    await this.getEventOrThrow(projectId, eventId);

    await this.prisma.eventoProyecto.update({
      where: { idEvento: eventId },
      data: { eliminadoEn: new Date() },
    });
  }

  private assertFechaFinPosterior(fechaInicio: string, fechaFin: string): void {
    if (new Date(fechaFin).getTime() <= new Date(fechaInicio).getTime()) {
      throw new BadRequestException('La fecha y hora de fin debe ser posterior a la fecha y hora de inicio');
    }
  }

  private async projectIdsForUser(userId: number): Promise<number[]> {
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
