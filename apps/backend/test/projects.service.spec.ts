import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { Cache } from 'cache-manager';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { EstadoProyectoCreador } from '../src/projects/dto/update-estado-proyecto.dto';
import { ProjectsService } from '../src/projects/projects.service';
import { SocialService } from '../src/social/social.service';
import {
  makeProjectPolicyDouble,
  makeProjectReadPolicyDouble,
  makeProjectTransactionDouble,
} from './helpers/project-policy.double';

function makePrisma() {
  const defaultTx = {
    proyecto: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    revisionProyecto: { findFirst: vi.fn(), create: vi.fn() },
    rolProyecto: { findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    requisitoHabilidadRol: { deleteMany: vi.fn(), createMany: vi.fn() },
    proyectoOrganizacion: { deleteMany: vi.fn(), createMany: vi.fn() },
    participacionProyecto: { updateMany: vi.fn(), findMany: vi.fn() },
    postulacion: { updateMany: vi.fn() },
  };

  return {
    proyecto: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    revisionProyecto: {
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    participacionProyecto: { updateMany: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    postulacion: { updateMany: vi.fn(), findMany: vi.fn() },
    rolProyecto: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    requisitoHabilidadRol: { deleteMany: vi.fn(), createMany: vi.fn() },
    proyectoOrganizacion: { deleteMany: vi.fn(), createMany: vi.fn() },
    // A11: usado exclusivamente por assertNoOperableSprint (requestClose /
    // changeEstado -> CERRADO). Por defecto sin Sprint operable
    // (mockResolvedValue(null)), para que los tests preexistentes de este
    // archivo que nunca configuran este mock sigan pasando sin cambios.
    sprint: { findFirst: vi.fn().mockResolvedValue(null) },
    // T-251: orden ponderado de "Proyectos Disponibles" (amigos + carrera).
    amistad: { findMany: vi.fn().mockResolvedValue([]) },
    perfilEstudiante: { findUnique: vi.fn().mockResolvedValue(null) },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(async (cb: (tx: typeof defaultTx) => unknown) => cb(defaultTx)),
  };
}

/** C031: los writers abren el runner de proyecto; el doble entrega el propio doble de Prisma como `tx`. */
function makeNotifications(overrides: Record<string, unknown> = {}) {
  return {
    persistTemplateTx: vi.fn(),
    persistAdminsTx: vi.fn(),
    persistUsersTx: vi.fn(),
    publishEffects: vi.fn(),
    ...overrides,
  };
}

function makeService(
  prisma: ReturnType<typeof makePrisma>,
  notifications: Partial<NotificationsService> | Record<string, unknown> = {},
) {
  const notificationsDouble = makeNotifications(notifications as Record<string, unknown>) as unknown as NotificationsService;
  return new ProjectsService(
    prisma as unknown as PrismaService,
    notificationsDouble,
    {} as unknown as Cache,
    makeProjectTransactionDouble({ tx: prisma }),
    makeProjectPolicyDouble(),
    makeProjectReadPolicyDouble(),
    // SocialService real (no doble) para que las pruebas de orden ponderado
    // (T-251) sigan ejerciendo `prisma.amistad.findMany` real, la misma
    // fuente de amigos que usa el resto del producto (finding 5 de revisión).
    new SocialService(prisma as unknown as PrismaService, notificationsDouble),
  );
}

describe('ProjectsService', () => {
  it('findAll aplica filtros', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findMany.mockResolvedValue([]);
    const service = makeService(prisma, {
      isAdmin: vi.fn(),
      notifyAdminsFromTemplate: vi.fn(),
      notifyFromTemplate: vi.fn(),
    });

    await service.findAll({ q: 'alpha', habilidadId: 3, organizacionId: 8 });

    const where = prisma.proyecto.findMany.mock.calls[0][0].where as { AND: unknown[] };
    expect(where.AND.length).toBeGreaterThan(2);
  });

  it('findOne falla cuando no existe', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);
    await expect(service.findOne(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  /**
   * El detalle y el catálogo no filtran por lo mismo. Un proyecto en solicitud
   * de cierre sale del catálogo (ya no admite postulaciones) pero su espacio de
   * trabajo debe seguir abriéndose: cuando compartían lista, pedir el cierre
   * devolvía 404 y el proyecto «desaparecía» hasta para su líder.
   */
  it('findOne consulta el detalle de un proyecto en solicitud de cierre, no solo publicado/en progreso', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 57, estadoProyecto: 'EN_SOLICITUD_CIERRE' });
    const service = makeService(prisma);

    await service.findOne(57);

    const where = prisma.proyecto.findFirst.mock.calls[0][0].where as {
      estadoProyecto: { in: string[] };
    };
    expect(where.estadoProyecto.in).toContain('EN_SOLICITUD_CIERRE');
    expect(where.estadoProyecto.in).toContain('PUBLICADO');
    expect(where.estadoProyecto.in).toContain('EN_PROGRESO');
    // CERRADO se lee como histórico por su propia ruta, no por aquí.
    expect(where.estadoProyecto.in).not.toContain('CERRADO');
  });

  it('el catálogo público sigue sin ofrecer los proyectos en solicitud de cierre', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findMany.mockResolvedValue([]);
    const service = makeService(prisma, {
      isAdmin: vi.fn(),
      notifyAdminsFromTemplate: vi.fn(),
      notifyFromTemplate: vi.fn(),
    });

    await service.findAll({});

    const where = prisma.proyecto.findMany.mock.calls[0][0].where as { AND: Array<Record<string, unknown>> };
    const estados = where.AND.find((c) => 'estadoProyecto' in c) as
      | { estadoProyecto: { in: string[] } }
      | undefined;
    expect(estados?.estadoProyecto.in).toEqual(['PUBLICADO', 'EN_PROGRESO']);
  });

  it('findOneOwner falla si no es dueño', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 99 });
    const service = makeService(prisma);
    await expect(service.findOneOwner(1, 1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('getAvance falla cuando el proyecto no existe', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);
    await expect(service.getAvance(999, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getAvance permite al líder ver el avance', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({
      creadoPor: 1,
      // El estado de un hito se deriva de sus tareas (idHito), no de un campo
      // estadoHito estático: la tarea HECHO pertenece al único hito, que
      // queda 100% completo; la POR_HACER no pertenece a ningún hito.
      tareas: [{ estadoTarea: 'HECHO', idHito: 1 }, { estadoTarea: 'POR_HACER', idHito: null }],
      hitos: [{ idHito: 1 }],
    });
    const service = makeService(prisma);
    const result = await service.getAvance(1, 1);
    expect(result.tareas.porcentaje).toBe(50);
    expect(result.hitos.porcentaje).toBe(100);
  });

  it('getAvance permite a un participante activo ver el avance', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({
      creadoPor: 9,
      tareas: [],
      hitos: [],
    });
    prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
    const service = makeService(prisma);
    const result = await service.getAvance(1, 2);
    expect(result.tareas.porcentaje).toBe(0);
    expect(prisma.participacionProyecto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ idUsuario: 2, estadoParticipacion: 'ACTIVO' }),
      }),
    );
  });

  it('getAvance rechaza a quien no es líder ni participante', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ creadoPor: 9, tareas: [], hitos: [] });
    prisma.participacionProyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);
    await expect(service.getAvance(1, 2)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findMine calcula agregados de roles', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findMany.mockResolvedValue([
      {
        roles: [
          { idRolProyecto: 1, _count: { postulaciones: 2, participaciones: 1 } },
          { idRolProyecto: 2, _count: { postulaciones: 3, participaciones: 0 } },
        ],
      },
    ]);
    const service = makeService(prisma);
    const result = await service.findMine(1);
    expect(result[0].cantidadPostulaciones).toBe(5);
    expect(result[0].rolesCubiertos).toBe(1);
  });

  it('findMine calcula el avance por hitos y tareas, y no falla sin ninguno de los dos', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findMany.mockResolvedValue([
      {
        roles: [],
        // Hito 1 (idHito 1) queda 100% completo (su única tarea está HECHO);
        // hito 2 (idHito 2) queda pendiente (su única tarea sigue POR_HACER).
        tareas: [{ estadoTarea: 'HECHO', idHito: 1 }, { estadoTarea: 'POR_HACER', idHito: 2 }],
        hitos: [{ idHito: 1 }, { idHito: 2 }],
      },
      { roles: [] },
    ]);
    const service = makeService(prisma);
    const result = await service.findMine(1);
    expect(result[0].avanceProyecto).toEqual({
      tareas: { porcentaje: 50, total: 2, porHacer: 1, enProgreso: 0, hecho: 1 },
      hitos: { porcentaje: 50, total: 2, pendiente: 1, enProgreso: 0, completado: 1 },
    });
    expect(result[1].avanceProyecto).toEqual({
      tareas: { porcentaje: 0, total: 0, porHacer: 0, enProgreso: 0, hecho: 0 },
      hitos: { porcentaje: 0, total: 0, pendiente: 0, enProgreso: 0, completado: 0 },
    });
  });

  it('submitForReview cambia estado y notifica', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, estadoProyecto: EstadoProyecto.BORRADOR, creadoPor: 1 });
    prisma.revisionProyecto.count.mockResolvedValue(0);
    const tx = {
      proyecto: {
        findUnique: vi.fn().mockResolvedValue({
          tituloProyecto: 'Proyecto',
          descripcionProyecto: 'Descripcion',
          objetivosProyecto: 'Objetivos',
          tipoProyecto: 'ACADEMICO',
          modalidadProyecto: 'PRESENCIAL',
          ubicacionProyecto: null,
          contextoAcademico: null,
          urlRecursoExterno: null,
          fechaInicio: null,
          fechaFinEstimada: null,
          roles: [],
        }),
        update: vi.fn(),
      },
      revisionProyecto: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    };
    prisma.proyecto.findUnique.mockResolvedValue(tx.proyecto.findUnique.getMockImplementation()?.() ?? null);
    const notifications = makeNotifications({ isAdmin: vi.fn() });
    const service = makeService(prisma, notifications);

    const result = await service.submitForReview(1, 1);

    expect(result.estadoProyecto).toBe(EstadoProyecto.EN_REVISION);
    // C031: la notificación a admins se persiste con el `tx` del runner y se publica después del commit.
    expect(notifications.persistAdminsTx).toHaveBeenCalledWith(
      prisma,
      'PROYECTO_EN_REVISION',
      expect.objectContaining({ projectId: 1, numeroEnvio: 1 }),
      expect.objectContaining({ add: expect.any(Function) }),
    );
    expect(prisma.revisionProyecto.create).toHaveBeenCalled();
  });

  it('resubmit falla si estado no es observado', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, estadoProyecto: EstadoProyecto.BORRADOR, creadoPor: 1 });
    const service = makeService(prisma);
    await expect(service.resubmit(1, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('changeEstado valida transición', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({
      idProyecto: 1,
      estadoProyecto: EstadoProyecto.EN_PROGRESO,
      creadoPor: 1,
    });
    const service = makeService(prisma);
    await expect(service.changeEstado(1, 1, EstadoProyectoCreador.PUBLICADO)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  describe('A11 — assertNoOperableSprint (Decisión Bloqueante #2)', () => {
    function proyectoEnProgreso(overrides: Record<string, unknown> = {}) {
      return { idProyecto: 1, estadoProyecto: EstadoProyecto.EN_PROGRESO, creadoPor: 1, ...overrides };
    }

    /**
     * C128 (categoría C): el cierre legacy se retiró, así que la invariante
     * se comprueba sobre el helper que la implementa. Sigue siendo la misma
     * regla —un Sprint operable impide iniciar el cierre— y el evaluador de
     * preparación la vuelve a exigir por su cuenta al solicitar.
     */
    it('caso 1: Sprint ACTIVO — rechaza con ConflictException y mensaje explícito', async () => {
      const prisma = makePrisma();
      prisma.sprint.findFirst.mockResolvedValue({ idSprint: 99 });
      const service = makeService(prisma);

      await expect(service.assertNoOperableSprint(1)).rejects.toBeInstanceOf(ConflictException);
      await expect(service.assertNoOperableSprint(1)).rejects.toThrow(
        'Debes cerrar el Sprint actual antes de solicitar el cierre del proyecto',
      );
    });

    it('caso 2: Sprint EN_FINALIZACION — rechaza igual', async () => {
      const prisma = makePrisma();
      prisma.sprint.findFirst.mockResolvedValue({ idSprint: 99 });
      const service = makeService(prisma);

      await expect(service.assertNoOperableSprint(1)).rejects.toBeInstanceOf(ConflictException);
    });

    it('caso 3 y 4: solo Sprint CERRADO o ningún Sprint — no bloquea', async () => {
      const prisma = makePrisma();
      // La consulta ya filtra por estado IN (ACTIVO, EN_FINALIZACION): un
      // proyecto con un Sprint CERRADO simplemente no matchea.
      prisma.sprint.findFirst.mockResolvedValue(null);
      const service = makeService(prisma);

      await expect(service.assertNoOperableSprint(1)).resolves.toBeUndefined();
    });

    it('aislamiento: la consulta está acotada por idProyecto + estado IN (ACTIVO, EN_FINALIZACION)', async () => {
      const prisma = makePrisma();
      prisma.sprint.findFirst.mockResolvedValue(null);
      const service = makeService(prisma);

      await service.assertNoOperableSprint(7);

      expect(prisma.sprint.findFirst).toHaveBeenCalledWith({
        where: { idProyecto: 7, estado: { in: ['ACTIVO', 'EN_FINALIZACION'] } },
        select: { idSprint: true },
      });
    });

    // C032: las tres aserciones que congelaban `changeEstado -> CERRADO` se retiran
    // (categoría C): el líder ya no tiene ruta directa a CERRADO.
    it('changeEstado ya no admite CERRADO como destino del líder (EN_PROGRESO sin transiciones)', async () => {
      const prisma = makePrisma();
      prisma.proyecto.findFirst.mockResolvedValue(proyectoEnProgreso());
      const service = makeService(prisma);

      await expect(
        service.changeEstado(1, 1, 'CERRADO' as unknown as EstadoProyectoCreador),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.proyecto.update).not.toHaveBeenCalled();
    });
  });

  it('findPostulacionesByProject exige ownership', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({
      idProyecto: 2,
      estadoProyecto: EstadoProyecto.PUBLICADO,
      creadoPor: 7,
    });
    const service = makeService(prisma);
    await expect(service.findPostulacionesByProject(2, 1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  /** T-251/T-252: orden ponderado de "Proyectos Disponibles" por amigos y carrera. */
  describe('findAll — orden ponderado por amigos y carrera', () => {
    function proyecto(idProyecto: number) {
      return { idProyecto, tituloProyecto: `Proyecto ${idProyecto}` };
    }

    it('un proyecto con 2 amigos participantes sube sobre uno más reciente sin amigos', async () => {
      const prisma = makePrisma();
      // La base ya viene ordenada por recencia: el 1 (sin amigos) es más
      // reciente que el 2 (con 2 amigos).
      prisma.proyecto.findMany.mockResolvedValue([proyecto(1), proyecto(2)]);
      prisma.amistad.findMany.mockResolvedValue([
        { idUsuarioSolicitante: 9, idUsuarioReceptor: 101 },
        { idUsuarioSolicitante: 9, idUsuarioReceptor: 102 },
      ]);
      prisma.$queryRaw.mockResolvedValue([
        { idProyecto: 1, amigosParticipantes: 0, mismaCarrera: false },
        { idProyecto: 2, amigosParticipantes: 2, mismaCarrera: false },
      ]);
      const service = makeService(prisma);

      const resultado = await service.findAll({}, 9);

      expect(resultado.map((p) => p.idProyecto)).toEqual([2, 1]);
    });

    it('a igualdad de recencia, un proyecto de la carrera del usuario sube sobre uno de otra carrera', async () => {
      const prisma = makePrisma();
      prisma.proyecto.findMany.mockResolvedValue([proyecto(1), proyecto(2)]);
      prisma.perfilEstudiante.findUnique.mockResolvedValue({ idCarrera: 5 });
      prisma.$queryRaw.mockResolvedValue([
        { idProyecto: 1, amigosParticipantes: 0, mismaCarrera: false },
        { idProyecto: 2, amigosParticipantes: 0, mismaCarrera: true },
      ]);
      const service = makeService(prisma);

      const resultado = await service.findAll({}, 9);

      expect(resultado.map((p) => p.idProyecto)).toEqual([2, 1]);
    });

    it('los amigos pesan más que la carrera cuando compiten', async () => {
      const prisma = makePrisma();
      // 1: misma carrera, sin amigos. 2: otra carrera, 1 amigo participante.
      prisma.proyecto.findMany.mockResolvedValue([proyecto(1), proyecto(2)]);
      prisma.amistad.findMany.mockResolvedValue([{ idUsuarioSolicitante: 9, idUsuarioReceptor: 101 }]);
      prisma.perfilEstudiante.findUnique.mockResolvedValue({ idCarrera: 5 });
      prisma.$queryRaw.mockResolvedValue([
        { idProyecto: 1, amigosParticipantes: 0, mismaCarrera: true },
        { idProyecto: 2, amigosParticipantes: 1, mismaCarrera: false },
      ]);
      const service = makeService(prisma);

      const resultado = await service.findAll({}, 9);

      expect(resultado.map((p) => p.idProyecto)).toEqual([2, 1]);
    });

    it('CRÍTICO: un usuario sin amigos ve el mismo conjunto de proyectos que uno con amigos, solo cambia el orden', async () => {
      const prismaConAmigos = makePrisma();
      const listaBase = [proyecto(1), proyecto(2), proyecto(3)];
      prismaConAmigos.proyecto.findMany.mockResolvedValue(listaBase);
      prismaConAmigos.amistad.findMany.mockResolvedValue([{ idUsuarioSolicitante: 9, idUsuarioReceptor: 101 }]);
      prismaConAmigos.$queryRaw.mockResolvedValue([
        { idProyecto: 1, amigosParticipantes: 0, mismaCarrera: false },
        { idProyecto: 2, amigosParticipantes: 1, mismaCarrera: false },
        { idProyecto: 3, amigosParticipantes: 0, mismaCarrera: false },
      ]);
      const serviceConAmigos = makeService(prismaConAmigos);
      const resultadoConAmigos = await serviceConAmigos.findAll({}, 9);

      const prismaSinAmigos = makePrisma();
      prismaSinAmigos.proyecto.findMany.mockResolvedValue(listaBase);
      // sin amigos y sin carrera: ni siquiera dispara la consulta agregada.
      const serviceSinAmigos = makeService(prismaSinAmigos);
      const resultadoSinAmigos = await serviceSinAmigos.findAll({}, 10);

      const idsConAmigos = new Set(resultadoConAmigos.map((p) => p.idProyecto));
      const idsSinAmigos = new Set(resultadoSinAmigos.map((p) => p.idProyecto));
      expect(idsConAmigos).toEqual(idsSinAmigos);
      expect(resultadoConAmigos).toHaveLength(3);
      expect(resultadoSinAmigos).toHaveLength(3);
      // sin amigos y sin carrera: orden de recencia de siempre, sin reordenar.
      expect(resultadoSinAmigos.map((p) => p.idProyecto)).toEqual([1, 2, 3]);
    });

    it('el conteo de amigos del motivo coincide con los amigos reales de ese proyecto', async () => {
      const prisma = makePrisma();
      prisma.proyecto.findMany.mockResolvedValue([proyecto(1)]);
      prisma.amistad.findMany.mockResolvedValue([
        { idUsuarioSolicitante: 9, idUsuarioReceptor: 101 },
        { idUsuarioSolicitante: 102, idUsuarioReceptor: 9 },
        { idUsuarioSolicitante: 9, idUsuarioReceptor: 103 },
      ]);
      prisma.$queryRaw.mockResolvedValue([{ idProyecto: 1, amigosParticipantes: 3, mismaCarrera: false }]);
      const service = makeService(prisma);

      const [resultado] = await service.findAll({}, 9);

      expect(resultado.amigosParticipantes).toBe(3);
    });

    it('no dispara una consulta por proyecto: la consulta agregada se ejecuta una sola vez sin importar cuántos proyectos haya', async () => {
      const prisma = makePrisma();
      const muchos = Array.from({ length: 20 }, (_, i) => proyecto(i + 1));
      prisma.proyecto.findMany.mockResolvedValue(muchos);
      prisma.amistad.findMany.mockResolvedValue([{ idUsuarioSolicitante: 9, idUsuarioReceptor: 101 }]);
      prisma.$queryRaw.mockResolvedValue(muchos.map((p) => ({ idProyecto: p.idProyecto, amigosParticipantes: 0, mismaCarrera: false })));
      const service = makeService(prisma);

      await service.findAll({}, 9);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.amistad.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.perfilEstudiante.findUnique).toHaveBeenCalledTimes(1);
    });

    it('sin userId (anónimo) no personaliza: ni siquiera consulta amigos o carrera', async () => {
      const prisma = makePrisma();
      prisma.proyecto.findMany.mockResolvedValue([proyecto(1), proyecto(2)]);
      const service = makeService(prisma);

      const resultado = await service.findAll({});

      expect(resultado.map((p) => p.idProyecto)).toEqual([1, 2]);
      expect(prisma.amistad.findMany).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
