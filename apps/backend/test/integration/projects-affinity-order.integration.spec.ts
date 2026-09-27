import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { EstadoProyecto } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationUser,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationParticipation,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { ProjectsService } from '../../src/projects/projects.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';
import { SocialService } from '../../src/social/social.service';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';

/**
 * T-251/T-252: la consulta SQL agregada de `_ordenarPorAfinidad` (amigos
 * participantes + misma carrera) contra PostgreSQL real. Los tests
 * unitarios de `projects.service.spec.ts` mockean `$queryRaw`, así que
 * nunca ejercen el SQL de verdad. Esta suite sí lo ejercita, en particular
 * el caso que el mock no puede atrapar: el LÍDER de un proyecto no tiene
 * fila en `participacion_proyecto` (schema.prisma, comentario sobre
 * `Proyecto.creadoPor`) y aun así debe contar como amigo participante
 * cuando lo es — mismo criterio que `social-feed.service.ts`.
 */
describeIntegration('ProjectsService — orden ponderado por afinidad (SQL real)', () => {
  let prisma: PrismaClient;
  let service: ProjectsService;
  let scope: IntegrationCleanupScope;
  let amistadIds: number[];
  let perfilUserIds: number[];
  let carreraIds: number[];

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    const notifications = {} as unknown as NotificationsService;
    service = new ProjectsService(
      prismaService,
      notifications,
      { get: async () => undefined, set: async () => undefined, del: async () => undefined } as never,
      new ProjectTransactionService(prismaService),
      new ProjectPolicyService(new ProjectIdResolverService(prismaService)),
      new ProjectReadPolicyService(prismaService),
      new SocialService(prismaService, notifications),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    scope = {};
    amistadIds = [];
    perfilUserIds = [];
    carreraIds = [];
  });

  afterEach(async () => {
    if (amistadIds.length > 0) {
      await prisma.amistad.deleteMany({ where: { idAmistad: { in: amistadIds } } });
    }
    if (perfilUserIds.length > 0) {
      await prisma.perfilEstudiante.deleteMany({ where: { idUsuario: { in: perfilUserIds } } });
    }
    await cleanupIntegrationFixtures(prisma, scope);
    if (carreraIds.length > 0) {
      await prisma.carrera.deleteMany({ where: { idCarrera: { in: carreraIds } } });
    }
  });

  async function crearAmistad(idA: number, idB: number) {
    const amistad = await prisma.amistad.create({
      data: { idUsuarioSolicitante: idA, idUsuarioReceptor: idB, estado: 'ACEPTADA' },
    });
    amistadIds.push(amistad.idAmistad);
  }

  it('cuenta al líder del proyecto como amigo participante aunque no tenga fila en participacion_proyecto', async () => {
    const yo = await createIntegrationUser(prisma);
    const amigoLider = await createIntegrationUser(prisma);
    scope.userIds = [yo.idUsuario, amigoLider.idUsuario];
    await crearAmistad(yo.idUsuario, amigoLider.idUsuario);

    const proyecto = await createIntegrationProject(prisma, amigoLider.idUsuario, {
      estadoProyecto: EstadoProyecto.PUBLICADO,
    });
    scope.projectIds = [proyecto.idProyecto];

    const resultado = await service.findAll({}, yo.idUsuario);
    const fila = resultado.find((p) => p.idProyecto === proyecto.idProyecto) as
      | { amigosParticipantes: number }
      | undefined;

    expect(fila?.amigosParticipantes).toBe(1);
  });

  it('cuenta un amigo con participación ACTIVA en un rol', async () => {
    const yo = await createIntegrationUser(prisma);
    const lider = await createIntegrationUser(prisma);
    const amigo = await createIntegrationUser(prisma);
    scope.userIds = [yo.idUsuario, lider.idUsuario, amigo.idUsuario];
    await crearAmistad(yo.idUsuario, amigo.idUsuario);

    const proyecto = await createIntegrationProject(prisma, lider.idUsuario, {
      estadoProyecto: EstadoProyecto.PUBLICADO,
    });
    scope.projectIds = [proyecto.idProyecto];
    const rol = await createIntegrationProjectRole(prisma, proyecto.idProyecto);
    scope.roleIds = [rol.idRolProyecto];
    const participacion = await createIntegrationParticipation(prisma, amigo.idUsuario, rol.idRolProyecto);
    scope.participationIds = [participacion.idParticipacion];

    const resultado = await service.findAll({}, yo.idUsuario);
    const fila = resultado.find((p) => p.idProyecto === proyecto.idProyecto) as
      | { amigosParticipantes: number }
      | undefined;

    expect(fila?.amigosParticipantes).toBe(1);
  });

  it('el mismo amigo en dos roles del mismo proyecto cuenta una sola vez (COUNT DISTINCT)', async () => {
    const yo = await createIntegrationUser(prisma);
    const lider = await createIntegrationUser(prisma);
    const amigo = await createIntegrationUser(prisma);
    scope.userIds = [yo.idUsuario, lider.idUsuario, amigo.idUsuario];
    await crearAmistad(yo.idUsuario, amigo.idUsuario);

    const proyecto = await createIntegrationProject(prisma, lider.idUsuario, {
      estadoProyecto: EstadoProyecto.PUBLICADO,
    });
    scope.projectIds = [proyecto.idProyecto];
    const rolA = await createIntegrationProjectRole(prisma, proyecto.idProyecto);
    const rolB = await createIntegrationProjectRole(prisma, proyecto.idProyecto);
    scope.roleIds = [rolA.idRolProyecto, rolB.idRolProyecto];
    const partA = await createIntegrationParticipation(prisma, amigo.idUsuario, rolA.idRolProyecto);
    const partB = await createIntegrationParticipation(prisma, amigo.idUsuario, rolB.idRolProyecto);
    scope.participationIds = [partA.idParticipacion, partB.idParticipacion];

    const resultado = await service.findAll({}, yo.idUsuario);
    const fila = resultado.find((p) => p.idProyecto === proyecto.idProyecto) as
      | { amigosParticipantes: number }
      | undefined;

    expect(fila?.amigosParticipantes).toBe(1);
  });

  it('sin amigos, un proyecto de la misma carrera del usuario se marca mismaCarrera (BOOL_OR con carreraId real)', async () => {
    const yo = await createIntegrationUser(prisma);
    const lider = await createIntegrationUser(prisma);
    scope.userIds = [yo.idUsuario, lider.idUsuario];

    const carrera = await prisma.carrera.create({ data: { nombreCarrera: 'Carrera de prueba' } });
    carreraIds.push(carrera.idCarrera);
    await prisma.perfilEstudiante.create({
      data: { idUsuario: yo.idUsuario, carne: `carne-${yo.idUsuario}`, idCarrera: carrera.idCarrera },
    });
    perfilUserIds.push(yo.idUsuario);

    const proyecto = await createIntegrationProject(prisma, lider.idUsuario, {
      estadoProyecto: EstadoProyecto.PUBLICADO,
    });
    scope.projectIds = [proyecto.idProyecto];
    const rol = await createIntegrationProjectRole(prisma, proyecto.idProyecto);
    scope.roleIds = [rol.idRolProyecto];
    await prisma.rolProyecto.update({
      where: { idRolProyecto: rol.idRolProyecto },
      data: { idCarreraRequerida: carrera.idCarrera },
    });

    const resultado = await service.findAll({}, yo.idUsuario);
    const fila = resultado.find((p) => p.idProyecto === proyecto.idProyecto) as
      | { amigosParticipantes: number; mismaCarrera: boolean }
      | undefined;

    expect(fila?.amigosParticipantes).toBe(0);
    expect(fila?.mismaCarrera).toBe(true);
  });
});
