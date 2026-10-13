import { Injectable } from '@nestjs/common';
import { EstadoSprint, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ADMIN_ACTIVE_PROJECT_STATES } from '../common/project-policy/admin-active-project-states';
import { dateOnlyToDay, todayInGuatemala } from '../common/utils/guatemala-date';
import { classifySprintTemporalStatus, type SituacionSprint } from './sprint-temporal-status';
import type {
  AdminSprintCalendarConteosDto,
  AdminSprintCalendarItemDto,
  AdminSprintCalendarResponseDto,
} from './dto/admin-sprint-calendar.dto';

/** Sprint operable: a lo sumo uno por proyecto (`sprint_operable_unique`). */
const SPRINT_OPERABLE: EstadoSprint[] = [EstadoSprint.ACTIVO, EstadoSprint.EN_FINALIZACION];

/** Ventana del resumen "próximos días": hoy (día 0) hasta hoy + 7, inclusive. */
const DIAS_PROXIMOS = 7;

/**
 * Proyección fija: metadata temporal del Sprint, identidad del proyecto y
 * mínimo del líder. Es un `select`, nunca un `include`: ninguna relación
 * operativa (tareas, horas, instantáneas) ni columna de cierre puede colarse
 * en la respuesta por añadir un campo al modelo.
 */
const CALENDAR_SELECT = {
  idSprint: true,
  numero: true,
  estado: true,
  fechaInicio: true,
  fechaFinPlaneada: true,
  fechaFinalizacionIniciada: true,
  fechaCierre: true,
  proyecto: {
    select: {
      idProyecto: true,
      tituloProyecto: true,
      creador: { select: { idUsuario: true, nombre: true, apellido: true } },
    },
  },
} satisfies Prisma.SprintSelect;

/** Lo que pide atención va primero; lo que no tiene plan, al final. */
const ORDEN_SITUACION: Record<SituacionSprint, number> = {
  PLAN_VENCIDO: 0,
  VENCE_HOY: 1,
  EN_CURSO: 2,
  EN_FINALIZACION: 3,
  SIN_FECHA: 4,
  FINALIZADO_ANTES: 5,
  FINALIZADO_EN_FECHA: 5,
  FINALIZADO_DESPUES: 5,
};

/**
 * Lectura transversal del calendario administrativo de Sprints.
 *
 * Da al administrador LECTURA de cuándo se espera que termine cada Sprint en
 * curso, sin abrirle el Sprint: no pasa por `ProjectReadPolicyService` (que
 * sigue limitándolo a Sprints cerrados en el detalle por proyecto) sino que,
 * como la bandeja administrativa, valida el perfil y devuelve un resumen de
 * proyección fija.
 *
 * Dos consultas por petición sin importar cuántos proyectos haya: la
 * verificación de administrador y un único `findMany`. La clasificación
 * temporal se hace en memoria con un mismo "hoy" de Guatemala para todos.
 */
@Injectable()
export class AdminSprintsCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: ProjectPolicyService,
  ) {}

  async getCalendar(actorId: number): Promise<AdminSprintCalendarResponseDto> {
    await this.policy.assertAdminTx(this.prisma as unknown as Prisma.TransactionClient, actorId);

    const sprints = await this.prisma.sprint.findMany({
      where: {
        estado: { in: SPRINT_OPERABLE },
        proyecto: {
          eliminadoEn: null,
          estadoProyecto: { in: [...ADMIN_ACTIVE_PROJECT_STATES] },
        },
      },
      select: CALENDAR_SELECT,
      orderBy: [{ fechaFinPlaneada: { sort: 'asc', nulls: 'last' } }, { idSprint: 'asc' }],
    });

    const hoy = todayInGuatemala();
    const conteos: AdminSprintCalendarConteosDto = {
      EN_CURSO: 0,
      VENCE_HOY: 0,
      PLAN_VENCIDO: 0,
      EN_FINALIZACION: 0,
      SIN_FECHA: 0,
    };
    let proximos7Dias = 0;

    const items = sprints.map((sprint): AdminSprintCalendarItemDto => {
      const { situacion, diasRestantes, desviacionDias } = classifySprintTemporalStatus(sprint, hoy);
      if (situacion in conteos) {
        conteos[situacion as keyof AdminSprintCalendarConteosDto] += 1;
      }
      // Solo trabajo en curso: un Sprint EN_FINALIZACION ya terminó el suyo.
      if (
        sprint.estado === EstadoSprint.ACTIVO &&
        diasRestantes !== null &&
        diasRestantes >= 0 &&
        diasRestantes <= DIAS_PROXIMOS
      ) {
        proximos7Dias += 1;
      }
      return {
        idSprint: sprint.idSprint,
        numero: sprint.numero,
        estado: sprint.estado,
        idProyecto: sprint.proyecto.idProyecto,
        tituloProyecto: sprint.proyecto.tituloProyecto,
        lider: {
          idUsuario: sprint.proyecto.creador.idUsuario,
          nombre: sprint.proyecto.creador.nombre,
          apellido: sprint.proyecto.creador.apellido,
        },
        fechaInicio: sprint.fechaInicio.toISOString(),
        fechaFinPlaneada: sprint.fechaFinPlaneada ? dateOnlyToDay(sprint.fechaFinPlaneada) : null,
        fechaFinalizacionIniciada: sprint.fechaFinalizacionIniciada?.toISOString() ?? null,
        fechaCierre: sprint.fechaCierre?.toISOString() ?? null,
        situacion,
        diasRestantes,
        desviacionDias,
      };
    });

    // `sort` es estable: dentro de cada situación se conserva el orden de la
    // consulta (plan ascendente, sin plan al final, `idSprint` como desempate).
    items.sort((a, b) => ORDEN_SITUACION[a.situacion] - ORDEN_SITUACION[b.situacion]);

    return {
      hoy,
      items,
      conteos,
      resumen: { proximos7Dias, planVencido: conteos.PLAN_VENCIDO },
    };
  }
}
