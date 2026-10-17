import { describe, expect, it, vi } from 'vitest';
import type { ComentariosService } from '../src/comentarios/comentarios.service';
import { ComentariosController } from '../src/comentarios/comentarios.controller';

function makeService() {
  return {
    create: vi.fn(),
    findByProyecto: vi.fn(),
    findByHito: vi.fn(),
    findMencionables: vi.fn(),
    countByHitosDelProyecto: vi.fn(),
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

describe('ComentariosController - menciones (HU-200)', () => {
  it('findMencionables delega con el idProyecto de la ruta y el usuario de la sesión', async () => {
    const service = makeService();
    service.findMencionables.mockResolvedValue([{ idUsuario: 4 }]);
    const controller = makeController(service);

    const result = await controller.findMencionables(10, { userId: 7 });

    expect(service.findMencionables).toHaveBeenCalledWith(10, 7);
    expect(result).toEqual([{ idUsuario: 4 }]);
  });

  it('countByHitos delega en countByHitosDelProyecto', async () => {
    const service = makeService();
    service.countByHitosDelProyecto.mockResolvedValue([{ idHito: 1, cantidad: 2 }]);
    const controller = makeController(service);

    const result = await controller.countByHitos(10, { userId: 7 });

    expect(service.countByHitosDelProyecto).toHaveBeenCalledWith(10, 7);
    expect(result).toEqual([{ idHito: 1, cantidad: 2 }]);
  });

  it('un rechazo de autorización del servicio se propaga sin transformarse', async () => {
    const service = makeService();
    const forbidden = new Error('sin acceso');
    service.findMencionables.mockRejectedValue(forbidden);
    const controller = makeController(service);

    await expect(controller.findMencionables(10, { userId: 99 })).rejects.toBe(forbidden);
  });
});
