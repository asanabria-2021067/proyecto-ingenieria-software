import { describe, expect, it, vi } from 'vitest';
import { HistoricalProjectReadService } from '../src/project-closure/historical-project-read.service';

/**
 * La bandeja administrativa se lee como una pila: lo último que se movió va
 * primero. Ordenaba por `idProyecto: 'asc'`, así que una solicitud de cierre
 * recién enviada aparecía al FINAL de su grupo, detrás de proyectos que
 * llevaban semanas quietos — el administrador tenía que buscarla.
 */

function makePrisma() {
  return {
    proyecto: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  // Orden real del constructor: prisma, readPolicy, hours, policy.
  const policy = { assertAdminTx: vi.fn().mockResolvedValue(undefined) };
  return new HistoricalProjectReadService(
    prisma as never,
    {} as never,
    {} as never,
    policy as never,
  );
}

/** El `orderBy` con el que se pidió la lista. */
async function orderByDe(grupo: string): Promise<Array<Record<string, unknown>>> {
  const prisma = makePrisma();
  const service = makeService(prisma);
  await service.adminList(1, { grupo } as never);
  return prisma.proyecto.findMany.mock.calls[0][0].orderBy as Array<Record<string, unknown>>;
}

describe('Bandeja administrativa — orden de pila', () => {
  it.each(['activos', 'revision', 'cierres', 'cerrados'])(
    'el grupo «%s» entrega primero lo más reciente',
    async (grupo) => {
      const orderBy = await orderByDe(grupo);

      expect(orderBy[0]).toEqual({ fechaActualizacion: { sort: 'desc', nulls: 'last' } });
    },
  );

  it('desempata por id descendente, nunca ascendente', async () => {
    const orderBy = await orderByDe('cierres');

    expect(orderBy[1]).toEqual({ idProyecto: 'desc' });
    expect(orderBy).not.toContainEqual({ idProyecto: 'asc' });
  });

  it('los proyectos nunca actualizados quedan al final, no encabezando la pila', async () => {
    const orderBy = await orderByDe('activos');
    const porFecha = orderBy[0].fechaActualizacion as { nulls: string };

    expect(porFecha.nulls).toBe('last');
  });
});
