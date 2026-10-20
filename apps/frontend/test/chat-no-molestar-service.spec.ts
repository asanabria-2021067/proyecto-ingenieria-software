import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('../lib/api/client', () => ({ apiFetch: apiFetchMock }));

import { updateNoMolestar } from '../lib/services/chat';

describe('updateNoMolestar', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('envia solo los campos escribibles aunque el objeto traiga datos de lectura', async () => {
    apiFetchMock.mockResolvedValue({});
    // El GET devuelve enHorarioAhora, que el DTO del backend rechaza (whitelist).
    const config = {
      activo: true,
      horaInicio: '00:00',
      horaFin: '23:59',
      diasSemana: [0, 1, 2],
      zona: 'America/Guatemala',
      enHorarioAhora: true,
    };

    await updateNoMolestar(config as never);

    const [, opciones] = apiFetchMock.mock.calls[0];
    expect(JSON.parse(opciones.body)).toEqual({
      activo: true,
      horaInicio: '00:00',
      horaFin: '23:59',
      diasSemana: [0, 1, 2],
      zona: 'America/Guatemala',
    });
  });
});
