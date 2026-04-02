import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostulacionDto } from './dto/create-postulacion.dto';

@Injectable()
export class ApplicationsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePostulacionDto, idUsuarioPostulante: number) {
    // 1. Verificar que el rol existe y el proyecto está PUBLICADO
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

    // 2. Verificar que el usuario no se ha postulado ya a este rol
    const postulacionExistente = await this.prisma.postulacion.findFirst({
      where: {
        idUsuarioPostulante,
        idRolProyecto: dto.idRolProyecto,
      },
    });

    if (postulacionExistente) {
      throw new BadRequestException(
        'Ya tienes una postulación activa para este rol',
      );
    }

    // 3. Crear la postulación
    return this.prisma.postulacion.create({
      data: {
        idUsuarioPostulante,
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

  findAll() {
    return { message: 'Not implemented yet' };
  }
}
