import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.proyecto.findMany({
      where: { estadoProyecto: 'PUBLICADO', eliminadoEn: null },
      select: {
        idProyecto: true,
        tituloProyecto: true,
        descripcionProyecto: true,
        tipoProyecto: true,
        estadoProyecto: true,
        modalidadProyecto: true,
        fechaPublicacion: true,
        organizaciones: {
          select: {
            organizacion: { select: { nombreOrganizacion: true } },
          },
        },
        intereses: {
          select: { interes: { select: { nombreInteres: true } } },
        },
        roles: { select: { idRolProyecto: true } },
      },
      orderBy: { fechaPublicacion: 'desc' },
    });
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
