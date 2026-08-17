import { describe, expect, it } from 'vitest';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AdjustRecognizedHoursDto } from '../src/sprints/dto/adjust-recognized-hours.dto';

// Misma configuración que apps/backend/src/main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

async function parse(plain: unknown): Promise<AdjustRecognizedHoursDto> {
  return pipe.transform(plain, { type: 'body', metatype: AdjustRecognizedHoursDto } as any);
}

describe('AdjustRecognizedHoursDto', () => {
  it('acepta horasAprobadas: 0', async () => {
    const dto = await parse({ horasAprobadas: 0 });
    expect(dto.horasAprobadas).toBe(0);
  });

  it('acepta un entero positivo', async () => {
    const dto = await parse({ horasAprobadas: 12 });
    expect(dto.horasAprobadas).toBe(12);
  });

  it('acepta hasta 2 decimales', async () => {
    const dto = await parse({ horasAprobadas: 12.34 });
    expect(dto.horasAprobadas).toBe(12.34);
  });

  it('acepta justificacionAjuste y la recorta (trim)', async () => {
    const dto = await parse({ horasAprobadas: 5, justificacionAjuste: '  motivo válido  ' });
    expect(dto.justificacionAjuste).toBe('motivo válido');
  });

  it('rechaza un payload vacío', async () => {
    await expect(parse({})).rejects.toThrow(BadRequestException);
  });

  it('rechaza horasAprobadas negativo', async () => {
    await expect(parse({ horasAprobadas: -1 })).rejects.toThrow(BadRequestException);
  });

  it('rechaza horasAprobadas con más de 2 decimales', async () => {
    await expect(parse({ horasAprobadas: 12.345 })).rejects.toThrow(BadRequestException);
  });

  it('rechaza horasAprobadas: NaN', async () => {
    await expect(parse({ horasAprobadas: NaN })).rejects.toThrow(BadRequestException);
  });

  it('rechaza horasAprobadas: Infinity', async () => {
    await expect(parse({ horasAprobadas: Infinity })).rejects.toThrow(BadRequestException);
  });

  it('rechaza horasAprobadas: undefined', async () => {
    await expect(parse({ horasAprobadas: undefined })).rejects.toThrow(BadRequestException);
  });

  it('rechaza horasAprobadas: null', async () => {
    await expect(parse({ horasAprobadas: null })).rejects.toThrow(BadRequestException);
  });

  it('rechaza una cadena numérica (mismo comportamiento documentado que AssignTaskDto en este entorno)', async () => {
    await expect(parse({ horasAprobadas: '12' })).rejects.toThrow(BadRequestException);
  });

  it('rechaza justificacionAjuste que no sea string', async () => {
    await expect(parse({ horasAprobadas: 5, justificacionAjuste: 123 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza un campo desconocido', async () => {
    await expect(parse({ horasAprobadas: 5, extra: 'no permitido' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
