import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { SprintsContextService } from '../src/sprints/sprints-context.service';
import type { SprintsAuthorizationService } from '../src/sprints/sprints-authorization.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { BitacoraEventosService } from '../src/bitacora/bitacora-eventos.service';
import { SprintsService } from '../src/sprints/sprints.service';

function makeTx() {
  return {
    sprint: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ idSprint: 10, idProyecto: 5, numero: 1, estado: 'ACTIVO' }),
    },
  };
}

function makePrisma(tx = makeTx()) {
  const prisma = {
    tx,
    $transaction: vi.fn(async (cb: (t: ReturnType<typeof makeTx>) => unknown) => cb(tx)),
  };
  return prisma as typeof prisma & PrismaService;
}

function makeBitacora() {
  return { registrarEvento: vi.fn().mockResolvedValue(undefined) } as unknown as BitacoraEventosService & {
    registrarEvento: ReturnType<typeof vi.fn>;
  };
}

describe('SprintsService.startSprint — instrumentación de bitácora (T-164)', () => {
  it('registra SPRINT_STARTED con el mismo tx que la creación del Sprint', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const bitacora = makeBitacora();
    const context = {
      assertProjectLeader: vi.fn().mockResolvedValue(undefined),
      getCurrentSprint: vi.fn().mockResolvedValue(null),
    } as unknown as SprintsContextService;
    const authorization = { assertCanStartSprint: vi.fn().mockResolvedValue(undefined) } as unknown as SprintsAuthorizationService;
    const notifications = {} as unknown as NotificationsService;
    const service = new SprintsService(prisma, context, authorization, notifications, bitacora);

    await service.startSprint(5, 9);

    expect(bitacora.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        tipoEvento: 'SPRINT_STARTED',
        idActor: 9,
        idProyecto: 5,
        idSprint: 10,
        tipoEntidad: 'SPRINT',
        idEntidad: 10,
        valorNuevo: { numero: 1 },
      }),
    );
  });

  it('sin BitacoraEventosService inyectado, startSprint sigue funcionando (dependencia opcional)', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const context = {
      assertProjectLeader: vi.fn().mockResolvedValue(undefined),
      getCurrentSprint: vi.fn().mockResolvedValue(null),
    } as unknown as SprintsContextService;
    const authorization = { assertCanStartSprint: vi.fn().mockResolvedValue(undefined) } as unknown as SprintsAuthorizationService;
    const notifications = {} as unknown as NotificationsService;
    const service = new SprintsService(prisma, context, authorization, notifications);

    await expect(service.startSprint(5, 9)).resolves.toEqual(
      expect.objectContaining({ idSprint: 10 }),
    );
  });
});
