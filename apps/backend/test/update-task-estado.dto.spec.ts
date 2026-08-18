import { describe, expect, it } from 'vitest';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { EstadoTarea } from '@prisma/client';
import { UpdateTaskEstadoDto } from '../src/tasks/dto/update-task-estado.dto';

// Misma configuración que apps/backend/src/main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

async function parse(plain: unknown): Promise<UpdateTaskEstadoDto> {
  return pipe.transform(plain, { type: 'body', metatype: UpdateTaskEstadoDto } as ArgumentMetadata);
}

describe('UpdateTaskEstadoDto', () => {
  it.each(Object.values(EstadoTarea))('acepta el valor real del enum: %s', async (valor) => {
    const dto = await parse({ estadoTarea: valor });
    expect(dto.estadoTarea).toBe(valor);
  });

  it('rechaza un payload vacío', async () => {
    await expect(parse({})).rejects.toThrow(BadRequestException);
  });

  it('rechaza estadoTarea: undefined', async () => {
    await expect(parse({ estadoTarea: undefined })).rejects.toThrow(BadRequestException);
  });

  it('rechaza estadoTarea: null', async () => {
    await expect(parse({ estadoTarea: null })).rejects.toThrow(BadRequestException);
  });

  it('rechaza una cadena vacía', async () => {
    await expect(parse({ estadoTarea: '' })).rejects.toThrow(BadRequestException);
  });

  it('rechaza minúsculas ("hecho")', async () => {
    await expect(parse({ estadoTarea: 'hecho' })).rejects.toThrow(BadRequestException);
  });

  it('rechaza un valor con espacio en vez de guion bajo ("EN PROGRESO")', async () => {
    await expect(parse({ estadoTarea: 'EN PROGRESO' })).rejects.toThrow(BadRequestException);
  });

  it('rechaza un valor arbitrario fuera del enum ("COMPLETADA")', async () => {
    await expect(parse({ estadoTarea: 'COMPLETADA' })).rejects.toThrow(BadRequestException);
  });

  it('rechaza un número', async () => {
    await expect(parse({ estadoTarea: 1 })).rejects.toThrow(BadRequestException);
  });

  it('rechaza un booleano', async () => {
    await expect(parse({ estadoTarea: true })).rejects.toThrow(BadRequestException);
  });

  it('rechaza un array', async () => {
    await expect(parse({ estadoTarea: [] })).rejects.toThrow(BadRequestException);
  });

  it('rechaza un objeto', async () => {
    await expect(parse({ estadoTarea: {} })).rejects.toThrow(BadRequestException);
  });

  it('rechaza un valor válido acompañado de tituloTarea', async () => {
    await expect(
      parse({ estadoTarea: 'HECHO', tituloTarea: 'Cambio no permitido' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza un valor válido acompañado de idTarea', async () => {
    await expect(parse({ estadoTarea: 'HECHO', idTarea: 12 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza un campo interno como eliminadoEn', async () => {
    await expect(
      parse({ estadoTarea: 'HECHO', eliminadoEn: '2026-01-01' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('el objeto transformado solo conserva estadoTarea', async () => {
    const dto = await parse({ estadoTarea: 'EN_PROGRESO' });
    expect(Object.keys(dto)).toEqual(['estadoTarea']);
  });
});
