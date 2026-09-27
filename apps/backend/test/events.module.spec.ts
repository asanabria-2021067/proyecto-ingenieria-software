import { describe, expect, it, vi } from 'vitest';
import { MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
vi.hoisted(() => {
  process.env.FRONTEND_URL ??= 'http://localhost:3000';
});
import { AppModule } from '../src/app.module';
import { EventsModule } from '../src/events/events.module';
import { EventsController } from '../src/events/events.controller';
import { MyEventsController } from '../src/events/my-events.controller';
import { EventsService } from '../src/events/events.service';
import { EventsReminderService } from '../src/events/events-reminder.service';

/**
 * HU-169 (T-263/T-265): prueba estructural de wiring, mismo patrón que
 * test/labels.module.spec.ts (sin @nestjs/testing en este proyecto).
 */
describe('EventsModule', () => {
  it('registra EventsController y MyEventsController en controllers', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, EventsModule);
    expect(controllers).toContain(EventsController);
    expect(controllers).toContain(MyEventsController);
  });

  it('registra EventsService y EventsReminderService en providers', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, EventsModule);
    expect(providers).toContain(EventsService);
    expect(providers).toContain(EventsReminderService);
  });

  it('exporta EventsService', () => {
    const exports_ = Reflect.getMetadata(MODULE_METADATA.EXPORTS, EventsModule);
    expect(exports_).toContain(EventsService);
  });

  it('AppModule importa EventsModule exactamente una vez', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    expect(imports.filter((m) => m === EventsModule)).toHaveLength(1);
  });
});

describe('EventsController', () => {
  it('usa el prefijo proyectos/:projectId/eventos', () => {
    expect(Reflect.getMetadata(PATH_METADATA, EventsController)).toBe('proyectos/:projectId/eventos');
  });

  it('expone exactamente findAll, create, update, remove', () => {
    const propios = Object.getOwnPropertyNames(EventsController.prototype).filter((n) => n !== 'constructor');
    expect(propios.sort()).toEqual(['create', 'findAll', 'remove', 'update']);
  });
});

describe('MyEventsController', () => {
  it('usa el prefijo usuarios/me/eventos', () => {
    expect(Reflect.getMetadata(PATH_METADATA, MyEventsController)).toBe('usuarios/me/eventos');
  });

  it('expone exactamente findInRange', () => {
    const propios = Object.getOwnPropertyNames(MyEventsController.prototype).filter((n) => n !== 'constructor');
    expect(propios.sort()).toEqual(['findInRange']);
  });
});
