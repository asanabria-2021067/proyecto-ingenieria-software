import { describe, expect, it, vi } from 'vitest';
import { TeamService } from '../src/team/team.service';

function makePrisma() {
  return {
    solicitudSalidaProyecto: { findMany: vi.fn() },
  } as any;
}

function makeApplications() {
  return { findAll: vi.fn() } as any;
}

function makeExitRequests(solicitudes: any[] = []) {
  return {
    getPendingLeaderReviews: vi.fn().mockResolvedValue(solicitudes),
  } as any;
}

function makeService(
  prisma: ReturnType<typeof makePrisma>,
  exitRequests = makeExitRequests(),
  applications = makeApplications(),
) {
  return new TeamService(prisma, applications, exitRequests);
}

describe('TeamService.getPendingExitRequests', () => {
  it('delega en ExitRequestsService.getPendingLeaderReviews con idProyecto y actor', async () => {
    const prisma = makePrisma();
    const solicitudes = [{ idSolicitud: 1, idUsuario: 50, estadoSolicitud: 'PENDIENTE_LIDER' }];
    const exitRequests = makeExitRequests(solicitudes);
    const service = makeService(prisma, exitRequests);

    const result = await service.getPendingExitRequests(1, 10);

    expect(exitRequests.getPendingLeaderReviews).toHaveBeenCalledTimes(1);
    expect(exitRequests.getPendingLeaderReviews).toHaveBeenCalledWith(1, 10);
    expect(result).toBe(solicitudes);
  });

  it('no consulta Prisma.solicitudSalidaProyecto directamente desde Team', async () => {
    const prisma = makePrisma();
    const exitRequests = makeExitRequests([]);
    const service = makeService(prisma, exitRequests);

    await service.getPendingExitRequests(1, 10);

    expect(prisma.solicitudSalidaProyecto.findMany).not.toHaveBeenCalled();
  });

  it('propaga rechazos de autorización de ExitRequestsService sin envolverlos', async () => {
    const prisma = makePrisma();
    const fallo = new Error('No eres el líder de este proyecto');
    const exitRequests = { getPendingLeaderReviews: vi.fn().mockRejectedValue(fallo) } as any;
    const service = makeService(prisma, exitRequests);

    await expect(service.getPendingExitRequests(1, 10)).rejects.toBe(fallo);
  });

  it('devuelve [] cuando no hay solicitudes pendientes, sin transformar el resultado', async () => {
    const prisma = makePrisma();
    const exitRequests = makeExitRequests([]);
    const service = makeService(prisma, exitRequests);

    await expect(service.getPendingExitRequests(1, 10)).resolves.toEqual([]);
  });
});
