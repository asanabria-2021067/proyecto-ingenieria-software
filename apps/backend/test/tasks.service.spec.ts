import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { TasksService } from '../src/tasks/tasks.service';

// Cobertura mínima de camino exitoso para esta tarea (Tarea 15): consulta
// delegada, mapeo básico al contrato público y orden de negocio. La matriz
// exhaustiva de autorización/aislamiento/soft delete queda para la Tarea 16.

function makePrisma() {
  return { tarea: { findMany: vi.fn(), findFirst: vi.fn() } } as any;
}

function makeAuthorization() {
  return {
    assertCanListProjectTasks: vi.fn().mockResolvedValue(undefined),
    assertCanReadTask: vi.fn().mockResolvedValue(undefined),
  } as any;
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
      const service = new TasksService(prisma, auth);

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
      const service = new TasksService(prisma, auth);

      const result = await service.findAll(5, 9);

      expect(result.map((t) => t.idTarea)).toEqual([3, 2, 5, 4, 1]);
    });

    it('mapea asignacionActiva, rolProyecto, hito y etiquetas a null/[] cuando no existen', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findMany.mockResolvedValue([baseRow()]);
      const service = new TasksService(prisma, auth);

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
      const service = new TasksService(prisma, auth);

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
      const service = new TasksService(prisma, auth);

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
      const service = new TasksService(prisma, auth);

      const [tarea] = await service.findAll(5, 9);

      expect(tarea.fechaLimite).toBe('2026-12-25');
    });
  });

  describe('findOne', () => {
    it('autoriza la lectura y repite los filtros de proyecto y soft delete en la consulta final', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findFirst.mockResolvedValue(baseRow({ idTarea: 8 }));
      const service = new TasksService(prisma, auth);

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
      const service = new TasksService(prisma, auth);

      await expect(service.findOne(5, 999, 9)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('devuelve el mismo contrato público que findAll', async () => {
      const prisma = makePrisma();
      const auth = makeAuthorization();
      prisma.tarea.findFirst.mockResolvedValue(baseRow({ idTarea: 8 }));
      const service = new TasksService(prisma, auth);

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
});
