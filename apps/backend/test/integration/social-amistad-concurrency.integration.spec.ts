import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { SocialService } from '../../src/social/social.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { createIntegrationUser } from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';

/**
 * IESUC-568 (RTF 2 · 3.2): condición de carrera en `crearSolicitudAmistad`.
 * Una barrera retiene cada `amistad.create` hasta que las DOS transacciones
 * ya verificaron que no había relación previa: así la carrera ocurre siempre,
 * no por suerte del planificador. Sin el índice `amistad_par_no_ordenado_key`
 * ambas escrituras pasarían y quedarían dos filas para el mismo par.
 */

function barrera(participantes: number) {
  let llegados = 0;
  let soltar!: () => void;
  const abierta = new Promise<void>((resolve) => {
    soltar = resolve;
  });
  return async () => {
    llegados += 1;
    if (llegados >= participantes) soltar();
    await abierta;
  };
}

/** PrismaService real cuyo `tx.amistad.create` espera en la barrera. */
function prismaConBarrera(prisma: PrismaClient, esperar: () => Promise<void>): PrismaService {
  const envolverTx = (tx: object) =>
    new Proxy(tx, {
      get(target, prop) {
        const valor = Reflect.get(target, prop);
        if (prop !== 'amistad') return valor;
        return new Proxy(valor, {
          get(delegate, metodo) {
            const fn = Reflect.get(delegate, metodo);
            if (metodo === 'create') {
              return async (args: unknown) => {
                await esperar();
                return fn.call(delegate, args);
              };
            }
            return typeof fn === 'function' ? fn.bind(delegate) : fn;
          },
        });
      },
    });
  return new Proxy(prisma, {
    get(target, prop) {
      if (prop === '$transaction') {
        return (callback: (tx: object) => Promise<unknown>, options?: unknown) =>
          target.$transaction((tx) => callback(envolverTx(tx)), options as never);
      }
      const valor = Reflect.get(target, prop);
      return typeof valor === 'function' ? valor.bind(target) : valor;
    },
  }) as unknown as PrismaService;
}

describeIntegration('social: solicitudes de amistad concurrentes (RTF 3.2)', () => {
  let prisma: PrismaClient;
  let scope: IntegrationCleanupScope;
  let notifications: { notifyFromTemplate: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    scope = {};
    notifications = { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) };
  });

  afterEach(async () => {
    const userIds = scope.userIds ?? [];
    if (userIds.length > 0) {
      await prisma.amistad.deleteMany({
        where: { OR: [{ idUsuarioSolicitante: { in: userIds } }, { idUsuarioReceptor: { in: userIds } }] },
      });
    }
    await cleanupIntegrationFixtures(prisma, scope);
  });

  async function dosUsuarios() {
    const a = await createIntegrationUser(prisma, { nombre: 'Ana' });
    const b = await createIntegrationUser(prisma, { nombre: 'Beto' });
    scope.userIds = [a.idUsuario, b.idUsuario];
    return [a.idUsuario, b.idUsuario] as const;
  }

  it('dos solicitudes cruzadas simultáneas dejan una sola fila y la otra recibe 409', async () => {
    const [a, b] = await dosUsuarios();
    const service = new SocialService(
      prismaConBarrera(prisma, barrera(2)),
      notifications as unknown as NotificationsService,
    );

    const resultados = await Promise.allSettled([
      service.crearSolicitudAmistad(a, b),
      service.crearSolicitudAmistad(b, a),
    ]);

    const cumplidas = resultados.filter((r) => r.status === 'fulfilled');
    const rechazadas = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(cumplidas).toHaveLength(1);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].reason).toBeInstanceOf(ConflictException);
    expect((rechazadas[0].reason as ConflictException).getStatus()).toBe(409);

    const filas = await prisma.amistad.findMany({
      where: {
        OR: [
          { idUsuarioSolicitante: a, idUsuarioReceptor: b },
          { idUsuarioSolicitante: b, idUsuarioReceptor: a },
        ],
      },
    });
    expect(filas).toHaveLength(1);
    expect(filas[0].estado).toBe('PENDIENTE');
    // Solo la solicitud confirmada notifica; la rechazada no deja rastro.
    expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(1);
  });

  it('dos solicitudes simultáneas en el mismo sentido también dejan una sola fila', async () => {
    const [a, b] = await dosUsuarios();
    const service = new SocialService(
      prismaConBarrera(prisma, barrera(2)),
      notifications as unknown as NotificationsService,
    );

    const resultados = await Promise.allSettled([
      service.crearSolicitudAmistad(a, b),
      service.crearSolicitudAmistad(a, b),
    ]);

    const rechazadas = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].reason).toBeInstanceOf(ConflictException);
    expect(await prisma.amistad.count({ where: { idUsuarioSolicitante: a, idUsuarioReceptor: b } })).toBe(1);
  });

  it('el índice del par no ordenado rechaza la fila inversa aunque se inserte directo', async () => {
    const [a, b] = await dosUsuarios();
    await prisma.amistad.create({ data: { idUsuarioSolicitante: a, idUsuarioReceptor: b } });

    await expect(
      prisma.amistad.create({ data: { idUsuarioSolicitante: b, idUsuarioReceptor: a } }),
    ).rejects.toMatchObject({ code: 'P2002', meta: expect.objectContaining({ modelName: 'Amistad' }) });
  });

  it('en secuencia, la solicitud inversa sigue aceptando la pendiente (sin regresión)', async () => {
    const [a, b] = await dosUsuarios();
    const service = new SocialService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );

    await service.crearSolicitudAmistad(a, b);
    const aceptada = await service.crearSolicitudAmistad(b, a);

    expect(aceptada.estado).toBe('ACEPTADA');
    expect(notifications.notifyFromTemplate).toHaveBeenLastCalledWith([a], 'AMISTAD_ACEPTADA', expect.any(Object));
  });
});
