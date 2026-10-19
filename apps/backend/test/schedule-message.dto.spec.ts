import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ScheduleMessageDto } from '../src/chat/dto/schedule-message.dto';

const errores = (plain: object) => validate(plainToInstance(ScheduleMessageDto, plain));

describe('ScheduleMessageDto', () => {
  it('acepta contenido y fecha ISO', async () => {
    expect(await errores({ contenido: ' hola ', enviarEn: '2026-10-20T15:00:00.000Z' })).toHaveLength(0);
  });

  it('rechaza contenido vacio, demasiado largo o ausente', async () => {
    expect(await errores({ contenido: '   ', enviarEn: '2026-10-20T15:00:00.000Z' })).not.toHaveLength(0);
    expect(await errores({ contenido: 'x'.repeat(4001), enviarEn: '2026-10-20T15:00:00.000Z' })).not.toHaveLength(0);
    expect(await errores({ enviarEn: '2026-10-20T15:00:00.000Z' })).not.toHaveLength(0);
  });

  it('rechaza fechas que no son ISO 8601', async () => {
    expect(await errores({ contenido: 'hola', enviarEn: 'manana' })).not.toHaveLength(0);
    expect(await errores({ contenido: 'hola' })).not.toHaveLength(0);
  });
});
