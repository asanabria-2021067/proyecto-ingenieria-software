import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SeguimientoService } from '../src/seguimiento/seguimiento.service';
import { hoyGuatemala } from '../src/seguimiento/seguimiento.util';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { ProjectReadPolicyService } from '../src/common/project-policy/project-read-policy.service';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const hecha = { estadoTarea: 'HECHO' };
const pendiente = { estadoTarea: 'POR_HACER' };

function build(perfil = 'LIDER', estadoProyecto = 'EN_PROGRESO') {
  const prisma = {
    hito: { findMany: vi.fn().mockResolvedValue([]) },
    tarea: { findMany: vi.fn().mockResolvedValue([]) },
    sprint: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
  };
  const readPolicy = { assertRead: vi.fn().mockResolvedValue({ profile: perfil, project: { estadoProyecto } }) };
  const service = new SeguimientoService(prisma as unknown as PrismaService, readPolicy as unknown as ProjectReadPolicyService);
  return { prisma, readPolicy, service };
}

describe('SeguimientoService.obtener (MEJ-54/55)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-10T15:00:00.000Z')); // 09:00 en Guatemala
  });
  afterEach(() => vi.useRealTimers());

  it('hoyGuatemala usa el día calendario local, no el UTC', () => {
    expect(hoyGuatemala(new Date('2026-11-10T03:00:00.000Z')).toISOString()).toBe('2026-11-09T00:00:00.000Z');
    expect(hoyGuatemala(new Date('2026-11-10T06:00:00.000Z')).toISOString()).toBe('2026-11-10T00:00:00.000Z');
  });

  it('lista los hitos sin completar con la fecha vencida y los pone en rojo', async () => {
    const { prisma, service } = build();
    prisma.hito.findMany.mockResolvedValue([
      { idHito: 1, tituloHito: 'Atrasado', fechaLimite: d('2026-11-05'), tareas: [hecha, pendiente] },
      { idHito: 2, tituloHito: 'Completo', fechaLimite: d('2026-11-01'), tareas: [hecha] },
      { idHito: 3, tituloHito: 'A tiempo', fechaLimite: d('2026-11-30'), tareas: [pendiente] },
    ]);
    const r = await service.obtener(5, 9);
    expect(r.hitosAtrasados).toEqual([{ idHito: 1, tituloHito: 'Atrasado', fechaLimite: '2026-11-05', diasAtraso: 5 }]);
    expect(r.semaforo.color).toBe('ROJO');
    expect(r.semaforo.motivos).toContain('1 hito atrasado');
    expect(r.semaforo.ayuda.ROJO).toBeTruthy();
  });

  it('el hito que vence hoy no está atrasado y un hito en 3 días deja amarillo', async () => {
    const { prisma, service } = build();
    prisma.hito.findMany.mockResolvedValue([
      { idHito: 1, tituloHito: 'Hoy', fechaLimite: d('2026-11-10'), tareas: [pendiente] },
      { idHito: 2, tituloHito: 'En tres días', fechaLimite: d('2026-11-13'), tareas: [] },
    ]);
    const r = await service.obtener(5, 9);
    expect(r.hitosAtrasados).toEqual([]);
    expect(r.semaforo).toMatchObject({ color: 'AMARILLO', motivos: ['2 hitos vencen en 3 días o menos'] });
  });

  it('mide el atraso del sprint contra el tiempo transcurrido', async () => {
    const { prisma, service } = build();
    prisma.sprint.findFirst.mockResolvedValue({
      fechaInicio: new Date('2026-11-01T18:00:00.000Z'),
      fechaFinPlaneada: d('2026-11-11'),
      tareas: [hecha, pendiente, pendiente, pendiente, pendiente], // 20% de avance, 90% del tiempo
    });
    const r = await service.obtener(5, 9);
    expect(r.semaforo.color).toBe('ROJO');
    expect(r.semaforo.motivos[0]).toMatch(/^El sprint va 70 puntos por detrás/);
  });

  it('cuenta las tareas vencidas sin terminar', async () => {
    const { prisma, service } = build();
    prisma.tarea.findMany.mockResolvedValue([
      { fechaLimite: d('2026-11-09') },
      { fechaLimite: d('2026-11-20') },
      { fechaLimite: null },
      { fechaLimite: d('2026-11-30') },
      { fechaLimite: d('2026-12-30') },
    ]);
    const r = await service.obtener(5, 9);
    expect(r.semaforo).toMatchObject({ color: 'AMARILLO', motivos: ['1 tarea vencida'] });
  });

  it.each(['LIDER', 'ADMIN', 'PARTICIPANTE_ACTIVO'])('permite a %s', async (perfil) => {
    const { service } = build(perfil);
    await expect(service.obtener(5, 9)).resolves.toBeDefined();
  });

  it.each(['MIEMBRO_ORGANIZACION', 'PARTICIPANTE_HISTORICO', 'EXTERNO'])('niega a %s con 403', async (perfil) => {
    const { prisma, service } = build(perfil);
    await expect(service.obtener(5, 9)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.hito.findMany).not.toHaveBeenCalled();
  });
});

