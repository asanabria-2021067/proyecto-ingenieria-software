import { describe, expect, it, vi } from 'vitest';
import { SavedProjectAlertsService } from '../src/projects/saved-project-alerts.service';

function crear(proyectos: unknown[]) {
  const prisma = {
    proyecto: { findMany: vi.fn().mockResolvedValue(proyectos) },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
  };
  const notifications = {
    persistTemplateTx: vi.fn().mockImplementation(async (_tx, ids: number[]) => ({ count: ids.length })),
    publishEffects: vi.fn().mockResolvedValue(undefined),
  };
  return { prisma, notifications, service: new SavedProjectAlertsService(prisma as never, notifications as never) };
}

const proyecto = (extra: Record<string, unknown> = {}) => ({
  idProyecto: 5,
  tituloProyecto: 'Feria',
  estadoProyecto: 'PUBLICADO',
  creadoPor: 1,
  guardadoPor: [{ idUsuario: 10 }, { idUsuario: 11 }, { idUsuario: 1 }, { idUsuario: 12 }],
  roles: [{ cupos: 3, participaciones: [{ idUsuario: 12 }, { idUsuario: 20 }] }],
  ...extra,
});

describe('SavedProjectAlertsService (MEJ-17)', () => {
  it('avisa a quien guardó con 1 cupo, sin avisar al líder ni a quien ya participa', async () => {
    const { notifications, service } = crear([proyecto()]);
    await expect(service.ejecutar()).resolves.toBe(2);
    const [, destinatarios, plantilla, datos, , opciones] = notifications.persistTemplateTx.mock.calls[0];
    expect(destinatarios).toEqual([10, 11]);
    expect(plantilla).toBe('PROYECTO_GUARDADO_AVISO');
    expect(datos).toMatchObject({ motivo: 'CUPOS', cuposDisponibles: 1, projectId: 5 });
    expect(opciones).toEqual({ claveIdempotencia: 'guardado:cupos:5:1' });
    expect(notifications.publishEffects).toHaveBeenCalled();
  });

  it('avisa con 2 cupos y no con 3 ni con 0', async () => {
    const dos = crear([proyecto({ roles: [{ cupos: 3, participaciones: [{ idUsuario: 20 }] }] })]);
    await dos.service.ejecutar();
    expect(dos.notifications.persistTemplateTx.mock.calls[0][5]).toEqual({ claveIdempotencia: 'guardado:cupos:5:2' });

    for (const roles of [[{ cupos: 3, participaciones: [] }], [{ cupos: 1, participaciones: [{ idUsuario: 20 }] }]]) {
      const { notifications, service } = crear([proyecto({ roles })]);
      await expect(service.ejecutar()).resolves.toBe(0);
      expect(notifications.persistTemplateTx).not.toHaveBeenCalled();
    }
  });

  it('los cupos se suman entre roles', async () => {
    const { notifications, service } = crear([
      proyecto({ roles: [{ cupos: 2, participaciones: [{ idUsuario: 20 }] }, { cupos: 2, participaciones: [{ idUsuario: 21 }] }] }),
    ]);
    await service.ejecutar();
    expect(notifications.persistTemplateTx.mock.calls[0][3]).toMatchObject({ cuposDisponibles: 2 });
  });

  it('en solicitud de cierre avisa una vez por proyecto sin importar los cupos', async () => {
    const { notifications, service } = crear([proyecto({ estadoProyecto: 'EN_SOLICITUD_CIERRE', roles: [{ cupos: 9, participaciones: [] }] })]);
    await service.ejecutar();
    const [, , , datos, , opciones] = notifications.persistTemplateTx.mock.calls[0];
    expect(datos).toMatchObject({ motivo: 'CIERRE' });
    expect(opciones).toEqual({ claveIdempotencia: 'guardado:cierre:5' });
  });

  it('solo mira proyectos activos con guardados de cuentas activas', async () => {
    const { prisma, service } = crear([]);
    await service.ejecutar();
    const where = prisma.proyecto.findMany.mock.calls[0][0].where;
    expect(where.eliminadoEn).toBeNull();
    expect(where.estadoProyecto.in).toEqual(['PUBLICADO', 'EN_PROGRESO', 'EN_SOLICITUD_CIERRE']);
    expect(where.guardadoPor.some.usuario.estado).toBe('ACTIVO');
  });

  it('un fallo no derriba el cron y libera el candado', async () => {
    const { prisma, service } = crear([]);
    prisma.proyecto.findMany.mockRejectedValueOnce(new Error('db'));
    await expect(service.revisar()).resolves.toBeUndefined();
    await service.revisar();
    expect(prisma.proyecto.findMany).toHaveBeenCalledTimes(2);
  });
});
