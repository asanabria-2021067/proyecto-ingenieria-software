import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { StartSprintDto } from '../src/sprints/dto/start-sprint.dto';
import { SPRINT_PLAN_MAX_DIAS } from '../src/sprints/dto/validators/is-within-sprint-planning-window.validator';

// Misma configuración que apps/backend/src/main.ts, para ejercer el
// comportamiento real de whitelist/forbidNonWhitelisted/transform.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

async function parse(plain: unknown): Promise<StartSprintDto> {
  const metadata: ArgumentMetadata = { type: 'body', metatype: StartSprintDto };
  return pipe.transform(plain, metadata);
}

async function mensajes(plain: unknown): Promise<string[]> {
  try {
    await parse(plain);
  } catch (error) {
    const response = (error as BadRequestException).getResponse() as { message: string[] };
    return response.message;
  }
  throw new Error('se esperaba un BadRequestException');
}

describe('StartSprintDto', () => {
  // Reloj fijo: 2026-10-03 12:00 en Guatemala (18:00Z). Hoy = 2026-10-03.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T18:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('acepta mañana y conserva la cadena YYYY-MM-DD sin transformarla', async () => {
    const dto = await parse({ fechaFinPlaneada: '2026-10-04' });
    expect(dto.fechaFinPlaneada).toBe('2026-10-04');
  });

  it(`acepta exactamente hoy + ${SPRINT_PLAN_MAX_DIAS} días`, async () => {
    const dto = await parse({ fechaFinPlaneada: '2027-01-01' });
    expect(dto.fechaFinPlaneada).toBe('2027-01-01');
  });

  it('rechaza el body sin fechaFinPlaneada: ya no es opcional', async () => {
    await expect(parse({})).rejects.toThrow(BadRequestException);
  });

  it('rechaza fechaFinPlaneada undefined explícito', async () => {
    await expect(parse({ fechaFinPlaneada: undefined })).rejects.toThrow(BadRequestException);
  });

  it('rechaza fechaFinPlaneada null', async () => {
    await expect(parse({ fechaFinPlaneada: null })).rejects.toThrow(BadRequestException);
  });

  it('rechaza hoy: el plan debe ser estrictamente posterior', async () => {
    await expect(parse({ fechaFinPlaneada: '2026-10-03' })).rejects.toThrow(BadRequestException);
  });

  it('rechaza una fecha pasada', async () => {
    await expect(parse({ fechaFinPlaneada: '2026-10-02' })).rejects.toThrow(BadRequestException);
  });

  it(`rechaza hoy + ${SPRINT_PLAN_MAX_DIAS + 1} días con el mensaje del tope`, async () => {
    expect(await mensajes({ fechaFinPlaneada: '2027-01-02' })).toEqual([
      'fechaFinPlaneada no puede superar los 90 días a partir de hoy',
    ]);
  });

  it('rechaza una fecha muy lejana', async () => {
    await expect(parse({ fechaFinPlaneada: '2999-01-01' })).rejects.toThrow(BadRequestException);
  });

  it.each([
    ['fecha inexistente', '2026-13-40'],
    ['día inexistente dentro del rango', '2026-11-31'],
    ['formato con barras', '10/10/2026'],
    ['ISO con hora', '2026-10-10T00:00:00.000Z'],
    ['cadena vacía', ''],
    ['número', 20261010],
  ])('rechaza %s', async (_caso, valor) => {
    await expect(parse({ fechaFinPlaneada: valor })).rejects.toThrow(BadRequestException);
  });

  it('rechaza fechaInicio: la fija el servidor y no pertenece al contrato', async () => {
    expect(await mensajes({ fechaFinPlaneada: '2026-10-10', fechaInicio: '2026-10-03' })).toEqual([
      'property fechaInicio should not exist',
    ]);
  });

  describe('el día de referencia es el de Guatemala, no el UTC', () => {
    it('a las 20:00 de Guatemala (02:00Z del día siguiente) hoy sigue siendo el día local', async () => {
      vi.setSystemTime(new Date('2026-10-04T02:00:00.000Z'));
      // En UTC ya es 4 de octubre; en Guatemala sigue siendo 3.
      const dto = await parse({ fechaFinPlaneada: '2026-10-04' });
      expect(dto.fechaFinPlaneada).toBe('2026-10-04');
      await expect(parse({ fechaFinPlaneada: '2026-10-03' })).rejects.toThrow(BadRequestException);
    });

    it('el tope de 90 días también se cuenta desde el día de Guatemala', async () => {
      vi.setSystemTime(new Date('2026-10-04T02:00:00.000Z'));
      await expect(parse({ fechaFinPlaneada: '2027-01-01' })).resolves.toBeDefined();
      await expect(parse({ fechaFinPlaneada: '2027-01-02' })).rejects.toThrow(BadRequestException);
    });
  });
});
