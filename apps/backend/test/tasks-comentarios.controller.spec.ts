import { describe, expect, it, vi } from 'vitest';
import { TareaComentariosController } from '../src/tasks/tarea-comentarios.controller';

// Tarea 15: estos métodos se extrajeron de TasksController a
// TareaComentariosController para conservar intactas las rutas
// /tareas/:id/comentarios* cuando TasksController pasó a anidarse bajo
// proyectos/:projectId/tareas. El comportamiento probado aquí no cambió.
describe('TareaComentariosController - comentarios de tarea', () => {
  function makeController() {
    const comentariosService = {
      findByTareaDesc: vi.fn(),
      create: vi.fn(),
      remove: vi.fn(),
    } as any;
    const controller = new TareaComentariosController(comentariosService);
    return { controller, comentariosService };
  }

  it('GET :id/comentarios delega en findByTareaDesc propagando taskId y el userId autenticado', async () => {
    const { controller, comentariosService } = makeController();
    comentariosService.findByTareaDesc.mockResolvedValue([{ idComentario: 1 }]);

    const result = await controller.findComentarios(5, { userId: 3 });

    expect(comentariosService.findByTareaDesc).toHaveBeenCalledWith(5, 3);
    expect(comentariosService.findByTareaDesc).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ idComentario: 1 }]);
  });

  it('GET :id/comentarios propaga un userId distinto en cada solicitud (no lo cachea)', async () => {
    const { controller, comentariosService } = makeController();

    await controller.findComentarios(5, { userId: 1 });
    await controller.findComentarios(5, { userId: 2 });

    expect(comentariosService.findByTareaDesc).toHaveBeenNthCalledWith(1, 5, 1);
    expect(comentariosService.findByTareaDesc).toHaveBeenNthCalledWith(2, 5, 2);
  });

  it('POST :id/comentarios crea el comentario con el idTarea de la URL y el autor del JWT', () => {
    const { controller, comentariosService } = makeController();
    controller.createComentario(5, { userId: 1 }, { contenido: 'Hola equipo' });
    expect(comentariosService.create).toHaveBeenCalledWith(1, {
      idTarea: 5,
      contenido: 'Hola equipo',
    });
  });

  it('DELETE :id/comentarios/:idComentario delega la validación de autoría en el service', () => {
    const { controller, comentariosService } = makeController();
    controller.removeComentario(10, { userId: 1 });
    expect(comentariosService.remove).toHaveBeenCalledWith(10, 1);
  });
});
