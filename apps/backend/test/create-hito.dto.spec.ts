import { describe, expect, it } from 'vitest';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateHitoDto } from '../src/projects/dto/create-hito.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

async function parse(plain: unknown): Promise<CreateHitoDto> {
  return pipe.transform(plain, { type: 'body', metatype: CreateHitoDto } as any);
}

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    tituloHito: 'Entrega de MVP',
    ...overrides,
  };
}

describe('CreateHitoDto', () => {
  it('acepta un título válido y lo recorta', async () => {
    const dto = await parse(basePayload({ tituloHito: '  Entrega de MVP  ' }));
    expect(dto.tituloHito).toBe('Entrega de MVP');
  });

  it('rechaza un título vacío después de trim', async () => {
    await expect(parse(basePayload({ tituloHito: '   ' }))).rejects.toThrow(BadRequestException);
  });

  it('rechaza un título mayor a 255 caracteres', async () => {
    await expect(parse(basePayload({ tituloHito: 'a'.repeat(256) }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza la ausencia de título', async () => {
    await expect(parse({})).rejects.toThrow(BadRequestException);
  });

  it('acepta descripcionHito opcional', async () => {
    const dto = await parse(basePayload({ descripcionHito: 'Detalles del hito' }));
    expect(dto.descripcionHito).toBe('Detalles del hito');
  });

  it('descripcionHito omitida queda undefined', async () => {
    const dto = await parse(basePayload());
    expect(dto.descripcionHito).toBeUndefined();
  });

  it('rechaza descripcionHito null explícito', async () => {
    await expect(parse(basePayload({ descripcionHito: null }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('acepta fechaLimite opcional en formato YYYY-MM-DD', async () => {
    const dto = await parse(basePayload({ fechaLimite: '2020-01-01' }));
    expect(dto.fechaLimite).toBe('2020-01-01');
  });

  it('acepta una fechaLimite en el pasado (no exige fecha futura)', async () => {
    const dto = await parse(basePayload({ fechaLimite: '2000-01-01' }));
    expect(dto.fechaLimite).toBe('2000-01-01');
  });

  it('rechaza fechaLimite con formato inválido', async () => {
    await expect(parse(basePayload({ fechaLimite: '01/01/2026' }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza estadoHito enviado por el cliente (no es whitelisteado)', async () => {
    await expect(
      parse(basePayload({ estadoHito: 'COMPLETADO' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza orden enviado por el cliente (no es whitelisteado)', async () => {
    await expect(parse(basePayload({ orden: 5 }))).rejects.toThrow(BadRequestException);
  });
});
