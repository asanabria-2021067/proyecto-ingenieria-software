import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * HU-176 (T-293): sweetalert2 se importa la primera vez que se muestra un
 * aviso, no en el JS inicial del dashboard.
 */

const fire = vi.fn().mockResolvedValue({ isConfirmed: true });
const mixin = vi.fn(() => ({ fire }));
let importado = false;

vi.mock('sweetalert2', () => {
  importado = true;
  return { default: { mixin } };
});

beforeEach(() => {
  vi.resetModules();
  importado = false;
  fire.mockClear();
  mixin.mockClear();
});

describe('uvgSwal con carga diferida', () => {
  it('no carga sweetalert2 al importar lib/swal', async () => {
    await import('../lib/swal');
    expect(importado).toBe(false);
  });

  it('carga sweetalert2 en el primer fire y reutiliza la instancia', async () => {
    const { default: uvgSwal } = await import('../lib/swal');

    const resultado = await uvgSwal.fire({ title: 'Hola' });
    await uvgSwal.fire({ title: 'Otra vez' });

    expect(resultado).toEqual({ isConfirmed: true });
    expect(mixin).toHaveBeenCalledTimes(1);
    expect(mixin).toHaveBeenCalledWith(expect.objectContaining({ buttonsStyling: false, confirmButtonText: 'Aceptar' }));
    expect(fire).toHaveBeenNthCalledWith(1, { title: 'Hola' });
  });

  it('los avisos de éxito siguen usando el check estático', async () => {
    const { default: uvgSwal } = await import('../lib/swal');

    await uvgSwal.fire({ icon: 'success', title: 'Listo' });

    expect(fire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'success', iconHtml: expect.stringContaining('<svg') }));
  });
});
