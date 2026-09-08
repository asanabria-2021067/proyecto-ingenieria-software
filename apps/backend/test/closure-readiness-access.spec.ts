import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProjectClosureService } from '../src/project-closure/project-closure.service';

/**
 * La preparación del cierre se consultaba solo con `creadoPor === actorId`, así
 * que el administrador —que nunca es el líder— recibía 403 al abrir la revisión
 * y la pantalla se quedaba sin la lista de verificación, pese a que la fase
 * `APPROVE` existe justamente para él.
 */

const PROJECT_ID = 57;
const LEADER_ID = 18;
const ADMIN_ID = 99;
const OTRO_ID = 7;

function setup(proyecto: Record<string, unknown> | null = { idProyecto: PROJECT_ID, creadoPor: LEADER_ID, estadoProyecto: 'EN_SOLICITUD_CIERRE', eliminadoEn: null }) {
  const prisma = {
    proyecto: { findFirst: vi.fn().mockResolvedValue(proyecto) },
    // `assertAdminTx` consulta por aquí cuando se le pasa este mismo cliente.
    usuarioRolAcceso: {
      findFirst: vi.fn().mockImplementation(({ where }: { where: { idUsuario: number } }) =>
        Promise.resolve(where.idUsuario === ADMIN_ID ? { idUsuarioRolAcceso: 1 } : null),
      ),
    },
  };
  const policy = {
    assertAdminTx: vi.fn().mockImplementation(async (tx: typeof prisma, actorId: number) => {
      const fila = await tx.usuarioRolAcceso.findFirst({ where: { idUsuario: actorId } });
      if (!fila) throw new ForbiddenException('Acceso restringido a administradores');
    }),
  };
  const readinessService = { evaluate: vi.fn().mockResolvedValue({ canSubmit: true, blockers: [] }) };

  const service = new ProjectClosureService(
    prisma as never,
    {} as never,
    policy as never,
    readinessService as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, readinessService, policy };
}

describe('Preparación del cierre — quién puede consultarla', () => {
  it('el líder consulta la preparación de su propio proyecto', async () => {
    const { service, readinessService } = setup();

    await expect(service.readiness(PROJECT_ID, LEADER_ID, 'REQUEST')).resolves.toBeDefined();
    expect(readinessService.evaluate).toHaveBeenCalledWith(undefined, PROJECT_ID, { phase: 'REQUEST' });
  });

  it('el administrador la consulta en fase APPROVE: es su lista de verificación', async () => {
    const { service, readinessService } = setup();

    await expect(service.readiness(PROJECT_ID, ADMIN_ID, 'APPROVE')).resolves.toBeDefined();
    expect(readinessService.evaluate).toHaveBeenCalledWith(undefined, PROJECT_ID, { phase: 'APPROVE' });
  });

  it('quien no es ni líder ni administrador sigue sin verla', async () => {
    const { service, readinessService } = setup();

    await expect(service.readiness(PROJECT_ID, OTRO_ID, 'APPROVE')).rejects.toBeInstanceOf(ForbiddenException);
    expect(readinessService.evaluate).not.toHaveBeenCalled();
  });

  it('un proyecto inexistente sigue siendo 404, no 403', async () => {
    const { service } = setup(null);

    await expect(service.readiness(PROJECT_ID, ADMIN_ID, 'APPROVE')).rejects.toBeInstanceOf(NotFoundException);
  });
});
