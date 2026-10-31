import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EstadoProyecto, EstadoSprint } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ProjectPolicyService } from '../src/common/project-policy/project-policy.service';

const LIDER = 1;
const INTEGRANTE = 2;
const ADMIN = 3;
const AJENO = 4;

function project(estadoProyecto: EstadoProyecto) {
  return { idProyecto: 10, creadoPor: LIDER, estadoProyecto, eliminadoEn: null };
}

// Solo ADMIN tiene fila de rol "administrador"; solo INTEGRANTE tiene participacion activa.
function makeTx(sprintEstado: EstadoSprint | null, entidadEstado: EstadoSprint | null = sprintEstado) {
  return {
    usuarioRolAcceso: {
      findFirst: vi.fn(async ({ where }: { where: { idUsuario: number } }) =>
        where.idUsuario === ADMIN ? { idUsuarioRolAcceso: 1 } : null),
    },
    participacionProyecto: {
      findFirst: vi.fn(async ({ where }: { where: { idUsuario: number } }) =>
        where.idUsuario === INTEGRANTE ? { idParticipacion: 1 } : null),
    },
    sprint: {
      findFirst: vi.fn(async () => (sprintEstado ? { idSprint: 5, estado: sprintEstado } : null)),
      findUnique: vi.fn(async () => (entidadEstado ? { estado: entidadEstado } : null)),
    },
  };
}

const policy = new ProjectPolicyService({} as never);
const write = (tx: ReturnType<typeof makeTx>, p: ReturnType<typeof project>, family: never, actor: number, entity?: never) =>
  policy.assertWriteTx(tx as never, p, family, actor, entity);

describe('ProjectPolicyService - AJUSTE_HORA exige lider', () => {
  const p = project(EstadoProyecto.EN_PROGRESO);

  it('el lider pasa con sprint EN_FINALIZACION', async () => {
    await expect(write(makeTx(EstadoSprint.EN_FINALIZACION), p, 'AJUSTE_HORA' as never, LIDER, { sprintId: 5 } as never)).resolves.toBeUndefined();
  });

  it.each([['integrante', INTEGRANTE], ['admin', ADMIN], ['ajeno', AJENO]])('%s -> 403', async (_n, actor) => {
    await expect(write(makeTx(EstadoSprint.EN_FINALIZACION), p, 'AJUSTE_HORA' as never, actor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('el lider con sprint ACTIVO (no en finalizacion) -> 409', async () => {
    await expect(write(makeTx(EstadoSprint.ACTIVO), p, 'AJUSTE_HORA' as never, LIDER)).rejects.toBeInstanceOf(ConflictException);
  });

  it('el lider sin sprint operable -> 409', async () => {
    await expect(write(makeTx(null), p, 'AJUSTE_HORA' as never, LIDER)).rejects.toBeInstanceOf(ConflictException);
  });

  it('sprint de la entidad cerrado -> 409', async () => {
    await expect(write(makeTx(EstadoSprint.EN_FINALIZACION, EstadoSprint.CERRADO), p, 'AJUSTE_HORA' as never, LIDER, { sprintId: 5 } as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it('proyecto fuera de estado operativo -> 409 antes de evaluar actor', async () => {
    const tx = makeTx(EstadoSprint.EN_FINALIZACION);
    await expect(write(tx, project(EstadoProyecto.CERRADO), 'AJUSTE_HORA' as never, AJENO)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ProjectPolicyService - CIERRE_VEREDICTO exige admin', () => {
  const p = project(EstadoProyecto.EN_SOLICITUD_CIERRE);

  it('el admin pasa sin sprint operable', async () => {
    await expect(write(makeTx(null), p, 'CIERRE_VEREDICTO' as never, ADMIN)).resolves.toBeUndefined();
  });

  it.each([['lider', LIDER], ['integrante', INTEGRANTE], ['ajeno', AJENO]])('%s -> 403', async (_n, actor) => {
    await expect(write(makeTx(null), p, 'CIERRE_VEREDICTO' as never, actor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('el admin con un sprint operable abierto -> 409', async () => {
    await expect(write(makeTx(EstadoSprint.ACTIVO), p, 'CIERRE_VEREDICTO' as never, ADMIN)).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([EstadoProyecto.EN_PROGRESO, EstadoProyecto.CERRADO])('proyecto en %s -> 409', async (estado) => {
    await expect(write(makeTx(null), project(estado), 'CIERRE_VEREDICTO' as never, ADMIN)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ProjectPolicyService - reglas de actor restantes', () => {
  const p = project(EstadoProyecto.EN_PROGRESO);

  it('LIDER_O_PARTICIPANTE_ACTIVO: lider e integrante pasan, ajeno no', async () => {
    const tx = makeTx(null);
    await expect(policy.assertActorTx(tx as never, p, 'LIDER_O_PARTICIPANTE_ACTIVO', LIDER)).resolves.toBeUndefined();
    await expect(policy.assertActorTx(tx as never, p, 'LIDER_O_PARTICIPANTE_ACTIVO', INTEGRANTE)).resolves.toBeUndefined();
    await expect(policy.assertActorTx(tx as never, p, 'LIDER_O_PARTICIPANTE_ACTIVO', AJENO)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('PARTICIPANTE_ACTIVO: el lider sin participacion no pasa; ACTOR_EXISTENTE no restringe', async () => {
    const tx = makeTx(null);
    await expect(policy.assertActorTx(tx as never, p, 'PARTICIPANTE_ACTIVO', LIDER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(policy.assertActorTx(tx as never, p, 'ACTOR_EXISTENTE', AJENO)).resolves.toBeUndefined();
  });
});
