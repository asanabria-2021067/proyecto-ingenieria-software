import { describe, expect, it } from 'vitest';
import { MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { LabelsModule } from '../src/labels/labels.module';
import { LabelsController } from '../src/labels/labels.controller';
import { TaskLabelsController } from '../src/labels/task-labels.controller';
import { LabelsService } from '../src/labels/labels.service';
import { PrismaService } from '../src/prisma/prisma.service';

const SERVICE_SOURCE = readFileSync(join(__dirname, '../src/labels/labels.service.ts'), 'utf-8');
const CONTROLLER_SOURCE = readFileSync(join(__dirname, '../src/labels/labels.controller.ts'), 'utf-8');

/**
 * Tarea 30/31: pruebas estructurales de wiring. El proyecto no instala
 * `@nestjs/testing` (ver test/tasks-queries.controller.spec.ts), así que se
 * inspecciona la metadata real de `@Module`/`@Controller` con
 * `Reflect.getMetadata`, igual que el resto de la suite, en vez de levantar
 * un `TestingModule` o un servidor completo.
 *
 * A partir de la Tarea 31, LabelsService persiste (inyecta PrismaService) y
 * LabelsController expone el CRUD real; las aserciones "todavía sin X" de la
 * Tarea 30 se reemplazan aquí por su contraparte legítima, sin debilitar la
 * cobertura de wiring que sigue vigente (controllers/providers/exports,
 * import único en AppModule, prefijo).
 */
describe('LabelsModule (Tarea 32: estructura, wiring, persistencia y asociación tarea-etiqueta)', () => {
  it('registra LabelsController en controllers', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, LabelsModule);
    expect(controllers).toContain(LabelsController);
  });

  it('registra TaskLabelsController en controllers (Tarea 32)', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, LabelsModule);
    expect(controllers).toContain(TaskLabelsController);
  });

  it('registra LabelsService en providers', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, LabelsModule);
    expect(providers).toContain(LabelsService);
  });

  it('exporta LabelsService', () => {
    const exports_ = Reflect.getMetadata(MODULE_METADATA.EXPORTS, LabelsModule);
    expect(exports_).toContain(LabelsService);
  });

  it('LabelsService puede resolverse inyectando PrismaService', () => {
    const instance = new LabelsService({} as PrismaService);
    expect(instance).toBeInstanceOf(LabelsService);
    expect(typeof instance.normalizeName).toBe('function');
  });

  it('LabelsService depende únicamente de PrismaService en su constructor (persistencia de la Tarea 31, sin NotificationsService ni otros módulos)', () => {
    // `design:paramtypes` no se emite bajo el transform de este test runner
    // (esbuild, sin emitDecoratorMetadata) aunque sí en el build real de
    // Nest; se verifica la firma real del constructor por código fuente,
    // igual que otros specs de este repo inspeccionan decoradores
    // (ver test/tasks-comentarios.controller.spec.ts).
    expect(SERVICE_SOURCE).toMatch(/constructor\(private prisma: PrismaService\)/);
    expect(SERVICE_SOURCE).not.toMatch(/^import .*NotificationsService/m);
    expect(SERVICE_SOURCE).not.toMatch(/^import .*from '\.\.\/tasks\//m);
    expect(SERVICE_SOURCE).not.toMatch(/^import .*from '\.\.\/comentarios\//m);
  });

  it('LabelsModule no importa NotificationsModule/TasksModule/ComentariosModule', () => {
    const imports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, LabelsModule) as unknown[]) ?? [];
    const nombres = imports.map((m: any) => m?.name);
    expect(nombres).not.toContain('NotificationsModule');
    expect(nombres).not.toContain('TasksModule');
    expect(nombres).not.toContain('ComentariosModule');
  });

  it('AppModule importa LabelsModule exactamente una vez', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    const ocurrencias = imports.filter((m) => m === LabelsModule);
    expect(ocurrencias).toHaveLength(1);
  });
});

describe('LabelsController (Tarea 31: prefijo contextualizado y CRUD real)', () => {
  it('usa el prefijo proyectos/:projectId/etiquetas', () => {
    expect(Reflect.getMetadata(PATH_METADATA, LabelsController)).toBe(
      'proyectos/:projectId/etiquetas',
    );
  });

  it('expone exactamente los 4 métodos del CRUD (findAll, create, update, remove)', () => {
    const propios = Object.getOwnPropertyNames(LabelsController.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(propios.sort()).toEqual(['create', 'findAll', 'remove', 'update']);
  });

  it('inyecta LabelsService en su constructor', () => {
    expect(CONTROLLER_SOURCE).toMatch(/constructor\(private labelsService: LabelsService\)/);
  });
});

describe('TaskLabelsController (Tarea 32: asociación tarea-etiqueta)', () => {
  const TASK_LABELS_CONTROLLER_SOURCE = readFileSync(
    join(__dirname, '../src/labels/task-labels.controller.ts'),
    'utf-8',
  );

  it('usa el prefijo proyectos/:projectId/tareas/:taskId/etiquetas (distinto del de LabelsController)', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TaskLabelsController)).toBe(
      'proyectos/:projectId/tareas/:taskId/etiquetas',
    );
  });

  it('expone exactamente attach y detach', () => {
    const propios = Object.getOwnPropertyNames(TaskLabelsController.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(propios.sort()).toEqual(['attach', 'detach']);
  });

  it('inyecta LabelsService en su constructor (reutiliza el mismo service, no crea uno propio)', () => {
    expect(TASK_LABELS_CONTROLLER_SOURCE).toMatch(
      /constructor\(private labelsService: LabelsService\)/,
    );
  });
});
