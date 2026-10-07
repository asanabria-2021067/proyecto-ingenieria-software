import { describe, expect, it, vi } from 'vitest';
import { MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
vi.hoisted(() => {
  process.env.FRONTEND_URL ??= 'http://localhost:3000';
});
import { AppModule } from '../src/app.module';
import { EventsModule } from '../src/events/events.module';
import { CalendarSharesModule } from '../src/calendar-shares/calendar-shares.module';
import { CalendarSharesController } from '../src/calendar-shares/calendar-shares.controller';
import { CalendarSharesService } from '../src/calendar-shares/calendar-shares.service';

/** HU-184: wiring estructural, mismo patrón que test/events.module.spec.ts. */
describe('CalendarSharesModule', () => {
  it('registra su controller y su service, e importa EventsModule', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, CalendarSharesModule)).toContain(CalendarSharesController);
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, CalendarSharesModule)).toContain(CalendarSharesService);
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, CalendarSharesModule)).toContain(EventsModule);
  });

  it('AppModule importa CalendarSharesModule exactamente una vez', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    expect(imports.filter((m) => m === CalendarSharesModule)).toHaveLength(1);
  });
});

describe('CalendarSharesController', () => {
  it('usa el prefijo usuarios/me/calendario', () => {
    expect(Reflect.getMetadata(PATH_METADATA, CalendarSharesController)).toBe('usuarios/me/calendario');
  });

  it('expone exactamente listar, compartir, dejarDeCompartir y agenda', () => {
    const propios = Object.getOwnPropertyNames(CalendarSharesController.prototype).filter((n) => n !== 'constructor');
    expect(propios.sort()).toEqual(['agenda', 'compartir', 'dejarDeCompartir', 'listar']);
  });
});
