import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cache } from 'cache-manager';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { ProjectsService } from '../src/projects/projects.service';
import { SocialService } from '../src/social/social.service';
import { makeProjectPolicyDouble, makeProjectReadPolicyDouble, makeProjectTransactionDouble } from './helpers/project-policy.double';

const cubre = vi.hoisted(() => vi.fn());
vi.mock('../src/coordinador/coordinador-alcance', () => ({ coordinadorCubreProyecto: cubre }));

/** ROL-2: GET /proyectos/:id/admin es de lectura para el administrador y para el coordinador dentro de su alcance. */
function crear(esAdmin: boolean) {
  const prisma = { proyecto: { findFirst: vi.fn().mockResolvedValue({ idProyecto: 7, tituloProyecto: 'P' }) } };
  const notifications = { isAdmin: vi.fn().mockResolvedValue(esAdmin) };
  const service = new ProjectsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    { del: vi.fn() } as unknown as Cache,
    makeProjectTransactionDouble({ tx: prisma }),
    makeProjectPolicyDouble(),
    makeProjectReadPolicyDouble(),
    new SocialService(prisma as unknown as PrismaService, notifications as unknown as NotificationsService),
  );
  return { service, prisma };
}

describe('ProjectsService.findOneAdmin', () => {
  beforeEach(() => cubre.mockReset());

  it('el administrador lee el detalle sin consultar el alcance', async () => {
    const { service } = crear(true);
    await expect(service.findOneAdmin(7, 1)).resolves.toMatchObject({ idProyecto: 7 });
    expect(cubre).not.toHaveBeenCalled();
  });

  it('el coordinador lee el detalle de un proyecto dentro de su alcance', async () => {
    cubre.mockResolvedValue(true);
    const { service } = crear(false);
    await expect(service.findOneAdmin(7, 2)).resolves.toMatchObject({ idProyecto: 7 });
    expect(cubre).toHaveBeenCalledWith(expect.anything(), 2, 7);
  });

  it('el coordinador recibe 403 fuera de su alcance y no se consulta el proyecto', async () => {
    cubre.mockResolvedValue(false);
    const { service, prisma } = crear(false);
    await expect(service.findOneAdmin(7, 2)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.proyecto.findFirst).not.toHaveBeenCalled();
  });
});
