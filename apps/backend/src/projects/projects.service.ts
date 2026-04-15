import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateProjectFullDto } from './dto/create-project-full.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { EstadoProyecto, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

const ESTADOS_VISIBLES: EstadoProyecto[] = [
  EstadoProyecto.PUBLICADO,
  EstadoProyecto.EN_PROGRESO,
];

const ESTADOS_EDITABLES: EstadoProyecto[] = [
  EstadoProyecto.BORRADOR,
  EstadoProyecto.OBSERVADO,
];

const proyectoListSelect = {
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
} as const;

const proyectoDetalleSelect = {
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
  creadoPor: true,
  creador: {
    select: { idUsuario: true, nombre: true, apellido: true, correo: true },
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
        select: { idInteres: true, nombreInteres: true, descripcionInteres: true },
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
        select: { idCarrera: true, nombreCarrera: true, facultad: true },
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
    orderBy: { orden: 'asc' as const },
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
    orderBy: { idTarea: 'asc' as const },
  },
} as const;

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async findAll(q?: string) {
    return this.prisma.proyecto.findMany({
      where: {
        estadoProyecto: { in: ESTADOS_VISIBLES },
        eliminadoEn: null,
        ...(q && q.trim().length > 0
          ? { tituloProyecto: { contains: q.trim(), mode: 'insensitive' } }
          : {}),
      },
      select: proyectoListSelect,
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
      select: proyectoDetalleSelect,
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${id} no encontrado`);
    }
    return proyecto;
  }

  async findOneOwner(id: number, userId: number) {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto: id, eliminadoEn: null },
      select: proyectoDetalleSelect,
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${id} no encontrado`);
    }
    if (proyecto.creadoPor !== userId) {
      throw new ForbiddenException('No tienes acceso a este proyecto');
    }
    return proyecto;
  }

  async findMine(userId: number) {
    return this.prisma.proyecto.findMany({
      where: { creadoPor: userId, eliminadoEn: null },
      select: {
        ...proyectoListSelect,
        fechaCreacion: true,
        fechaActualizacion: true,
        revisiones: {
          select: {
            idRevisionProyecto: true,
            estadoRevision: true,
            comentarioRevision: true,
            numeroEnvio: true,
            enviadaEn: true,
            revisadaEn: true,
          },
          orderBy: { enviadaEn: 'desc' },
          take: 1,
        },
      },
      orderBy: { fechaCreacion: 'desc' },
    });
  }

  async findAsContributor(userId: number) {
    return this.prisma.proyecto.findMany({
      where: {
        eliminadoEn: null,
        roles: {
          some: {
            participaciones: {
              some: {
                idUsuario: userId,
              },
            },
          },
        },
      },
      select: {
        ...proyectoListSelect,
        fechaCreacion: true,
        fechaActualizacion: true,
      },
      orderBy: { fechaCreacion: 'desc' },
    });
  }

  async createFull(data: CreateProjectFullDto, creadoPor: number) {
    const { fechaInicio, fechaFinEstimada, organizacionesIds, roles, accion, ...rest } = data;
    const estadoProyecto =
      accion === 'EN_REVISION' ? EstadoProyecto.EN_REVISION : EstadoProyecto.BORRADOR;

    return this.prisma.$transaction(async (tx) => {
      const proyecto = await tx.proyecto.create({
        data: {
          ...rest,
          estadoProyecto,
          creadoPor,
          fechaInicio: fechaInicio ? new Date(fechaInicio) : undefined,
          fechaFinEstimada: fechaFinEstimada ? new Date(fechaFinEstimada) : undefined,
          ...(organizacionesIds?.length && {
            organizaciones: {
              create: organizacionesIds.map((idOrganizacion) => ({ idOrganizacion })),
            },
          }),
          ...(roles?.length && {
            roles: {
              create: roles.map((rol) => ({
                nombreRol: rol.nombreRol,
                descripcionRolProyecto: rol.descripcionRolProyecto,
                idCarreraRequerida: rol.idCarreraRequerida,
                cupos: rol.cupos,
                horasSemanalesEstimadas: rol.horasSemanalesEstimadas,
                ...(rol.requisitos?.length && {
                  requisitos: {
                    create: rol.requisitos.map((req) => ({
                      idHabilidad: req.idHabilidad,
                      nivelMinimo: req.nivelMinimo,
                      obligatorio: req.obligatorio,
                    })),
                  },
                }),
              })),
            },
          }),
        },
        select: { idProyecto: true, estadoProyecto: true, tituloProyecto: true },
      });

      if (accion === 'EN_REVISION') {
        await this._crearRevisionPendiente(tx, proyecto.idProyecto, 1);
        await this.notifications.notifyAdmins(
          {
            tipoNotificacion: 'PROYECTO_EN_REVISION',
            tituloNotificacion: 'Proyecto enviado a revisión',
            mensajeNotificacion: `El proyecto "${proyecto.tituloProyecto}" fue enviado a revisión.`,
            datosJson: { idProyecto: proyecto.idProyecto, numeroEnvio: 1 },
          },
          tx,
        );
      }
      return proyecto;
    });
  }

  async create(data: CreateProjectDto, creadoPor: number) {
    const {
      fechaInicio,
      fechaFinEstimada,
      organizacionesIds,
      roles,
      ...rest
    } = data;

    return this.prisma.$transaction(async (tx) => {
      const proyecto = await tx.proyecto.create({
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
      });

      if (roles?.length) {
        for (const rol of roles) {
          const { requisitos, ...rolData } = rol;
          const createdRol = await tx.rolProyecto.create({
            data: {
              idProyecto: proyecto.idProyecto,
              nombreRol: rolData.nombreRol,
              ...(rolData.descripcionRolProyecto !== undefined && {
                descripcionRolProyecto: rolData.descripcionRolProyecto,
              }),
              ...(rolData.cupos !== undefined && { cupos: rolData.cupos }),
              ...(rolData.idCarreraRequerida !== undefined && {
                idCarreraRequerida: rolData.idCarreraRequerida,
              }),
              ...(rolData.horasSemanalesEstimadas !== undefined && {
                horasSemanalesEstimadas: rolData.horasSemanalesEstimadas,
              }),
            },
          });

          if (requisitos?.length) {
            await tx.requisitoHabilidadRol.createMany({
              data: requisitos.map((req) => ({
                idRolProyecto: createdRol.idRolProyecto,
                idHabilidad: req.idHabilidad,
                ...(req.nivelMinimo !== undefined && { nivelMinimo: req.nivelMinimo }),
                ...(req.obligatorio !== undefined && { obligatorio: req.obligatorio }),
              })),
            });
          }
        }
      }

      return tx.proyecto.findUnique({
        where: { idProyecto: proyecto.idProyecto },
        select: proyectoDetalleSelect,
      });
    });
  }

  async update(id: number, data: UpdateProjectDto, userId: number) {
    const proyecto = await this._requireOwner(id, userId);
    if (!ESTADOS_EDITABLES.includes(proyecto.estadoProyecto)) {
      throw new BadRequestException(
        `Solo se puede editar un proyecto en estado ${ESTADOS_EDITABLES.join(' o ')}`,
      );
    }

    const {
      fechaInicio,
      fechaFinEstimada,
      organizacionesIds,
      roles,
      ...camposGenerales
    } = data;

    return this.prisma.$transaction(async (tx) => {
      await tx.proyecto.update({
        where: { idProyecto: id },
        data: {
          ...camposGenerales,
          fechaInicio: fechaInicio !== undefined ? new Date(fechaInicio) : undefined,
          fechaFinEstimada:
            fechaFinEstimada !== undefined ? new Date(fechaFinEstimada) : undefined,
          fechaActualizacion: new Date(),
        },
      });

      if (organizacionesIds !== undefined) {
        await tx.proyectoOrganizacion.deleteMany({ where: { idProyecto: id } });
        if (organizacionesIds.length > 0) {
          await tx.proyectoOrganizacion.createMany({
            data: organizacionesIds.map((idOrganizacion) => ({ idProyecto: id, idOrganizacion })),
          });
        }
      }

      if (roles !== undefined) {
        const rolesActuales = await tx.rolProyecto.findMany({
          where: { idProyecto: id },
          select: { idRolProyecto: true },
        });
        const idsRolesActuales = rolesActuales.map((r) => r.idRolProyecto);

        if (idsRolesActuales.length > 0) {
          await tx.requisitoHabilidadRol.deleteMany({
            where: { idRolProyecto: { in: idsRolesActuales } },
          });
        }

        await tx.rolProyecto.deleteMany({ where: { idProyecto: id } });

        if (roles.length > 0) {
          for (const rol of roles) {
            const nuevoRol = await tx.rolProyecto.create({
              data: {
                idProyecto: id,
                nombreRol: rol.nombreRol,
                descripcionRolProyecto: rol.descripcionRolProyecto,
                idCarreraRequerida: rol.idCarreraRequerida,
                cupos: rol.cupos,
                horasSemanalesEstimadas: rol.horasSemanalesEstimadas,
              },
            });
            if (rol.requisitos?.length) {
              await tx.requisitoHabilidadRol.createMany({
                data: rol.requisitos.map((req) => ({
                  idRolProyecto: nuevoRol.idRolProyecto,
                  idHabilidad: req.idHabilidad,
                  nivelMinimo: req.nivelMinimo,
                  obligatorio: req.obligatorio,
                })),
              });
            }
          }
        }
      }

      return tx.proyecto.findUnique({
        where: { idProyecto: id },
        select: { idProyecto: true, estadoProyecto: true, tituloProyecto: true, fechaActualizacion: true },
      });
    });
  }

  async submitForReview(id: number, userId: number) {
    const proyecto = await this._requireOwner(id, userId);
    if (proyecto.estadoProyecto !== EstadoProyecto.BORRADOR) {
      throw new BadRequestException(
        'Solo se puede enviar a revisión un proyecto en estado BORRADOR',
      );
    }
    const totalEnvios = await this.prisma.revisionProyecto.count({
      where: { idProyecto: id },
    });
    return this.prisma.$transaction(async (tx) => {
      await tx.proyecto.update({
        where: { idProyecto: id },
        data: { estadoProyecto: EstadoProyecto.EN_REVISION, fechaActualizacion: new Date() },
      });
      await this._crearRevisionPendiente(tx, id, totalEnvios + 1);
      await this.notifications.notifyAdmins(
        {
          tipoNotificacion: 'PROYECTO_EN_REVISION',
          tituloNotificacion: 'Proyecto enviado a revisión',
          mensajeNotificacion: `Se recibió un nuevo envío a revisión (round ${totalEnvios + 1}).`,
          datosJson: { idProyecto: id, numeroEnvio: totalEnvios + 1 },
        },
        tx,
      );
      return { idProyecto: id, estadoProyecto: EstadoProyecto.EN_REVISION };
    });
  }

  async resubmit(id: number, userId: number) {
    const proyecto = await this._requireOwner(id, userId);
    if (proyecto.estadoProyecto !== EstadoProyecto.OBSERVADO) {
      throw new BadRequestException(
        'Solo se puede reenviar un proyecto en estado OBSERVADO',
      );
    }
    const totalEnvios = await this.prisma.revisionProyecto.count({
      where: { idProyecto: id },
    });
    return this.prisma.$transaction(async (tx) => {
      await tx.proyecto.update({
        where: { idProyecto: id },
        data: { estadoProyecto: EstadoProyecto.EN_REVISION, fechaActualizacion: new Date() },
      });
      await this._crearRevisionPendiente(tx, id, totalEnvios + 1);
      await this.notifications.notifyAdmins(
        {
          tipoNotificacion: 'PROYECTO_EN_REVISION',
          tituloNotificacion: 'Proyecto reenviado a revisión',
          mensajeNotificacion: `El proyecto ${id} fue reenviado a revisión (round ${totalEnvios + 1}).`,
          datosJson: { idProyecto: id, numeroEnvio: totalEnvios + 1 },
        },
        tx,
      );
      return { idProyecto: id, estadoProyecto: EstadoProyecto.EN_REVISION, numeroEnvio: totalEnvios + 1 };
    });
  }

  async requestClose(id: number, userId: number) {
    const proyecto = await this._requireOwner(id, userId);
    if (proyecto.estadoProyecto !== EstadoProyecto.EN_PROGRESO) {
      throw new BadRequestException(
        'Solo se puede solicitar cierre para proyectos en estado EN_PROGRESO',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.proyecto.update({
        where: { idProyecto: id },
        data: {
          estadoProyecto: EstadoProyecto.EN_SOLICITUD_CIERRE,
          fechaActualizacion: new Date(),
        },
        select: { idProyecto: true, estadoProyecto: true, tituloProyecto: true },
      });
      await this.notifications.notifyAdmins(
        {
          tipoNotificacion: 'SOLICITUD_CIERRE_PROYECTO',
          tituloNotificacion: 'Solicitud de cierre de proyecto',
          mensajeNotificacion: `El líder solicitó cierre para "${actualizado.tituloProyecto}".`,
          datosJson: { idProyecto: id },
        },
        tx,
      );
      return actualizado;
    });
  }

  async approveClosure(id: number, adminId: number) {
    await this._requireAdmin(adminId);
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { idProyecto: id },
      select: { idProyecto: true, tituloProyecto: true, estadoProyecto: true, creadoPor: true },
    });
    if (!proyecto) throw new NotFoundException(`Proyecto con id ${id} no encontrado`);
    if (proyecto.estadoProyecto !== EstadoProyecto.EN_SOLICITUD_CIERRE) {
      throw new BadRequestException(
        'Solo se puede aprobar cierre de proyectos en estado EN_SOLICITUD_CIERRE',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const ahora = new Date();
      await tx.proyecto.update({
        where: { idProyecto: id },
        data: {
          estadoProyecto: EstadoProyecto.CANCELADO,
          eliminadoEn: ahora,
          fechaActualizacion: ahora,
        },
      });
      await tx.participacionProyecto.updateMany({
        where: { estadoParticipacion: 'ACTIVO', rolProyecto: { idProyecto: id } },
        data: { estadoParticipacion: 'RETIRADO', fechaSalida: ahora },
      });
      await tx.postulacion.updateMany({
        where: { estadoPostulacion: 'PENDIENTE', rolProyecto: { idProyecto: id } },
        data: {
          estadoPostulacion: 'RECHAZADA',
          comentarioResolucion: 'Cierre administrativo del proyecto aprobado',
          resueltaPor: adminId,
          fechaResolucion: ahora,
        },
      });
      const participantes = await tx.participacionProyecto.findMany({
        where: { estadoParticipacion: 'RETIRADO', rolProyecto: { idProyecto: id } },
        distinct: ['idUsuario'],
        select: { idUsuario: true },
      });
      const destinatarios = Array.from(
        new Set([proyecto.creadoPor, ...participantes.map((p) => p.idUsuario)]),
      );
      await this.notifications.notifyUsers(
        destinatarios,
        {
          tipoNotificacion: 'CIERRE_APROBADO',
          tituloNotificacion: 'Cierre de proyecto aprobado',
          mensajeNotificacion: `El cierre administrativo de "${proyecto.tituloProyecto}" fue aprobado.`,
          datosJson: { idProyecto: id },
        },
        tx,
      );
      return { idProyecto: id, estadoProyecto: EstadoProyecto.CANCELADO };
    });
  }

  async rejectClosure(id: number, adminId: number) {
    await this._requireAdmin(adminId);
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { idProyecto: id },
      select: { idProyecto: true, tituloProyecto: true, estadoProyecto: true, creadoPor: true },
    });
    if (!proyecto) throw new NotFoundException(`Proyecto con id ${id} no encontrado`);
    if (proyecto.estadoProyecto !== EstadoProyecto.EN_SOLICITUD_CIERRE) {
      throw new BadRequestException(
        'Solo se puede rechazar cierre de proyectos en estado EN_SOLICITUD_CIERRE',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.proyecto.update({
        where: { idProyecto: id },
        data: {
          estadoProyecto: EstadoProyecto.EN_PROGRESO,
          fechaActualizacion: new Date(),
        },
      });
      await this.notifications.notifyUsers(
        [proyecto.creadoPor],
        {
          tipoNotificacion: 'CIERRE_RECHAZADO',
          tituloNotificacion: 'Cierre de proyecto rechazado',
          mensajeNotificacion: `La solicitud de cierre de "${proyecto.tituloProyecto}" fue rechazada.`,
          datosJson: { idProyecto: id },
        },
        tx,
      );
      return { idProyecto: id, estadoProyecto: EstadoProyecto.EN_PROGRESO };
    });
  }

  private async _requireOwner(idProyecto: number, userId: number) {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto, eliminadoEn: null },
      select: { idProyecto: true, estadoProyecto: true, creadoPor: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${idProyecto} no encontrado`);
    }
    if (proyecto.creadoPor !== userId) {
      throw new ForbiddenException('No eres el líder de este proyecto');
    }
    return proyecto;
  }

  private async _requireAdmin(userId: number) {
    const esAdmin = await this.notifications.isAdmin(userId);
    if (!esAdmin) {
      throw new ForbiddenException('Se requieren permisos de administrador');
    }
  }

  private async _crearRevisionPendiente(
    tx: Prisma.TransactionClient,
    idProyecto: number,
    numeroEnvio: number,
  ) {
    const existente = await tx.revisionProyecto.findFirst({
      where: { idProyecto, estadoRevision: 'PENDIENTE' },
    });
    if (existente) {
      throw new BadRequestException('Ya existe una revisión pendiente para este proyecto');
    }
    return tx.revisionProyecto.create({
      data: { idProyecto, numeroEnvio, estadoRevision: 'PENDIENTE' },
    });
  }
}