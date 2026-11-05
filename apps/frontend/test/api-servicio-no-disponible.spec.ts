import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, EVENTO_MANTENIMIENTO } from '../lib/api/client';
import { getApiErrorMessage } from '../components/projects/api-error';

function responder(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, json: async () => body }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('503 estables del backend', () => {
  it('SERVICIO_NO_DISPONIBLE: el aviso nombra el servicio afectado en cualquier scope', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    responder(503, {
      statusCode: 503,
      codigo: 'SERVICIO_NO_DISPONIBLE',
      servicio: 'cloudinary',
      message: 'No se pudo guardar el archivo, intenta de nuevo',
    });
    const error = await apiFetch('/chat/x').catch((e: Error) => e);

    expect((error as Error).message).toBe(
      'No se pudo guardar el archivo, intenta de nuevo. Servicio afectado: almacenamiento de archivos (Cloudinary).',
    );
    expect(getApiErrorMessage(error, 'closure')).toBe((error as Error).message);
    expect(getApiErrorMessage(error, 'chat')).toBe((error as Error).message);
  });

  it('MANTENIMIENTO: avisa a la app con un evento', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const escucha = vi.fn();
    window.addEventListener(EVENTO_MANTENIMIENTO, escucha);
    responder(503, { statusCode: 503, codigo: 'MANTENIMIENTO', message: 'Volvemos pronto', regresoEstimado: null });
    await apiFetch('/proyectos').catch(() => undefined);
    window.removeEventListener(EVENTO_MANTENIMIENTO, escucha);

    expect(escucha).toHaveBeenCalledTimes(1);
  });
});
