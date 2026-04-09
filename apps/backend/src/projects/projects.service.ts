import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { EstadoProyecto } from '@prisma/client';

const ESTADOS_VISIBLES = [EstadoProyecto.PUBLICADO, EstadoProyecto.EN_PROGRESO];

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

  async findAll(q?: string) {
    return this.prisma.proyecto.findMany({
      where: {
        estadoProyecto: { in: ESTADOS_VISIBLES },
        eliminadoEn: null,
        ...(q && q.trim().length > 0
          ? { tituloProyecto: { contains: q.trim(), mode: 'insensitive' } }
          : {}),
      },
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
      orderBy: { fechaCreacion: 'desc' },
      take: 20,
    });
  }

  async findOne(id: number) {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: {
        idProyecto: id,
        estadoProyecto: { in: ESTADOS_VISIBLES },
        eliminadoEn: null,
      },
      select: {
        idProyecto: true,
        tituloProyecto: true,
        descripcionProyecto: true,
        objetivosProyecto: true,
        tipoProyecto: true,
        estadoProyecto: true,
        modalidadProyecto: true,
        ubicacionProyecto: true,
        contextoAcademico: true,
        urlRecursoExterno: true,
        fechaPublicacion: true,
        fechaInicio: true,
        fechaFinEstimada: true,
        fechaCreacion: true,
        creador: {
          select: {
            idUsuario: true,
            nombre: true,
            apellido: true,
            correo: true,
          },
        },
        organizaciones: {
          select: {
            idProyectoOrganizacion: true,
            rolOrganizacion: true,
            fechaVinculacion: true,
            organizacion: {
              select: {
                idOrganizacion: true,
                nombreOrganizacion: true,
                tipoOrganizacion: true,
                descripcionOrganizacion: true,
                correoContacto: true,
                telefonoContacto: true,
                sitioWeb: true,
                logoUrl: true,
                estadoOrganizacion: true,
              },
            },
          },
        },
        intereses: {
          select: {
            idProyectoInteres: true,
            interes: {
              select: {
                idInteres: true,
                nombreInteres: true,
                descripcionInteres: true,
              },
            },
          },
        },
        roles: {
          select: {
            idRolProyecto: true,
            nombreRol: true,
            descripcionRolProyecto: true,
            cupos: true,
            horasSemanalesEstimadas: true,
            carreraRequerida: {
              select: {
                idCarrera: true,
                nombreCarrera: true,
                facultad: true,
              },
            },
            requisitos: {
              select: {
                idRequisitoHabilidad: true,
                nivelMinimo: true,
                obligatorio: true,
                habilidad: {
                  select: {
                    idHabilidad: true,
                    nombreHabilidad: true,
                    categoriaHabilidad: true,
                    descripcionHabilidad: true,
                  },
                },
              },
            },
          },
        },
        hitos: {
          select: {
            idHito: true,
            tituloHito: true,
            descripcionHito: true,
            fechaLimite: true,
            estadoHito: true,
            orden: true,
          },
          orderBy: {
            orden: 'asc',
          },
        },
        tareas: {
          select: {
            idTarea: true,
            idHito: true,
            tituloTarea: true,
            descripcionTarea: true,
            estadoTarea: true,
            prioridad: true,
            fechaLimite: true,
          },
          orderBy: {
            idTarea: 'asc',
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