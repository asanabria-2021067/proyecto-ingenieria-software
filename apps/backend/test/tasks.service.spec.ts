import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { TasksService } from '../src/tasks/tasks.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { TasksAuthorizationService } from '../src/tasks/tasks-authorization.service';
import type { TasksRelationsService } from '../src/tasks/tasks-relations.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { TasksContextService } from '../src/tasks/tasks-context.service';

// Cobertura mínima de camino exitoso para esta tarea (Tarea 15): consulta
// delegada, mapeo básico al contrato público y orden de negocio. La matriz
// exhaustiva de autorización/aislamiento/soft delete queda para la Tarea 16.

function makePrisma() {
  return { tarea: { findMany: vi.fn(), findFirst: vi.fn() } };
}

function makeAuthorization() {
  return {
    assertCanListProjectTasks: vi.fn().mockResolvedValue(undefined),
    assertCanReadTask: vi.fn().mockResolvedValue(undefined),
  };
}

// findAll/findOne (las únicas rutas cubiertas en este archivo) solo usan
// prisma y tasksAuthorization; las otras tres dependencias del constructor
// real no se invocan en esos caminos, así que basta con stubs vacíos.
function makeService(
  prisma: ReturnType<typeof makePrisma>,
  auth: ReturnType<typeof makeAuthorization>,
) {
  return new TasksService(
    prisma as unknown as PrismaService,
    auth as unknown as TasksAuthorizationService,
    {} as unknown as TasksRelationsService,
    {} as unknown as NotificationsService,
    {} as unknown as TasksContextService,
  );
}

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    idTarea: 1,
    idProyecto: 5,
    idHito: null,
    idRolProyecto: null,
    tituloTarea: 'Tarea',
    descripcionTarea: null,
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    creadaPor: 1,
    fechaCreacion: new Date('2026-01-01T00:00:00.000Z'),
    fechaLimite: null,
    actualizadaEn: null,
    tiempoEstimadoHoras: null,
    hito: null,
    rolProyecto: null,
    asignaciones: [],
    etiquetas: [],
    _count: { comentarios: 0 },
    ...overrides,
  };
}

