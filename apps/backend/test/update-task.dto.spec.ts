import { describe, expect, it } from 'vitest';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateTaskDto } from '../src/tasks/dto/update-task.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

async function parse(plain: unknown): Promise<UpdateTaskDto> {
  return pipe.transform(plain, { type: 'body', metatype: UpdateTaskDto } as any);
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

describe('UpdateTaskDto', () => {
  it('acepta un payload sin fechaLimite sin intentar validarla', async () => {
    const dto = await parse({ descripcionTarea: 'Nueva descripción' });
    expect(dto.fechaLimite).toBeUndefined();
    expect(dto.descripcionTarea).toBe('Nueva descripción');
  });

  it('acepta un payload completamente vacío', async () => {
    const dto = await parse({});
    expect(dto).toEqual({});
  });

  it('acepta fechaLimite futura cuando se envía', async () => {
    const dto = await parse({ fechaLimite: TOMORROW });
    expect(dto.fechaLimite).toBe(TOMORROW);
  });

  it('rechaza fechaLimite pasada cuando se envía', async () => {
    await expect(parse({ fechaLimite: YESTERDAY })).rejects.toThrow(BadRequestException);
  });

  it('rechaza fechaLimite de hoy cuando se envía', async () => {
    await expect(parse({ fechaLimite: TODAY })).rejects.toThrow(BadRequestException);
  });

  it('recorta tituloTarea cuando se envía', async () => {
    const dto = await parse({ tituloTarea: '  Nuevo título  ' });
    expect(dto.tituloTarea).toBe('Nuevo título');
  });

  it('rechaza tituloTarea vacío después de trim', async () => {
    await expect(parse({ tituloTarea: '   ' })).rejects.toThrow(BadRequestException);
  });

  it('acepta idHito: null para retirar la relación', async () => {
    const dto = await parse({ idHito: null });
    expect(dto.idHito).toBeNull();
  });

  it('acepta idRolProyecto: null para retirar la relación', async () => {
    const dto = await parse({ idRolProyecto: null });
    expect(dto.idRolProyecto).toBeNull();
  });

  it('valida idHito como entero positivo cuando no es null', async () => {
    await expect(parse({ idHito: 0 })).rejects.toThrow(BadRequestException);
    await expect(parse({ idHito: -1 })).rejects.toThrow(BadRequestException);
    const dto = await parse({ idHito: 4 });
    expect(dto.idHito).toBe(4);
  });

  it('acepta idsEtiquetas: [] para representar la eliminación de todas las asociaciones', async () => {
    const dto = await parse({ idsEtiquetas: [] });
    expect(dto.idsEtiquetas).toEqual([]);
  });

  it('rechaza idsEtiquetas con duplicados', async () => {
    await expect(parse({ idsEtiquetas: [2, 2] })).rejects.toThrow(BadRequestException);
  });

  it('no admite idUsuarioAsignado: se rechaza como campo desconocido', async () => {
    await expect(parse({ idUsuarioAsignado: 5 })).rejects.toThrow(BadRequestException);
  });

  it('rechaza campos internos/desconocidos vía whitelist + forbidNonWhitelisted', async () => {
    await expect(parse({ idTarea: 1, estadoTarea: 'HECHO' })).rejects.toThrow(
      BadRequestException,
    );
  });

  describe('null explícito: solo idHito/idRolProyecto lo admiten (Tarea 11.B)', () => {
    it('acepta un payload vacío {}', async () => {
      const dto = await parse({});
      expect(dto).toEqual({});
    });

    it('rechaza tituloTarea: null', async () => {
      await expect(parse({ tituloTarea: null })).rejects.toThrow(BadRequestException);
    });

    it('rechaza descripcionTarea: null', async () => {
      await expect(parse({ descripcionTarea: null })).rejects.toThrow(BadRequestException);
    });

    it('rechaza fechaLimite: null', async () => {
      await expect(parse({ fechaLimite: null })).rejects.toThrow(BadRequestException);
    });

    it('rechaza prioridad: null', async () => {
      await expect(parse({ prioridad: null })).rejects.toThrow(BadRequestException);
    });

    it('rechaza tiempoEstimadoHoras: null', async () => {
      await expect(parse({ tiempoEstimadoHoras: null })).rejects.toThrow(BadRequestException);
    });

    it('rechaza idsEtiquetas: null', async () => {
      await expect(parse({ idsEtiquetas: null })).rejects.toThrow(BadRequestException);
    });

    it('sigue rechazando idUsuarioAsignado: 1 como campo desconocido', async () => {
      await expect(parse({ idUsuarioAsignado: 1 })).rejects.toThrow(BadRequestException);
    });
  });
});
