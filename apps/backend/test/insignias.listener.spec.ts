import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { EVENT_LISTENER_METADATA } from '@nestjs/event-emitter/dist/constants';
import { INSIGNIAS_EVENTO } from '../src/insignias/insignias.catalog';
import { InsigniasController } from '../src/insignias/insignias.controller';
import { InsigniasListener } from '../src/insignias/insignias.listener';

function build() {
  const prisma = {
    asignacionTarea: { findMany: vi.fn().mockResolvedValue([{ idUsuario: 4 }, { idUsuario: 5 }]) },
    proyecto: { findUnique: vi.fn().mockResolvedValue({ creadoPor: 1 }) },
    participacionProyecto: { findMany: vi.fn().mockResolvedValue([{ idUsuario: 2 }, { idUsuario: 1 }]) },
  };
  const insignias = { recalcular: vi.fn().mockResolvedValue([]) };
  const listener = new InsigniasListener(prisma as never, insignias as never);
  return { listener, prisma, insignias };
}

const usuariosRecalculados = (insignias: { recalcular: { mock: { calls: unknown[][] } } }) =>
  insignias.recalcular.mock.calls.map((c) => c[0]);

describe('InsigniasListener (HU-190, T-347)', () => {
  it('escucha el evento de forma asíncrona (no bloquea la respuesta HTTP)', () => {
    const meta = Reflect.getMetadata(EVENT_LISTENER_METADATA, InsigniasListener.prototype.handle);
    expect(meta).toEqual([{ event: INSIGNIAS_EVENTO, options: { async: true } }]);
  });

  it('idUsuarios explícitos: recalcula esos usuarios con las claves del evento', async () => {
    const { listener, insignias, prisma } = build();
    await listener.handle({ claves: ['comentarios'], idUsuarios: [7] });
    expect(insignias.recalcular).toHaveBeenCalledWith(7, ['comentarios']);
    expect(prisma.asignacionTarea.findMany).not.toHaveBeenCalled();
  });

  it('idTarea: recalcula a todos los asignados a la tarea', async () => {
    const { listener, insignias, prisma } = build();
    await listener.handle({ claves: ['tareas', 'sprints'], idTarea: 30 });
    expect(prisma.asignacionTarea.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { idTarea: 30 } }));
    expect(usuariosRecalculados(insignias)).toEqual([4, 5]);
  });

  it('idProyecto: recalcula al líder y a los participantes, sin repetir', async () => {
    const { listener, insignias } = build();
    await listener.handle({ claves: ['cerrados'], idProyecto: 8 });
    expect(usuariosRecalculados(insignias).sort()).toEqual([1, 2]);
  });

  it('un fallo con un usuario se registra y no impide a los demás ni lanza', async () => {
    const { listener, insignias } = build();
    insignias.recalcular.mockRejectedValueOnce(new Error('boom'));
    await expect(listener.handle({ claves: ['tareas'], idUsuarios: [1, 2] })).resolves.toBeUndefined();
    expect(insignias.recalcular).toHaveBeenCalledTimes(2);
  });

  it('un fallo al resolver usuarios no lanza', async () => {
    const { listener, prisma, insignias } = build();
    prisma.asignacionTarea.findMany.mockRejectedValueOnce(new Error('db caída'));
    await expect(listener.handle({ claves: ['tareas'], idTarea: 1 })).resolves.toBeUndefined();
    expect(insignias.recalcular).not.toHaveBeenCalled();
  });
});

describe('InsigniasController', () => {
  it('GET /insignias/me devuelve las insignias del usuario autenticado, no de otro', async () => {
    const insignias = { listarMias: vi.fn().mockResolvedValue([{ clave: 'tareas' }]) };
    const controller = new InsigniasController(insignias as never);
    await expect(controller.listarMias({ userId: 12 })).resolves.toEqual([{ clave: 'tareas' }]);
    expect(insignias.listarMias).toHaveBeenCalledWith(12);
  });
});
