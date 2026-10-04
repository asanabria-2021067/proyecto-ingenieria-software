import { describe, expect, it, vi } from 'vitest';
import { GUARDS_METADATA, METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { AdminSprintsController } from '../src/sprints/admin-sprints.controller';
import type { AdminSprintsCalendarService } from '../src/sprints/admin-sprints-calendar.service';
import { AdminSprintsCalendarService as CalendarServiceClass } from '../src/sprints/admin-sprints-calendar.service';
import { AdminSprintCalendarQueryDto } from '../src/sprints/dto/admin-sprint-calendar-query.dto';
import { ProjectWriteGuard } from '../src/common/guards/project-write.guard';
import { SprintsModule } from '../src/sprints/sprints.module';
import { SprintsController } from '../src/sprints/sprints.controller';

function makeService() {
  return { getCalendar: vi.fn() };
}

function makeController(service: ReturnType<typeof makeService>) {
  return new AdminSprintsController(service as unknown as AdminSprintsCalendarService);
}

describe('AdminSprintsController.getCalendario (GET /admin/sprints/calendario)', () => {
  it('vive bajo el prefijo admin/sprints y está registrado como GET calendario', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminSprintsController)).toBe('admin/sprints');
    expect(Reflect.getMetadata(PATH_METADATA, AdminSprintsController.prototype.getCalendario)).toBe('calendario');
    expect(Reflect.getMetadata(METHOD_METADATA, AdminSprintsController.prototype.getCalendario)).toBe(
      RequestMethod.GET,
    );
  });

  it('es la única ruta del controlador: no hay escrituras ni detalle por Sprint', () => {
    const handlers = Object.getOwnPropertyNames(AdminSprintsController.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(handlers).toEqual(['getCalendario']);
  });

  it('exige JwtAuthGuard a nivel de clase y no es una ruta de escritura de proyecto', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminSprintsController)).toEqual([JwtAuthGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminSprintsController.prototype.getCalendario)).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminSprintsController) ?? []).not.toContain(ProjectWriteGuard);
  });

  it('delega en el servicio únicamente con el userId del usuario autenticado', () => {
    const service = makeService();
    const controller = makeController(service);

    controller.getCalendario({ userId: 9 }, new AdminSprintCalendarQueryDto());

    expect(service.getCalendar).toHaveBeenCalledTimes(1);
    expect(service.getCalendar).toHaveBeenCalledWith(9);
  });

  it('el DTO de query no declara ninguna propiedad: el endpoint no acepta parámetros', () => {
    expect(Object.keys(new AdminSprintCalendarQueryDto())).toEqual([]);
  });

  it('retorna exactamente lo que resuelve el servicio, sin transformarlo', async () => {
    const service = makeService();
    const respuesta = { hoy: '2026-10-14', items: [], conteos: {}, resumen: {} };
    service.getCalendar.mockResolvedValue(respuesta);

    expect(await makeController(service).getCalendario({ userId: 9 }, new AdminSprintCalendarQueryDto())).toBe(
      respuesta,
    );
  });

  it('propaga el 403 del servicio cuando el actor no es administrador', async () => {
    const service = makeService();
    const error = new Error('Acceso restringido a administradores');
    service.getCalendar.mockRejectedValue(error);

    await expect(
      makeController(service).getCalendario({ userId: 9 }, new AdminSprintCalendarQueryDto()),
    ).rejects.toBe(error);
  });
});

describe('SprintsModule — registro del calendario administrativo', () => {
  it('registra AdminSprintsController junto al controlador de Sprints', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, SprintsModule)).toEqual([
      SprintsController,
      AdminSprintsController,
    ]);
  });

  it('provee AdminSprintsCalendarService', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SprintsModule)).toContain(CalendarServiceClass);
  });
});
