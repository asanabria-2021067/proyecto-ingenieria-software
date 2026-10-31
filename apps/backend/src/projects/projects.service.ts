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
import { SocialService } from '../social/social.service';
import { calcularProgresoHito } from '../common/hito-progreso';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectReadPolicyService, type ReadDecision } from '../common/project-policy/project-read-policy.service';
import {
  ProjectTransactionService,
  type ProjectLockRow,
  type ProjectTransactionContext,
} from '../common/project-policy/project-transaction.service';

import {
  ESTADOS_CON_DETALLE,
  ESTADOS_EDITABLES,
  ESTADOS_EDITABLE_PARCIAL,
  ESTADOS_VISIBLES,
  calcularAvanceProyecto,
  proyectoDetalleAnonimoSelect,
  proyectoDetallePublicoSelect,
  proyectoDetalleSelect,
  proyectoListSelect,
  toDateOnly,
} from './projects.read-model';
import { ProjectsCacheService } from './projects-cache.service';
import { ProjectsAffinityService } from './projects-affinity.service';
import { ProjectsRevisionsService } from './projects-revisions.service';

export { PESOS_ORDEN_DISPONIBLES } from './projects.read-model';

/** Cliente Prisma raíz o transaccional: los helpers de autorización se repiten con `tx` después del lock (06 v2 §16). */
type Db = Prisma.TransactionClient | PrismaService;


