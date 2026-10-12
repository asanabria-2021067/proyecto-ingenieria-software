import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { EstadoProyecto, EstadoSprint } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { ProjectPolicyService } from '../src/common/project-policy/project-policy.service';
import { AdminSprintsCalendarService } from '../src/sprints/admin-sprints-calendar.service';

const ADMIN_ID = 1;

/** Columna @db.Date tal como la entrega Prisma. */
function plan(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

let nextId = 100;
function fila(overrides: Record<string, unknown> = {}) {
  const idSprint = nextId++;
  return {
    idSprint,
    numero: 1,
    estado: EstadoSprint.ACTIVO,
    fechaInicio: new Date('2026-10-01T15:00:00.000Z'),
    fechaFinPlaneada: plan('2026-10-20'),
    fechaFinalizacionIniciada: null,
    fechaCierre: null,
    proyecto: {
      idProyecto: idSprint + 1000,
      tituloProyecto: `Proyecto ${idSprint}`,
      creador: { idUsuario: 7, nombre: 'Ana', apellido: 'López' },
    },
    ...overrides,
  };
}

function makeService(filas: unknown[] = []) {
  const prisma = { sprint: { findMany: vi.fn().mockResolvedValue(filas) } };
  const policy = { assertAdminTx: vi.fn().mockResolvedValue(undefined) };
  const service = new AdminSprintsCalendarService(
    prisma as unknown as PrismaService,
    policy as unknown as ProjectPolicyService,
  );
  return { service, prisma, policy };
}

describe('AdminSprintsCalendarService.getCalendar', () => {
  // Hoy en Guatemala = 2026-10-14 (12:00 locales).
  beforeEach(() => {
    nextId = 100;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T18:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('autorización', () => {
    it('valida al administrador en BD con el actor recibido, antes de leer nada', async () => {
      const { service, prisma, policy } = makeService();

      await service.getCalendar(ADMIN_ID);

      expect(policy.assertAdminTx).toHaveBeenCalledTimes(1);
      expect(policy.assertAdminTx).toHaveBeenCalledWith(prisma, ADMIN_ID);
      expect(policy.assertAdminTx.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.sprint.findMany.mock.invocationCallOrder[0],
      );
    });

    it('si el actor no es administrador propaga el 403 y no consulta ningún Sprint', async () => {
      const { service, prisma, policy } = makeService([fila()]);
      policy.assertAdminTx.mockRejectedValue(new ForbiddenException('Acceso restringido a administradores'));

      await expect(service.getCalendar(99)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.sprint.findMany).not.toHaveBeenCalled();
    });
  });

  describe('consulta', () => {
    it('hace un único findMany, sin consultas por proyecto (sin N+1)', async () => {
      const { service, prisma } = makeService([fila(), fila(), fila()]);

      await service.getCalendar(ADMIN_ID);

      expect(prisma.sprint.findMany).toHaveBeenCalledTimes(1);
    });

    it('filtra Sprints operables de proyectos activos no eliminados', async () => {
      const { service, prisma } = makeService();

      await service.getCalendar(ADMIN_ID);

      expect(prisma.sprint.findMany.mock.calls[0][0].where).toEqual({
        estado: { in: [EstadoSprint.ACTIVO, EstadoSprint.EN_FINALIZACION] },
        proyecto: {
          eliminadoEn: null,
          estadoProyecto: { in: [EstadoProyecto.PUBLICADO, EstadoProyecto.EN_PROGRESO] },
        },
      });
    });

    it('usa una proyección fija de metadata temporal: sin include ni relaciones operativas', async () => {
      const { service, prisma } = makeService();

      await service.getCalendar(ADMIN_ID);

      const args = prisma.sprint.findMany.mock.calls[0][0];
      expect(args.include).toBeUndefined();
      expect(args.select).toEqual({
        idSprint: true,
        numero: true,
        estado: true,
        fechaInicio: true,
        fechaFinPlaneada: true,
        fechaFinalizacionIniciada: true,
        fechaCierre: true,
        proyecto: {
          select: {
            idProyecto: true,
            tituloProyecto: true,
            creador: { select: { idUsuario: true, nombre: true, apellido: true } },
          },
        },
      });
    });

    it('ordena por plan ascendente con los sin plan al final e idSprint como desempate', async () => {
      const { service, prisma } = makeService();

      await service.getCalendar(ADMIN_ID);

      expect(prisma.sprint.findMany.mock.calls[0][0].orderBy).toEqual([
        { fechaFinPlaneada: { sort: 'asc', nulls: 'last' } },
        { idSprint: 'asc' },
      ]);
    });
  });

  describe('respuesta', () => {
    it('sin Sprints devuelve hoy de Guatemala, listas vacías y contadores en cero', async () => {
      const { service } = makeService();

      expect(await service.getCalendar(ADMIN_ID)).toEqual({
        hoy: '2026-10-14',
        items: [],
        conteos: { EN_CURSO: 0, VENCE_HOY: 0, PLAN_VENCIDO: 0, EN_FINALIZACION: 0, SIN_FECHA: 0 },
        resumen: { proximos7Dias: 0, planVencido: 0 },
      });
    });

    it('mapea un item con exactamente los campos del contrato y sus formatos de fecha', async () => {
      const { service } = makeService([
        fila({ idSprint: 5, numero: 3, proyecto: { idProyecto: 9, tituloProyecto: 'Tutorías', creador: { idUsuario: 7, nombre: 'Ana', apellido: 'López' } } }),
      ]);

      const { items } = await service.getCalendar(ADMIN_ID);

      expect(items).toEqual([
        {
          idSprint: 5,
          numero: 3,
          estado: 'ACTIVO',
          idProyecto: 9,
          tituloProyecto: 'Tutorías',
          lider: { idUsuario: 7, nombre: 'Ana', apellido: 'López' },
          fechaInicio: '2026-10-01T15:00:00.000Z',
          fechaFinPlaneada: '2026-10-20',
          fechaFinalizacionIniciada: null,
          fechaCierre: null,
          situacion: 'EN_CURSO',
          diasRestantes: 6,
          desviacionDias: null,
        },
      ]);
    });

    it('no filtra hacia el cliente ningún campo extra que la fila pudiera traer', async () => {
      const { service } = makeService([
        fila({
          cerradoPor: 4,
          tareasPlanificadasCierre: 12,
          tareas: [{ idTarea: 1 }],
          horasParticipacion: [{ horasAprobadas: 3 }],
          instantaneas: [{ idInstantanea: 1 }],
          proyecto: {
            idProyecto: 9,
            tituloProyecto: 'Tutorías',
            descripcionProyecto: 'no debe salir',
            creador: { idUsuario: 7, nombre: 'Ana', apellido: 'López', correo: 'ana@uvg.edu.gt', fotoUrl: 'x' },
          },
        }),
      ]);

      const { items } = await service.getCalendar(ADMIN_ID);

      expect(Object.keys(items[0]).sort()).toEqual(
        [
          'desviacionDias',
          'diasRestantes',
          'estado',
          'fechaCierre',
          'fechaFinPlaneada',
          'fechaFinalizacionIniciada',
          'fechaInicio',
          'idProyecto',
          'idSprint',
          'lider',
          'numero',
          'situacion',
          'tituloProyecto',
        ].sort(),
      );
      expect(Object.keys(items[0].lider).sort()).toEqual(['apellido', 'idUsuario', 'nombre']);
      expect(JSON.stringify(items)).not.toMatch(/correo|fotoUrl|tareas|horas|instantaneas|cerradoPor|PlanificadasCierre|descripcion/);
    });

    it('clasifica cada situación, cuenta por situación y ordena por atención', async () => {
      const { service } = makeService([
        // Orden de llegada = orden de la consulta (plan asc, sin plan al final).
        fila({ idSprint: 1, fechaFinPlaneada: plan('2026-10-05') }), // PLAN_VENCIDO
        fila({
          idSprint: 2,
          estado: EstadoSprint.EN_FINALIZACION,
          fechaFinPlaneada: plan('2026-10-12'),
          fechaFinalizacionIniciada: new Date('2026-10-13T16:00:00.000Z'),
        }), // EN_FINALIZACION (plan vencido)
        fila({ idSprint: 3, fechaFinPlaneada: plan('2026-10-13') }), // PLAN_VENCIDO
        fila({ idSprint: 4, fechaFinPlaneada: plan('2026-10-14') }), // VENCE_HOY
        fila({ idSprint: 5, fechaFinPlaneada: plan('2026-10-15') }), // EN_CURSO
        fila({ idSprint: 6, fechaFinPlaneada: plan('2026-11-30') }), // EN_CURSO
        fila({ idSprint: 7, fechaFinPlaneada: null }), // SIN_FECHA
      ]);

      const respuesta = await service.getCalendar(ADMIN_ID);

      expect(respuesta.items.map((item) => [item.idSprint, item.situacion])).toEqual([
        [1, 'PLAN_VENCIDO'],
        [3, 'PLAN_VENCIDO'],
        [4, 'VENCE_HOY'],
        [5, 'EN_CURSO'],
        [6, 'EN_CURSO'],
        [2, 'EN_FINALIZACION'],
        [7, 'SIN_FECHA'],
      ]);
      expect(respuesta.conteos).toEqual({
        PLAN_VENCIDO: 2,
        VENCE_HOY: 1,
        EN_CURSO: 2,
        EN_FINALIZACION: 1,
        SIN_FECHA: 1,
      });
      expect(Object.values(respuesta.conteos).reduce((a, b) => a + b, 0)).toBe(respuesta.items.length);
    });

    it('un Sprint EN_FINALIZACION informa su desviación y conserva el plan como referencia', async () => {
      const { service } = makeService([
        fila({
          estado: EstadoSprint.EN_FINALIZACION,
          fechaFinPlaneada: plan('2026-10-12'),
          fechaFinalizacionIniciada: new Date('2026-10-13T16:00:00.000Z'),
        }),
      ]);

      const [item] = (await service.getCalendar(ADMIN_ID)).items;

      expect(item).toMatchObject({
        situacion: 'EN_FINALIZACION',
        fechaFinPlaneada: '2026-10-12',
        fechaFinalizacionIniciada: '2026-10-13T16:00:00.000Z',
        desviacionDias: 1,
        diasRestantes: -2,
      });
    });

    it('varios Sprints con el mismo día planeado viajan todos, con el mismo fechaFinPlaneada', async () => {
      const { service } = makeService([
        fila({ fechaFinPlaneada: plan('2026-10-18') }),
        fila({ fechaFinPlaneada: plan('2026-10-18') }),
        fila({ fechaFinPlaneada: plan('2026-10-18') }),
      ]);

      const { items } = await service.getCalendar(ADMIN_ID);

      expect(items.map((item) => item.fechaFinPlaneada)).toEqual(['2026-10-18', '2026-10-18', '2026-10-18']);
      expect(new Set(items.map((item) => item.idSprint)).size).toBe(3);
    });
  });

  describe('resumen', () => {
    it('proximos7Dias cuenta ACTIVO con plan entre hoy y hoy + 7 inclusive; planVencido, ACTIVO con plan pasado', async () => {
      const { service } = makeService([
        fila({ fechaFinPlaneada: plan('2026-10-13') }), // vencido: fuera de próximos
        fila({ fechaFinPlaneada: plan('2026-10-14') }), // hoy (día 0): cuenta
        fila({ fechaFinPlaneada: plan('2026-10-21') }), // hoy + 7: cuenta
        fila({ fechaFinPlaneada: plan('2026-10-22') }), // hoy + 8: no cuenta
        fila({ fechaFinPlaneada: null }), // sin fecha: no cuenta
      ]);

      expect((await service.getCalendar(ADMIN_ID)).resumen).toEqual({ proximos7Dias: 2, planVencido: 1 });
    });

    it('un Sprint EN_FINALIZACION no cuenta ni como próximo ni como vencido', async () => {
      const finalizando = (day: string) =>
        fila({
          estado: EstadoSprint.EN_FINALIZACION,
          fechaFinPlaneada: plan(day),
          fechaFinalizacionIniciada: new Date('2026-10-14T15:00:00.000Z'),
        });
      const { service } = makeService([finalizando('2026-10-10'), finalizando('2026-10-16')]);

      const respuesta = await service.getCalendar(ADMIN_ID);

      expect(respuesta.resumen).toEqual({ proximos7Dias: 0, planVencido: 0 });
      expect(respuesta.conteos.EN_FINALIZACION).toBe(2);
    });
  });

  describe('día de referencia: Guatemala, no UTC', () => {
    it('a las 20:00 de Guatemala (02:00Z del día siguiente) un plan de hoy sigue siendo VENCE_HOY', async () => {
      vi.setSystemTime(new Date('2026-10-15T02:00:00.000Z'));
      const { service } = makeService([fila({ fechaFinPlaneada: plan('2026-10-14') })]);

      const respuesta = await service.getCalendar(ADMIN_ID);

      expect(respuesta.hoy).toBe('2026-10-14');
      expect(respuesta.items[0]).toMatchObject({ situacion: 'VENCE_HOY', diasRestantes: 0 });
      expect(respuesta.resumen).toEqual({ proximos7Dias: 1, planVencido: 0 });
    });

    it('a las 00:00 de Guatemala del día siguiente (06:00Z) ese mismo plan pasa a PLAN_VENCIDO', async () => {
      vi.setSystemTime(new Date('2026-10-15T06:00:00.000Z'));
      const { service } = makeService([fila({ fechaFinPlaneada: plan('2026-10-14') })]);

      const respuesta = await service.getCalendar(ADMIN_ID);

      expect(respuesta.hoy).toBe('2026-10-15');
      expect(respuesta.items[0]).toMatchObject({ situacion: 'PLAN_VENCIDO', diasRestantes: -1 });
    });
  });
});
