import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateProjectFullDto } from './dto/create-project-full.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateHitoDto } from './dto/create-hito.dto';
import {
  EstadoProyectoCreador,
  TRANSICIONES_PERMITIDAS,
} from './dto/update-estado-proyecto.dto';
import { EstadoHito, EstadoProyecto, EstadoSprint, ModalidadProyecto, Prisma, TipoProyecto } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { calcularProgresoHito } from '../common/hito-progreso';

const FEATURED_CACHE_KEY = 'projects:featured';
const FEATURED_CACHE_TTL = 300_000;

const ESTADOS_VISIBLES: EstadoProyecto[] = [
  EstadoProyecto.PUBLICADO,
  EstadoProyecto.EN_PROGRESO,
];

const ESTADOS_EDITABLES: EstadoProyecto[] = [
  EstadoProyecto.BORRADOR,
  EstadoProyecto.OBSERVADO,
];

// Un proyecto ya publicado / en progreso admite edición PARCIAL: solo un
// subconjunto seguro de campos, mediante una lista explícita (nunca el DTO
// completo de creación). No cambia estado, revisión, postulaciones, roles,
// organizaciones, participantes, tareas, hitos, comentarios ni notificaciones.
const ESTADOS_EDITABLE_PARCIAL: EstadoProyecto[] = [
  EstadoProyecto.PUBLICADO,
  EstadoProyecto.EN_PROGRESO,
];

function calcularAvanceTareas(tareas: { estadoTarea: string }[]) {
  const total = tareas.length;
  const hecho = tareas.filter((t) => t.estadoTarea === 'HECHO').length;
  const porHacer = tareas.filter((t) => t.estadoTarea === 'POR_HACER').length;
  const enProgreso = total - hecho - porHacer;

  return {
    porcentaje: total === 0 ? 0 : Math.round((hecho / total) * 100),
    total,
    porHacer,
    enProgreso,
    hecho,
  };
}

/**
 * El estado de un hito, históricamente, NUNCA se leía de `Hito.estadoHito`:
 * esa columna se fijaba en PENDIENTE al crear el hito (createHito) y ningún
 * flujo la volvía a escribir, así que quedaba congelada aunque se
 * completaran todas sus tareas (bug de cálculo de la barra de progreso de
 * hitos). A12 corrige la persistencia (ver `TasksService` — sincroniza
 * `Hito.estadoHito` en los write-paths reales de `estadoTarea`), pero este
 * agregado de PROYECTO sigue derivando en memoria a partir de las tareas
 * (`tarea.idHito`), nunca de la columna persistida: es un GET puro, no debe
 * depender de que la sincronización ya haya corrido. La fórmula por-Hito
 * (% = hechas/total; COMPLETADO al 100% con al menos una tarea, EN_PROGRESO
 * si %>0, PENDIENTE en otro caso, incluye hitos sin tareas) es la misma
 * semántica canónica de `calcularProgresoHito` (src/common/hito-progreso.ts,
 * A12) — única fuente de verdad, reutilizada aquí en vez de duplicada.
 */
function calcularAvanceHitos(
  hitos: { idHito: number }[],
  tareas: { idHito: number | null; estadoTarea: string }[],
) {
  const total = hitos.length;
  let completado = 0;
  let pendiente = 0;
  let enProgreso = 0;

  for (const hito of hitos) {
    const tareasHito = tareas.filter((t) => t.idHito === hito.idHito);
    const { estadoHito } = calcularProgresoHito(tareasHito);

    if (estadoHito === EstadoHito.COMPLETADO) {
      completado += 1;
    } else if (estadoHito === EstadoHito.EN_PROGRESO) {
      enProgreso += 1;
    } else {
      pendiente += 1;
    }
  }

  return {
    porcentaje: total === 0 ? 0 : Math.round((completado / total) * 100),
    total,
    pendiente,
    enProgreso,
    completado,
  };
}

