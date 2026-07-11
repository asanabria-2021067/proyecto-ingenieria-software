import { describe, expect, it, vi } from 'vitest';
import { TasksController } from '../src/tasks/tasks.controller';

describe('TasksController - comentarios de tarea', () => {
  function makeController() {
    const tasksService = { findAll: vi.fn(), create: vi.fn(), update: vi.fn() } as any;
    const comentariosService = {
      findByTareaDesc: vi.fn(),
      create: vi.fn(),
      remove: vi.fn(),
    } as any;
    const controller = new TasksController(tasksService, comentariosService);
    return { controller, comentariosService };
  }

  it('GET :id/comentarios delega en findByTareaDesc (más reciente primero)', () => {
    const { controller, comentariosService } = makeController();
    controller.findComentarios(5);
    expect(comentariosService.findByTareaDesc).toHaveBeenCalledWith(5);
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
