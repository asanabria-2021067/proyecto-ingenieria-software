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
import { EstadoHito, EstadoProyecto, ModalidadProyecto, Prisma, TipoProyecto } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { TeamSummaryMemberDto, TeamSummaryRoleDto } from './dto/team-summary-member.dto';
import { TeamSummaryResponseDto } from './dto/team-summary-response.dto';

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
 * El estado de un hito NUNCA se lee de `Hito.estadoHito`: esa columna se fija
 * en PENDIENTE al crear el hito (createHito) y ningún flujo la vuelve a
 * escribir, así que quedaba congelada aunque se completaran todas sus tareas
 * (bug de cálculo de la barra de progreso de hitos). El estado real se deriva
 * de las tareas asociadas (`tarea.idHito`), con el mismo criterio que ya usa
 * el frontend en `calcularStats` (hitos-section.tsx): % = hechas/total de sus
 * tareas; COMPLETADO al 100% con al menos una tarea, EN_PROGRESO si %>0,
 * PENDIENTE en otro caso (incluye hitos sin tareas asociadas).
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
    const totalTareas = tareasHito.length;
    const hechoTareas = tareasHito.filter((t) => t.estadoTarea === 'HECHO').length;
    const porcentajeHito = totalTareas === 0 ? 0 : Math.round((hechoTareas / totalTareas) * 100);

    if (porcentajeHito === 100 && totalTareas > 0) {
      completado += 1;
    } else if (porcentajeHito > 0) {
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

  async findTeam(id: number) {
    return this.prisma.participacionProyecto.findMany({
      where: {
        rolProyecto: { idProyecto: id },
        estadoParticipacion: 'ACTIVO',
      },
      select: {
        idParticipacion: true,
        estadoParticipacion: true,
        fechaIngreso: true,
        usuario: {
          select: {
            idUsuario: true,
            nombre: true,
            apellido: true,
            correo: true,
            fotoUrl: true,
          },
        },
        rolProyecto: {
          select: {
            idRolProyecto: true,
            nombreRol: true,
            descripcionRolProyecto: true,
          },
        },
      },
      orderBy: {
        fechaIngreso: 'asc',
      },
    });
  }

  /**
   * Mismo motivo documentado en tasks.service.ts#toDateOnly: las columnas
   * @db.Date se leen como Date a medianoche UTC del día calendario
   * almacenado, y toISOString() es la única extracción segura (los getters
   * locales pueden desplazar el día según la zona horaria del proceso).
   */
  private toDateOnly(value: Date | null): string | null {
    return value ? value.toISOString().slice(0, 10) : null;
  }

  /**
   * Detalle de un integrante dentro de un proyecto: participación(es),
   * historial completo de tareas con asignación (activa o pasada) y horas
   * por tarea. Exclusivo del líder (_requireOwner, igual que el resto de
   * lecturas administrativas del proyecto) — "guard de membresía y
   * liderazgo": liderazgo de quien consulta, membresía de idUsuario.
   */
  async findTeamMemberDetail(idProyecto: number, idUsuario: number, userId: number) {
    await this._requireOwner(idProyecto, userId);

    // Todas las participaciones del usuario en el proyecto (activas e
    // históricas), no solo la ACTIVO: el detalle debe reflejar también a
    // quien ya se retiró. El usuario viaja embebido en la misma consulta
    // para no necesitar una segunda ida a la base de datos.
    const participaciones = await this.prisma.participacionProyecto.findMany({
      where: { idUsuario, rolProyecto: { idProyecto } },
      select: {
        idParticipacion: true,
        estadoParticipacion: true,
        fechaIngreso: true,
        fechaSalida: true,
        rolProyecto: { select: { idRolProyecto: true, nombreRol: true } },
        usuario: {
          select: { idUsuario: true, nombre: true, apellido: true, correo: true, fotoUrl: true },
        },
      },
      orderBy: { fechaIngreso: 'desc' },
    });

    if (participaciones.length === 0) {
      throw new NotFoundException(
        `El usuario con id ${idUsuario} no es integrante del proyecto ${idProyecto}`,
      );
    }

    // Historial de tareas: cualquier tarea del proyecto donde el usuario
    // tuvo alguna vez una AsignacionTarea (activa o cerrada), no solo la
    // asignación vigente. Se traen TODOS sus tramos sobre esa tarea (sin
    // take: 1): el mismo usuario puede haber sido desasignado y reasignado a
    // la misma tarea más de una vez, y cada tramo tiene su propio
    // horasReales — nunca un total agregado de la tarea entre usuarios
    // distintos (cada usuario sigue viendo únicamente sus propios tramos,
    // no los de otros usuarios que también trabajaron la misma tarea en
    // otro momento).
    const tareas = await this.prisma.tarea.findMany({
      where: {
        idProyecto,
        eliminadoEn: null,
        asignaciones: { some: { idUsuario } },
      },
      select: {
        idTarea: true,
        tituloTarea: true,
        estadoTarea: true,
        prioridad: true,
        fechaCreacion: true,
        fechaLimite: true,
        actualizadaEn: true,
        tiempoEstimadoHoras: true,
        asignaciones: {
          where: { idUsuario },
          orderBy: { fechaAsignacion: 'desc' },
          select: { fechaAsignacion: true, desasignadaEn: true, horasReales: true },
        },
      },
      orderBy: { fechaCreacion: 'desc' },
    });

    return {
      usuario: participaciones[0].usuario,
      participaciones: participaciones.map((p) => ({
        idParticipacion: p.idParticipacion,
        estadoParticipacion: p.estadoParticipacion,
        fechaIngreso: this.toDateOnly(p.fechaIngreso),
        fechaSalida: this.toDateOnly(p.fechaSalida),
        rolProyecto: p.rolProyecto,
      })),
      tareas: tareas.map((t) => {
        // Más reciente primero (orderBy: fechaAsignacion desc ya aplicado en
        // la consulta): fechaAsignacion/desasignadaEn mostradas son las del
        // tramo vigente o, si no hay uno vigente, el último cerrado.
        const asignacionMasReciente = t.asignaciones[0];

        // horasReales es la SUMA de TODOS los tramos de idUsuario sobre esta
        // tarea (puede haber sido desasignado y reasignado más de una vez),
        // nunca solo el del tramo más reciente — de lo contrario se pierden
        // silenciosamente las horas de tramos anteriores. null únicamente
        // cuando ningún tramo reportó horas; un tramo sin horas no descarta
        // las horas sí reportadas en otro tramo.
        const horasPorTramo = t.asignaciones
          .map((a) => a.horasReales)
          .filter((h): h is NonNullable<typeof h> => h !== null);
        const horasReales =
          horasPorTramo.length === 0
            ? null
            : horasPorTramo.reduce((total, h) => total + h.toNumber(), 0);

        return {
          idTarea: t.idTarea,
          tituloTarea: t.tituloTarea,
          estadoTarea: t.estadoTarea,
          prioridad: t.prioridad,
          fechaCreacion: t.fechaCreacion,
          fechaLimite: this.toDateOnly(t.fechaLimite),
          actualizadaEn: t.actualizadaEn,
          tiempoEstimadoHoras: t.tiempoEstimadoHoras,
          horasReales,
          fechaAsignacion: asignacionMasReciente.fechaAsignacion,
          desasignadaEn: asignacionMasReciente.desasignadaEn,
        };
      }),
    };
  }

  /**
   * Resumen person-centric de integrantes para T-106
   * (GET /proyectos/:id/miembros/resumen, aún no expuesto). Contrato
   * congelado en team-summary-member.dto.ts / team-summary-response.dto.ts.
   * O(1) queries respecto al número de integrantes: _requireOwner, líder,
   * participaciones, tareas y horas se resuelven cada una en una única
   * consulta fija; nunca dentro de un loop por miembro.
   */
  async getTeamSummary(idProyecto: number, userId: number): Promise<TeamSummaryResponseDto> {
    const proyecto = await this._requireOwner(idProyecto, userId);

    // El líder no tiene ParticipacionProyecto propia (ver comentario sobre
    // Proyecto.creadoPor en schema.prisma): se resuelve aparte con una única
    // query fija a Usuario, nunca a partir de las participaciones.
    const liderUsuario = await this.prisma.usuario.findUnique({
      where: { idUsuario: proyecto.creadoPor },
      select: { idUsuario: true, nombre: true, apellido: true, correo: true, fotoUrl: true },
    });
    if (!liderUsuario) {
      throw new NotFoundException(`Usuario líder con id ${proyecto.creadoPor} no encontrado`);
    }

    // Participaciones ACTIVO del proyecto, excluyendo al creador: el líder
    // se modela por separado (lider) y nunca debe duplicarse dentro de
    // miembros aunque además tenga una ParticipacionProyecto propia.
    const participaciones = await this.prisma.participacionProyecto.findMany({
      where: {
        rolProyecto: { idProyecto },
        estadoParticipacion: 'ACTIVO',
        idUsuario: { not: proyecto.creadoPor },
      },
      select: {
        idUsuario: true,
        estadoParticipacion: true,
        usuario: {
          select: { idUsuario: true, nombre: true, apellido: true, correo: true, fotoUrl: true },
        },
        rolProyecto: { select: { idRolProyecto: true, nombreRol: true } },
      },
      orderBy: { fechaIngreso: 'asc' },
    });

    // Agrupación person-centric: la key del Map es idUsuario (no
    // idParticipacion ni idRolProyecto), así que dos participaciones ACTIVO
    // de la misma persona con distinto rol producen 1 miembro con
    // roles.length = 2, nunca 2 miembros.
    const miembrosPorUsuario = new Map<number, TeamSummaryMemberDto>();
    for (const p of participaciones) {
      let miembro = miembrosPorUsuario.get(p.idUsuario);
      if (!miembro) {
        miembro = {
          idUsuario: p.usuario.idUsuario,
          nombre: p.usuario.nombre,
          apellido: p.usuario.apellido,
          correo: p.usuario.correo,
          fotoUrl: p.usuario.fotoUrl,
          roles: [],
          estadoParticipacion: p.estadoParticipacion,
          tareasActivas: 0,
          tareasCompletadas: 0,
          horasReconocidas: 0,
        };
        miembrosPorUsuario.set(p.idUsuario, miembro);
      }
      const yaTieneRol = miembro.roles.some(
        (r: TeamSummaryRoleDto) => r.idRolProyecto === p.rolProyecto.idRolProyecto,
      );
      if (!yaTieneRol) {
        miembro.roles.push({
          idRolProyecto: p.rolProyecto.idRolProyecto,
          nombreRol: p.rolProyecto.nombreRol,
        });
      }
    }

    const idsUsuarios = [...miembrosPorUsuario.keys()];

    if (idsUsuarios.length === 0) {
      return { lider: liderUsuario, miembros: [] };
    }

    // Tareas vigentes (no soft-deleted) del proyecto con asignación ACTUAL
    // (desasignadaEn: null) hacia alguno de los miembros. Una sola query
    // fija para todos los miembros, aislada a idProyecto explícitamente.
    const tareas = await this.prisma.tarea.findMany({
      where: {
        idProyecto,
        eliminadoEn: null,
        asignaciones: { some: { idUsuario: { in: idsUsuarios }, desasignadaEn: null } },
      },
      select: {
        idTarea: true,
        estadoTarea: true,
        asignaciones: {
          where: { idUsuario: { in: idsUsuarios }, desasignadaEn: null },
          select: { idUsuario: true },
        },
      },
    });

    // Deduplicación (idUsuario, idTarea): un usuario puede tener más de un
    // tramo histórico sobre la misma tarea, pero al filtrar por la
    // asignación vigente (desasignadaEn: null) el invariante del schema ya
    // garantiza como mucho un tramo actual por (idUsuario, idTarea); el Set
    // es la salvaguarda simple contra datos inesperados, no una necesidad
    // estructural.
    const tareasContadas = new Set<string>();
    for (const t of tareas) {
      for (const a of t.asignaciones) {
        const clave = `${a.idUsuario}:${t.idTarea}`;
        if (tareasContadas.has(clave)) continue;
        tareasContadas.add(clave);

        const miembro = miembrosPorUsuario.get(a.idUsuario);
        if (!miembro) continue;
        if (t.estadoTarea === 'HECHO') {
          miembro.tareasCompletadas += 1;
        } else {
          miembro.tareasActivas += 1;
        }
      }
    }

    // horasReconocidas: exclusivamente HorasParticipacion.horasAprobadas con
    // estadoHoras = APROBADA, agrupado por idUsuario. Nunca
    // AsignacionTarea.horasReales ni tiempoEstimadoHoras.
    const horas = await this.prisma.horasParticipacion.findMany({
      where: {
        estadoHoras: 'APROBADA',
        participacion: { idUsuario: { in: idsUsuarios }, rolProyecto: { idProyecto } },
      },
      select: {
        horasAprobadas: true,
        participacion: { select: { idUsuario: true } },
      },
    });

    for (const h of horas) {
      const miembro = miembrosPorUsuario.get(h.participacion.idUsuario);
      if (!miembro) continue;
      miembro.horasReconocidas += h.horasAprobadas ? h.horasAprobadas.toNumber() : 0;
    }

    return {
      lider: liderUsuario,
      miembros: idsUsuarios.map((id) => miembrosPorUsuario.get(id)!),
    };
  }

  async findFeatured() {
    const cached = await this.cacheManager.get<any[]>(FEATURED_CACHE_KEY).catch(() => null);
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
      .map(({ totalPostulaciones, ...p }) => p);

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

  /**
   * Creación de una solicitud de salida (T-111, Tarea 6): NO usa
   * _requireOwner porque el solicitante es un miembro, no el líder — eso
   * rechazaría exactamente a quien necesita usar este flujo. En su lugar
   * valida directamente: proyecto vigente, líder excluido, participación
   * ACTIVO, motivo no vacío, cero asignaciones vigentes y ausencia de otra
   * solicitud PENDIENTE. El orden de las dos primeras reglas se invierte
   * respecto a la enumeración conceptual del contrato (líder antes que
   * participación): el líder nunca tiene ParticipacionProyecto propia (ver
   * comentario en Proyecto.creadoPor), así que comprobar participación
   * primero le devolvería «no tienes participación activa» en vez del 403
   * contractual «eres el líder, usa el flujo de traspaso», que no existe en
   * este sprint. Única escritura productiva: solicitudSalidaProyecto.create;
   * no se toca ParticipacionProyecto, HorasParticipacion, Tarea ni
   * AsignacionTarea.
   */
  async createSolicitudSalida(idProyecto: number, idUsuario: number, motivo: string) {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto, eliminadoEn: null },
      select: { idProyecto: true, creadoPor: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${idProyecto} no encontrado`);
    }

    if (proyecto.creadoPor === idUsuario) {
      throw new ForbiddenException(
        'El líder del proyecto no puede solicitar su salida mediante este flujo',
      );
    }

    const participacion = await this.prisma.participacionProyecto.findFirst({
      where: {
        idUsuario,
        estadoParticipacion: 'ACTIVO',
        rolProyecto: { idProyecto },
      },
      select: { idParticipacion: true },
    });
    if (!participacion) {
      throw new ForbiddenException('No tienes una participación activa en este proyecto');
    }

    const motivoLimpio = motivo.trim();
    if (motivoLimpio.length === 0) {
      throw new BadRequestException('motivo no puede estar vacío');
    }

    // Asignación vigente = desasignadaEn: null sobre una tarea del proyecto
    // solicitado; sin filtro adicional de estadoTarea (eso pertenece a T-113,
    // no a esta regla de creación). No se decide aquí ninguna política de
    // soft-delete de tarea porque el contrato congelado de T-111 no la
    // define; se usa únicamente el guard explícito (desasignadaEn + idProyecto).
    const asignacionVigente = await this.prisma.asignacionTarea.findFirst({
      where: { idUsuario, desasignadaEn: null, tarea: { idProyecto } },
      select: { idAsignacion: true },
    });
    if (asignacionVigente) {
      throw new ConflictException(
        'No puedes solicitar salida mientras tengas asignaciones de tareas vigentes',
      );
    }

    const solicitudPendiente = await this.prisma.solicitudSalidaProyecto.findFirst({
      where: { idProyecto, idUsuario, estadoSolicitud: 'PENDIENTE' },
      select: { idSolicitud: true },
    });
    if (solicitudPendiente) {
      throw new ConflictException('Ya existe una solicitud de salida pendiente para este proyecto');
    }

    try {
      return await this.prisma.solicitudSalidaProyecto.create({
        data: { idProyecto, idUsuario, motivo: motivoLimpio },
      });
    } catch (error) {
      if (this.isPendingExitRequestCollision(error)) {
        throw new ConflictException('Ya existe una solicitud de salida pendiente para este proyecto');
      }
      throw error;
    }
  }

  /**
   * Reconoce específicamente la violación del índice parcial
   * solicitud_salida_proyecto_pendiente_unique (Tarea 5): defensa en
   * profundidad contra la condición de carrera que el precheck de
   * findFirst no puede cerrar por sí solo. Mismo criterio estrecho que
   * isActiveAssignmentCollision en TasksService: no basta `code === 'P2002'`,
   * se exige además modelo y columnas exactas del índice parcial. Cualquier
   * otro P2002 (u otro código) se relanza sin cambios.
   */
  private isPendingExitRequestCollision(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }
    if (error.code !== 'P2002') {
      return false;
    }

    const modelName = error.meta?.modelName;
    const target = error.meta?.target;

    return (
      modelName === 'SolicitudSalidaProyecto' &&
      Array.isArray(target) &&
      target.length === 2 &&
      target.includes('id_proyecto') &&
      target.includes('id_usuario')
    );
  }

  /**
   * Resolución de una solicitud de salida (T-113). Mismo guard de
   * liderazgo que approveClosure/rejectClosure (_requireOwner). La regla de
   * bloqueo aplica SOLO a la aprobación: cuenta en una única consulta las
   * tareas con asignación vigente cuyo estado sea distinto de HECHO — si hay
   * alguna, se rechaza sin tocar la solicitud ni la participación.
   */
  async approveSolicitudSalida(idProyecto: number, idSolicitud: number, liderId: number) {
    await this._requireOwner(idProyecto, liderId);
    const solicitud = await this._requirePendingSolicitudSalida(idProyecto, idSolicitud);

    const tareasPendientes = await this.prisma.asignacionTarea.count({
      where: {
        idUsuario: solicitud.idUsuario,
        desasignadaEn: null,
        tarea: { idProyecto, eliminadoEn: null, estadoTarea: { not: 'HECHO' } },
      },
    });
    if (tareasPendientes > 0) {
      throw new BadRequestException(
        `No se puede aprobar la salida: el integrante tiene ${tareasPendientes} tarea(s) pendiente(s) que deben reasignarse antes de aprobar la salida`,
      );
    }

    const ahora = new Date();
    return this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.solicitudSalidaProyecto.update({
        where: { idSolicitud },
        data: { estadoSolicitud: 'APROBADA', resueltaEn: ahora, resueltaPor: liderId },
      });
      // Mismo criterio que approveClosure: solo se retira la participación
      // ACTIVO, nunca una ya RETIRADA/COMPLETADA de otro tramo histórico.
      await tx.participacionProyecto.updateMany({
        where: {
          idUsuario: solicitud.idUsuario,
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto },
        },
        data: { estadoParticipacion: 'RETIRADO', fechaSalida: ahora },
      });
      return actualizada;
    });
  }

  async rejectSolicitudSalida(idProyecto: number, idSolicitud: number, liderId: number) {
    await this._requireOwner(idProyecto, liderId);
    const solicitud = await this._requirePendingSolicitudSalida(idProyecto, idSolicitud);

    return this.prisma.solicitudSalidaProyecto.update({
      where: { idSolicitud: solicitud.idSolicitud },
      data: { estadoSolicitud: 'RECHAZADA', resueltaEn: new Date(), resueltaPor: liderId },
    });
  }

  private async _requirePendingSolicitudSalida(idProyecto: number, idSolicitud: number) {
    const solicitud = await this.prisma.solicitudSalidaProyecto.findFirst({
      where: { idSolicitud, idProyecto },
    });
    if (!solicitud) {
      throw new NotFoundException(`Solicitud con id ${idSolicitud} no encontrada`);
    }
    if (solicitud.estadoSolicitud !== 'PENDIENTE') {
      throw new BadRequestException('Solo se puede resolver una solicitud en estado PENDIENTE');
    }
    return solicitud;
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