import { ValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  TRANSICIONES_PERMITIDAS,
  UpdateEstadoProyectoDto,
} from '../src/projects/dto/update-estado-proyecto.dto';

// Mismo ValidationPipe que main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const meta: ArgumentMetadata = { type: 'body', metatype: UpdateEstadoProyectoDto };

describe('UpdateEstadoProyectoDto - el líder no puede publicar', () => {
  it('rechaza nuevoEstado=PUBLICADO con 400', async () => {
    await expect(pipe.transform({ nuevoEstado: 'PUBLICADO' }, meta)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('rechaza CERRADO y valores desconocidos', async () => {
    await expect(pipe.transform({ nuevoEstado: 'CERRADO' }, meta)).rejects.toMatchObject({ status: 400 });
    await expect(pipe.transform({ nuevoEstado: 'x' }, meta)).rejects.toMatchObject({ status: 400 });
  });

  it('acepta EN_PROGRESO', async () => {
    await expect(pipe.transform({ nuevoEstado: 'EN_PROGRESO' }, meta)).resolves.toMatchObject({
      nuevoEstado: 'EN_PROGRESO',
    });
  });

  it('BORRADOR no tiene transiciones del líder; PUBLICADO solo a EN_PROGRESO', () => {
    expect(TRANSICIONES_PERMITIDAS.BORRADOR).toEqual([]);
    expect(TRANSICIONES_PERMITIDAS.PUBLICADO).toEqual(['EN_PROGRESO']);
  });
});
