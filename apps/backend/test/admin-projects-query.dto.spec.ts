import { describe, expect, it } from 'vitest';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { ADMIN_PROJECT_GROUPS, AdminProjectsQueryDto } from '../src/project-closure/dto/admin-projects-query.dto';

/**
 * GPI01-C10 (H-07). `grupo` se validaba con `@IsEnum` sobre un arreglo:
 * class-validator arma la lista del mensaje con las claves no numéricas del
 * «enum», y un arreglo no tiene ninguna, así que el 400 decía
 * «grupo must be one of the following values: » sin valores. El contrato no
 * cambia (mismo 400, `grupo` sigue siendo obligatorio); solo el mensaje, que
 * ahora es estable, en español y enumera los grupos reales.
 */

// Misma configuración que apps/backend/src/main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const parse = (query: unknown): Promise<AdminProjectsQueryDto> =>
  pipe.transform(query, { type: 'query', metatype: AdminProjectsQueryDto } as ArgumentMetadata);

async function mensajes(query: unknown): Promise<string[]> {
  try {
    await parse(query);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { message: string[] }).message;
  }
  throw new Error('la consulta debía rechazarse');
}

const MENSAJE = 'grupo debe ser uno de: activos, revision, cierres, cerrados';

describe('GPI01-C10: AdminProjectsQueryDto', () => {
  it('el mensaje enumera exactamente los grupos del contrato', () => {
    expect(MENSAJE).toBe(`grupo debe ser uno de: ${ADMIN_PROJECT_GROUPS.join(', ')}`);
  });

  it.each(ADMIN_PROJECT_GROUPS)('acepta el grupo %s', async (grupo) => {
    expect((await parse({ grupo })).grupo).toBe(grupo);
  });

  it.each([
    ['ausente', {}],
    ['vacío', { grupo: '' }],
    ['desconocido', { grupo: 'todos' }],
    ['con otra capitalización', { grupo: 'Activos' }],
    ['repetido (llega como arreglo)', { grupo: ['activos', 'cerrados'] }],
  ])('grupo %s: 400 con el mensaje en español y la lista de valores', async (_caso, query) => {
    expect(await mensajes(query)).toEqual([MENSAJE]);
  });

  it('el mensaje nunca vuelve a quedar sin valores ni en inglés', async () => {
    const [mensaje] = await mensajes({});
    expect(mensaje).not.toMatch(/must be one of|following values/);
    expect(mensaje).not.toMatch(/:\s*$/);
  });

  it('la paginación conserva su validación', async () => {
    expect((await parse({ grupo: 'activos', page: '2', limit: '50' }))).toMatchObject({ page: 2, limit: 50 });
    await expect(parse({ grupo: 'activos', limit: '51' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(parse({ grupo: 'activos', page: '0' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(parse({ grupo: 'activos', otro: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
