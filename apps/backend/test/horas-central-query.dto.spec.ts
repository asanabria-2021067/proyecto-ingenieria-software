import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ValidationPipe } from '@nestjs/common';
import { HorasCentralQueryDto } from '../src/horas-semestre/dto/horas-central-query.dto';

// esbuild no emite design:type; se agrega como lo hace tsc para reproducir el bug de produccion
Reflect.defineMetadata('design:type', Boolean, HorasCentralQueryDto.prototype, 'enRiesgo');

describe('HorasCentralQueryDto', () => {
  const pipe = new ValidationPipe({ transform: true, transformOptions: { enableImplicitConversion: true } });
  const parse = (enRiesgo: string) =>
    pipe.transform({ enRiesgo }, { type: 'query', metatype: HorasCentralQueryDto }) as Promise<HorasCentralQueryDto>;

  it('enRiesgo=false es false y enRiesgo=true es true', async () => {
    expect((await parse('false')).enRiesgo).toBe(false);
    expect((await parse('true')).enRiesgo).toBe(true);
  });
});
