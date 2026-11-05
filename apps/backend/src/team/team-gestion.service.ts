import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { addDaysToDay, todayInGuatemala } from '../common/utils/guatemala-date';
import { coordinadorCubreProyecto } from '../coordinador/coordinador-alcance';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatCanalesService } from '../chat/chat-canales.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectTransactionService } from '../common/project-policy/project-transaction.service';
import { PrismaService } from '../prisma/prisma.service';
import { TimeRecordsService } from '../time-records/time-records.service';

const SIN_PERMISO = 'Solo administración puede dar de baja a un integrante';
const SIN_PERMISO_ADMIN = 'Solo un administrador puede dar de baja a otro administrador';
const SIN_PERMISO_CARGA = 'Solo el líder, la administración o el coordinador del alcance pueden ver la carga del equipo';

/** MEJ-104 (carga del equipo) y MEJ-105 (baja de un integrante por administración). */
@Injectable()
export class TeamGestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeRecords: TimeRecordsService,
    private readonly bitacora: BitacoraEventosService,
    private readonly notifications: NotificationsService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly chatCanales?: ChatCanalesService,
  ) {}

  private async tieneRol(idUsuario: number, nombrePerfil: string) {
    const fila = await this.prisma.usuarioRolAcceso.findFirst({
      where: { idUsuario, rolAcceso: { nombrePerfil } },
      select: { idUsuarioRolAcceso: true },
    });
    return fila !== null;
  }

  /** Administrador, o coordinador académico cuyo alcance cubre el proyecto (sin participar ni liderarlo). */
  private async administraProyecto(actorId: number, idProyecto: number) {
    if (await this.tieneRol(actorId, 'administrador')) return true;
    return (await this.tieneRol(actorId, 'coordinador_academico')) && coordinadorCubreProyecto(this.prisma, actorId, idProyecto);
  }

  async darDeBaja(idProyecto: number, idUsuario: number, actorId: number, motivo: string) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { idProyecto },
      select: { creadoPor: true, tituloProyecto: true },
    });
    if (!proyecto) throw new NotFoundException('Proyecto no encontrado');
    if (!(await this.administraProyecto(actorId, idProyecto))) throw new ForbiddenException(SIN_PERMISO);

    const resultado = await this.projectTx.run(idProyecto, actorId, 'team.baja', async ({ tx, project }) => {
      await this.policy.assertWriteTx(tx, project!, 'BAJA_INTEGRANTE', actorId);
      // El proyecto va en el filtro: un idUsuario ajeno al proyecto es 404 (IDOR).
      const participaciones = await tx.participacionProyecto.findMany({
        where: { idUsuario, rolProyecto: { idProyecto } },
        select: { idParticipacion: true, estadoParticipacion: true },
      });
      if (participaciones.length === 0) throw new NotFoundException('El usuario no participa en este proyecto');
      if ((await this.tieneRol(idUsuario, 'administrador')) && !(await this.tieneRol(actorId, 'administrador'))) {
        throw new ForbiddenException(SIN_PERMISO_ADMIN);
      }
      if (proyecto.creadoPor === idUsuario) {
        throw new BadRequestException('No se puede dar de baja al líder; cambia primero el liderazgo');
      }
      const activas = participaciones.filter((p) => p.estadoParticipacion === 'ACTIVO').map((p) => p.idParticipacion);
      if (activas.length === 0) throw new ConflictException('El integrante ya fue dado de baja');

      const ahora = new Date();
      const baja = await tx.participacionProyecto.updateMany({
        where: { idParticipacion: { in: activas }, estadoParticipacion: 'ACTIVO' },
        data: { estadoParticipacion: 'RETIRADO', fechaSalida: ahora, motivoBaja: motivo, bajaPor: actorId },
      });
      if (baja.count !== activas.length) throw new ConflictException('El integrante ya fue dado de baja');

      // Solo las tareas abiertas pierden responsable; el tramo cerrado conserva sus horas y el historial.
      const asignaciones = await tx.asignacionTarea.findMany({
        where: {
          idUsuario,
          desasignadaEn: null,
          // C056: solo tramos de tareas del Sprint ACTIVO; los de Sprints cerrados o del backlog no se reescriben.
          tarea: { idProyecto, eliminadoEn: null, estadoTarea: { not: 'HECHO' }, sprint: { estado: 'ACTIVO' } },
        },
        select: { idAsignacion: true, idTarea: true, origenReporte: true, reconocidoEn: true },
      });
      for (const a of asignaciones) {
        if (a.origenReporte === 'GRANULAR' && a.reconocidoEn === null) {
          await this.timeRecords.recalculateAssignment(tx, a.idAsignacion);
        }
      }
      await tx.asignacionTarea.updateMany({
        where: { idAsignacion: { in: asignaciones.map((a) => a.idAsignacion) } },
        data: { desasignadaEn: ahora },
      });

      // MEJ-109: como responsable adicional sale de TODAS las tareas abiertas del proyecto (no solo las del Sprint ACTIVO).
      const adicionales = await tx.tareaResponsable.deleteMany({
        where: { idUsuario, tarea: { idProyecto, eliminadoEn: null, estadoTarea: { not: 'HECHO' } } },
      });

      const tareasSinAsignar = asignaciones.map((a) => a.idTarea);
      await this.bitacora.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.PARTICIPATION_REMOVED,
        idActor: actorId,
        idProyecto,
        tipoEntidad: 'PROYECTO',
        idEntidad: idProyecto,
        valorAnterior: { estadoParticipacion: 'ACTIVO' },
        valorNuevo: { idUsuario, estadoParticipacion: 'RETIRADO', motivo, participaciones: activas, tareasSinAsignar, adicionales: adicionales.count },
      });
      await this.notifications.notifyUsers(
        [idUsuario],
        {
          tipoNotificacion: 'PARTICIPACION_ACTUALIZADA',
          tituloNotificacion: 'Fuiste dado de baja de un proyecto',
          mensajeNotificacion: `Administración te dio de baja de "${proyecto.tituloProyecto}". Motivo: ${motivo}. Tus horas registradas se conservan.`,
          datosJson: { projectId: idProyecto, projectTitle: proyecto.tituloProyecto, approved: false, baja: true },
        },
        tx,
      );
      return { participacionesRetiradas: activas.length, tareasSinAsignar: tareasSinAsignar.length, fechaSalida: ahora };
    });

    // El dado de baja sale de los canales del proyecto.
    await this.chatCanales?.sincronizarSinFallar(idProyecto);
    return { idProyecto, idUsuario, estadoParticipacion: 'RETIRADO' as const, ...resultado };
  }

  async cargaEquipo(idProyecto: number, actorId: number) {
    const proyecto = await this.prisma.proyecto.findUnique({ where: { idProyecto }, select: { creadoPor: true } });
    if (!proyecto) throw new NotFoundException('Proyecto no encontrado');
    if (proyecto.creadoPor !== actorId && !(await this.administraProyecto(actorId, idProyecto))) {
      throw new ForbiddenException(SIN_PERMISO_CARGA);
    }

    const hoy = todayInGuatemala();
    const lunes = addDaysToDay(hoy, -((new Date(`${hoy}T00:00:00Z`).getUTCDay() + 6) % 7));
    const semana = { desde: lunes, hasta: addDaysToDay(lunes, 6) };
    const [sprint, integrantes] = await Promise.all([
      this.prisma.sprint.findFirst({ where: { idProyecto, estado: { in: ['ACTIVO', 'EN_FINALIZACION'] } }, select: { idSprint: true, numero: true } }),
      this.prisma.participacionProyecto.findMany({
        where: { estadoParticipacion: 'ACTIVO', rolProyecto: { idProyecto } },
        select: { usuario: { select: { idUsuario: true, nombre: true, apellido: true } } },
      }),
    ]);
    const usuarios = new Map(integrantes.map((i) => [i.usuario.idUsuario, i.usuario]));
    const ids = [...usuarios.keys()];

    const [abiertas, abiertasAdicional, registros] = await Promise.all([
      this.prisma.asignacionTarea.groupBy({
        by: ['idUsuario'],
        where: {
          idUsuario: { in: ids },
          desasignadaEn: null,
          tarea: { idProyecto, eliminadoEn: null, estadoTarea: { not: 'HECHO' } },
        },
        _count: { _all: true },
      }),
      // MEJ-109: las tareas abiertas donde es responsable adicional también cuentan en su carga.
      this.prisma.tareaResponsable.groupBy({
        by: ['idUsuario'],
        where: { idUsuario: { in: ids }, tarea: { idProyecto, eliminadoEn: null, estadoTarea: { not: 'HECHO' } } },
        _count: { _all: true },
      }),
      this.prisma.registroTiempoTarea.findMany({
        where: { idUsuario: { in: ids }, revocadoEn: null, asignacion: { tarea: { idProyecto } } },
        select: { idUsuario: true, horas: true, fecha: true, asignacion: { select: { tarea: { select: { idSprint: true } } } } },
      }),
    ]);

    const tareas = new Map(abiertas.map((a) => [a.idUsuario, a._count._all]));
    // El principal nunca figura como adicional de la misma tarea, así que las dos cuentas no se solapan.
    for (const a of abiertasAdicional) tareas.set(a.idUsuario, (tareas.get(a.idUsuario) ?? 0) + a._count._all);
    const horas = new Map<number, { semana: number; sprint: number }>();
    for (const r of registros) {
      const dia = r.fecha.toISOString().slice(0, 10);
      const acc = horas.get(r.idUsuario) ?? { semana: 0, sprint: 0 };
      if (dia >= semana.desde && dia <= semana.hasta) acc.semana += Number(r.horas);
      if (sprint && r.asignacion.tarea.idSprint === sprint.idSprint) acc.sprint += Number(r.horas);
      horas.set(r.idUsuario, acc);
    }

    return {
      semana,
      sprintActivo: sprint,
      integrantes: [...usuarios.values()].map((u) => ({
        idUsuario: u.idUsuario,
        nombre: u.nombre,
        apellido: u.apellido,
        tareasAbiertas: tareas.get(u.idUsuario) ?? 0,
        horasSemana: horas.get(u.idUsuario)?.semana ?? 0,
        horasSprint: horas.get(u.idUsuario)?.sprint ?? 0,
      })),
    };
  }
}
