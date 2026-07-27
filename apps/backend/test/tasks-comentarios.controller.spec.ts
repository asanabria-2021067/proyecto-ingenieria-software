import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException, ParseIntPipe } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TareaComentariosController } from '../src/tasks/tarea-comentarios.controller';
import { ComentariosController } from '../src/comentarios/comentarios.controller';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

/**
 * Tarea 28: migración de `tareas/:id/comentarios*` (proyecto implícito) a
 * `proyectos/:projectId/tareas/:taskId/comentarios` (contexto explícito).
 * Este spec reemplaza por completo al de la Tarea 15, que probaba el
 * prefijo y los params antiguos (su ausencia ya se verifica también en
 * tasks-queries.controller.spec.ts).
 */
function makeService() {
  return {
    findByTareaEnProyecto: vi.fn(),
    createForTask: vi.fn(),
    updateForTask: vi.fn(),
    removeForTask: vi.fn(),
  } as any;
}

describe('TareaComentariosController - comentarios de tarea (rutas anidadas, Tarea 28)', () => {
  describe('metadata de rutas y guard', () => {
    it('el controller está anidado bajo proyectos/:projectId/tareas/:taskId/comentarios', () => {
      expect(Reflect.getMetadata(PATH_METADATA, TareaComentariosController)).toBe(
        'proyectos/:projectId/tareas/:taskId/comentarios',
      );
    });

    it('el guard JWT está declarado a nivel de clase (aplica a las 4 rutas)', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, TareaComentariosController);
      expect(guards).toEqual([JwtAuthGuard]);
    });

    it('GET y POST usan la ruta raíz; PATCH y DELETE usan :commentId', () => {
      expect(Reflect.getMetadata(PATH_METADATA, TareaComentariosController.prototype.findComentarios)).toBe('/');
      expect(Reflect.getMetadata(METHOD_METADATA, TareaComentariosController.prototype.findComentarios)).toBe(0); // GET
      expect(Reflect.getMetadata(PATH_METADATA, TareaComentariosController.prototype.createComentario)).toBe('/');
      expect(Reflect.getMetadata(METHOD_METADATA, TareaComentariosController.prototype.createComentario)).toBe(1); // POST
      expect(Reflect.getMetadata(PATH_METADATA, TareaComentariosController.prototype.updateComentario)).toBe(
        ':commentId',
      );
      expect(Reflect.getMetadata(METHOD_METADATA, TareaComentariosController.prototype.updateComentario)).toBe(4); // PATCH
      expect(Reflect.getMetadata(PATH_METADATA, TareaComentariosController.prototype.removeComentario)).toBe(
        ':commentId',
      );
      expect(Reflect.getMetadata(METHOD_METADATA, TareaComentariosController.prototype.removeComentario)).toBe(3); // DELETE
    });

    it('la ruta antigua (prefijo "tareas" plano) ya no existe: es el único @Controller del archivo', () => {
      const source = readFileSync(join(__dirname, '../src/tasks/tarea-comentarios.controller.ts'), 'utf-8');
      const controllerDecorators = source.match(/@Controller\([^)]*\)/g) ?? [];
      expect(controllerDecorators).toEqual(["@Controller('proyectos/:projectId/tareas/:taskId/comentarios')"]);
      expect(source).not.toMatch(/@Controller\('tareas'\)/);
    });

    it('no queda ningún @Param con nombres antiguos ("id", "idComentario"): solo projectId/taskId/commentId', () => {
      const source = readFileSync(join(__dirname, '../src/tasks/tarea-comentarios.controller.ts'), 'utf-8');
      const paramNames = [...source.matchAll(/@Param\('([^']+)'/g)].map((m) => m[1]);
      expect([...new Set(paramNames)].sort()).toEqual(['commentId', 'projectId', 'taskId'].sort());
    });

    it('todos los @Param usan ParseIntPipe', () => {
      const source = readFileSync(join(__dirname, '../src/tasks/tarea-comentarios.controller.ts'), 'utf-8');
      const paramDecorators = source.match(/@Param\('[^']+',\s*ParseIntPipe\)/g) ?? [];
      // projectId+taskId en los 4 métodos (8) + commentId en update/remove (2) = 10.
      expect(paramDecorators.length).toBe(10);
    });

    it('el controller no consulta Prisma ni abre transacciones', () => {
      const source = readFileSync(join(__dirname, '../src/tasks/tarea-comentarios.controller.ts'), 'utf-8');
      expect(source).not.toMatch(/\$transaction/);
      expect(source).not.toMatch(/prisma\./);
    });

    it('no acepta identidad desde el body: userId nunca aparece leído del dto', () => {
      const source = readFileSync(join(__dirname, '../src/tasks/tarea-comentarios.controller.ts'), 'utf-8');
      expect(source).not.toMatch(/@Body\('userId'/);
      expect(source).not.toMatch(/dto\.userId/);
      expect(source).not.toMatch(/@Query\(/);
      expect(source).not.toMatch(/@Headers\(/);
      expect(source).toMatch(/@CurrentUser\(\)/);
    });

    it('coexiste sin conflicto con las rutas generales de tareas (prefijo distinto y más específico)', () => {
      const source = readFileSync(join(__dirname, '../src/tasks/tarea-comentarios.controller.ts'), 'utf-8');
      // proyectos/:projectId/tareas/:taskId/comentarios nunca colisiona con
      // proyectos/:projectId/tareas/:taskId (TasksController): un segmento
      // literal adicional ("comentarios") las distingue en cualquier router.
      expect(source).toMatch(/proyectos\/:projectId\/tareas\/:taskId\/comentarios/);
    });

    it('Tarea 28.C: el GET anidado existe y el GET genérico por tarea (sin projectId) ya no existe en ningún controller', () => {
      // GET anidado: presente, con contexto de proyecto.
      expect(Reflect.getMetadata(PATH_METADATA, TareaComentariosController)).toBe(
        'proyectos/:projectId/tareas/:taskId/comentarios',
      );
      expect(Reflect.getMetadata(PATH_METADATA, TareaComentariosController.prototype.findComentarios)).toBe('/');
      expect(Reflect.getMetadata(METHOD_METADATA, TareaComentariosController.prototype.findComentarios)).toBe(0); // GET

      // GET genérico por tarea: ausente. El controller genérico ya no expone
      // ningún método findByTarea/findByTareaDesc ni ruta 'tarea/:idTarea'.
      expect((ComentariosController.prototype as any).findByTarea).toBeUndefined();
      expect((ComentariosController.prototype as any).findByTareaDesc).toBeUndefined();
      const genericSource = readFileSync(
        join(__dirname, '../src/comentarios/comentarios.controller.ts'),
        'utf-8',
      );
      expect(genericSource).not.toMatch(/@Get\('tarea\/:idTarea'\)/);
      expect(genericSource).not.toMatch(/@Get\('tarea\/:idTarea\/desc'\)/);
      expect(genericSource).not.toMatch(/findByTarea/);
    });
  });

  describe('GET / (listado)', () => {
    it('delega en findByTareaEnProyecto con projectId, taskId y userId', async () => {
      const service = makeService();
      service.findByTareaEnProyecto.mockResolvedValue([{ idComentario: 1 }]);
      const controller = new TareaComentariosController(service);

      const result = await controller.findComentarios(5, 42, { userId: 3 });

      expect(service.findByTareaEnProyecto).toHaveBeenCalledWith(5, 42, 3);
      expect(service.findByTareaEnProyecto).toHaveBeenCalledTimes(1);
      expect(result).toEqual([{ idComentario: 1 }]);
    });

    it('propaga un userId distinto en cada solicitud (no lo cachea)', async () => {
      const service = makeService();
      const controller = new TareaComentariosController(service);

      await controller.findComentarios(5, 42, { userId: 1 });
      await controller.findComentarios(5, 42, { userId: 2 });

      expect(service.findByTareaEnProyecto).toHaveBeenNthCalledWith(1, 5, 42, 1);
      expect(service.findByTareaEnProyecto).toHaveBeenNthCalledWith(2, 5, 42, 2);
    });

    it('propaga errores del service sin transformarlos (p. ej. 404 por cruce de proyecto/tarea)', async () => {
      const service = makeService();
      const error = new NotFoundException('Tarea con id 42 no encontrada en el proyecto 5');
      service.findByTareaEnProyecto.mockRejectedValue(error);
      const controller = new TareaComentariosController(service);

      await expect(controller.findComentarios(5, 42, { userId: 3 })).rejects.toBe(error);
    });
  });

  describe('POST / (creación)', () => {
    it('crea el comentario con projectId y taskId de la URL, autor del JWT y contenido del DTO', async () => {
      const service = makeService();
      service.createForTask.mockResolvedValue({ idComentario: 9 });
      const controller = new TareaComentariosController(service);

      const result = await controller.createComentario(5, 42, { userId: 1 }, { contenido: 'Hola equipo' } as any);

      expect(service.createForTask).toHaveBeenCalledWith(5, 42, 1, 'Hola equipo');
      expect(result).toEqual({ idComentario: 9 });
    });

    it('el DTO de creación no admite idProyecto/idTarea propios: no hay forma de que el body sustituya la URL', () => {
      const source = readFileSync(
        join(__dirname, '../src/tasks/dto/create-tarea-comentario.dto.ts'),
        'utf-8',
      );
      expect(source).not.toMatch(/idProyecto/);
      expect(source).not.toMatch(/idTarea/);
    });

    it('propaga errores del service (p. ej. 403 sin permiso, 404 por tarea eliminada)', async () => {
      const service = makeService();
      const error = new ForbiddenException('Debes ser participante activo para comentar');
      service.createForTask.mockRejectedValue(error);
      const controller = new TareaComentariosController(service);

      await expect(
        controller.createComentario(5, 42, { userId: 7 }, { contenido: 'x' } as any),
      ).rejects.toBe(error);
    });
  });

  describe('PATCH :commentId (actualización)', () => {
    it('delega en updateForTask con projectId, taskId, commentId, userId y dto', async () => {
      const service = makeService();
      service.updateForTask.mockResolvedValue({ idComentario: 9, contenido: 'editado' });
      const controller = new TareaComentariosController(service);

      const result = await controller.updateComentario(5, 42, 9, { userId: 1 }, { contenido: 'editado' } as any);

      expect(service.updateForTask).toHaveBeenCalledWith(5, 42, 9, 1, { contenido: 'editado' });
      expect(result).toEqual({ idComentario: 9, contenido: 'editado' });
    });

    it('propaga 404 cuando el comentario pertenece a otra tarea o a otro proyecto', async () => {
      const service = makeService();
      const error = new NotFoundException('Comentario con id 9 no encontrado en la tarea 42');
      service.updateForTask.mockRejectedValue(error);
      const controller = new TareaComentariosController(service);

      await expect(
        controller.updateComentario(5, 42, 9, { userId: 1 }, { contenido: 'x' } as any),
      ).rejects.toBe(error);
    });
  });

  describe('DELETE :commentId (eliminación)', () => {
    it('delega en removeForTask con projectId, taskId, commentId y userId', async () => {
      const service = makeService();
      service.removeForTask.mockResolvedValue({ idComentario: 9, eliminadoEn: new Date() });
      const controller = new TareaComentariosController(service);

      await controller.removeComentario(5, 42, 9, { userId: 1 });

      expect(service.removeForTask).toHaveBeenCalledWith(5, 42, 9, 1);
    });

    it('propaga 404 cuando el commentId pertenece a otra tarea', async () => {
      const service = makeService();
      const error = new NotFoundException('Comentario con id 9 no encontrado en la tarea 42');
      service.removeForTask.mockRejectedValue(error);
      const controller = new TareaComentariosController(service);

      await expect(controller.removeComentario(5, 42, 9, { userId: 1 })).rejects.toBe(error);
    });
  });

  describe('validación de parámetros (ParseIntPipe real)', () => {
    it('projectId no numérico produce BadRequestException (400)', async () => {
      const pipe = new ParseIntPipe();
      await expect(
        pipe.transform('abc', { type: 'param', data: 'projectId' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('taskId no numérico produce BadRequestException (400)', async () => {
      const pipe = new ParseIntPipe();
      await expect(
        pipe.transform('xyz', { type: 'param', data: 'taskId' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('commentId no numérico produce BadRequestException (400)', async () => {
      const pipe = new ParseIntPipe();
      await expect(
        pipe.transform('nope', { type: 'param', data: 'commentId' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
