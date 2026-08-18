import { describe, expect, it } from 'vitest';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AssignTaskDto } from '../src/tasks/dto/assign-task.dto';

// Misma configuración que apps/backend/src/main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

async function parse(plain: unknown): Promise<AssignTaskDto> {
  return pipe.transform(plain, { type: 'body', metatype: AssignTaskDto });
}

describe('AssignTaskDto', () => {
  it('acepta idUsuario: 1', async () => {
    const dto = await parse({ idUsuario: 1 });
    expect(dto.idUsuario).toBe(1);
  });

  it('acepta un entero positivo mayor', async () => {
    const dto = await parse({ idUsuario: 42 });
    expect(dto.idUsuario).toBe(42);
    expect(typeof dto.idUsuario).toBe('number');
  });

  // Hallazgo documentado: bajo este entorno de pruebas (vitest, transform
  // esbuild vía Vite) `emitDecoratorMetadata` de TypeScript no se emite
  // (limitación conocida de esbuild), por lo que `enableImplicitConversion`
  // no puede inferir el tipo de destino (`design:type`) para convertir una
  // cadena numérica a `number`. El resultado real, verificado aquí, es que
  // la cadena se rechaza porque `@IsInt()` exige `typeof value === 'number'`.
  // El build real de producción (`nest build`, tsc con
  // `emitDecoratorMetadata: true`) puede comportarse distinto; esta prueba
  // documenta el comportamiento verificable en el entorno de pruebas real
  // del proyecto, no una suposición.
  it('NO convierte una cadena numérica en este entorno de pruebas (esbuild sin emitDecoratorMetadata)', async () => {
    await expect(parse({ idUsuario: '12' })).rejects.toThrow(BadRequestException);
  });

  it('rechaza un payload vacío', async () => {
    await expect(parse({})).rejects.toThrow(BadRequestException);
  });

  it('rechaza idUsuario: undefined', async () => {
    await expect(parse({ idUsuario: undefined })).rejects.toThrow(BadRequestException);
  });

  it('rechaza idUsuario: null', async () => {
    await expect(parse({ idUsuario: null })).rejects.toThrow(BadRequestException);
  });

  it('rechaza 0', async () => {
    await expect(parse({ idUsuario: 0 })).rejects.toThrow(BadRequestException);
  });

  it('rechaza negativos', async () => {
    await expect(parse({ idUsuario: -1 })).rejects.toThrow(BadRequestException);
  });

  it('rechaza decimales', async () => {
    await expect(parse({ idUsuario: 1.5 })).rejects.toThrow(BadRequestException);
  });

  it('rechaza NaN', async () => {
    await expect(parse({ idUsuario: NaN })).rejects.toThrow(BadRequestException);
  });

  it('rechaza Infinity', async () => {
    await expect(parse({ idUsuario: Infinity })).rejects.toThrow(BadRequestException);
  });

  it('rechaza una cadena vacía', async () => {
    await expect(parse({ idUsuario: '' })).rejects.toThrow(BadRequestException);
  });

  it('rechaza una cadena con letras', async () => {
    await expect(parse({ idUsuario: 'abc' })).rejects.toThrow(BadRequestException);
  });

  it('rechaza una cadena parcialmente numérica ("12abc")', async () => {
    await expect(parse({ idUsuario: '12abc' })).rejects.toThrow(BadRequestException);
  });

  it('rechaza un booleano', async () => {
    await expect(parse({ idUsuario: true })).rejects.toThrow(BadRequestException);
  });

  it('rechaza un array', async () => {
    await expect(parse({ idUsuario: [1] })).rejects.toThrow(BadRequestException);
  });

  it('rechaza un objeto', async () => {
    await expect(parse({ idUsuario: { id: 1 } })).rejects.toThrow(BadRequestException);
  });

  it('rechaza un ID válido acompañado de un campo desconocido', async () => {
    await expect(parse({ idUsuario: 4, extra: 'no permitido' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza un ID válido acompañado de idTarea', async () => {
    await expect(parse({ idUsuario: 4, idTarea: 12 })).rejects.toThrow(BadRequestException);
  });

  it('rechaza un ID válido acompañado de estadoTarea', async () => {
    await expect(parse({ idUsuario: 4, estadoTarea: 'EN_PROGRESO' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza un ID válido acompañado de idRolProyecto', async () => {
    await expect(parse({ idUsuario: 4, idRolProyecto: 2 })).rejects.toThrow(BadRequestException);
  });
});
