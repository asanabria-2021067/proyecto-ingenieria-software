import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateRoleDto, RoleRequisitoDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

type TxClient = Prisma.TransactionClient;

/**
 * Ampliación roles/participación (Secciones 6, 8, 9, 10-16). Módulo nuevo: no
 * duplica ProjectsService — este archivo concentra el CRUD de roles después de
 * la creación del proyecto, la autoasignación del líder a un rol y el retiro
 * limitado de un rol. La tarea sigue asignándose a un usuario; nada aquí
 * convierte el rol en el asignado de una tarea.
 */
@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────────────────── helpers ─────────────────────────

  private async loadProjectOrThrow(projectId: number, tx?: TxClient) {
    const db = tx ?? this.prisma;
    const proyecto = await db.proyecto.findFirst({
      where: { idProyecto: projectId, eliminadoEn: null },
      select: { idProyecto: true, creadoPor: true, tituloProyecto: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${projectId} no encontrado`);
    }
    return proyecto;
  }

  private assertLeader(proyecto: { creadoPor: number }, userId: number) {
    if (proyecto.creadoPor !== userId) {
      throw new ForbiddenException('Solo el líder del proyecto puede realizar esta acción');
    }
  }

  private async loadRoleInProjectOrThrow(projectId: number, roleId: number, tx?: TxClient) {
    const db = tx ?? this.prisma;
    const rol = await db.rolProyecto.findFirst({
      where: { idRolProyecto: roleId, idProyecto: projectId },
      select: {
        idRolProyecto: true,
        idProyecto: true,
        nombreRol: true,
        descripcionRolProyecto: true,
        idCarreraRequerida: true,
        cupos: true,
        horasSemanalesEstimadas: true,
      },
    });
    if (!rol) {
      throw new NotFoundException(`Rol con id ${roleId} no encontrado en el proyecto ${projectId}`);
    }
    return rol;
  }

  private async assertCarreraExists(idCarrera: number, tx?: TxClient) {
    const db = tx ?? this.prisma;
    const carrera = await db.carrera.findUnique({
      where: { idCarrera },
      select: { idCarrera: true },
    });
    if (!carrera) {
      throw new BadRequestException(`La carrera con id ${idCarrera} no existe`);
    }
  }

  private async assertHabilidadesExist(requisitos: RoleRequisitoDto[], tx?: TxClient) {
    if (requisitos.length === 0) return;
    const db = tx ?? this.prisma;
    const ids = [...new Set(requisitos.map((r) => r.idHabilidad))];
    const encontradas = await db.habilidad.findMany({
      where: { idHabilidad: { in: ids } },
      select: { idHabilidad: true },
    });
    if (encontradas.length !== ids.length) {
      throw new BadRequestException('Una o más habilidades requeridas no existen');
    }
  }

  private roleWithStatsSelect() {
    return {
      idRolProyecto: true,
      nombreRol: true,
      descripcionRolProyecto: true,
      idCarreraRequerida: true,
      cupos: true,
      horasSemanalesEstimadas: true,
      carreraRequerida: { select: { idCarrera: true, nombreCarrera: true } },
      requisitos: {
        select: {
          idHabilidad: true,
          nivelMinimo: true,
          obligatorio: true,
          habilidad: { select: { idHabilidad: true, nombreHabilidad: true } },
        },
      },
      participaciones: {
        where: { estadoParticipacion: 'ACTIVO' as const },
        select: { idUsuario: true },
      },
    };
  }

  // ───────────────────────── reads ─────────────────────────

  /**
   * Roles del proyecto con estadísticas y banderas del solicitante (Sección
   * 22). Lectura permitida al líder o a cualquier participante activo. Para
   * cada rol: participantes activos, cupos disponibles, si el solicitante ya
   * participa (`isMine`) y si puede salir (`canLeave` = participa aquí y
   * conserva al menos otro rol activo).
   */
  async listRoles(projectId: number, userId: number) {
    const proyecto = await this.loadProjectOrThrow(projectId);
    const isLeader = proyecto.creadoPor === userId;

    const rolesRaw = await this.prisma.rolProyecto.findMany({
      where: { idProyecto: projectId },
      select: this.roleWithStatsSelect(),
      orderBy: { idRolProyecto: 'asc' },
    });

    // Participaciones activas del solicitante en el proyecto (para isMine/canLeave).
    const misActivas = await this.prisma.participacionProyecto.findMany({
      where: {
        idUsuario: userId,
        estadoParticipacion: 'ACTIVO',
        rolProyecto: { idProyecto: projectId },
      },
      select: { idRolProyecto: true },
    });
    const misRolesActivos = new Set(misActivas.map((p) => p.idRolProyecto));

    if (!isLeader && misRolesActivos.size === 0) {
      throw new ForbiddenException('No tienes acceso a los roles de este proyecto');
    }

    const roles = rolesRaw.map((rol) => {
      const participantesActivos = rol.participaciones.length;
      const isMine = misRolesActivos.has(rol.idRolProyecto);
      const canLeave = isMine && misRolesActivos.size > 1;
      return {
        idRolProyecto: rol.idRolProyecto,
        nombreRol: rol.nombreRol,
        descripcionRolProyecto: rol.descripcionRolProyecto,
        idCarreraRequerida: rol.idCarreraRequerida,
        carreraRequerida: rol.carreraRequerida,
        cupos: rol.cupos,
        horasSemanalesEstimadas: rol.horasSemanalesEstimadas,
        requisitos: rol.requisitos.map((req) => ({
          idHabilidad: req.idHabilidad,
          nombreHabilidad: req.habilidad.nombreHabilidad,
          nivelMinimo: req.nivelMinimo,
          obligatorio: req.obligatorio,
        })),
        participantesActivos,
        cuposDisponibles: Math.max(0, rol.cupos - participantesActivos),
        isMine,
        canLeave,
      };
    });

    return { isLeader, roles };
  }

  // ───────────────────────── CRUD ─────────────────────────

  /** Crear un rol (Sección 8). Solo el líder. */
  async createRole(projectId: number, dto: CreateRoleDto, userId: number) {
    const proyecto = await this.loadProjectOrThrow(projectId);
    this.assertLeader(proyecto, userId);

    if (dto.idCarreraRequerida != null) {
      await this.assertCarreraExists(dto.idCarreraRequerida);
    }
    if (dto.requisitos?.length) {
      await this.assertHabilidadesExist(dto.requisitos);
    }

    const rol = await this.prisma.rolProyecto.create({
      data: {
        idProyecto: projectId,
        nombreRol: dto.nombreRol,
        descripcionRolProyecto: dto.descripcionRolProyecto ?? null,
        idCarreraRequerida: dto.idCarreraRequerida ?? null,
        cupos: dto.cupos,
        horasSemanalesEstimadas: dto.horasSemanalesEstimadas ?? null,
        ...(dto.requisitos?.length && {
          requisitos: {
            create: dto.requisitos.map((req) => ({
              idHabilidad: req.idHabilidad,
              nivelMinimo: req.nivelMinimo,
              obligatorio: req.obligatorio,
            })),
          },
        }),
      },
      select: this.roleWithStatsSelect(),
    });

    return this.shapeRole(rol);
  }

  /**
   * Editar un rol (Sección 8). Solo el líder. Conserva el mismo idRolProyecto,
   * no mueve el rol de proyecto, no desasigna usuarios ni tareas. Reducir cupos
   * por debajo de los participantes activos ⇒ 400. Todo en una transacción
   * cuando toca varias tablas (rol + requisitos).
   */
  async updateRole(projectId: number, roleId: number, dto: UpdateRoleDto, userId: number) {
    const proyecto = await this.loadProjectOrThrow(projectId);
    this.assertLeader(proyecto, userId);
    const rolActual = await this.loadRoleInProjectOrThrow(projectId, roleId);

    if (dto.idCarreraRequerida != null) {
      await this.assertCarreraExists(dto.idCarreraRequerida);
    }
    if (dto.requisitos !== undefined && dto.requisitos.length > 0) {
      await this.assertHabilidadesExist(dto.requisitos);
    }

    if (dto.cupos !== undefined) {
      const activos = await this.prisma.participacionProyecto.count({
        where: { idRolProyecto: roleId, estadoParticipacion: 'ACTIVO' },
      });
      if (dto.cupos < activos) {
        throw new BadRequestException(
          `No puedes reducir los cupos a ${dto.cupos}: el rol tiene ${activos} participante(s) activo(s)`,
        );
      }
    }

    const data: Prisma.RolProyectoUpdateInput = {};
    if (dto.nombreRol !== undefined) data.nombreRol = dto.nombreRol;
    if (dto.descripcionRolProyecto !== undefined)
      data.descripcionRolProyecto = dto.descripcionRolProyecto;
    if (dto.cupos !== undefined) data.cupos = dto.cupos;
    if (dto.horasSemanalesEstimadas !== undefined)
      data.horasSemanalesEstimadas = dto.horasSemanalesEstimadas;
    if (dto.idCarreraRequerida !== undefined) {
      data.carreraRequerida =
        dto.idCarreraRequerida === null
          ? { disconnect: true }
          : { connect: { idCarrera: dto.idCarreraRequerida } };
    }

    const rol = await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.rolProyecto.update({ where: { idRolProyecto: roleId }, data });
      }
      if (dto.requisitos !== undefined) {
        // Reemplazo del conjunto de habilidades (no expulsa participantes).
        await tx.requisitoHabilidadRol.deleteMany({ where: { idRolProyecto: roleId } });
        if (dto.requisitos.length > 0) {
          await tx.requisitoHabilidadRol.createMany({
            data: dto.requisitos.map((req) => ({
              idRolProyecto: roleId,
              idHabilidad: req.idHabilidad,
              nivelMinimo: req.nivelMinimo,
              obligatorio: req.obligatorio,
            })),
          });
        }
      }
      return tx.rolProyecto.findUniqueOrThrow({
        where: { idRolProyecto: roleId },
        select: this.roleWithStatsSelect(),
      });
    });

    // Notificación post-commit a participantes activos si cambió algo relevante.
    if (this.relevantChange(rolActual, dto)) {
      await this.safeNotify(() =>
        this.notifications.notifyRoleMembers(projectId, roleId, userId, {
          tipoNotificacion: 'ROL_ACTUALIZADO',
          tituloNotificacion: 'Un rol fue actualizado',
          mensajeNotificacion: `El rol "${rol.nombreRol}" del proyecto "${proyecto.tituloProyecto}" fue actualizado.`,
          datosJson: { projectId, roleId, roleName: rol.nombreRol, projectTitle: proyecto.tituloProyecto },
        }),
      );
    }

    return this.shapeRole(rol);
  }

  /**
   * Eliminación segura de rol (Sección 9). Sin soft delete. Se rechaza (400)
   * si el rol tiene historial externo: participaciones de cualquier estado,
   * tareas (activas o con soft delete) o postulaciones. Los requisitos de
   * habilidad son configuración intrínseca del rol —no historial externo—, por
   * lo que un rol que solo tiene requisitos SÍ puede eliminarse: sus requisitos
   * se borran junto con el rol dentro de una misma transacción (todo o nada).
   * No emite notificación general.
   */
  async deleteRole(projectId: number, roleId: number, userId: number) {
    const proyecto = await this.loadProjectOrThrow(projectId);
    this.assertLeader(proyecto, userId);
    await this.loadRoleInProjectOrThrow(projectId, roleId);

    const [participaciones, tareas, postulaciones] = await Promise.all([
      this.prisma.participacionProyecto.count({ where: { idRolProyecto: roleId } }),
      this.prisma.tarea.count({ where: { idRolProyecto: roleId } }),
      this.prisma.postulacion.count({ where: { idRolProyecto: roleId } }),
    ]);

    if (participaciones > 0 || tareas > 0 || postulaciones > 0) {
      throw new BadRequestException(
        'El rol ya tiene historial asociado (participaciones, tareas o postulaciones) y no puede eliminarse',
      );
    }

    // Requisitos (configuración intrínseca) + rol en una sola transacción: si
    // algo falla, no queda información parcialmente eliminada.
    await this.prisma.$transaction(async (tx) => {
      await tx.requisitoHabilidadRol.deleteMany({ where: { idRolProyecto: roleId } });
      await tx.rolProyecto.delete({ where: { idRolProyecto: roleId } });
    });

    return { idRolProyecto: roleId, eliminado: true };
  }

  // ───────────────────── participación ─────────────────────

  /**
   * Autoasignación del líder a un rol (Sección 6). Crea directamente una
   * ParticipacionProyecto ACTIVO (no una Postulación). Idempotente: si ya
   * participa activamente, devuelve el estado actual sin crear otra fila ni
   * consumir cupo. Consume cupo cuando crea. Una carrera concurrente que
   * viole el índice parcial se traduce a 409.
   */
  async selfAssign(projectId: number, roleId: number, userId: number) {
    const proyecto = await this.loadProjectOrThrow(projectId);
    this.assertLeader(proyecto, userId);
    const rol = await this.loadRoleInProjectOrThrow(projectId, roleId);

    // Idempotencia.
    const existente = await this.prisma.participacionProyecto.findFirst({
      where: { idUsuario: userId, idRolProyecto: roleId, estadoParticipacion: 'ACTIVO' },
      select: { idParticipacion: true },
    });
    if (existente) {
      return {
        idParticipacion: existente.idParticipacion,
        idRolProyecto: roleId,
        estadoParticipacion: 'ACTIVO' as const,
        yaParticipaba: true,
      };
    }

    // Cupo disponible.
    const activos = await this.prisma.participacionProyecto.count({
      where: { idRolProyecto: roleId, estadoParticipacion: 'ACTIVO' },
    });
    if (activos >= rol.cupos) {
      throw new BadRequestException('El rol ya alcanzó su límite de cupos activos');
    }

    let participacion;
    try {
      participacion = await this.prisma.participacionProyecto.create({
        data: { idUsuario: userId, idRolProyecto: roleId, estadoParticipacion: 'ACTIVO' },
        select: { idParticipacion: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe una participación activa en este rol');
      }
      throw error;
    }

    // Notificación post-commit. El actor (líder) siempre se excluye
    // (notifyRoleMembers excluye al actor), por lo que solo se informa a otros
    // miembros activos del rol; puede resultar en cero destinatarios.
    await this.safeNotify(() =>
      this.notifications.notifyRoleMembers(projectId, roleId, userId, {
        tipoNotificacion: 'ROL_ASIGNADO_LIDER',
        tituloNotificacion: 'El líder se unió a un rol',
        mensajeNotificacion: `El líder se asignó al rol "${rol.nombreRol}" en el proyecto "${proyecto.tituloProyecto}".`,
        datosJson: { projectId, roleId, roleName: rol.nombreRol, projectTitle: proyecto.tituloProyecto },
      }),
    );

    return {
      idParticipacion: participacion.idParticipacion,
      idRolProyecto: roleId,
      estadoParticipacion: 'ACTIVO' as const,
      yaParticipaba: false,
    };
  }

  /**
   * Retiro limitado de un rol (Secciones 10-16). Salir de un rol conservando
   * al menos otro rol activo en el mismo proyecto. No abandona el último rol
   * (400). Atómico y seguro ante concurrencia (SERIALIZABLE + reintento): dos
   * salidas concurrentes de roles distintos nunca dejan al usuario en cero.
   */
  async leaveRole(projectId: number, roleId: number, userId: number) {
    const proyecto = await this.loadProjectOrThrow(projectId);
    await this.loadRoleInProjectOrThrow(projectId, roleId);

    const timestampRetiro = new Date();

    const resultado = await this.runSerializable(async (tx) => {
      // Participación ACTIVO del usuario en el rol que abandona.
      const participacion = await tx.participacionProyecto.findFirst({
        where: {
          idUsuario: userId,
          idRolProyecto: roleId,
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto: projectId },
        },
        select: { idParticipacion: true },
      });
      if (!participacion) {
        throw new BadRequestException('No participas activamente en este rol');
      }

      // Debe quedar al menos otro rol activo en el mismo proyecto.
      const otrosRolesActivos = await tx.participacionProyecto.count({
        where: {
          idUsuario: userId,
          estadoParticipacion: 'ACTIVO',
          idRolProyecto: { not: roleId },
          rolProyecto: { idProyecto: projectId },
        },
      });
      if (otrosRolesActivos === 0) {
        throw new BadRequestException('No puedes abandonar tu último rol desde esta opción.');
      }

      // Asignaciones activas del usuario en tareas del rol abandonado (mismo
      // proyecto, no eliminadas). Solo esas se cierran, con un único timestamp.
      const asignaciones = await tx.asignacionTarea.findMany({
        where: {
          idUsuario: userId,
          desasignadaEn: null,
          tarea: { idProyecto: projectId, idRolProyecto: roleId, eliminadoEn: null },
        },
        select: { idAsignacion: true },
      });
      const idsAsignacion = asignaciones.map((a) => a.idAsignacion);
      if (idsAsignacion.length > 0) {
        await tx.asignacionTarea.updateMany({
          where: { idAsignacion: { in: idsAsignacion } },
          data: { desasignadaEn: timestampRetiro },
        });
      }

      await tx.participacionProyecto.update({
        where: { idParticipacion: participacion.idParticipacion },
        data: { estadoParticipacion: 'RETIRADO', fechaSalida: timestampRetiro },
      });

      return {
        idParticipacion: participacion.idParticipacion,
        tareasDesasignadas: idsAsignacion.length,
      };
    });

    // Notificaciones post-commit (Sección 18A): líder + miembros activos del
    // rol afectado, excluyendo al actor, deduplicados. Una sola notificación
    // consolidada por destinatario (nunca una por tarea).
    await this.safeNotify(async () => {
      const usuario = await this.prisma.usuario.findUnique({
        where: { idUsuario: userId },
        select: { nombre: true, apellido: true },
      });
      const rolInfo = await this.prisma.rolProyecto.findUnique({
        where: { idRolProyecto: roleId },
        select: { nombreRol: true },
      });
      const miembros = await this.prisma.participacionProyecto.findMany({
        where: {
          estadoParticipacion: 'ACTIVO',
          idRolProyecto: roleId,
          rolProyecto: { idProyecto: projectId },
        },
        select: { idUsuario: true },
      });
      const destinatarios = [
        ...new Set([proyecto.creadoPor, ...miembros.map((m) => m.idUsuario)]),
      ].filter((id) => id !== userId);
      if (destinatarios.length === 0) return;

      const userName = usuario ? `${usuario.nombre} ${usuario.apellido}` : 'Un integrante';
      const roleName = rolInfo?.nombreRol ?? 'un rol';
      await this.notifications.notifyUsers(destinatarios, {
        tipoNotificacion: 'ROL_ABANDONADO',
        tituloNotificacion: 'Un integrante dejó un rol',
        mensajeNotificacion:
          resultado.tareasDesasignadas > 0
            ? `${userName} dejó el rol "${roleName}" en "${proyecto.tituloProyecto}". ${resultado.tareasDesasignadas} ${resultado.tareasDesasignadas === 1 ? 'tarea quedó' : 'tareas quedaron'} sin asignar.`
            : `${userName} dejó el rol "${roleName}" en "${proyecto.tituloProyecto}".`,
        datosJson: {
          projectId,
          roleId,
          roleName,
          projectTitle: proyecto.tituloProyecto,
          taskCount: resultado.tareasDesasignadas,
        },
      });
    });

    return {
      idRolProyecto: roleId,
      estadoParticipacion: 'RETIRADO' as const,
      tareasDesasignadas: resultado.tareasDesasignadas,
    };
  }

  // ───────────────────────── internos ─────────────────────────

  /**
   * Ejecuta una transacción SERIALIZABLE con reintento acotado ante conflictos
   * de serialización (P2034: write conflict / deadlock). Evita el reintento
   * cuando la falla es una regla de negocio (BadRequest/NotFound/Forbidden).
   */
  private async runSerializable<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    const maxIntentos = 3;
    let ultimoError: unknown;
    for (let intento = 1; intento <= maxIntentos; intento++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const esConflicto =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!esConflicto || intento === maxIntentos) throw error;
        ultimoError = error;
        this.logger.warn(`Reintentando transacción SERIALIZABLE (intento ${intento})`);
      }
    }
    throw ultimoError;
  }

  /**
   * Notificación best-effort posterior al commit (Sección 18): si falla, se
   * registra y se continúa; nunca revierte la operación principal.
   */
  private async safeNotify(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      this.logger.error('Fallo al emitir notificación (operación no revertida)', error as Error);
    }
  }

  private relevantChange(
    rolActual: {
      nombreRol: string;
      descripcionRolProyecto: string | null;
      cupos: number;
      horasSemanalesEstimadas: number | null;
      idCarreraRequerida: number | null;
    },
    dto: UpdateRoleDto,
  ): boolean {
    if (dto.requisitos !== undefined) return true;
    if (dto.nombreRol !== undefined && dto.nombreRol !== rolActual.nombreRol) return true;
    if (
      dto.descripcionRolProyecto !== undefined &&
      (dto.descripcionRolProyecto ?? null) !== rolActual.descripcionRolProyecto
    )
      return true;
    if (dto.cupos !== undefined && dto.cupos !== rolActual.cupos) return true;
    if (
      dto.horasSemanalesEstimadas !== undefined &&
      (dto.horasSemanalesEstimadas ?? null) !== rolActual.horasSemanalesEstimadas
    )
      return true;
    if (
      dto.idCarreraRequerida !== undefined &&
      (dto.idCarreraRequerida ?? null) !== rolActual.idCarreraRequerida
    )
      return true;
    return false;
  }

  private shapeRole(rol: {
    idRolProyecto: number;
    nombreRol: string;
    descripcionRolProyecto: string | null;
    idCarreraRequerida: number | null;
    cupos: number;
    horasSemanalesEstimadas: number | null;
    carreraRequerida: { idCarrera: number; nombreCarrera: string } | null;
    requisitos: {
      idHabilidad: number;
      nivelMinimo: string;
      obligatorio: boolean;
      habilidad: { idHabilidad: number; nombreHabilidad: string };
    }[];
    participaciones: { idUsuario: number }[];
  }) {
    const participantesActivos = rol.participaciones.length;
    return {
      idRolProyecto: rol.idRolProyecto,
      nombreRol: rol.nombreRol,
      descripcionRolProyecto: rol.descripcionRolProyecto,
      idCarreraRequerida: rol.idCarreraRequerida,
      carreraRequerida: rol.carreraRequerida,
      cupos: rol.cupos,
      horasSemanalesEstimadas: rol.horasSemanalesEstimadas,
      requisitos: rol.requisitos.map((req) => ({
        idHabilidad: req.idHabilidad,
        nombreHabilidad: req.habilidad.nombreHabilidad,
        nivelMinimo: req.nivelMinimo,
        obligatorio: req.obligatorio,
      })),
      participantesActivos,
      cuposDisponibles: Math.max(0, rol.cupos - participantesActivos),
    };
  }
}
