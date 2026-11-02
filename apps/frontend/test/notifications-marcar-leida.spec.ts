import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ apiFetch }));

import { marcarLeida } from '../lib/services/notifications';

const aviso = (tipoNotificacion: string, datosJson: Record<string, unknown> | null) => ({
  idNotificacion: 9,
  tipoNotificacion,
  datosJson,
  leidaEn: '2026-11-02T10:00:00.000Z',
});

describe('MEJ-30: marcarLeida acusa el canal de revisión', () => {
  beforeEach(() => apiFetch.mockReset());

  it('un aviso de mensaje de revisión también marca leídos los mensajes del proyecto', async () => {
    apiFetch.mockResolvedValueOnce(aviso('MENSAJE_REVISION', { idProyecto: 4 })).mockResolvedValueOnce({ ok: true });
    await marcarLeida(9);
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/notificaciones/9/leer', { method: 'PATCH' });
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/mensajes-revision/proyectos/4/marcar-leidos', { method: 'PATCH' });
  });

  it('si el acuse falla, el aviso queda leído igual', async () => {
    apiFetch.mockResolvedValueOnce(aviso('MENSAJE_REVISION', { idProyecto: 4 })).mockRejectedValueOnce(new Error('403'));
    await expect(marcarLeida(9)).resolves.toMatchObject({ idNotificacion: 9 });
  });

  it('otros tipos, o sin proyecto válido, no tocan el canal', async () => {
    apiFetch.mockResolvedValueOnce(aviso('TAREA_ASIGNADA', { idProyecto: 4 }));
    await marcarLeida(9);
    apiFetch.mockResolvedValueOnce(aviso('MENSAJE_REVISION', null));
    await marcarLeida(9);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
