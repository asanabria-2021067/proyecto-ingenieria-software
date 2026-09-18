import { describe, expect, it } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoParticipacion, EstadoProyecto, EstadoSprint } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ProjectReadPolicyService } from '../src/common/project-policy/project-read-policy.service';

/**
 * T-261 (HU-164): scope `exportacion` — a diferencia de `bitacora` (abierta
 * a PARTICIPANTE_ACTIVO desde HU-170), la exportación de miembros/horas es
 * exclusiva de LIDER y ADMIN en cualquier estado de proyecto, incluido
 * CERRADO (donde otros scopes sí se abren a los participantes vía el atajo
 * `if (closed) return allow(null)` de `decide()`).
 */

interface ProyectoFixture {
  idProyecto: number;
  estadoProyecto: EstadoProyecto;
  creadoPor: number;
  eliminadoEn: Date | null;
}

interface PrismaDoubleOptions {
  proyecto?: ProyectoFixture | null;
  participaciones?: Array<{ estadoParticipacion: EstadoParticipacion }>;
  esAdmin?: boolean;
}

function makePrisma(options: PrismaDoubleOptions = {}) {
  const proyecto = 'proyecto' in options
    ? options.proyecto
    : ({
        idProyecto: 5,
        estadoProyecto: EstadoProyecto.EN_PROGRESO,
        creadoPor: 1,
        eliminadoEn: null,
      } satisfies ProyectoFixture);

  return {
    proyecto: { findUnique: async () => proyecto },
    usuarioRolAcceso: {
      findFirst: async () => (options.esAdmin ? { idUsuarioRolAcceso: 1 } : null),
    },
    participacionProyecto: {
      findMany: async () => options.participaciones ?? [],
    },
    historialLiderazgo: { count: async () => 0 },
    apelacionLiderazgo: { count: async () => 0 },
  } as unknown as PrismaService;
}

