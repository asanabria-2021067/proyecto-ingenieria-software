import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ParseIntPipe,
} from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TasksController } from '../src/tasks/tasks.controller';
import { TareaComentariosController } from '../src/tasks/tarea-comentarios.controller';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

function makeService() {
  return { findAll: vi.fn(), findOne: vi.fn() } as any;
}

describe('TasksController - rutas, guard y códigos HTTP', () => {
  describe('metadata de rutas y guard', () => {
    it('el controller está anidado bajo proyectos/:projectId/tareas', () => {
      expect(Reflect.getMetadata(PATH_METADATA, TasksController)).toBe(
        'proyectos/:projectId/tareas',
      );
    });

    it('GET del listado no agrega segmento adicional (ruta raíz del controller)', () => {
      expect(Reflect.getMetadata(PATH_METADATA, TasksController.prototype.findAll)).toBe('/');
      expect(Reflect.getMetadata(METHOD_METADATA, TasksController.prototype.findAll)).toBe(0); // GET
    });

    it('GET del detalle usa el segmento :taskId', () => {
      expect(Reflect.getMetadata(PATH_METADATA, TasksController.prototype.findOne)).toBe(
        ':taskId',
      );
      expect(Reflect.getMetadata(METHOD_METADATA, TasksController.prototype.findOne)).toBe(0); // GET
    });

    it('el controller está protegido por JwtAuthGuard', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, TasksController);
      expect(guards).toContain(JwtAuthGuard);
    });

    it('agrega POST para creación (Tarea 18) y PATCH para edición (Tarea 19), pero aún no expone DELETE', () => {
      const source = readFileSync(
        join(__dirname, '../src/tasks/tasks.controller.ts'),
        'utf-8',
      );
      expect(source).toMatch(/@Post\(\)/);
      expect(source).toMatch(/@Patch\(':taskId'\)/);
      expect(source).not.toMatch(/@Delete\(/);
    });

    it('no se declara ninguna ruta legado GET /tareas (raíz sin proyecto)', () => {
      // El único @Controller() del archivo debe llevar el prefijo anidado;
      // si reapareciera un '@Controller(\'tareas\')' plano, este test falla.
      const source = readFileSync(
        join(__dirname, '../src/tasks/tasks.controller.ts'),
        'utf-8',
      );
      const controllerDecorators = source.match(/@Controller\([^)]*\)/g) ?? [];
      expect(controllerDecorators).toEqual(["@Controller('proyectos/:projectId/tareas')"]);
    });

    it('userId se obtiene exclusivamente de @CurrentUser(), nunca del body/query/header/params', () => {
      const source = readFileSync(
        join(__dirname, '../src/tasks/tasks.controller.ts'),
        'utf-8',
      );
      // Desde la Tarea 18, @Body() existe únicamente para el DTO tipado de
      // creación (CreateTaskDto) — nunca para leer userId/creadaPor/
      // idProyecto directamente del payload del cliente.
      expect(source).not.toMatch(/@Query\(/);
      expect(source).not.toMatch(/@Headers\(/);
      expect(source).toMatch(/@Body\(\)\s+dto:\s+CreateTaskDto/);
      expect(source).not.toMatch(/@Body\('userId'/);
      expect(source).not.toMatch(/@Body\('creadaPor'/);
      expect(source).not.toMatch(/dto\.userId/);
      expect(source).not.toMatch(/dto\.creadaPor/);
      expect(source).not.toMatch(/dto\.idProyecto/);
      expect(source).toMatch(/@CurrentUser\(\)/);
      // Los únicos nombres de @Param declarados en todo el archivo deben ser
      // projectId y taskId, nunca userId (findAll y create usan projectId;
      // findOne usa projectId y taskId; por eso projectId aparece 3 veces).
      const paramNames = [...source.matchAll(/@Param\('([^']+)'/g)].map((m) => m[1]);
      expect([...new Set(paramNames)].sort()).toEqual(['projectId', 'taskId']);
    });
  });

  describe('rutas de comentarios (no deben modificarse por esta tarea)', () => {
    it('TareaComentariosController conserva el prefijo tareas', () => {
      expect(Reflect.getMetadata(PATH_METADATA, TareaComentariosController)).toBe('tareas');
    });

    it('conserva exactamente los 3 sub-paths de comentarios', () => {
      const paths = [
        Reflect.getMetadata(PATH_METADATA, TareaComentariosController.prototype.findComentarios),
        Reflect.getMetadata(PATH_METADATA, TareaComentariosController.prototype.createComentario),
        Reflect.getMetadata(PATH_METADATA, TareaComentariosController.prototype.removeComentario),
      ];
      expect(paths).toEqual([
        ':id/comentarios',
        ':id/comentarios',
        ':id/comentarios/:idComentario',
      ]);
    });
  });

  describe('delegación en TasksService', () => {
    it('findAll delega con projectId (Param) y userId (CurrentUser)', () => {
      const service = makeService();
      const controller = new TasksController(service);

      controller.findAll(5, { userId: 9 });

      expect(service.findAll).toHaveBeenCalledWith(5, 9);
    });

    it('findOne delega con projectId, taskId (Param) y userId (CurrentUser)', () => {
      const service = makeService();
      const controller = new TasksController(service);

      controller.findOne(5, 42, { userId: 9 });

      expect(service.findOne).toHaveBeenCalledWith(5, 42, 9);
    });

    it('no aplica ordenamiento, transformación ni conteo propio: retorna exactamente lo que devuelve el service', async () => {
      const service = makeService();
      const publicShape = [{ idTarea: 1, cantidadComentarios: 3 }];
      service.findAll.mockResolvedValue(publicShape);
      const controller = new TasksController(service);

      const result = await controller.findAll(5, { userId: 9 });

      expect(result).toBe(publicShape);
    });
  });

  describe('propagación de códigos HTTP (vía TasksService mockeado)', () => {
    it('listado autorizado responde 200 (resuelve sin lanzar)', async () => {
      const service = makeService();
      service.findAll.mockResolvedValue([]);
      const controller = new TasksController(service);

      await expect(controller.findAll(5, { userId: 9 })).resolves.toEqual([]);
    });

    it('listado con autorización rechazada propaga ForbiddenException (403)', async () => {
      const service = makeService();
      service.findAll.mockRejectedValue(new ForbiddenException('No tienes una participación activa en este proyecto'));
      const controller = new TasksController(service);

      await expect(controller.findAll(5, { userId: 9 })).rejects.toMatchObject({
        constructor: ForbiddenException,
      });
      try {
        await controller.findAll(5, { userId: 9 });
      } catch (e: any) {
        expect(e.getStatus()).toBe(403);
      }
    });

    it('listado de proyecto inexistente propaga NotFoundException (404)', async () => {
      const service = makeService();
      service.findAll.mockRejectedValue(new NotFoundException('Proyecto con id 5 no encontrado'));
      const controller = new TasksController(service);

      try {
        await controller.findAll(5, { userId: 9 });
        throw new Error('no debía resolver');
      } catch (e: any) {
        expect(e).toBeInstanceOf(NotFoundException);
        expect(e.getStatus()).toBe(404);
      }
    });

    it('detalle autorizado responde 200', async () => {
      const service = makeService();
      service.findOne.mockResolvedValue({ idTarea: 8 });
      const controller = new TasksController(service);

      await expect(controller.findOne(5, 8, { userId: 9 })).resolves.toEqual({ idTarea: 8 });
    });

    it('detalle con usuario externo propaga ForbiddenException (403)', async () => {
      const service = makeService();
      service.findOne.mockRejectedValue(new ForbiddenException('No tienes permiso'));
      const controller = new TasksController(service);

      try {
        await controller.findOne(5, 8, { userId: 9 });
        throw new Error('no debía resolver');
      } catch (e: any) {
        expect(e).toBeInstanceOf(ForbiddenException);
        expect(e.getStatus()).toBe(403);
      }
    });

    it('detalle de tarea inexistente propaga NotFoundException (404)', async () => {
      const service = makeService();
      service.findOne.mockRejectedValue(new NotFoundException('Tarea con id 999 no encontrada'));
      const controller = new TasksController(service);

      try {
        await controller.findOne(5, 999, { userId: 9 });
        throw new Error('no debía resolver');
      } catch (e: any) {
        expect(e).toBeInstanceOf(NotFoundException);
        expect(e.getStatus()).toBe(404);
      }
    });

    it('detalle de tarea de otro proyecto propaga NotFoundException (404), igual que inexistente', async () => {
      const service = makeService();
      service.findOne.mockRejectedValue(
        new NotFoundException('Tarea con id 50 no encontrada en el proyecto 1'),
      );
      const controller = new TasksController(service);

      try {
        await controller.findOne(1, 50, { userId: 9 });
        throw new Error('no debía resolver');
      } catch (e: any) {
        expect(e).toBeInstanceOf(NotFoundException);
        expect(e.getStatus()).toBe(404);
      }
    });
  });

  describe('validación de parámetros (ParseIntPipe real, sin instalar dependencias)', () => {
    it('projectId no numérico produce BadRequestException (400)', async () => {
      const pipe = new ParseIntPipe();
      try {
        await pipe.transform('abc', { type: 'param', data: 'projectId' } as any);
        throw new Error('no debía resolver');
      } catch (e: any) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect(e.getStatus()).toBe(400);
      }
    });

    it('taskId no numérico produce BadRequestException (400)', async () => {
      const pipe = new ParseIntPipe();
      try {
        await pipe.transform('xyz', { type: 'param', data: 'taskId' } as any);
        throw new Error('no debía resolver');
      } catch (e: any) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect(e.getStatus()).toBe(400);
      }
    });

    it('projectId y taskId numéricos como string se convierten a number', async () => {
      const pipe = new ParseIntPipe();
      await expect(
        pipe.transform('5', { type: 'param', data: 'projectId' } as any),
      ).resolves.toBe(5);
      await expect(
        pipe.transform('42', { type: 'param', data: 'taskId' } as any),
      ).resolves.toBe(42);
    });
  });

  describe('autenticación (JwtAuthGuard)', () => {
    it('el guard está declarado a nivel de clase (aplica a ambos endpoints GET)', () => {
      // No se instala @nestjs/testing ni supertest (no están en el proyecto);
      // el 401 real lo produce JwtAuthGuard (AuthGuard('jwt') de
      // @nestjs/passport), una implementación de terceros ya probada por esa
      // librería, no código de esta tarea. Aquí se verifica lo que sí es
      // responsabilidad de esta tarea: que el guard esté efectivamente
      // aplicado al controller completo (metadata de clase, no por método),
      // de modo que ninguna ruta quede sin protección.
      const guards = Reflect.getMetadata(GUARDS_METADATA, TasksController);
      expect(guards).toEqual([JwtAuthGuard]);
    });
  });
});
