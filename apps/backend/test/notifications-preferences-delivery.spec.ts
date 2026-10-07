import { describe, expect, it, vi } from 'vitest';
import { Prisma, TipoNotificacion } from '@prisma/client';
import { NotificationsService, type PostCommitEffect } from '../src/notifications/notifications.service';
import { NotificationsGateway } from '../src/notifications/notifications.gateway';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * HU-185 (T-327): el servicio respeta las preferencias antes de guardar y
 * emitir. Prisma se simula en memoria (filtra por el `where` recibido) y el
 * gateway real emite sobre un server falso que registra cada sala.
 */
type Pref = { idUsuario: number; tipoNotificacion: TipoNotificacion; activa: boolean };
type PrefWhere = {
  idUsuario: { in: number[] };
  tipoNotificacion: TipoNotificacion;
  activa: boolean;
};

function makePrisma(preferencias: Pref[] = []) {
  const guardadas: Prisma.NotificacionCreateManyInput[] = [];
  const prisma = {
    guardadas,
    notificacion: {
      createMany: vi.fn(async ({ data }: { data: Prisma.NotificacionCreateManyInput[] }) => {
        guardadas.push(...data);
        return { count: data.length };
      }),
    },
    preferenciaNotificacion: {
      findMany: vi.fn(async ({ where }: { where: PrefWhere }) =>
        preferencias
          .filter(
            (p) =>
              where.idUsuario.in.includes(p.idUsuario) &&
              p.tipoNotificacion === where.tipoNotificacion &&
              p.activa === where.activa,
          )
          .map((p) => ({ idUsuario: p.idUsuario })),
      ),
    },
  };
  return prisma as typeof prisma & PrismaService;
}

function makeGateway() {
  const salas: string[] = [];
  const gateway = new NotificationsGateway(undefined as never);
  gateway.server = {
    to: (sala: string) => ({
      emit: (evento: string) => {
        if (evento === 'notification') salas.push(sala);
        return true;
      },
    }),
  } as unknown as NotificationsGateway['server'];
  return { gateway, salas };
}

const TAREA = {
  tipoNotificacion: TipoNotificacion.TAREA_ASIGNADA,
  tituloNotificacion: 'Nueva tarea',
};

const notificados = (prisma: ReturnType<typeof makePrisma>) => prisma.guardadas.map((n) => n.idUsuario);