/**
 * Hito.fechaLimite es @db.Date: se lee/escribe igual que Tarea.fechaLimite
 * en TasksService (mismo comportamiento verificado de Prisma con columnas
 * @db.Date), anclando siempre a medianoche UTC del día calendario y
 * extrayendo con toISOString() para no depender de la zona horaria del proceso.
 */
function toDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** % de avance del proyecto, desglosado por hitos y por tareas. */
function calcularAvanceProyecto(
  tareas: { estadoTarea: string; idHito: number | null }[],
  hitos: { idHito: number }[],
) {
  return {
    tareas: calcularAvanceTareas(tareas),
    hitos: calcularAvanceHitos(hitos, tareas),
  };
}

const proyectoListSelect = {
  idProyecto: true,
  tituloProyecto: true,
  descripcionProyecto: true,
  tipoProyecto: true,
  estadoProyecto: true,
  modalidadProyecto: true,
  fechaPublicacion: true,
  creador: {
    select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true },
  },
  organizaciones: {
    select: {
      organizacion: { select: { nombreOrganizacion: true } },
    },
  },
  intereses: {
    select: { interes: { select: { nombreInteres: true } } },
  },
  // Solo `cupos` por rol: lo mínimo para que el listado calcule roles con
  // disponibilidad real (cupos > 0) sin exponer requisitos/postulaciones.
  roles: { select: { cupos: true } },
  _count: { select: { roles: true } },
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
  fechaActualizacion: true,
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
      _count: {
        select: { comentarios: { where: { eliminadoEn: null } } },
      },
    },
    orderBy: { idTarea: 'asc' as const },
  },
} as const;

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  private _buildListConditions(filters: {
    q?: string;
    tipoProyecto?: string;
    modalidad?: string;
    organizacionId?: number;
    habilidadId?: number;
  }): Prisma.ProyectoWhereInput[] {
    const { q, tipoProyecto, modalidad, organizacionId, habilidadId } = filters;
    const andConditions: Prisma.ProyectoWhereInput[] = [
      { estadoProyecto: { in: ESTADOS_VISIBLES } },
      { eliminadoEn: null },
    ];
    if (q && q.trim().length > 0) {
      andConditions.push({ tituloProyecto: { contains: q.trim(), mode: 'insensitive' } });
    }
    if (tipoProyecto) {
      andConditions.push({ tipoProyecto: tipoProyecto as TipoProyecto });
    }
    if (modalidad) {
      andConditions.push({ modalidadProyecto: modalidad as ModalidadProyecto });
    }
    if (organizacionId) {
      andConditions.push({ organizaciones: { some: { idOrganizacion: organizacionId } } });
    }
    if (habilidadId) {
      andConditions.push({
        roles: { some: { requisitos: { some: { idHabilidad: habilidadId } } } },
      });
    }
    return andConditions;
  }

  async findAll(filters: {
    q?: string;
    tipoProyecto?: string;
    modalidad?: string;
    organizacionId?: number;
    habilidadId?: number;
  } = {}) {
    const andConditions = this._buildListConditions(filters);
    return this.prisma.proyecto.findMany({
      where: { AND: andConditions },
      select: proyectoListSelect,
      orderBy: { fechaCreacion: 'desc' },
      take: 20,
    });
  }

  async findAllPaginated(filters: {
    q?: string;
    tipoProyecto?: string;
    modalidad?: string;
    organizacionId?: number;
    habilidadId?: number;
    page: number;
    limit: number;
  }) {
    const { page, limit } = filters;
    const skip = (page - 1) * limit;
    const andConditions = this._buildListConditions(filters);

    const [data, total] = await Promise.all([
      this.prisma.proyecto.findMany({
        where: { AND: andConditions },
        select: proyectoListSelect,
        orderBy: { fechaCreacion: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.proyecto.count({ where: { AND: andConditions } }),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
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

  async findOneAdmin(id: number, adminId: number) {
    const isAdmin = await this.notifications.isAdmin(adminId);
    if (!isAdmin) {
      throw new ForbiddenException('Se requieren permisos de administrador');
    }
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto: id, eliminadoEn: null },
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
      select: {
        ...proyectoDetalleSelect,
        revisiones: {
          select: {
            idRevisionProyecto: true,
            estadoRevision: true,
            comentarioRevision: true,
            numeroEnvio: true,
            enviadaEn: true,
            revisadaEn: true,
          },
          orderBy: { enviadaEn: 'desc' as const },
          take: 1,
        },
      },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${id} no encontrado`);
    }
    if (proyecto.creadoPor !== userId) {
      throw new ForbiddenException('No tienes acceso a este proyecto');
    }
    return proyecto;
  }

  /**
   * % de avance del proyecto (por hitos y por tareas). Solo visible para el
   * líder del proyecto o un participante activo — nadie más puede consultarlo.
   */
  async getAvance(id: number, userId: number) {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto: id, eliminadoEn: null },
      select: {
        creadoPor: true,
        // eliminadoEn: null — las tareas con soft delete (Tarea 22) no deben
        // contarse ni en el numerador ni en el denominador del avance.
        tareas: { where: { eliminadoEn: null }, select: { estadoTarea: true, idHito: true } },
        hitos: { select: { idHito: true } },
      },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${id} no encontrado`);
    }

    const esLider = proyecto.creadoPor === userId;
    const esMiembro = esLider || (await this.esParticipanteActivo(id, userId));
    if (!esMiembro) {
      throw new ForbiddenException(
        'Solo el líder o los miembros del proyecto pueden ver el avance',
      );
    }

    return calcularAvanceProyecto(proyecto.tareas, proyecto.hitos);
  }

  private async esParticipanteActivo(idProyecto: number, userId: number): Promise<boolean> {
    const participacion = await this.prisma.participacionProyecto.findFirst({
      where: {
        idUsuario: userId,
        estadoParticipacion: 'ACTIVO',
        rolProyecto: { idProyecto },
      },
      select: { idParticipacion: true },
    });
    return !!participacion;
  }

  async findMine(userId: number) {
    const proyectos = await this.prisma.proyecto.findMany({
      where: { creadoPor: userId, eliminadoEn: null },
      select: {
        ...proyectoListSelect,
        fechaCreacion: true,
        fechaActualizacion: true,
        roles: {
          select: {
            idRolProyecto: true,
            _count: {
              select: {
                postulaciones: true,
                participaciones: true,
              },
            },
          },
        },
        // eliminadoEn: null — misma exclusión que en getAvance: una tarea con
        // soft delete no debe contarse en avanceProyecto.
        tareas: { where: { eliminadoEn: null }, select: { estadoTarea: true, idHito: true } },
        hitos: { select: { idHito: true } },
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

    return proyectos.map((proyecto) => {
      const cantidadPostulaciones = proyecto.roles.reduce(
        (acc, rol) => acc + rol._count.postulaciones,
        0,
      );

      const rolesCubiertos = proyecto.roles.filter(
        (rol) => rol._count.participaciones > 0,
      ).length;

      return {
        ...proyecto,
        roles: proyecto.roles.map((rol) => ({ idRolProyecto: rol.idRolProyecto })),
        tareas: undefined,
        hitos: undefined,
        cantidadPostulaciones,
        rolesCubiertos,
        rolesTotales: proyecto.roles.length,
        avanceProyecto: calcularAvanceProyecto(proyecto.tareas ?? [], proyecto.hitos ?? []),
      };
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

  async findFeatured() {
    const cached = await this.cacheManager.get<Record<string, unknown>[]>(FEATURED_CACHE_KEY).catch(() => null);
    if (cached) return cached;

    const proyectos = await this.prisma.proyecto.findMany({
      where: {
        estadoProyecto: { in: ESTADOS_VISIBLES },
        eliminadoEn: null,
      },
      select: {
        ...proyectoListSelect,
        roles: { select: { _count: { select: { postulaciones: true } } } },
      },
    });

    const destacados = proyectos
      .map(({ roles, ...p }) => ({
        ...p,
        totalPostulaciones: roles.reduce((sum, r) => sum + r._count.postulaciones, 0),
      }))
      .sort((a, b) => b.totalPostulaciones - a.totalPostulaciones)
      .slice(0, 6)
      .map(({ totalPostulaciones: _totalPostulaciones, ...p }) => p);

    await this.cacheManager.set(FEATURED_CACHE_KEY, destacados, FEATURED_CACHE_TTL).catch(() => {});
    return destacados;
  }

  private async _invalidateFeaturedCache(): Promise<void> {
    await this.cacheManager.del(FEATURED_CACHE_KEY).catch(() => {});
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
        const snapshot = await this._buildProjectSnapshot(tx, proyecto.idProyecto);
        await this._crearRevisionPendiente(tx, proyecto.idProyecto, 1, snapshot);
        await this.notifications.notifyAdminsFromTemplate(
          'PROYECTO_EN_REVISION',
          {
            projectTitle: proyecto.tituloProyecto,
            projectId: proyecto.idProyecto,
            numeroEnvio: 1,
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

    // Edición parcial (proyecto ya publicado / en progreso): solo el
    // subconjunto seguro de campos; conserva estado, roles, organizaciones,
    // participantes, tareas, hitos, comentarios, notificaciones y revisiones.
    if (ESTADOS_EDITABLE_PARCIAL.includes(proyecto.estadoProyecto)) {
      return this._updateParcial(id, data);
    }

    if (!ESTADOS_EDITABLES.includes(proyecto.estadoProyecto)) {
      throw new BadRequestException(
        `Solo se puede editar un proyecto en estado ${[...ESTADOS_EDITABLES, ...ESTADOS_EDITABLE_PARCIAL].join(', ')}`,
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

  /**
   * Edición parcial de un proyecto PUBLICADO / EN_PROGRESO: lista blanca
   * explícita de campos (título, descripción, objetivos, fecha final estimada,
   * ubicación, contexto académico, URL de recurso). Cualquier campo bloqueado
   * enviado manualmente (tipo, modalidad, fecha de inicio, organizaciones,
   * roles) se rechaza con 400. No cambia el estado ni toca roles,
   * organizaciones, participantes, tareas, hitos, comentarios, notificaciones
   * ni revisiones.
   */
  private async _updateParcial(id: number, data: UpdateProjectDto) {
    const bloqueados: string[] = [];
    if (data.tipoProyecto !== undefined) bloqueados.push('tipo de proyecto');
    if (data.modalidadProyecto !== undefined) bloqueados.push('modalidad');
    if (data.fechaInicio !== undefined) bloqueados.push('fecha de inicio');
    if (data.organizacionesIds !== undefined) bloqueados.push('organizaciones');
    if (data.roles !== undefined) bloqueados.push('roles');
    if (bloqueados.length > 0) {
      throw new BadRequestException(
        `En un proyecto publicado o en progreso no puedes editar: ${bloqueados.join(', ')}. Los roles se gestionan desde el panel de roles.`,
      );
    }

    // Lista blanca explícita: nunca se aplica el DTO completo de creación.
    const updateData: Prisma.ProyectoUpdateInput = { fechaActualizacion: new Date() };
    if (data.tituloProyecto !== undefined) updateData.tituloProyecto = data.tituloProyecto;
    if (data.descripcionProyecto !== undefined) updateData.descripcionProyecto = data.descripcionProyecto;
    if (data.objetivosProyecto !== undefined) updateData.objetivosProyecto = data.objetivosProyecto;
    if (data.ubicacionProyecto !== undefined) updateData.ubicacionProyecto = data.ubicacionProyecto;
    if (data.contextoAcademico !== undefined) updateData.contextoAcademico = data.contextoAcademico;
    if (data.urlRecursoExterno !== undefined) updateData.urlRecursoExterno = data.urlRecursoExterno;
    if (data.fechaFinEstimada !== undefined) {
      updateData.fechaFinEstimada = new Date(data.fechaFinEstimada);
    }

    await this.prisma.proyecto.update({ where: { idProyecto: id }, data: updateData });

    return this.prisma.proyecto.findUnique({
      where: { idProyecto: id },
      select: { idProyecto: true, estadoProyecto: true, tituloProyecto: true, fechaActualizacion: true },
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
      const snapshot = await this._buildProjectSnapshot(tx, id);
      await tx.proyecto.update({
        where: { idProyecto: id },
        data: { estadoProyecto: EstadoProyecto.EN_REVISION, fechaActualizacion: new Date() },
      });
      await this._crearRevisionPendiente(tx, id, totalEnvios + 1, snapshot);
      await this.notifications.notifyAdminsFromTemplate(
        'PROYECTO_EN_REVISION',
        {
          projectTitle: proyecto.tituloProyecto,
          projectId: id,
          numeroEnvio: totalEnvios + 1,
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
      const snapshot = await this._buildProjectSnapshot(tx, id);
      await tx.proyecto.update({
        where: { idProyecto: id },
        data: { estadoProyecto: EstadoProyecto.EN_REVISION, fechaActualizacion: new Date() },
      });
      await this._crearRevisionPendiente(tx, id, totalEnvios + 1, snapshot);
      await this.notifications.notifyAdminsFromTemplate(
        'PROYECTO_EN_REVISION',
        {
          projectTitle: proyecto.tituloProyecto,
          projectId: id,
          numeroEnvio: totalEnvios + 1,
          isResubmission: true,
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
    await this.assertNoOperableSprint(id);
    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.proyecto.update({
        where: { idProyecto: id },
        data: {
          estadoProyecto: EstadoProyecto.EN_SOLICITUD_CIERRE,
          fechaActualizacion: new Date(),
        },
        select: { idProyecto: true, estadoProyecto: true, tituloProyecto: true },
      });
      await this.notifications.notifyAdminsFromTemplate(
        'SOLICITUD_CIERRE_PROYECTO',
        {
          projectTitle: actualizado.tituloProyecto,
          projectId: id,
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
      await this.notifications.notifyFromTemplate(
        destinatarios,
        'CIERRE_APROBADO',
        {
          projectTitle: proyecto.tituloProyecto,
          projectId: id,
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
      await this.notifications.notifyFromTemplate(
        [proyecto.creadoPor],
        'CIERRE_RECHAZADO',
        {
          projectTitle: proyecto.tituloProyecto,
          projectId: id,
        },
        tx,
      );
      return { idProyecto: id, estadoProyecto: EstadoProyecto.EN_PROGRESO };
    });
  }

  async changeEstado(
    id: number,
    userId: number,
    nuevoEstado: EstadoProyectoCreador,
  ) {
    const proyecto = await this._requireOwner(id, userId);
    const permitidos = TRANSICIONES_PERMITIDAS[proyecto.estadoProyecto] ?? [];
    if (!permitidos.includes(nuevoEstado as EstadoProyecto)) {
      throw new BadRequestException(
        `Transición no permitida: ${proyecto.estadoProyecto} -> ${nuevoEstado}`,
      );
    }
    // A11 / Decisión Bloqueante #2: esta es la transición real que persiste
    // EstadoProyecto.CERRADO (EN_PROGRESO -> CERRADO, vía
    // TRANSICIONES_PERMITIDAS) — no `approveClosure`, que en el flujo
    // administrativo actual persiste CANCELADO, no CERRADO. La invariante
    // "Proyecto=CERRADO con Sprint operable" se protege aquí.
    if (nuevoEstado === EstadoProyectoCreador.CERRADO) {
      await this.assertNoOperableSprint(id);
    }
    const estadoAnterior = proyecto.estadoProyecto;

    const actualizado = await this.prisma.proyecto.update({
      where: { idProyecto: id },
      data: {
        estadoProyecto: nuevoEstado as EstadoProyecto,
        fechaActualizacion: new Date(),
        ...(nuevoEstado === EstadoProyectoCreador.PUBLICADO && {
          fechaPublicacion: new Date(),
        }),
      },
      select: { idProyecto: true, estadoProyecto: true, tituloProyecto: true },
    });

    const templateData = {
      projectTitle: actualizado.tituloProyecto,
      projectId: actualizado.idProyecto,
      oldStatus: estadoAnterior,
      newStatus: actualizado.estadoProyecto,
    } as const;

    await this.notifications.notifyFromTemplate(
      [proyecto.creadoPor],
      'CAMBIO_ESTADO_PROYECTO',
      templateData,
    );

    if (
      nuevoEstado === EstadoProyectoCreador.PUBLICADO ||
      nuevoEstado === EstadoProyectoCreador.EN_PROGRESO ||
      nuevoEstado === EstadoProyectoCreador.CERRADO
    ) {
      const participaciones = await this.prisma.participacionProyecto.findMany({
        where: {
          estadoParticipacion: 'ACTIVO',
          idUsuario: { notIn: [userId, proyecto.creadoPor] },
          rolProyecto: { idProyecto: id },
        },
        distinct: ['idUsuario'],
        select: { idUsuario: true },
      });
      const destinatarios = participaciones.map((p) => p.idUsuario);
      if (destinatarios.length) {
        await this.notifications.notifyFromTemplate(
          destinatarios,
          'CAMBIO_ESTADO_PROYECTO',
          templateData,
        );
      }
    }

    if (nuevoEstado === EstadoProyectoCreador.PUBLICADO) {
      await this.notifications.notifyFromTemplate(
        [proyecto.creadoPor],
        'PROYECTO_PUBLICADO',
        {
          projectTitle: actualizado.tituloProyecto,
          projectId: actualizado.idProyecto,
        },
      );
    }

    if (
      nuevoEstado === EstadoProyectoCreador.PUBLICADO ||
      estadoAnterior === EstadoProyecto.PUBLICADO
    ) {
      await this._invalidateFeaturedCache();
    }

    return actualizado;
  }

  private async _requireOwner(idProyecto: number, userId: number) {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto, eliminadoEn: null },
      select: { idProyecto: true, estadoProyecto: true, creadoPor: true, tituloProyecto: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${idProyecto} no encontrado`);
    }
    if (proyecto.creadoPor !== userId) {
      throw new ForbiddenException('No eres el líder de este proyecto');
    }
    return proyecto;
  }

  /**
   * A11 — Decisión Bloqueante #2 (congelada): un Proyecto no puede avanzar
   * hacia su cierre mientras exista un Sprint operable (ACTIVO o
   * EN_FINALIZACION) en ese proyecto. CERRADO nunca bloquea — Foundation ya
   * establece esa misma semántica de "operable" para el índice parcial
   * `sprint_operable_unique` (sprints/sprints-context.service.ts,
   * getCurrentSprint). Consulta mínima: solo existencia, acotada por
   * idProyecto — no carga tareas, horas, participantes ni histórico. No
   * cierra, finaliza ni crea ningún Sprint; únicamente rechaza la
   * transición del Proyecto si corresponde.
   */
  private async assertNoOperableSprint(idProyecto: number): Promise<void> {
    const sprintOperable = await this.prisma.sprint.findFirst({
      where: {
        idProyecto,
        estado: { in: [EstadoSprint.ACTIVO, EstadoSprint.EN_FINALIZACION] },
      },
      select: { idSprint: true },
    });
    if (sprintOperable) {
      throw new ConflictException(
        'Debes cerrar el Sprint actual antes de solicitar el cierre del proyecto',
      );
    }
  }

  private async _requireAdmin(userId: number) {
    const esAdmin = await this.notifications.isAdmin(userId);
    if (!esAdmin) {
      throw new ForbiddenException('Se requieren permisos de administrador');
    }
  }

  async findPostulacionesByProject(idProyecto: number, userId: number) {
    await this._requireOwner(idProyecto, userId);

    return this.prisma.postulacion.findMany({
      where: {
        rolProyecto: { idProyecto },
      },
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
          select: {
            idRolProyecto: true,
            nombreRol: true,
          },
        },
      },
      orderBy: { fechaPostulacion: 'desc' },
    });
  }

  /**
   * Crea un hito; exclusivo del líder del proyecto (mismo chequeo que el
   * resto de mutaciones sobre el proyecto: _requireOwner). estadoHito se fija
   * siempre en PENDIENTE (no es configurable desde el cliente) y `orden` se
   * calcula server-side dentro de la misma transacción como
   * (máximo orden existente para el proyecto) + 1, para no depender de un
   * valor enviado por el cliente que podría colisionar con hitos existentes.
   */
  async createHito(idProyecto: number, userId: number, dto: CreateHitoDto) {
    await this._requireOwner(idProyecto, userId);

    const hito = await this.prisma.$transaction(async (tx) => {
      const ultimo = await tx.hito.findFirst({
        where: { idProyecto },
        orderBy: { orden: 'desc' },
        select: { orden: true },
      });
      const nuevoOrden = (ultimo?.orden ?? 0) + 1;

      return tx.hito.create({
        data: {
          idProyecto,
          tituloHito: dto.tituloHito,
          descripcionHito: dto.descripcionHito ?? null,
          fechaLimite: dto.fechaLimite ? new Date(`${dto.fechaLimite}T00:00:00.000Z`) : null,
          estadoHito: EstadoHito.PENDIENTE,
          orden: nuevoOrden,
        },
        select: {
          idHito: true,
          tituloHito: true,
          descripcionHito: true,
          fechaLimite: true,
          estadoHito: true,
          orden: true,
        },
      });
    });

    return { ...hito, fechaLimite: toDateOnly(hito.fechaLimite) };
  }

  async delete(id: number, userId: number) {
    await this._requireOwner(id, userId);

    const proyecto = await this.prisma.proyecto.findUnique({
      where: { idProyecto: id },
      select: { estadoProyecto: true },
    });

    if (!proyecto) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    const estadosEliminables: EstadoProyecto[] = [
      EstadoProyecto.BORRADOR,
      EstadoProyecto.OBSERVADO,
    ];
    if (!estadosEliminables.includes(proyecto.estadoProyecto)) {
      throw new BadRequestException('Solo se pueden eliminar proyectos en estado BORRADOR u OBSERVADO');
    }

    await this.prisma.proyecto.update({
      where: { idProyecto: id },
      data: { eliminadoEn: new Date() },
    });

    return { mensaje: 'Proyecto eliminado correctamente' };
  }

  private async _buildProjectSnapshot(tx: Prisma.TransactionClient, idProyecto: number) {
    return tx.proyecto.findUnique({
      where: { idProyecto },
      select: {
        tituloProyecto: true,
        descripcionProyecto: true,
        objetivosProyecto: true,
        tipoProyecto: true,
        modalidadProyecto: true,
        ubicacionProyecto: true,
        contextoAcademico: true,
        urlRecursoExterno: true,
        fechaInicio: true,
        fechaFinEstimada: true,
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
                  select: { idHabilidad: true, nombreHabilidad: true, categoriaHabilidad: true },
                },
              },
            },
          },
        },
      },
    });
  }

  private async _crearRevisionPendiente(
    tx: Prisma.TransactionClient,
    idProyecto: number,
    numeroEnvio: number,
    snapshot?: object | null,
  ) {
    const existente = await tx.revisionProyecto.findFirst({
      where: { idProyecto, estadoRevision: 'PENDIENTE' },
    });
    if (existente) {
      throw new BadRequestException('Ya existe una revisión pendiente para este proyecto');
    }
    return tx.revisionProyecto.create({
      data: {
        idProyecto,
        numeroEnvio,
        estadoRevision: 'PENDIENTE',
        ...(snapshot ? { snapshotProyecto: snapshot as Prisma.InputJsonValue } : {}),
      },
    });
  }
}
