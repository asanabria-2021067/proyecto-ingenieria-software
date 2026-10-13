import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api/client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '../lib/api/client';
import { NOTIFICACIONES_POR_PAGINA, getNotificacionesPagina } from '../lib/services/notifications';

// HU-176 (T-292): la página de notificaciones pide de a 20.
describe('getNotificacionesPagina', () => {
  it('pide la página indicada con el tamaño fijo', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: [], total: 0, page: 2, totalPages: 0 });

    await getNotificacionesPagina(2);

    expect(NOTIFICACIONES_POR_PAGINA).toBe(20);
    expect(apiFetch).toHaveBeenCalledWith('/notificaciones?page=2&limit=20');
  });
});
