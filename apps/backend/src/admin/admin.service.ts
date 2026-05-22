import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstadoHoras,
  EstadoParticipacion,
  EstadoPostulacion,
  EstadoProyecto,
  EstadoUsuario,
  Prisma,
  TipoProyecto,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAdminUsersQueryDto } from './dto/list-admin-users-query.dto';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ─── Guards ──────────────────────────────────────────────────────────────────

  private async requireAdmin(userId: number): Promise<void> {
    const record = await this.prisma.usuarioRolAcceso.findFirst({
      where: {
        idUsuario: userId,
        rolAcceso: { nombrePerfil: 'administrador' },
      },
    });
    if (!record) throw new ForbiddenException('Acceso restringido a administradores');
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private normalizePagination(page: unknown, limit: unknown) {
    const p = Math.max(1, parseInt(String(page ?? 1), 10) || 1);
    const l = Math.min(50, Math.max(1, parseInt(String(limit ?? 10), 10) || 10));
    return { page: p, limit: l };
  }

  // ─── Estadísticas (Tarea 2) ───────────────────────────────────────────────────

  async getEstadisticas(userId: number) {
    await this.requireAdmin(userId);

    // Proxy de fecha: fechaCreacion para nuevosInactivos, fechaActualizacion para proyectosCerrados
    const startOf2026 = new Date('2026-01-01T00:00:00.000Z');

    const [
      proyectosActivos,
      usuariosActivos,
      enRevision,
      cierrePendiente,
      usuariosBloqueados,
      nuevosInactivos2026,
      proyectosCerrados2026,
    ] = await Promise.all([
      this.prisma.proyecto.count({
        where: {
          estadoProyecto: { in: [EstadoProyecto.PUBLICADO, EstadoProyecto.EN_PROGRESO] },
          eliminadoEn: null,
        },
      }),
      this.prisma.usuario.count({ where: { estado: EstadoUsuario.ACTIVO } }),
      this.prisma.proyecto.count({
        where: { estadoProyecto: EstadoProyecto.EN_REVISION, eliminadoEn: null },
      }),
      this.prisma.proyecto.count({
        where: { estadoProyecto: EstadoProyecto.EN_SOLICITUD_CIERRE, eliminadoEn: null },
      }),
      this.prisma.usuario.count({ where: { estado: EstadoUsuario.BLOQUEADO } }),
      // nuevosInactivos2026: usa fechaCreacion como proxy (no hay campo de cambio de estado)
      this.prisma.usuario.count({
        where: { estado: EstadoUsuario.INACTIVO, fechaCreacion: { gte: startOf2026 } },
      }),
      // proyectosCerrados2026: usa fechaActualizacion como proxy de fecha de cierre
      this.prisma.proyecto.count({
        where: {
          estadoProyecto: EstadoProyecto.CERRADO,
          fechaActualizacion: { gte: startOf2026 },
          eliminadoEn: null,
        },
      }),
    ]);

    const actividadReciente = await this.prisma.proyecto.findMany({
      where: { eliminadoEn: null },
      orderBy: { fechaActualizacion: 'desc' },
      take: 5,
      select: {
        idProyecto: true,
        tituloProyecto: true,
        estadoProyecto: true,
        fechaActualizacion: true,
      },
    });

    const perfilesRiesgo = await this.prisma.perfilEstudiante.findMany({
      where: { semestre: { gte: 7 } },
      select: {
        idUsuario: true,
        semestre: true,
        horasExtensionRequeridas: true,
        usuario: { select: { nombre: true, apellido: true } },
      },
      take: 20,
    });

    const estudiantesConHoras = await Promise.all(
      perfilesRiesgo.map(async (p) => {
        const agg = await this.prisma.horasParticipacion.aggregate({
          where: {
            participacion: {
              idUsuario: p.idUsuario,
              rolProyecto: {
                proyecto: { tipoProyecto: TipoProyecto.EXTRACURRICULAR_EXTENSION },
              },
            },
            estadoHoras: EstadoHoras.APROBADA,
          },
          _sum: { horasAprobadas: true },
        });
        return {
          idUsuario: p.idUsuario,
          nombre: p.usuario.nombre,
          apellido: p.usuario.apellido,
          semestre: p.semestre,
          horasExtension: Number(agg._sum.horasAprobadas ?? 0),
          // fallback 20 si el perfil no tiene horasExtensionRequeridas configuradas
          horasExtensionRequeridas: p.horasExtensionRequeridas ?? 20,
        };
      }),
    );

    estudiantesConHoras.sort((a, b) => a.horasExtension - b.horasExtension);
    const estudiantesEnRiesgo = estudiantesConHoras.slice(0, 5);

    return {
      proyectosActivos,
      usuariosActivos,
      enRevision,
      cierrePendiente,
      usuariosBloqueados,
      nuevosInactivos2026,
      proyectosCerrados2026,
      actividadReciente,
      estudiantesEnRiesgo,
    };
  }

  // ─── Lista de usuarios (T-89) ─────────────────────────────────────────────────

  async getListaUsuarios(callerId: number, query: ListAdminUsersQueryDto) {
    await this.requireAdmin(callerId);

    const { page, limit } = this.normalizePagination(query.page, query.limit);
    const skip = (page - 1) * limit;

    const where: Prisma.UsuarioWhereInput = {};

    if (query.search) {
      where.OR = [
        { nombre: { contains: query.search, mode: 'insensitive' } },
        { apellido: { contains: query.search, mode: 'insensitive' } },
        { correo: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.rol) {
      where.rolesAcceso = { some: { rolAcceso: { nombrePerfil: query.rol } } };
    }

    const estadosValidos: EstadoUsuario[] = [
      EstadoUsuario.ACTIVO,
      EstadoUsuario.INACTIVO,
      EstadoUsuario.BLOQUEADO,
    ];
    if (query.estado && estadosValidos.includes(query.estado as EstadoUsuario)) {
      where.estado = query.estado as EstadoUsuario;
    }

    if (query.year) {
      const year = Number(query.year);
      if (!isNaN(year) && year >= 2000) {
        where.fechaCreacion = {
          gte: new Date(`${year}-01-01T00:00:00.000Z`),
          lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
        };
      }
    }

    const [total, usuarios] = await Promise.all([
      this.prisma.usuario.count({ where }),
      this.prisma.usuario.findMany({
        where,
        skip,
        take: limit,
        orderBy: { fechaCreacion: 'desc' },
        select: {
          idUsuario: true,
          nombre: true,
          apellido: true,
          correo: true,
          fotoUrl: true,
          estado: true,
          fechaCreacion: true,
          rolesAcceso: {
            select: { rolAcceso: { select: { nombrePerfil: true } } },
          },
        },
      }),
    ]);

    const data = usuarios.map((u) => ({
      idUsuario: u.idUsuario,
      nombre: u.nombre,
      apellido: u.apellido,
      correo: u.correo,
      fotoUrl: u.fotoUrl,
      estado: u.estado,
      roles: u.rolesAcceso.map((r) => r.rolAcceso.nombrePerfil),
      fechaCreacion: u.fechaCreacion.toISOString(),
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Detalle de usuario (T-89) ────────────────────────────────────────────────

  async getUsuarioDetalle(callerId: number, targetId: number) {
    await this.requireAdmin(callerId);

    const user = await this.prisma.usuario.findUnique({
      where: { idUsuario: targetId },
      select: {
        idUsuario: true,
        nombre: true,
        apellido: true,
        correo: true,
        fotoUrl: true,
        estado: true,
        fechaCreacion: true,
        fechaUltimaSesion: true,
        rolesAcceso: {
          select: { rolAcceso: { select: { nombrePerfil: true } } },
        },
      },
    });

    if (!user) throw new NotFoundException(`Usuario ${targetId} no encontrado`);

    const roles = user.rolesAcceso.map((r) => r.rolAcceso.nombrePerfil);

    const base = {
      idUsuario: user.idUsuario,
      nombre: user.nombre,
      apellido: user.apellido,
      correo: user.correo,
      fotoUrl: user.fotoUrl,
      estado: user.estado,
      roles,
      fechaCreacion: user.fechaCreacion.toISOString(),
      fechaUltimaSesion: user.fechaUltimaSesion?.toISOString() ?? null,
    };

    const [
      perfilEstudiante,
      actividadEstudiante,
      actividadMentor,
      actividadLider,
      actividadCoordinador,
    ] = await Promise.all([
      roles.includes('estudiante') ? this.getPerfilEstudiante(targetId) : null,
      roles.includes('estudiante') ? this.getActividadEstudiante(targetId) : null,
      roles.includes('mentor') ? this.getActividadMentor(targetId) : null,
      roles.includes('lider_asociacion') ? this.getActividadLider(targetId) : null,
      roles.includes('coordinador_academico') ? this.getActividadCoordinador(targetId) : null,
    ]);

    const actividadAdmin = roles.includes('administrador')
      ? { puedeGestionarUsuarios: true, puedeRevisarProyectos: true }
      : null;

    return {
      ...base,
      perfilEstudiante,
      actividadEstudiante,
      actividadMentor,
      actividadLider,
      actividadCoordinador,
      actividadAdmin,
    };
  }

  private async getPerfilEstudiante(userId: number) {
    const perfil = await this.prisma.perfilEstudiante.findUnique({
      where: { idUsuario: userId },
      select: {
        carne: true,
        semestre: true,
        disponibilidadHorasSemana: true,
        horasBecaRequeridas: true,
        horasExtensionRequeridas: true,
        carrera: { select: { nombreCarrera: true } },
      },
    });

    if (!perfil) return null;

    return {
      carrera: perfil.carrera?.nombreCarrera ?? null,
      carne: perfil.carne,
      semestre: perfil.semestre,
      disponibilidadHorasSemana: perfil.disponibilidadHorasSemana,
      horasBecaRequeridas: perfil.horasBecaRequeridas,
      // fallback 20 si el perfil no tiene horasExtensionRequeridas configuradas
      horasExtensionRequeridas: perfil.horasExtensionRequeridas ?? 20,
    };
  }

  private async getActividadEstudiante(userId: number) {
    const [participacionesActivas, horasBecaResult, horasExtResult, postulacionesGrupos] =
      await Promise.all([
        this.prisma.participacionProyecto.count({
          where: { idUsuario: userId, estadoParticipacion: EstadoParticipacion.ACTIVO },
        }),
        this.prisma.horasParticipacion.aggregate({
          where: {
            participacion: {
              idUsuario: userId,
              rolProyecto: { proyecto: { tipoProyecto: TipoProyecto.ACADEMICO_HORAS_BECA } },
            },
            estadoHoras: EstadoHoras.APROBADA,
          },
          _sum: { horasAprobadas: true },
        }),
        this.prisma.horasParticipacion.aggregate({
          where: {
            participacion: {
              idUsuario: userId,
              rolProyecto: { proyecto: { tipoProyecto: TipoProyecto.EXTRACURRICULAR_EXTENSION } },
            },
            estadoHoras: EstadoHoras.APROBADA,
          },
          _sum: { horasAprobadas: true },
        }),
        this.prisma.postulacion.groupBy({
          by: ['estadoPostulacion'],
          where: { idUsuarioPostulante: userId },
          _count: { _all: true },
        }),
      ]);

    const postMap = Object.fromEntries(
      postulacionesGrupos.map((p) => [p.estadoPostulacion, p._count._all]),
    );

    return {
      participacionesActivas,
      horasBecaAcumuladas: Number(horasBecaResult._sum.horasAprobadas ?? 0),
      horasExtensionAcumuladas: Number(horasExtResult._sum.horasAprobadas ?? 0),
      postulaciones: {
        pendientes: postMap[EstadoPostulacion.PENDIENTE] ?? 0,
        aceptadas: postMap[EstadoPostulacion.ACEPTADA] ?? 0,
        rechazadas: postMap[EstadoPostulacion.RECHAZADA] ?? 0,
      },
    };
  }

  private async getActividadMentor(userId: number) {
    // No hay modelo explícito de mentoría: se usa ParticipacionProyecto
    const participaciones = await this.prisma.participacionProyecto.findMany({
      where: { idUsuario: userId },
      select: {
        estadoParticipacion: true,
        rolProyecto: {
          select: {
            proyecto: {
              select: {
                idProyecto: true,
                tituloProyecto: true,
                estadoProyecto: true,
              },
            },
          },
        },
      },
      take: 20,
    });

    const proyectosMap = new Map<
      number,
      { idProyecto: number; tituloProyecto: string; estadoProyecto: EstadoProyecto }
    >();
    for (const p of participaciones) {
      const proj = p.rolProyecto.proyecto;
      proyectosMap.set(proj.idProyecto, proj);
    }
    const proyectos = [...proyectosMap.values()];

    return {
      proyectosDondeParticipa: proyectos.length,
      estudiantesMentorizados: 0, // fallback: no hay relación mentor-estudiante explícita en el schema
      proyectosActivos: proyectos.filter((p) =>
        ([EstadoProyecto.PUBLICADO, EstadoProyecto.EN_PROGRESO] as EstadoProyecto[]).includes(
          p.estadoProyecto,
        ),
      ).length,
      proyectosCerrados: proyectos.filter((p) => p.estadoProyecto === EstadoProyecto.CERRADO)
        .length,
      proyectosAsociados: proyectos.slice(0, 5).map((p) => ({
        idProyecto: p.idProyecto,
        tituloProyecto: p.tituloProyecto,
        estadoProyecto: p.estadoProyecto,
        rol: 'Mentor',
      })),
    };
  }

  private async getActividadLider(userId: number) {
    const [proyectosCreados, proyectosActivos, proyectosCerrados, postulacionesPendientes, proyectosRecientesRaw] =
      await Promise.all([
        this.prisma.proyecto.count({
          where: { creadoPor: userId, eliminadoEn: null },
        }),
        this.prisma.proyecto.count({
          where: {
            creadoPor: userId,
            estadoProyecto: { in: [EstadoProyecto.PUBLICADO, EstadoProyecto.EN_PROGRESO] },
            eliminadoEn: null,
          },
        }),
        this.prisma.proyecto.count({
          where: {
            creadoPor: userId,
            estadoProyecto: EstadoProyecto.CERRADO,
            eliminadoEn: null,
          },
        }),
        this.prisma.postulacion.count({
          where: {
            estadoPostulacion: EstadoPostulacion.PENDIENTE,
            rolProyecto: { proyecto: { creadoPor: userId } },
          },
        }),
        this.prisma.proyecto.findMany({
          where: { creadoPor: userId, eliminadoEn: null },
          orderBy: { fechaCreacion: 'desc' },
          take: 5,
          select: {
            idProyecto: true,
            tituloProyecto: true,
            estadoProyecto: true,
            roles: {
              select: {
                postulaciones: {
                  where: { estadoPostulacion: EstadoPostulacion.PENDIENTE },
                  select: { idPostulacion: true },
                },
              },
            },
          },
        }),
      ]);

    const proyectosRecientes = proyectosRecientesRaw.map((p) => ({
      idProyecto: p.idProyecto,
      tituloProyecto: p.tituloProyecto,
      estadoProyecto: p.estadoProyecto,
      postulacionesPendientes: p.roles.reduce((acc, r) => acc + r.postulaciones.length, 0),
    }));

    return {
      proyectosCreados,
      proyectosActivos,
      proyectosCerrados,
      postulacionesPendientes,
      proyectosRecientes,
    };
  }

  private async getActividadCoordinador(userId: number) {
    // Coordinadores se identifican mediante RevisionProyecto.idRevisor
    const revisiones = await this.prisma.revisionProyecto.findMany({
      where: { idRevisor: userId },
      select: {
        proyecto: {
          select: {
            idProyecto: true,
            tituloProyecto: true,
            estadoProyecto: true,
            eliminadoEn: true,
          },
        },
      },
    });

    const proyectosMap = new Map<
      number,
      { idProyecto: number; tituloProyecto: string; estadoProyecto: EstadoProyecto }
    >();
    for (const rev of revisiones) {
      const proj = rev.proyecto;
      if (!proj.eliminadoEn) {
        proyectosMap.set(proj.idProyecto, {
          idProyecto: proj.idProyecto,
          tituloProyecto: proj.tituloProyecto,
          estadoProyecto: proj.estadoProyecto,
        });
      }
    }
    const proyectos = [...proyectosMap.values()];

    // estudiantesVinculados: usuarios con participaciones cuyas horas aprobó este coordinador
    const participacionesConHorasAprobadas = await this.prisma.participacionProyecto.findMany({
      where: {
        registrosHoras: { some: { aprobadoPor: userId } },
      },
      select: { idUsuario: true },
      distinct: ['idUsuario'],
    });
    const estudiantesVinculados = participacionesConHorasAprobadas.length;

    return {
      proyectosSupervisados: proyectos.length,
      proyectosActivos: proyectos.filter((p) =>
        ([EstadoProyecto.PUBLICADO, EstadoProyecto.EN_PROGRESO] as EstadoProyecto[]).includes(
          p.estadoProyecto,
        ),
      ).length,
      proyectosCerrados: proyectos.filter((p) => p.estadoProyecto === EstadoProyecto.CERRADO)
        .length,
      estudiantesVinculados,
      proyectosRecientes: proyectos.slice(0, 5).map((p) => ({
        idProyecto: p.idProyecto,
        tituloProyecto: p.tituloProyecto,
        estadoProyecto: p.estadoProyecto,
      })),
    };
  }

  // ─── Cambio de estado de usuario (T-89) ───────────────────────────────────────

  async updateUsuarioEstado(callerId: number, targetId: number, estado: EstadoUsuario) {
    await this.requireAdmin(callerId);

    if (callerId === targetId) {
      throw new ForbiddenException('No puedes cambiar tu propio estado');
    }

    const user = await this.prisma.usuario.findUnique({
      where: { idUsuario: targetId },
      select: {
        idUsuario: true,
        nombre: true,
        apellido: true,
        correo: true,
        estado: true,
        fechaCreacion: true,
        rolesAcceso: {
          select: { rolAcceso: { select: { nombrePerfil: true } } },
        },
      },
    });

    if (!user) throw new NotFoundException(`Usuario ${targetId} no encontrado`);

    const esAdmin = user.rolesAcceso.some((r) => r.rolAcceso.nombrePerfil === 'administrador');
    if (esAdmin) {
      throw new ForbiddenException('No se puede cambiar el estado de un usuario administrador');
    }

    const updated = await this.prisma.usuario.update({
      where: { idUsuario: targetId },
      data: { estado },
      select: {
        idUsuario: true,
        nombre: true,
        apellido: true,
        correo: true,
        estado: true,
        fechaCreacion: true,
        rolesAcceso: {
          select: { rolAcceso: { select: { nombrePerfil: true } } },
        },
      },
    });

    return {
      idUsuario: updated.idUsuario,
      nombre: updated.nombre,
      apellido: updated.apellido,
      correo: updated.correo,
      estado: updated.estado,
      roles: updated.rolesAcceso.map((r) => r.rolAcceso.nombrePerfil),
      fechaCreacion: updated.fechaCreacion.toISOString(),
    };
  }
}
