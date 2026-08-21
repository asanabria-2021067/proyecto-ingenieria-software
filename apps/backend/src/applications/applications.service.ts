import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApplicationCreatedEvent } from '../notifications/events/application-created.event';
import { EstadoProyecto, Prisma, TipoNotificacion } from '@prisma/client';
import { CreatePostulacionDto } from './dto/create-postulacion.dto';
import { UpdateEstadoPostulacionDto } from './dto/update-estado-postulacion.dto';

@Injectable()
export class ApplicationsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreatePostulacionDto, postulanteId: number) {
    // 1. Verificar que el usuario existe
    const usuario = await this.prisma.usuario.findUnique({
      where: { idUsuario: postulanteId },
    });

    if (!usuario) {
      throw new NotFoundException(
        `El usuario con id ${postulanteId} no existe`,
      );
    }

    // 2. Verificar que el rol existe y el proyecto está postulable
    const rol = await this.prisma.rolProyecto.findUnique({
      where: { idRolProyecto: dto.idRolProyecto },
      include: { proyecto: true },
    });

    if (!rol) {
      throw new NotFoundException(
        `El rol con id ${dto.idRolProyecto} no existe`,
      );
    }

    const { estadoProyecto } = rol.proyecto;
    const esPublicado = estadoProyecto === EstadoProyecto.PUBLICADO;
    const esEnProgreso = estadoProyecto === EstadoProyecto.EN_PROGRESO;

    if (!esPublicado && !esEnProgreso) {
      throw new BadRequestException(
        'Solo se puede postular a proyectos en estado PUBLICADO o EN_PROGRESO con cupos disponibles',
      );
    }

    if (esEnProgreso) {
      const activas = await this.prisma.participacionProyecto.count({
        where: {
          idRolProyecto: dto.idRolProyecto,
          estadoParticipacion: 'ACTIVO',
        },
      });
      if (activas >= rol.cupos) {
        throw new BadRequestException(
          'El rol ya alcanzó su límite de cupos activos en EN_PROGRESO',
        );
      }
    }

    const postulacionExistente = await this.prisma.postulacion.findFirst({
      where: {
        idUsuarioPostulante: postulanteId,
        idRolProyecto: dto.idRolProyecto,
      },
    });

    if (postulacionExistente) {
      throw new BadRequestException(
        'Ya te has postulado anteriormente a este rol en el proyecto',
      );
    }

    const postulacion = await this.prisma.postulacion.create({
      data: {
        idUsuarioPostulante: postulanteId,
        idRolProyecto: dto.idRolProyecto,
        justificacion: dto.justificacion,
      },
      include: {
        rolProyecto: {
          include: { proyecto: true },
        },
        postulante: {
          select: {
            nombre: true,
            apellido: true,
          },
        },
      },
    });

    // Emit event (event-driven)
    this.eventEmitter.emit(
      'application.created',
      new ApplicationCreatedEvent(
        postulacion.idPostulacion,
        postulanteId,
        rol.proyecto.idProyecto,
        dto.idRolProyecto,
      ),
    );

