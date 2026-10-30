import { describe, expect, it, vi } from 'vitest';
import { LeadershipService } from '../src/leadership/leadership.service';

// Solo se ejercita el efecto post-commit de changeLeaderTx; el resto de
// colaboradores son dobles que dejan pasar el camino feliz (cambio directo).
function makeService(chatCanales?: { sincronizarSinFallar: ReturnType<typeof vi.fn> }) {
  const tx = {
    participacionProyecto: { findMany: vi.fn().mockResolvedValue([]) },
    proyecto: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    historialLiderazgo: { create: vi.fn().mockResolvedValue({ idHistorialLiderazgo: 4 }) },
  };
  const notifications = { notifyLeadershipChanged: vi.fn() };
  const service = new LeadershipService(
    {} as any,
    {} as any,
    { assertAdminTx: vi.fn(), assertWriteTx: vi.fn() } as any,
    { assertLeadershipCandidate: vi.fn() } as any,
    notifications as any,
    { registrarEvento: vi.fn() } as any,
    chatCanales as any,
  );
  const internos = service as any;
  internos.autoCancelPendingAppealTx = vi.fn();
  internos.persistLeadershipNotificationsTx = vi.fn().mockResolvedValue([]);

  const efectos: { key: string; publish: () => unknown }[] = [];
  const ctx = {
    tx,
    project: { creadoPor: 1 },
    effects: { add: (e: { key: string; publish: () => unknown }) => efectos.push(e) },
  };
  const transferir = () =>
    internos.changeLeaderTx(ctx, { projectId: 10, adminId: 99, newLeaderId: 2, expectedLeaderId: 1, motivo: 'cambio' });
  return { transferir, efectos };
}

describe('LeadershipService - sincroniza el canal del chat al transferir liderazgo', () => {
  it('registra el efecto post-commit y no sincroniza antes de que se publique', async () => {
    const chat = { sincronizarSinFallar: vi.fn() };
    const { transferir, efectos } = makeService(chat);

    await transferir();

    expect(chat.sincronizarSinFallar).not.toHaveBeenCalled();
    const efecto = efectos.find((e) => e.key === 'chat:sync:10');
    expect(efecto).toBeDefined();

    await efecto!.publish();
    expect(chat.sincronizarSinFallar).toHaveBeenCalledTimes(1);
    expect(chat.sincronizarSinFallar).toHaveBeenCalledWith(10);
  });

  it('sin ChatCanalesService (undefined) la transferencia y el efecto no fallan', async () => {
    const { transferir, efectos } = makeService(undefined);

    await expect(transferir()).resolves.toMatchObject({ liderAnteriorId: 1, liderNuevoId: 2 });
    const efecto = efectos.find((e) => e.key === 'chat:sync:10');
    expect(efecto).toBeDefined();
    await expect(Promise.resolve(efecto!.publish())).resolves.toBeUndefined();
  });
});
