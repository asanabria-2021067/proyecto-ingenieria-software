import { describe, expect, it, vi } from 'vitest';
import { GlobalSearchService } from '../src/search/global-search.service';
import type { UserNameSearchService } from '../src/common/search/user-name-search.service';
import type { PrismaService } from '../src/prisma/prisma.service';

function makePrisma(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    proyecto: { findMany: vi.fn().mockResolvedValue([]) },
    usuario: { findMany: vi.fn().mockResolvedValue([]) },
    tarea: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as PrismaService & {
    $queryRaw: ReturnType<typeof vi.fn>;
    proyecto: { findMany: ReturnType<typeof vi.fn> };
    usuario: { findMany: ReturnType<typeof vi.fn> };
    tarea: { findMany: ReturnType<typeof vi.fn> };
  };
}

function makeUserNameSearch() {
  return { findMatchingUserIds: vi.fn().mockResolvedValue([]) } as unknown as UserNameSearchService & {
    findMatchingUserIds: ReturnType<typeof vi.fn>;
  };
}

describe('GlobalSearchService.buscarProyectos', () => {
  it('resuelve ids por SQL crudo y luego hidrata solo proyectos visibles', async () => {
    const prisma = makePrisma();
    prisma.$queryRaw.mockResolvedValueOnce([{ id_proyecto: 1 }, { id_proyecto: 2 }]);
    prisma.proyecto.findMany.mockResolvedValueOnce([
      { idProyecto: 1, tituloProyecto: 'Móvil UVG', tipoProyecto: 'SOCIAL', modalidadProyecto: 'MIXTA' },
    ]);
    const service = new GlobalSearchService(prisma, makeUserNameSearch());

    const resultado = await service.buscarProyectos('movil');

    expect(prisma.proyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ idProyecto: { in: [1, 2] } }),
      }),
    );
    expect(resultado).toEqual({
      items: [{ idProyecto: 1, tituloProyecto: 'Móvil UVG', tipoProyecto: 'SOCIAL', modalidadProyecto: 'MIXTA' }],
      hasMore: false,
    });
  });

  it('marca hasMore cuando hay más de 5 coincidencias y recorta a 5', async () => {
    const prisma = makePrisma();
    const seisFilas = Array.from({ length: 6 }, (_, i) => ({
      idProyecto: i + 1,
      tituloProyecto: `Proyecto ${i + 1}`,
      tipoProyecto: 'SOCIAL',
      modalidadProyecto: 'MIXTA',
    }));
    prisma.$queryRaw.mockResolvedValueOnce(seisFilas.map((f) => ({ id_proyecto: f.idProyecto })));
    prisma.proyecto.findMany.mockResolvedValueOnce(seisFilas);
    const service = new GlobalSearchService(prisma, makeUserNameSearch());

    const resultado = await service.buscarProyectos('proyecto');

    expect(resultado.items).toHaveLength(5);
    expect(resultado.hasMore).toBe(true);
  });

  it('escapa los comodines de LIKE en el texto de busqueda', async () => {
    const prisma = makePrisma();
    const service = new GlobalSearchService(prisma, makeUserNameSearch());

    await service.buscarProyectos('50%_raro\\');

    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.values).toEqual(['%50\\%\\_raro\\\\%']);
  });
});
