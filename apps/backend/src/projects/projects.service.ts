import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { EstadoProyecto } from '@prisma/client';

const proyectoSelect = {
  idProyecto: true,
  tituloProyecto: true,
  descripcionProyecto: true,
  objetivosProyecto: true,
  tipoProyecto: true,
  estadoProyecto: true,
  modalidadProyecto: true,
  ubicacionProyecto: true,
  contextoAcademico: true,
  fechaInicio: true,
  fechaFinEstimada: true,
  fechaCreacion: true,
  creador: {
    select: { nombre: true, apellido: true, correo: true },
  },
  organizaciones: {
    select: {
      rolOrganizacion: true,
      organizacion: { select: { idOrganizacion: true, nombreOrganizacion: true } },
    },
  },
  roles: {
    select: { idRolProyecto: true, nombreRol: true, cupos: true },
  },
} as const;

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

  async findOne(id: number) {
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
        intereses: {
          include: {
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
        hitos: {
          orderBy: {
            orden: 'asc',
          },
        },
      },
    });

    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${id} no encontrado`);
    }
    return proyecto;
  }

  async create(data: CreateProjectDto, creadoPor: number) {
    const {
      fechaInicio,
      fechaFinEstimada,
      organizacionesIds,
      ...rest
    } = data;

    return this.prisma.proyecto.create({
      data: {
        ...rest,
        estadoProyecto: EstadoProyecto.BORRADOR,
        creadoPor,
        fechaInicio: fechaInicio ? new Date(fechaInicio) : undefined,
        fechaFinEstimada: fechaFinEstimada ? new Date(fechaFinEstimada) : undefined,
        ...(organizacionesIds?.length && {
          organizaciones: {
            create: organizacionesIds.map((idOrganizacion) => ({ idOrganizacion })),
          },
        }),
      },
      select: proyectoSelect,
    });
  }
}