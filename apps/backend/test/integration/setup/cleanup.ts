import type { PrismaClient, Prisma } from '@prisma/client';

/**
 * Cleanup FK-safe dirigido por IDs para el harness de integración PostgreSQL
 * (T16). Elimina exclusivamente los registros cuyos IDs se reciban en
 * `scope`, respetando el grafo real de foreign keys de las seis entidades
 * genéricas creadas por `fixtures.ts` (T15). No recibe conexión propia ni
 * mantiene estado entre invocaciones: el caller es dueño del scope.
 */

export interface IntegrationCleanupScope {
  assignmentIds?: number[];
  taskIds?: number[];
  sprintIds?: number[];
  participationIds?: number[];
  roleIds?: number[];
  projectIds?: number[];
  userIds?: number[];
}

export async function cleanupIntegrationFixtures(
  prisma: PrismaClient,
  scope: IntegrationCleanupScope,
): Promise<void> {
  const assignmentIds = scope.assignmentIds ?? [];
  const taskIds = scope.taskIds ?? [];
  const sprintIds = scope.sprintIds ?? [];
  const participationIds = scope.participationIds ?? [];
  const roleIds = scope.roleIds ?? [];
  const projectIds = scope.projectIds ?? [];
  const userIds = scope.userIds ?? [];

  // Orden FK-safe: dependientes antes que padres.
  // AsignacionTarea → (Tarea, Usuario); Tarea → (Proyecto, Usuario, Sprint);
  // Sprint → Proyecto (FND-01, RESTRICT — debe borrarse después de Tarea,
  // que es su único dependiente con FK RESTRICT, y antes de Proyecto);
  // ParticipacionProyecto → (Usuario, RolProyecto); RolProyecto → Proyecto;
  // Proyecto → Usuario.
  const operations: Prisma.PrismaPromise<Prisma.BatchPayload>[] = [];

  if (assignmentIds.length > 0) {
    operations.push(
      prisma.asignacionTarea.deleteMany({ where: { idAsignacion: { in: assignmentIds } } }),
    );
  }
  if (taskIds.length > 0) {
    operations.push(prisma.tarea.deleteMany({ where: { idTarea: { in: taskIds } } }));
  }
  if (sprintIds.length > 0) {
    operations.push(prisma.sprint.deleteMany({ where: { idSprint: { in: sprintIds } } }));
  }
  if (participationIds.length > 0) {
    operations.push(
      prisma.participacionProyecto.deleteMany({ where: { idParticipacion: { in: participationIds } } }),
    );
  }
  if (roleIds.length > 0) {
    operations.push(prisma.rolProyecto.deleteMany({ where: { idRolProyecto: { in: roleIds } } }));
  }
  if (projectIds.length > 0) {
    operations.push(prisma.proyecto.deleteMany({ where: { idProyecto: { in: projectIds } } }));
  }
  if (userIds.length > 0) {
    operations.push(prisma.usuario.deleteMany({ where: { idUsuario: { in: userIds } } }));
  }

  if (operations.length === 0) return;

  await prisma.$transaction(operations);
}