describe('notifyUsers respeta las preferencias (T-327)', () => {
  it('un usuario con la preferencia activa recibe la notificación', async () => {
    const prisma = makePrisma([{ idUsuario: 1, tipoNotificacion: TipoNotificacion.TAREA_ASIGNADA, activa: true }]);
    const { gateway, salas } = makeGateway();

    await new NotificationsService(prisma, gateway).notifyUsers([1], TAREA);

    expect(notificados(prisma)).toEqual([1]);
    expect(salas).toEqual(['user:1']);
  });

  it('un usuario con el tipo desactivado no tiene fila guardada ni recibe socket', async () => {
    const prisma = makePrisma([{ idUsuario: 1, tipoNotificacion: TipoNotificacion.TAREA_ASIGNADA, activa: false }]);
    const { gateway, salas } = makeGateway();

    await new NotificationsService(prisma, gateway).notifyUsers([1], TAREA);

    expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
    expect(prisma.guardadas).toEqual([]);
    expect(salas).toEqual([]);
  });

  it('un usuario sin preferencia registrada recibe la notificación', async () => {
    const prisma = makePrisma();
    const { gateway, salas } = makeGateway();

    await new NotificationsService(prisma, gateway).notifyUsers([1], TAREA);

    expect(notificados(prisma)).toEqual([1]);
    expect(salas).toEqual(['user:1']);
  });

  it('en un envío múltiple solo se excluye a quien desactivó el tipo', async () => {
    const prisma = makePrisma([
      { idUsuario: 1, tipoNotificacion: TipoNotificacion.TAREA_ASIGNADA, activa: true },
      { idUsuario: 2, tipoNotificacion: TipoNotificacion.TAREA_ASIGNADA, activa: false },
      { idUsuario: 4, tipoNotificacion: TipoNotificacion.TAREA_ASIGNADA, activa: true },
    ]);
    const { gateway, salas } = makeGateway();

    await new NotificationsService(prisma, gateway).notifyUsers([1, 2, 3, 4], TAREA);

    expect(notificados(prisma)).toEqual([1, 3, 4]);
    expect(salas).toEqual(['user:1', 'user:3', 'user:4']);
  });

  it('desactivar otro tipo no bloquea este', async () => {
    const prisma = makePrisma([
      { idUsuario: 1, tipoNotificacion: TipoNotificacion.NUEVA_POSTULACION, activa: false },
    ]);
    const { gateway, salas } = makeGateway();

    await new NotificationsService(prisma, gateway).notifyUsers([1], TAREA);

    expect(notificados(prisma)).toEqual([1]);
    expect(salas).toEqual(['user:1']);
  });

  it('consulta las preferencias de todos los destinatarios en una sola llamada', async () => {
    const prisma = makePrisma();
    const { gateway } = makeGateway();

    await new NotificationsService(prisma, gateway).notifyUsers([1, 2, 3, 4, 5], TAREA);

    expect(prisma.preferenciaNotificacion.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.preferenciaNotificacion.findMany).toHaveBeenCalledWith({
      where: {
        idUsuario: { in: [1, 2, 3, 4, 5] },
        tipoNotificacion: TipoNotificacion.TAREA_ASIGNADA,
        activa: false,
      },
      select: { idUsuario: true },
    });
  });

  it('usa el tx recibido para la consulta de preferencias', async () => {
    const raiz = makePrisma();
    const tx = makePrisma([{ idUsuario: 1, tipoNotificacion: TipoNotificacion.TAREA_ASIGNADA, activa: false }]);

    await new NotificationsService(raiz, undefined as never).notifyUsers([1, 2], TAREA, tx as unknown as Prisma.TransactionClient);

    expect(raiz.preferenciaNotificacion.findMany).not.toHaveBeenCalled();
    expect(tx.preferenciaNotificacion.findMany).toHaveBeenCalledTimes(1);
    expect(notificados(tx)).toEqual([2]);
  });

  it('las notificaciones por plantilla heredan el filtro', async () => {
    const prisma = makePrisma([
      { idUsuario: 1, tipoNotificacion: TipoNotificacion.RECORDATORIO_EVENTO, activa: false },
    ]);
    const { gateway, salas } = makeGateway();
    const service = new NotificationsService(prisma, gateway);

    await service.notifyFromTemplate([1, 2], 'RECORDATORIO_EVENTO', {
      eventTitle: 'Reunión',
      projectTitle: 'Proyecto',
      projectId: 10,
      eventId: 20,
      fechaInicioTexto: '10/10/2026 10:00',
    });

    expect(notificados(prisma)).toEqual([2]);
    expect(salas).toEqual(['user:2']);
  });
});

describe('persistUsersTx respeta las preferencias (T-327)', () => {
  function makeSink() {
    const effects: PostCommitEffect[] = [];
    return { effects, sink: { add: (e: PostCommitEffect) => effects.push(e) } };
  }

  it('no guarda ni publica post-commit para quien desactivó el tipo', async () => {
    const tx = makePrisma([
      { idUsuario: 2, tipoNotificacion: TipoNotificacion.TAREA_ASIGNADA, activa: false },
    ]);
    const { gateway, salas } = makeGateway();
    const service = new NotificationsService(tx, gateway);
    const { effects, sink } = makeSink();

    const result = await service.persistUsersTx(tx as unknown as Prisma.TransactionClient, [1, 2, 3], TAREA, sink);
    await service.publishEffects(effects);

    expect(result).toEqual({ count: 2 });
    expect(notificados(tx)).toEqual([1, 3]);
    expect(salas).toEqual(['user:1', 'user:3']);
    expect(tx.preferenciaNotificacion.findMany).toHaveBeenCalledTimes(1);
  });

  it('si todos lo desactivaron no escribe ni registra efectos', async () => {
    const tx = makePrisma([
      { idUsuario: 1, tipoNotificacion: TipoNotificacion.TAREA_ASIGNADA, activa: false },
    ]);
    const { effects, sink } = makeSink();

    const result = await new NotificationsService(tx, undefined as never).persistUsersTx(
      tx as unknown as Prisma.TransactionClient,
      [1, 1],
      TAREA,
      sink,
    );

    expect(result).toEqual({ count: 0 });
    expect(tx.notificacion.createMany).not.toHaveBeenCalled();
    expect(effects).toEqual([]);
  });
});
