import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/swal', () => ({
  default: { fire: vi.fn(), stopTimer: vi.fn(), resumeTimer: vi.fn() },
}));

import uvgSwal from '@/lib/swal';
import { aviso, confirmar, escucharConfirmaciones } from '../lib/mensajes';

const fire = vi.mocked(uvgSwal.fire);

function ultimaLlamada() {
    return fire.mock.calls.at(-1)?.[0] as unknown as Record<string, unknown>;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('aviso', () => {
  it('éxito sale como toast que se cierra solo y con la X', () => {
    aviso.exito('Tarea creada', 'La tarea se agregó al tablero.');
    const opciones = ultimaLlamada();
    expect(opciones.toast).toBe(true);
    expect(opciones.icon).toBe('success');
    expect(opciones.title).toBe('Tarea creada');
    expect(opciones.timer).toBeGreaterThan(0);
    expect(opciones.showCloseButton).toBe(true);
    expect(opciones.showConfirmButton).toBe(false);
  });

  it('el tipo también va escrito, no solo en el color', () => {
    aviso.exito('Listo');
    expect(ultimaLlamada().html).toContain('pill-success');
    aviso.error('No se pudo guardar');
    expect(ultimaLlamada().html).toContain('>Error<');
    aviso.advertencia('Revisa las fechas');
    expect(ultimaLlamada().html).toContain('>Atención<');
  });

  it('el error dura más que el éxito', () => {
    aviso.exito('Guardado');
    const exito = ultimaLlamada().timer as number;
    aviso.error('No se pudo guardar');
    const error = ultimaLlamada().timer as number;
    expect(error).toBeGreaterThan(exito);
  });

  it('escapa el texto para no inyectar HTML', () => {
    aviso.error('Falló', '<img src=x onerror=alert(1)>');
    const html = ultimaLlamada().html as string;
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
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
