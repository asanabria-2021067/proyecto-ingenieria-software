import { describe, expect, it } from 'vitest';
import { MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AppModule } from '../src/app.module';
import { LabelsModule } from '../src/labels/labels.module';
import { LabelsController } from '../src/labels/labels.controller';
import { LabelsService } from '../src/labels/labels.service';

/**
 * Tarea 30: pruebas estructurales de wiring. El proyecto no instala
 * `@nestjs/testing` (ver test/tasks-queries.controller.spec.ts), así que se
 * inspecciona la metadata real de `@Module`/`@Controller` con
 * `Reflect.getMetadata`, igual que el resto de la suite, en vez de levantar
 * un `TestingModule` o un servidor completo.
 */
describe('LabelsModule (Tarea 30: estructura y wiring, sin CRUD todavía)', () => {
  it('registra LabelsController en controllers', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, LabelsModule);
    expect(controllers).toContain(LabelsController);
  });

  it('registra LabelsService en providers', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, LabelsModule);
    expect(providers).toContain(LabelsService);
  });

  it('exporta LabelsService', () => {
    const exports_ = Reflect.getMetadata(MODULE_METADATA.EXPORTS, LabelsModule);
    expect(exports_).toContain(LabelsService);
  });

  it('LabelsService puede resolverse (sin dependencias de constructor todavía)', () => {
    const instance = new LabelsService();
    expect(instance).toBeInstanceOf(LabelsService);
    expect(typeof instance.normalizeName).toBe('function');
  });

  it('LabelsService no depende de PrismaService ni de ningún token en su constructor (sin persistencia en esta fase)', () => {
    const paramTypes = Reflect.getMetadata('design:paramtypes', LabelsService);
    expect(paramTypes === undefined || paramTypes.length === 0).toBe(true);
  });

  it('AppModule importa LabelsModule exactamente una vez', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    const ocurrencias = imports.filter((m) => m === LabelsModule);
    expect(ocurrencias).toHaveLength(1);
  });
});

describe('LabelsController (Tarea 30: prefijo contextualizado, sin handlers CRUD)', () => {
  it('usa el prefijo proyectos/:projectId/etiquetas', () => {
    expect(Reflect.getMetadata(PATH_METADATA, LabelsController)).toBe(
      'proyectos/:projectId/etiquetas',
    );
  });

  it('no expone ningún método propio (ni GET, POST, PATCH ni DELETE) todavía', () => {
    const propios = Object.getOwnPropertyNames(LabelsController.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(propios).toEqual([]);
  });

  it('no inyecta LabelsService (evita una propiedad sin uso en esta fase)', () => {
    const paramTypes = Reflect.getMetadata('design:paramtypes', LabelsController);
    expect(paramTypes === undefined || paramTypes.length === 0).toBe(true);
  });
});
