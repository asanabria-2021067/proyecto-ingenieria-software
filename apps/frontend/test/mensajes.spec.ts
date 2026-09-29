import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

import { toast } from 'sonner';
import { aviso, confirmar, escucharConfirmaciones } from '../lib/mensajes';

function ultimaLlamada(fn: ReturnType<typeof vi.fn>) {
  const call = fn.mock.calls.at(-1);
  return { titulo: call?.[0] as string, opciones: call?.[1] as Record<string, unknown> };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('aviso', () => {
  it('éxito usa toast.success con el título y la descripción', () => {
    aviso.exito('Tarea creada', 'La tarea se agregó al tablero.');
    const { titulo, opciones } = ultimaLlamada(vi.mocked(toast.success));
    expect(titulo).toBe('Tarea creada');
    expect(opciones.description).toBe('La tarea se agregó al tablero.');
    expect(opciones.duration).toBeGreaterThan(0);
  });

  it('cada tipo usa su propio método de sonner', () => {
    aviso.exito('Listo');
    expect(toast.success).toHaveBeenCalledWith('Listo', expect.any(Object));
    aviso.error('No se pudo guardar');
    expect(toast.error).toHaveBeenCalledWith('No se pudo guardar', expect.any(Object));
    aviso.advertencia('Revisa las fechas');
    expect(toast.warning).toHaveBeenCalledWith('Revisa las fechas', expect.any(Object));
  });

  it('el error dura más que el éxito', () => {
    aviso.exito('Guardado');
    const exito = ultimaLlamada(vi.mocked(toast.success)).opciones.duration as number;
    aviso.error('No se pudo guardar');
    const error = ultimaLlamada(vi.mocked(toast.error)).opciones.duration as number;
    expect(error).toBeGreaterThan(exito);
  });
});

describe('confirmar', () => {
  it('resuelve true o false según lo que responda el host activo', async () => {
    const cancelar = escucharConfirmaciones((solicitud) => solicitud.responder(true));
    await expect(
      confirmar({ titulo: '¿Cerrar sprint?', descripcion: 'Se cierra el Sprint 8.', textoAccion: 'Cerrar sprint' }),
    ).resolves.toBe(true);
    cancelar();
  });

  it('sin host activo, encola la solicitud hasta que uno se registre', async () => {
    const promesa = confirmar({ titulo: '¿Rechazar postulación?', descripcion: 'Ana no entrará al proyecto.', textoAccion: 'Rechazar postulación' });
    const cancelar = escucharConfirmaciones((solicitud) => solicitud.responder(false));
    await expect(promesa).resolves.toBe(false);
    cancelar();
  });

  it('pasa la descripción, el texto del botón y el flag destructiva tal cual', async () => {
    let recibido: Parameters<Parameters<typeof escucharConfirmaciones>[0]>[0] | null = null;
    const cancelar = escucharConfirmaciones((solicitud) => {
      recibido = solicitud;
      solicitud.responder(true);
    });
    await confirmar({
      titulo: '¿Eliminar la tarea?',
      descripcion: 'Se borra «Diseñar login».',
      textoAccion: 'Eliminar tarea',
      destructiva: true,
    });
    expect(recibido).toMatchObject({
      titulo: '¿Eliminar la tarea?',
      descripcion: 'Se borra «Diseñar login».',
      textoAccion: 'Eliminar tarea',
      destructiva: true,
    });
    cancelar();
  });
});
