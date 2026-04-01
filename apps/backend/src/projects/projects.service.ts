import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return { message: 'Not implemented yet' };
  }

  async findOne(id: number){
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { idProyecto: id },
      include: { 

        creador: {
          select: {
          idUsuario: true,
          nombre: true,
          apellido: true,
          correo: true,
          },
        },

        organizaciones: {
          include: {
            organizacion: true,
          },
        },

        intereses:{
          include:{
            interes: true,
          },
        },

        roles: {
          include: {
            requisitos: {
              include: {
                habilidad: true,
              },
            },
            carreraRequerida: true,
          },
        },

        hitos:{
          orderBy:{
            orden:'asc'
          },
        },

      },
    });

    if(!proyecto){
      throw new NotFoundException(`Proyecto con id ${id} no encontrado`)
    }

    return proyecto;
  }

  create(data: any) {
    return { message: 'Not implemented yet' };
  }
}
