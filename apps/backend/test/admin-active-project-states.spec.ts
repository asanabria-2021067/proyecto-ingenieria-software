import { describe, expect, it, vi } from 'vitest';
import { EstadoProyecto } from '@prisma/client';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../src/prisma/prisma.service';
import { AdminService } from '../src/admin/admin.service';
import { HistoricalProjectReadService } from '../src/project-closure/historical-project-read.service';
import { ADMIN_ACTIVE_PROJECT_STATES } from '../src/common/project-policy/admin-active-project-states';

/**
 * La población "proyecto activo" de Administración es una sola: el KPI del
 * dashboard y el grupo `activos` de la bandeja deben filtrar exactamente los
 * mismos estados, que son también los del calendario de Sprints.
 */
describe('ADMIN_ACTIVE_PROJECT_STATES', () => {
  it('son exactamente PUBLICADO y EN_PROGRESO', () => {
    expect([...ADMIN_ACTIVE_PROJECT_STATES]).toEqual([EstadoProyecto.PUBLICADO, EstadoProyecto.EN_PROGRESO]);
  });

  it('excluye EN_SOLICITUD_CIERRE y el resto de estados no operativos', () => {
    for (const estado of [
      EstadoProyecto.BORRADOR,
      EstadoProyecto.EN_REVISION,
      EstadoProyecto.OBSERVADO,
      EstadoProyecto.EN_SOLICITUD_CIERRE,
      EstadoProyecto.CERRADO,
      EstadoProyecto.CANCELADO,
    ]) {
      expect(ADMIN_ACTIVE_PROJECT_STATES).not.toContain(estado);
    }
  });

  it('el KPI proyectosActivos del dashboard filtra esa población y los no eliminados', async () => {
    const prisma = {
      usuarioRolAcceso: { findFirst: vi.fn().mockResolvedValue({ idUsuarioRolAcceso: 1 }) },
      proyecto: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
      usuario: { count: vi.fn().mockResolvedValue(0) },
      perfilEstudiante: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new AdminService(prisma as unknown as PrismaService, {} as JwtService);

    await service.getEstadisticas(1);

    expect(prisma.proyecto.count).toHaveBeenCalledWith({
      where: {
        estadoProyecto: { in: [EstadoProyecto.PUBLICADO, EstadoProyecto.EN_PROGRESO] },
        eliminadoEn: null,
      },
    });
  });

  it('el grupo activos de la bandeja administrativa filtra la misma población', async () => {
    const prisma = {
      proyecto: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    };
    const policy = { assertAdminTx: vi.fn().mockResolvedValue(undefined) };
    const service = new HistoricalProjectReadService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      policy as never,
    );

    await service.adminList(1, { grupo: 'activos' });

    const where = {
      estadoProyecto: { in: [EstadoProyecto.PUBLICADO, EstadoProyecto.EN_PROGRESO] },
      eliminadoEn: null,
    };
    expect(prisma.proyecto.count).toHaveBeenCalledWith({ where });
    expect(prisma.proyecto.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
  });
});
