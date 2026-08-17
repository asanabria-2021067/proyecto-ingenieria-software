import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationUser,
  createIntegrationProject,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationTaskAssignment,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { SprintsService } from '../../src/sprints/sprints.service';
import { SprintsContextService } from '../../src/sprints/sprints-context.service';
import { SprintsAuthorizationService } from '../../src/sprints/sprints-authorization.service';

/**
 * Integración real A10: SprintsService.listSprints / getSprintDetail contra
 * PostgreSQL real. Verifica lo que un mock no puede demostrar de forma
 * creíble: que la reconstrucción histórica (tareas + tramos de
 * AsignacionTarea + comentarios + Hitos) ocurre sobre datos reales
 * relacionales, y que el aislamiento projectId+sprintId es real — dos
 * proyectos con títulos/contenidos deliberadamente distinguibles
 * ("...-A-HISTORY" vs. "...-B-SECRET") nunca se mezclan. Se activa solo con
 * `INTEGRATION_DATABASE_URL`; sin esa variable, SKIP limpio
 * (describeIntegration), mismo patrón que el resto de test/integration/.
 * NUNCA se usa la base de desarrollo activa como sustituto.
 *
 * El MISMO usuario (`leader`) es dueño de AMBOS proyectos (A y B): así,
 * cuando `project A + sprint B` devuelve NotFoundException, queda
 * demostrado que el aislamiento proviene realmente de projectId+sprintId,
 * no simplemente de que el actor carecía de acceso al Proyecto B.
 */
function createHito(prisma: PrismaClient, idProyecto: number, tituloHito: string, orden: number) {
  return prisma.hito.create({
    data: { idProyecto, tituloHito, orden },
  });
}

function createComentarioDeTarea(prisma: PrismaClient, idTarea: number, idAutor: number, contenido: string) {
  return prisma.comentario.create({
    data: { idTarea, idAutor, contenido },
  });
}

