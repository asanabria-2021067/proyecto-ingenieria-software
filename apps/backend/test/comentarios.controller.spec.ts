import { describe, expect, it, vi } from 'vitest';
import type { ComentariosService } from '../src/comentarios/comentarios.service';
import { ComentariosController } from '../src/comentarios/comentarios.controller';

function makeService() {
  return {
    create: vi.fn(),
    findByProyecto: vi.fn(),
    findByHito: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
}

function makeController(service: ReturnType<typeof makeService>) {
  return new ComentariosController(service as unknown as ComentariosService);
}

describe('ComentariosController - lectura', () => {
  it('findByProyecto recibe el idProyecto de la ruta, propaga exactamente user.userId y devuelve el resultado del servicio', async () => {
    const service = makeService();
    service.findByProyecto.mockResolvedValue([{ idComentario: 1 }]);
    const controller = makeController(service);

    const result = await controller.findByProyecto(10, { userId: 7 });

    expect(service.findByProyecto).toHaveBeenCalledWith(10, 7);
    expect(service.findByProyecto).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ idComentario: 1 }]);
  });

  it('findByHito recibe el idHito de la ruta, propaga exactamente user.userId y devuelve el resultado del servicio', async () => {
    const service = makeService();
    service.findByHito.mockResolvedValue([{ idComentario: 3 }]);
    const controller = makeController(service);

    const result = await controller.findByHito(30, { userId: 9 });

    expect(service.findByHito).toHaveBeenCalledWith(30, 9);
    expect(service.findByHito).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ idComentario: 3 }]);
  });

  it('propaga el userId de cada solicitud sin reutilizar el de una llamada anterior', async () => {
    const service = makeService();
    const controller = makeController(service);

    await controller.findByProyecto(10, { userId: 1 });
    await controller.findByProyecto(10, { userId: 2 });

    expect(service.findByProyecto).toHaveBeenNthCalledWith(1, 10, 1);
    expect(service.findByProyecto).toHaveBeenNthCalledWith(2, 10, 2);
  });

  it('cuando el servicio rechaza por autorización, el controller propaga el rechazo sin transformarlo', async () => {
    const service = makeService();
    const forbidden = new Error('sin acceso');
    service.findByHito.mockRejectedValue(forbidden);
    const controller = makeController(service);

    await expect(controller.findByHito(30, { userId: 8 })).rejects.toBe(forbidden);
  });

  it('Tarea 28.C: ya no existe un handler findByTarea en el controller genérico', () => {
    const controller = makeController(makeService());
    expect((controller as unknown as Record<string, unknown>).findByTarea).toBeUndefined();
  });
});
