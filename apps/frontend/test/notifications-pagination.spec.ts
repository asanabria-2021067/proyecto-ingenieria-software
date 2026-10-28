import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api/client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '../lib/api/client';
import { NOTIFICACIONES_POR_PAGINA, getNotificacionesPagina, getProyectosDeNotificaciones, marcarTodasLeidas } from '../lib/services/notifications';

// HU-176 (T-292): la página de notificaciones pide de a 20.
describe('getNotificacionesPagina', () => {
  it('pide la página indicada con el tamaño fijo', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: [], total: 0, page: 2, totalPages: 0 });

    await getNotificacionesPagina(2);

    expect(NOTIFICACIONES_POR_PAGINA).toBe(20);
    expect(apiFetch).toHaveBeenCalledWith('/notificaciones?page=2&limit=20');
  });

  // Sprint 10 (bandeja): los filtros viajan al servidor; sin ellos la URL es la de siempre.
  it('serializa tipos, leída, búsqueda, proyecto y orden; omite lo vacío y el orden por defecto', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: [], total: 0, page: 1, totalPages: 0 });

    await getNotificacionesPagina(1, { tipos: ['TAREA_ASIGNADA', 'HITO_ACTUALIZADO'], leida: false, q: '  horas ', proyecto: 64, orden: 'asc' });
    expect(apiFetch).toHaveBeenLastCalledWith('/notificaciones?page=1&limit=20&tipos=TAREA_ASIGNADA%2CHITO_ACTUALIZADO&leida=false&q=horas&proyecto=64&orden=asc');

    await getNotificacionesPagina(3, { tipos: [], q: '   ', orden: 'desc', proyecto: 'ninguno' });
    expect(apiFetch).toHaveBeenLastCalledWith('/notificaciones?page=3&limit=20&proyecto=ninguno');
  });
});

describe('marcarTodasLeidas y proyectos de la bandeja (Sprint 10)', () => {
  it('sin filtros marca todas; con filtros acota con la misma query que la lista', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ actualizadas: 0 });
    await marcarTodasLeidas();
    expect(apiFetch).toHaveBeenLastCalledWith('/notificaciones/leer-todas', { method: 'PATCH' });
    await marcarTodasLeidas({ tipos: ['REUNION_PROGRAMADA'], q: 'equipo', proyecto: 'ninguno' });
    expect(apiFetch).toHaveBeenLastCalledWith('/notificaciones/leer-todas?tipos=REUNION_PROGRAMADA&q=equipo&proyecto=ninguno', { method: 'PATCH' });
  });

  it('pide los proyectos referenciados por los avisos propios', async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);
    await getProyectosDeNotificaciones();
    expect(apiFetch).toHaveBeenLastCalledWith('/notificaciones/mias/proyectos');
  });
});