describeIntegration(
  'SprintsService.listSprints / getSprintDetail — PostgreSQL real (reconstrucción histórica + aislamiento cross-project)',
  () => {
    let prisma: PrismaClient;
    let service: SprintsService;
    let scope: IntegrationCleanupScope;
    let hitoIds: number[];
    let comentarioIds: number[];

    beforeAll(async () => {
      prisma = createIntegrationPrismaClient();
      const context = new SprintsContextService(prisma as any);
      const authorization = new SprintsAuthorizationService(context);
      const notifications = {} as any;
      service = new SprintsService(prisma as any, context, authorization, notifications);
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    beforeEach(() => {
      scope = {};
      hitoIds = [];
      comentarioIds = [];
    });

    afterEach(async () => {
      // Comentario cascada al borrar la Tarea (comentario_id_tarea_fkey ON
      // DELETE CASCADE), así que no necesita limpieza manual — pero Hito
      // tiene hito_id_proyecto_fkey ON DELETE RESTRICT, así que debe
      // borrarse ANTES que el Proyecto (que cleanupIntegrationFixtures
      // borra al final). Ningún de los dos forma parte de
      // IntegrationCleanupScope (T15).
      if (comentarioIds.length > 0) {
        await prisma.comentario.deleteMany({ where: { idComentario: { in: comentarioIds } } });
      }
      if (hitoIds.length > 0) {
        await prisma.hito.deleteMany({ where: { idHito: { in: hitoIds } } });
      }
      await cleanupIntegrationFixtures(prisma, scope);
    });

    /**
     * Fixture compartido: Proyecto A (Sprint A CERRADO, 2 tareas apuntando
     * al MISMO Hito, una tarea con 2 tramos históricos de AsignacionTarea,
     * 1 comentario) y Proyecto B (Sprint B CERRADO, datos deliberadamente
     * distinguibles) — el MISMO líder es dueño de ambos proyectos.
     */
    async function buildFixture() {
      const leader = await createIntegrationUser(prisma);
      const member = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario, member.idUsuario];

      const projectA = await createIntegrationProject(prisma, leader.idUsuario);
      const projectB = await createIntegrationProject(prisma, leader.idUsuario);
      scope.projectIds = [projectA.idProyecto, projectB.idProyecto];

      const hitoA = await createHito(prisma, projectA.idProyecto, 'MILESTONE-A', 1);
      const hitoB = await createHito(prisma, projectB.idProyecto, 'MILESTONE-B', 1);
      hitoIds = [hitoA.idHito, hitoB.idHito];

      const sprintA = await createIntegrationSprint(prisma, projectA.idProyecto, { estado: 'CERRADO' });
      const sprintB = await createIntegrationSprint(prisma, projectB.idProyecto, { estado: 'CERRADO' });
      scope.sprintIds = [sprintA.idSprint, sprintB.idSprint];
      await prisma.sprint.update({
        where: { idSprint: sprintA.idSprint },
        data: { fechaCierre: new Date('2026-02-01'), cerradoPor: leader.idUsuario },
      });
      await prisma.sprint.update({
        where: { idSprint: sprintB.idSprint },
        data: { fechaCierre: new Date('2026-02-01'), cerradoPor: leader.idUsuario },
      });

      const taskA1 = await createIntegrationTask(prisma, projectA.idProyecto, leader.idUsuario, sprintA.idSprint, {
        tituloTarea: 'TASK-A-HISTORY-1',
        estadoTarea: 'HECHO',
      });
      const taskA2 = await createIntegrationTask(prisma, projectA.idProyecto, leader.idUsuario, sprintA.idSprint, {
        tituloTarea: 'TASK-A-HISTORY-2',
        estadoTarea: 'HECHO',
      });
      // Ambas tareas de A apuntan al MISMO Hito — demuestra que
      // SprintDetail.hitos no lo duplica, y que A10.1 (listSprints.hitos)
      // tampoco: COUNT(DISTINCT idHito) debe dar 1, no 2.
      await prisma.tarea.update({
        where: { idTarea: taskA1.idTarea },
        data: { idHito: hitoA.idHito, tiempoEstimadoHoras: 6 },
      });
      await prisma.tarea.update({
        where: { idTarea: taskA2.idTarea },
        data: { idHito: hitoA.idHito, tiempoEstimadoHoras: 4 },
      });

      const taskB = await createIntegrationTask(prisma, projectB.idProyecto, leader.idUsuario, sprintB.idSprint, {
        tituloTarea: 'TASK-B-SECRET',
        estadoTarea: 'HECHO',
        idRolProyecto: null,
      });
      await prisma.tarea.update({ where: { idTarea: taskB.idTarea }, data: { idHito: hitoB.idHito } });
      scope.taskIds = [taskA1.idTarea, taskA2.idTarea, taskB.idTarea];

      // taskA1: 2 tramos históricos (reasignación) — el primero cerrado, el
      // segundo vigente — demuestra que el detalle conserva ambos sin
      // duplicar la tarea.
      const tramo1 = await createIntegrationTaskAssignment(prisma, taskA1.idTarea, member.idUsuario, leader.idUsuario);
      await prisma.asignacionTarea.update({
        where: { idAsignacion: tramo1.idAsignacion },
        data: { desasignadaEn: new Date('2026-01-10'), horasReales: 4 },
      });
      const tramo2 = await createIntegrationTaskAssignment(prisma, taskA1.idTarea, member.idUsuario, leader.idUsuario);
      const asignacionB = await createIntegrationTaskAssignment(prisma, taskB.idTarea, member.idUsuario, leader.idUsuario);
      scope.assignmentIds = [tramo1.idAsignacion, tramo2.idAsignacion, asignacionB.idAsignacion];

      const comentarioA = await createComentarioDeTarea(prisma, taskA1.idTarea, leader.idUsuario, 'COMMENT-A-HISTORY');
      const comentarioB = await createComentarioDeTarea(prisma, taskB.idTarea, leader.idUsuario, 'COMMENT-B-SECRET');
      comentarioIds = [comentarioA.idComentario, comentarioB.idComentario];

      return { leader, member, projectA, projectB, sprintA, sprintB, hitoA, hitoB, taskA1, taskA2, taskB };
    }

    it('Lista A: contiene Sprint A y NUNCA Sprint B', async () => {
      const fx = await buildFixture();

      const lista = await service.listSprints(fx.projectA.idProyecto, fx.leader.idUsuario);

      expect(lista.map((s) => s.idSprint)).toContain(fx.sprintA.idSprint);
      expect(lista.map((s) => s.idSprint)).not.toContain(fx.sprintB.idSprint);
      const entradaA = lista.find((s) => s.idSprint === fx.sprintA.idSprint)!;
      expect(entradaA.estado).toBe('CERRADO');
      expect(entradaA.fechaCierre).not.toBeNull();

      // A10.1: 2 tareas, ambas sobre el MISMO Hito (COUNT DISTINCT -> 1,
      // nunca 2), horas estimadas = 6 + 4 = 10. Nunca contamina con B.
      expect(entradaA.tareas).toBe(2);
      expect(entradaA.hitos).toBe(1);
      expect(entradaA.horasEstimadas).toBe(10);
    });

    it('Lista B: agregados A10.1 exclusivos de B (1 tarea, 1 hito, sin las horas/tareas de A)', async () => {
      const fx = await buildFixture();

      const lista = await service.listSprints(fx.projectB.idProyecto, fx.leader.idUsuario);

      const entradaB = lista.find((s) => s.idSprint === fx.sprintB.idSprint)!;
      expect(entradaB.tareas).toBe(1);
      expect(entradaB.hitos).toBe(1);
      // TASK-B-SECRET no tiene tiempoEstimadoHoras seteado en el fixture -> 0.
      expect(entradaB.horasEstimadas).toBe(0);
      expect(entradaB.tareas).not.toBe(2);
      expect(entradaB.horasEstimadas).not.toBe(10);
    });

    it('Detalle A: reconstruye tareas/asignaciones/comentarios/Hito de A y NUNCA expone datos de B', async () => {
      const fx = await buildFixture();

      const detalle = await service.getSprintDetail(fx.projectA.idProyecto, fx.sprintA.idSprint, fx.leader.idUsuario);

      expect(detalle.idSprint).toBe(fx.sprintA.idSprint);
      expect(detalle.estado).toBe('CERRADO');
      expect(detalle.fechaCierre).not.toBeNull();
      expect(detalle.cerradoPor).toBe(fx.leader.idUsuario);

      // Tareas: exactamente 2, ambas de A, ninguna de B.
      expect(detalle.tareas).toHaveLength(2);
      const titulos = detalle.tareas.map((t) => t.tituloTarea).sort();
      expect(titulos).toEqual(['TASK-A-HISTORY-1', 'TASK-A-HISTORY-2']);
      expect(titulos).not.toContain('TASK-B-SECRET');

      // Hitos: 1 solo (deduplicado), aunque 2 tareas lo referencian.
      expect(detalle.hitos).toHaveLength(1);
      expect(detalle.hitos[0].tituloHito).toBe('MILESTONE-A');
      expect(detalle.hitos.map((h) => h.tituloHito)).not.toContain('MILESTONE-B');
      expect(detalle.tareas.every((t) => t.idHito === fx.hitoA.idHito)).toBe(true);

      // Asignaciones históricas: taskA1 conserva sus 2 tramos, sin duplicar
      // la tarea a nivel superior.
      const taskA1Detalle = detalle.tareas.find((t) => t.tituloTarea === 'TASK-A-HISTORY-1')!;
      expect(taskA1Detalle.asignaciones).toHaveLength(2);
      expect(taskA1Detalle.asignaciones[0].desasignadaEn).not.toBeNull();
      expect(taskA1Detalle.asignaciones[0].horasReales).toBe(4);
      expect(taskA1Detalle.asignaciones[1].desasignadaEn).toBeNull();

      // Comentarios: solo el de A, en la tarea correcta.
      expect(taskA1Detalle.comentarios).toHaveLength(1);
      expect(taskA1Detalle.comentarios[0].contenido).toBe('COMMENT-A-HISTORY');
      const todosLosComentarios = detalle.tareas.flatMap((t) => t.comentarios.map((c) => c.contenido));
      expect(todosLosComentarios).not.toContain('COMMENT-B-SECRET');

      // Ninguna asignación de B (mismo usuario `member`) se filtra en A.
      const todasLasAsignaciones = detalle.tareas.flatMap((t) => t.asignaciones.map((a) => a.idAsignacion));
      const asignacionesDeB = await prisma.asignacionTarea.findMany({ where: { idTarea: fx.taskB.idTarea } });
      for (const asignacionB of asignacionesDeB) {
        expect(todasLasAsignaciones).not.toContain(asignacionB.idAsignacion);
      }
    });

    it('project A + sprint B: se comporta como recurso inexistente (NotFoundException), sin filtrar datos de B', async () => {
      const fx = await buildFixture();

      await expect(
        service.getSprintDetail(fx.projectA.idProyecto, fx.sprintB.idSprint, fx.leader.idUsuario),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Sprint B bajo su propio proyecto se reconstruye igual de bien, con SUS PROPIOS datos (nunca los de A)', async () => {
      const fx = await buildFixture();

      const detalle = await service.getSprintDetail(fx.projectB.idProyecto, fx.sprintB.idSprint, fx.leader.idUsuario);

      expect(detalle.tareas).toHaveLength(1);
      expect(detalle.tareas[0].tituloTarea).toBe('TASK-B-SECRET');
      expect(detalle.hitos).toHaveLength(1);
      expect(detalle.hitos[0].tituloHito).toBe('MILESTONE-B');
      expect(detalle.tareas[0].comentarios.map((c) => c.contenido)).toEqual(['COMMENT-B-SECRET']);
      expect(detalle.tareas[0].comentarios.map((c) => c.contenido)).not.toContain('COMMENT-A-HISTORY');
    });
  },
);
