import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { ProjectsService } from '../src/projects/projects.service';
import { SocialService } from '../src/social/social.service';
import { makeProjectPolicyDouble, makeProjectReadPolicyDouble, makeProjectTransactionDouble } from './helpers/project-policy.double';

function crear(lider = 1) {
  const prisma: Record<string, any> = {
    proyecto: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn() },
    postulacion: { findMany: vi.fn().mockResolvedValue([]) },
    usuarioHabilidad: { findMany: vi.fn().mockResolvedValue([]) },
    usuarioInteres: { findMany: vi.fn().mockResolvedValue([]) },
    proyectoGuardado: { findMany: vi.fn().mockResolvedValue([]) },
    usuarioOrganizacion: { count: vi.fn().mockResolvedValue(1) },
    juntaAsociacion: { findUnique: vi.fn() },
    amistad: { findMany: vi.fn().mockResolvedValue([]) },
    perfilEstudiante: { findUnique: vi.fn().mockResolvedValue(null) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  const notifications = { persistTemplateTx: vi.fn(), publishEffects: vi.fn() };
  const service = new ProjectsService(
    prisma as never,
    notifications as never,
    { del: vi.fn() } as unknown as Cache,
    makeProjectTransactionDouble({ tx: prisma, project: { creadoPor: lider } }),
    makeProjectPolicyDouble(),
    makeProjectReadPolicyDouble(),
    new SocialService(prisma as never, notifications as never),
  );
  return { prisma, service };
}

const condiciones = (prisma: Record<string, any>) => prisma.proyecto.findMany.mock.calls[0][0].where.AND as unknown[];

describe('MEJ-19: filtro por dueño en Explorar', () => {
  it.each([
    ['PERSONAL', { organizaciones: { none: {} }, idAsociacion: null }],
    ['ORGANIZACION', { organizaciones: { some: {} } }],
    ['ASOCIACION', { idAsociacion: { not: null } }],
  ])('%s agrega su condición', async (duenio, esperada) => {
    const { prisma, service } = crear();
    await service.findAll({ duenio });
    expect(condiciones(prisma)).toContainEqual(esperada);
  });

  it('un valor desconocido o ausente no filtra (solo estado visible y no eliminado)', async () => {
    for (const duenio of [undefined, '', 'OTRO']) {
      const { prisma, service } = crear();
      await service.findAll({ duenio });
      expect(condiciones(prisma)).toHaveLength(2);
    }
  });

  it('el catálogo paginado también filtra por dueño', async () => {
    const { prisma, service } = crear();
    prisma.proyecto.count = vi.fn().mockResolvedValue(0);
    await service.findAllPaginated({ duenio: 'ASOCIACION', page: 1, limit: 12 });
    expect(condiciones(prisma)).toContainEqual({ idAsociacion: { not: null } });
  });
});

describe('MEJ-15: «Para ti»', () => {
  const rol = (requisitos: number[], cupos = 3, activos = 0) => ({
    cupos,
    requisitos: requisitos.map((idHabilidad) => ({ idHabilidad, nivelMinimo: 'BASICO', obligatorio: true })),
    _count: { participaciones: activos },
  });
  const proyecto = (idProyecto: number, roles: unknown[], intereses: number[] = []) => ({
    idProyecto,
    tituloProyecto: `P${idProyecto}`,
    intereses: intereses.map((idInteres) => ({ idInteres, interes: { nombreInteres: `I${idInteres}` } })),
    roles,
  });

  it('ordena por coincidencia, marca el chip desde el 50 % y suma los intereses compartidos', async () => {
    const { prisma, service } = crear();
    prisma.usuarioHabilidad.findMany.mockResolvedValue([{ idHabilidad: 1, nivelHabilidad: 'BASICO' }, { idHabilidad: 2, nivelHabilidad: 'AVANZADO' }]);
    prisma.usuarioInteres.findMany.mockResolvedValue([{ idInteres: 8 }]);
    prisma.proyecto.findMany.mockResolvedValue([
      proyecto(10, [rol([1, 3])]), // 50 %
      proyecto(11, [rol([1, 2])]), // 100 %
      proyecto(12, [rol([3])], [8]), // 0 % + 1 interés
      proyecto(13, [rol([3])]), // nada en común: fuera
      proyecto(14, [rol([1, 2], 2, 2)]), // sin cupos: fuera
    ]);

    const r = await service.paraTi(5);

    expect(r.map((p) => p.idProyecto)).toEqual([11, 10, 12]);
    expect(r[0].coincidencia).toEqual({ porcentaje: 100, interesesCompartidos: 0, coincideHabilidades: true });
    expect(r[1].coincidencia.coincideHabilidades).toBe(true);
    expect(r[2].coincidencia).toEqual({ porcentaje: 0, interesesCompartidos: 1, coincideHabilidades: false });
    expect(r[0].roles).toEqual([{ cupos: 3, cuposDisponibles: 3 }]);
    expect(r[0].guardado).toBe(false);
  });

  it('excluye proyectos propios y donde ya participa, y respeta el filtro de dueño', async () => {
    const { prisma, service } = crear();
    await service.paraTi(5, 'ORGANIZACION');
    const and = condiciones(prisma);
    expect(and).toContainEqual({ creadoPor: { not: 5 } });
    expect(and).toContainEqual({ roles: { none: { participaciones: { some: { idUsuario: 5, estadoParticipacion: 'ACTIVO' } } } } });
    expect(and).toContainEqual({ organizaciones: { some: {} } });
  });

  it('sin habilidades ni intereses no hay nada que sugerir', async () => {
    const { prisma, service } = crear();
    prisma.proyecto.findMany.mockResolvedValue([proyecto(10, [rol([1])])]);
    await expect(service.paraTi(5)).resolves.toEqual([]);
  });
});

describe('MEJ-20: duplicar proyecto', () => {
  const FUENTE = {
    tituloProyecto: 'Feria',
    descripcionProyecto: 'Desc',
    objetivosProyecto: null,
    tipoProyecto: 'SERVICIO',
    modalidadProyecto: 'MIXTA',
    ubicacionProyecto: null,
    contextoAcademico: null,
    urlRecursoExterno: null,
    idAsociacion: 7,
    organizaciones: [{ idOrganizacion: 3, rolOrganizacion: 'PRINCIPAL' }],
    intereses: [{ idInteres: 4 }],
    hitos: [{ tituloHito: 'H1', descripcionHito: null, orden: 1 }],
    roles: [{ nombreRol: 'Backend', descripcionRolProyecto: null, idCarreraRequerida: 2, cupos: 2, horasSemanalesEstimadas: 4, requisitos: [{ idHabilidad: 1, nivelMinimo: 'BASICO', obligatorio: true }] }],
  };
  const lanzaProyecto = (prisma: Record<string, any>, creadoPor: number) =>
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 9, estadoProyecto: 'CERRADO', creadoPor, tituloProyecto: 'Feria' });

  it('solo el líder duplica', async () => {
    const { prisma, service } = crear();
    lanzaProyecto(prisma, 77);
    await expect(service.duplicar(9, 1)).rejects.toBeInstanceOf(ForbiddenException);
    prisma.proyecto.findFirst.mockResolvedValue(null);
    await expect(service.duplicar(9, 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.proyecto.create).not.toHaveBeenCalled();
  });

  it('crea un borrador con roles, requisitos, hitos e intereses; sin integrantes, fechas ni tareas', async () => {
    const { prisma, service } = crear();
    lanzaProyecto(prisma, 1);
    prisma.proyecto.findUniqueOrThrow.mockResolvedValue(FUENTE);
    prisma.proyecto.create.mockResolvedValue({ idProyecto: 20, tituloProyecto: 'Feria (copia)', estadoProyecto: 'BORRADOR' });

    await expect(service.duplicar(9, 1)).resolves.toMatchObject({ idProyecto: 20, estadoProyecto: 'BORRADOR' });

    const { data } = prisma.proyecto.create.mock.calls[0][0];
    expect(data).toMatchObject({ tituloProyecto: 'Feria (copia)', estadoProyecto: 'BORRADOR', creadoPor: 1, descripcionProyecto: 'Desc', idAsociacion: null });
    expect(data.roles.create).toEqual([
      expect.objectContaining({ nombreRol: 'Backend', cupos: 2, requisitos: { create: FUENTE.roles[0].requisitos } }),
    ]);
    expect(data.hitos.create).toEqual(FUENTE.hitos);
    expect(data.intereses.create).toEqual(FUENTE.intereses);
    expect(data).not.toHaveProperty('fechaInicio');
    expect(data).not.toHaveProperty('tareas');
  });

  it('conserva organización y asociación solo si el líder aún puede publicar a su nombre', async () => {
    const { prisma, service } = crear();
    lanzaProyecto(prisma, 1);
    prisma.proyecto.findUniqueOrThrow.mockResolvedValue(FUENTE);
    prisma.proyecto.create.mockResolvedValue({ idProyecto: 20 });
    prisma.usuarioOrganizacion.count.mockResolvedValue(1);
    prisma.juntaAsociacion.findUnique.mockResolvedValue({ cargo: 'PRESIDENTE', nivelPermiso: 'ADMINISTRADOR', asociacion: { archivada: false } });

    await service.duplicar(9, 1);
    let data = prisma.proyecto.create.mock.calls[0][0].data;
    expect(data.organizaciones.create).toEqual(FUENTE.organizaciones);
    expect(data.idAsociacion).toBe(7);

    // Perdió el permiso: la copia sale personal, sin error.
    prisma.usuarioOrganizacion.count.mockResolvedValue(0);
    prisma.juntaAsociacion.findUnique.mockResolvedValue(null);
    await service.duplicar(9, 1);
    data = prisma.proyecto.create.mock.calls[1][0].data;
    expect(data.organizaciones.create).toEqual([]);
    expect(data.idAsociacion).toBeNull();
  });

  it('acorta el título para no pasar los 200 caracteres', async () => {
    const { prisma, service } = crear();
    lanzaProyecto(prisma, 1);
    prisma.proyecto.findUniqueOrThrow.mockResolvedValue({ ...FUENTE, tituloProyecto: 'x'.repeat(200) });
    prisma.proyecto.create.mockResolvedValue({ idProyecto: 20 });
    await service.duplicar(9, 1);
    expect(prisma.proyecto.create.mock.calls[0][0].data.tituloProyecto).toHaveLength(200);
  });
});