describe('TasksService', () => {
  describe('findAll', () => {
    it('autoriza el listado y consulta con idProyecto + eliminadoEn: null', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([baseRow()]);
      const service = makeService(prisma, auth);

      await service.findAll(5, 9);

      expect(auth.assertCanListProjectTasks).toHaveBeenCalledWith(5, 9);
      expect(prisma.tarea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { idProyecto: 5, eliminadoEn: null } }),
      );
    });

    it('ordena por prioridad ALTA > MEDIA > BAJA, luego fecha límite próxima, luego idTarea', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([
        baseRow({ idTarea: 1, prioridad: 'BAJA', fechaLimite: null }),
        baseRow({ idTarea: 2, prioridad: 'ALTA', fechaLimite: new Date('2026-06-01') }),
        baseRow({ idTarea: 3, prioridad: 'ALTA', fechaLimite: new Date('2026-05-01') }),
        baseRow({ idTarea: 4, prioridad: 'MEDIA', fechaLimite: null }),
        baseRow({ idTarea: 5, prioridad: 'ALTA', fechaLimite: null }),
      ]);
      const service = makeService(prisma, auth);

      const result = await service.findAll(5, 9);

      expect(result.map((t) => t.idTarea)).toEqual([3, 2, 5, 4, 1]);
    });

    it('mapea asignacionActiva, rolProyecto, hito y etiquetas a null/[] cuando no existen', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([baseRow()]);
      const service = makeService(prisma, auth);

      const [tarea] = await service.findAll(5, 9);

      expect(tarea.asignacionActiva).toBeNull();
      expect(tarea.rolProyecto).toBeNull();
      expect(tarea.hito).toBeNull();
      expect(tarea.etiquetas).toEqual([]);
      expect(tarea.cantidadComentarios).toBe(0);
    });

    it('convierte asignaciones[0] (única activa filtrada por Prisma) a un objeto singular', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([
        baseRow({
          asignaciones: [
            {
              idAsignacion: 7,
              idUsuario: 3,
              fechaAsignacion: new Date('2026-02-01T00:00:00.000Z'),
              usuario: { idUsuario: 3, nombre: 'Ana', apellido: 'García', fotoUrl: null },
            },
          ],
        }),
      ]);
      const service = makeService(prisma, auth);

      const [tarea] = await service.findAll(5, 9);

      expect(tarea.asignacionActiva).toEqual({
        idAsignacion: 7,
        idUsuario: 3,
        fechaAsignacion: new Date('2026-02-01T00:00:00.000Z'),
        usuario: { idUsuario: 3, nombre: 'Ana', apellido: 'García', fotoUrl: null },
      });
    });

    it('aplana la tabla intermedia de etiquetas y las ordena por nombreNormalizado', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([
        baseRow({
          etiquetas: [
            { etiqueta: { idEtiqueta: 2, nombreEtiqueta: 'urgente', nombreNormalizado: 'urgente', color: '#EF4444' } },
            { etiqueta: { idEtiqueta: 1, nombreEtiqueta: 'backend', nombreNormalizado: 'backend', color: '#10B981' } },
          ],
        }),
      ]);
      const service = makeService(prisma, auth);

      const [tarea] = await service.findAll(5, 9);

      expect(tarea.etiquetas).toEqual([
        { idEtiqueta: 1, nombreEtiqueta: 'backend', nombreNormalizado: 'backend', color: '#10B981' },
        { idEtiqueta: 2, nombreEtiqueta: 'urgente', nombreNormalizado: 'urgente', color: '#EF4444' },
      ]);
    });

    it('expone fechaLimite como YYYY-MM-DD (día calendario, sin reinterpretar zona horaria)', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([
        baseRow({ fechaLimite: new Date('2026-12-25T00:00:00.000Z') }),
      ]);
      const service = makeService(prisma, auth);

      const [tarea] = await service.findAll(5, 9);

      expect(tarea.fechaLimite).toBe('2026-12-25');
    });
  });

  describe('findOne', () => {
    it('autoriza la lectura y repite los filtros de proyecto y soft delete en la consulta final', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findFirst.mockResolvedValue(baseRow({ idTarea: 8 }));
      const service = makeService(prisma, auth);

      await service.findOne(5, 8, 9);

      expect(auth.assertCanReadTask).toHaveBeenCalledWith(5, 8, 9);
      expect(prisma.tarea.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { idTarea: 8, idProyecto: 5, eliminadoEn: null },
        }),
      );
    });

    it('lanza NotFoundException si la consulta final no encuentra la tarea', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findFirst.mockResolvedValue(null);
      const service = makeService(prisma, auth);

      await expect(service.findOne(5, 999, 9)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('devuelve el mismo contrato público que findAll', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findFirst.mockResolvedValue(baseRow({ idTarea: 8 }));
      const service = makeService(prisma, auth);

      const tarea = await service.findOne(5, 8, 9);

      expect(Object.keys(tarea).sort()).toEqual(
        [
          'idTarea',
          'idProyecto',
          'idHito',
          'idRolProyecto',
          'tituloTarea',
          'descripcionTarea',
          'estadoTarea',
          'prioridad',
          'creadaPor',
          'fechaCreacion',
          'fechaLimite',
          'actualizadaEn',
          'tiempoEstimadoHoras',
          'asignacionActiva',
          'rolProyecto',
          'hito',
          'etiquetas',
          'cantidadComentarios',
        ].sort(),
      );
    });
  });

  // ─── Tarea 16: cobertura exhaustiva de consultas, contrato y N+1 ───────

  describe('la consulta solo ocurre después de una autorización exitosa', () => {
    it('findAll no llama a prisma.tarea.findMany si assertCanListProjectTasks rechaza', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      auth.assertCanListProjectTasks.mockRejectedValue(new Error('rechazado'));
      const service = makeService(prisma, auth);

      await expect(service.findAll(5, 9)).rejects.toThrow();
      expect(prisma.tarea.findMany).not.toHaveBeenCalled();
    });

    it('findOne no llama a prisma.tarea.findFirst si assertCanReadTask rechaza', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      auth.assertCanReadTask.mockRejectedValue(new Error('rechazado'));
      const service = makeService(prisma, auth);

      await expect(service.findOne(5, 8, 9)).rejects.toThrow();
      expect(prisma.tarea.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('tareas sin hito', () => {
    it('aparecen junto a tareas con hito, sin error de mapeo ni exclusión', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([
        baseRow({ idTarea: 1, idHito: null, hito: null }),
        baseRow({ idTarea: 2, idHito: 4, hito: { idHito: 4, tituloHito: 'MVP funcional' } }),
      ]);
      const service = makeService(prisma, auth);

      const result = await service.findAll(5, 9);

      expect(result).toHaveLength(2);
      expect(result.find((t) => t.idTarea === 1)?.hito).toBeNull();
      expect(result.find((t) => t.idTarea === 2)?.hito).toEqual({
        idHito: 4,
        tituloHito: 'MVP funcional',
      });
    });
  });

  describe('rol e hito: las cuatro combinaciones', () => {
    it.each([
      ['con rol y con hito', { idRolProyecto: 6, rolProyecto: { idRolProyecto: 6, nombreRol: 'Fullstack' }, idHito: 4, hito: { idHito: 4, tituloHito: 'MVP' } }],
      ['con rol y sin hito', { idRolProyecto: 6, rolProyecto: { idRolProyecto: 6, nombreRol: 'Fullstack' }, idHito: null, hito: null }],
      ['sin rol y con hito', { idRolProyecto: null, rolProyecto: null, idHito: 4, hito: { idHito: 4, tituloHito: 'MVP' } }],
      ['sin rol y sin hito', { idRolProyecto: null, rolProyecto: null, idHito: null, hito: null }],
    ])('%s', async (_label, overrides) => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([baseRow(overrides)]);
      const service = makeService(prisma, auth);

      const [tarea] = await service.findAll(5, 9);

      expect(tarea.rolProyecto).toEqual(overrides.rolProyecto);
      expect(tarea.hito).toEqual(overrides.hito);
    });
  });

  describe('ordenamiento exhaustivo', () => {
    it('respeta ALTA > MEDIA > BAJA, fecha próxima primero, null al final, idTarea como desempate', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      // Deliberadamente desordenado: no debe depender del orden de findMany.
      prisma.tarea.findMany.mockResolvedValue([
        baseRow({ idTarea: 31, prioridad: 'BAJA', fechaLimite: null }),
        baseRow({ idTarea: 20, prioridad: 'MEDIA', fechaLimite: new Date('2026-05-01') }),
        baseRow({ idTarea: 10, prioridad: 'ALTA', fechaLimite: new Date('2026-03-01') }),
        baseRow({ idTarea: 22, prioridad: 'MEDIA', fechaLimite: null }),
        baseRow({ idTarea: 30, prioridad: 'BAJA', fechaLimite: new Date('2026-01-01') }),
        baseRow({ idTarea: 12, prioridad: 'ALTA', fechaLimite: null }),
        baseRow({ idTarea: 13, prioridad: 'ALTA', fechaLimite: new Date('2026-01-01') }),
        baseRow({ idTarea: 11, prioridad: 'ALTA', fechaLimite: new Date('2026-01-01') }),
        baseRow({ idTarea: 21, prioridad: 'MEDIA', fechaLimite: null }),
      ]);
      const service = makeService(prisma, auth);

      const result = await service.findAll(5, 9);

      // ALTA: 11 y 13 empatan en fecha (2026-01-01) -> desempate por idTarea
      // (11 < 13); luego 10 (fecha posterior); luego 12 (sin fecha, al final).
      // MEDIA: 20 (con fecha) antes que 21/22 (sin fecha, empatan -> id asc).
      // BAJA: 30 (con fecha) antes que 31 (sin fecha).
      expect(result.map((t) => t.idTarea)).toEqual([11, 13, 10, 12, 20, 21, 22, 30, 31]);
    });
  });

  describe('fecha límite: caso de zona horaria de Guatemala', () => {
    it('2026-12-25T00:00:00.000Z se expone como 2026-12-25, nunca 2026-12-24', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([
        baseRow({ fechaLimite: new Date('2026-12-25T00:00:00.000Z') }),
      ]);
      const service = makeService(prisma, auth);

      const [tarea] = await service.findAll(5, 9);

      expect(tarea.fechaLimite).toBe('2026-12-25');
      expect(tarea.fechaLimite).not.toBe('2026-12-24');
    });

    it('fechaLimite: null se mantiene como null', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([baseRow({ fechaLimite: null })]);
      const service = makeService(prisma, auth);

      const [tarea] = await service.findAll(5, 9);

      expect(tarea.fechaLimite).toBeNull();
    });
  });

  describe('asignación activa: campos seguros y ausencia de historial', () => {
    const asignacionRow = {
      idAsignacion: 7,
      idUsuario: 3,
      fechaAsignacion: new Date('2026-02-01T00:00:00.000Z'),
      usuario: { idUsuario: 3, nombre: 'Ana', apellido: 'García', fotoUrl: null },
    };

    it('el usuario asignado expone únicamente idUsuario, nombre, apellido, fotoUrl', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([baseRow({ asignaciones: [asignacionRow] })]);
      const service = makeService(prisma, auth);

      const [tarea] = await service.findAll(5, 9);

      expect(Object.keys(tarea.asignacionActiva!.usuario).sort()).toEqual(
        ['apellido', 'fotoUrl', 'idUsuario', 'nombre'].sort(),
      );
      const serialized = JSON.stringify(tarea.asignacionActiva);
      expect(serialized).not.toMatch(/contrasena|password|hash|token|correo|estado/i);
    });

    it('no expone el arreglo interno de asignaciones ni desasignadaEn en ningún nivel', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([baseRow({ asignaciones: [asignacionRow] })]);
      const service = makeService(prisma, auth);

      const [tarea] = await service.findAll(5, 9);

      expect(tarea).not.toHaveProperty('asignaciones');
      expect(JSON.stringify(tarea)).not.toContain('desasignadaEn');
    });

    it('asignacionActiva es un objeto singular con exactamente los 4 campos requeridos', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([baseRow({ asignaciones: [asignacionRow] })]);
      const service = makeService(prisma, auth);

      const [tarea] = await service.findAll(5, 9);

      expect(Object.keys(tarea.asignacionActiva!).sort()).toEqual(
        ['fechaAsignacion', 'idAsignacion', 'idUsuario', 'usuario'].sort(),
      );
    });
  });

  describe('etiquetas', () => {
    it('tarea sin etiquetas devuelve []', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([baseRow({ etiquetas: [] })]);
      const service = makeService(prisma, auth);

      const [tarea] = await service.findAll(5, 9);

      expect(tarea.etiquetas).toEqual([]);
    });

    it('tarea con una sola etiqueta', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([
        baseRow({
          etiquetas: [
            { etiqueta: { idEtiqueta: 1, nombreEtiqueta: 'backend', nombreNormalizado: 'backend', color: '#10B981' } },
          ],
        }),
      ]);
      const service = makeService(prisma, auth);

      const [tarea] = await service.findAll(5, 9);

      expect(tarea.etiquetas).toEqual([
        { idEtiqueta: 1, nombreEtiqueta: 'backend', nombreNormalizado: 'backend', color: '#10B981' },
      ]);
    });

    it('las etiquetas no exponen idTarea, idProyecto ni el objeto intermedio TareaEtiqueta', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([
        baseRow({
          idTarea: 8,
          etiquetas: [
            { etiqueta: { idEtiqueta: 1, nombreEtiqueta: 'backend', nombreNormalizado: 'backend', color: '#10B981' } },
          ],
        }),
      ]);
      const service = makeService(prisma, auth);

      const [tarea] = await service.findAll(5, 9);

      expect(Object.keys(tarea.etiquetas[0]).sort()).toEqual(
        ['color', 'idEtiqueta', 'nombreEtiqueta', 'nombreNormalizado'].sort(),
      );
      expect(tarea.etiquetas[0]).not.toHaveProperty('idTarea');
      expect(tarea.etiquetas[0]).not.toHaveProperty('idProyecto');
    });

    it('múltiples etiquetas recibidas en orden arbitrario se ordenan por nombreNormalizado ascendente', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([
        baseRow({
          etiquetas: [
            { etiqueta: { idEtiqueta: 3, nombreEtiqueta: 'urgente', nombreNormalizado: 'urgente', color: '#EF4444' } },
            { etiqueta: { idEtiqueta: 1, nombreEtiqueta: 'backend', nombreNormalizado: 'backend', color: '#10B981' } },
            { etiqueta: { idEtiqueta: 2, nombreEtiqueta: 'frontend', nombreNormalizado: 'frontend', color: '#3B82F6' } },
          ],
        }),
      ]);
      const service = makeService(prisma, auth);

      const [tarea] = await service.findAll(5, 9);

      expect(tarea.etiquetas.map((e) => e.nombreNormalizado)).toEqual([
        'backend',
        'frontend',
        'urgente',
      ]);
    });
  });

  describe('contador de comentarios', () => {
    it('usa el conteo ya filtrado por Prisma (comentarios activos, no eliminados)', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      // El mock simula lo que Prisma ya devuelve tras aplicar
      // `comentarios: { where: { eliminadoEn: null } }` en el _count: de 5
      // comentarios totales (3 activos + 2 eliminados), _count.comentarios
      // ya llega en 3, sin que el service haga ningún filtrado adicional.
      prisma.tarea.findMany.mockResolvedValue([baseRow({ _count: { comentarios: 3 } })]);
      const service = makeService(prisma, auth);

      const [tarea] = await service.findAll(5, 9);

      expect(tarea.cantidadComentarios).toBe(3);
    });

    it('no expone _count ni un arreglo de comentarios', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([baseRow({ _count: { comentarios: 3 } })]);
      const service = makeService(prisma, auth);

      const [tarea] = await service.findAll(5, 9);

      expect(tarea).not.toHaveProperty('_count');
      expect(tarea).not.toHaveProperty('comentarios');
    });

    it('la consulta de comentarios en TASK_SELECT está filtrada por eliminadoEn: null', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([baseRow()]);
      const service = makeService(prisma, auth);

      await service.findAll(5, 9);

      const selectArg = prisma.tarea.findMany.mock.calls[0][0].select;
      expect(selectArg._count.select.comentarios.where).toEqual({ eliminadoEn: null });
    });
  });

  describe('contrato público completo', () => {
    it('una tarea con todas las relaciones pobladas simultáneamente produce exactamente la forma pública esperada', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      const filaCompleta = baseRow({
        idTarea: 100,
        idHito: 4,
        idRolProyecto: 6,
        tituloTarea: 'Optimizar consultas',
        descripcionTarea: 'Detalle',
        estadoTarea: 'EN_PROGRESO',
        prioridad: 'ALTA',
        creadaPor: 1,
        fechaLimite: new Date('2026-08-15T00:00:00.000Z'),
        actualizadaEn: new Date('2026-07-01T00:00:00.000Z'),
        tiempoEstimadoHoras: 8,
        hito: { idHito: 4, tituloHito: 'MVP funcional' },
        rolProyecto: { idRolProyecto: 6, nombreRol: 'Fullstack' },
        asignaciones: [
          {
            idAsignacion: 7,
            idUsuario: 3,
            fechaAsignacion: new Date('2026-02-01T00:00:00.000Z'),
            usuario: { idUsuario: 3, nombre: 'Ana', apellido: 'García', fotoUrl: null },
          },
        ],
        etiquetas: [
          { etiqueta: { idEtiqueta: 2, nombreEtiqueta: 'urgente', nombreNormalizado: 'urgente', color: '#EF4444' } },
          { etiqueta: { idEtiqueta: 1, nombreEtiqueta: 'backend', nombreNormalizado: 'backend', color: '#10B981' } },
        ],
        _count: { comentarios: 4 },
      });
      prisma.tarea.findMany.mockResolvedValue([filaCompleta]);
      const service = makeService(prisma, auth);

      const [tarea] = await service.findAll(5, 9);

      expect(tarea).toEqual({
        idTarea: 100,
        idProyecto: 5,
        idHito: 4,
        idRolProyecto: 6,
        tituloTarea: 'Optimizar consultas',
        descripcionTarea: 'Detalle',
        estadoTarea: 'EN_PROGRESO',
        prioridad: 'ALTA',
        creadaPor: 1,
        fechaCreacion: filaCompleta.fechaCreacion,
        fechaLimite: '2026-08-15',
        actualizadaEn: new Date('2026-07-01T00:00:00.000Z'),
        tiempoEstimadoHoras: 8,
        asignacionActiva: {
          idAsignacion: 7,
          idUsuario: 3,
          fechaAsignacion: new Date('2026-02-01T00:00:00.000Z'),
          usuario: { idUsuario: 3, nombre: 'Ana', apellido: 'García', fotoUrl: null },
        },
        rolProyecto: { idRolProyecto: 6, nombreRol: 'Fullstack' },
        hito: { idHito: 4, tituloHito: 'MVP funcional' },
        etiquetas: [
          { idEtiqueta: 1, nombreEtiqueta: 'backend', nombreNormalizado: 'backend', color: '#10B981' },
          { idEtiqueta: 2, nombreEtiqueta: 'urgente', nombreNormalizado: 'urgente', color: '#EF4444' },
        ],
        cantidadComentarios: 4,
      });

      // Campos internos que nunca deben aparecer, ni en este ni en ningún caso.
      for (const campoProhibido of [
        'eliminadoEn',
        '_count',
        'asignaciones',
        'comentarios',
        'evidencias',
        'proyecto',
        'TareaEtiqueta',
      ]) {
        expect(tarea).not.toHaveProperty(campoProhibido);
      }
    });
  });

  describe('ausencia de consultas N+1', () => {
    function makeRichPrisma() {
      return {
        tarea: { findMany: vi.fn(), findFirst: vi.fn() },
        asignacionTarea: { findMany: vi.fn() },
        etiqueta: { findMany: vi.fn() },
        comentario: { count: vi.fn() },
        hito: { findUnique: vi.fn() },
        rolProyecto: { findUnique: vi.fn() },
      };
    }

    it('findAll con varias tareas llama a tarea.findMany exactamente una vez y a ningún otro delegate', async () => {
      const prisma = makeRichPrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([
        baseRow({ idTarea: 1 }),
        baseRow({ idTarea: 2 }),
        baseRow({ idTarea: 3 }),
      ]);
      const service = makeService(prisma, auth);

      await service.findAll(5, 9);

      expect(prisma.tarea.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.asignacionTarea.findMany).not.toHaveBeenCalled();
      expect(prisma.etiqueta.findMany).not.toHaveBeenCalled();
      expect(prisma.comentario.count).not.toHaveBeenCalled();
      expect(prisma.hito.findUnique).not.toHaveBeenCalled();
      expect(prisma.rolProyecto.findUnique).not.toHaveBeenCalled();
    });

    it('findOne llama a tarea.findFirst exactamente una vez (consulta final) y a ningún otro delegate', async () => {
      const prisma = makeRichPrisma();
      const auth = makeAuthorization();
      prisma.tarea.findFirst.mockResolvedValue(baseRow({ idTarea: 8 }));
      const service = makeService(prisma, auth);

      await service.findOne(5, 8, 9);

      // La llamada de autorización (assertCanReadTask) está mockeada aquí a
      // propósito: pertenece a TasksAuthorizationService/TasksContextService
      // y se prueba por separado (y en tasks-queries-isolation.spec.ts con
      // las clases reales). Esta prueba aísla exclusivamente las consultas
      // de relaciones que hace TasksService una vez autorizado.
      expect(prisma.tarea.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.asignacionTarea.findMany).not.toHaveBeenCalled();
      expect(prisma.etiqueta.findMany).not.toHaveBeenCalled();
      expect(prisma.comentario.count).not.toHaveBeenCalled();
      expect(prisma.hito.findUnique).not.toHaveBeenCalled();
      expect(prisma.rolProyecto.findUnique).not.toHaveBeenCalled();
    });

    it('el select de findAll carga hito, rolProyecto, asignaciones, etiquetas y _count en la misma consulta', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([baseRow()]);
      const service = makeService(prisma, auth);

      await service.findAll(5, 9);

      const selectArg = prisma.tarea.findMany.mock.calls[0][0].select;
      expect(selectArg).toHaveProperty('hito');
      expect(selectArg).toHaveProperty('rolProyecto');
      expect(selectArg).toHaveProperty('asignaciones');
      expect(selectArg).toHaveProperty('etiquetas');
      expect(selectArg).toHaveProperty('_count');
      expect(selectArg.asignaciones.where).toEqual({ desasignadaEn: null });
    });
  });
});
