import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { addDaysToDay, GUATEMALA_TIME_ZONE, todayInGuatemala } from '../common/utils/guatemala-date';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { HorasSemestreService, inicioDeDia, type TipoHoras } from './horas-semestre.service';

/** Una vez por semana (MEJ-13) y una vez cada 3 dias (MEJ-60): el siguiente aviso cae 7 y 3 dias despues. */
export const DIAS_ENTRE_AVISOS_RIESGO = 7;
export const DIAS_ENTRE_RECORDATORIOS_HORAS = 3;
/** Dias sin registrar horas para recordar (MEJ-60). */
export const DIAS_SIN_REGISTRAR = 3;

/**
 * MEJ-13 y MEJ-60: avisos diarios (9:00 Guatemala) sobre las horas del estudiante.
 * La frecuencia se controla con las propias notificaciones guardadas, sin estado nuevo:
 * quien desactivo el tipo (HU-185) no recibe nada y se reevalua en cada corrida.
 */
@Injectable()
export class HorasAvisosService {
  private readonly logger = new Logger(HorasAvisosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly horas: HorasSemestreService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 9 * * *', { timeZone: GUATEMALA_TIME_ZONE })
  async correr(): Promise<void> {
    // Funciones, no promesas: un rechazo de la segunda no debe quedar sin handler mientras corre la primera.
    for (const tarea of [() => this.avisarEnRiesgo(), () => this.recordarRegistroDeHoras()]) {
      try {
        await tarea();
      } catch (error) {
        this.logger.warn(`Fallo en el aviso de horas: ${(error as Error)?.message ?? error}`);
      }
    }
  }

  /** Usuarios que ya recibieron este tipo desde `desde`. */
  private async yaAvisados(tipo: 'HORAS_EN_RIESGO' | 'RECORDATORIO_HORAS', desde: Date, ids: number[]) {
    const filas = await this.prisma.notificacion.findMany({
      where: { tipoNotificacion: tipo, creadaEn: { gte: desde }, idUsuario: { in: ids } },
      distinct: ['idUsuario'],
      select: { idUsuario: true },
    });
    return new Set(filas.map((f) => f.idUsuario));
  }

  /** MEJ-13: estudiantes cuyo avance del semestre esta en riesgo; maximo un aviso por semana. */
  async avisarEnRiesgo(hoy = todayInGuatemala()): Promise<number> {
    const enRiesgo = new Map<number, Set<'beca' | 'extension'>>();
    for (const tipo of ['BECA', 'EXTENSION'] as TipoHoras[]) {
      const { filas } = await this.horas.recorrerTodas({ enRiesgo: true, tipo });
      for (const f of filas) {
        const set = enRiesgo.get(f.idUsuario) ?? new Set();
        set.add(tipo === 'BECA' ? 'beca' : 'extension');
        enRiesgo.set(f.idUsuario, set);
      }
    }
    if (enRiesgo.size === 0) return 0;
    const desde = inicioDeDia(addDaysToDay(hoy, -(DIAS_ENTRE_AVISOS_RIESGO - 1)));
    const avisados = await this.yaAvisados('HORAS_EN_RIESGO', desde, [...enRiesgo.keys()]);
    let enviados = 0;
    for (const [idUsuario, tipos] of enRiesgo) {
      if (avisados.has(idUsuario)) continue;
      await this.notifications.notifyFromTemplate([idUsuario], 'HORAS_EN_RIESGO', { tipos: [...tipos].sort() });
      enviados++;
    }
    return enviados;
  }

  /**
   * MEJ-60: tareas EN_PROGRESO donde aun se pueden registrar horas (mismas condiciones que time-records create),
   * asignadas hace 3+ dias y sin horas propias en esa tarea en 3 dias; maximo un recordatorio cada 3 dias.
   */
  async recordarRegistroDeHoras(hoy = todayInGuatemala()): Promise<number> {
    const desdeSinRegistrar = addDaysToDay(hoy, -(DIAS_SIN_REGISTRAR - 1));
    const candidatas = await this.prisma.asignacionTarea.findMany({
      where: {
        desasignadaEn: null,
        fechaAsignacion: { lt: inicioDeDia(desdeSinRegistrar) },
        usuario: { estado: 'ACTIVO' },
        origenReporte: 'GRANULAR',
        reconocidoEn: null,
        // Sin participacion = tarea autoasignada del lider; se valida contra proyecto.creadoPor mas abajo.
        OR: [{ participacion: { estadoParticipacion: 'ACTIVO' } }, { idParticipacion: null }],
        tarea: {
          estadoTarea: 'EN_PROGRESO',
          eliminadoEn: null,
          proyecto: { eliminadoEn: null, estadoProyecto: { in: ['PUBLICADO', 'EN_PROGRESO'] }, sprints: { some: { estado: 'ACTIVO' } } },
          // assertWriteTx exige siempre un sprint ACTIVO en el proyecto; ademas, si la tarea tiene sprint, debe ser ese.
          OR: [{ idSprint: null }, { sprint: { estado: 'ACTIVO' } }],
        },
      },
      orderBy: { fechaAsignacion: 'asc' },
      select: {
        idAsignacion: true,
        idUsuario: true,
        idParticipacion: true,
        tarea: { select: { idTarea: true, idProyecto: true, tituloTarea: true, proyecto: { select: { creadoPor: true } } } },
      },
    });
    const registrables = candidatas.filter((a) => a.idParticipacion !== null || a.tarea.proyecto.creadoPor === a.idUsuario);
    if (registrables.length === 0) return 0;

    const idsUsuario = [...new Set(registrables.map((a) => a.idUsuario))];
    const [conRegistro, avisados] = await Promise.all([
      this.prisma.registroTiempoTarea.findMany({
        where: {
          idAsignacion: { in: registrables.map((a) => a.idAsignacion) },
          revocadoEn: null,
          fecha: { gte: new Date(`${desdeSinRegistrar}T00:00:00Z`) },
        },
        distinct: ['idAsignacion'],
        select: { idAsignacion: true },
      }),
      this.yaAvisados('RECORDATORIO_HORAS', inicioDeDia(addDaysToDay(hoy, -(DIAS_ENTRE_RECORDATORIOS_HORAS - 1))), idsUsuario),
    ]);
    const conHoras = new Set(conRegistro.map((r) => r.idAsignacion));
    const porUsuario = new Map<number, typeof registrables>();
    for (const a of registrables) {
      if (conHoras.has(a.idAsignacion) || avisados.has(a.idUsuario)) continue;
      const lista = porUsuario.get(a.idUsuario);
      if (lista) lista.push(a);
      else porUsuario.set(a.idUsuario, [a]);
    }
    let enviados = 0;
    for (const [idUsuario, lista] of porUsuario) {
      const { idTarea, idProyecto, tituloTarea } = lista[0].tarea;
      await this.notifications.notifyFromTemplate([idUsuario], 'RECORDATORIO_HORAS', {
        cantidad: lista.length,
        taskTitle: tituloTarea,
        taskId: idTarea,
        projectId: idProyecto,
      });
      enviados++;
    }
    return enviados;
  }
}
