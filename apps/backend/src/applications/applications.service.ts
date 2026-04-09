import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostulacionDto } from './dto/create-postulacion.dto';
import { UpdateEstadoPostulacionDto } from './dto/update-estado-postulacion.dto';

@Injectable()
export class ApplicationsService {
  constructor(private prisma: PrismaService) {}

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

    // 2. Verificar que el rol existe y el proyecto está PUBLICADO
    const rol = await this.prisma.rolProyecto.findUnique({
      where: { idRolProyecto: dto.idRolProyecto },
      include: { proyecto: true },
    });

    if (!rol) {
      throw new NotFoundException(
        `El rol con id ${dto.idRolProyecto} no existe`,
      );
    }

    if (rol.proyecto.estadoProyecto !== 'PUBLICADO') {
      throw new BadRequestException(
        'Solo se puede postular a proyectos en estado PUBLICADO',
      );
    }

    // 3. Verificar que el usuario no se ha postulado ya a este rol
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

    // 4. Crear la postulación
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

    return this.prisma.postulacion.update({
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
  }
}
