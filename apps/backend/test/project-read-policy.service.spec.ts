import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoParticipacion, EstadoProyecto } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ProjectReadPolicyService } from '../src/common/project-policy/project-read-policy.service';

/**
 * T-269 (HU-170): la matriz de `ProjectReadPolicyService.decide()` (06 v2
 * §34) nunca tuvo un spec dedicado — cada consumidor la ejercitaba a través
 * de un doble (`makeProjectReadPolicyDouble`) que la sustituye por completo.
 * Este archivo cubre específicamente el scope `bitacora`: quién entra al
 * gate antes de que BitacoraConsultaService decida qué eventos ve cada uno.
 * No repite aquí la matriz completa de los demás scopes (resumen, equipo,
 * tareas, etc.) — eso queda fuera del alcance de T-269.
 */

interface ProyectoFixture {
  idProyecto: number;
  estadoProyecto: EstadoProyecto;
  creadoPor: number;
  eliminadoEn: Date | null;
}

interface PrismaDoubleOptions {
  proyecto?: ProyectoFixture | null;
  /** Filas de ParticipacionProyecto del actor en el proyecto (una por rol). */
  participaciones?: Array<{ estadoParticipacion: EstadoParticipacion }>;
  esAdmin?: boolean;
  historyAsLeader?: number;
  appealsAsLeader?: number;
  /** Membresías activas del actor en una organización dueña del proyecto. */
  miembroDeOrganizacion?: number;
}

function makePrisma(options: PrismaDoubleOptions = {}) {
  // `'proyecto' in options`, no `??`: un `proyecto: null` explícito (caso
  // "no encontrado") es distinto de no pasar la opción — `??` confundiría
  // ambos y siempre caería al fixture por defecto.
  const proyecto = 'proyecto' in options
    ? options.proyecto
    : ({
        idProyecto: 5,
        estadoProyecto: EstadoProyecto.EN_PROGRESO,
        creadoPor: 1,
        eliminadoEn: null,
      } satisfies ProyectoFixture);

  return {
    proyecto: { findUnique: vi.fn().mockResolvedValue(proyecto) },
    usuarioRolAcceso: {
      findFirst: vi.fn().mockResolvedValue(options.esAdmin ? { idUsuarioRolAcceso: 1 } : null),
    },
    participacionProyecto: {
      findMany: vi.fn().mockResolvedValue(options.participaciones ?? []),
    },
    historialLiderazgo: { count: vi.fn().mockResolvedValue(options.historyAsLeader ?? 0) },
    apelacionLiderazgo: { count: vi.fn().mockResolvedValue(options.appealsAsLeader ?? 0) },
    usuarioOrganizacion: { count: vi.fn().mockResolvedValue(options.miembroDeOrganizacion ?? 0) },
  } as unknown as PrismaService;
}

describe('ProjectReadPolicyService.assertRead — scope "bitacora" (HU-170/T-269)', () => {
  it('permite al líder actual leer la bitácora del proyecto en vivo', async () => {
    const prisma = makePrisma({
      proyecto: { idProyecto: 5, estadoProyecto: EstadoProyecto.EN_PROGRESO, creadoPor: 9, eliminadoEn: null },
    });
    const service = new ProjectReadPolicyService(prisma);

    const decision = await service.assertRead(undefined, { projectId: 5, actorId: 9, scope: 'bitacora' });

    expect(decision.profile).toBe('LIDER');
  });

  it('permite al administrador leer la bitácora del proyecto en vivo', async () => {
    const prisma = makePrisma({ esAdmin: true });
    const service = new ProjectReadPolicyService(prisma);

    const decision = await service.assertRead(undefined, { projectId: 5, actorId: 42, scope: 'bitacora' });

    expect(decision.profile).toBe('ADMIN');
  });

  it('HU-170: permite a un participante ACTIVO leer la bitácora mientras el proyecto está en vivo', async () => {
    const prisma = makePrisma({
      participaciones: [{ estadoParticipacion: EstadoParticipacion.ACTIVO }],
    });
    const service = new ProjectReadPolicyService(prisma);

    const decision = await service.assertRead(undefined, { projectId: 5, actorId: 42, scope: 'bitacora' });

    expect(decision.profile).toBe('PARTICIPANTE_ACTIVO');
  });

  it('un participante ACTIVO también puede leer la bitácora una vez que el proyecto está CERRADO (sin cambios)', async () => {
    const prisma = makePrisma({
      proyecto: { idProyecto: 5, estadoProyecto: EstadoProyecto.CERRADO, creadoPor: 1, eliminadoEn: null },
      participaciones: [{ estadoParticipacion: EstadoParticipacion.ACTIVO }],
    });
    const service = new ProjectReadPolicyService(prisma);

    await expect(
      service.assertRead(undefined, { projectId: 5, actorId: 42, scope: 'bitacora' }),
    ).resolves.toMatchObject({ profile: 'PARTICIPANTE_ACTIVO' });
  });

  it('un participante HISTÓRICO (retirado/completado) sigue sin poder leer la bitácora mientras el proyecto está en vivo', async () => {
    const prisma = makePrisma({
      participaciones: [{ estadoParticipacion: EstadoParticipacion.RETIRADO }],
    });
    const service = new ProjectReadPolicyService(prisma);

    await expect(
      service.assertRead(undefined, { projectId: 5, actorId: 42, scope: 'bitacora' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un usuario ajeno al proyecto (sin participación, ni líder, ni admin) recibe ForbiddenException', async () => {
    const prisma = makePrisma();
    const service = new ProjectReadPolicyService(prisma);

    await expect(
      service.assertRead(undefined, { projectId: 5, actorId: 999, scope: 'bitacora' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un proyecto inexistente o eliminado responde NotFoundException (nunca revela si el actor tendría acceso)', async () => {
    const prisma = makePrisma({ proyecto: null });
    const service = new ProjectReadPolicyService(prisma);

    await expect(
      service.assertRead(undefined, { projectId: 999, actorId: 1, scope: 'bitacora' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProjectReadPolicyService.assertRead — miembro de la organización dueña (ORG-8)', () => {
  const pregunta = (scope: 'resumen' | 'tareas' | 'sprints' | 'horas' | 'equipo' | 'bitacora' | 'documentos', options: PrismaDoubleOptions = {}) =>
    new ProjectReadPolicyService(makePrisma({ miembroDeOrganizacion: 1, ...options })).assertRead(undefined, {
      projectId: 5,
      actorId: 42,
      scope,
    });

  it.each(['resumen', 'tareas', 'sprints'] as const)('lee %s del proyecto en vivo', async (scope) => {
    await expect(pregunta(scope)).resolves.toMatchObject({ profile: 'MIEMBRO_ORGANIZACION', sprintEstados: null });
  });

  it.each(['horas', 'equipo', 'bitacora', 'documentos'] as const)('no lee %s', async (scope) => {
    await expect(pregunta(scope)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('no ve un proyecto que aún no se publica', async () => {
    const proyecto = { idProyecto: 5, estadoProyecto: EstadoProyecto.EN_REVISION, creadoPor: 1, eliminadoEn: null };
    await expect(pregunta('tareas', { proyecto })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un participante conserva su perfil de participante', async () => {
    await expect(pregunta('horas', { participaciones: [{ estadoParticipacion: EstadoParticipacion.ACTIVO }] })).resolves.toMatchObject({
      profile: 'PARTICIPANTE_ACTIVO',
    });
  });
});
