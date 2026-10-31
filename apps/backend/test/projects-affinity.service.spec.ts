import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { SocialService } from '../src/social/social.service';
import { ProjectsAffinityService } from '../src/projects/projects-affinity.service';

function makeService(opts: { amigos?: number[]; carrera?: number | null; filas?: object[] } = {}) {
  const prisma = {
    proyectoGuardado: { findMany: vi.fn().mockResolvedValue([{ idProyecto: 2 }]) },
    perfilEstudiante: {
      findUnique: vi.fn().mockResolvedValue(opts.carrera === undefined ? null : { idCarrera: opts.carrera }),
    },
    $queryRaw: vi.fn().mockResolvedValue(opts.filas ?? []),
  };
  const social = { getAmigoIds: vi.fn().mockResolvedValue(opts.amigos ?? []) };
  const service = new ProjectsAffinityService(
    prisma as unknown as PrismaService,
    social as unknown as SocialService,
  );
  return { prisma, social, service };
}

describe('ProjectsAffinityService', () => {
  it('conGuardado: sin sesion marca todo en false y no consulta', async () => {
    const { prisma, service } = makeService();
    const r = await service.conGuardado([{ idProyecto: 1 }, { idProyecto: 2 }]);
    expect(r).toEqual([
      { idProyecto: 1, guardado: false },
      { idProyecto: 2, guardado: false },
    ]);
    expect(prisma.proyectoGuardado.findMany).not.toHaveBeenCalled();
  });

  it('conGuardado: con sesion marca solo los guardados del usuario', async () => {
    const { prisma, service } = makeService();
    const r = await service.conGuardado([{ idProyecto: 1 }, { idProyecto: 2 }], 9);
    expect(prisma.proyectoGuardado.findMany).toHaveBeenCalledWith({
      where: { idUsuario: 9, idProyecto: { in: [1, 2] } },
      select: { idProyecto: true },
    });
    expect(r.map((p) => p.guardado)).toEqual([false, true]);
  });

  it('ordenarPorAfinidad: sin amigos ni carrera conserva el orden y no ejecuta la consulta agregada', async () => {
    const { prisma, service } = makeService({ amigos: [], carrera: null });
    const r = await service.ordenarPorAfinidad([{ idProyecto: 1 }, { idProyecto: 2 }], 9);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(r).toEqual([
      { idProyecto: 1, amigosParticipantes: 0, mismaCarrera: false },
      { idProyecto: 2, amigosParticipantes: 0, mismaCarrera: false },
    ]);
  });

  it('ordenarPorAfinidad: pondera amigo=2 y carrera=1, y empata por recencia (orden original)', async () => {
    const { service } = makeService({
      amigos: [5],
      carrera: 3,
      filas: [
        { idProyecto: 1, amigosParticipantes: 0, mismaCarrera: true }, // score 1
        { idProyecto: 2, amigosParticipantes: 1, mismaCarrera: false }, // score 2
        { idProyecto: 3, amigosParticipantes: 0, mismaCarrera: true }, // score 1 (empata con 1)
      ],
    });
    const r = await service.ordenarPorAfinidad(
      [{ idProyecto: 1 }, { idProyecto: 2 }, { idProyecto: 3 }, { idProyecto: 4 }],
      9,
    );
    expect(r.map((p) => p.idProyecto)).toEqual([2, 1, 3, 4]);
    expect(r[3]).toMatchObject({ amigosParticipantes: 0, mismaCarrera: false });
  });
});
