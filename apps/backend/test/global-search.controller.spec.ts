import { describe, expect, it, vi } from 'vitest';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { GlobalSearchService } from '../src/search/global-search.service';
import { GlobalSearchController } from '../src/search/global-search.controller';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

function makeGlobalSearch() {
  return {
    buscar: vi.fn().mockResolvedValue({
      proyectos: { items: [], hasMore: false },
      personas: { items: [], hasMore: false },
      tareas: { items: [], hasMore: false },
    }),
  } as unknown as GlobalSearchService & { buscar: ReturnType<typeof vi.fn> };
}

describe('GlobalSearchController (GET /busqueda)', () => {
  it('esta protegido por JwtAuthGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, GlobalSearchController) ?? [];
    expect(guards).toContain(JwtAuthGuard);
  });

  it('delega en GlobalSearchService.buscar con el userId y el texto de la query', async () => {
    const globalSearch = makeGlobalSearch();
    const controller = new GlobalSearchController(globalSearch);

    await controller.buscar({ q: 'react' }, { userId: 9 });

    expect(globalSearch.buscar).toHaveBeenCalledWith(9, 'react');
  });

  it('retorna exactamente lo que resuelve el servicio, sin transformarlo', async () => {
    const globalSearch = makeGlobalSearch();
    const respuesta = { proyectos: { items: [{ idProyecto: 1 }], hasMore: false }, personas: { items: [], hasMore: false }, tareas: { items: [], hasMore: false } };
    globalSearch.buscar.mockResolvedValueOnce(respuesta);
    const controller = new GlobalSearchController(globalSearch);

    const resultado = await controller.buscar({ q: 'x' }, { userId: 1 });

    expect(resultado).toBe(respuesta);
  });
});
