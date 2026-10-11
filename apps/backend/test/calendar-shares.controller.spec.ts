import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ParseIntPipe,
  UnauthorizedException,
  ValidationPipe,
  type ExecutionContext,
} from '@nestjs/common';
import {
  CUSTOM_ROUTE_ARGS_METADATA,
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { ShareCalendarDto } from '../src/calendar-shares/dto/share-calendar.dto';
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

/**
 * G05-C01 (UI-15, F262-11): lo que G01-C14 dejaba sin fijar en la superficie
 * HTTP del controller: de dónde sale cada argumento (el actor nunca del
 * cuerpo, la ruta o la query), los pipes reales de cada parámetro, el DTO con
 * el ValidationPipe de main.ts, el guard real ante una petición anónima y que
 * los errores de autorización del servicio llegan intactos.
 */
type Argumentos = Record<string, { index: number; data?: unknown; pipes?: unknown[]; factory?: (data: unknown, ctx: ExecutionContext) => unknown }>;
const HANDLERS = ['listar', 'compartir', 'dejarDeCompartir', 'dejarDeRecibir', 'agenda'] as const;

function argumentosDe(handler: (typeof HANDLERS)[number]) {
  const todos = Reflect.getMetadata(ROUTE_ARGS_METADATA, CalendarSharesController, handler) as Argumentos;
  const entradas = Object.entries(todos);
  const deTipo = (tipo: RouteParamtypes) => entradas.filter(([clave]) => clave.startsWith(`${tipo}:`)).map(([, valor]) => valor);
  return {
    total: entradas.length,
    actor: entradas.filter(([clave]) => clave.includes(CUSTOM_ROUTE_ARGS_METADATA)).map(([, valor]) => valor),
    body: deTipo(RouteParamtypes.BODY),
    query: deTipo(RouteParamtypes.QUERY),
    param: deTipo(RouteParamtypes.PARAM),
  };
}

describe('CalendarSharesController — origen de cada argumento (G05-C01)', () => {
  it.each(HANDLERS)('%s recibe el actor por @CurrentUser() en la primera posición, leído de request.user', (handler) => {
    const { actor } = argumentosDe(handler);
    expect(actor).toHaveLength(1);
    expect(actor[0].index).toBe(0);
    const contexto = { switchToHttp: () => ({ getRequest: () => ({ user: { userId: 7 }, body: { userId: 99 }, params: { userId: '99' }, query: { userId: '99' } }) }) } as unknown as ExecutionContext;
    // El decorador devuelve lo que dejó el guard en request.user; nada del cuerpo, la ruta o la query.
    expect(actor[0].factory?.(undefined, contexto)).toEqual({ userId: 7 });
  });

  it.each([
    ['listar', { body: 0, query: 0, param: [] }],
    ['compartir', { body: 1, query: 0, param: [] }],
    ['dejarDeCompartir', { body: 0, query: 0, param: ['idUsuario'] }],
    ['dejarDeRecibir', { body: 0, query: 0, param: ['idPropietario'] }],
    ['agenda', { body: 0, query: 1, param: ['idPropietario'] }],
  ] as const)('%s solo lee del cliente lo que su contrato declara', (handler, esperado) => {
    const args = argumentosDe(handler);
    expect(args.body).toHaveLength(esperado.body);
    expect(args.query).toHaveLength(esperado.query);
    expect(args.param.map((p) => p.data)).toEqual(esperado.param);
    expect(args.total).toBe(1 + esperado.body + esperado.query + esperado.param.length);
    // El cuerpo y la query llegan completos (sin elegir un campo suelto) para que el ValidationPipe valide el DTO entero.
    for (const origen of [...args.body, ...args.query]) expect(origen.data).toBeUndefined();
    // Todo parámetro de ruta pasa por ParseIntPipe: nunca llega texto al servicio.
    for (const parametro of args.param) expect(parametro.pipes).toEqual([ParseIntPipe]);
  });

  it('ParseIntPipe rechaza con 400 lo que no es un entero y entrega un número al controller', async () => {
    const pipe = new ParseIntPipe();
    const meta = { type: 'param' as const, metatype: Number, data: 'idPropietario' };
    await expect(pipe.transform('12', meta)).resolves.toBe(12);
    for (const valor of ['abc', '1.5', '', '1e3', '12abc', ' ']) {
      await expect(pipe.transform(valor, meta)).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});

describe('ShareCalendarDto con el ValidationPipe de main.ts (G05-C01)', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validar = (cuerpo: unknown) => pipe.transform(cuerpo, { type: 'body', metatype: ShareCalendarDto });

  it('acepta un id entero positivo y lo entrega como instancia del DTO', async () => {
    const dto = (await validar({ idUsuario: 9 })) as ShareCalendarDto;
    expect(dto).toBeInstanceOf(ShareCalendarDto);
    expect(dto.idUsuario).toBe(9);
  });

  it.each([
    ['falta el campo', {}],
    ['cero', { idUsuario: 0 }],
    ['negativo', { idUsuario: -3 }],
    ['decimal', { idUsuario: 1.5 }],
    ['texto numérico', { idUsuario: '9' }],
    ['nulo', { idUsuario: null }],
    ['lista', { idUsuario: [9] }],
  ])('rechaza con 400 cuando idUsuario es inválido: %s', async (_caso, cuerpo) => {
    await expect(validar(cuerpo)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['idPropietario', 'userId', 'propietario', 'estado'])('rechaza con 400 un campo extra "%s": nadie elige al propietario desde el cuerpo', async (campo) => {
    await expect(validar({ idUsuario: 9, [campo]: 3 })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CalendarSharesController — guard real y errores de autorización (G05-C01)', () => {
  it('JwtAuthGuard es el AuthGuard("jwt") de Passport sin sobrescribir nada: una petición sin usuario válido termina en 401', () => {
    const guard = new JwtAuthGuard();
    expect(Object.getOwnPropertyNames(JwtAuthGuard.prototype)).toEqual(['constructor']);
    expect(() => guard.handleRequest(null, false, undefined, {} as ExecutionContext)).toThrow(UnauthorizedException);
    expect(() => guard.handleRequest(new Error('token inválido'), false, undefined, {} as ExecutionContext)).toThrow('token inválido');
    expect(guard.handleRequest(null, { userId: 7 }, undefined, {} as ExecutionContext)).toEqual({ userId: 7 });
  });

  it.each([
    ['agenda', new ForbiddenException('No tienes acceso a este calendario')],
    ['compartir', new NotFoundException('Usuario no encontrado')],
    ['compartir', new BadRequestException('No puedes compartir el calendario contigo mismo')],
  ] as const)('%s no traga ni transforma el error del servicio (%o)', async (handler, error) => {
    const service = makeService();
    const controller = new CalendarSharesController(service);
    if (handler === 'agenda') {
      service.agendaCompartida.mockRejectedValueOnce(error);
      await expect(controller.agenda(USER, 3, { desde: '2026-10-01T06:00:00.000Z', hasta: '2026-10-08T06:00:00.000Z' })).rejects.toBe(error);
    } else {
      service.compartir.mockRejectedValueOnce(error);
      await expect(controller.compartir(USER, { idUsuario: 9 })).rejects.toBe(error);
    }
  });

  it('las dos bajas son operaciones distintas del actor: ninguna recibe a la vez propietario y destinatario del cliente', async () => {
    const service = makeService();
    const controller = new CalendarSharesController(service);
    await controller.dejarDeCompartir({ userId: 7 }, 9);
    await controller.dejarDeRecibir({ userId: 7 }, 3);
    expect(service.dejarDeCompartir.mock.calls).toEqual([[7, 9]]);
    expect(service.dejarDeRecibir.mock.calls).toEqual([[7, 3]]);
    expect(controller.dejarDeCompartir.length).toBe(2);
    expect(controller.dejarDeRecibir.length).toBe(2);
  });
});

describe('CalendarSharesController — límite anti-spam de compartir (G05-C01, UI-16)', () => {
  const proto = CalendarSharesController.prototype;

  it('POST compartidos: 5 por minuto en el perfil short; es la única ruta del controller con límite propio', () => {
    expect(Reflect.getMetadata('THROTTLER:LIMITshort', proto.compartir)).toBe(5);
    expect(Reflect.getMetadata('THROTTLER:TTLshort', proto.compartir)).toBe(60000);
    for (const nombre of ['listar', 'dejarDeCompartir', 'dejarDeRecibir', 'agenda'] as const) {
      expect(Reflect.getMetadata('THROTTLER:LIMITshort', proto[nombre])).toBeUndefined();
      expect(Reflect.getMetadata('THROTTLER:TTLshort', proto[nombre])).toBeUndefined();
    }
    // Ninguna ruta se salta el limitador global.
    for (const nombre of HANDLERS) expect(Reflect.getMetadata('THROTTLER:SKIPshort', proto[nombre])).toBeUndefined();
    expect(Reflect.getMetadata('THROTTLER:SKIPshort', CalendarSharesController)).toBeUndefined();
  });

  it('el limitador que aplica ese decorador está registrado de verdad: ThrottlerGuard global y perfil "short" en AppModule', () => {
    // AppModule no se importa aquí (arrastra toda la app y su configuración): se lee su fuente, como security-rate-limiting.spec.
    const fuente = readFileSync(join(__dirname, '..', 'src', 'app.module.ts'), 'utf8');
    expect(fuente).toMatch(/ThrottlerModule\.forRoot\(\[[\s\S]*?name:\s*'short'/);
    expect(fuente).toMatch(/provide:\s*APP_GUARD,\s*useClass:\s*ThrottlerGuard/);
    expect(fuente).toMatch(/CalendarSharesModule/);
  });
});
