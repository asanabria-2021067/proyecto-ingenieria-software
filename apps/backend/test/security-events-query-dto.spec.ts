import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { ListSecurityEventsQueryDto } from '../src/security-events/dto/list-security-events-query.dto';
import { TipoEventoSeguridad } from '../src/security-events/tipos-evento-seguridad';

/**
 * FG01-C01 (T-310). Contrato de la consulta del visor de eventos de seguridad,
 * validado con el mismo ValidationPipe que sirve la API.
 */

// Misma configuración que apps/backend/src/main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const parse = (query: unknown): Promise<ListSecurityEventsQueryDto> =>
  pipe.transform(query, { type: 'query', metatype: ListSecurityEventsQueryDto } as ArgumentMetadata);

async function mensajes(query: unknown): Promise<string[]> {
  try {
    await parse(query);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { message: string[] }).message;
  }
  throw new Error('la consulta debía rechazarse');
}

describe('FG01-C01: ListSecurityEventsQueryDto', () => {
  it('sin parámetros aplica page=1 y limit=20', async () => {
    const dto = await parse({});
    expect(dto).toBeInstanceOf(ListSecurityEventsQueryDto);
    expect(dto).toEqual({ page: 1, limit: 20 });
  });

  it.each(TipoEventoSeguridad.VALORES)('acepta el tipo %s del catálogo', async (tipo) => {
    expect((await parse({ tipo })).tipo).toBe(tipo);
  });

  it('convierte los parámetros numéricos que llegan como texto', async () => {
    const dto = await parse({ idUsuario: '42', page: '3', limit: '50' });
    expect(dto).toMatchObject({ idUsuario: 42, page: 3, limit: 50 });
  });

  it.each([
    ['UTC', '2026-10-11T06:00:00Z'],
    ['UTC con milisegundos', '2026-10-11T06:00:00.000Z'],
    ['desplazamiento de Guatemala', '2026-10-11T00:00:00-06:00'],
    ['desplazamiento positivo', '2026-10-11T08:00:00+02:00'],
  ])('acepta una fecha con zona (%s) y todas señalan el mismo instante', async (_nombre, desde) => {
    const dto = await parse({ desde });
    expect(new Date(dto.desde as string).toISOString()).toBe('2026-10-11T06:00:00.000Z');
  });

  it('acepta desde igual a hasta y un rango ordenado entre zonas distintas', async () => {
    await expect(parse({ desde: '2026-10-11T00:00:00-06:00', hasta: '2026-10-11T06:00:00Z' })).resolves.toBeDefined();
    await expect(parse({ desde: '2026-10-01T00:00:00-06:00', hasta: '2026-10-11T23:59:59.999-06:00' })).resolves.toBeDefined();
  });

  it('rechaza un rango invertido, también cuando solo lo es al comparar instantes', async () => {
    expect(await mensajes({ desde: '2026-10-12T00:00:00Z', hasta: '2026-10-11T00:00:00Z' })).toEqual([
      'hasta no puede ser anterior a desde',
    ]);
    // 05:00Z es anterior a 00:00-06:00 (06:00Z) aunque el texto ordene al revés.
    expect(await mensajes({ desde: '2026-10-11T00:00:00-06:00', hasta: '2026-10-11T05:00:00Z' })).toEqual([
      'hasta no puede ser anterior a desde',
    ]);
  });

  it.each([
    ['sin zona horaria', '2026-10-11T00:00:00'],
    ['solo fecha', '2026-10-11'],
    ['fecha imposible', '2026-02-30T00:00:00Z'],
    ['texto libre', 'ayer'],
    ['marca de tiempo numérica', '1791700000000'],
    ['vacía', ''],
    ['inyección', "2026-10-11T00:00:00Z' OR '1'='1"],
  ])('rechaza desde y hasta cuando la fecha es %s', async (_nombre, fecha) => {
    expect(await mensajes({ desde: fecha })).toContain(
      'desde debe ser una fecha ISO 8601 con zona horaria (por ejemplo 2026-10-11T00:00:00-06:00)',
    );
    expect(await mensajes({ hasta: fecha })).toContain(
      'hasta debe ser una fecha ISO 8601 con zona horaria (por ejemplo 2026-10-11T00:00:00-06:00)',
    );
  });

  it.each([
    ['desconocido', 'LOGIN'],
    ['en minúsculas', 'login_failed'],
    ['evento funcional de proyecto', 'TASK_CREATED'],
    ['vacío', ''],
    ['inyección', "LOGIN_FAILED' OR 1=1 --"],
    ['arreglo', ['LOGIN_FAILED', 'ACCOUNT_LOCKED']],
    ['objeto', { in: ['LOGIN_FAILED'] }],
  ])('rechaza un tipo %s enumerando el catálogo real', async (_nombre, tipo) => {
    expect(await mensajes({ tipo })).toEqual([
      'tipo debe ser uno de: LOGIN_FAILED, LOGIN_SUCCEEDED, ACCOUNT_LOCKED, PASSWORD_RESET_ISSUED, PASSWORD_RESET_COMPLETED, USER_STATUS_CHANGED',
    ]);
  });

  it.each([
    ['page', '0'],
    ['page', '-1'],
    ['page', '1.5'],
    ['page', 'abc'],
    ['page', ''],
    ['limit', '0'],
    ['limit', '51'],
    ['limit', '500'],
    ['limit', 'NaN'],
    ['limit', '10; DROP TABLE bitacora_auditoria'],
    ['idUsuario', '0'],
    ['idUsuario', '-7'],
    ['idUsuario', '7.2'],
    ['idUsuario', '2147483648'],
    ['idUsuario', 'NaN'],
    ['idUsuario', '1 OR 1=1'],
  ])('rechaza %s=%j', async (campo, valor) => {
    const errores = await mensajes({ [campo]: valor });
    expect(errores.length).toBeGreaterThan(0);
    expect(errores.every((mensaje) => mensaje.startsWith(campo))).toBe(true);
  });

  it.each(['accion', 'tipoObjeto', 'detalleJson', 'idObjeto', 'orderBy', 'where', 'offset', 'search'])(
    'rechaza la clave inesperada %s',
    async (clave) => {
      expect(await mensajes({ [clave]: 'x' })).toEqual([`property ${clave} should not exist`]);
    },
  );
});
