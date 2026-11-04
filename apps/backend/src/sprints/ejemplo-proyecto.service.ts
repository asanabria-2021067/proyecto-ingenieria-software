import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoSprint, Prioridad } from '@prisma/client';
import { addDaysToDay, todayInGuatemala } from '../common/utils/guatemala-date';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectTransactionService } from '../common/project-policy/project-transaction.service';
import { PrismaService } from '../prisma/prisma.service';
import { SprintsAuthorizationService } from './sprints-authorization.service';
import { SprintsContextService } from './sprints-context.service';

const DIAS_SPRINT_EJEMPLO = 14;

const TAREAS_EJEMPLO = [
  { tituloTarea: 'Ejemplo: definir los objetivos del proyecto', prioridad: Prioridad.ALTA, puntosHistoria: 2 },
  { tituloTarea: 'Ejemplo: repartir los roles del equipo', prioridad: Prioridad.MEDIA, puntosHistoria: 3 },
  { tituloTarea: 'Ejemplo: planificar la primera entrega', prioridad: Prioridad.MEDIA, puntosHistoria: 5 },
  { tituloTarea: 'Ejemplo: registrar las horas de la semana', prioridad: Prioridad.BAJA, puntosHistoria: 1 },
].map((t) => ({
  ...t,
  descripcionTarea: 'Tarea de ejemplo para que conozcas el tablero. Puedes editarla o borrar todo el ejemplo de una vez.',
}));

/** MEJ-89: Sprint y tareas de ejemplo para el líder de su primer proyecto, borrables de una vez. */
@Injectable()
export class EjemploProyectoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly authorization: SprintsAuthorizationService,
    private readonly context: SprintsContextService,
  ) {}

  async estado(projectId: number, userId: number) {
    await this.context.assertProjectLeader(projectId, userId);
    const sprint = await this.prisma.sprint.findFirst({
      where: { idProyecto: projectId, esEjemplo: true },
      select: { idSprint: true },
    });
    return { existe: sprint !== null, idSprint: sprint?.idSprint ?? null };
  }

  /** Idempotente: si el ejemplo ya existe lo devuelve sin crear otro. */
  async crear(projectId: number, userId: number) {
    return this.projectTx.run(projectId, userId, 'sprints.crearEjemplo', async ({ tx, project }) => {
      await this.authorization.assertCanStartSprint(projectId, userId, tx);
      const existente = await tx.sprint.findFirst({
        where: { idProyecto: projectId, esEjemplo: true },
        select: { idSprint: true },
      });
      if (existente) return { creado: false, idSprint: existente.idSprint };

      if (!project) throw new NotFoundException('Proyecto no encontrado');
      await this.policy.assertWriteTx(tx, project, 'SPRINT_START', userId);
      if (await this.context.getCurrentSprint(projectId, tx)) {
        throw new ConflictException('Ya existe un Sprint activo o en finalización para este proyecto');
      }

      const ultimo = await tx.sprint.findFirst({
        where: { idProyecto: projectId },
        orderBy: { numero: 'desc' },
        select: { numero: true },
      });
      const sprint = await tx.sprint.create({
        data: {
          idProyecto: projectId,
          numero: (ultimo?.numero ?? 0) + 1,
          estado: EstadoSprint.ACTIVO,
          fechaFinPlaneada: new Date(`${addDaysToDay(todayInGuatemala(), DIAS_SPRINT_EJEMPLO)}T00:00:00.000Z`),
          esEjemplo: true,
        },
      });
      await tx.tarea.createMany({
        data: TAREAS_EJEMPLO.map((t, orden) => ({
          ...t,
          orden,
          idProyecto: projectId,
          idSprint: sprint.idSprint,
          creadaPor: userId,
          esEjemplo: true,
        })),
      });
      return { creado: true, idSprint: sprint.idSprint };
    });
  }

  /** Borra las tareas de ejemplo y, si sigue activo y sin reconocimientos, el Sprint de ejemplo (lo ajeno que contenga vuelve al backlog). */
  async eliminar(projectId: number, userId: number) {
    return this.projectTx.run(projectId, userId, 'sprints.eliminarEjemplo', async ({ tx, project }) => {
      await this.authorization.assertCanStartSprint(projectId, userId, tx);
      if (!project) throw new NotFoundException('Proyecto no encontrado');
      await this.policy.assertWriteTx(tx, project, 'SPRINT_START', userId);
      const ahora = new Date();
      const tareas = await tx.tarea.findMany({
        where: { idProyecto: projectId, esEjemplo: true, eliminadoEn: null },
        select: { idTarea: true },
      });
      const ids = tareas.map((t) => t.idTarea);
      await tx.asignacionTarea.updateMany({
        where: { idTarea: { in: ids }, desasignadaEn: null },
        data: { desasignadaEn: ahora },
      });
      await tx.tarea.updateMany({ where: { idTarea: { in: ids } }, data: { eliminadoEn: ahora } });

      const sprint = await tx.sprint.findFirst({
        where: { idProyecto: projectId, esEjemplo: true, estado: EstadoSprint.ACTIVO },
        select: { idSprint: true },
      });
      // Si alguien ya reconoció a un compañero en este Sprint son datos reales: se conserva el Sprint.
      const conservar = sprint ? (await tx.reconocimientoCompanero.count({ where: { idSprint: sprint.idSprint } })) > 0 : false;
      if (sprint && !conservar) {
        await tx.tarea.updateMany({ where: { idSprint: sprint.idSprint }, data: { idSprint: null } });
        await tx.instantaneaSprint.deleteMany({ where: { idSprint: sprint.idSprint } });
        await tx.sprint.delete({ where: { idSprint: sprint.idSprint } });
      }
      return { tareasEliminadas: ids.length, sprintEliminado: sprint !== null && !conservar };
    });
  }
}
