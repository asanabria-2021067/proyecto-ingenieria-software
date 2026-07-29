import { describe, expect, it } from 'vitest';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateTaskDto } from '../src/tasks/dto/create-task.dto';

// Misma configuración que apps/backend/src/main.ts, para ejercer el
// comportamiento real de whitelist/forbidNonWhitelisted/transform.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

async function parse(plain: unknown): Promise<CreateTaskDto> {
  return pipe.transform(plain, { type: 'body', metatype: CreateTaskDto } as any);
}

function todayInGuatemala(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function shiftDate(base: string, days: number): string {
  const [y, m, d] = base.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const TODAY = todayInGuatemala();
const TOMORROW = shiftDate(TODAY, 1);
const YESTERDAY = shiftDate(TODAY, -1);

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    tituloTarea: 'Implementar login',
    fechaLimite: TOMORROW,
    prioridad: 'MEDIA',
    ...overrides,
  };
}

describe('CreateTaskDto', () => {
  it('acepta un título válido y lo recorta', async () => {
    const dto = await parse(basePayload({ tituloTarea: '  Implementar login  ' }));
    expect(dto.tituloTarea).toBe('Implementar login');
  });

  it('rechaza un título vacío después de trim', async () => {
    await expect(parse(basePayload({ tituloTarea: '   ' }))).rejects.toThrow(BadRequestException);
  });

  it('rechaza un título mayor a 150 caracteres', async () => {
    await expect(parse(basePayload({ tituloTarea: 'a'.repeat(151) }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza tituloTarea que no sea string', async () => {
    await expect(parse(basePayload({ tituloTarea: 123 }))).rejects.toThrow(BadRequestException);
  });

  it('rechaza una descripción mayor a 5000 caracteres', async () => {
    await expect(
      parse(basePayload({ descripcionTarea: 'a'.repeat(5001) })),
    ).rejects.toThrow(BadRequestException);
  });

  it('acepta descripcionTarea ausente y una cadena vacía', async () => {
    const dto = await parse(basePayload({ descripcionTarea: '' }));
    expect(dto.descripcionTarea).toBe('');
  });

  it('acepta una fecha futura válida', async () => {
    const dto = await parse(basePayload({ fechaLimite: TOMORROW }));
    expect(dto.fechaLimite).toBe(TOMORROW);
  });

  it('rechaza la fecha de hoy', async () => {
    await expect(parse(basePayload({ fechaLimite: TODAY }))).rejects.toThrow(BadRequestException);
  });

  it('rechaza una fecha pasada', async () => {
    await expect(parse(basePayload({ fechaLimite: YESTERDAY }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza una fecha calendario imposible (2026-02-30)', async () => {
    await expect(parse(basePayload({ fechaLimite: '2026-02-30' }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza un mes imposible (2026-13-01)', async () => {
    await expect(parse(basePayload({ fechaLimite: '2026-13-01' }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza un timestamp ISO completo', async () => {
    await expect(
      parse(basePayload({ fechaLimite: `${TOMORROW}T10:00:00.000Z` })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza un formato de fecha no soportado (DD/MM/YYYY)', async () => {
    await expect(parse(basePayload({ fechaLimite: '01/12/2026' }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('acepta una prioridad válida', async () => {
    const dto = await parse(basePayload({ prioridad: 'ALTA' }));
    expect(dto.prioridad).toBe('ALTA');
  });

  it('rechaza una prioridad fuera del enum', async () => {
    await expect(parse(basePayload({ prioridad: 'URGENTISIMA' }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza la ausencia de prioridad', async () => {
    const { prioridad: _omit, ...rest } = basePayload();
    await expect(parse(rest)).rejects.toThrow(BadRequestException);
  });

  it.each([1, 1000])('acepta tiempoEstimadoHoras en el límite válido (%d)', async (value) => {
    const dto = await parse(basePayload({ tiempoEstimadoHoras: value }));
    expect(dto.tiempoEstimadoHoras).toBe(value);
  });

  it.each([0, 1001, -5, 4.5, NaN, Infinity])(
    'rechaza tiempoEstimadoHoras inválido (%s)',
    async (value) => {
      await expect(parse(basePayload({ tiempoEstimadoHoras: value }))).rejects.toThrow(
        BadRequestException,
      );
    },
  );

  it.each(['idHito', 'idRolProyecto', 'idUsuarioAsignado'])(
    'acepta %s como entero positivo',
    async (field) => {
      const dto: any = await parse(basePayload({ [field]: 3 }));
      expect(dto[field]).toBe(3);
    },
  );

  it.each(['idHito', 'idRolProyecto', 'idUsuarioAsignado'])(
    'rechaza %s cero o negativo',
    async (field) => {
      await expect(parse(basePayload({ [field]: 0 }))).rejects.toThrow(BadRequestException);
      await expect(parse(basePayload({ [field]: -1 }))).rejects.toThrow(BadRequestException);
    },
  );

  it('acepta idsEtiquetas con valores únicos, incluido un arreglo vacío', async () => {
    const dto = await parse(basePayload({ idsEtiquetas: [1, 2, 3] }));
    expect(dto.idsEtiquetas).toEqual([1, 2, 3]);

    const dtoVacio = await parse(basePayload({ idsEtiquetas: [] }));
    expect(dtoVacio.idsEtiquetas).toEqual([]);
  });

  it('rechaza idsEtiquetas con valores duplicados', async () => {
    await expect(parse(basePayload({ idsEtiquetas: [1, 2, 1] }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza una etiqueta individual fuera de un arreglo', async () => {
    await expect(parse(basePayload({ idsEtiquetas: 1 }))).rejects.toThrow(BadRequestException);
  });

  it('rechaza campos internos/desconocidos vía whitelist + forbidNonWhitelisted', async () => {
    await expect(
      parse(basePayload({ idTarea: 99, estadoTarea: 'HECHO', creadaPor: 1 })),
    ).rejects.toThrow(BadRequestException);
  });

  describe('rechazo explícito de null (Tarea 11.B)', () => {
    it('rechaza descripcionTarea: null', async () => {
      await expect(parse(basePayload({ descripcionTarea: null }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechaza tiempoEstimadoHoras: null', async () => {
      await expect(parse(basePayload({ tiempoEstimadoHoras: null }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechaza idHito: null', async () => {
      await expect(parse(basePayload({ idHito: null }))).rejects.toThrow(BadRequestException);
    });

    it('rechaza idRolProyecto: null', async () => {
      await expect(parse(basePayload({ idRolProyecto: null }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechaza idUsuarioAsignado: null', async () => {
      await expect(parse(basePayload({ idUsuarioAsignado: null }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechaza idsEtiquetas: null', async () => {
      await expect(parse(basePayload({ idsEtiquetas: null }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechaza tituloTarea: null (campo obligatorio)', async () => {
      const { tituloTarea: _omit, ...rest } = basePayload();
      await expect(parse({ ...rest, tituloTarea: null })).rejects.toThrow(BadRequestException);
    });

    it('rechaza fechaLimite: null (campo obligatorio)', async () => {
      const { fechaLimite: _omit, ...rest } = basePayload();
      await expect(parse({ ...rest, fechaLimite: null })).rejects.toThrow(BadRequestException);
    });

    it('rechaza prioridad: null (campo obligatorio)', async () => {
      const { prioridad: _omit, ...rest } = basePayload();
      await expect(parse({ ...rest, prioridad: null })).rejects.toThrow(BadRequestException);
    });

    it('sigue aceptando la omisión completa de los campos opcionales', async () => {
      const dto = await parse(basePayload());
      expect(dto.descripcionTarea).toBeUndefined();
      expect(dto.tiempoEstimadoHoras).toBeUndefined();
      expect(dto.idHito).toBeUndefined();
      expect(dto.idRolProyecto).toBeUndefined();
      expect(dto.idUsuarioAsignado).toBeUndefined();
      expect(dto.idsEtiquetas).toBeUndefined();
    });
  });
});
