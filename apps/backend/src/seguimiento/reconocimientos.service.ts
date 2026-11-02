import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EstadoParticipacion, EstadoSprint, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SprintsContextService } from '../sprints/sprints-context.service';
import { INSIGNIAS_EVENTO } from '../insignias/insignias.catalog';
import { CrearReconocimientoDto } from './dto/seguimiento.dto';

const USUARIO = { idUsuario: true, nombre: true, apellido: true } as const;

/**
 * MEJ-57: reconocimientos entre compañeros. Cada integrante (líder o
 * participante activo) da a lo sumo uno por Sprint, a otro integrante del
 * mismo proyecto y mientras el Sprint sigue operable. La unicidad la garantiza
 * `@@unique([idSprint, idAutor])`; recibirlos alimenta la insignia
 * «Compañero ejemplar» (clave `companerismo`).
 */
@Injectable()
export class ReconocimientosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sprintsContext: SprintsContextService,
    private readonly notifications: NotificationsService,
    private readonly events: EventEmitter2,
  ) {}

  /** Líder o participante activo del proyecto. */
  private async esIntegrante(projectId: number, idUsuario: number, creadoPor: number): Promise<boolean> {
    if (creadoPor === idUsuario) return true;
    const p = await this.prisma.participacionProyecto.findFirst({
      where: { idUsuario, estadoParticipacion: EstadoParticipacion.ACTIVO, rolProyecto: { idProyecto: projectId } },
      select: { idParticipacion: true },
    });
    return p !== null;
  }

  async listar(projectId: number, sprintId: number, actorId: number) {
    await this.sprintsContext.assertActiveProjectParticipant(projectId, actorId);
    await this.sprintsContext.getSprintInProjectOrThrow(projectId, sprintId);
    const filas = await this.prisma.reconocimientoCompanero.findMany({
      where: { idSprint: sprintId },
      orderBy: { creadoEn: 'desc' },
      select: {
        idReconocimiento: true,
        mensaje: true,
        creadoEn: true,
        autor: { select: USUARIO },
        receptor: { select: USUARIO },
      },
    });
    return {
      reconocimientos: filas,
      yaReconoci: filas.some((f) => f.autor.idUsuario === actorId),
    };
  }

  async crear(projectId: number, sprintId: number, actorId: number, dto: CrearReconocimientoDto) {
    await this.sprintsContext.assertActiveProjectParticipant(projectId, actorId);
    const proyecto = await this.sprintsContext.getProjectOrThrow(projectId);
    const sprint = await this.sprintsContext.getSprintInProjectOrThrow(projectId, sprintId);
    if (sprint.estado === EstadoSprint.CERRADO) {
      throw new BadRequestException('Solo puedes reconocer a un compañero mientras el sprint sigue abierto');
    }
    if (dto.idReceptor === actorId) {
      throw new BadRequestException('No puedes reconocerte a ti mismo');
    }
    if (!(await this.esIntegrante(projectId, dto.idReceptor, proyecto.creadoPor))) {
      throw new BadRequestException('Solo puedes reconocer a integrantes de este proyecto');
    }

    let creado;
    try {
      creado = await this.prisma.reconocimientoCompanero.create({
        data: { idSprint: sprintId, idProyecto: projectId, idAutor: actorId, idReceptor: dto.idReceptor, mensaje: dto.mensaje },
        select: { idReconocimiento: true, mensaje: true, creadoEn: true, receptor: { select: USUARIO } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya diste tu reconocimiento de este sprint');
      }
      throw error;
    }

    const autor = await this.prisma.usuario.findUnique({ where: { idUsuario: actorId }, select: { nombre: true, apellido: true } });
    if (!autor) throw new NotFoundException('Usuario no encontrado');
    await this.notifications.notifyFromTemplate([dto.idReceptor], 'RECONOCIMIENTO_RECIBIDO', {
      autorNombre: `${autor.nombre} ${autor.apellido}`,
      projectTitle: proyecto.tituloProyecto,
      projectId,
      sprintNumero: sprint.numero,
    });
    this.events.emit(INSIGNIAS_EVENTO, { claves: ['companerismo'], idUsuarios: [dto.idReceptor] });
    return creado;
  }
}