@Injectable()
export class ProjectsService {
  private readonly cache: ProjectsCacheService;
  private readonly affinity: ProjectsAffinityService;
  private readonly revisions: ProjectsRevisionsService;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    @Inject(CACHE_MANAGER) cacheManager: Cache,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly readPolicy: ProjectReadPolicyService,
    private readonly social: SocialService,
    // RTF-3.3: opcionales porque las suites construyen ProjectsService con
    // argumentos posicionales; en producción ProjectsModule los provee.
    cache?: ProjectsCacheService,
    affinity?: ProjectsAffinityService,
    revisions?: ProjectsRevisionsService,
  ) {
    this.cache = cache ?? new ProjectsCacheService(cacheManager);
    this.affinity = affinity ?? new ProjectsAffinityService(prisma, social);
    this.revisions = revisions ?? new ProjectsRevisionsService();
  }

  /**
   * C033 (06 v2 §34): el detalle aplica el scope de Sprint del lector en la
   * consulta (p. ej. admin → solo tareas de Sprints CERRADO), no en el DTO.
   */
  private detalleSelectParaLector(decision: ReadDecision) {
    const { sprintWhere } = this.readPolicy.scopeForActor(decision);
    if (Object.keys(sprintWhere).length === 0) {
      return proyectoDetalleSelect;
    }
    return {
      ...proyectoDetalleSelect,
      tareas: { ...proyectoDetalleSelect.tareas, where: { sprint: sprintWhere } },
    };
  }

  /** Fila del proyecto tomada por el runner; solo es `null` en creación. */
  private lockedProject(ctx: Pick<ProjectTransactionContext, 'project'>): ProjectLockRow {
    if (!ctx.project) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return ctx.project;
  }

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

  /**
   * T-251: catálogo corto ("Proyectos Disponibles" del dashboard). La base
   * sigue siendo recencia (`orderBy fechaCreacion desc`); con sesión
   * (`userId`), T-252 reordena por afinidad SIN filtrar — mismo conjunto de
   * proyectos para todo el mundo, solo cambia el orden.
   *
   * Esta misma ruta (sin `page`) también sirve al buscador global del header
   * (`ProjectSearchInput` → `searchProjects(q)`): con `q` presente NO se
   * pondera por afinidad, para no subir un proyecto peor emparejado con el
   * texto buscado solo porque participa un amigo, y para no pagar las dos
   * consultas extra en cada tecla del debounce.
   *
   * NOTA CACHE: a diferencia de `findFeatured`, esta lista no se puede
   * cachear igual para todos los usuarios en cuanto el orden depende de
   * quién pregunta (sus amigos, su carrera). Hoy no está cacheada; si se le
   * agrega cache más adelante, la key tiene que incluir el userId.
   */
  async findAll(
    filters: {
      q?: string;
      tipoProyecto?: string;
      modalidad?: string;
      organizacionId?: number;
      habilidadId?: number;
    } = {},
    userId?: number,
  ) {
    const andConditions = this._buildListConditions(filters);
    const proyectos = await this.prisma.proyecto.findMany({
      where: { AND: andConditions },
      select: proyectoListSelect,
      orderBy: { fechaCreacion: 'desc' },
      take: 20,
    });

    const esBusqueda = !!filters.q && filters.q.trim().length > 0;
    const ordenados =
      !userId || esBusqueda || proyectos.length === 0
        ? proyectos
        : await this.affinity.ordenarPorAfinidad(proyectos, userId);
    return this.affinity.conGuardado(ordenados, userId);
  }

  /** Bookmark personal ("guardar"), distinto de postularse. Idempotente. */
  async guardarProyecto(idProyecto: number, userId: number) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { idProyecto },
      select: { idProyecto: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${idProyecto} no encontrado`);
    }
    await this.prisma.proyectoGuardado.upsert({
      where: { idUsuario_idProyecto: { idUsuario: userId, idProyecto } },
      create: { idUsuario: userId, idProyecto },
      update: {},
    });
    return { idProyecto, guardado: true };
  }

  async desguardarProyecto(idProyecto: number, userId: number) {
    await this.prisma.proyectoGuardado.deleteMany({ where: { idUsuario: userId, idProyecto } });
    return { idProyecto, guardado: false };
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

  async findOne(id: number, conSesion: boolean) {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: {
        idProyecto: id,
        estadoProyecto: { in: ESTADOS_CON_DETALLE },
        eliminadoEn: null,
      },
      select: conSesion ? proyectoDetallePublicoSelect : proyectoDetalleAnonimoSelect,
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${id} no encontrado`);
    }
    return proyecto;
  }

  async findOneAdmin(id: number, adminId: number) {
    const decision = await this.readPolicy.assertRead(undefined, {
      projectId: id,
      actorId: adminId,
      scope: 'resumen',
    });
    const isAdmin = await this.notifications.isAdmin(adminId);
    if (!isAdmin) {
      throw new ForbiddenException('Se requieren permisos de administrador');
    }
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto: id, eliminadoEn: null },
      select: this.detalleSelectParaLector(decision),
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${id} no encontrado`);
    }
    return proyecto;
  }

  async findOneOwner(id: number, userId: number) {
    await this.readPolicy.assertRead(undefined, { projectId: id, actorId: userId, scope: 'resumen' });
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
    await this.readPolicy.assertRead(undefined, { projectId: id, actorId: userId, scope: 'resumen' });
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

  private async esParticipanteActivo(idProyecto: number, userId: number, db: Db = this.prisma): Promise<boolean> {
    const participacion = await db.participacionProyecto.findFirst({
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
    const cached = await this.cache.getFeatured();
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

    await this.cache.setFeatured(destacados);
    return destacados;
  }

  async createFull(data: CreateProjectFullDto, creadoPor: number) {
    const { fechaInicio, fechaFinEstimada, organizacionesIds, roles, accion, ...rest } = data;
    const estadoProyecto =
      accion === 'EN_REVISION' ? EstadoProyecto.EN_REVISION : EstadoProyecto.BORRADOR;

    // C031 (06 v2 §16): la creación inserta primero su propia fila y considera adquirido el lock.
    return this.projectTx.run(
      null,
      creadoPor,
      'projects.createFull',
      async ({ tx, effects }) => {
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
        const snapshot = await this.revisions.buildProjectSnapshot(tx, proyecto.idProyecto);
        await this.revisions.crearRevisionPendiente(tx, proyecto.idProyecto, 1, snapshot);
        await this.notifications.persistAdminsTx(
          tx,
          'PROYECTO_EN_REVISION',
          {
            projectTitle: proyecto.tituloProyecto,
            projectId: proyecto.idProyecto,
            numeroEnvio: 1,
          },
          effects,
        );
      }
      return proyecto;
      },
      { createsProject: true },
    );
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
    return this.projectTx.run(id, userId, 'projects.update', async (ctx) => {
    const { tx } = ctx;
    const proyecto = await this._requireOwner(id, userId, tx);
    await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'PROYECTO_EDICION', userId);

    // Edición parcial (proyecto ya publicado / en progreso): solo el
    // subconjunto seguro de campos; conserva estado, roles, organizaciones,
    // participantes, tareas, hitos, comentarios, notificaciones y revisiones.
    if (ESTADOS_EDITABLE_PARCIAL.includes(proyecto.estadoProyecto)) {
      return this._updateParcial(id, data, tx);
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
  private async _updateParcial(id: number, data: UpdateProjectDto, db: Db = this.prisma) {
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

    await db.proyecto.update({ where: { idProyecto: id }, data: updateData });

    return db.proyecto.findUnique({
      where: { idProyecto: id },
      select: { idProyecto: true, estadoProyecto: true, tituloProyecto: true, fechaActualizacion: true },
    });
  }

  async submitForReview(id: number, userId: number) {
    return this.projectTx.run(id, userId, 'projects.submitForReview', async (ctx) => {
      const { tx, effects } = ctx;
      const proyecto = await this._requireOwner(id, userId, tx);
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'PUBLICACION_ENVIO', userId);
      if (proyecto.estadoProyecto !== EstadoProyecto.BORRADOR) {
        throw new BadRequestException(
          'Solo se puede enviar a revisión un proyecto en estado BORRADOR',
        );
      }
      const totalEnvios = await tx.revisionProyecto.count({
        where: { idProyecto: id },
      });
      const snapshot = await this.revisions.buildProjectSnapshot(tx, id);
      await tx.proyecto.update({
        where: { idProyecto: id },
        data: { estadoProyecto: EstadoProyecto.EN_REVISION, fechaActualizacion: new Date() },
      });
      await this.revisions.crearRevisionPendiente(tx, id, totalEnvios + 1, snapshot);
      await this.notifications.persistAdminsTx(
        tx,
        'PROYECTO_EN_REVISION',
        {
          projectTitle: proyecto.tituloProyecto,
          projectId: id,
          numeroEnvio: totalEnvios + 1,
        },
        effects,
      );
      return { idProyecto: id, estadoProyecto: EstadoProyecto.EN_REVISION };
    });
  }

  async resubmit(id: number, userId: number) {
    return this.projectTx.run(id, userId, 'projects.resubmit', async (ctx) => {
      const { tx, effects } = ctx;
      const proyecto = await this._requireOwner(id, userId, tx);
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'PUBLICACION_ENVIO', userId);
      if (proyecto.estadoProyecto !== EstadoProyecto.OBSERVADO) {
        throw new BadRequestException(
          'Solo se puede reenviar un proyecto en estado OBSERVADO',
        );
      }
      const totalEnvios = await tx.revisionProyecto.count({
        where: { idProyecto: id },
      });
      const snapshot = await this.revisions.buildProjectSnapshot(tx, id);
      await tx.proyecto.update({
        where: { idProyecto: id },
        data: { estadoProyecto: EstadoProyecto.EN_REVISION, fechaActualizacion: new Date() },
      });
      await this.revisions.crearRevisionPendiente(tx, id, totalEnvios + 1, snapshot);
      await this.notifications.persistAdminsTx(
        tx,
        'PROYECTO_EN_REVISION',
        {
          projectTitle: proyecto.tituloProyecto,
          projectId: id,
          numeroEnvio: totalEnvios + 1,
          isResubmission: true,
        },
        effects,
      );
      return { idProyecto: id, estadoProyecto: EstadoProyecto.EN_REVISION, numeroEnvio: totalEnvios + 1 };
    });
  }

  async changeEstado(
    id: number,
    userId: number,
    nuevoEstado: EstadoProyectoCreador,
  ) {
    return this.projectTx.run(id, userId, 'projects.changeEstado', async (ctx) => {
    const { tx, effects } = ctx;
    const proyecto = await this._requireOwner(id, userId, tx);
    await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'PROYECTO_EDICION', userId);
    const permitidos = TRANSICIONES_PERMITIDAS[proyecto.estadoProyecto] ?? [];
    if (!permitidos.includes(nuevoEstado as EstadoProyecto)) {
      throw new BadRequestException(
        `Transición no permitida: ${proyecto.estadoProyecto} -> ${nuevoEstado}`,
      );
    }
    // C032: el líder ya no puede llevar el proyecto a CERRADO desde esta ruta;
    // el estado terminal pertenece exclusivamente a la revisión administrativa de cierre.
    const estadoAnterior = proyecto.estadoProyecto;

    const actualizado = await tx.proyecto.update({
      where: { idProyecto: id },
      data: {
        estadoProyecto: nuevoEstado as EstadoProyecto,
        fechaActualizacion: new Date(),
      },
      select: { idProyecto: true, estadoProyecto: true, tituloProyecto: true },
    });

    const templateData = {
      projectTitle: actualizado.tituloProyecto,
      projectId: actualizado.idProyecto,
      oldStatus: estadoAnterior,
      newStatus: actualizado.estadoProyecto,
    } as const;

    await this.notifications.persistTemplateTx(
      tx,
      [proyecto.creadoPor],
      'CAMBIO_ESTADO_PROYECTO',
      templateData,
      effects,
    );

    if (nuevoEstado === EstadoProyectoCreador.EN_PROGRESO) {
      const participaciones = await tx.participacionProyecto.findMany({
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
        await this.notifications.persistTemplateTx(
          tx,
          destinatarios,
          'CAMBIO_ESTADO_PROYECTO',
          templateData,
          effects,
        );
      }
    }

    if (estadoAnterior === EstadoProyecto.PUBLICADO) {
      // I/O de caché fuera del lock: efecto post-commit.
      effects.add({ key: 'cache:projects:featured', publish: () => this.cache.invalidateFeatured() });
    }

    return actualizado;
    });
  }

  /** Líder o participante con participación ACTIVO en algún rol del proyecto. */
  private async _requireActiveMember(idProyecto: number, userId: number, db: Db = this.prisma) {
    const proyecto = await db.proyecto.findFirst({
      where: { idProyecto, eliminadoEn: null },
      select: { idProyecto: true, creadoPor: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${idProyecto} no encontrado`);
    }
    const esLider = proyecto.creadoPor === userId;
    if (!esLider && !(await this.esParticipanteActivo(idProyecto, userId, db))) {
      throw new ForbiddenException('No tienes una participación activa en este proyecto');
    }
    return proyecto;
  }

  private async _requireOwner(idProyecto: number, userId: number, db: Db = this.prisma) {
    const proyecto = await db.proyecto.findFirst({
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
  /**
   * Invariante A11: un proyecto con Sprint operable no puede iniciar su
   * cierre. Sobrevive al retiro del cierre legacy porque describe el
   * proyecto, no aquel endpoint; el evaluador de preparación la vuelve a
   * comprobar por su cuenta cuando decide si se puede solicitar.
   */
  async assertNoOperableSprint(idProyecto: number, db: Db = this.prisma): Promise<void> {
    const sprintOperable = await db.sprint.findFirst({
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
    await this.readPolicy.assertRead(undefined, { projectId: idProyecto, actorId: userId, scope: 'equipo' });
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
   *
   * T-186 (HU-147): `dto.idsTareas` opcional permite, en la misma
   * operación/transacción, asignar el hito recién creado a tareas ya
   * existentes del proyecto (ver `_asignarHitoATareas`) — el flujo que
   * rescata tareas legacy sin hito tras T-185, sin migraciones automáticas.
   */
  async createHito(idProyecto: number, userId: number, dto: CreateHitoDto) {
    const resultado = await this.projectTx.run(idProyecto, userId, 'projects.createHito', async (ctx) => {
      const { tx } = ctx;
      await this._requireActiveMember(idProyecto, userId, tx);
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'HITO_CREATE', userId);

      const ultimo = await tx.hito.findFirst({
        where: { idProyecto },
        orderBy: { orden: 'desc' },
        select: { orden: true },
      });
      const nuevoOrden = (ultimo?.orden ?? 0) + 1;

      const hito = await tx.hito.create({
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

      // T-186: asignación masiva opcional, en la MISMA transacción que la
      // creación — si alguna tarea seleccionada falla su validación, el
      // rollback también revierte el hito recién creado (nunca queda un
      // hito huérfano sin ninguna tarea asignada por un error a mitad de
      // camino).
      let idsTareasAsignadas: number[] | undefined;
      if (dto.idsTareas !== undefined) {
        idsTareasAsignadas = await this._asignarHitoATareas(tx, idProyecto, hito.idHito, dto.idsTareas);
      }

      return { hito, idsTareasAsignadas };
    });

    const publico = { ...resultado.hito, fechaLimite: toDateOnly(resultado.hito.fechaLimite) };
    // El campo solo aparece en la respuesta cuando el cliente pidió
    // asignación masiva: mantiene sin cambios la forma histórica de la
    // respuesta para quien solo crea un hito (createHito original).
    return resultado.idsTareasAsignadas !== undefined
      ? { ...publico, idsTareasAsignadas: resultado.idsTareasAsignadas }
      : publico;
  }

  /**
   * T-186 (HU-147): asigna `idHito` a un conjunto de tareas del mismo
   * proyecto en una sola operación — el mecanismo que evita que T-185 (hito
   * obligatorio para tablero/sprint) deje atrapadas para siempre a las
   * tareas existentes que hoy no tienen hito. No crea ni modifica hitos.
   *
   * Autorización: reutiliza la política HITO_CREATE ya evaluada por el
   * caller (líder o participante activo), deliberadamente NO TAREA_WRITE —
   * TAREA_WRITE exige que el Sprint de CADA tarea esté ACTIVO, y las tareas
   * que este flujo debe poder rescatar son precisamente las que pueden
   * pertenecer a un Sprint ya cerrado. Vincular una tarea a un hito no es
   * una edición del tablero/sprint, es la relación que T-185 exige antes de
   * que la tarea pueda volver a él.
   *
   * Valida existencia + pertenencia a `idProyecto` + no eliminada ANTES de
   * escribir nada: si falta alguna tarea, lanza y no actualiza ninguna
   * (todo o nada, igual que el resto de esta transacción).
   */
  async assignHitoTasks(
    idProyecto: number,
    idHito: number,
    userId: number,
    idsTareas: number[],
  ) {
    return this.projectTx.run(idProyecto, userId, 'projects.assignHitoTasks', async (ctx) => {
      const { tx } = ctx;
      await this._requireActiveMember(idProyecto, userId, tx);
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'HITO_CREATE', userId);

      const hito = await tx.hito.findFirst({
        where: { idHito, idProyecto },
        select: { idHito: true },
      });

      if (!hito) {
        throw new NotFoundException(
          `Hito con id ${idHito} no encontrado en el proyecto ${idProyecto}`,
        );
      }

      const idsTareasAsignadas = await this._asignarHitoATareas(
        tx,
        idProyecto,
        idHito,
        idsTareas,
      );

      return { idHito, idsTareasAsignadas };
    });
  }

  private async _asignarHitoATareas(
    tx: Prisma.TransactionClient,
    idProyecto: number,
    idHito: number,
    idsTareas: number[],
  ): Promise<number[]> {
    if (idsTareas.length === 0) {
      return [];
    }

    const tareasValidas = await tx.tarea.findMany({
      where: { idTarea: { in: idsTareas }, idProyecto, eliminadoEn: null },
      select: { idTarea: true },
    });
    const idsValidos = new Set(tareasValidas.map((tarea) => tarea.idTarea));
    const idsInvalidos = idsTareas.filter((idTarea) => !idsValidos.has(idTarea));
    if (idsInvalidos.length > 0) {
      throw new NotFoundException(
        `Tarea(s) con id ${idsInvalidos.join(', ')} no encontrada(s) en el proyecto ${idProyecto}`,
      );
    }

    await tx.tarea.updateMany({
      where: { idTarea: { in: idsTareas }, idProyecto },
      data: { idHito },
    });

    // A12: el hito recién creado gana tareas vigentes de golpe — su
    // estadoHito persistido debe reflejarlo, misma fórmula única que
    // TasksService#syncHitoEstado (calcularProgresoHito).
    await this._sincronizarEstadoHito(tx, idHito);

    return idsTareas;
  }

  /**
   * A12: misma fórmula que TasksService#syncHitoEstado
   * (src/common/hito-progreso.ts) — este es el otro write-path capaz de
   * cambiar el conjunto de tareas vigentes de un Hito fuera de TasksService,
   * así que reutiliza la única fórmula compartida en vez de definir una
   * segunda.
   */
  private async _sincronizarEstadoHito(tx: Prisma.TransactionClient, idHito: number): Promise<void> {
    const tareasHito = await tx.tarea.findMany({
      where: { idHito, eliminadoEn: null },
      select: { estadoTarea: true },
    });
    const { estadoHito } = calcularProgresoHito(tareasHito);
    await tx.hito.update({ where: { idHito }, data: { estadoHito } });
  }

  async delete(id: number, userId: number) {
    return this.projectTx.run(id, userId, 'projects.delete', async (ctx) => {
      const { tx } = ctx;
      const proyecto = await this._requireOwner(id, userId, tx);
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'PROYECTO_EDICION', userId);

      const estadosEliminables: EstadoProyecto[] = [
        EstadoProyecto.BORRADOR,
        EstadoProyecto.OBSERVADO,
      ];
      if (!estadosEliminables.includes(proyecto.estadoProyecto)) {
        throw new BadRequestException('Solo se pueden eliminar proyectos en estado BORRADOR u OBSERVADO');
      }

      await tx.proyecto.update({
        where: { idProyecto: id },
        data: { eliminadoEn: new Date() },
      });

      return { mensaje: 'Proyecto eliminado correctamente' };
    });
  }

}
