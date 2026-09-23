import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { EstadoParticipacion, EstadoProyecto } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationUser,
  createIntegrationProject,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationProjectRole,
  createIntegrationParticipation,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { GlobalSearchService } from '../../src/search/global-search.service';
import { UserNameSearchService } from '../../src/common/search/user-name-search.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * T-272: la búsqueda global cruza proyectos, personas y tareas — el lugar
 * más fácil para filtrar información de más si se olvida el permiso en uno
 * de los tres. Se prueba contra Postgres real: el filtro de acentos
 * (immutable_unaccent) y el JOIN de permisos de tareas no son creíbles con
 * un mock de Prisma.
 */
describeIntegration('GlobalSearchService — permisos y acentos (Postgres real)', () => {
  let prisma: PrismaClient;
  let service: GlobalSearchService;
  let scope: IntegrationCleanupScope;

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    const prismaService = prisma as unknown as PrismaService;
    service = new GlobalSearchService(prismaService, new UserNameSearchService(prismaService));
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    scope = {};
  });

  afterEach(async () => {
    await cleanupIntegrationFixtures(prisma, scope);
  });

  it('devuelve proyectos, personas y tareas coincidentes, agrupados', async () => {
    const lider = await createIntegrationUser(prisma, { nombre: 'Lidia', apellido: 'Soto' });
    const proyecto = await createIntegrationProject(prisma, lider.idUsuario, {
      tituloProyecto: 'Portal de bienestar',
      estadoProyecto: EstadoProyecto.PUBLICADO,
    });
    const sprint = await createIntegrationSprint(prisma, proyecto.idProyecto);
    const tarea = await createIntegrationTask(prisma, proyecto.idProyecto, lider.idUsuario, sprint.idSprint, {
      tituloTarea: 'Bienestar UI',
    });
    scope.userIds = [lider.idUsuario];
    scope.projectIds = [proyecto.idProyecto];
    scope.sprintIds = [sprint.idSprint];
    scope.taskIds = [tarea.idTarea];

    const resultado = await service.buscar(lider.idUsuario, 'bienestar');

    expect(resultado.proyectos.items.map((p) => p.idProyecto)).toContain(proyecto.idProyecto);
    expect(resultado.tareas.items.map((t) => t.idTarea)).toContain(tarea.idTarea);
    expect(resultado.personas.items).toEqual([]);
  });

  it('no muestra tareas de un proyecto al que el usuario no pertenece', async () => {
    const dueno = await createIntegrationUser(prisma, { nombre: 'Dueño', apellido: 'Proyecto' });
    const ajeno = await createIntegrationUser(prisma, { nombre: 'Ajeno', apellido: 'Usuario' });
    const proyecto = await createIntegrationProject(prisma, dueno.idUsuario, {
      tituloProyecto: 'Proyecto privado',
      estadoProyecto: EstadoProyecto.PUBLICADO,
    });
    const sprint = await createIntegrationSprint(prisma, proyecto.idProyecto);
    const tarea = await createIntegrationTask(prisma, proyecto.idProyecto, dueno.idUsuario, sprint.idSprint, {
      tituloTarea: 'Tarea confidencial unica',
    });
    scope.userIds = [dueno.idUsuario, ajeno.idUsuario];
    scope.projectIds = [proyecto.idProyecto];
    scope.sprintIds = [sprint.idSprint];
    scope.taskIds = [tarea.idTarea];

    const resultado = await service.buscar(ajeno.idUsuario, 'confidencial');

    expect(resultado.tareas.items.map((t) => t.idTarea)).not.toContain(tarea.idTarea);
  });

  it('muestra tareas a un participante activo que no es el lider del proyecto', async () => {
    const lider = await createIntegrationUser(prisma, { nombre: 'Lider', apellido: 'Equipo' });
    const miembro = await createIntegrationUser(prisma, { nombre: 'Miembro', apellido: 'Activo' });
    const proyecto = await createIntegrationProject(prisma, lider.idUsuario, {
      tituloProyecto: 'Proyecto compartido',
      estadoProyecto: EstadoProyecto.PUBLICADO,
    });
    const rol = await createIntegrationProjectRole(prisma, proyecto.idProyecto);
    const participacion = await createIntegrationParticipation(prisma, miembro.idUsuario, rol.idRolProyecto, {
      estadoParticipacion: EstadoParticipacion.ACTIVO,
    });
    const sprint = await createIntegrationSprint(prisma, proyecto.idProyecto);
    const tarea = await createIntegrationTask(prisma, proyecto.idProyecto, lider.idUsuario, sprint.idSprint, {
      tituloTarea: 'Tarea del equipo compartido',
    });
    scope.userIds = [lider.idUsuario, miembro.idUsuario];
    scope.projectIds = [proyecto.idProyecto];
    scope.sprintIds = [sprint.idSprint];
    scope.taskIds = [tarea.idTarea];
    scope.roleIds = [rol.idRolProyecto];
    scope.participationIds = [participacion.idParticipacion];

    const resultado = await service.buscar(miembro.idUsuario, 'compartido');

    expect(resultado.tareas.items.map((t) => t.idTarea)).toContain(tarea.idTarea);
  });

  it('no muestra tareas de un proyecto CANCELADO aunque el usuario sea participante activo', async () => {
    const lider = await createIntegrationUser(prisma, { nombre: 'Lider', apellido: 'Cancelado' });
    const miembro = await createIntegrationUser(prisma, { nombre: 'Miembro', apellido: 'Cancelado' });
    const proyecto = await createIntegrationProject(prisma, lider.idUsuario, {
      tituloProyecto: 'Proyecto suspendido',
      estadoProyecto: EstadoProyecto.CANCELADO,
    });
    const rol = await createIntegrationProjectRole(prisma, proyecto.idProyecto);
    const participacion = await createIntegrationParticipation(prisma, miembro.idUsuario, rol.idRolProyecto, {
      estadoParticipacion: EstadoParticipacion.ACTIVO,
    });
    const sprint = await createIntegrationSprint(prisma, proyecto.idProyecto);
    const tarea = await createIntegrationTask(prisma, proyecto.idProyecto, lider.idUsuario, sprint.idSprint, {
      tituloTarea: 'Tarea suspendida unica',
    });
    scope.userIds = [lider.idUsuario, miembro.idUsuario];
    scope.projectIds = [proyecto.idProyecto];
    scope.sprintIds = [sprint.idSprint];
    scope.taskIds = [tarea.idTarea];
    scope.roleIds = [rol.idRolProyecto];
    scope.participationIds = [participacion.idParticipacion];

    const resultado = await service.buscar(miembro.idUsuario, 'suspendida');

    expect(resultado.tareas.items.map((t) => t.idTarea)).not.toContain(tarea.idTarea);
  });

  it('tolera acentos y coincidencias parciales (reutiliza casos de T-247)', async () => {
    const usuario = await createIntegrationUser(prisma, { nombre: 'Saúl', apellido: 'Castillo' });
    scope.userIds = [usuario.idUsuario];

    const resultado = await service.buscar(usuario.idUsuario, 'saul');

    expect(resultado.personas.items.map((p) => p.idUsuario)).toContain(usuario.idUsuario);
  });

  it('una busqueda amplia respeta el limite de 5 por tipo y avisa que hay mas', async () => {
    const lider = await createIntegrationUser(prisma, { nombre: 'Amplio', apellido: 'Buscador' });
    const proyectos = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        createIntegrationProject(prisma, lider.idUsuario, {
          tituloProyecto: `Proyecto masivo ${i}`,
          estadoProyecto: EstadoProyecto.PUBLICADO,
        }),
      ),
    );
    scope.userIds = [lider.idUsuario];
    scope.projectIds = proyectos.map((p) => p.idProyecto);

    const resultado = await service.buscar(lider.idUsuario, 'masivo');

    expect(resultado.proyectos.items).toHaveLength(5);
    expect(resultado.proyectos.hasMore).toBe(true);
  });

  it('una busqueda sin coincidencias devuelve estructura vacia valida, no error', async () => {
    const usuario = await createIntegrationUser(prisma, { nombre: 'Nadie', apellido: 'Coincide' });
    scope.userIds = [usuario.idUsuario];

    const resultado = await service.buscar(usuario.idUsuario, 'zzz-texto-que-no-existe-zzz');

    expect(resultado).toEqual({
      proyectos: { items: [], hasMore: false },
      personas: { items: [], hasMore: false },
      tareas: { items: [], hasMore: false },
    });
  });
});
