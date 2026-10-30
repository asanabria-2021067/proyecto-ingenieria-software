import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { ApplicationsService } from '../src/applications/applications.service';
import type { ExitRequestsService } from '../src/exit-requests/exit-requests.service';
import { TeamService } from '../src/team/team.service';
import { makeProjectReadPolicyDouble } from './helpers/project-policy.double';

const PROJECT_ID = 5;
const ACTOR_ID = 2;

function setup(ownOnly: boolean) {
  const propia = { idParticipacion: 1, estadoParticipacion: 'ACTIVO', usuario: { idUsuario: ACTOR_ID } };
  const ajena = { idParticipacion: 2, estadoParticipacion: 'ACTIVO', usuario: { idUsuario: 9 } };
  const findMany = vi.fn(async ({ where }: { where: { idUsuario?: number } }) =>
    [propia, ajena].filter((p) => where.idUsuario === undefined || p.usuario.idUsuario === where.idUsuario),
  );
  const prisma = { participacionProyecto: { findMany } };
  const readPolicy = makeProjectReadPolicyDouble();
  (readPolicy.assertRead as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    profile: 'PARTICIPANTE_ACTIVO', sprintEstados: null, ownOnly, isAdmin: false,
  });
  const service = new TeamService(
    prisma as unknown as PrismaService,
    {} as ApplicationsService,
    {} as ExitRequestsService,
    readPolicy,
  );
  return { service, findMany };
}

describe('TeamService.findTeam: lectura propia (ownOnly)', () => {
  it('con ownOnly=true devuelve solo la participacion del propio actor', async () => {
    const { service, findMany } = setup(true);

    const equipo = await service.findTeam(PROJECT_ID, ACTOR_ID);

    expect(findMany.mock.calls[0][0].where).toEqual({ rolProyecto: { idProyecto: PROJECT_ID }, idUsuario: ACTOR_ID });
    expect(equipo.map((p) => p.idParticipacion)).toEqual([1]);
  });

  it('con ownOnly=false devuelve todo el equipo', async () => {
    const { service, findMany } = setup(false);

    const equipo = await service.findTeam(PROJECT_ID, ACTOR_ID);

    expect(findMany.mock.calls[0][0].where).toEqual({ rolProyecto: { idProyecto: PROJECT_ID } });
    expect(equipo.map((p) => p.idParticipacion)).toEqual([1, 2]);
  });
});
