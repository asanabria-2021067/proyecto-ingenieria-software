import { describe, expect, it, vi } from 'vitest';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { CalendarSharesController } from '../src/calendar-shares/calendar-shares.controller';
import { CalendarSharesService } from '../src/calendar-shares/calendar-shares.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

/**
 * G01-C14 (UI-15, UI-01, UI-31): el proyecto no instala `@nestjs/testing`
 * (ver test/labels.controller.spec.ts), así que se inspecciona la metadata
 * real de las rutas y se instancia el controller con un servicio simulado
 * para verificar que el actor SIEMPRE sale del token. Las respuestas HTTP
 * reales (401/403/JSON) se prueban en
 * test/integration/calendar-shares-http.integration.spec.ts.
 */
const USER = { userId: 7 };

function makeService() {
  const service = {
    listar: vi.fn().mockResolvedValue('listar'),
    compartir: vi.fn().mockResolvedValue('compartir'),
    dejarDeCompartir: vi.fn().mockResolvedValue('dejarDeCompartir'),
    dejarDeRecibir: vi.fn().mockResolvedValue('dejarDeRecibir'),
    agendaCompartida: vi.fn().mockResolvedValue('agenda'),
  };
  return service as typeof service & CalendarSharesService;
}

describe('CalendarSharesController — rutas, guard y códigos (G01-C14)', () => {
  const proto = CalendarSharesController.prototype;

  it('prefijo usuarios/me/calendario con JwtAuthGuard a nivel de clase (cubre las 5 rutas)', () => {
    expect(Reflect.getMetadata(PATH_METADATA, CalendarSharesController)).toBe('usuarios/me/calendario');
    expect(Reflect.getMetadata(GUARDS_METADATA, CalendarSharesController)).toEqual([JwtAuthGuard]);
    for (const handler of [proto.listar, proto.compartir, proto.dejarDeCompartir, proto.dejarDeRecibir, proto.agenda]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined(); // ninguna ruta se desprotege a nivel de método
    }
  });

  it.each([
    ['listar', 'compartidos', 0, undefined],
    ['compartir', 'compartidos', 1, 201],
    ['dejarDeCompartir', 'compartidos/:idUsuario', 3, undefined],
    ['dejarDeRecibir', 'compartidos-conmigo/:idPropietario', 3, undefined],
    ['agenda', 'compartidos-conmigo/:idPropietario/agenda', 0, undefined],
  ] as const)('%s → %s (método %i, código %s)', (nombre, path, metodo, codigo) => {
    const handler = proto[nombre];
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(metodo); // 0 GET, 1 POST, 3 DELETE
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(codigo);
  });

  it('POST compartidos tiene su propio @Throttle (short 5/min) y el resto hereda la política global', () => {
    expect(Reflect.getMetadata('THROTTLER:LIMITshort', proto.compartir)).toBe(5);
    expect(Reflect.getMetadata('THROTTLER:LIMITshort', proto.agenda)).toBeUndefined();
    expect(Reflect.getMetadata('THROTTLER:LIMITshort', proto.dejarDeRecibir)).toBeUndefined();
  });
});

describe('CalendarSharesController — delegación con el actor del token (G01-C14)', () => {
  it('cada ruta pasa user.userId como actor; los ids ajenos solo vienen de la ruta o del cuerpo', async () => {
    const service = makeService();
    const controller = new CalendarSharesController(service);

    await expect(controller.listar(USER)).resolves.toBe('listar');
    expect(service.listar).toHaveBeenCalledWith(7);

    await expect(controller.compartir(USER, { idUsuario: 9 })).resolves.toBe('compartir');
    expect(service.compartir).toHaveBeenCalledWith(7, 9);

    await expect(controller.dejarDeCompartir(USER, 9)).resolves.toBe('dejarDeCompartir');
    expect(service.dejarDeCompartir).toHaveBeenCalledWith(7, 9);

    await expect(controller.dejarDeRecibir(USER, 3)).resolves.toBe('dejarDeRecibir');
    expect(service.dejarDeRecibir).toHaveBeenCalledWith(7, 3);

    await expect(
      controller.agenda(USER, 3, { desde: '2026-10-01T06:00:00.000Z', hasta: '2026-10-08T06:00:00.000Z' }),
    ).resolves.toBe('agenda');
    expect(service.agendaCompartida).toHaveBeenCalledWith(7, 3, '2026-10-01T06:00:00.000Z', '2026-10-08T06:00:00.000Z');
  });

  it('un destinatario no puede "quitar" a un tercero: dejarDeRecibir solo recibe (yo, propietario)', async () => {
    const service = makeService();
    const controller = new CalendarSharesController(service);

    await controller.dejarDeRecibir({ userId: 42 }, 3);
    expect(service.dejarDeRecibir).toHaveBeenCalledWith(42, 3);
    expect(service.dejarDeCompartir).not.toHaveBeenCalled();
  });
});