function datosResultados(prisma: object) {
  Object.assign(prisma, {
    proyecto: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        idProyecto: 5,
        tituloProyecto: 'Feria',
        descripcionProyecto: '',
        tipoProyecto: 'ACADEMICO_HORAS_BECA',
        fechaInicio: null,
        fechaFinEstimada: null,
        creador: { idUsuario: 1, nombre: 'A', apellido: 'B' },
        asociacion: null,
        organizaciones: [],
      }),
    },
    participacionProyecto: {
      findMany: vi.fn().mockResolvedValue([{ idUsuario: 2, usuario: { nombre: 'C', apellido: 'D' }, rolProyecto: { nombreRol: 'Dev' } }]),
    },
    horasParticipacion: { findMany: vi.fn().mockResolvedValue([{ horasAprobadas: '12', participacion: { idUsuario: 2 } }]) },
    reconocimientoCompanero: { count: vi.fn().mockResolvedValue(0) },
    revisionCierreProyecto: { findMany: vi.fn().mockResolvedValue([]) },
  });
}

describe('SeguimientoService.resultados (MEJ-56)', () => {
  it('solo existe para proyectos cerrados', async () => {
    const { service } = build('LIDER', 'EN_PROGRESO');
    await expect(service.resultados(5, 9)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('propaga el 403 de la política de lectura', async () => {
    const { prisma, readPolicy, service } = build();
    Object.assign(prisma, { proyecto: { findFirst: vi.fn().mockResolvedValue(null) } });
    readPolicy.assertRead.mockRejectedValue(new ForbiddenException('No tienes acceso'));
    await expect(service.resultados(5, 9)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    ['LIDER', 12],
    ['MIEMBRO_ORGANIZACION', null],
    ['EXTERNO', null],
  ])('%s ve horas acreditadas: %s', async (perfil, horas) => {
    const { prisma, service } = build(perfil, 'CERRADO');
    datosResultados(prisma);
    const r = await service.resultados(5, 9);
    expect(r.metricas.horasAcreditadas).toBe(horas);
    expect(r.equipo).toHaveLength(horas === null ? 0 : 1);
  });

  it.each(['PARTICIPANTE_HISTORICO', 'MIEMBRO_ORGANIZACION'])(
    'quien participó ve horas y equipo en un proyecto cerrado aunque su perfil sea %s',
    async (perfil) => {
      const { prisma, service } = build(perfil, 'CERRADO');
      datosResultados(prisma);
      const r = await service.resultados(5, 2); // idUsuario 2 consta con participación COMPLETADO
      expect(r.metricas.horasAcreditadas).toBe(12);
      expect(r.equipo).toHaveLength(1);
    },
  );

  describe('lectores del portafolio que la política de lectura niega', () => {
    function conPolitica403(junta: object | null, org: object | null = null) {
      const { prisma, readPolicy, service } = build('EXTERNO', 'CERRADO');
      datosResultados(prisma);
      readPolicy.assertRead.mockRejectedValue(new ForbiddenException('No tienes acceso'));
      Object.assign(prisma, {
        proyecto: {
          ...(prisma as unknown as { proyecto: object }).proyecto,
          findFirst: vi.fn().mockResolvedValue({ estadoProyecto: 'CERRADO', idAsociacion: 3, organizaciones: [{ idOrganizacion: 4 }] }),
        },
        juntaAsociacion: { findUnique: vi.fn().mockResolvedValue(junta) },
        organizacion: { findUnique: vi.fn().mockResolvedValue(org) },
        usuarioOrganizacion: { findUnique: vi.fn().mockResolvedValue(null) },
      });
      return service;
    }

    it('la junta de la asociación dueña abre los resultados sin horas ni equipo', async () => {
      const service = conPolitica403({ asociacion: { archivada: false } });
      const r = await service.resultados(5, 9);
      expect(r.metricas.horasAcreditadas).toBeNull();
      expect(r.equipo).toEqual([]);
    });

    it('quien ve la organización dueña (pública) abre los resultados', async () => {
      const service = conPolitica403(null, { idOrganizacion: 4, nombreOrganizacion: 'O', estadoOrganizacion: 'ACTIVA', visibilidad: 'PUBLICA' });
      await expect(service.resultados(5, 9)).resolves.toMatchObject({ equipo: [] });
    });

    it('quien no es de la junta ni ve la organización sigue con 403', async () => {
      const service = conPolitica403(null, { idOrganizacion: 4, nombreOrganizacion: 'O', estadoOrganizacion: 'ACTIVA', visibilidad: 'PRIVADA' });
      await expect(service.resultados(5, 9)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});

describe('SeguimientoService portafolios (MEJ-56)', () => {
  it('la asociación lista solo sus proyectos cerrados (la junta la garantiza JuntaGuard en la ruta)', async () => {
    const prisma = { proyecto: { findMany: vi.fn().mockResolvedValue([]) } };
    const service = new SeguimientoService(prisma as unknown as PrismaService, {} as ProjectReadPolicyService);
    await expect(service.portafolioAsociacion(3)).resolves.toEqual([]);
    expect(prisma.proyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idAsociacion: 3, estadoProyecto: 'CERRADO', eliminadoEn: null } }),
    );
  });

  it('una organización privada no se revela a quien no es miembro', async () => {
    const prisma = {
      organizacion: {
        findUnique: vi.fn().mockResolvedValue({ idOrganizacion: 4, nombreOrganizacion: 'Org', estadoOrganizacion: 'ACTIVA', visibilidad: 'PRIVADA' }),
      },
      usuarioOrganizacion: { findUnique: vi.fn().mockResolvedValue(null) },
      proyecto: { findMany: vi.fn() },
    };
    const service = new SeguimientoService(prisma as unknown as PrismaService, {} as ProjectReadPolicyService);
    await expect(service.portafolioOrganizacion(4, 9)).rejects.toMatchObject({ status: 404 });
    expect(prisma.proyecto.findMany).not.toHaveBeenCalled();
  });

  // Las horas acreditadas solo las ve quien gestiona la organización (ORG-8); público y miembros ven el resto.
  it.each([
    [null, null],
    ['LECTURA', null],
    ['ADMINISTRADOR', 14.5],
  ])('suma tareas hechas y equipo por proyecto cerrado (rol %s, horas %s)', async (rol, horas) => {
    const prisma = {
      organizacion: {
        findUnique: vi.fn().mockResolvedValue({ idOrganizacion: 4, nombreOrganizacion: 'Org', estadoOrganizacion: 'ACTIVA', visibilidad: 'PUBLICA' }),
      },
      usuarioOrganizacion: {
        findUnique: vi.fn().mockResolvedValue(rol ? { rolOrganizacion: rol, estadoMembresia: 'ACTIVA' } : null),
      },
      proyecto: {
        findMany: vi.fn().mockResolvedValue([
          { idProyecto: 10, tituloProyecto: 'Feria', tipoProyecto: 'ACADEMICO_HORAS_BECA', fechaInicio: d('2026-02-01'), creadoPor: 1 },
        ]),
      },
      tarea: { groupBy: vi.fn().mockResolvedValue([{ idProyecto: 10, _count: { _all: 6 } }]) },
      participacionProyecto: {
        findMany: vi.fn().mockResolvedValue([
          { idUsuario: 2, rolProyecto: { idProyecto: 10 } },
          { idUsuario: 2, rolProyecto: { idProyecto: 10 } },
          { idUsuario: 3, rolProyecto: { idProyecto: 10 } },
        ]),
      },
      horasParticipacion: {
        findMany: vi.fn().mockResolvedValue([
          { horasAprobadas: '10.5', participacion: { rolProyecto: { idProyecto: 10 } } },
          { horasAprobadas: '4', participacion: { rolProyecto: { idProyecto: 10 } } },
        ]),
      },
      revisionCierreProyecto: {
        findMany: vi.fn().mockResolvedValue([{ idProyecto: 10, resueltaEn: new Date('2026-06-15T10:00:00.000Z') }]),
      },
    };
    const service = new SeguimientoService(prisma as unknown as PrismaService, {} as ProjectReadPolicyService);
    await expect(service.portafolioOrganizacion(4, 9)).resolves.toEqual([
      {
        idProyecto: 10,
        tituloProyecto: 'Feria',
        tipoProyecto: 'ACADEMICO_HORAS_BECA',
        fechaInicio: '2026-02-01',
        fechaCierre: '2026-06-15',
        integrantes: 3,
        tareasHechas: 6,
        horasAcreditadas: horas,
      },
    ]);
  });
});
