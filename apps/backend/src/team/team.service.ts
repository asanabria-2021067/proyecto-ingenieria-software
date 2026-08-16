import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationsService } from '../applications/applications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamSummaryMemberDto, TeamSummaryRoleDto } from './dto/team-summary-member.dto';
import { TeamSummaryResponseDto } from './dto/team-summary-response.dto';

type ApplicationSummary = Awaited<ReturnType<ApplicationsService['findAll']>>[number];

@Injectable()
export class TeamService {
  constructor(
    private prisma: PrismaService,
    private applicationsService: ApplicationsService,
  ) {}

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
    await this.requireOwner(idProyecto, userId);

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
   * (GET /proyectos/:id/miembros/resumen). Contrato congelado en
   * team-summary-member.dto.ts / team-summary-response.dto.ts.
   * O(1) queries respecto al número de integrantes: requireOwner, líder,
   * participaciones, tareas y horas se resuelven cada una en una única
   * consulta fija; nunca dentro de un loop por miembro.
   */
  async getTeamSummary(idProyecto: number, userId: number): Promise<TeamSummaryResponseDto> {
    const proyecto = await this.requireOwner(idProyecto, userId);

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

    // Participaciones del proyecto, excluyendo al creador: el líder se
    // modela por separado (lider) y nunca debe duplicarse dentro de miembros
    // aunque además tenga una ParticipacionProyecto propia. B12 incluye
    // activas y retiradas para clasificar a cada persona en el resumen.
    const participaciones = await this.prisma.participacionProyecto.findMany({
      where: {
        rolProyecto: { idProyecto },
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
          grupo:
            p.estadoParticipacion === 'ACTIVO'
              ? 'ACTIVOS'
              : 'RETIRADOS_SIN_CONTRIBUCION',
          tareasActivas: 0,
          tareasCompletadas: 0,
          horasReconocidas: 0,
        };
        miembrosPorUsuario.set(p.idUsuario, miembro);
      } else if (p.estadoParticipacion === 'ACTIVO') {
        miembro.estadoParticipacion = 'ACTIVO';
        miembro.grupo = 'ACTIVOS';
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

    // Contribución histórica B12: existencia de al menos un tramo de
    // AsignacionTarea del usuario dentro del proyecto con horasReales no
    // null. Se resuelve en una única query batch para todos los usuarios
    // (semántica EXISTS por persona, sin round-trips por integrante).
    const contribuciones = await this.prisma.asignacionTarea.findMany({
      where: {
        idUsuario: { in: idsUsuarios },
        horasReales: { not: null },
        tarea: { idProyecto },
      },
      select: { idUsuario: true },
      distinct: ['idUsuario'],
    });

    const usuariosConContribucion = new Set(contribuciones.map((c) => c.idUsuario));
    for (const idUsuario of usuariosConContribucion) {
      const miembro = miembrosPorUsuario.get(idUsuario);
      if (!miembro || miembro.grupo === 'ACTIVOS') continue;
      miembro.grupo = 'RETIRADOS_CON_CONTRIBUCION';
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

  async getPendingPostulations(
    idProyecto: number,
    userId: number,
  ): Promise<ApplicationSummary[]> {
    await this.requireOwner(idProyecto, userId);

    const postulaciones = await this.applicationsService.findAll();
    return postulaciones.filter(
      (postulacion) =>
        postulacion.estadoPostulacion === 'PENDIENTE' &&
        postulacion.rolProyecto.proyecto.idProyecto === idProyecto,
    );
  }

  private async requireOwner(idProyecto: number, userId: number) {
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
}
