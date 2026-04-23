import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EstadoProyecto, TipoNotificacion } from '@prisma/client';
import { CreatePostulacionDto } from './dto/create-postulacion.dto';
import { UpdateEstadoPostulacionDto } from './dto/update-estado-postulacion.dto';

@Injectable()
export class ApplicationsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async create(dto: CreatePostulacionDto) {
    // 1. Verificar que el usuario existe
    const usuario = await this.prisma.usuario.findUnique({
      where: { idUsuario: dto.idUsuarioPostulante },
    });

    if (!usuario) {
      throw new NotFoundException(
        `El usuario con id ${dto.idUsuarioPostulante} no existe`,
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
        idUsuarioPostulante: dto.idUsuarioPostulante,
        idRolProyecto: dto.idRolProyecto,
      },
    });

    if (postulacionExistente) {
      throw new BadRequestException(
        'Ya te has postulado anteriormente a este rol en el proyecto',
      );
    }

    return this.prisma.postulacion.create({
      data: {
        idUsuarioPostulante: dto.idUsuarioPostulante,
        idRolProyecto: dto.idRolProyecto,
        justificacion: dto.justificacion,
      },
      include: {
        rolProyecto: {
          include: { proyecto: true },
        },
      },
    });
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

    const postulacionActualizada = await this.prisma.postulacion.update({
      where: { idPostulacion: id },
      data: {
        estadoPostulacion: dto.estadoPostulacion,
        comentarioResolucion: dto.comentarioResolucion ?? null,
        resueltaPor: resolutorId,
        fechaResolucion: new Date(),
      },
      include: {
        rolProyecto: {
          include: { proyecto: true },
        },
      },
    });

    const tituloProyecto = postulacion.rolProyecto.proyecto.tituloProyecto;
    const nombreRol = postulacion.rolProyecto.nombreRol;
    const estado = dto.estadoPostulacion;
    const esAceptada = estado === 'ACEPTADA';

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
}