describe('ProjectReadPolicyService.assertRead — scope "exportacion" (T-261)', () => {
  it('permite al líder actual exportar mientras el proyecto está en vivo', async () => {
    const prisma = makePrisma({
      proyecto: { idProyecto: 5, estadoProyecto: EstadoProyecto.EN_PROGRESO, creadoPor: 9, eliminadoEn: null },
    });
    const service = new ProjectReadPolicyService(prisma);

    const decision = await service.assertRead(undefined, { projectId: 5, actorId: 9, scope: 'exportacion' });

    expect(decision.profile).toBe('LIDER');
    expect(decision.sprintEstados).toBeNull();
  });

  it('permite al líder actual exportar un proyecto CERRADO', async () => {
    const prisma = makePrisma({
      proyecto: { idProyecto: 5, estadoProyecto: EstadoProyecto.CERRADO, creadoPor: 9, eliminadoEn: null },
    });
    const service = new ProjectReadPolicyService(prisma);

    await expect(
      service.assertRead(undefined, { projectId: 5, actorId: 9, scope: 'exportacion' }),
    ).resolves.toMatchObject({ profile: 'LIDER' });
  });

  it('permite a la administración exportar un proyecto en vivo, limitada a Sprints CERRADO', async () => {
    const prisma = makePrisma({ esAdmin: true });
    const service = new ProjectReadPolicyService(prisma);

    const decision = await service.assertRead(undefined, { projectId: 5, actorId: 42, scope: 'exportacion' });

    expect(decision.profile).toBe('ADMIN');
    expect(decision.sprintEstados).toEqual([EstadoSprint.CERRADO]);
  });

  it('permite a la administración exportar un proyecto CERRADO sin restricción de Sprint', async () => {
    const prisma = makePrisma({
      proyecto: { idProyecto: 5, estadoProyecto: EstadoProyecto.CERRADO, creadoPor: 1, eliminadoEn: null },
      esAdmin: true,
    });
    const service = new ProjectReadPolicyService(prisma);

    const decision = await service.assertRead(undefined, { projectId: 5, actorId: 42, scope: 'exportacion' });

    expect(decision.sprintEstados).toBeNull();
  });

  it('un integrante ACTIVO recibe ForbiddenException en un proyecto en vivo', async () => {
    const prisma = makePrisma({
      participaciones: [{ estadoParticipacion: EstadoParticipacion.ACTIVO }],
    });
    const service = new ProjectReadPolicyService(prisma);

    await expect(
      service.assertRead(undefined, { projectId: 5, actorId: 42, scope: 'exportacion' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /**
   * A diferencia de la mayoría de scopes, `decide()` abre TODO a
   * PARTICIPANTE_ACTIVO/HISTÓRICO una vez que el proyecto está CERRADO
   * (`if (closed) return allow(null)`). `exportacion` debe seguir negada ahí
   * — es la razón de este caso, no una repetición del anterior.
   */
  it('un integrante ACTIVO recibe ForbiddenException incluso con el proyecto CERRADO', async () => {
    const prisma = makePrisma({
      proyecto: { idProyecto: 5, estadoProyecto: EstadoProyecto.CERRADO, creadoPor: 1, eliminadoEn: null },
      participaciones: [{ estadoParticipacion: EstadoParticipacion.ACTIVO }],
    });
    const service = new ProjectReadPolicyService(prisma);

    await expect(
      service.assertRead(undefined, { projectId: 5, actorId: 42, scope: 'exportacion' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un integrante retirado/completado (histórico) recibe ForbiddenException en un proyecto en vivo', async () => {
    const prisma = makePrisma({
      participaciones: [{ estadoParticipacion: EstadoParticipacion.RETIRADO }],
    });
    const service = new ProjectReadPolicyService(prisma);

    await expect(
      service.assertRead(undefined, { projectId: 5, actorId: 42, scope: 'exportacion' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un integrante histórico recibe ForbiddenException incluso con el proyecto CERRADO', async () => {
    const prisma = makePrisma({
      proyecto: { idProyecto: 5, estadoProyecto: EstadoProyecto.CERRADO, creadoPor: 1, eliminadoEn: null },
      participaciones: [{ estadoParticipacion: EstadoParticipacion.RETIRADO }],
    });
    const service = new ProjectReadPolicyService(prisma);

    await expect(
      service.assertRead(undefined, { projectId: 5, actorId: 42, scope: 'exportacion' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un usuario ajeno al proyecto (sin participación, ni líder, ni admin) recibe ForbiddenException', async () => {
    const prisma = makePrisma();
    const service = new ProjectReadPolicyService(prisma);

    await expect(
      service.assertRead(undefined, { projectId: 5, actorId: 999, scope: 'exportacion' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un exlíder sin participación actual recibe ForbiddenException', async () => {
    const prisma = makePrisma();
    const service = new ProjectReadPolicyService(prisma);
    (prisma.historialLiderazgo.count as unknown as () => Promise<number>) = async () => 1;

    await expect(
      service.assertRead(undefined, { projectId: 5, actorId: 999, scope: 'exportacion' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un proyecto CANCELADO solo deja exportar al líder y a la administración', async () => {
    const prisma = makePrisma({
      proyecto: { idProyecto: 5, estadoProyecto: EstadoProyecto.CANCELADO, creadoPor: 1, eliminadoEn: null },
      participaciones: [{ estadoParticipacion: EstadoParticipacion.ACTIVO }],
    });
    const service = new ProjectReadPolicyService(prisma);

    await expect(
      service.assertRead(undefined, { projectId: 5, actorId: 42, scope: 'exportacion' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un proyecto inexistente o eliminado responde NotFoundException', async () => {
    const prisma = makePrisma({ proyecto: null });
    const service = new ProjectReadPolicyService(prisma);

    await expect(
      service.assertRead(undefined, { projectId: 999, actorId: 1, scope: 'exportacion' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
