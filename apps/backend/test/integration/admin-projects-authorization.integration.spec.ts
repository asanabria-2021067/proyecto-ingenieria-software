import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PARAMTYPES_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { createIntegrationUser } from './setup/fixtures';
import { historicalStack } from './setup/historical-read';
import { accessTokenFor, requestJson, startIntegrationHttpHarness, type IntegrationHttpHarness } from './setup/http-harness';
import { cleanupLeadershipFixture, createIntegrationAdmin, type LeadershipCleanupScope } from './setup/leadership';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminProjectsController } from '../../src/project-closure/admin-projects.controller';
import { AdminProjectsQueryDto } from '../../src/project-closure/dto/admin-projects-query.dto';
import { HistoricalProjectReadService } from '../../src/project-closure/historical-project-read.service';

/**
 * GPI01-C09 (H-07): contrato HTTP real de `GET /api/admin/proyectos` contra
 * PostgreSQL, con el JwtAuthGuard, el RolesGuard y el ValidationPipe de
 * main.ts. La autorización se resuelve ANTES de validar la consulta:
 *
 *   sin sesión   -> 401, sea cual sea la consulta
 *   estudiante   -> 403, sea cual sea la consulta (nunca un 400 de validación)
 *   administrador-> 400 si la consulta es inválida, 200 si es válida
 *
 * y la consulta de un no administrador no llega al servicio.
 */
describeIntegration('GPI01-C09 — autorización antes de validar en /admin/proyectos (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let http: IntegrationHttpHarness;
  let adminList: ReturnType<typeof vi.spyOn>;
  let adminDetail: ReturnType<typeof vi.spyOn>;
  const scope: LeadershipCleanupScope = {};
  const tokens = { admin: '', estudiante: '' };

  const CONSULTAS = [
    ['sin grupo', ''],
    ['grupo inválido', '?grupo=todos'],
    ['grupo vacío', '?grupo='],
    ['grupo válido', '?grupo=activos'],
    ['paginación fuera de rango', '?grupo=activos&limit=500'],
  ] as const;

  const pedir = (consulta: string, token?: string) => requestJson(`${http.url}/admin/proyectos${consulta}`, { token });

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    const admin = await createIntegrationAdmin(prisma, scope);
    const estudiante = await createIntegrationUser(prisma);
    scope.userIds = [...(scope.userIds ?? []), estudiante.idUsuario];
    tokens.admin = accessTokenFor(admin);
    tokens.estudiante = accessTokenFor(estudiante);

    const { service } = historicalStack(prisma);
    adminList = vi.spyOn(service, 'adminList');
    adminDetail = vi.spyOn(service, 'adminDetail');
    // Lo que `emitDecoratorMetadata` genera en el build real.
    Reflect.defineMetadata(PARAMTYPES_METADATA, [Reflector, PrismaService], RolesGuard);
    http = await startIntegrationHttpHarness({
      prisma,
      controllers: [
        {
          controller: AdminProjectsController,
          deps: [HistoricalProjectReadService],
          handlers: { list: [Object, AdminProjectsQueryDto], detail: [Number, Object] },
        },
      ],
      providers: [{ provide: HistoricalProjectReadService, useValue: service }],
    });
  });

  afterAll(async () => {
    await http?.close();
    await cleanupLeadershipFixture(prisma, scope);
    await prisma.$disconnect();
  });

  beforeEach(() => {
    adminList.mockClear();
    adminDetail.mockClear();
  });

  it.each(CONSULTAS)('sin sesión, %s -> 401', async (_nombre, consulta) => {
    const { status, body } = await pedir(consulta);
    expect(status).toBe(401);
    expect(JSON.stringify(body)).not.toContain('grupo');
    expect(adminList).not.toHaveBeenCalled();
  });

  it.each(CONSULTAS)('estudiante, %s -> 403 sin revelar la validación', async (_nombre, consulta) => {
    const { status, body } = await pedir(consulta, tokens.estudiante);
    expect(status).toBe(403);
    expect(body.message).toBe('Acceso restringido a administradores');
    expect(JSON.stringify(body)).not.toContain('grupo');
    expect(adminList, 'la consulta no llega al servicio').not.toHaveBeenCalled();
  });

  it('estudiante con un identificador de proyecto inválido -> 403, no 400', async () => {
    for (const ruta of ['/abc', '/1']) {
      const { status } = await requestJson(`${http.url}/admin/proyectos${ruta}`, { token: tokens.estudiante });
      expect(status, ruta).toBe(403);
    }
    expect(adminDetail).not.toHaveBeenCalled();
  });

  it.each([CONSULTAS[0], CONSULTAS[1], CONSULTAS[2], CONSULTAS[4]])('administrador, %s -> 400 de validación', async (_nombre, consulta) => {
    const { status } = await pedir(consulta, tokens.admin);
    expect(status).toBe(400);
    expect(adminList).not.toHaveBeenCalled();
  });

  it.each(['activos', 'revision', 'cierres', 'cerrados'])('administrador, grupo=%s -> 200 con la página', async (grupo) => {
    const { status, body } = await pedir(`?grupo=${grupo}&page=1&limit=5`, tokens.admin);
    expect(status).toBe(200);
    expect(body).toMatchObject({ page: 1, limit: 5 });
    expect(Array.isArray(body.items)).toBe(true);
    expect(adminList).toHaveBeenCalledTimes(1);
  });

  it('el detalle sigue respondiendo al administrador (404 de un proyecto inexistente, 400 de un id inválido)', async () => {
    expect((await requestJson(`${http.url}/admin/proyectos/2147483000`, { token: tokens.admin })).status).toBe(404);
    expect((await requestJson(`${http.url}/admin/proyectos/abc`, { token: tokens.admin })).status).toBe(400);
  });
});