describe('MEJ-21: postulantes por coincidencia', () => {
  const post = (idPostulacion: number, idUsuarioPostulante: number, requisitos: number[], dia: number) => ({
    idPostulacion,
    idUsuarioPostulante,
    fechaPostulacion: new Date(2026, 10, dia),
    postulante: { idUsuario: idUsuarioPostulante },
    rolProyecto: { idRolProyecto: 4, nombreRol: 'Backend', requisitos: requisitos.map((idHabilidad) => ({ idHabilidad, nivelMinimo: 'BASICO', obligatorio: true })) },
  });
  function conPostulaciones() {
    const ctx = crear();
    ctx.prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 2, estadoProyecto: 'PUBLICADO', creadoPor: 1, tituloProyecto: 'P' });
    // La consulta ya llega por fecha descendente.
    ctx.prisma.postulacion.findMany.mockResolvedValue([post(3, 30, [1, 2], 9), post(2, 20, [1, 2], 8), post(1, 10, [], 7)]);
    ctx.prisma.usuarioHabilidad.findMany.mockResolvedValue([
      { idUsuario: 30, idHabilidad: 1, nivelHabilidad: 'BASICO' },
      { idUsuario: 20, idHabilidad: 1, nivelHabilidad: 'BASICO' },
      { idUsuario: 20, idHabilidad: 2, nivelHabilidad: 'BASICO' },
    ]);
    return ctx;
  }

  it('cada postulación trae su % y sin requisitos del rol es null; sin orden se conserva la fecha', async () => {
    const { service } = conPostulaciones();
    const r = await service.findPostulacionesByProject(2, 1);
    expect(r.map((p) => [p.idPostulacion, p.coincidencia?.porcentaje ?? null])).toEqual([[3, 50], [2, 100], [1, null]]);
    expect(r[0].rolProyecto).not.toHaveProperty('requisitos');
  });

  it('con orden=coincidencia van primero las de mayor %, y las del rol sin requisitos al final', async () => {
    const { service } = conPostulaciones();
    const r = await service.findPostulacionesByProject(2, 1, 'coincidencia');
    expect(r.map((p) => p.idPostulacion)).toEqual([2, 3, 1]);
  });

  it('a igual % se conserva la más reciente primero', async () => {
    const ctx = crear();
    ctx.prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 2, estadoProyecto: 'PUBLICADO', creadoPor: 1, tituloProyecto: 'P' });
    ctx.prisma.postulacion.findMany.mockResolvedValue([post(3, 30, [1], 9), post(2, 20, [1], 8)]);
    ctx.prisma.usuarioHabilidad.findMany.mockResolvedValue([
      { idUsuario: 30, idHabilidad: 1, nivelHabilidad: 'BASICO' },
      { idUsuario: 20, idHabilidad: 1, nivelHabilidad: 'BASICO' },
    ]);
    const r = await ctx.service.findPostulacionesByProject(2, 1, 'coincidencia');
    expect(r.map((p) => p.idPostulacion)).toEqual([3, 2]);
  });
});
