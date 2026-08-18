import { describe, expect, it } from 'vitest';
import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateLabelDto } from '../src/labels/dto/create-label.dto';
import { UpdateLabelDto } from '../src/labels/dto/update-label.dto';

// Misma configuración que apps/backend/src/main.ts, para ejercer el
// comportamiento real de whitelist/forbidNonWhitelisted/transform.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

async function parseCreate(plain: unknown): Promise<CreateLabelDto> {
  return pipe.transform(plain, { type: 'body', metatype: CreateLabelDto } as ArgumentMetadata);
}
async function parseUpdate(plain: unknown): Promise<UpdateLabelDto> {
  return pipe.transform(plain, { type: 'body', metatype: UpdateLabelDto } as ArgumentMetadata);
}

function basePayload(overrides: Record<string, unknown> = {}) {
  return { nombreEtiqueta: 'Backend', color: '#10B981', ...overrides };
}

describe('CreateLabelDto', () => {
  it('acepta nombre y color válidos', async () => {
    const dto = await parseCreate(basePayload());
    expect(dto.nombreEtiqueta).toBe('Backend');
    expect(dto.color).toBe('#10B981');
  });

  it('recorta espacios externos del nombre', async () => {
    const dto = await parseCreate(basePayload({ nombreEtiqueta: '   Diseño Frontend   ' }));
    expect(dto.nombreEtiqueta).toBe('Diseño Frontend');
  });

  it('conserva Unicode, mayúsculas/minúsculas y espacios interiores en el nombre visible (no lo normaliza)', async () => {
    const dto = await parseCreate(basePayload({ nombreEtiqueta: '  Diseño   UI  ' }));
    expect(dto.nombreEtiqueta).toBe('Diseño   UI');
  });

  it.each(['', ' ', '      ', '\t', '\n', ' \t \n '])(
    'rechaza un nombre vacío tras el trim (%j)',
    async (value) => {
      await expect(parseCreate(basePayload({ nombreEtiqueta: value }))).rejects.toThrow(
        BadRequestException,
      );
    },
  );

  it('rechaza un nombre numérico', async () => {
    await expect(parseCreate(basePayload({ nombreEtiqueta: 123 }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza un nombre objeto', async () => {
    await expect(parseCreate(basePayload({ nombreEtiqueta: { a: 1 } }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza un nombre array', async () => {
    await expect(parseCreate(basePayload({ nombreEtiqueta: ['a', 'b'] }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza un nombre mayor a 255 caracteres (Etiqueta.nombreEtiqueta es VarChar(255))', async () => {
    await expect(
      parseCreate(basePayload({ nombreEtiqueta: 'a'.repeat(256) })),
    ).rejects.toThrow(BadRequestException);
  });

  it('acepta un nombre de exactamente 255 caracteres', async () => {
    const dto = await parseCreate(basePayload({ nombreEtiqueta: 'a'.repeat(255) }));
    expect(dto.nombreEtiqueta).toHaveLength(255);
  });

  it.each(['#FFFFFF', '#000000', '#a1B2c3', '#12abEF'])(
    'acepta el color válido %s',
    async (color) => {
      const dto = await parseCreate(basePayload({ color }));
      expect(dto.color).toBe(color);
    },
  );

  it.each([
    'FFFFFF',
    '#FFF',
    '#FFFFFFFF',
    '#GGGGGG',
    '#12345',
    '#1234567',
    ' #123456',
    '#123456 ',
    ' #123456 ',
    '',
  ])('rechaza el color inválido %j', async (color) => {
    await expect(parseCreate(basePayload({ color }))).rejects.toThrow(BadRequestException);
  });

  it('rechaza color: null', async () => {
    await expect(parseCreate(basePayload({ color: null }))).rejects.toThrow(BadRequestException);
  });

  it('rechaza un color numérico', async () => {
    await expect(parseCreate(basePayload({ color: 123456 }))).rejects.toThrow(BadRequestException);
  });

  it('rechaza un color objeto', async () => {
    await expect(parseCreate(basePayload({ color: {} }))).rejects.toThrow(BadRequestException);
  });

  it('rechaza un color array', async () => {
    await expect(parseCreate(basePayload({ color: [] }))).rejects.toThrow(BadRequestException);
  });

  it('no recorta el color automáticamente (un color válido con espacios sigue siendo inválido)', async () => {
    await expect(parseCreate(basePayload({ color: ' #10B981 ' }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza la ausencia de nombreEtiqueta', async () => {
    const { nombreEtiqueta: _omit, ...rest } = basePayload();
    await expect(parseCreate(rest)).rejects.toThrow(BadRequestException);
  });

  it('rechaza la ausencia de color', async () => {
    const { color: _omit, ...rest } = basePayload();
    await expect(parseCreate(rest)).rejects.toThrow(BadRequestException);
  });

  it('rechaza propiedades desconocidas vía whitelist + forbidNonWhitelisted', async () => {
    await expect(parseCreate(basePayload({ campoDesconocido: 'x' }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza el intento de enviar nombreNormalizado (campo interno, no expuesto en el DTO)', async () => {
    await expect(
      parseCreate(basePayload({ nombreNormalizado: 'backend' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza el intento de enviar idProyecto (se contextualiza por ruta, no por body)', async () => {
    await expect(parseCreate(basePayload({ idProyecto: 1 }))).rejects.toThrow(BadRequestException);
  });

  it('rechaza el intento de enviar idEtiqueta', async () => {
    await expect(parseCreate(basePayload({ idEtiqueta: 1 }))).rejects.toThrow(BadRequestException);
  });

  it('rechaza el intento de enviar eliminadoEn', async () => {
    await expect(
      parseCreate(basePayload({ eliminadoEn: new Date().toISOString() })),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('UpdateLabelDto', () => {
  it('acepta un payload completamente vacío (sin regla de "no vacío" en esta fase; mismo comportamiento que UpdateTaskDto)', async () => {
    const dto = await parseUpdate({});
    expect(dto).toEqual({});
  });

  it('acepta solo nombreEtiqueta', async () => {
    const dto = await parseUpdate({ nombreEtiqueta: 'Nuevo nombre' });
    expect(dto.nombreEtiqueta).toBe('Nuevo nombre');
    expect(dto.color).toBeUndefined();
  });

  it('acepta solo color', async () => {
    const dto = await parseUpdate({ color: '#123456' });
    expect(dto.color).toBe('#123456');
    expect(dto.nombreEtiqueta).toBeUndefined();
  });

  it('acepta ambos campos a la vez', async () => {
    const dto = await parseUpdate({ nombreEtiqueta: 'X', color: '#ABCDEF' });
    expect(dto.nombreEtiqueta).toBe('X');
    expect(dto.color).toBe('#ABCDEF');
  });

  it('recorta nombreEtiqueta cuando se envía', async () => {
    const dto = await parseUpdate({ nombreEtiqueta: '   Recortado   ' });
    expect(dto.nombreEtiqueta).toBe('Recortado');
  });

  it.each(['', ' ', '   '])('rechaza nombreEtiqueta vacío tras el trim (%j)', async (value) => {
    await expect(parseUpdate({ nombreEtiqueta: value })).rejects.toThrow(BadRequestException);
  });

  it('rechaza nombreEtiqueta: null', async () => {
    await expect(parseUpdate({ nombreEtiqueta: null })).rejects.toThrow(BadRequestException);
  });

  it('rechaza un color inválido cuando se envía', async () => {
    await expect(parseUpdate({ color: '#FFF' })).rejects.toThrow(BadRequestException);
  });

  it('rechaza color: null', async () => {
    await expect(parseUpdate({ color: null })).rejects.toThrow(BadRequestException);
  });

  it('rechaza propiedades desconocidas', async () => {
    await expect(parseUpdate({ campoDesconocido: 'x' })).rejects.toThrow(BadRequestException);
  });

  it('rechaza campos internos: idProyecto, idEtiqueta, nombreNormalizado', async () => {
    await expect(parseUpdate({ idProyecto: 1 })).rejects.toThrow(BadRequestException);
    await expect(parseUpdate({ idEtiqueta: 1 })).rejects.toThrow(BadRequestException);
    await expect(parseUpdate({ nombreNormalizado: 'x' })).rejects.toThrow(BadRequestException);
  });

  it('no recorta el color automáticamente en edición', async () => {
    await expect(parseUpdate({ color: ' #123456' })).rejects.toThrow(BadRequestException);
  });
});
