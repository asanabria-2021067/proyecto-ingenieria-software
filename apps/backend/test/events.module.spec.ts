import { describe, expect, it, vi } from 'vitest';
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
vi.hoisted(() => {
  process.env.FRONTEND_URL ??= 'http://localhost:3000';
});
import { AppModule } from '../src/app.module';
import { EventsModule } from '../src/events/events.module';
import { EventsController } from '../src/events/events.controller';
import { MyEventsController } from '../src/events/my-events.controller';
import { EventsService } from '../src/events/events.service';
import { EventsReminderService } from '../src/events/events-reminder.service';
import { AdminMeetingsController } from '../src/events/admin-meetings.controller';
import { AdminMeetingsService } from '../src/events/admin-meetings.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { ROLES_METADATA_KEY } from '../src/common/decorators/roles.decorator';

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

  it('HU-195: registra, provee y exporta las reuniones de Administración', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, EventsModule)).toContain(AdminMeetingsController);
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, EventsModule)).toContain(AdminMeetingsService);
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, EventsModule)).toContain(AdminMeetingsService);
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

describe('AdminMeetingsController (HU-195)', () => {
  it('usa el prefijo admin/reuniones con JwtAuthGuard + RolesGuard y rol administrador en toda la clase', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminMeetingsController)).toBe('admin/reuniones');
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminMeetingsController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_METADATA_KEY, AdminMeetingsController)).toEqual(['administrador']);
  });

  it('expone exactamente listar, elegibles, equipo de un proyecto, detalle, participantes, crear, editar y cancelar', () => {
    const propios = Object.getOwnPropertyNames(AdminMeetingsController.prototype).filter((n) => n !== 'constructor');
    expect(propios.sort()).toEqual(['cancel', 'create', 'detail', 'eligibleProjects', 'list', 'participants', 'projectTeam', 'update']);
  });

  it('el equipo de un proyecto es GET equipos/:idProyecto y ningún método relaja la protección de la clase', () => {
    const equipo = AdminMeetingsController.prototype.projectTeam;
    expect(Reflect.getMetadata(PATH_METADATA, equipo)).toBe('equipos/:idProyecto');
    expect(Reflect.getMetadata(METHOD_METADATA, equipo)).toBe(RequestMethod.GET);
    // Las guardas y el rol se declaran solo en la clase: un método con los suyos podría abrir la ruta.
    for (const nombre of Object.getOwnPropertyNames(AdminMeetingsController.prototype).filter((n) => n !== 'constructor')) {
      const metodo = AdminMeetingsController.prototype[nombre as keyof AdminMeetingsController];
      expect(Reflect.getMetadata(GUARDS_METADATA, metodo), nombre).toBeUndefined();
      expect(Reflect.getMetadata(ROLES_METADATA_KEY, metodo), nombre).toBeUndefined();
    }
  });
});