    return postulacion;
  }

  async findAll() {
    return this.prisma.postulacion.findMany({
      include: {
        postulante: {
          select: {
            idUsuario: true,
            nombre: true,
            apellido: true,
            correo: true,
          },
        },
        rolProyecto: {
          include: { proyecto: true },
        },
      },
      orderBy: { fechaPostulacion: 'desc' },
    });
  }

  async findMine(userId: number) {
    return this.prisma.postulacion.findMany({
      where: { idUsuarioPostulante: userId },
      include: {
        rolProyecto: {
          include: {
            proyecto: {
              select: {
                idProyecto: true,
                tituloProyecto: true,
                estadoProyecto: true,
              },
            },
          },
        },
      },
      orderBy: { fechaPostulacion: 'desc' },
    });
  }

  async findOne(id: number) {
    const postulacion = await this.prisma.postulacion.findUnique({
      where: { idPostulacion: id },
      include: {
        postulante: {
          select: {
            idUsuario: true,
            nombre: true,
            apellido: true,
            correo: true,
          },
        },
        rolProyecto: {
          include: {
            proyecto: true,
            requisitos: {
              include: { habilidad: true },
            },
          },
        },
      },
    });

    if (!postulacion) {
      throw new NotFoundException(`Postulación con id ${id} no encontrada`);
    }

    return postulacion;
  }

  /**
   * Aceptar una postulación debe producir un integrante activo real, no solo
   * cambiar el estado de la fila `Postulacion` — de lo contrario la persona
   * queda "aceptada" en el papel pero invisible en /miembros y sin poder
   * recibir tareas (idParticipacion inexistente). Reutiliza una
   * `ParticipacionProyecto` previa del mismo (usuario, rol) si existe
   * —típicamente RETIRADO de un ciclo anterior— reactivándola en vez de
   * crear una fila duplicada; solo crea una nueva cuando no existe ninguna.
   * Enlaza `idPostulacion` para conservar la trazabilidad del origen, igual
   * que ya hace `seed.ts`.
   */
  private async activarParticipacionPorPostulacion(
    tx: Prisma.TransactionClient,
    idUsuario: number,
    idRolProyecto: number,
    idPostulacion: number,
  ) {
    const existente = await tx.participacionProyecto.findFirst({
      where: { idUsuario, idRolProyecto },
      orderBy: { idParticipacion: 'desc' },
    });

    if (!existente) {
      return tx.participacionProyecto.create({
        data: { idUsuario, idRolProyecto, idPostulacion, estadoParticipacion: 'ACTIVO' },
      });
    }

    if (existente.estadoParticipacion === 'ACTIVO') {
      // Ya activo (carrera/reintento) — no duplicar ni tocar fechaIngreso.
      return existente;
    }

    return tx.participacionProyecto.update({
      where: { idParticipacion: existente.idParticipacion },
      data: {
        estadoParticipacion: 'ACTIVO',
        fechaIngreso: new Date(),
        fechaSalida: null,
        idPostulacion,
      },
    });
  }

  async updateEstado(
    id: number,
    dto: UpdateEstadoPostulacionDto,
    resolutorId: number,
  ) {
    const postulacion = await this.prisma.postulacion.findUnique({
      where: { idPostulacion: id },
      include: {
        rolProyecto: {
          include: { proyecto: true },
        },
      },
    });

    if (!postulacion) {
      throw new NotFoundException(`Postulación con id ${id} no encontrada`);
    }

    if (postulacion.estadoPostulacion !== 'PENDIENTE') {
      throw new BadRequestException('Esta postulación ya fue resuelta');
    }

    if (postulacion.rolProyecto.proyecto.creadoPor !== resolutorId) {
      throw new ForbiddenException(
        'Solo el creador del proyecto puede resolver postulaciones',
      );
    }

    const esAceptada = dto.estadoPostulacion === 'ACEPTADA';

    const postulacionActualizada = await this.prisma.$transaction(async (tx) => {
      // `updateMany` condicionado por PENDIENTE (mismo patrón que
      // SprintsService/ExitRequestsService): si otra resolución concurrente
      // ya ganó la carrera entre el findUnique de arriba y este punto,
      // count === 0 y se traduce a ConflictException en vez de resolver dos
      // veces la misma postulación (y, con ACEPTADA, crear dos
      // participaciones).
      const resuelta = await tx.postulacion.updateMany({
        where: { idPostulacion: id, estadoPostulacion: 'PENDIENTE' },
        data: {
          estadoPostulacion: dto.estadoPostulacion,
          comentarioResolucion: dto.comentarioResolucion ?? null,
          resueltaPor: resolutorId,
          fechaResolucion: new Date(),
        },
      });
      if (resuelta.count !== 1) {
        throw new ConflictException('Esta postulación ya fue resuelta');
      }

      if (esAceptada) {
        await this.activarParticipacionPorPostulacion(
          tx,
          postulacion.idUsuarioPostulante,
          postulacion.idRolProyecto,
          id,
        );
      }

      return tx.postulacion.findUniqueOrThrow({
        where: { idPostulacion: id },
        include: { rolProyecto: { include: { proyecto: true } } },
      });
    });

    const tituloProyecto = postulacion.rolProyecto.proyecto.tituloProyecto;
    const nombreRol = postulacion.rolProyecto.nombreRol;
    const estado = dto.estadoPostulacion;

    await this.notificationsService.notifyUsers(
      [postulacion.idUsuarioPostulante],
      {
        tipoNotificacion: TipoNotificacion.POSTULACION_RESUELTA,
        tituloNotificacion: esAceptada
          ? 'Tu postulación fue aceptada'
          : 'Tu postulación fue rechazada',
        mensajeNotificacion: esAceptada
          ? `Felicidades, tu postulación para el rol "${nombreRol}" en el proyecto "${tituloProyecto}" ha sido aceptada.`
          : `Tu postulación para el rol "${nombreRol}" en el proyecto "${tituloProyecto}" ha sido rechazada.${dto.comentarioResolucion ? ` Comentario: ${dto.comentarioResolucion}` : ''}`,
        datosJson: {
          idPostulacion: postulacion.idPostulacion,
          idProyecto: postulacion.rolProyecto.proyecto.idProyecto,
          idRolProyecto: postulacion.idRolProyecto,
          estadoPostulacion: estado,
        },
      },
    );

    return postulacionActualizada;
  }

  async delete(id: number, userId: number) {
    const postulacion = await this.prisma.postulacion.findUnique({
      where: { idPostulacion: id },
      select: {
        idPostulacion: true,
        idUsuarioPostulante: true,
        estadoPostulacion: true,
      },
    });

    if (!postulacion) {
      throw new NotFoundException(`Postulación con id ${id} no encontrada`);
    }

    if (postulacion.idUsuarioPostulante !== userId) {
      throw new ForbiddenException(
        'No tienes permiso para cancelar esta postulación',
      );
    }

    if (postulacion.estadoPostulacion !== 'PENDIENTE') {
      throw new BadRequestException(
        'Solo puedes cancelar postulaciones en estado PENDIENTE',
      );
    }

    await this.prisma.postulacion.delete({
      where: { idPostulacion: id },
    });

    return { mensaje: 'Postulación cancelada exitosamente' };
  }
}
